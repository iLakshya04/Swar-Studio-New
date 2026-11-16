import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { VOICE_PRESETS } from '../data/voices';
import {
  applyPronunciationRules,
  getEmotionStyleHint,
  splitScriptIntoSegments,
  stripInlinePerformanceTags,
} from '../utils/pronunciationAndEmotion';
import {
  buildStyleInstruction,
  clampSpeed,
  countWordsAndChars,
  selectTtsModel,
  splitLongScriptIntoChunkPlans,
  validateGeneratePayload,
} from '../utils/speechLogic';
import {
  alignWordsToEnvelope,
  alignWordsToWavPcm,
  generateSubtitles,
} from '../utils/subtitleGenerator';
import type {
  AudioFormat,
  ChannelCount,
  GenerateRequestPayload,
  GenerateResponsePayload,
  LanguageMode,
  MasteringPreset,
  PrebuiltVoiceName,
  SampleRateHz,
  SpeakerConfig,
  SpeechSegmentMeta,
  TimingSource,
  WordTiming,
} from '../types';
import {
  InputValidationError,
  QuotaExhaustedError,
  extractRetryAfterSeconds,
  getModelCooldownRemainingSec,
  isModelOnCooldown,
  isQuotaOrRateError,
  mapApiError,
  markModelCooldown,
} from './quotaError';
import {
  addClipToProject,
  getClipAudioBuffer,
  getClipRecord,
  listPronunciations,
  saveStoredClip,
} from './studioStore';
import {
  encodeWavBuffer,
  extractSpeechEnvelope,
  extractWaveformPeaks,
  parseWavBuffer,
  processWavAudio,
  resampleMonoPcm,
  stitchWavBuffers,
  toChannelCount,
  toMonoPcm,
  transcodeWavToFormat,
} from './wavAudio';

export { InputValidationError, QuotaExhaustedError, mapApiError };

export function getClip(id: string) {
  return getClipAudioBuffer(id, false);
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Short-lived cache of synthesized chunks so partial multi-chunk failures can resume without re-calling completed chunks
const chunkSynthesisCache = new Map<
  string,
  { buffer: Buffer; actualModel: string; createdAt: number }
>();
const MAX_CHUNK_CACHE = 80;

function makeChunkCacheKey(params: {
  voiceName: string;
  styleInstruction: string;
  text: string;
  seed?: number;
}): string {
  return crypto
    .createHash('sha1')
    .update(`${params.voiceName}|${params.styleInstruction}|${params.seed ?? ''}|${params.text}`)
    .digest('hex');
}

function saveChunkToCache(key: string, buffer: Buffer, actualModel: string): void {
  chunkSynthesisCache.set(key, { buffer, actualModel, createdAt: Date.now() });
  if (chunkSynthesisCache.size > MAX_CHUNK_CACHE) {
    const oldestKey = chunkSynthesisCache.keys().next().value;
    if (oldestKey) chunkSynthesisCache.delete(oldestKey);
  }
}

const GEMINI_STANDARD_CHAIN = [
  'gemini-3.8-flash-lite-tts',
  'gemini-2.5-flash-preview-tts',
  'gemini-3.8-flash-tts',
  'gemini-2.5-pro-preview-tts',
] as const;

const GEMINI_EXPRESSIVE_CHAIN = [
  'gemini-3.8-flash-tts',
  'gemini-3.8-flash-lite-tts',
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
] as const;

function buildCandidateChain(preferredModel: string, modelTier: 'standard' | 'expressive'): string[] {
  const baseList: string[] =
    modelTier === 'expressive'
      ? [...GEMINI_EXPRESSIVE_CHAIN]
      : [...GEMINI_STANDARD_CHAIN];

  const ordered = [preferredModel, ...baseList.filter((m) => m !== preferredModel)];
  if (process.env.OPENAI_API_KEY?.trim()) {
    ordered.push('openai:gpt-4o-mini-tts');
  }
  if (process.env.ELEVENLABS_API_KEY?.trim()) {
    ordered.push('elevenlabs:eleven_multilingual_v2');
  }
  return ordered;
}

function isModelNotFoundOrUnsupported(err: unknown): boolean {
  const obj = err as { status?: number; code?: number; message?: string };
  const msg = String(obj?.message || '').toLowerCase();
  const status = obj?.status ?? obj?.code;
  return (
    status === 404 ||
    msg.includes('not found') ||
    msg.includes('is not supported') ||
    msg.includes('unknown model') ||
    msg.includes('model_not_found')
  );
}

async function callGeminiSingleTtsModel(params: {
  ai: GoogleGenAI;
  model: string;
  text: string;
  voiceName: PrebuiltVoiceName;
  styleInstruction: string;
  seed?: number;
}): Promise<Buffer> {
  const config: Record<string, unknown> = {
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: params.voiceName },
      },
    },
  };
  if (typeof params.seed === 'number' && Number.isFinite(params.seed)) {
    config.seed = Math.round(params.seed);
  }

  const isGemini25 = params.model.startsWith('gemini-2.5');
  const cleanText = params.text.trim();
  const partPayload = isGemini25
    ? {
        text: params.styleInstruction
          ? `Deliver with the following style (${params.styleInstruction}): ${cleanText}`
          : cleanText,
      }
    : {
        text: cleanText,
        speechMetadata: {
          style: params.styleInstruction || 'Natural, clear voice delivery',
        },
      };

  const response = await params.ai.models.generateContent({
    model: params.model,
    contents: [{ role: 'user', parts: [partPayload] }],
    config,
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const audioPart = parts.find((p) => p.inlineData?.data);
  const base64Audio = audioPart?.inlineData?.data;
  if (!base64Audio) {
    const err = new Error(
      `Model ${params.model} did not return audio data.`
    ) as Error & { status?: number };
    err.status = 502;
    throw err;
  }

  const rawBuf = Buffer.from(base64Audio, 'base64');
  // Ensure RIFF WAV header (Gemini 2.5 preview TTS sometimes returns raw L16 PCM)
  if (rawBuf.length >= 4 && rawBuf.toString('ascii', 0, 4) === 'RIFF') {
    return rawBuf;
  }
  const pcm16 = new Int16Array(
    rawBuf.buffer,
    rawBuf.byteOffset,
    Math.floor(rawBuf.byteLength / 2)
  );
  return encodeWavBuffer(pcm16, 24000, 1);
}

function mapVoiceToOpenAi(voiceName: PrebuiltVoiceName): string {
  switch (voiceName) {
    case 'Charon':
      return 'onyx';
    case 'Fenrir':
      return 'ash';
    case 'Puck':
      return 'echo';
    case 'Zephyr':
      return 'nova';
    case 'Kore':
    default:
      return 'coral';
  }
}

async function callOpenAiTts(params: {
  text: string;
  voiceName: PrebuiltVoiceName;
  styleInstruction: string;
}): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: mapVoiceToOpenAi(params.voiceName),
      input: params.text.trim(),
      instructions: params.styleInstruction || undefined,
      response_format: 'wav',
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    const retryHeader = res.headers.get('retry-after');
    const err = new Error(`OpenAI TTS failed (${res.status}): ${errBody}`) as Error & {
      status?: number;
      retryAfterSeconds?: number;
    };
    err.status = res.status;
    if (retryHeader) err.retryAfterSeconds = Number(retryHeader);
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

async function callElevenLabsTts(params: {
  text: string;
  voiceName: PrebuiltVoiceName;
}): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

  // Built-in default ElevenLabs voices mapped by gender/register
  const voiceId =
    params.voiceName === 'Charon' || params.voiceName === 'Fenrir'
      ? 'pNInz6obpgDQGcFmaJgB' // Adam
      : params.voiceName === 'Puck'
        ? 'TxGEqnHWrfWFTfGW9XjX' // Josh
        : '21m00Tcm4TlvDq8ikWAM'; // Rachel

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: params.text.trim(),
        model_id: 'eleven_multilingual_v2',
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    const retryHeader = res.headers.get('retry-after');
    const err = new Error(`ElevenLabs TTS failed (${res.status}): ${errBody}`) as Error & {
      status?: number;
      retryAfterSeconds?: number;
    };
    err.status = res.status;
    if (retryHeader) err.retryAfterSeconds = Number(retryHeader);
    throw err;
  }
  const pcmBuf = Buffer.from(await res.arrayBuffer());
  const pcm16 = new Int16Array(
    pcmBuf.buffer,
    pcmBuf.byteOffset,
    Math.floor(pcmBuf.byteLength / 2)
  );
  return encodeWavBuffer(pcm16, 24000, 1);
}

