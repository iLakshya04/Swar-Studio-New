import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { VOICE_PRESETS } from '../data/voices';
import {
  addClipToProject,
  createProject,
  deletePronunciation,
  deleteProjectClip,
  deleteVoicePreset,
  getClipAudioBuffer,
  getClipRecord,
  getProject,
  getVoicePreset,
  listProjects,
  listPronunciations,
  listVoicePresets,
  updateProjectClip,
  upsertPronunciation,
  upsertVoicePreset,
} from '../server/studioStore';
import {
  analyzeVoiceBuffer,
  localizeNarration,
  matchAudioDuration,
  regenerateClipSegment,
  replaceAudioSegmentFromBuffer,
  resolveInputAudioBuffer,
  synthesizeSpeech,
  transcribeAudioBuffer,
  translateSpeechScript,
} from '../server/ttsService';
import { filterVoices } from '../utils/speechLogic';
import { generateSubtitles } from '../utils/subtitleGenerator';
import type { GenerateResponsePayload, SubtitleFormat, SubtitlePreset } from '../types';

const SVARA_MCP_INSTRUCTIONS = `Svara Studio is a bilingual English, Hindi (हिन्दी), and Hinglish speech production server for video creators, reels, documentaries, and podcasts.
Recommended creator workflow:
1. Discover voices via list_voices or inspect saved presets via list_voice_presets, and audition quickly with preview_voice.
2. Register proper nouns or tricky words once with add_pronunciation so English and Hindi scripts speak them cleanly.
3. Generate broadcast-ready audio with generate_speech (defaults to 48 kHz normalized mono WAV) or per-line emotion segments with generate_speech_segments. Each synthesis tool returns both a native MCP file resource/resource_link and structured metadata including wordTimings, phraseTimings, and speechEnvelope (for music ducking).
4. Generate synchronized .srt, .vtt, or Rainbow Reels .ass karaoke captions directly from any clipId via generate_subtitles without re-transcribing.
5. Use localize_narration for simultaneous Hindi/Hinglish/English dubs, or pass existing files via audioFile/clipId to transcribe_audio, dub_audio, match_duration, analyze_voice, and replace_segment.`;

function buildAudioToolResult(
  publicBaseUrl: string,
  res: GenerateResponsePayload,
  extraMeta: Record<string, unknown> = {}
) {
  const base = publicBaseUrl.replace(/\/$/, '');
  const fullAudioUrl = `${base}${res.audioUrl}`;
  const fullDownloadUrl = `${base}${res.downloadUrl || `${res.audioUrl}?download=1`}`;
  const ext = res.format || 'wav';
  const fileName = `svara-${res.clipId}.${ext}`;
  const resourceUri = `svara://clips/${fileName}`;

  const structuredPayload: Record<string, unknown> = {
    status: 'synthesized',
    clipId: res.clipId,
    file: {
      id: res.clipId,
      name: fileName,
      mimeType: res.mimeType,
      format: ext,
      sizeBytes: res.sizeBytes ?? 0,
      downloadUrl: fullDownloadUrl,
      resourceUri,
      sampleRate: res.sampleRate ?? 48000,
      channels: res.channels ?? 1,
    },
    audioUrl: fullAudioUrl,
    downloadUrl: fullDownloadUrl,
    mimeType: res.mimeType,
    durationMs: res.durationMs ?? (res.durationEstimateSec || 1) * 1000,
    durationSeconds: Number(((res.durationMs ?? res.durationEstimateSec * 1000) / 1000).toFixed(2)),
    sampleRate: res.sampleRate ?? 48000,
    channels: res.channels ?? 1,
    voiceId: res.voiceId,
    voiceName: res.voiceName,
    model: res.modelUsed,
    appliedPronunciations: res.appliedPronunciations ?? [],
    wordTimings: res.wordTimings ?? [],
    phraseTimings: res.phraseTimings ?? [],
    speechEnvelope: res.speechEnvelope ?? [],
    ...(res.segments ? { segments: res.segments } : {}),
    ...(res.stems ? { stems: res.stems } : {}),
    ...extraMeta,
  };

  const content: Array<
    | { type: 'text'; text: string }
    | {
        type: 'resource_link';
        uri: string;
        name: string;
        title?: string;
        mimeType?: string;
        size?: number;
      }
    | {
        type: 'resource';
        resource: { uri: string; mimeType?: string; blob: string };
      }
  > = [
    {
      type: 'resource_link',
      uri: fullDownloadUrl,
      name: fileName,
      title: `${res.voiceName || 'Svara'} (${ext.toUpperCase()})`,
      mimeType: res.mimeType,
      size: res.sizeBytes,
    },
  ];

  // Embed native binary file blob for direct handoff when under 16 MB base64
  if (res.audioBase64 && res.audioBase64.length <= 16_000_000) {
    content.push({
      type: 'resource',
      resource: {
        uri: resourceUri,
        mimeType: res.mimeType,
        blob: res.audioBase64,
      },
    });
  }

  content.push({
    type: 'text',
    text: JSON.stringify(structuredPayload, null, 2),
  });

  return {
    content,
    structuredContent: structuredPayload,
  };
}

