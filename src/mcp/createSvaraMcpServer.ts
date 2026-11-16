import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { VOICE_PRESETS } from '../data/voices';
import { filterVoices } from '../utils/speechLogic';
import { synthesizeSpeech, translateSpeechScript } from '../server/ttsService';

export function createSvaraMcpServer(publicBaseUrl: string): McpServer {
  const server = new McpServer({
    name: 'svara-studio',
    version: '1.0.0',
  });

  server.registerResource(
    'voice-catalog',
    'svara://voices',
    {
      title: 'Svara Studio Voice Catalog',
      description: 'Complete list of English, Hindi, and bilingual voice personas available for speech synthesis.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'svara://voices',
          mimeType: 'application/json',
          text: JSON.stringify(
            VOICE_PRESETS.map((v) => ({
              id: v.id,
              name: v.name,
              roleTitle: v.roleTitle,
              language: v.language,
              category: v.category,
              accent: v.accent,
              defaultStyle: v.defaultStyle,
              description: v.description,
            })),
            null,
            2
          ),
        },
      ],
    })
  );

  server.registerTool(
    'list_voices',
    {
      title: 'List English & Hindi Voices',
      description:
        'List available Svara Studio voice personas for English, Hindi (हिन्दी), and Bilingual Hinglish text-to-speech.',
      inputSchema: {
        language: z
          .enum(['All', 'English', 'Hindi', 'Bilingual'])
          .optional()
          .describe('Filter voices by language support.'),
        category: z
          .enum(['All', 'Narration', 'Conversational', 'Characters', 'News & Anchor', 'Wellness'])
          .optional()
          .describe('Filter voices by category.'),
        query: z.string().optional().describe('Optional keyword search query.'),
      },
    },
    async ({ language = 'All', category = 'All', query = '' }) => {
      const voices = filterVoices(VOICE_PRESETS, query, language, category).map((v) => ({
        id: v.id,
        name: v.name,
        roleTitle: v.roleTitle,
        language: v.language,
        category: v.category,
        accent: v.accent,
        defaultStyle: v.defaultStyle,
        description: v.description,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ count: voices.length, voices }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    'generate_speech',
    {
      title: 'Generate Text-to-Speech Audio (English & Hindi)',
      description:
        'Synthesize expressive WAV speech from English, Hindi (Devanagari हिन्दी), or Hinglish text. Supports vocal tags (<breath>, <laugh>, <chuckle>, <sigh>, <gasp>) and custom voice descriptions. Returns a direct downloadable .wav URL.',
      inputSchema: {
        text: z
          .string()
          .min(1)
          .max(4000)
          .describe('Script text in English, Hindi (Devanagari), or Hinglish.'),
        voiceId: z
          .string()
          .optional()
          .describe('Voice persona ID from list_voices (e.g., aarav, ananya, meera, vikram, marcus). Defaults to aarav for Hindi or marcus for English.'),
        language: z
          .enum(['en', 'hi', 'bilingual'])
          .optional()
          .describe('Pronunciation target: en (English), hi (Hindi), or bilingual (Hinglish).'),
        stylePrompt: z
          .string()
          .optional()
          .describe('Tone and delivery direction (e.g., "Warm, expressive Hindi storyteller").'),
        customVoiceDescription: z
          .string()
          .optional()
          .describe('Optional custom voice persona description in plain language.'),
        speed: z
          .number()
          .min(0.7)
          .max(1.4)
          .optional()
          .describe('Speech pacing multiplier between 0.7 and 1.4 (default 1.0).'),
        pitchRegister: z
          .enum(['deep', 'balanced', 'bright'])
          .optional()
          .describe('Vocal pitch register.'),
        emotionIntensity: z
          .enum(['subtle', 'natural', 'dramatic'])
          .optional()
          .describe('Expressiveness level.'),
      },
    },
    async ({
      text,
      voiceId,
      language = 'bilingual',
      stylePrompt,
      customVoiceDescription,
      speed = 1.0,
      pitchRegister = 'balanced',
      emotionIntensity = 'natural',
    }) => {
      const fallbackId = language === 'en' ? 'marcus' : 'aarav';
      const preset =
        VOICE_PRESETS.find((v) => v.id === (voiceId || fallbackId)) ?? VOICE_PRESETS[0];

      const result = await synthesizeSpeech({
        mode: 'single',
        language,
        modelTier: 'expressive',
        text,
        voiceName: preset.baseVoice,
        stylePrompt: stylePrompt ?? preset.defaultStyle,
        customVoiceDescription,
        speed,
        pitchRegister,
        emotionIntensity,
      });

      const fullAudioUrl = `${publicBaseUrl.replace(/\/$/, '')}${result.audioUrl}`;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'synthesized',
                clipId: result.clipId,
                audioUrl: fullAudioUrl,
                mimeType: result.mimeType,
                durationSeconds: result.durationEstimateSec,
                voiceUsed: customVoiceDescription
                  ? `Custom Voice (${preset.baseVoice})`
                  : `${preset.name} (${preset.roleTitle})`,
                modelUsed: result.modelUsed,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    'generate_dialogue',
    {
      title: 'Generate Multi-Speaker English/Hindi Dialogue',
      description:
        'Generate a two-speaker podcast or dialogue WAV audio clip in English, Hindi, or Hinglish with backchanneling (|yeah|, |mhm|) and vocal tags.',
      inputSchema: {
        speakerAName: z.string().default('Vikram').describe('Display name for Speaker A.'),
        speakerAVoiceId: z.string().default('vikram').describe('Voice ID for Speaker A.'),
        speakerAStyle: z
          .string()
          .default('Upbeat, conversational host')
          .describe('Delivery style for Speaker A.'),
        speakerBName: z.string().default('Ananya').describe('Display name for Speaker B.'),
        speakerBVoiceId: z.string().default('ananya').describe('Voice ID for Speaker B.'),
        speakerBStyle: z
          .string()
          .default('Warm, articulate co-host')
          .describe('Delivery style for Speaker B.'),
        language: z.enum(['en', 'hi', 'bilingual']).default('bilingual'),
        speed: z.number().min(0.7).max(1.4).default(1.0),
        turns: z
          .array(
            z.object({
              speaker: z.enum(['A', 'B']),
              text: z.string().min(1),
            })
          )
          .min(1)
          .describe('Ordered dialogue turns alternating between Speaker A and Speaker B.'),
      },
    },
    async ({
      speakerAName,
      speakerAVoiceId,
      speakerAStyle,
      speakerBName,
      speakerBVoiceId,
      speakerBStyle,
      language,
      speed,
      turns,
    }) => {
      const presetA = VOICE_PRESETS.find((v) => v.id === speakerAVoiceId) ?? VOICE_PRESETS[3];
      const presetB = VOICE_PRESETS.find((v) => v.id === speakerBVoiceId) ?? VOICE_PRESETS[1];

      const result = await synthesizeSpeech({
        mode: 'multi',
        language,
        modelTier: 'expressive',
        text: '',
        voiceName: presetA.baseVoice,
        stylePrompt: '',
        speed,
        speakers: {
          A: {
            name: speakerAName,
            voiceId: presetA.id,
            baseVoice: presetA.baseVoice,
            style: speakerAStyle,
          },
          B: {
            name: speakerBName,
            voiceId: presetB.id,
            baseVoice: presetB.baseVoice,
            style: speakerBStyle,
          },
        },
        dialogueLines: turns.map((turn, idx) => ({
          id: `mcp-turn-${idx + 1}`,
          speakerKey: turn.speaker,
          text: turn.text,
        })),
      });

      const fullAudioUrl = `${publicBaseUrl.replace(/\/$/, '')}${result.audioUrl}`;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'synthesized',
                clipId: result.clipId,
                audioUrl: fullAudioUrl,
                mimeType: result.mimeType,
                durationSeconds: result.durationEstimateSec,
                speakers: [speakerAName, speakerBName],
                modelUsed: result.modelUsed,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    'translate_tts_script',
    {
      title: 'Adapt Script Between English, Hindi & Hinglish',
      description:
        'Translate or adapt a voiceover script into Hindi (Devanagari), English, or Hinglish while preserving inline vocal tags like <breath> and <laugh>.',
      inputSchema: {
        text: z.string().min(1).describe('Source script text.'),
        targetLanguage: z
          .enum(['en', 'hi', 'bilingual'])
          .describe('Target script language: en (English), hi (Hindi Devanagari), or bilingual (Hinglish).'),
      },
    },
    async ({ text, targetLanguage }) => {
      const translatedText = await translateSpeechScript(text, targetLanguage);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ targetLanguage, translatedText }, null, 2),
          },
        ],
      };
    }
  );

  return server;
}
