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
  splitLongScriptIntoChunks,
  validateGeneratePayload,
} from '../utils/speechLogic';
import { alignWordsToEnvelope, generateSubtitles } from '../utils/subtitleGenerator';
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
  WordTiming,
} from '../types';
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

export function mapApiError(error: unknown): { status: number; message: string } {
  const errObj = error as { status?: number; message?: string; code?: number };
  const rawMessage = errObj?.message || 'An unexpected speech synthesis error occurred.';
  const status =
    typeof errObj?.status === 'number'
      ? errObj.status
      : typeof errObj?.code === 'number'
        ? errObj.code
        : 500;

  if (rawMessage.includes('GEMINI_API_KEY')) {
    return { status: 400, message: rawMessage };
  }
  if (
    status === 403 ||
    rawMessage.includes('PERMISSION_DENIED') ||
    rawMessage.includes('API_KEY_INVALID')
  ) {
    return {
      status: 403,
      message: 'Gemini API authentication failed. Please verify your key in Settings > Secrets.',
    };
  }
  if (status === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message:
        'Gemini TTS API quota exhausted on the current free-tier key. Select a billing-enabled API key in Settings > Secrets to lift free-tier daily caps.',
    };
  }
  return { status: status >= 400 && status < 600 ? status : 500, message: rawMessage };
}

function isQuotaOrRateError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || '');
  const status = (err as { status?: number })?.status;
  return status === 429 || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429');
}

async function callSingleSpeakerGeminiTts(params: {
  ai: GoogleGenAI;
  model: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts';
  text: string;
  voiceName: PrebuiltVoiceName;
  styleInstruction: string;
  seed?: number;
}): Promise<{ buffer: Buffer; actualModel: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts' }> {
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

  const invokeModel = (targetModel: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts') =>
    params.ai.models.generateContent({
      model: targetModel,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: params.text.trim(),
              speechMetadata: {
                style: params.styleInstruction || 'Natural, clear voice delivery',
              },
            },
          ],
        },
      ],
      config,
    });

  let response;
  let actualModel: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts' = params.model;

  try {
    response = await invokeModel(params.model);
  } catch (err) {
    if (isQuotaOrRateError(err)) {
      if (params.model === 'gemini-3.8-flash-tts') {
        actualModel = 'gemini-3.8-flash-lite-tts';
        response = await invokeModel('gemini-3.8-flash-lite-tts');
      } else {
        // Brief backoff retry for transient RPM rate limits on flash-lite-tts
        await new Promise((r) => setTimeout(r, 1400));
        response = await invokeModel(params.model);
      }
    } else {
      throw err;
    }
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const audioPart = parts.find((p) => p.inlineData?.data);
  const base64Audio = audioPart?.inlineData?.data;
  if (!base64Audio) {
    const err = new Error(
      'The speech model did not return audio data. Try simplifying the script or style prompt.'
    ) as Error & { status?: number };
    err.status = 502;
    throw err;
  }
  return { buffer: Buffer.from(base64Audio, 'base64'), actualModel };
}

