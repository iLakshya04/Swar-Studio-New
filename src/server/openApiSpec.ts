import { SVARA_MCP_VERSION } from '../mcp/createSvaraMcpServer';

export function buildAiPluginManifest(baseUrl: string) {
  const origin = baseUrl.replace(/\/$/, '');
  return {
    schema_version: 'v1',
    name_for_human: 'Svara Studio',
    name_for_model: 'svara_studio',
    description_for_human:
      'Bilingual English, Hindi & Hinglish AI Speech Studio with 48 kHz WAV mastering, forced-aligned word timings, and word-level .SRT / .VTT / .ASS subtitles.',
    description_for_model:
      'Synthesize English, Hindi (हिन्दी), and Hinglish single-voice or multi-speaker dialogue speech as 48 kHz WAV/MP3/M4A/FLAC files, retrieve forced-aligned wordTimings (startMs, endMs), generate phrase or word-level .SRT/.VTT/.ASS subtitles, manage custom pronunciation guides and voice presets, localize scripts, transcribe/dub/time-stretch/replace audio segments, and organize narration projects.',
    auth: {
      type: 'none',
    },
    api: {
      type: 'openapi',
      url: `${origin}/openapi.json`,
      is_user_authenticated: false,
    },
    logo_url: `${origin}/favicon.ico`,
    contact_email: 'support@svarastudio.local',
    legal_info_url: `${origin}/`,
  };
}

