// server.ts
import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// src/mcp/createSvaraMcpServer.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// src/data/voices.ts
var VOICE_PRESETS = [
  {
    id: "aarav",
    name: "Aarav",
    roleTitle: "Kahani Storyteller",
    baseVoice: "Puck",
    language: "Hindi",
    category: "Narration",
    gender: "Male",
    accent: "Standard Hindi",
    description: "Warm, grounded Hindi narrator suited for audiobooks, folklore, and cultural storytelling.",
    defaultStyle: "Warm, engaging Hindi storyteller with natural pauses",
    sampleText: "\u0938\u0930\u094D\u0926\u093F\u092F\u094B\u0902 \u0915\u0940 \u0935\u0939 \u0936\u093E\u092E \u092C\u0939\u0941\u0924 \u0936\u093E\u0902\u0924 \u0925\u0940, <breath> \u091C\u092C \u092A\u0941\u0930\u093E\u0928\u0947 \u0930\u0947\u0932\u0935\u0947 \u0938\u094D\u091F\u0947\u0936\u0928 \u092A\u0930 \u0906\u0916\u093F\u0930\u0940 \u0917\u093E\u0921\u093C\u0940 \u0906\u0915\u0930 \u0930\u0941\u0915\u0940\u0964",
    sampleLanguage: "hi",
    portraitUrl: "/src/assets/images/voice_hindi_podcaster_1794826141541.jpg"
  },
  {
    id: "ananya",
    name: "Ananya",
    roleTitle: "Meditation Guide",
    baseVoice: "Zephyr",
    language: "Bilingual",
    category: "Wellness",
    gender: "Female",
    accent: "Indian English & Hindi",
    description: "Airy, soothing bilingual guide for mindfulness sessions, breathing exercises, and sleep stories.",
    defaultStyle: "Airy, soothing, unhurried wellness guide",
    sampleText: "\u090F\u0915 \u0917\u0939\u0930\u0940 \u0938\u093E\u0902\u0938 \u0932\u0947\u0902, <breath> \u0914\u0930 \u0905\u092A\u0928\u0947 \u0915\u0902\u0927\u094B\u0902 \u0915\u094B \u0922\u0940\u0932\u093E \u091B\u094B\u0921\u093C \u0926\u0947\u0902\u0964 Let the tension melt away.",
    sampleLanguage: "bilingual",
    portraitUrl: "/src/assets/images/voice_wellness_guide_1794826141052.jpg"
  },
  {
    id: "meera",
    name: "Meera",
    roleTitle: "Samachar Anchor",
    baseVoice: "Kore",
    language: "Hindi",
    category: "News & Anchor",
    gender: "Female",
    accent: "Broadcast Hindi",
    description: "Crisp, authoritative newsroom anchor delivering Hindi bulletins and factual explainers with clarity.",
    defaultStyle: "Clear, authoritative Hindi broadcast news anchor",
    sampleText: "\u0928\u092E\u0938\u094D\u0915\u093E\u0930, \u092E\u0941\u0916\u094D\u092F \u0938\u092E\u093E\u091A\u093E\u0930\u094B\u0902 \u092E\u0947\u0902 \u0906\u092A\u0915\u093E \u0938\u094D\u0935\u093E\u0917\u0924 \u0939\u0948\u0964 \u0906\u091C \u0935\u093F\u091C\u094D\u091E\u093E\u0928 \u0914\u0930 \u0924\u0915\u0928\u0940\u0915 \u0915\u0947 \u0915\u094D\u0937\u0947\u0924\u094D\u0930 \u092E\u0947\u0902 \u090F\u0915 \u092C\u0921\u093C\u0940 \u0918\u094B\u0937\u0923\u093E \u0939\u0941\u0908 \u0939\u0948\u0964",
    sampleLanguage: "hi",
    portraitUrl: "/src/assets/images/voice_broadcast_anchor_1794826142499.jpg"
  },
  {
    id: "vikram",
    name: "Vikram",
    roleTitle: "Mumbai Podcaster",
    baseVoice: "Puck",
    language: "Bilingual",
    category: "Conversational",
    gender: "Male",
    accent: "Hinglish Urban",
    description: "Conversational, upbeat host built for Hinglish podcasts, creator reels, and product explainers.",
    defaultStyle: "Upbeat, conversational bilingual podcast host",
    sampleText: "Hey everyone, \u0906\u091C \u0915\u0947 episode \u092E\u0947\u0902 \u0939\u092E \u092C\u093E\u0924 \u0915\u0930\u0947\u0902\u0917\u0947 AI voice tech \u0915\u0947 \u092C\u093E\u0930\u0947 \u092E\u0947\u0902\u2014it is seriously wild! <chuckle>",
    sampleLanguage: "bilingual",
    portraitUrl: "/src/assets/images/voice_hindi_podcaster_1794826141541.jpg"
  },
  {
    id: "marcus",
    name: "Marcus",
    roleTitle: "Grizzled Detective",
    baseVoice: "Charon",
    language: "English",
    category: "Characters",
    gender: "Male",
    accent: "American Noir",
    description: "Low, gravelly noir character voice for crime thrillers, interactive fiction, and dramatic trailers.",
    defaultStyle: "Low, gravelly, world-weary noir detective",
    sampleText: "The neon sign flickered outside my office window. <sigh> Another midnight call I knew better than to answer.",
    sampleLanguage: "en",
    portraitUrl: "/src/assets/images/voice_noir_narrator_1794826140228.jpg"
  },
  {
    id: "clara",
    name: "Clara",
    roleTitle: "Regal Monarch",
    baseVoice: "Kore",
    language: "English",
    category: "Characters",
    gender: "Female",
    accent: "Classic RP",
    description: "Poised, commanding voice ideal for historical documentaries, fantasy lore, and museum audio tours.",
    defaultStyle: "Poised, commanding, dignified orator",
    sampleText: "History remembers not the crowns we wore, but the courage we summoned when the horizon grew dark.",
    sampleLanguage: "en",
    portraitUrl: "/src/assets/images/voice_broadcast_anchor_1794826142499.jpg"
  },
  {
    id: "devon",
    name: "Devon",
    roleTitle: "Hype Announcer",
    baseVoice: "Fenrir",
    language: "English",
    category: "Characters",
    gender: "Male",
    accent: "American Arena",
    description: "Booming arena energy for sports intros, esports tournaments, and high-impact promo spots.",
    defaultStyle: "Booming, high-energy arena announcer",
    sampleText: "Ladies and gentlemen, <breath> welcome to the main event! Five seconds on the clock\u2014are you ready?",
    sampleLanguage: "en",
    portraitUrl: "/src/assets/images/voice_noir_narrator_1794826140228.jpg"
  },
  {
    id: "julian",
    name: "Julian",
    roleTitle: "Late-Night DJ",
    baseVoice: "Charon",
    language: "English",
    category: "Conversational",
    gender: "Male",
    accent: "Warm Baritone",
    description: "Smooth, velvety late-night FM radio host for intimate essays, music intros, and lounge spots.",
    defaultStyle: "Smooth, velvety, unhurried late-night radio DJ",
    sampleText: "You are tuned into Midnight Frequency. <sigh> Pour yourself a warm cup and stay with us till dawn.",
    sampleLanguage: "en",
    portraitUrl: "/src/assets/images/voice_noir_narrator_1794826140228.jpg"
  },
  {
    id: "riya",
    name: "Riya",
    roleTitle: "Cheeky Sidekick",
    baseVoice: "Zephyr",
    language: "Bilingual",
    category: "Conversational",
    gender: "Female",
    accent: "Urban Bilingual",
    description: "Bright, playful delivery for indie games, interactive tutors, and lively bilingual explainers.",
    defaultStyle: "Bright, playful, expressive sidekick",
    sampleText: "Wait, seriously? <laugh> \u0924\u0941\u092E\u0928\u0947 \u0938\u091A \u092E\u0947\u0902 \u092A\u0942\u0930\u093E script \u092A\u093E\u0902\u091A \u092E\u093F\u0928\u091F \u092E\u0947\u0902 \u0932\u093F\u0916 \u0926\u093F\u092F\u093E? Let us hear it!",
    sampleLanguage: "bilingual",
    portraitUrl: "/src/assets/images/voice_wellness_guide_1794826141052.jpg"
  },
  {
    id: "kabir",
    name: "Kabir",
    roleTitle: "Documentary Host",
    baseVoice: "Fenrir",
    language: "Bilingual",
    category: "Narration",
    gender: "Male",
    accent: "Crisp Indian Neutral",
    description: "Measured, resonant narrator for science explainers, corporate films, and bilingual e-learning.",
    defaultStyle: "Crisp, measured, insightful documentary narrator",
    sampleText: "\u0939\u093F\u092E\u093E\u0932\u092F \u0915\u0940 \u090A\u0902\u091A\u093E\u0907\u092F\u094B\u0902 \u0938\u0947 \u0932\u0947\u0915\u0930 \u0926\u0915\u094D\u0937\u093F\u0923 \u0915\u0947 \u0924\u091F\u094B\u0902 \u0924\u0915, \u092D\u093E\u0930\u0924 \u0915\u0940 \u0928\u0926\u093F\u092F\u093E\u0901 \u0938\u0926\u093F\u092F\u094B\u0902 \u0915\u0940 \u0915\u0939\u093E\u0928\u093F\u092F\u093E\u0901 \u0938\u092E\u0947\u091F\u0947 \u0939\u0941\u090F \u0939\u0948\u0902\u0964",
    sampleLanguage: "hi",
    portraitUrl: "/src/assets/images/voice_hindi_podcaster_1794826141541.jpg"
  }
];