async function synthesizeSingleChunkAcrossProviders(params: {
  ai: GoogleGenAI;
  preferredModel: string;
  modelTier: 'standard' | 'expressive';
  text: string;
  voiceName: PrebuiltVoiceName;
  styleInstruction: string;
  seed?: number;
  useChunkCache?: boolean;
}): Promise<{ buffer: Buffer; actualModel: string }> {
  if (params.useChunkCache) {
    const key = makeChunkCacheKey(params);
    const cached = chunkSynthesisCache.get(key);
    if (cached) {
      return { buffer: cached.buffer, actualModel: cached.actualModel };
    }
  }

  const candidates = buildCandidateChain(params.preferredModel, params.modelTier);
  const attemptedModels: string[] = [];
  let sawQuota = false;
  let maxRetryAfter = 0;
  let lastNonQuotaError: unknown = null;

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (isModelOnCooldown(candidate)) {
      attemptedModels.push(candidate);
      sawQuota = true;
      maxRetryAfter = Math.max(maxRetryAfter, getModelCooldownRemainingSec(candidate));
      continue;
    }

    attemptedModels.push(candidate);
    try {
      let buffer: Buffer;
      if (candidate === 'openai:gpt-4o-mini-tts') {
        buffer = await callOpenAiTts({
          text: params.text,
          voiceName: params.voiceName,
          styleInstruction: params.styleInstruction,
        });
      } else if (candidate === 'elevenlabs:eleven_multilingual_v2') {
        buffer = await callElevenLabsTts({
          text: params.text,
          voiceName: params.voiceName,
        });
      } else {
        buffer = await callGeminiSingleTtsModel({
          ai: params.ai,
          model: candidate,
          text: params.text,
          voiceName: params.voiceName,
          styleInstruction: params.styleInstruction,
          seed: params.seed,
        });
      }

      if (params.useChunkCache) {
        const key = makeChunkCacheKey(params);
        saveChunkToCache(key, buffer, candidate);
      }
      return { buffer, actualModel: candidate };
    } catch (err) {
      if (isQuotaOrRateError(err)) {
        sawQuota = true;
        const retrySec = extractRetryAfterSeconds(err);
        maxRetryAfter = Math.max(maxRetryAfter, retrySec);
        markModelCooldown(candidate, retrySec);
        continue;
      }

      if (isModelNotFoundOrUnsupported(err)) {
        lastNonQuotaError = err;
        continue;
      }

      // If this isn't the last candidate and looks like a fallback format/model compatibility error, advance cleanly
      lastNonQuotaError = err;
      const errStatus = (err as { status?: number })?.status;
      if (i < candidates.length - 1 && (errStatus === 400 || errStatus === 502 || errStatus === 503)) {
        continue;
      }
      throw err;
    }
  }

  if (sawQuota) {
    throw new QuotaExhaustedError({
      attemptedModels,
      retryAfterSeconds: maxRetryAfter || 3600,
    });
  }

  if (lastNonQuotaError) {
    throw lastNonQuotaError;
  }

  throw new QuotaExhaustedError({
    attemptedModels,
    retryAfterSeconds: 3600,
  });
}