export function buildOpenApiSpec(baseUrl: string) {
  const origin = baseUrl.replace(/\/$/, '');
  return {
    openapi: '3.1.0',
    info: {
      title: 'Svara Studio Speech & Subtitle Production API',
      version: SVARA_MCP_VERSION,
      description:
        'Full REST / ChatGPT Plugin / Custom Actions API exposing all Svara Studio TTS, multi-speaker dialogue, word-level timing offsets (startMs/endMs), word-level .SRT/.VTT/.ASS caption generation, localization, pronunciation dictionary, voice presets, and audio editing tools.',
    },
    servers: [{ url: origin, description: 'Svara Studio Server' }],
    paths: {
      '/api/voices': {
        get: {
          operationId: 'listVoices',
          summary: 'List English, Hindi, and bilingual voice personas',
          parameters: [
            { name: 'language', in: 'query', schema: { type: 'string', enum: ['All', 'English', 'Hindi', 'Bilingual'] } },
            { name: 'category', in: 'query', schema: { type: 'string' } },
            { name: 'query', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Filtered voice persona catalog' },
          },
        },
      },
      '/api/tts/generate': {
        post: {
          operationId: 'generateSpeech',
          summary: 'Generate English, Hindi, or multi-speaker speech with wordTimings (startMs, endMs) and optional word-level SRT',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mode: { type: 'string', enum: ['single', 'multi'], default: 'single' },
                    language: { type: 'string', enum: ['en', 'hi', 'bilingual'], default: 'en' },
                    modelTier: { type: 'string', enum: ['standard', 'expressive', 'keyless'], default: 'standard' },
                    text: { type: 'string' },
                    voiceId: { type: 'string' },
                    voiceName: { type: 'string', enum: ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'] },
                    stylePrompt: { type: 'string' },
                    customVoiceDescription: { type: 'string' },
                    speed: { type: 'number', minimum: 0.7, maximum: 1.4, default: 1.0 },
                    pitchRegister: { type: 'string', enum: ['deep', 'balanced', 'bright'] },
                    emotionIntensity: { type: 'string', enum: ['subtle', 'natural', 'dramatic'] },
                    format: { type: 'string', enum: ['wav', 'mp3', 'm4a', 'flac'], default: 'wav' },
                    sampleRate: { type: 'integer', enum: [24000, 44100, 48000], default: 48000 },
                    channels: { type: 'integer', enum: [1, 2], default: 1 },
                    normalize: { type: 'boolean', default: true },
                    trimSilence: { type: 'boolean', default: true },
                    masteringPreset: {
                      type: 'string',
                      enum: ['none', 'youtube_narration', 'instagram_reel', 'podcast', 'audiobook'],
                    },
                    targetDurationSeconds: { type: 'number' },
                    segmentMode: { type: 'boolean' },
                    includeWordLevelSrt: {
                      type: 'boolean',
                      default: false,
                      description: 'When true, includes inline word-level .SRT in response.wordSrt.',
                    },
                    dialogueLines: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          speakerKey: { type: 'string' },
                          text: { type: 'string' },
                          emotion: { type: 'string' },
                        },
                      },
                    },
                    projectId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Synthesized audio clip with clipId, audioUrl, downloadUrl, wordSrtUrl, wordTimings (startMs/endMs), and waveformPeaks.',
            },
          },
        },
      },
      '/api/tts/segments/regenerate': {
        post: {
          operationId: 'regenerateSegment',
          summary: 'Regenerate a single sentence segment in an existing clip and re-stitch master WAV',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['clipId', 'segmentIndex'],
                  properties: {
                    clipId: { type: 'string' },
                    segmentIndex: { type: 'integer', minimum: 0 },
                    text: { type: 'string' },
                    emotion: { type: 'string' },
                    voiceId: { type: 'string' },
                    stylePrompt: { type: 'string' },
                    speed: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Updated clip with regenerated segment' } },
        },
      },
      '/api/clips': {
        get: {
          operationId: 'listClips',
          summary: 'List recently generated audio clips',
          responses: { '200': { description: 'Recent clip metadata list' } },
        },
      },
      '/api/clips/{id}': {
        get: {
          operationId: 'getClip',
          summary: 'Retrieve clip audio URLs, wordTimings (startMs/endMs), wordSrtUrl, and waveformPeaks',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Saved clip metadata and timing offsets' } },
        },
      },
      '/api/clips/{id}/subtitles/{format}': {
        get: {
          operationId: 'getClipSubtitles',
          summary: 'Download phrase-level or word-level .SRT, .VTT, .ASS, or JSON subtitles for a clip',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'format', in: 'path', required: true, schema: { type: 'string', enum: ['srt', 'vtt', 'ass', 'json'] } },
            { name: 'granularity', in: 'query', schema: { type: 'string', enum: ['phrase', 'word'], default: 'phrase' } },
            { name: 'wordLevel', in: 'query', schema: { type: 'boolean' } },
            { name: 'preset', in: 'query', schema: { type: 'string', enum: ['rainbow_reels', 'clean_editorial'] } },
            { name: 'maxLines', in: 'query', schema: { type: 'integer', enum: [1, 2, 3] } },
            { name: 'maxCharsPerLine', in: 'query', schema: { type: 'integer' } },
            { name: 'maxDurationSeconds', in: 'query', schema: { type: 'number' } },
            { name: 'download', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: { '200': { description: 'Formatted subtitle file content' } },
        },
      },
      '/api/subtitles': {
        post: {
          operationId: 'generateSubtitles',
          summary: 'Generate phrase-level or word-level .SRT, .VTT, .ASS, or JSON subtitles from clipId or wordTimings',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    clipId: { type: 'string' },
                    wordTimings: { type: 'array', items: { type: 'object' } },
                    format: { type: 'string', enum: ['srt', 'vtt', 'ass', 'json'], default: 'srt' },
                    granularity: { type: 'string', enum: ['phrase', 'word'], default: 'phrase' },
                    wordLevel: { type: 'boolean', default: false },
                    preset: { type: 'string', enum: ['rainbow_reels', 'clean_editorial'], default: 'rainbow_reels' },
                    maxLines: { type: 'integer', enum: [1, 2, 3] },
                    maxCharsPerLine: { type: 'integer' },
                    maxPhraseDurationMs: { type: 'integer' },
                    maxDurationSeconds: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Generated subtitle content' } },
        },
      },
      '/api/script/translate': {
        post: {
          operationId: 'translateScript',
          summary: 'Translate or adapt a TTS script between English, Hindi, and Hinglish while keeping performance tags',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['text'],
                  properties: {
                    text: { type: 'string' },
                    targetLanguage: { type: 'string', enum: ['en', 'hi', 'bilingual'], default: 'hi' },
                    preserveDuration: { type: 'boolean', default: false },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Translated script' } },
        },
      },
      '/api/script/localize': {
        post: {
          operationId: 'localizeNarration',
          summary: 'Localize narration into Hindi/Hinglish/English audio clips with synchronized word timings and SRTs',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['text', 'targetLanguages'],
                  properties: {
                    text: { type: 'string' },
                    targetLanguages: { type: 'array', items: { type: 'string', enum: ['en', 'hi', 'bilingual'] } },
                    voiceId: { type: 'string' },
                    preserveDuration: { type: 'boolean', default: true },
                    targetDurationSeconds: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Localized audio clips and SRT files' } },
        },
      },
      '/api/audio/transcribe': {
        post: {
          operationId: 'transcribeAudio',
          summary: 'Transcribe a clipId, audioUrl, or base64 audio into English/Hindi text',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    clipId: { type: 'string' },
                    audioUrl: { type: 'string' },
                    audioBase64: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Transcript text' } },
        },
      },
      '/api/audio/analyze-voice': {
        post: {
          operationId: 'analyzeVoice',
          summary: 'Analyze timbre, cadence, and WPM from an audio sample and recommend a matching Svara voice',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    clipId: { type: 'string' },
                    audioUrl: { type: 'string' },
                    audioBase64: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Voice analysis and recommended voiceId' } },
        },
      },
      '/api/audio/match-duration': {
        post: {
          operationId: 'matchAudioDuration',
          summary: 'Time-stretch a clip or audio input to exact targetDurationSeconds without pitch distortion',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['targetDurationSeconds'],
                  properties: {
                    clipId: { type: 'string' },
                    audioUrl: { type: 'string' },
                    audioBase64: { type: 'string' },
                    targetDurationSeconds: { type: 'number' },
                    sampleRate: { type: 'integer', enum: [24000, 44100, 48000] },
                    channels: { type: 'integer', enum: [1, 2] },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Duration-matched audio clip' } },
        },
      },
      '/api/audio/replace-segment': {
        post: {
          operationId: 'replaceAudioSegment',
          summary: 'Replace a [startMs..endMs] span in an audio clip with newly synthesized replacementText',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['startMs', 'endMs', 'replacementText'],
                  properties: {
                    clipId: { type: 'string' },
                    audioUrl: { type: 'string' },
                    audioBase64: { type: 'string' },
                    startMs: { type: 'integer' },
                    endMs: { type: 'integer' },
                    replacementText: { type: 'string' },
                    voiceId: { type: 'string' },
                    language: { type: 'string', enum: ['en', 'hi', 'bilingual'] },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Updated audio clip with spliced replacement' } },
        },
      },
      '/api/pronunciations': {
        get: {
          operationId: 'listPronunciations',
          summary: 'List custom English and Hindi phonetic/IPA pronunciation rules',
          responses: { '200': { description: 'Pronunciation dictionary entries' } },
        },
        post: {
          operationId: 'upsertPronunciation',
          summary: 'Add or update a custom phonetic/IPA pronunciation rule',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['term', 'phonetic'],
                  properties: {
                    id: { type: 'string' },
                    term: { type: 'string' },
                    phonetic: { type: 'string' },
                    ipa: { type: 'string' },
                    language: { type: 'string', enum: ['en', 'hi', 'bilingual'] },
                    notes: { type: 'string' },
                    enabled: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Saved pronunciation entry' } },
        },
      },
      '/api/pronunciations/{id}': {
        delete: {
          operationId: 'deletePronunciation',
          summary: 'Delete a pronunciation rule by ID or term',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Deletion confirmation' } },
        },
      },
      '/api/presets': {
        get: {
          operationId: 'listVoicePresets',
          summary: 'List saved reusable voice & mastering presets',
          responses: { '200': { description: 'Voice presets list' } },
        },
        post: {
          operationId: 'upsertVoicePreset',
          summary: 'Create or update a reusable voice & mastering preset',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'voiceId'],
                  properties: {
                    name: { type: 'string' },
                    voiceId: { type: 'string' },
                    language: { type: 'string', enum: ['en', 'hi', 'bilingual'] },
                    stylePrompt: { type: 'string' },
                    speed: { type: 'number' },
                    masteringPreset: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Saved preset' } },
        },
      },
      '/api/presets/{id}': {
        delete: {
          operationId: 'deleteVoicePreset',
          summary: 'Delete a saved voice preset by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Deletion confirmation' } },
        },
      },
      '/api/projects': {
        get: {
          operationId: 'listProjects',
          summary: 'List saved narration projects',
          responses: { '200': { description: 'Projects list' } },
        },
        post: {
          operationId: 'createProject',
          summary: 'Create a named multi-clip narration project',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    defaultVoicePresetId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Created project' } },
        },
      },
      '/api/projects/{id}': {
        get: {
          operationId: 'getProject',
          summary: 'Inspect a project and its ordered clips',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Project details' } },
        },
      },
      '/api/projects/{id}/clips': {
        post: {
          operationId: 'addClipToProject',
          summary: 'Attach an existing clipId to a narration project',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['clipId'],
                  properties: {
                    clipId: { type: 'string' },
                    title: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Updated project' } },
        },
      },
      '/api/projects/{id}/clips/{clipId}': {
        patch: {
          operationId: 'updateProjectClip',
          summary: 'Update title, text, or order of a clip inside a project',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'clipId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    text: { type: 'string' },
                    order: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Updated project' } },
        },
        delete: {
          operationId: 'deleteProjectClip',
          summary: 'Remove a clip from a project',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'clipId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Updated project' } },
        },
      },
      '/api/projects/{id}/export': {
        get: {
          operationId: 'exportProject',
          summary: 'Export project manifest with audio download URLs, phrase SRT, word-level SRT, and Rainbow Reels ASS URLs',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Exported project manifest' } },
        },
      },
    },
  };
}