export async function synthesizeSpeech(
  payload: Partial<GenerateRequestPayload>
): Promise<GenerateResponsePayload> {
  const validation = validateGeneratePayload(payload);
  if (!validation.valid) {
    const err = new Error(validation.error || 'Invalid synthesis payload.') as Error & {
      status?: number;
    };
    err.status = 400;
    throw err;
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

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
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
        if (!audioPart?.inlineData?.data) {
          throw new Error('Multi-speaker synthesis returned empty audio.');
        }
        rawMasterWav = Buffer.from(audioPart.inlineData.data, 'base64');
        actualModelUsed = 'gemini-3.8-flash-tts';
      } catch (err) {
        if (!isQuotaOrRateError(err)) {
          throw err;
        }
        // Fallback: synthesize each dialogue turn with flash-lite-tts and stitch
        const fallbackBuffers: Buffer[] = [];
        for (const line of nonEmptyLines) {
          const speaker = line.speakerKey === keyA ? spA : spB;
          const pron = applyPronunciationRules(line.text.trim(), activePronunciations, language);
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
          const resTurn = await callSingleSpeakerGeminiTts({
            ai,
            model: 'gemini-3.8-flash-lite-tts',
            text: pron.ttsText,
            voiceName: speaker.baseVoice || 'Puck',
            styleInstruction: speakerStyle,
            seed: payload.seed,
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
        const turnResult = await callSingleSpeakerGeminiTts({
          ai,
          model: actualModelUsed as 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts',
          text: pron.ttsText,
          voiceName: sp.baseVoice || 'Puck',
          styleInstruction,
          seed: payload.seed,
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
            wordTimings: [],
            phraseTimings: [],
            speechEnvelope: stemStitched.speechEnvelope,
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
        const segRes = await callSingleSpeakerGeminiTts({
          ai,
          model: actualModelUsed as 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts',
          text: pron.ttsText,
          voiceName,
          styleInstruction: segStyle,
          seed: payload.seed,
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

      for (let i = 0; i < segProcessedInfos.length; i += 1) {
        const info = segProcessedInfos[i];
        const offset = stitched.offsetsMs[i];
        const parsedSegWav = parseWavBuffer(info.wavBuffer);
        const segEnv = extractSpeechEnvelope(parsedSegWav.pcm, parsedSegWav.sampleRate, parsedSegWav.channels, 25);
        const segAlign = alignWordsToEnvelope(info.seg.displayText, info.durationMs, segEnv);

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
          masteringPreset,
          wordTimings: segAlign.wordTimings,
          phraseTimings: segAlign.phraseTimings,
          speechEnvelope: segEnv,
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
    } else {
      const pron = applyPronunciationRules(rawScript, activePronunciations, language);
      pron.appliedTerms.forEach((t) => appliedPronunciations.add(t));
      const singleEmotion = parsedSegments[0]?.emotionPrompt;
      const cleanTtsText = pron.ttsText.replace(/\[[A-Z_]{2,24}\]/g, '').replace(/\s+/g, ' ').trim();
      const styleInstruction = buildStyleInstruction({
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

      const chunks = splitLongScriptIntoChunks(cleanTtsText || pron.ttsText, 3500);
      if (chunks.length <= 1) {
        const singleRes = await callSingleSpeakerGeminiTts({
          ai,
          model: actualModelUsed as 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts',
          text: chunks[0] || cleanTtsText || pron.ttsText,
          voiceName,
          styleInstruction,
          seed: payload.seed,
        });
        rawMasterWav = singleRes.buffer;
        actualModelUsed = singleRes.actualModel;
      } else {
        const chunkWavs: Buffer[] = [];
        for (const chunkText of chunks) {
          const chunkRes = await callSingleSpeakerGeminiTts({
            ai,
            model: actualModelUsed as 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts',
            text: chunkText,
            voiceName,
            styleInstruction,
            seed: payload.seed,
          });
          actualModelUsed = chunkRes.actualModel;
          chunkWavs.push(chunkRes.buffer);
        }
        rawMasterWav = stitchWavBuffers(chunkWavs, 150, targetSampleRate, targetChannels).wavBuffer;
      }
    }
  }

  // Final mastering, target duration fitting, sample rate, channels
  const processed = processWavAudio(rawMasterWav, {
    targetSampleRate,
    targetChannels,
    trimSilence,
    normalize,
    masteringPreset,
    targetDurationSeconds: payload.targetDurationSeconds,
    durationToleranceSeconds: payload.durationToleranceSeconds,
    fitMode: payload.fitMode || 'stretch',
  });

  // Align words to mastered acoustic speech envelope
  const aligned = alignedWordsFromSegments
    ? {
        wordTimings: alignedWordsFromSegments,
        phraseTimings: alignWordsToEnvelope(
          displayTextForCaptions,
          processed.durationMs,
          processed.speechEnvelope
        ).phraseTimings,
      }
    : alignWordsToEnvelope(
        displayTextForCaptions,
        processed.durationMs,
        processed.speechEnvelope
      );

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
    masteringPreset,
    wordTimings: aligned.wordTimings,
    phraseTimings: aligned.phraseTimings,
    speechEnvelope: processed.speechEnvelope,
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
    durationEstimateSec: Math.max(1, Math.round(processed.durationMs / 1000)),
    durationMs: processed.durationMs,
    wordTimings: aligned.wordTimings,
    phraseTimings: aligned.phraseTimings,
    speechEnvelope: processed.speechEnvelope,
    waveformPeaks: processed.waveformPeaks,
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
    const err = new Error('Clip or segment index not found.') as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  const segments = [...existing.segments];
  const targetSeg = segments[params.segmentIndex];
  const nextText = (params.text ?? targetSeg.text).trim();
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
  const preferredModel =
    existing.modelUsed === 'gemini-3.8-flash-tts'
      ? 'gemini-3.8-flash-tts'
      : 'gemini-3.8-flash-lite-tts';
  const segResult = await callSingleSpeakerGeminiTts({
    ai,
    model: preferredModel,
    text: pron.ttsText,
    voiceName: voicePreset.baseVoice,
    styleInstruction,
  });

  const processedNewSeg = processWavAudio(segResult.buffer, {
    targetSampleRate: existing.sampleRate,
    targetChannels: existing.channels,
    trimSilence: true,
    normalize: true,
    masteringPreset: existing.masteringPreset,
  });

  const segEnv = extractSpeechEnvelope(
    parseWavBuffer(processedNewSeg.wavBuffer).pcm,
    existing.sampleRate,
    existing.channels,
    25
  );
  const segAlign = alignWordsToEnvelope(nextText, processedNewSeg.durationMs, segEnv);

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
    wordTimings: segAlign.wordTimings,
    phraseTimings: segAlign.phraseTimings,
    speechEnvelope: segEnv,
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
    wordTimings: combinedWords,
    phraseTimings: fullPhraseTimings,
    speechEnvelope: stitched.speechEnvelope,
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
    durationEstimateSec: Math.max(1, Math.round(stitched.durationMs / 1000)),
    durationMs: stitched.durationMs,
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
    const err = new Error('Enter text to translate or adapt.') as Error & { status?: number };
    err.status = 400;
    throw err;
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

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
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
      throw new Error(`Audio clip '${input.clipId}' was not found.`);
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
  throw new Error('Provide clipId, audioBase64, audioUrl, or an attached audioFile.');
}

export async function transcribeAudioBuffer(buffer: Buffer, mimeType = 'audio/wav'): Promise<string> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
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
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
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
  const aligned = alignWordsToEnvelope(displayText, processed.durationMs, processed.speechEnvelope);
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
    wordTimings: aligned.wordTimings,
    phraseTimings: aligned.phraseTimings,
    speechEnvelope: processed.speechEnvelope,
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
    durationEstimateSec: Math.max(1, Math.round(processed.durationMs / 1000)),
    durationMs: processed.durationMs,
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
  const aligned = alignWordsToEnvelope(params.replacementText, durationMs, speechEnvelope);

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
    wordTimings: aligned.wordTimings,
    phraseTimings: aligned.phraseTimings,
    speechEnvelope,
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
    durationEstimateSec: Math.max(1, Math.round(durationMs / 1000)),
    durationMs,
    wordTimings: aligned.wordTimings,
    phraseTimings: aligned.phraseTimings,
    speechEnvelope,
    waveformPeaks,
  };
}