// src/utils/speechLogic.ts
var VOCAL_TAG_REGEX = /(<[a-z]+>|\|[a-z]+\|)/i;
function countWordsAndChars(text) {
  const chars = text.length;
  const plainText = text.replace(/<[^>]+>/g, " ").replace(/\|[^|]+\|/g, " ").trim();
  if (!plainText) {
    return { chars, words: 0, estimatedSeconds: 0 };
  }
  const words = plainText.split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.max(1, Math.round(words / 140 * 60));
  return { chars, words, estimatedSeconds };
}
function filterVoices(voices, query, languageFilter, categoryFilter) {
  const normalizedQuery = query.trim().toLowerCase();
  return voices.filter((voice) => {
    const matchesLang = languageFilter === "All" || voice.language === languageFilter || languageFilter !== "Bilingual" && voice.language === "Bilingual";
    const matchesCategory = categoryFilter === "All" || voice.category === categoryFilter;
    if (!matchesLang || !matchesCategory) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const haystack = [
      voice.name,
      voice.roleTitle,
      voice.description,
      voice.accent,
      voice.category,
      voice.language
    ].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}
function selectTtsModel(params) {
  if (params.mode === "multi" || params.modelTier === "expressive") {
    return "gemini-3.8-flash-tts";
  }
  if (params.customVoiceDescription && params.customVoiceDescription.trim().length > 0) {
    return "gemini-3.8-flash-tts";
  }
  if (VOCAL_TAG_REGEX.test(params.text)) {
    return "gemini-3.8-flash-tts";
  }
  if (params.dialogueLines?.some((line) => VOCAL_TAG_REGEX.test(line.text))) {
    return "gemini-3.8-flash-tts";
  }
  return "gemini-3.8-flash-lite-tts";
}
function clampSpeed(speed) {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(1.4, Math.max(0.7, Math.round(speed * 20) / 20));
}
function buildStyleInstruction(params) {
  const parts = [];
  if (params.customVoiceDescription && params.customVoiceDescription.trim()) {
    parts.push(`Voice persona: ${params.customVoiceDescription.trim()}`);
  }
  if (params.stylePrompt.trim()) {
    parts.push(`Delivery style: ${params.stylePrompt.trim()}`);
  }
  if (params.pitchRegister === "deep") {
    parts.push("Rich, grounded lower vocal register");
  } else if (params.pitchRegister === "bright") {
    parts.push("Crisp, lifted higher vocal register");
  }
  if (params.emotionIntensity === "subtle") {
    parts.push("restrained, understated emotional tone");
  } else if (params.emotionIntensity === "dramatic") {
    parts.push("highly expressive, theatrical emotional inflection");
  }
  if (params.language === "hi") {
    parts.push("Speak with authentic, natural Hindi pronunciation and cadence");
  } else if (params.language === "bilingual") {
    parts.push(
      "Speak naturally across Hindi and English with seamless bilingual pronunciation and code-switching"
    );
  } else {
    parts.push("Speak with natural, clear English articulation");
  }
  const normalizedSpeed = clampSpeed(params.speed);
  if (normalizedSpeed <= 0.8) {
    parts.push("unhurried, deliberate slow pacing");
  } else if (normalizedSpeed <= 0.9) {
    parts.push("relaxed, measured pacing");
  } else if (normalizedSpeed >= 1.25) {
    parts.push("brisk, energetic fast pacing");
  } else if (normalizedSpeed >= 1.1) {
    parts.push("slightly upbeat pacing");
  }
  return parts.join(". ");
}
function validateGeneratePayload(payload) {
  if (payload.mode === "multi") {
    const lines = payload.dialogueLines ?? [];
    const nonEmptyLines = lines.filter((line) => line.text.trim().length > 0);
    if (nonEmptyLines.length === 0) {
      return {
        valid: false,
        error: "Enter at least one non-empty dialogue line before generating audio."
      };
    }
    const totalLength = nonEmptyLines.reduce((acc, line) => acc + line.text.length, 0);
    if (totalLength > 4e3) {
      return {
        valid: false,
        error: "Dialogue script exceeds the 4,000-character limit."
      };
    }
    if (!payload.speakers?.A?.name?.trim() || !payload.speakers?.B?.name?.trim()) {
      return {
        valid: false,
        error: "Both Speaker A and Speaker B must have display names."
      };
    }
    return { valid: true };
  }
  const text = (payload.text ?? "").trim();
  if (!text) {
    return {
      valid: false,
      error: "Enter a script in English or Hindi before generating speech."
    };
  }
  if (text.length > 4e3) {
    return {
      valid: false,
      error: "Script exceeds the 4,000-character limit."
    };
  }
  return { valid: true };
}

// src/server/ttsService.ts
import crypto from "node:crypto";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
var MAX_CLIPS = 50;
var clipStore = /* @__PURE__ */ new Map();
function saveClip(wavBuffer, mimeType = "audio/wav") {
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
    createdAt: Date.now()
  });
  return id;
}
function getClip(id) {
  return clipStore.get(id);
}
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please add your API key in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: "v1beta",
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function mapApiError(error) {
  const errObj = error;
  const rawMessage = errObj?.message || "An unexpected speech synthesis error occurred.";
  const status = typeof errObj?.status === "number" ? errObj.status : typeof errObj?.code === "number" ? errObj.code : 500;
  if (rawMessage.includes("GEMINI_API_KEY")) {
    return { status: 400, message: rawMessage };
  }
  if (status === 403 || rawMessage.includes("PERMISSION_DENIED") || rawMessage.includes("API_KEY_INVALID")) {
    return {
      status: 403,
      message: "Gemini API authentication failed. Please verify your key in Settings > Secrets."
    };
  }
  if (status === 429 || rawMessage.includes("RESOURCE_EXHAUSTED")) {
    return {
      status: 429,
      message: "Rate limit reached on the Gemini API. Please wait a moment and try again."
    };
  }
  return { status: status >= 400 && status < 600 ? status : 500, message: rawMessage };
}
async function synthesizeSpeech(payload) {
  const validation = validateGeneratePayload(payload);
  if (!validation.valid) {
    const err = new Error(validation.error || "Invalid synthesis payload.");
    err.status = 400;
    throw err;
  }
  const mode = payload.mode === "multi" ? "multi" : "single";
  const language = payload.language || "en";
  const modelTier = payload.modelTier === "expressive" ? "expressive" : "standard";
  const speed = clampSpeed(typeof payload.speed === "number" ? payload.speed : 1);
  const pitchRegister = payload.pitchRegister || "balanced";
  const emotionIntensity = payload.emotionIntensity || "natural";
  const modelUsed = selectTtsModel({
    mode,
    modelTier,
    text: payload.text || "",
    customVoiceDescription: payload.customVoiceDescription,
    dialogueLines: payload.dialogueLines
  });
  const ai = getGeminiClient();
  let response;
  let totalWordText = payload.text || "";
  if (mode === "multi" && payload.speakers && payload.dialogueLines) {
    const { A, B } = payload.speakers;
    const nonEmptyLines = payload.dialogueLines.filter((l) => l.text.trim().length > 0);
    totalWordText = nonEmptyLines.map((l) => l.text).join(" ");
    const parts2 = nonEmptyLines.map((line) => {
      const speaker = line.speakerKey === "A" ? A : B;
      const speakerStyle = buildStyleInstruction({
        language,
        stylePrompt: speaker.style || "Natural conversational dialogue",
        speed,
        pitchRegister,
        emotionIntensity
      });
      return {
        text: `${speaker.name}: ${line.text.trim()}`,
        speechMetadata: {
          speaker: speaker.name,
          style: speakerStyle
        }
      };
    });
    response = await ai.models.generateContent({
      model: "gemini-3.8-flash-tts",
      contents: [
        {
          role: "user",
          parts: parts2
        }
      ],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: A.name,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: A.baseVoice || "Puck" }
                }
              },
              {
                speaker: B.name,
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: B.baseVoice || "Kore" }
                }
              }
            ]
          }
        }
      }
    });
  } else {
    const styleInstruction = buildStyleInstruction({
      language,
      stylePrompt: payload.stylePrompt || "",
      customVoiceDescription: payload.customVoiceDescription,
      speed,
      pitchRegister,
      emotionIntensity
    });
    response = await ai.models.generateContent({
      model: modelUsed,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: (payload.text || "").trim(),
              speechMetadata: {
                style: styleInstruction || "Natural, clear voice delivery"
              }
            }
          ]
        }
      ],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: payload.voiceName || "Kore" }
          }
        }
      }
    });
  }
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const audioPart = parts.find((p) => p.inlineData?.data);
  const base64Audio = audioPart?.inlineData?.data;
  if (!base64Audio) {
    const err = new Error(
      "The speech model did not return audio data. Try simplifying the script or style prompt."
    );
    err.status = 502;
    throw err;
  }
  const wavBytes = Buffer.from(base64Audio, "base64");
  const mimeType = audioPart?.inlineData?.mimeType || "audio/wav";
  const clipId = saveClip(wavBytes, mimeType);
  const measuredSec = wavBytes.length > 44 ? Math.max(1, Math.round((wavBytes.length - 44) / 48e3)) : countWordsAndChars(totalWordText).estimatedSeconds;
  return {
    clipId,
    audioUrl: `/api/clips/${clipId}.wav`,
    audioBase64: base64Audio,
    mimeType,
    modelUsed,
    durationEstimateSec: measuredSec
  };
}
async function translateSpeechScript(text, targetLanguage) {
  if (!text || !text.trim()) {
    const err = new Error("Enter text to translate or adapt.");
    err.status = 400;
    throw err;
  }
  const ai = getGeminiClient();
  const targetDesc = targetLanguage === "hi" ? "natural, spoken Hindi in Devanagari script (\u0939\u093F\u0928\u094D\u0926\u0940)" : targetLanguage === "bilingual" ? "natural urban Hinglish (blending Hindi in Devanagari with conversational English phrases where natural)" : "natural, expressive English";
  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `Translate or adapt the following voiceover script into ${targetDesc}. Preserve any inline vocal tags like <breath>, <laugh>, <chuckle>, <sigh>, <gasp>, |yeah|, |mhm| exactly as written in English angle brackets or pipes. Return ONLY the adapted script text with no commentary or quotes.

Script:
${text.trim()}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
    }
  });
  const translatedText = (response.text ?? "").trim();
  if (!translatedText) {
    const err = new Error("Translation returned empty output. Please try again.");
    err.status = 502;
    throw err;
  }
  return translatedText;
}

// src/mcp/createSvaraMcpServer.ts
function createSvaraMcpServer(publicBaseUrl) {
  const server = new McpServer({
    name: "svara-studio",
    version: "1.0.0"
  });
  server.registerResource(
    "voice-catalog",
    "svara://voices",
    {
      title: "Svara Studio Voice Catalog",
      description: "Complete list of English, Hindi, and bilingual voice personas available for speech synthesis.",
      mimeType: "application/json"
    },
    async () => ({
      contents: [
        {
          uri: "svara://voices",
          mimeType: "application/json",
          text: JSON.stringify(
            VOICE_PRESETS.map((v) => ({
              id: v.id,
              name: v.name,
              roleTitle: v.roleTitle,
              language: v.language,
              category: v.category,
              accent: v.accent,
              defaultStyle: v.defaultStyle,
              description: v.description
            })),
            null,
            2
          )
        }
      ]
    })
  );
  server.registerTool(
    "list_voices",
    {
      title: "List English & Hindi Voices",
      description: "List available Svara Studio voice personas for English, Hindi (\u0939\u093F\u0928\u094D\u0926\u0940), and Bilingual Hinglish text-to-speech.",
      inputSchema: {
        language: z.enum(["All", "English", "Hindi", "Bilingual"]).optional().describe("Filter voices by language support."),
        category: z.enum(["All", "Narration", "Conversational", "Characters", "News & Anchor", "Wellness"]).optional().describe("Filter voices by category."),
        query: z.string().optional().describe("Optional keyword search query.")
      }
    },
    async ({ language = "All", category = "All", query = "" }) => {
      const voices = filterVoices(VOICE_PRESETS, query, language, category).map((v) => ({
        id: v.id,
        name: v.name,
        roleTitle: v.roleTitle,
        language: v.language,
        category: v.category,
        accent: v.accent,
        defaultStyle: v.defaultStyle,
        description: v.description
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: voices.length, voices }, null, 2)
          }
        ]
      };
    }
  );
  server.registerTool(
    "generate_speech",
    {
      title: "Generate Text-to-Speech Audio (English & Hindi)",
      description: "Synthesize expressive WAV speech from English, Hindi (Devanagari \u0939\u093F\u0928\u094D\u0926\u0940), or Hinglish text. Supports vocal tags (<breath>, <laugh>, <chuckle>, <sigh>, <gasp>) and custom voice descriptions. Returns a direct downloadable .wav URL.",
      inputSchema: {
        text: z.string().min(1).max(4e3).describe("Script text in English, Hindi (Devanagari), or Hinglish."),
        voiceId: z.string().optional().describe("Voice persona ID from list_voices (e.g., aarav, ananya, meera, vikram, marcus). Defaults to aarav for Hindi or marcus for English."),
        language: z.enum(["en", "hi", "bilingual"]).optional().describe("Pronunciation target: en (English), hi (Hindi), or bilingual (Hinglish)."),
        stylePrompt: z.string().optional().describe('Tone and delivery direction (e.g., "Warm, expressive Hindi storyteller").'),
        customVoiceDescription: z.string().optional().describe("Optional custom voice persona description in plain language."),
        speed: z.number().min(0.7).max(1.4).optional().describe("Speech pacing multiplier between 0.7 and 1.4 (default 1.0)."),
        pitchRegister: z.enum(["deep", "balanced", "bright"]).optional().describe("Vocal pitch register."),
        emotionIntensity: z.enum(["subtle", "natural", "dramatic"]).optional().describe("Expressiveness level.")
      }
    },
    async ({
      text,
      voiceId,
      language = "bilingual",
      stylePrompt,
      customVoiceDescription,
      speed = 1,
      pitchRegister = "balanced",
      emotionIntensity = "natural"
    }) => {
      const fallbackId = language === "en" ? "marcus" : "aarav";
      const preset = VOICE_PRESETS.find((v) => v.id === (voiceId || fallbackId)) ?? VOICE_PRESETS[0];
      const result = await synthesizeSpeech({
        mode: "single",
        language,
        modelTier: "expressive",
        text,
        voiceName: preset.baseVoice,
        stylePrompt: stylePrompt ?? preset.defaultStyle,
        customVoiceDescription,
        speed,
        pitchRegister,
        emotionIntensity
      });
      const fullAudioUrl = `${publicBaseUrl.replace(/\/$/, "")}${result.audioUrl}`;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "synthesized",
                clipId: result.clipId,
                audioUrl: fullAudioUrl,
                mimeType: result.mimeType,
                durationSeconds: result.durationEstimateSec,
                voiceUsed: customVoiceDescription ? `Custom Voice (${preset.baseVoice})` : `${preset.name} (${preset.roleTitle})`,
                modelUsed: result.modelUsed
              },
              null,
              2
            )
          }
        ]
      };
    }
  );
  server.registerTool(
    "generate_dialogue",
    {
      title: "Generate Multi-Speaker English/Hindi Dialogue",
      description: "Generate a two-speaker podcast or dialogue WAV audio clip in English, Hindi, or Hinglish with backchanneling (|yeah|, |mhm|) and vocal tags.",
      inputSchema: {
        speakerAName: z.string().default("Vikram").describe("Display name for Speaker A."),
        speakerAVoiceId: z.string().default("vikram").describe("Voice ID for Speaker A."),
        speakerAStyle: z.string().default("Upbeat, conversational host").describe("Delivery style for Speaker A."),
        speakerBName: z.string().default("Ananya").describe("Display name for Speaker B."),
        speakerBVoiceId: z.string().default("ananya").describe("Voice ID for Speaker B."),
        speakerBStyle: z.string().default("Warm, articulate co-host").describe("Delivery style for Speaker B."),
        language: z.enum(["en", "hi", "bilingual"]).default("bilingual"),
        speed: z.number().min(0.7).max(1.4).default(1),
        turns: z.array(
          z.object({
            speaker: z.enum(["A", "B"]),
            text: z.string().min(1)
          })
        ).min(1).describe("Ordered dialogue turns alternating between Speaker A and Speaker B.")
      }
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
      turns
    }) => {
      const presetA = VOICE_PRESETS.find((v) => v.id === speakerAVoiceId) ?? VOICE_PRESETS[3];
      const presetB = VOICE_PRESETS.find((v) => v.id === speakerBVoiceId) ?? VOICE_PRESETS[1];
      const result = await synthesizeSpeech({
        mode: "multi",
        language,
        modelTier: "expressive",
        text: "",
        voiceName: presetA.baseVoice,
        stylePrompt: "",
        speed,
        speakers: {
          A: {
            name: speakerAName,
            voiceId: presetA.id,
            baseVoice: presetA.baseVoice,
            style: speakerAStyle
          },
          B: {
            name: speakerBName,
            voiceId: presetB.id,
            baseVoice: presetB.baseVoice,
            style: speakerBStyle
          }
        },
        dialogueLines: turns.map((turn, idx) => ({
          id: `mcp-turn-${idx + 1}`,
          speakerKey: turn.speaker,
          text: turn.text
        }))
      });
      const fullAudioUrl = `${publicBaseUrl.replace(/\/$/, "")}${result.audioUrl}`;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "synthesized",
                clipId: result.clipId,
                audioUrl: fullAudioUrl,
                mimeType: result.mimeType,
                durationSeconds: result.durationEstimateSec,
                speakers: [speakerAName, speakerBName],
                modelUsed: result.modelUsed
              },
              null,
              2
            )
          }
        ]
      };
    }
  );
  server.registerTool(
    "translate_tts_script",
    {
      title: "Adapt Script Between English, Hindi & Hinglish",
      description: "Translate or adapt a voiceover script into Hindi (Devanagari), English, or Hinglish while preserving inline vocal tags like <breath> and <laugh>.",
      inputSchema: {
        text: z.string().min(1).describe("Source script text."),
        targetLanguage: z.enum(["en", "hi", "bilingual"]).describe("Target script language: en (English), hi (Hindi Devanagari), or bilingual (Hinglish).")
      }
    },
    async ({ text, targetLanguage }) => {
      const translatedText = await translateSpeechScript(text, targetLanguage);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ targetLanguage, translatedText }, null, 2)
          }
        ]
      };
    }
  );
  return server;
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var PORT = Number(process.env.PORT || 3e3);
function resolvePublicBaseUrl(req) {
  if (process.env.APP_URL && process.env.APP_URL !== "MY_APP_URL") {
    return process.env.APP_URL.replace(/\/$/, "");
  }
  const forwardedProto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim();
  const proto = forwardedProto || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.get("host") || `localhost:${PORT}`;
  return `${proto}://${host}`;
}
function mcpCorsMiddleware(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, mcp-session-id, mcp-protocol-version, Last-Event-ID"
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id, mcp-protocol-version");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}
async function startServer() {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "4mb" }));
  const sseSessions = /* @__PURE__ */ new Map();
  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      hasKey: Boolean(process.env.GEMINI_API_KEY),
      mcpEndpoint: `${resolvePublicBaseUrl(req)}/mcp`,
      sseEndpoint: `${resolvePublicBaseUrl(req)}/sse`
    });
  });
  app.get("/api/clips/:id.wav", mcpCorsMiddleware, (req, res) => {
    const clip = getClip(String(req.params.id));
    if (!clip) {
      res.status(404).json({ error: "Audio clip expired or not found." });
      return;
    }
    res.setHeader("Content-Type", clip.mimeType || "audio/wav");
    res.setHeader("Content-Disposition", `inline; filename="svara-${clip.id}.wav"`);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(clip.wavBuffer);
  });
  app.post("/api/tts/generate", async (req, res) => {
    try {
      const payload = req.body;
      const result = await synthesizeSpeech(payload);
      res.json(result);
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });
  app.post("/api/script/translate", async (req, res) => {
    try {
      const { text, targetLanguage } = req.body;
      const translatedText = await translateSpeechScript(text || "", targetLanguage || "hi");
      res.json({ translatedText });
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });
  app.all("/mcp", mcpCorsMiddleware, async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({
        jsonrpc: "2.0",
        error: { code: -32e3, message: "Method not allowed. Send JSON-RPC POST requests to /mcp." },
        id: null
      });
      return;
    }
    const baseUrl = resolvePublicBaseUrl(req);
    const mcpServer = createSvaraMcpServer(baseUrl);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: void 0,
      enableJsonResponse: true
    });
    res.on("close", () => {
      transport.close().catch(() => {
      });
      mcpServer.close().catch(() => {
      });
    });
    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP request error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal MCP server error" },
          id: null
        });
      }
    }
  });
  app.get("/sse", mcpCorsMiddleware, async (req, res) => {
    const baseUrl = resolvePublicBaseUrl(req);
    const mcpServer = createSvaraMcpServer(baseUrl);
    const transport = new SSEServerTransport("/messages", res);
    sseSessions.set(transport.sessionId, transport);
    res.on("close", () => {
      sseSessions.delete(transport.sessionId);
      mcpServer.close().catch(() => {
      });
    });
    await mcpServer.connect(transport);
  });
  app.post("/messages", mcpCorsMiddleware, async (req, res) => {
    const sessionId = String(req.query.sessionId || "");
    const transport = sseSessions.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: "Unknown SSE sessionId" });
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      const indexFile = path.join(distPath, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Production build not found. Run npm run build.");
      }
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Svara Studio server & MCP endpoint listening on http://0.0.0.0:${PORT}/mcp`);
  });
}
startServer();
