import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  buildStyleInstruction,
  clampSpeed,
  countWordsAndChars,
  selectTtsModel,
  validateGeneratePayload,
} from '../utils/speechLogic';
import type { GenerateRequestPayload, GenerateResponsePayload } from '../types';

interface StoredClip {
  id: string;
  wavBuffer: Buffer;
  mimeType: string;
  createdAt: number;
}

const MAX_CLIPS = 50;
const clipStore = new Map<string, StoredClip>();

export function saveClip(wavBuffer: Buffer, mimeType = 'audio/wav'): string {
  const id = crypto.randomUUID().slice(0, 12);
  if (clipStore.size >= MAX_CLIPS) {
    const oldestKey = clipStore.keys().next().value;
    if (oldestKey) {
      clipStore.delete(oldestKey);
    }
  }
  clipStore.set(id, {
    id,
    wavBuffer,
    mimeType,
    createdAt: Date.now(),
  });
  return id;
}

export function getClip(id: string): StoredClip | undefined {
  return clipStore.get(id);
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
      message: 'Rate limit reached on the Gemini API. Please wait a moment and try again.',
    };
  }
  return { status: status >= 400 && status < 600 ? status : 500, message: rawMessage };
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
  const language = payload.language || 'en';
  const modelTier = payload.modelTier === 'expressive' ? 'expressive' : 'standard';
  const speed = clampSpeed(typeof payload.speed === 'number' ? payload.speed : 1.0);
  const pitchRegister = payload.pitchRegister || 'balanced';
  const emotionIntensity = payload.emotionIntensity || 'natural';

  const modelUsed = selectTtsModel({
    mode,
    modelTier,
    text: payload.text || '',
    customVoiceDescription: payload.customVoiceDescription,
    dialogueLines: payload.dialogueLines,
  });

  const ai = getGeminiClient();

  let response;
  let totalWordText = payload.text || '';

  if (mode === 'multi' && payload.speakers && payload.dialogueLines) {
    const { A, B } = payload.speakers;
    const nonEmptyLines = payload.dialogueLines.filter((l) => l.text.trim().length > 0);
    totalWordText = nonEmptyLines.map((l) => l.text).join(' ');

    const parts = nonEmptyLines.map((line) => {
      const speaker = line.speakerKey === 'A' ? A : B;
      const speakerStyle = buildStyleInstruction({
        language,
        stylePrompt: speaker.style || 'Natural conversational dialogue',
        speed,
        pitchRegister,
        emotionIntensity,
      });
      return {
        text: `${speaker.name}: ${line.text.trim()}`,
        speechMetadata: {
          speaker: speaker.name,
          style: speakerStyle,
        },
      };
    });

    response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: A.name,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: A.baseVoice || 'Puck' },
                },
              },
              {
                speaker: B.name,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: B.baseVoice || 'Kore' },
                },
              },
            ],
          },
        },
      },
    });
  } else {
    const styleInstruction = buildStyleInstruction({
      language,
      stylePrompt: payload.stylePrompt || '',
      customVoiceDescription: payload.customVoiceDescription,
      speed,
      pitchRegister,
      emotionIntensity,
    });

    response = await ai.models.generateContent({
      model: modelUsed,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: (payload.text || '').trim(),
              speechMetadata: {
                style: styleInstruction || 'Natural, clear voice delivery',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: payload.voiceName || 'Kore' },
          },
        },
      },
    });
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

  const wavBytes = Buffer.from(base64Audio, 'base64');
  const mimeType = audioPart?.inlineData?.mimeType || 'audio/wav';
  const clipId = saveClip(wavBytes, mimeType);
  const measuredSec =
    wavBytes.length > 44
      ? Math.max(1, Math.round((wavBytes.length - 44) / 48000))
      : countWordsAndChars(totalWordText).estimatedSeconds;

  return {
    clipId,
    audioUrl: `/api/clips/${clipId}.wav`,
    audioBase64: base64Audio,
    mimeType,
    modelUsed,
    durationEstimateSec: measuredSec,
  };
}

export async function translateSpeechScript(
  text: string,
  targetLanguage: 'en' | 'hi' | 'bilingual'
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

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Translate or adapt the following voiceover script into ${targetDesc}. Preserve any inline vocal tags like <breath>, <laugh>, <chuckle>, <sigh>, <gasp>, |yeah|, |mhm| exactly as written in English angle brackets or pipes. Return ONLY the adapted script text with no commentary or quotes.\n\nScript:\n${text.trim()}`,
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