async function generateTextWithFallback(params: {
  ai: GoogleGenAI;
  primaryModel: string;
  fallbackModel?: string;
  contents: unknown;
  config?: Record<string, unknown>;
}) {
  const models = [params.primaryModel, params.fallbackModel || 'gemini-2.5-flash'].filter(
    (m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx
  );

  const attemptedModels: string[] = [];
  let sawQuota = false;
  let maxRetryAfter = 0;
  let lastError: unknown;

  for (const model of models) {
    if (isModelOnCooldown(model)) {
      attemptedModels.push(model);
      sawQuota = true;
      maxRetryAfter = Math.max(maxRetryAfter, getModelCooldownRemainingSec(model));
      continue;
    }
    attemptedModels.push(model);
    try {
      return await params.ai.models.generateContent({
        model,
        contents: params.contents as never,
        config: params.config as never,
      });
    } catch (err) {
      if (isQuotaOrRateError(err)) {
        sawQuota = true;
        const retrySec = extractRetryAfterSeconds(err);
        maxRetryAfter = Math.max(maxRetryAfter, retrySec);
        markModelCooldown(model, retrySec);
        continue;
      }
      lastError = err;
      if (isModelNotFoundOrUnsupported(err)) {
        continue;
      }
      throw err;
    }
  }

  if (sawQuota) {
    throw new QuotaExhaustedError({
      attemptedModels,
      retryAfterSeconds: maxRetryAfter || 3600,
    });
  }
  throw lastError || new Error('Text model call failed.');
}

export async function synthesizeSpeech(
  payload: Partial<GenerateRequestPayload>
): Promise<GenerateResponsePayload> {
  const validation = validateGeneratePayload(payload);
  if (!validation.valid) {
    throw new InputValidationError(validation.error || 'Invalid synthesis payload.');
  }

  const mode = payload.mode === 'multi' ? 'multi' : 'single';
  const language: LanguageMode = payload.language || 'en';
  const modelTier = payload.modelTier === 'expressive' ? 'expressive' : 'standard';
  const speed = clampSpeed(typeof payload.speed === 'number' ? payload.speed : 1.0);
  const pitchRegister = payload.pitchRegister || 'balanced';
  const emotionIntensity = payload.emotionIntensity || 'natural';

  const format: AudioFormat = payload.format || 'wav';
  const targetSampleRate: SampleRateHz = payload.sampleRate || 48000;
  const targetChannels: ChannelCount = payload.channels === 2 ? 2 : 1;
  const normalize = payload.normalize ?? true;
  const trimSilence = payload.trimSilence ?? true;
  const masteringPreset: MasteringPreset = payload.masteringPreset || 'none';
  const bitrateKbps = payload.bitrateKbps || 192;

  const activePronunciations =
    payload.applyPronunciations === false
      ? []
      : payload.pronunciationRules ?? listPronunciations();

  const resolvedVoicePreset =
    VOICE_PRESETS.find((v) => v.id === payload.voiceId) ??
    VOICE_PRESETS.find((v) => v.baseVoice === payload.voiceName) ??
    VOICE_PRESETS[0];

  const voiceId = resolvedVoicePreset.id;
  const voiceName = payload.voiceName || resolvedVoicePreset.baseVoice;
  const voiceDisplayName = payload.customVoiceDescription?.trim()
    ? `Custom (${voiceName})`
    : `${resolvedVoicePreset.name} (${resolvedVoicePreset.roleTitle})`;

  let actualModelUsed: string = selectTtsModel({
    mode,
    modelTier,
    text: payload.text || '',
    customVoiceDescription: payload.customVoiceDescription,
    dialogueLines: payload.dialogueLines,
  });

  const ai = getGeminiClient();
  const appliedPronunciations = new Set<string>();

  let rawMasterWav: Buffer | null = null;
  let displayTextForCaptions = '';
  let segmentsMeta: SpeechSegmentMeta[] | undefined;
  let alignedWordsFromSegments: WordTiming[] | undefined;
  let segmentTimingConfidence: number | undefined;
  let stemsMeta: Array<{ speaker: string; clipId: string; audioUrl: string; durationMs: number }> | undefined;

  if (mode === 'multi') {
    const nonEmptyLines = (payload.dialogueLines ?? []).filter((l) => l.text.trim().length > 0);
    const speakerMap = new Map<string, SpeakerConfig>();
    if (payload.speakerList?.length) {
      payload.speakerList.forEach((sp, idx) => {
        const key = sp.id || String.fromCharCode(65 + idx);
        speakerMap.set(key, sp);
      });
    } else if (payload.speakers) {
      Object.entries(payload.speakers).forEach(([k, sp]) => {
        speakerMap.set(k, sp);
      });
    }

    const activeSpeakerKeys = Array.from(new Set(nonEmptyLines.map((l) => l.speakerKey)));
    const useNativeDual = activeSpeakerKeys.length <= 2 && !payload.separateStems;

    displayTextForCaptions = nonEmptyLines
      .map((l) => `${speakerMap.get(l.speakerKey)?.name || l.speakerKey}: ${stripInlinePerformanceTags(l.text)}`)
      .join(' ');

    if (useNativeDual) {
      const keyA = activeSpeakerKeys[0] || 'A';
      const keyB = activeSpeakerKeys[1] || (keyA === 'A' ? 'B' : 'A');
      const spA = speakerMap.get(keyA) || {
        name: 'Vikram',
        voiceId: 'vikram',
        baseVoice: 'Puck' as PrebuiltVoiceName,
        style: 'Conversational host',
      };
      const spB = speakerMap.get(keyB) || {
        name: 'Ananya',
        voiceId: 'ananya',
        baseVoice: 'Zephyr' as PrebuiltVoiceName,
        style: 'Warm co-host',
      };

      const parts = nonEmptyLines.map((line) => {
        const speaker = line.speakerKey === keyA ? spA : spB;
        const pron = applyPronunciationRules(line.text.trim(), activePronunciations, language);
        pron.appliedTerms.forEach((t) => appliedPronunciations.add(t));
        const speakerStyle = buildStyleInstruction({
          language,
          stylePrompt: speaker.style || 'Natural conversational dialogue',
          speed,
          pitchRegister,
          emotionIntensity,
          expressiveControls: payload.expressiveControls,
          pronunciationPrompt: pron.pronunciationPrompt,
          emotionHint: getEmotionStyleHint(line.emotion),
        });
        return {
          text: `${speaker.name}: ${pron.ttsText}`,
          speechMetadata: {
            speaker: speaker.name,
            style: speakerStyle,
          },
        };
      });

      const nativeMultiModel = 'gemini-3.8-flash-tts';
      let nativeSuccess = false;

      if (!isModelOnCooldown(nativeMultiModel)) {
        try {
          const response = await ai.models.generateContent({
            model: nativeMultiModel,
            contents: [{ role: 'user', parts }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: [
                    {
                      speaker: spA.name,
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: spA.baseVoice || 'Puck' } },
                    },
                    {
                      speaker: spB.name,
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: spB.baseVoice || 'Kore' } },
                    },
                  ],
                },
              },
            },
          });

          const audioPart = (response.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
          if (audioPart?.inlineData?.data) {
            rawMasterWav = Buffer.from(audioPart.inlineData.data, 'base64');
            actualModelUsed = nativeMultiModel;
            nativeSuccess = true;
          }
        } catch (err) {
          if (isQuotaOrRateError(err)) {
            markModelCooldown(nativeMultiModel, extractRetryAfterSeconds(err));
          } else if (!isModelNotFoundOrUnsupported(err)) {
            throw err;
          }
        }
      }

      if (!nativeSuccess) {
        // Fallback: synthesize each dialogue turn across full fallback chain and stitch
        const fallbackBuffers: Buffer[] = [];
        for (const line of nonEmptyLines) {
          const speaker = line.speakerKey === keyA ? spA : spB;
          const pron = applyPronunciationRules(line.text.trim(), activePronunciations, language);
          pron.appliedTerms.forEach((t) => appliedPronunciations.add(t));
          const speakerStyle = buildStyleInstruction({
            language,
            stylePrompt: speaker.style || 'Natural conversational dialogue',
            speed,
            pitchRegister,
            emotionIntensity,
            expressiveControls: payload.expressiveControls,
            pronunciationPrompt: pron.pronunciationPrompt,
            emotionHint: getEmotionStyleHint(line.emotion),
          });
          const resTurn = await synthesizeSingleChunkAcrossProviders({
            ai,
            preferredModel: 'gemini-3.8-flash-lite-tts',
            modelTier: 'standard',
            text: pron.ttsText,
            voiceName: speaker.baseVoice || 'Puck',
            styleInstruction: speakerStyle,
            seed: payload.seed,
            useChunkCache: true,
          });
          fallbackBuffers.push(resTurn.buffer);
          actualModelUsed = resTurn.actualModel;
        }
        const stitched = stitchWavBuffers(fallbackBuffers, 140, targetSampleRate, targetChannels);
        rawMasterWav = stitched.wavBuffer;
      }
    } else {
      // 3-6 speakers or stem separation: synthesize each turn cleanly and stitch + build stems
      const lineBuffers: Buffer[] = [];
      const speakerBuckets = new Map<string, Buffer[]>();

      for (const line of nonEmptyLines) {
        const sp = speakerMap.get(line.speakerKey) || {
          name: `Speaker ${line.speakerKey}`,
          voiceId: 'vikram',
          baseVoice: 'Puck' as PrebuiltVoiceName,
          style: 'Conversational speaker',
        };
        const pron = applyPronunciationRules(line.text.trim(), activePronunciations, language);
        pron.appliedTerms.forEach((t) => appliedPronunciations.add(t));
        const styleInstruction = buildStyleInstruction({
          language,
          stylePrompt: sp.style || 'Conversational speaker',
          speed,
          pitchRegister,
          emotionIntensity,
          expressiveControls: payload.expressiveControls,
          pronunciationPrompt: pron.pronunciationPrompt,
          emotionHint: getEmotionStyleHint(line.emotion),
        });
        const turnResult = await synthesizeSingleChunkAcrossProviders({
          ai,
          preferredModel: actualModelUsed,
          modelTier,
          text: pron.ttsText,
          voiceName: sp.baseVoice || 'Puck',
          styleInstruction,
          seed: payload.seed,
          useChunkCache: true,
        });
        actualModelUsed = turnResult.actualModel;
        lineBuffers.push(turnResult.buffer);
        const list = speakerBuckets.get(sp.name) ?? [];
        list.push(turnResult.buffer);
        speakerBuckets.set(sp.name, list);
      }

      const stitched = stitchWavBuffers(lineBuffers, 150, targetSampleRate, targetChannels);
      rawMasterWav = stitched.wavBuffer;

      if (payload.separateStems) {
        stemsMeta = [];
        for (const [speakerName, bufs] of speakerBuckets.entries()) {
          const stemStitched = stitchWavBuffers(bufs, 180, targetSampleRate, targetChannels);
          const stemRecord = saveStoredClip({
            wavBuffer: stemStitched.wavBuffer,
            format: 'wav',
            mimeType: 'audio/wav',
            sampleRate: targetSampleRate,
            channels: targetChannels,
            durationMs: stemStitched.durationMs,
            voiceId,
            voiceName: speakerName,
            modelUsed: actualModelUsed,
            language,
            displayText: `${speakerName} stem`,
            masteringPreset,
            timingSource: 'estimated',
            timingConfidence: 0.5,
            wordTimings: [],
            phraseTimings: [],
            speechEnvelope: stemStitched.speechEnvelope,
            waveformPeaks: stemStitched.waveformPeaks,
          });
          stemsMeta.push({
            speaker: speakerName,
            clipId: stemRecord.id,
            audioUrl: `/api/clips/${stemRecord.id}.wav`,
            durationMs: stemStitched.durationMs,
          });
        }
      }
    }
  } else {
    // Single-voice synthesis
    const rawScript = (payload.text || '').trim();
    const parsedSegments = splitScriptIntoSegments(rawScript);
    const hasMultipleEmotions =
      new Set(parsedSegments.map((s) => s.emotion).filter(Boolean)).size > 1;
    const useSegmentPipeline =
      Boolean(payload.segmentMode) || (parsedSegments.length > 1 && hasMultipleEmotions);

    displayTextForCaptions = stripInlinePerformanceTags(rawScript);

    if (useSegmentPipeline && parsedSegments.length > 1) {
      const segRawWavs: Buffer[] = [];
      const segProcessedInfos: Array<{
        seg: (typeof parsedSegments)[number];
        wavBuffer: Buffer;
        durationMs: number;
      }> = [];

      for (const seg of parsedSegments) {
        const pron = applyPronunciationRules(seg.rawText, activePronunciations, language);
        pron.appliedTerms.forEach((t) => appliedPronunciations.add(t));
        const segStyle = buildStyleInstruction({
          language,
          stylePrompt: payload.stylePrompt || resolvedVoicePreset.defaultStyle,
          customVoiceDescription: payload.customVoiceDescription,
          speed,
          pitchRegister,
          emotionIntensity,
          expressiveControls: payload.expressiveControls,
          pronunciationPrompt: pron.pronunciationPrompt,
          emotionHint: seg.emotionPrompt,
        });
        const segRes = await synthesizeSingleChunkAcrossProviders({
          ai,
          preferredModel: actualModelUsed,
          modelTier,
          text: pron.ttsText,
          voiceName,
          styleInstruction: segStyle,
          seed: payload.seed,
          useChunkCache: true,
        });
        actualModelUsed = segRes.actualModel;
        const processedSeg = processWavAudio(segRes.buffer, {
          targetSampleRate,
          targetChannels,
          trimSilence: true,
          normalize,
          masteringPreset,
        });
        segRawWavs.push(processedSeg.wavBuffer);
        segProcessedInfos.push({
          seg,
          wavBuffer: processedSeg.wavBuffer,
          durationMs: processedSeg.durationMs,
        });
      }

      const stitched = stitchWavBuffers(segRawWavs, 140, targetSampleRate, targetChannels);
      rawMasterWav = stitched.wavBuffer;
      segmentsMeta = [];
      alignedWordsFromSegments = [];
      let confSum = 0;

      for (let i = 0; i < segProcessedInfos.length; i += 1) {
        const info = segProcessedInfos[i];
        const offset = stitched.offsetsMs[i];
        const parsedSegWav = parseWavBuffer(info.wavBuffer);
        const segEnv = extractSpeechEnvelope(
          parsedSegWav.pcm,
          parsedSegWav.sampleRate,
          parsedSegWav.channels,
          25
        );
        const segAlign = alignWordsToWavPcm(
          info.seg.displayText,
          parsedSegWav.pcm,
          parsedSegWav.sampleRate,
          parsedSegWav.channels
        );
        confSum += segAlign.timingConfidence;

        const segRecord = saveStoredClip({
          wavBuffer: info.wavBuffer,
          format: 'wav',
          mimeType: 'audio/wav',
          sampleRate: targetSampleRate,
          channels: targetChannels,
          durationMs: info.durationMs,
          voiceId,
          voiceName: voiceDisplayName,
          modelUsed: actualModelUsed,
          language,
          displayText: info.seg.displayText,
          stylePrompt: payload.stylePrompt,
          speed,
          masteringPreset,
          timingSource: segAlign.timingSource,
          timingConfidence: segAlign.timingConfidence,
          wordTimings: segAlign.wordTimings,
          phraseTimings: segAlign.phraseTimings,
          speechEnvelope: segEnv,
          waveformPeaks: extractWaveformPeaks(parsedSegWav.pcm, parsedSegWav.channels, 120),
        });

        segmentsMeta.push({
          index: i,
          text: info.seg.displayText,
          emotion: info.seg.emotion,
          clipId: segRecord.id,
          audioUrl: `/api/clips/${segRecord.id}.wav`,
          durationMs: info.durationMs,
          startMs: offset.startMs,
          endMs: offset.endMs,
        });

        for (const wt of segAlign.wordTimings) {
          const absStart = offset.startMs + wt.startMs;
          const absEnd = offset.startMs + wt.endMs;
          alignedWordsFromSegments.push({
            ...wt,
            segmentIndex: i,
            emotion: info.seg.emotion,
            startMs: absStart,
            endMs: absEnd,
            startSeconds: Number((absStart / 1000).toFixed(3)),
            endSeconds: Number((absEnd / 1000).toFixed(3)),
          });
        }
      }
      segmentTimingConfidence = Number((confSum / Math.max(1, segProcessedInfos.length)).toFixed(2));
    } else {
      const pron = applyPronunciationRules(rawScript, activePronunciations, language);
      pron.appliedTerms.forEach((t) => appliedPronunciations.add(t));
      const singleEmotion = parsedSegments[0]?.emotionPrompt;
      const cleanTtsText = pron.ttsText.replace(/\[[A-Z_]{2,24}\]/g, '').replace(/\s+/g, ' ').trim();
      const baseStyleInstruction = buildStyleInstruction({
        language,
        stylePrompt: payload.stylePrompt || '',
        customVoiceDescription: payload.customVoiceDescription,
        speed,
        pitchRegister,
        emotionIntensity,
        expressiveControls: payload.expressiveControls,
        pronunciationPrompt: pron.pronunciationPrompt,
        emotionHint: singleEmotion,
      });

      const chunkPlans = splitLongScriptIntoChunkPlans(pron.ttsText || cleanTtsText, 3500);
      if (chunkPlans.length <= 1) {
        const singleText = (chunkPlans[0]?.text || cleanTtsText || pron.ttsText)
          .replace(/\[[A-Z_]{2,24}\]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        const singleRes = await synthesizeSingleChunkAcrossProviders({
          ai,
          preferredModel: actualModelUsed,
          modelTier,
          text: singleText,
          voiceName,
          styleInstruction: baseStyleInstruction,
          seed: payload.seed,
          useChunkCache: false,
        });
        rawMasterWav = singleRes.buffer;
        actualModelUsed = singleRes.actualModel;
      } else {
        // Synthesize chunks with consistent voice/style, controlled pauses, and cacheable chunk resumption
        const chunkWavs: Buffer[] = [];
        for (const plan of chunkPlans) {
          const chunkCleanText = plan.text
            .replace(/\[[A-Z_]{2,24}\]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (!chunkCleanText) continue;

          const chunkStyle = plan.emotion
            ? buildStyleInstruction({
                language,
                stylePrompt: payload.stylePrompt || '',
                customVoiceDescription: payload.customVoiceDescription,
                speed,
                pitchRegister,
                emotionIntensity,
                expressiveControls: payload.expressiveControls,
                pronunciationPrompt: pron.pronunciationPrompt,
                emotionHint: getEmotionStyleHint(plan.emotion),
              })
            : baseStyleInstruction;

          const chunkRes = await synthesizeSingleChunkAcrossProviders({
            ai,
            preferredModel: actualModelUsed,
            modelTier,
            text: chunkCleanText,
            voiceName,
            styleInstruction: chunkStyle,
            seed: payload.seed,
            useChunkCache: true,
          });
          actualModelUsed = chunkRes.actualModel;

          // Trim leading/trailing dead air on each chunk so stitched pauses stay controlled
          const cleanChunk = processWavAudio(chunkRes.buffer, {
            targetSampleRate,
            targetChannels: 1,
            trimSilence: true,
            normalize: false,
            masteringPreset: 'none',
          });
          chunkWavs.push(cleanChunk.wavBuffer);
        }

        const averageGap = Math.round(
          chunkPlans.slice(0, -1).reduce((acc, p) => acc + (p.breakAfterMs || 150), 0) /
            Math.max(1, chunkPlans.length - 1)
        );
        rawMasterWav = stitchWavBuffers(
          chunkWavs,
          Math.max(100, Math.min(260, averageGap || 150)),
          targetSampleRate,
          targetChannels
        ).wavBuffer;
      }
    }
  }

  // Final mastering, target duration fitting, sample rate, channels
  const processed = processWavAudio(rawMasterWav!, {
    targetSampleRate,
    targetChannels,
    trimSilence,
    normalize,
    masteringPreset,
    targetDurationSeconds: payload.targetDurationSeconds,
    durationToleranceSeconds: payload.durationToleranceSeconds,
    fitMode: payload.fitMode || 'stretch',
  });

  // Acoustic forced alignment directly against finished WAV PCM samples
  const parsedMaster = parseWavBuffer(processed.wavBuffer);
  let wordTimings: WordTiming[];
  let phraseTimings: ReturnType<typeof alignWordsToWavPcm>['phraseTimings'];
  let timingSource: TimingSource;
  let timingConfidence: number;

  if (alignedWordsFromSegments) {
    // Re-scale segment words gently if final mastering trimmed/stretched duration
    const origLastMs = alignedWordsFromSegments[alignedWordsFromSegments.length - 1]?.endMs || processed.durationMs;
    const scale = origLastMs > 0 ? processed.durationMs / origLastMs : 1;
    wordTimings =
      Math.abs(scale - 1) > 0.03
        ? alignedWordsFromSegments.map((w) => {
            const s = Math.round(w.startMs * scale);
            const e = Math.max(s + 35, Math.min(processed.durationMs, Math.round(w.endMs * scale)));
            return {
              ...w,
              startMs: s,
              endMs: e,
              startSeconds: Number((s / 1000).toFixed(3)),
              endSeconds: Number((e / 1000).toFixed(3)),
            };
          })
        : alignedWordsFromSegments;
    phraseTimings = alignWordsToEnvelope(
      displayTextForCaptions,
      processed.durationMs,
      processed.speechEnvelope
    ).phraseTimings;
    timingSource = 'forced_alignment';
    timingConfidence = segmentTimingConfidence ?? 0.84;
  } else {
    const pcmAligned = alignWordsToWavPcm(
      displayTextForCaptions,
      parsedMaster.pcm,
      processed.sampleRate,
      processed.channels
    );
    wordTimings = pcmAligned.wordTimings;
    phraseTimings = pcmAligned.phraseTimings;
    timingSource = pcmAligned.timingSource;
    timingConfidence = pcmAligned.timingConfidence;
  }

  // Optional format transcoding (mp3, m4a, flac) via ffmpeg
  const encoded = await transcodeWavToFormat(processed.wavBuffer, format, bitrateKbps);

  const saved = saveStoredClip({
    wavBuffer: processed.wavBuffer,
    encodedBuffer: encoded.actualFormat !== 'wav' ? encoded.buffer : undefined,
    format: encoded.actualFormat,
    mimeType: encoded.mimeType,
    sampleRate: processed.sampleRate,
    channels: processed.channels,
    durationMs: processed.durationMs,
    voiceId,
    voiceName: voiceDisplayName,
    modelUsed: actualModelUsed,
    language,
    displayText: displayTextForCaptions,
    stylePrompt: payload.stylePrompt,
    speed,
    masteringPreset,
    timingSource,
    timingConfidence,
    wordTimings,
    phraseTimings,
    speechEnvelope: processed.speechEnvelope,
    waveformPeaks: processed.waveformPeaks,
    segments: segmentsMeta,
  });

  if (payload.projectId) {
    addClipToProject(payload.projectId, {
      clipId: saved.id,
      title: displayTextForCaptions.slice(0, 48),
      text: displayTextForCaptions,
      voiceId,
      voiceName: voiceDisplayName,
      language,
      durationMs: saved.durationMs,
      sampleRate: saved.sampleRate,
      channels: saved.channels,
      audioUrl: `/api/clips/${saved.id}.${encoded.actualFormat}`,
      downloadUrl: `/api/clips/${saved.id}.${encoded.actualFormat}?download=1`,
    });
  }

  const audioUrl = `/api/clips/${saved.id}.${encoded.actualFormat}`;
  const downloadUrl = `/api/clips/${saved.id}.${encoded.actualFormat}?download=1`;

  return {
    clipId: saved.id,
    audioUrl,
    downloadUrl,
    audioBase64: encoded.buffer.toString('base64'),
    mimeType: encoded.mimeType,
    format: encoded.actualFormat,
    sampleRate: processed.sampleRate,
    channels: processed.channels,
    sizeBytes: encoded.buffer.length,
    modelUsed: actualModelUsed,
    voiceId,
    voiceName: voiceDisplayName,
    voiceUsed: voiceDisplayName,
    durationEstimateSec: Math.max(1, Math.round(processed.durationMs / 1000)),
    durationMs: processed.durationMs,
    timingSource,
    timingConfidence,
    ...(payload.returnWordTimings === false
      ? {}
      : { wordTimings, phraseTimings }),
    speechEnvelope: processed.speechEnvelope,
    ...(payload.returnWaveformPeaks === false
      ? {}
      : { waveformPeaks: processed.waveformPeaks }),
    segments: segmentsMeta,
    stems: stemsMeta,
    appliedPronunciations: Array.from(appliedPronunciations),
  };
}

export async function regenerateClipSegment(params: {
  clipId: string;
  segmentIndex: number;
  text?: string;
  emotion?: string;
  voiceId?: string;
  stylePrompt?: string;
  speed?: number;
}): Promise<GenerateResponsePayload> {
  const existing = getClipRecord(params.clipId);
  if (!existing || !existing.segments || !existing.segments[params.segmentIndex]) {
    throw new InputValidationError('Clip or segment index not found.');
  }

  const segments = [...existing.segments];
  const targetSeg = segments[params.segmentIndex];
  const nextText = (params.text ?? targetSeg.text).trim();
  if (!nextText) {
    throw new InputValidationError('Replacement segment text cannot be empty.');
  }
  const nextEmotion = params.emotion ?? targetSeg.emotion;

  const voicePreset =
    VOICE_PRESETS.find((v) => v.id === (params.voiceId || existing.voiceId)) ?? VOICE_PRESETS[0];

  const activePronunciations = listPronunciations();
  const pron = applyPronunciationRules(nextText, activePronunciations, existing.language);
  const styleInstruction = buildStyleInstruction({
    language: existing.language,
    stylePrompt: params.stylePrompt || voicePreset.defaultStyle,
    speed: params.speed ?? 1.0,
    pronunciationPrompt: pron.pronunciationPrompt,
    emotionHint: getEmotionStyleHint(nextEmotion),
  });

  const ai = getGeminiClient();
  const segResult = await synthesizeSingleChunkAcrossProviders({
    ai,
    preferredModel: existing.modelUsed || 'gemini-3.8-flash-lite-tts',
    modelTier: existing.modelUsed === 'gemini-3.8-flash-tts' ? 'expressive' : 'standard',
    text: pron.ttsText,
    voiceName: voicePreset.baseVoice,
    styleInstruction,
    useChunkCache: true,
  });

  const processedNewSeg = processWavAudio(segResult.buffer, {
    targetSampleRate: existing.sampleRate,
    targetChannels: existing.channels,
    trimSilence: true,
    normalize: true,
    masteringPreset: existing.masteringPreset,
  });

  const parsedNewSeg = parseWavBuffer(processedNewSeg.wavBuffer);
  const segEnv = extractSpeechEnvelope(
    parsedNewSeg.pcm,
    existing.sampleRate,
    existing.channels,
    25
  );
  const segAlign = alignWordsToWavPcm(
    nextText,
    parsedNewSeg.pcm,
    existing.sampleRate,
    existing.channels
  );

  const savedNewSeg = saveStoredClip({
    wavBuffer: processedNewSeg.wavBuffer,
    format: 'wav',
    mimeType: 'audio/wav',
    sampleRate: existing.sampleRate,
    channels: existing.channels,
    durationMs: processedNewSeg.durationMs,
    voiceId: voicePreset.id,
    voiceName: `${voicePreset.name} (${voicePreset.roleTitle})`,
    modelUsed: segResult.actualModel,
    language: existing.language,
    displayText: nextText,
    masteringPreset: existing.masteringPreset,
    timingSource: segAlign.timingSource,
    timingConfidence: segAlign.timingConfidence,
    wordTimings: segAlign.wordTimings,
    phraseTimings: segAlign.phraseTimings,
    speechEnvelope: segEnv,
    waveformPeaks: extractWaveformPeaks(parsedNewSeg.pcm, existing.channels, 120),
  });

  segments[params.segmentIndex] = {
    index: params.segmentIndex,
    text: nextText,
    emotion: nextEmotion,
    clipId: savedNewSeg.id,
    audioUrl: `/api/clips/${savedNewSeg.id}.wav`,
    durationMs: processedNewSeg.durationMs,
    startMs: targetSeg.startMs,
    endMs: targetSeg.startMs + processedNewSeg.durationMs,
  };

  // Re-stitch all segments cleanly
  const segBuffers: Buffer[] = [];
  for (const seg of segments) {
    const segAudio = getClipAudioBuffer(seg.clipId, true);
    if (segAudio) segBuffers.push(segAudio.buffer);
  }

  const stitched = stitchWavBuffers(segBuffers, 140, existing.sampleRate, existing.channels);
  const updatedSegments: SpeechSegmentMeta[] = [];
  const combinedWords: WordTiming[] = [];

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const off = stitched.offsetsMs[i];
    const segRec = getClipRecord(seg.clipId);
    updatedSegments.push({
      ...seg,
      startMs: off.startMs,
      endMs: off.endMs,
      durationMs: off.endMs - off.startMs,
    });
    if (segRec?.wordTimings) {
      for (const wt of segRec.wordTimings) {
        const absStart = off.startMs + wt.startMs;
        const absEnd = off.startMs + wt.endMs;
        combinedWords.push({
          ...wt,
          segmentIndex: i,
          emotion: seg.emotion,
          startMs: absStart,
          endMs: absEnd,
          startSeconds: Number((absStart / 1000).toFixed(3)),
          endSeconds: Number((absEnd / 1000).toFixed(3)),
        });
      }
    }
  }

  const fullDisplayText = updatedSegments.map((s) => s.text).join(' ');
  const fullPhraseTimings = alignWordsToEnvelope(
    fullDisplayText,
    stitched.durationMs,
    stitched.speechEnvelope
  ).phraseTimings;

  const savedMaster = saveStoredClip({
    wavBuffer: stitched.wavBuffer,
    format: 'wav',
    mimeType: 'audio/wav',
    sampleRate: existing.sampleRate,
    channels: existing.channels,
    durationMs: stitched.durationMs,
    voiceId: existing.voiceId,
    voiceName: existing.voiceName,
    modelUsed: segResult.actualModel,
    language: existing.language,
    displayText: fullDisplayText,
    masteringPreset: existing.masteringPreset,
    timingSource: 'forced_alignment',
    timingConfidence: segAlign.timingConfidence,
    wordTimings: combinedWords,
    phraseTimings: fullPhraseTimings,
    speechEnvelope: stitched.speechEnvelope,
    waveformPeaks: stitched.waveformPeaks,
    segments: updatedSegments,
  });

  return {
    clipId: savedMaster.id,
    audioUrl: `/api/clips/${savedMaster.id}.wav`,
    downloadUrl: `/api/clips/${savedMaster.id}.wav?download=1`,
    audioBase64: stitched.wavBuffer.toString('base64'),
    mimeType: 'audio/wav',
    format: 'wav',
    sampleRate: savedMaster.sampleRate,
    channels: savedMaster.channels,
    sizeBytes: stitched.wavBuffer.length,
    modelUsed: savedMaster.modelUsed,
    voiceId: savedMaster.voiceId,
    voiceName: savedMaster.voiceName,
    voiceUsed: savedMaster.voiceName,
    durationEstimateSec: Math.max(1, Math.round(stitched.durationMs / 1000)),
    durationMs: stitched.durationMs,
    timingSource: 'forced_alignment',
    timingConfidence: segAlign.timingConfidence,
    wordTimings: combinedWords,
    phraseTimings: fullPhraseTimings,
    speechEnvelope: stitched.speechEnvelope,
    waveformPeaks: stitched.waveformPeaks,
    segments: updatedSegments,
  };
}