const ExpressiveControlsSchema = z
  .object({
    energy: z.number().min(0).max(100).optional(),
    warmth: z.number().min(0).max(100).optional(),
    authority: z.number().min(0).max(100).optional(),
    curiosity: z.number().min(0).max(100).optional(),
    dramaticTension: z.number().min(0).max(100).optional(),
    pace: z.number().min(0).max(100).optional(),
    pauseStrength: z.number().min(0).max(100).optional(),
    smile: z.number().min(0).max(100).optional(),
    whisper: z.number().min(0).max(100).optional(),
  })
  .optional();

const AudioFileParamSchema = z
  .object({
    download_url: z.string().optional(),
    url: z.string().optional(),
    file_id: z.string().optional(),
    mime_type: z.string().optional(),
  })
  .optional()
  .describe('Native file upload reference from ChatGPT/MCP client.');

export function createSvaraMcpServer(publicBaseUrl: string): McpServer {
  const server = new McpServer(
    {
      name: 'svara-studio',
      version: '2.0.0',
    },
    {
      instructions: SVARA_MCP_INSTRUCTIONS,
    }
  );

  // Static resources
  server.registerResource(
    'voice-catalog',
    'svara://voices',
    {
      title: 'Svara Studio Voice Catalog',
      description: 'Complete list of English, Hindi, and bilingual voice personas.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'svara://voices',
          mimeType: 'application/json',
          text: JSON.stringify(VOICE_PRESETS, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    'pronunciation-dictionary',
    'svara://pronunciations',
    {
      title: 'Svara Studio Pronunciation Dictionary',
      description: 'Custom English & Hindi phonetic/IPA pronunciation rules.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'svara://pronunciations',
          mimeType: 'application/json',
          text: JSON.stringify(listPronunciations(), null, 2),
        },
      ],
    })
  );

  server.registerResource(
    'voice-presets',
    'svara://presets',
    {
      title: 'Saved Voice & Mastering Presets',
      description: 'Reusable creator presets such as Rainbow Reels — Science Documentary.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'svara://presets',
          mimeType: 'application/json',
          text: JSON.stringify(listVoicePresets(), null, 2),
        },
      ],
    })
  );

  // Dynamic clip audio resource template
  server.registerResource(
    'clip-audio',
    new ResourceTemplate('svara://clips/{fileName}', { list: undefined }),
    {
      title: 'Generated Audio Clip',
      description: 'Retrieve generated WAV/MP3/M4A/FLAC clip bytes by file name.',
    },
    async (uri, variables) => {
      const fileName = String(variables.fileName || '');
      const cleanId = fileName.replace(/^svara-/, '').replace(/\.(wav|mp3|m4a|flac)$/i, '');
      const found = getClipAudioBuffer(cleanId, fileName.endsWith('.wav'));
      if (!found) {
        throw new Error(`Clip '${fileName}' not found.`);
      }
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: found.mimeType,
            blob: found.buffer.toString('base64'),
          },
        ],
      };
    }
  );

  // 1. list_voices
  server.registerTool(
    'list_voices',
    {
      title: 'List English & Hindi Voices',
      description:
        'List available Svara Studio voice personas for English, Hindi (हिन्दी), and Bilingual Hinglish text-to-speech.',
      inputSchema: {
        language: z.enum(['All', 'English', 'Hindi', 'Bilingual']).optional(),
        category: z
          .enum(['All', 'Narration', 'Conversational', 'Characters', 'News & Anchor', 'Wellness'])
          .optional(),
        query: z.string().optional(),
      },
    },
    async ({ language = 'All', category = 'All', query = '' }) => {
      const voices = filterVoices(VOICE_PRESETS, query, language, category).map((v) => ({
        id: v.id,
        name: v.name,
        roleTitle: v.roleTitle,
        language: v.language,
        category: v.category,
        gender: v.gender,
        accent: v.accent,
        defaultStyle: v.defaultStyle,
        description: v.description,
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify({ count: voices.length, voices }, null, 2) }],
        structuredContent: { count: voices.length, voices },
      };
    }
  );

  // 2. preview_voice
  server.registerTool(
    'preview_voice',
    {
      title: 'Preview Voice Audition (5-8s)',
      description: 'Fast audition of any voice persona with its sample line or a short custom line.',
      inputSchema: {
        voiceId: z.string().describe('Voice ID from list_voices (e.g. ethan, kabir, aarav, maya).'),
        sampleText: z.string().max(400).optional(),
        stylePrompt: z.string().optional(),
      },
    },
    async ({ voiceId, sampleText, stylePrompt }) => {
      const preset = VOICE_PRESETS.find((v) => v.id === voiceId) ?? VOICE_PRESETS[0];
      const res = await synthesizeSpeech({
        mode: 'single',
        language: preset.sampleLanguage,
        modelTier: 'standard',
        text: sampleText?.trim() || preset.sampleText,
        voiceId: preset.id,
        voiceName: preset.baseVoice,
        stylePrompt: stylePrompt || preset.defaultStyle,
        speed: 1.0,
        sampleRate: 48000,
        channels: 1,
        normalize: true,
        trimSilence: true,
      });
      return buildAudioToolResult(publicBaseUrl, res, { previewOf: preset.id });
    }
  );

  // 3. generate_speech (native file output + word timings + mastering + target duration)
  server.registerTool(
    'generate_speech',
    {
      title: 'Generate Production Speech & Native Audio File',
      description:
        'Synthesize creator-ready speech in English, Hindi, or Hinglish. Supports 48 kHz WAV/MP3/M4A/FLAC, normalization, silence trimming, mastering presets, target duration fitting, saved voice presets, custom pronunciations, and returns native audio file output + word/phrase timestamps + speechEnvelope.',
      inputSchema: {
        text: z.string().min(1).max(8000),
        voiceId: z.string().optional(),
        voicePresetId: z.string().optional().describe('Optional saved preset ID or name from list_voice_presets.'),
        language: z.enum(['en', 'hi', 'bilingual']).optional(),
        stylePrompt: z.string().optional(),
        customVoiceDescription: z.string().optional(),
        speed: z.number().min(0.7).max(1.4).optional(),
        pitchRegister: z.enum(['deep', 'balanced', 'bright']).optional(),
        emotionIntensity: z.enum(['subtle', 'natural', 'dramatic']).optional(),
        expressiveControls: ExpressiveControlsSchema,
        seed: z.number().int().optional(),
        format: z.enum(['wav', 'mp3', 'm4a', 'flac']).optional().default('wav'),
        sampleRate: z.union([z.literal(24000), z.literal(44100), z.literal(48000)]).optional().default(48000),
        channels: z.union([z.literal(1), z.literal(2)]).optional().default(1),
        bitrateKbps: z.number().min(64).max(320).optional(),
        normalize: z.boolean().optional().default(true),
        trimSilence: z.boolean().optional().default(true),
        masteringPreset: z
          .enum(['none', 'youtube_narration', 'instagram_reel', 'podcast', 'audiobook'])
          .optional()
          .default('none'),
        targetDurationSeconds: z.number().min(0.5).max(300).optional(),
        durationToleranceSeconds: z.number().min(0.05).max(5).optional(),
        fitMode: z.enum(['natural', 'tight', 'stretch']).optional(),
        projectId: z.string().optional(),
      },
    },
    async (args) => {
      const savedPreset = args.voicePresetId ? getVoicePreset(args.voicePresetId) : undefined;
      const language = args.language ?? savedPreset?.language ?? 'en';
      const fallbackVoiceId = language === 'hi' ? 'aarav' : language === 'bilingual' ? 'vikram' : 'ethan';
      const effectiveVoiceId = args.voiceId ?? savedPreset?.voiceId ?? fallbackVoiceId;
      const preset = VOICE_PRESETS.find((v) => v.id === effectiveVoiceId) ?? VOICE_PRESETS[0];

      const res = await synthesizeSpeech({
        mode: 'single',
        language,
        modelTier: args.expressiveControls || args.customVoiceDescription ? 'expressive' : 'standard',
        text: args.text,
        voiceId: preset.id,
        voiceName: preset.baseVoice,
        stylePrompt: args.stylePrompt ?? savedPreset?.stylePrompt ?? preset.defaultStyle,
        customVoiceDescription: args.customVoiceDescription ?? savedPreset?.customVoiceDescription,
        speed: args.speed ?? savedPreset?.speed ?? 1.0,
        pitchRegister: args.pitchRegister ?? savedPreset?.pitchRegister ?? 'balanced',
        emotionIntensity: args.emotionIntensity ?? savedPreset?.emotionIntensity ?? 'natural',
        expressiveControls: args.expressiveControls ?? savedPreset?.expressiveControls,
        seed: args.seed,
        format: args.format,
        sampleRate: args.sampleRate ?? savedPreset?.sampleRate ?? 48000,
        channels: args.channels ?? savedPreset?.channels ?? 1,
        bitrateKbps: args.bitrateKbps,
        normalize: args.normalize,
        trimSilence: args.trimSilence,
        masteringPreset: args.masteringPreset !== 'none' ? args.masteringPreset : (savedPreset?.masteringPreset ?? 'none'),
        targetDurationSeconds: args.targetDurationSeconds,
        durationToleranceSeconds: args.durationToleranceSeconds,
        fitMode: args.fitMode,
        projectId: args.projectId,
      });

      return buildAudioToolResult(publicBaseUrl, res);
    }
  );

  // 4. generate_speech_segments
  server.registerTool(
    'generate_speech_segments',
    {
      title: 'Generate Timeline & Emotion-Tagged Speech Segments',
      description:
        'Synthesize a script split into sentences or per-line emotion tags ([CURIOUS], [CHALLENGING], [AWE], [QUIET]). Returns a stitched master WAV plus per-segment clipIds and timings so any single sentence can later be regenerated.',
      inputSchema: {
        text: z.string().min(1).max(8000),
        voiceId: z.string().optional(),
        language: z.enum(['en', 'hi', 'bilingual']).optional().default('en'),
        stylePrompt: z.string().optional(),
        speed: z.number().min(0.7).max(1.4).optional().default(1.0),
        sampleRate: z.union([z.literal(24000), z.literal(44100), z.literal(48000)]).optional().default(48000),
        channels: z.union([z.literal(1), z.literal(2)]).optional().default(1),
        masteringPreset: z
          .enum(['none', 'youtube_narration', 'instagram_reel', 'podcast', 'audiobook'])
          .optional()
          .default('instagram_reel'),
      },
    },
    async (args) => {
      const preset = VOICE_PRESETS.find((v) => v.id === (args.voiceId || 'ethan')) ?? VOICE_PRESETS[0];
      const res = await synthesizeSpeech({
        mode: 'single',
        language: args.language,
        modelTier: 'expressive',
        text: args.text,
        voiceId: preset.id,
        voiceName: preset.baseVoice,
        stylePrompt: args.stylePrompt ?? preset.defaultStyle,
        speed: args.speed,
        sampleRate: args.sampleRate,
        channels: args.channels,
        masteringPreset: args.masteringPreset,
        segmentMode: true,
      });
      return buildAudioToolResult(publicBaseUrl, res);
    }
  );

  // 5. regenerate_segment
  server.registerTool(
    'regenerate_segment',
    {
      title: 'Regenerate Single Sentence Segment',
      description:
        'Regenerate one sentence/segment inside a previously generated segmented clip without re-synthesizing the entire narration, then return the re-stitched master audio file.',
      inputSchema: {
        clipId: z.string(),
        segmentIndex: z.number().int().min(0),
        text: z.string().optional(),
        emotion: z.string().optional(),
        voiceId: z.string().optional(),
        stylePrompt: z.string().optional(),
        speed: z.number().min(0.7).max(1.4).optional(),
      },
    },
    async (args) => {
      const res = await regenerateClipSegment(args);
      return buildAudioToolResult(publicBaseUrl, res, { regeneratedSegmentIndex: args.segmentIndex });
    }
  );

  // 6. generate_subtitles
  server.registerTool(
    'generate_subtitles',
    {
      title: 'Generate Synchronized Subtitles (.SRT, .VTT, .ASS, JSON)',
      description:
        'Generate time-aligned captions from a synthesized clipId. Includes Rainbow Reels Captions preset (white text + cyan #00E5FF active-word karaoke highlighting, max 3 lines, vertical 1080x1920 safe positioning).',
      inputSchema: {
        clipId: z.string(),
        format: z.enum(['srt', 'vtt', 'ass', 'json']).default('ass'),
        preset: z.enum(['rainbow_reels', 'clean_editorial']).default('rainbow_reels'),
        maxLines: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().default(3),
        maxCharsPerLine: z.number().int().min(10).max(80).optional(),
        maxPhraseDurationMs: z.number().int().min(800).max(10000).optional(),
        safeAreaMarginV: z.number().int().min(20).max(800).optional(),
      },
    },
    async ({
      clipId,
      format,
      preset,
      maxLines,
      maxCharsPerLine,
      maxPhraseDurationMs,
      safeAreaMarginV,
    }) => {
      const record = getClipRecord(clipId);
      if (!record) {
        throw new Error(`Clip '${clipId}' not found.`);
      }
      const subtitleText = generateSubtitles({
        wordTimings: record.wordTimings,
        format: format as SubtitleFormat,
        preset: preset as SubtitlePreset,
        maxLines: maxLines as 1 | 2 | 3,
        maxCharsPerLine,
        maxPhraseDurationMs,
        safeAreaMarginV,
      });

      const downloadUrl = `${publicBaseUrl.replace(/\/$/, '')}/api/clips/${clipId}/subtitles/${format}?preset=${preset}&maxLines=${maxLines}&download=1`;
      const mimeMap: Record<string, string> = {
        srt: 'application/x-subrip',
        vtt: 'text/vtt',
        ass: 'text/x-ssa',
        json: 'application/json',
      };

      return {
        content: [
          {
            type: 'resource_link',
            uri: downloadUrl,
            name: `svara-${clipId}.${format}`,
            title: `Subtitles (${preset}, ${format.toUpperCase()})`,
            mimeType: mimeMap[format],
          },
          {
            type: 'resource',
            resource: {
              uri: `svara://clips/${clipId}.${format}`,
              mimeType: mimeMap[format],
              text: subtitleText,
            },
          },
          {
            type: 'text',
            text: JSON.stringify(
              {
                clipId,
                format,
                preset,
                downloadUrl,
                cueCount: record.phraseTimings.length,
                content: subtitleText,
              },
              null,
              2
            ),
          },
        ],
        structuredContent: {
          clipId,
          format,
          preset,
          downloadUrl,
          content: subtitleText,
        },
      };
    }
  );

  // 7. generate_dialogue (up to 6 speakers + stems)
  server.registerTool(
    'generate_dialogue',
    {
      title: 'Generate Multi-Speaker Dialogue (2–6 Speakers + Stems)',
      description:
        'Generate multi-speaker podcasts or scenes (2 to 6 speakers) in English, Hindi, or Hinglish with backchanneling (|yeah|, |mhm|), per-line emotion, and optional speaker-separated stems.',
      inputSchema: {
        language: z.enum(['en', 'hi', 'bilingual']).default('bilingual'),
        speed: z.number().min(0.7).max(1.4).default(1.0),
        separateStems: z.boolean().optional().default(false),
        speakers: z
          .array(
            z.object({
              key: z.string().min(1),
              name: z.string().min(1),
              voiceId: z.string().min(1),
              style: z.string().optional(),
            })
          )
          .min(2)
          .max(6)
          .optional(),
        speakerAName: z.string().optional(),
        speakerAVoiceId: z.string().optional(),
        speakerAStyle: z.string().optional(),
        speakerBName: z.string().optional(),
        speakerBVoiceId: z.string().optional(),
        speakerBStyle: z.string().optional(),
        turns: z
          .array(
            z.object({
              speaker: z.string().min(1),
              text: z.string().min(1),
              emotion: z.string().optional(),
            })
          )
          .min(1),
      },
    },
    async (args) => {
      const speakerList = args.speakers?.length
        ? args.speakers.map((s) => {
            const p = VOICE_PRESETS.find((v) => v.id === s.voiceId) ?? VOICE_PRESETS[0];
            return {
              id: s.key,
              name: s.name,
              voiceId: p.id,
              baseVoice: p.baseVoice,
              style: s.style || p.defaultStyle,
            };
          })
        : [
            (() => {
              const p = VOICE_PRESETS.find((v) => v.id === (args.speakerAVoiceId || 'vikram')) ?? VOICE_PRESETS[3];
              return {
                id: 'A',
                name: args.speakerAName || 'Vikram',
                voiceId: p.id,
                baseVoice: p.baseVoice,
                style: args.speakerAStyle || p.defaultStyle,
              };
            })(),
            (() => {
              const p = VOICE_PRESETS.find((v) => v.id === (args.speakerBVoiceId || 'ananya')) ?? VOICE_PRESETS[1];
              return {
                id: 'B',
                name: args.speakerBName || 'Ananya',
                voiceId: p.id,
                baseVoice: p.baseVoice,
                style: args.speakerBStyle || p.defaultStyle,
              };
            })(),
          ];

      const res = await synthesizeSpeech({
        mode: 'multi',
        language: args.language,
        modelTier: 'expressive',
        text: '',
        voiceName: speakerList[0].baseVoice,
        stylePrompt: '',
        speed: args.speed,
        speakerList,
        separateStems: args.separateStems,
        dialogueLines: args.turns.map((t, i) => ({
          id: `turn-${i + 1}`,
          speakerKey: t.speaker,
          text: t.text,
          emotion: t.emotion,
        })),
        sampleRate: 48000,
        channels: 1,
      });

      return buildAudioToolResult(publicBaseUrl, res, {
        speakers: speakerList.map((s) => s.name),
      });
    }
  );

  // 8. translate_tts_script & 9. localize_narration
  server.registerTool(
    'translate_tts_script',
    {
      title: 'Adapt Script Between English, Hindi & Hinglish',
      description: 'Adapt a voiceover script into Hindi (Devanagari), English, or Hinglish while preserving tags.',
      inputSchema: {
        text: z.string().min(1),
        targetLanguage: z.enum(['en', 'hi', 'bilingual']),
        preserveDuration: z.boolean().optional().default(false),
      },
    },
    async ({ text, targetLanguage, preserveDuration }) => {
      const translatedText = await translateSpeechScript(text, targetLanguage, preserveDuration);
      return {
        content: [{ type: 'text', text: JSON.stringify({ targetLanguage, translatedText }, null, 2) }],
        structuredContent: { targetLanguage, translatedText },
      };
    }
  );

  server.registerTool(
    'localize_narration',
    {
      title: 'Localize Narration to Hindi / Hinglish / English Audio + Subtitles',
      description:
        'Translate an English/Hindi script into one or more target languages while optionally preserving duration, and return localized 48 kHz WAV audio + synchronized SRT subtitles + word timings for each language.',
      inputSchema: {
        text: z.string().min(1),
        targetLanguages: z.array(z.enum(['en', 'hi', 'bilingual'])).min(1),
        voiceId: z.string().optional(),
        preserveDuration: z.boolean().optional().default(true),
        targetDurationSeconds: z.number().min(0.5).max(300).optional(),
      },
    },
    async (args) => {
      const localized = await localizeNarration(args);
      const base = publicBaseUrl.replace(/\/$/, '');
      const summary = localized.map((item) => ({
        language: item.language,
        script: item.script,
        clipId: item.result.clipId,
        audioUrl: `${base}${item.result.audioUrl}`,
        downloadUrl: `${base}${item.result.downloadUrl}`,
        durationMs: item.result.durationMs,
        wordTimings: item.result.wordTimings,
        srt: item.srt,
      }));
      return {
        content: [
          ...localized.map((item) => ({
            type: 'resource_link' as const,
            uri: `${base}${item.result.downloadUrl}`,
            name: `svara-${item.language}-${item.result.clipId}.wav`,
            mimeType: 'audio/wav',
          })),
          { type: 'text', text: JSON.stringify({ localizations: summary }, null, 2) },
        ],
        structuredContent: { localizations: summary },
      };
    }
  );

  // 10-12. Pronunciation Dictionary tools
  server.registerTool(
    'add_pronunciation',
    {
      title: 'Add or Update Pronunciation Rule',
      description: 'Define a custom phonetic or IPA pronunciation rule for an English, Hindi, or Hinglish term.',
      inputSchema: {
        term: z.string().min(1),
        phonetic: z.string().min(1),
        ipa: z.string().optional(),
        language: z.enum(['en', 'hi', 'bilingual']).optional().default('bilingual'),
        notes: z.string().optional(),
      },
    },
    async (args) => {
      const entry = upsertPronunciation(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(entry, null, 2) }],
        structuredContent: { entry },
      };
    }
  );

  server.registerTool(
    'list_pronunciations',
    {
      title: 'List Pronunciation Rules',
      description: 'List all saved English and Hindi custom pronunciation guide entries.',
      inputSchema: {},
    },
    async () => {
      const entries = listPronunciations();
      return {
        content: [{ type: 'text', text: JSON.stringify({ count: entries.length, entries }, null, 2) }],
        structuredContent: { count: entries.length, entries },
      };
    }
  );

  server.registerTool(
    'delete_pronunciation',
    {
      title: 'Delete Pronunciation Rule',
      description: 'Remove a pronunciation guide entry by ID or term.',
      inputSchema: { idOrTerm: z.string().min(1) },
    },
    async ({ idOrTerm }) => {
      const deleted = deletePronunciation(idOrTerm);
      return {
        content: [{ type: 'text', text: JSON.stringify({ deleted, idOrTerm }, null, 2) }],
        structuredContent: { deleted, idOrTerm },
      };
    }
  );

  // 13-15. Saved Voice Presets
  server.registerTool(
    'create_voice_preset',
    {
      title: 'Create or Update Reusable Voice Preset',
      description: 'Save a voice + tone + expressive controls + mastering preset (e.g. Rainbow Reels — Science Documentary).',
      inputSchema: {
        name: z.string().min(1),
        voiceId: z.string().min(1),
        language: z.enum(['en', 'hi', 'bilingual']).default('en'),
        stylePrompt: z.string().min(1),
        customVoiceDescription: z.string().optional(),
        speed: z.number().min(0.7).max(1.4).default(1.0),
        pitchRegister: z.enum(['deep', 'balanced', 'bright']).default('balanced'),
        emotionIntensity: z.enum(['subtle', 'natural', 'dramatic']).default('natural'),
        expressiveControls: ExpressiveControlsSchema,
        masteringPreset: z
          .enum(['none', 'youtube_narration', 'instagram_reel', 'podcast', 'audiobook'])
          .default('instagram_reel'),
        sampleRate: z.union([z.literal(24000), z.literal(44100), z.literal(48000)]).default(48000),
        channels: z.union([z.literal(1), z.literal(2)]).default(1),
      },
    },
    async (args) => {
      const preset = upsertVoicePreset(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(preset, null, 2) }],
        structuredContent: { preset },
      };
    }
  );

  server.registerTool(
    'list_voice_presets',
    {
      title: 'List Saved Voice Presets',
      description: 'List saved reusable voice & mastering presets.',
      inputSchema: {},
    },
    async () => {
      const presets = listVoicePresets();
      return {
        content: [{ type: 'text', text: JSON.stringify({ count: presets.length, presets }, null, 2) }],
        structuredContent: { count: presets.length, presets },
      };
    }
  );

  server.registerTool(
    'delete_voice_preset',
    {
      title: 'Delete Voice Preset',
      description: 'Delete a saved voice preset by ID.',
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const deleted = deleteVoicePreset(id);
      return {
        content: [{ type: 'text', text: JSON.stringify({ deleted, id }, null, 2) }],
        structuredContent: { deleted, id },
      };
    }
  );

  // 16-22. Project / Session CRUD & Export
  server.registerTool(
    'create_project',
    {
      title: 'Create Narration Project',
      description: 'Create a named multi-clip narration project for organizing reels, episodes, or dubs.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        defaultVoicePresetId: z.string().optional(),
      },
    },
    async (args) => {
      const project = createProject(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
        structuredContent: { project },
      };
    }
  );

  server.registerTool(
    'list_projects',
    {
      title: 'List Narration Projects',
      description: 'List all saved Svara Studio projects.',
      inputSchema: {},
    },
    async () => {
      const projects = listProjects();
      return {
        content: [{ type: 'text', text: JSON.stringify({ count: projects.length, projects }, null, 2) }],
        structuredContent: { count: projects.length, projects },
      };
    }
  );

  server.registerTool(
    'get_project',
    {
      title: 'Get Project Details',
      description: 'Inspect a project and all its ordered clips.',
      inputSchema: { projectId: z.string().min(1) },
    },
    async ({ projectId }) => {
      const project = getProject(projectId);
      if (!project) throw new Error(`Project '${projectId}' not found.`);
      return {
        content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
        structuredContent: { project },
      };
    }
  );

  server.registerTool(
    'add_clip_to_project',
    {
      title: 'Add Clip to Project',
      description: 'Attach an existing generated clipId to a project.',
      inputSchema: {
        projectId: z.string().min(1),
        clipId: z.string().min(1),
        title: z.string().optional(),
      },
    },
    async ({ projectId, clipId, title }) => {
      const rec = getClipRecord(clipId);
      if (!rec) throw new Error(`Clip '${clipId}' not found.`);
      const updated = addClipToProject(projectId, {
        clipId: rec.id,
        title: title || rec.displayText.slice(0, 48),
        text: rec.displayText,
        voiceId: rec.voiceId,
        voiceName: rec.voiceName,
        language: rec.language,
        durationMs: rec.durationMs,
        sampleRate: rec.sampleRate,
        channels: rec.channels,
        audioUrl: `/api/clips/${rec.id}.${rec.format}`,
        downloadUrl: `/api/clips/${rec.id}.${rec.format}?download=1`,
      });
      if (!updated) throw new Error(`Project '${projectId}' not found.`);
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
        structuredContent: { project: updated },
      };
    }
  );

  server.registerTool(
    'update_clip',
    {
      title: 'Update Clip Metadata in Project',
      description: 'Rename, update script note, or reorder a clip inside a project.',
      inputSchema: {
        projectId: z.string().min(1),
        clipId: z.string().min(1),
        title: z.string().optional(),
        text: z.string().optional(),
        order: z.number().int().min(1).optional(),
      },
    },
    async ({ projectId, clipId, title, text, order }) => {
      const updated = updateProjectClip(projectId, clipId, { title, text, order });
      if (!updated) throw new Error('Project or clip not found.');
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
        structuredContent: { project: updated },
      };
    }
  );

  server.registerTool(
    'delete_clip',
    {
      title: 'Remove Clip from Project',
      description: 'Remove a clip reference from a project.',
      inputSchema: { projectId: z.string().min(1), clipId: z.string().min(1) },
    },
    async ({ projectId, clipId }) => {
      const updated = deleteProjectClip(projectId, clipId);
      if (!updated) throw new Error('Project not found.');
      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
        structuredContent: { project: updated },
      };
    }
  );

  server.registerTool(
    'export_project',
    {
      title: 'Export Project Manifest & Combined Subtitles',
      description: 'Export all clips, download URLs, and combined SRT/ASS captions for a project.',
      inputSchema: { projectId: z.string().min(1) },
    },
    async ({ projectId }) => {
      const proj = getProject(projectId);
      if (!proj) throw new Error(`Project '${projectId}' not found.`);
      const base = publicBaseUrl.replace(/\/$/, '');
      const manifest = {
        ...proj,
        clips: proj.clips.map((c) => ({
          ...c,
          audioUrl: `${base}${c.audioUrl}`,
          downloadUrl: `${base}${c.downloadUrl}`,
          srtUrl: `${base}/api/clips/${c.clipId}/subtitles/srt?download=1`,
          assUrl: `${base}/api/clips/${c.clipId}/subtitles/ass?preset=rainbow_reels&download=1`,
        })),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(manifest, null, 2) }],
        structuredContent: manifest,
      };
    }
  );

  // 23-27. Native Audio File Input Tools (openai/fileParams)
  server.registerTool(
    'transcribe_audio',
    {
      title: 'Transcribe Audio File',
      description: 'Transcribe an uploaded audioFile, audioUrl, or Svara clipId into English/Hindi text.',
      _meta: { 'openai/fileParams': ['audioFile'] },
      inputSchema: {
        clipId: z.string().optional(),
        audioUrl: z.string().optional(),
        audioBase64: z.string().optional(),
        audioFile: AudioFileParamSchema,
      },
    },
    async (args) => {
      const { buffer, mimeType } = await resolveInputAudioBuffer(args);
      const transcript = await transcribeAudioBuffer(buffer, mimeType);
      return {
        content: [{ type: 'text', text: JSON.stringify({ transcript }, null, 2) }],
        structuredContent: { transcript },
      };
    }
  );

  server.registerTool(
    'analyze_voice',
    {
      title: 'Analyze Voice Characteristics from Audio File',
      description:
        'Analyze an uploaded voice sample to describe its timbre/cadence/pace and recommend a matching Svara voice preset.',
      _meta: { 'openai/fileParams': ['audioFile'] },
      inputSchema: {
        clipId: z.string().optional(),
        audioUrl: z.string().optional(),
        audioBase64: z.string().optional(),
        audioFile: AudioFileParamSchema,
      },
    },
    async (args) => {
      const { buffer, mimeType } = await resolveInputAudioBuffer(args);
      const analysis = await analyzeVoiceBuffer(buffer, mimeType);
      return {
        content: [{ type: 'text', text: JSON.stringify(analysis, null, 2) }],
        structuredContent: analysis,
      };
    }
  );

  server.registerTool(
    'dub_audio',
    {
      title: 'Dub Audio File into Hindi / Hinglish / English',
      description:
        'Transcribe an input audioFile/clipId, adapt script into targetLanguage, and synthesize duration-matched 48 kHz WAV + captions.',
      _meta: { 'openai/fileParams': ['audioFile'] },
      inputSchema: {
        clipId: z.string().optional(),
        audioUrl: z.string().optional(),
        audioBase64: z.string().optional(),
        audioFile: AudioFileParamSchema,
        targetLanguage: z.enum(['en', 'hi', 'bilingual']).default('hi'),
        voiceId: z.string().optional(),
        preserveDuration: z.boolean().optional().default(true),
      },
    },
    async (args) => {
      const { buffer, mimeType, sourceText } = await resolveInputAudioBuffer(args);
      const transcript = sourceText || (await transcribeAudioBuffer(buffer, mimeType));
      const [localized] = await localizeNarration({
        text: transcript,
        targetLanguages: [args.targetLanguage],
        voiceId: args.voiceId,
        preserveDuration: args.preserveDuration,
      });
      return buildAudioToolResult(publicBaseUrl, localized.result, {
        sourceTranscript: transcript,
        localizedScript: localized.script,
        srt: localized.srt,
      });
    }
  );

  server.registerTool(
    'match_duration',
    {
      title: 'Time-Stretch Audio File to Exact Duration',
      description:
        'Fit an existing clipId or uploaded audioFile to targetDurationSeconds cleanly without pitch distortion.',
      _meta: { 'openai/fileParams': ['audioFile'] },
      inputSchema: {
        clipId: z.string().optional(),
        audioUrl: z.string().optional(),
        audioBase64: z.string().optional(),
        audioFile: AudioFileParamSchema,
        targetDurationSeconds: z.number().min(0.5).max(300),
        sampleRate: z.union([z.literal(24000), z.literal(44100), z.literal(48000)]).optional().default(48000),
        channels: z.union([z.literal(1), z.literal(2)]).optional().default(1),
      },
    },
    async (args) => {
      const { buffer, sourceText } = await resolveInputAudioBuffer(args);
      const res = await matchAudioDuration({
        buffer,
        targetDurationSeconds: args.targetDurationSeconds,
        sampleRate: args.sampleRate,
        channels: args.channels,
        sourceText,
      });
      return buildAudioToolResult(publicBaseUrl, res);
    }
  );

  server.registerTool(
    'replace_segment',
    {
      title: 'Replace Time Span in Existing Audio File',
      description:
        'Replace a specific [startMs..endMs] span in an audioFile or clipId with newly synthesized replacementText matched to that duration.',
      _meta: { 'openai/fileParams': ['audioFile'] },
      inputSchema: {
        clipId: z.string().optional(),
        audioUrl: z.string().optional(),
        audioBase64: z.string().optional(),
        audioFile: AudioFileParamSchema,
        startMs: z.number().int().min(0),
        endMs: z.number().int().min(100),
        replacementText: z.string().min(1),
        voiceId: z.string().optional(),
        language: z.enum(['en', 'hi', 'bilingual']).optional().default('en'),
      },
    },
    async (args) => {
      const { buffer } = await resolveInputAudioBuffer(args);
      const res = await replaceAudioSegmentFromBuffer({
        buffer,
        startMs: args.startMs,
        endMs: args.endMs,
        replacementText: args.replacementText,
        voiceId: args.voiceId,
        language: args.language,
      });
      return buildAudioToolResult(publicBaseUrl, res);
    }
  );

  return server;
}