export async function translateSpeechScript(
  text: string,
  targetLanguage: 'en' | 'hi' | 'bilingual',
  preserveDuration = false
): Promise<string> {
  if (!text || !text.trim()) {
    throw new InputValidationError('Enter text to translate or adapt.');
  }

  const ai = getGeminiClient();

  const targetDesc =
    targetLanguage === 'hi'
      ? 'natural, spoken Hindi in Devanagari script (हिन्दी)'
      : targetLanguage === 'bilingual'
        ? 'natural urban Hinglish (blending Hindi in Devanagari with conversational English phrases where natural)'
        : 'natural, expressive English';

  const durationRule = preserveDuration
    ? ' Match the approximate spoken syllable count and sentence pacing of the source so the localized voiceover fits the same video duration.'
    : '';

  const response = await generateTextWithFallback({
    ai,
    primaryModel: 'gemini-4-hydrogen',
    fallbackModel: 'gemini-2.5-flash',
    contents: `Translate or adapt the following voiceover script into ${targetDesc}.${durationRule} Preserve any inline vocal tags like <breath>, <laugh>, <chuckle>, <sigh>, <gasp>, |yeah|, |mhm|, or [CURIOUS]/[AWE] exactly as written. Return ONLY the adapted script text with no commentary or quotes.\n\nScript:\n${text.trim()}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const translatedText = (response.text ?? '').trim();
  if (!translatedText) {
    const err = new Error('Translation returned empty output. Please try again.') as Error & {
      status?: number;
    };
    err.status = 502;
    throw err;
  }

  return translatedText;
}

export async function localizeNarration(params: {
  text: string;
  targetLanguages: LanguageMode[];
  voiceId?: string;
  preserveDuration?: boolean;
  targetDurationSeconds?: number;
  sampleRate?: SampleRateHz;
  channels?: ChannelCount;
  masteringPreset?: MasteringPreset;
}): Promise<
  Array<{
    language: LanguageMode;
    script: string;
    result: GenerateResponsePayload;
    srt: string;
  }>
> {
  if (!params.text?.trim()) {
    throw new InputValidationError('Script text is required for localization.');
  }
  const srcStats = countWordsAndChars(params.text);
  const targetSec =
    params.targetDurationSeconds ||
    (params.preserveDuration ? Math.max(2, srcStats.estimatedSeconds) : undefined);

  const outputs: Array<{
    language: LanguageMode;
    script: string;
    result: GenerateResponsePayload;
    srt: string;
  }> = [];

  for (const lang of params.targetLanguages) {
    const localizedText = await translateSpeechScript(params.text, lang, Boolean(params.preserveDuration));
    const defaultVoice = lang === 'hi' ? 'aarav' : lang === 'bilingual' ? 'vikram' : 'ethan';
    const vPreset = VOICE_PRESETS.find((v) => v.id === (params.voiceId || defaultVoice)) ?? VOICE_PRESETS[0];

    const res = await synthesizeSpeech({
      mode: 'single',
      language: lang,
      modelTier: 'standard',
      text: localizedText,
      voiceId: vPreset.id,
      voiceName: vPreset.baseVoice,
      stylePrompt: vPreset.defaultStyle,
      speed: 1.0,
      sampleRate: params.sampleRate || 48000,
      channels: params.channels || 1,
      masteringPreset: params.masteringPreset || 'instagram_reel',
      targetDurationSeconds: targetSec,
      fitMode: params.preserveDuration ? 'stretch' : 'natural',
    });

    const srt = generateSubtitles({
      wordTimings: res.wordTimings || [],
      format: 'srt',
      preset: 'rainbow_reels',
    });

    outputs.push({
      language: lang,
      script: localizedText,
      result: res,
      srt,
    });
  }

  return outputs;
}

export async function resolveInputAudioBuffer(input: {
  clipId?: string;
  audioUrl?: string;
  audioBase64?: string;
  audioFile?: { download_url?: string; url?: string; mime_type?: string };
}): Promise<{ buffer: Buffer; mimeType: string; sourceText?: string }> {
  if (input.clipId) {
    const found = getClipAudioBuffer(input.clipId, true);
    if (!found) {
      throw new InputValidationError(`Audio clip '${input.clipId}' was not found.`);
    }
    return {
      buffer: found.buffer,
      mimeType: found.mimeType,
      sourceText: found.record.displayText,
    };
  }
  if (input.audioBase64) {
    const clean = input.audioBase64.replace(/^data:[^;]+;base64,/, '');
    return {
      buffer: Buffer.from(clean, 'base64'),
      mimeType: input.audioFile?.mime_type || 'audio/wav',
    };
  }
  const url = input.audioFile?.download_url || input.audioFile?.url || input.audioUrl;
  if (url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch input audio from URL (${res.status}).`);
    }
    const arrayBuf = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuf),
      mimeType: res.headers.get('content-type') || input.audioFile?.mime_type || 'audio/wav',
    };
  }
  throw new InputValidationError('Provide clipId, audioBase64, audioUrl, or an attached audioFile.');
}

export async function transcribeAudioBuffer(buffer: Buffer, mimeType = 'audio/wav'): Promise<string> {
  const ai = getGeminiClient();
  const response = await generateTextWithFallback({
    ai,
    primaryModel: 'gemini-3.5-transcribe',
    fallbackModel: 'gemini-2.5-flash',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: buffer.toString('base64'),
          },
        },
        { text: 'Transcribe this audio accurately, preserving English and Hindi (Devanagari) words naturally.' },
      ],
    },
  });
  return (response.text ?? '').trim();
}

export async function analyzeVoiceBuffer(
  buffer: Buffer,
  mimeType = 'audio/wav'
): Promise<{
  transcript: string;
  voiceDescription: string;
  recommendedVoiceId: string;
  recommendedStylePrompt: string;
  estimatedWpm: number;
  durationMs: number;
}> {
  const ai = getGeminiClient();
  const parsed = parseWavBuffer(buffer);
  const response = await generateTextWithFallback({
    ai,
    primaryModel: 'gemini-4-hydrogen',
    fallbackModel: 'gemini-2.5-flash',
    contents: {
      parts: [
        { inlineData: { mimeType, data: buffer.toString('base64') } },
        {
          text: `Analyze this speaker's voice characteristics (pitch register, cadence, warmth, accent, energy, and style) and also transcribe what is said. Return JSON with keys: transcript, voiceDescription, recommendedStylePrompt, estimatedWpm, recommendedPresetId (choose best match from: ${VOICE_PRESETS.map((v) => v.id).join(', ')}).`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const fallback = {
    transcript: '',
    voiceDescription: 'Warm, articulate studio narrator',
    recommendedStylePrompt: 'Measured, engaging studio narration',
    estimatedWpm: 145,
    recommendedPresetId: 'ethan',
  };

  try {
    const parsedJson = JSON.parse((response.text ?? '{}').trim());
    return {
      transcript: parsedJson.transcript || fallback.transcript,
      voiceDescription: parsedJson.voiceDescription || fallback.voiceDescription,
      recommendedVoiceId:
        VOICE_PRESETS.find((v) => v.id === parsedJson.recommendedPresetId)?.id || 'ethan',
      recommendedStylePrompt: parsedJson.recommendedStylePrompt || fallback.recommendedStylePrompt,
      estimatedWpm: Number(parsedJson.estimatedWpm) || fallback.estimatedWpm,
      durationMs: parsed.durationMs,
    };
  } catch {
    return {
      transcript: fallback.transcript,
      voiceDescription: fallback.voiceDescription,
      recommendedVoiceId: 'ethan',
      recommendedStylePrompt: fallback.recommendedStylePrompt,
      estimatedWpm: 145,
      durationMs: parsed.durationMs,
    };
  }
}

export async function matchAudioDuration(params: {
  buffer: Buffer;
  targetDurationSeconds: number;
  sampleRate?: SampleRateHz;
  channels?: ChannelCount;
  masteringPreset?: MasteringPreset;
  sourceText?: string;
}): Promise<GenerateResponsePayload> {
  const rate = params.sampleRate || 48000;
  const ch = params.channels === 2 ? 2 : 1;
  const processed = processWavAudio(params.buffer, {
    targetSampleRate: rate,
    targetChannels: ch,
    trimSilence: true,
    normalize: true,
    masteringPreset: params.masteringPreset || 'none',
    targetDurationSeconds: params.targetDurationSeconds,
    durationToleranceSeconds: 0.1,
    fitMode: 'stretch',
  });

  const displayText = params.sourceText || '';
  const parsedMaster = parseWavBuffer(processed.wavBuffer);
  const aligned = alignWordsToWavPcm(displayText, parsedMaster.pcm, rate, ch);
  const saved = saveStoredClip({
    wavBuffer: processed.wavBuffer,
    format: 'wav',
    mimeType: 'audio/wav',
    sampleRate: rate,
    channels: ch,
    durationMs: processed.durationMs,
    voiceId: 'matched',
    voiceName: 'Time-Matched Audio',
    modelUsed: 'svara-wsola-dsp',
    language: 'bilingual',
    displayText,
    masteringPreset: params.masteringPreset || 'none',
    timingSource: aligned.timingSource,
    timingConfidence: aligned.timingConfidence,
    wordTimings: aligned.wordTimings,
    phraseTimings: aligned.phraseTimings,
    speechEnvelope: processed.speechEnvelope,
    waveformPeaks: processed.waveformPeaks,
  });

  return {
    clipId: saved.id,
    audioUrl: `/api/clips/${saved.id}.wav`,
    downloadUrl: `/api/clips/${saved.id}.wav?download=1`,
    audioBase64: processed.wavBuffer.toString('base64'),
    mimeType: 'audio/wav',
    format: 'wav',
    sampleRate: rate,
    channels: ch,
    sizeBytes: processed.wavBuffer.length,
    modelUsed: 'svara-wsola-dsp',
    voiceId: 'matched',
    voiceName: 'Time-Matched Audio',
    voiceUsed: 'Time-Matched Audio',
    durationEstimateSec: Math.max(1, Math.round(processed.durationMs / 1000)),
    durationMs: processed.durationMs,
    timingSource: aligned.timingSource,
    timingConfidence: aligned.timingConfidence,
    wordTimings: aligned.wordTimings,
    phraseTimings: aligned.phraseTimings,
    speechEnvelope: processed.speechEnvelope,
    waveformPeaks: processed.waveformPeaks,
  };
}

export async function replaceAudioSegmentFromBuffer(params: {
  buffer: Buffer;
  startMs: number;
  endMs: number;
  replacementText: string;
  voiceId?: string;
  language?: LanguageMode;
  sampleRate?: SampleRateHz;
  channels?: ChannelCount;
}): Promise<GenerateResponsePayload> {
  if (!params.replacementText?.trim()) {
    throw new InputValidationError('Replacement text cannot be empty.');
  }
  const rate = params.sampleRate || 48000;
  const ch = params.channels === 2 ? 2 : 1;
  const parsedOrig = parseWavBuffer(params.buffer);
  let origMono = toMonoPcm(parsedOrig.pcm, parsedOrig.channels);
  if (parsedOrig.sampleRate !== rate) {
    origMono = resampleMonoPcm(origMono, parsedOrig.sampleRate, rate);
  }

  const startSample = Math.max(0, Math.min(origMono.length, Math.round((params.startMs / 1000) * rate)));
  const endSample = Math.max(startSample, Math.min(origMono.length, Math.round((params.endMs / 1000) * rate)));
  const targetSpanSec = Math.max(0.4, (endSample - startSample) / rate);

  const preset = VOICE_PRESETS.find((v) => v.id === (params.voiceId || 'ethan')) ?? VOICE_PRESETS[0];
  const repRes = await synthesizeSpeech({
    mode: 'single',
    language: params.language || 'en',
    modelTier: 'standard',
    text: params.replacementText,
    voiceId: preset.id,
    voiceName: preset.baseVoice,
    stylePrompt: preset.defaultStyle,
    speed: 1.0,
    sampleRate: rate,
    channels: 1,
    targetDurationSeconds: targetSpanSec,
    fitMode: 'stretch',
  });

  const repParsed = parseWavBuffer(Buffer.from(repRes.audioBase64, 'base64'));
  const repMono = toMonoPcm(repParsed.pcm, repParsed.channels);

  const head = origMono.slice(0, startSample);
  const tail = origMono.slice(endSample);
  const combined = new Int16Array(head.length + repMono.length + tail.length);
  combined.set(head, 0);
  combined.set(repMono, head.length);
  combined.set(tail, head.length + repMono.length);

  const finalWav = encodeWavBuffer(toChannelCount(combined, ch), rate, ch);
  const durationMs = Math.round((combined.length / rate) * 1000);
  const speechEnvelope = extractSpeechEnvelope(combined, rate, 1, 25);
  const waveformPeaks = extractWaveformPeaks(combined, 1, 120);
  const aligned = alignWordsToWavPcm(params.replacementText, combined, rate, 1);

  const saved = saveStoredClip({
    wavBuffer: finalWav,
    format: 'wav',
    mimeType: 'audio/wav',
    sampleRate: rate,
    channels: ch,
    durationMs,
    voiceId: preset.id,
    voiceName: `${preset.name} (${preset.roleTitle})`,
    modelUsed: repRes.modelUsed,
    language: params.language || 'en',
    displayText: params.replacementText,
    masteringPreset: 'none',
    timingSource: aligned.timingSource,
    timingConfidence: aligned.timingConfidence,
    wordTimings: aligned.wordTimings,
    phraseTimings: aligned.phraseTimings,
    speechEnvelope,
    waveformPeaks,
  });

  return {
    clipId: saved.id,
    audioUrl: `/api/clips/${saved.id}.wav`,
    downloadUrl: `/api/clips/${saved.id}.wav?download=1`,
    audioBase64: finalWav.toString('base64'),
    mimeType: 'audio/wav',
    format: 'wav',
    sampleRate: rate,
    channels: ch,
    sizeBytes: finalWav.length,
    modelUsed: repRes.modelUsed,
    voiceId: preset.id,
    voiceName: `${preset.name} (${preset.roleTitle})`,
    voiceUsed: `${preset.name} (${preset.roleTitle})`,
    durationEstimateSec: Math.max(1, Math.round(durationMs / 1000)),
    durationMs,
    timingSource: aligned.timingSource,
    timingConfidence: aligned.timingConfidence,
    wordTimings: aligned.wordTimings,
    phraseTimings: aligned.phraseTimings,
    speechEnvelope,
    waveformPeaks,
  };
}
