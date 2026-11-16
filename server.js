// server.ts
import "dotenv/config";
import express from "express";
import fs3 from "node:fs";
import path3 from "node:path";
import { fileURLToPath } from "node:url";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// src/mcp/createSvaraMcpServer.ts
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
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
  },
  {
    id: "ethan",
    name: "Ethan",
    roleTitle: "Deep Cinematic Narrator",
    baseVoice: "Charon",
    language: "English",
    category: "Narration",
    gender: "Male",
    accent: "American Neutral",
    description: "Deep, cinematic baritone crafted for science reels, nature documentaries, and high-retention YouTube essays.",
    defaultStyle: "Deep cinematic science documentary narrator, authoritative yet filled with quiet wonder",
    sampleText: "Fifty miles above the storm clouds, <breath> giant blue jets of lightning shoot upward into space.",
    sampleLanguage: "en",
    portraitUrl: "/src/assets/images/voice_noir_narrator_1794826140228.jpg"
  },
  {
    id: "noah",
    name: "Noah",
    roleTitle: "Energetic Reel Creator",
    baseVoice: "Puck",
    language: "English",
    category: "Conversational",
    gender: "Male",
    accent: "American Youth",
    description: "Punchy, fast-paced young creator voice engineered for short-form Reels, TikTok hooks, and tech explainers.",
    defaultStyle: "Punchy, curious, fast-paced short-form video creator",
    sampleText: "Wait\u2014stop scrolling for ten seconds. <breath> Why does water actually dance on a pan that is too hot?",
    sampleLanguage: "en",
    portraitUrl: "/src/assets/images/voice_hindi_podcaster_1794826141541.jpg"
  },
  {
    id: "arthur",
    name: "Arthur",
    roleTitle: "British Documentary",
    baseVoice: "Fenrir",
    language: "English",
    category: "Narration",
    gender: "Male",
    accent: "British Documentary",
    description: "Mature, composed British documentary narrator suited for oceanography, history, and prestige features.",
    defaultStyle: "Measured, mature British documentary narrator with crisp diction and calm authority",
    sampleText: "Beneath the icy waters of the Denmark Strait lies the largest waterfall on Earth, hidden entirely from view.",
    sampleLanguage: "en",
    portraitUrl: "/src/assets/images/voice_broadcast_anchor_1794826142499.jpg"
  },
  {
    id: "elena",
    name: "Elena",
    roleTitle: "Warm Documentary Host",
    baseVoice: "Kore",
    language: "English",
    category: "Narration",
    gender: "Female",
    accent: "Neutral International",
    description: "Warm, articulate documentary narrator ideal for human-interest profiles, long-form essays, and museum guides.",
    defaultStyle: "Warm, grounded documentary host with clear pacing and quiet empathy",
    sampleText: "Every drop of rain that hits the desert floor carries the memory of an ocean thousands of miles away.",
    sampleLanguage: "en",
    portraitUrl: "/src/assets/images/voice_broadcast_anchor_1794826142499.jpg"
  },
  {
    id: "maya",
    name: "Maya",
    roleTitle: "Curious Science Explainer",
    baseVoice: "Zephyr",
    language: "English",
    category: "Narration",
    gender: "Female",
    accent: "American Neutral",
    description: "Bright, inquisitive science educator voice built for physics explainers, curiosity hooks, and STEM lessons.",
    defaultStyle: "Curious, bright science explainer with natural inflection and wonder",
    sampleText: "This lightning does not strike the ground\u2014it shoots upward, straight toward the ionosphere.",
    sampleLanguage: "en",
    portraitUrl: "/src/assets/images/voice_wellness_guide_1794826141052.jpg"
  },
  {
    id: "rohan",
    name: "Rohan",
    roleTitle: "Hindi Cinematic Voice",
    baseVoice: "Fenrir",
    language: "Hindi",
    category: "Characters",
    gender: "Male",
    accent: "Cinematic Hindi",
    description: "Resonant, intense Hindi voiceover artist built for epic trailers, mythological stories, and high-drama reels.",
    defaultStyle: "Resonant, cinematic Hindi voiceover with dramatic gravitas and crisp articulation",
    sampleText: "\u091C\u092C \u0906\u0938\u092E\u093E\u0928 \u0915\u0947 \u090A\u092A\u0930 \u092D\u0940 \u090F\u0915 \u0924\u0942\u092B\u093C\u093E\u0928 \u091C\u093E\u0917\u0924\u093E \u0939\u0948, <breath> \u0924\u092C \u0935\u093F\u091C\u094D\u091E\u093E\u0928 \u0915\u0940 \u0939\u0930 \u0938\u0940\u092E\u093E \u091F\u0942\u091F \u091C\u093E\u0924\u0940 \u0939\u0948\u0964",
    sampleLanguage: "hi",
    portraitUrl: "/src/assets/images/voice_noir_narrator_1794826140228.jpg"
  }
];

// src/server/studioStore.ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
function resolveStoreDir() {
  if (process.env.SVARA_DATA_DIR?.trim()) {
    return path.resolve(process.env.SVARA_DATA_DIR.trim());
  }
  const preferred = path.resolve(process.cwd(), ".svara-data");
  try {
    fs.mkdirSync(preferred, { recursive: true });
    return preferred;
  } catch {
    return "/tmp/svara-studio";
  }
}
var STORE_DIR = resolveStoreDir();
var CLIPS_DIR = path.join(STORE_DIR, "clips");
var STATE_FILE = path.join(STORE_DIR, "state.json");
var MAX_CLIPS = 500;
function getStoreDir() {
  return STORE_DIR;
}
var DEFAULT_PRONUNCIATIONS = [
  {
    id: "pron-leidenfrost",
    term: "Leidenfrost",
    phonetic: "LY-den-frost",
    ipa: "/\u02C8la\u026Ad\u0259nfr\u0252st/",
    language: "en",
    notes: "Physics effect where liquid hovers on vapor",
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "pron-denmark-strait",
    term: "Denmark Strait",
    phonetic: "DEN-mark strayt",
    language: "en",
    notes: "Underwater waterfall between Greenland and Iceland",
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "pron-ionosphere",
    term: "ionosphere",
    phonetic: "eye-ON-uh-sfeer",
    ipa: "/a\u026A\u02C8\u0252n\u0259sf\u026A\u0259r/",
    language: "en",
    notes: "Upper atmospheric charged layer",
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "pron-baahubali",
    term: "Baahubali",
    phonetic: "Baa-hu-ba-li",
    language: "bilingual",
    notes: "Clear aspirated long aa/u vowel emphasis",
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z"
  }
];
var DEFAULT_VOICE_PRESETS = [
  {
    id: "preset-rainbow-science",
    name: "Rainbow Reels \u2014 Science Documentary",
    voiceId: "ethan",
    language: "en",
    stylePrompt: "Deep cinematic science documentary narrator, authoritative yet filled with quiet wonder",
    speed: 1,
    pitchRegister: "deep",
    emotionIntensity: "natural",
    expressiveControls: {
      authority: 80,
      curiosity: 75,
      dramaticTension: 65,
      pauseStrength: 60
    },
    masteringPreset: "instagram_reel",
    sampleRate: 48e3,
    channels: 1,
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "preset-hindi-kahani",
    name: "Hindi Kahani \u2014 Warm Audiobook",
    voiceId: "aarav",
    language: "hi",
    stylePrompt: "Warm, expressive Hindi storyteller with natural pauses",
    speed: 0.95,
    pitchRegister: "balanced",
    emotionIntensity: "natural",
    expressiveControls: {
      warmth: 85,
      pauseStrength: 70
    },
    masteringPreset: "audiobook",
    sampleRate: 48e3,
    channels: 1,
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "preset-samachar-news",
    name: "Samachar \u2014 Crisp Hindi Broadcast",
    voiceId: "meera",
    language: "hi",
    stylePrompt: "Clear, authoritative Hindi broadcast news anchor",
    speed: 1.05,
    pitchRegister: "balanced",
    emotionIntensity: "subtle",
    expressiveControls: {
      authority: 85,
      energy: 65
    },
    masteringPreset: "youtube_narration",
    sampleRate: 48e3,
    channels: 1,
    createdAt: "2026-01-01T00:00:00.000Z"
  }
];
function ensureDirs() {
  fs.mkdirSync(CLIPS_DIR, { recursive: true });
}
function loadState() {
  ensureDirs();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf8");
      const parsed = JSON.parse(raw);
      return {
        pronunciations: Array.isArray(parsed.pronunciations) ? parsed.pronunciations : [...DEFAULT_PRONUNCIATIONS],
        voicePresets: Array.isArray(parsed.voicePresets) ? parsed.voicePresets : [...DEFAULT_VOICE_PRESETS],
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        clips: Array.isArray(parsed.clips) ? parsed.clips : []
      };
    }
  } catch {
  }
  const initial = {
    pronunciations: [...DEFAULT_PRONUNCIATIONS],
    voicePresets: [...DEFAULT_VOICE_PRESETS],
    projects: [],
    clips: []
  };
  saveState(initial);
  return initial;
}
function saveState(state) {
  ensureDirs();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}
var stateCache = loadState();
function listPronunciations() {
  return [...stateCache.pronunciations];
}
function upsertPronunciation(input) {
  const cleanTerm = input.term.trim();
  const cleanPhonetic = input.phonetic.trim();
  const existingIdx = stateCache.pronunciations.findIndex(
    (p) => input.id && p.id === input.id || p.term.toLowerCase() === cleanTerm.toLowerCase()
  );
  const entry = {
    id: existingIdx >= 0 ? stateCache.pronunciations[existingIdx].id : input.id || `pron-${crypto.randomUUID().slice(0, 8)}`,
    term: cleanTerm,
    phonetic: cleanPhonetic,
    ipa: input.ipa?.trim() || void 0,
    language: input.language || "bilingual",
    notes: input.notes?.trim() || void 0,
    enabled: input.enabled ?? true,
    createdAt: existingIdx >= 0 ? stateCache.pronunciations[existingIdx].createdAt : (/* @__PURE__ */ new Date()).toISOString()
  };
  if (existingIdx >= 0) {
    stateCache.pronunciations[existingIdx] = entry;
  } else {
    stateCache.pronunciations.unshift(entry);
  }
  saveState(stateCache);
  return entry;
}
function deletePronunciation(idOrTerm) {
  const before = stateCache.pronunciations.length;
  stateCache.pronunciations = stateCache.pronunciations.filter(
    (p) => p.id !== idOrTerm && p.term.toLowerCase() !== idOrTerm.toLowerCase()
  );
  if (stateCache.pronunciations.length !== before) {
    saveState(stateCache);
    return true;
  }
  return false;
}
function listVoicePresets() {
  return [...stateCache.voicePresets];
}
function getVoicePreset(idOrName) {
  return stateCache.voicePresets.find(
    (p) => p.id === idOrName || p.name.toLowerCase() === idOrName.toLowerCase()
  );
}
function upsertVoicePreset(input) {
  const existingIdx = stateCache.voicePresets.findIndex(
    (p) => input.id && p.id === input.id || p.name.toLowerCase() === input.name.trim().toLowerCase()
  );
  const preset = {
    ...input,
    id: existingIdx >= 0 ? stateCache.voicePresets[existingIdx].id : input.id || `vp-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    createdAt: existingIdx >= 0 ? stateCache.voicePresets[existingIdx].createdAt : (/* @__PURE__ */ new Date()).toISOString()
  };
  if (existingIdx >= 0) {
    stateCache.voicePresets[existingIdx] = preset;
  } else {
    stateCache.voicePresets.unshift(preset);
  }
  saveState(stateCache);
  return preset;
}
function deleteVoicePreset(id) {
  const before = stateCache.voicePresets.length;
  stateCache.voicePresets = stateCache.voicePresets.filter((p) => p.id !== id);
  if (stateCache.voicePresets.length !== before) {
    saveState(stateCache);
    return true;
  }
  return false;
}
function saveStoredClip(params) {
  ensureDirs();
  const id = params.id || crypto.randomUUID().slice(0, 12);
  const wavFileName = `${id}.wav`;
  fs.writeFileSync(path.join(CLIPS_DIR, wavFileName), params.wavBuffer);
  let encodedFileName;
  let primarySizeBytes = params.wavBuffer.length;
  if (params.format !== "wav" && params.encodedBuffer) {
    encodedFileName = `${id}.${params.format}`;
    fs.writeFileSync(path.join(CLIPS_DIR, encodedFileName), params.encodedBuffer);
    primarySizeBytes = params.encodedBuffer.length;
  }
  const record = {
    id,
    wavFileName,
    encodedFileName,
    format: params.format,
    mimeType: params.mimeType,
    sampleRate: params.sampleRate,
    channels: params.channels,
    durationMs: params.durationMs,
    sizeBytes: primarySizeBytes,
    voiceId: params.voiceId,
    voiceName: params.voiceName,
    modelUsed: params.modelUsed,
    language: params.language,
    displayText: params.displayText,
    stylePrompt: params.stylePrompt,
    speed: params.speed,
    masteringPreset: params.masteringPreset,
    timingSource: params.timingSource,
    timingConfidence: params.timingConfidence,
    wordTimings: params.wordTimings,
    phraseTimings: params.phraseTimings,
    speechEnvelope: params.speechEnvelope,
    waveformPeaks: params.waveformPeaks,
    segments: params.segments,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  stateCache.clips = [record, ...stateCache.clips.filter((c) => c.id !== id)];
  if (stateCache.clips.length > MAX_CLIPS) {
    const removed = stateCache.clips.slice(MAX_CLIPS);
    stateCache.clips = stateCache.clips.slice(0, MAX_CLIPS);
    for (const r of removed) {
      fs.rmSync(path.join(CLIPS_DIR, r.wavFileName), { force: true });
      if (r.encodedFileName) {
        fs.rmSync(path.join(CLIPS_DIR, r.encodedFileName), { force: true });
      }
    }
  }
  saveState(stateCache);
  return record;
}
function getClipRecord(id) {
  const cached = stateCache.clips.find((c) => c.id === id);
  if (cached) return cached;
  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (Array.isArray(parsed.clips)) {
        stateCache.clips = parsed.clips;
        return stateCache.clips.find((c) => c.id === id);
      }
    }
  } catch {
  }
  return void 0;
}
function getClipAudioBuffer(id, preferWav = false) {
  const record = getClipRecord(id);
  if (!record) return void 0;
  if (!preferWav && record.encodedFileName && record.format !== "wav") {
    const encodedPath = path.join(CLIPS_DIR, record.encodedFileName);
    if (fs.existsSync(encodedPath)) {
      return {
        record,
        buffer: fs.readFileSync(encodedPath),
        mimeType: record.mimeType,
        ext: record.format
      };
    }
  }
  const wavPath = path.join(CLIPS_DIR, record.wavFileName);
  if (!fs.existsSync(wavPath)) return void 0;
  return {
    record,
    buffer: fs.readFileSync(wavPath),
    mimeType: "audio/wav",
    ext: "wav"
  };
}
function listRecentClips(limit = 30) {
  return stateCache.clips.slice(0, limit);
}
function listProjects() {
  return [...stateCache.projects];
}
function getProject(id) {
  return stateCache.projects.find((p) => p.id === id);
}
function createProject(input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const project = {
    id: `proj-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    description: input.description?.trim() || void 0,
    defaultVoicePresetId: input.defaultVoicePresetId,
    clips: [],
    createdAt: now,
    updatedAt: now
  };
  stateCache.projects.unshift(project);
  saveState(stateCache);
  return project;
}
function addClipToProject(projectId, clip) {
  const proj = stateCache.projects.find((p) => p.id === projectId);
  if (!proj) return void 0;
  const existing = proj.clips.find((c) => c.clipId === clip.clipId);
  if (!existing) {
    proj.clips.push({
      ...clip,
      order: proj.clips.length + 1,
      addedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  proj.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveState(stateCache);
  return proj;
}
function updateProjectClip(projectId, clipId, updates) {
  const proj = stateCache.projects.find((p) => p.id === projectId);
  if (!proj) return void 0;
  const target = proj.clips.find((c) => c.clipId === clipId);
  if (!target) return void 0;
  if (updates.title !== void 0) target.title = updates.title;
  if (updates.text !== void 0) target.text = updates.text;
  if (typeof updates.order === "number") target.order = updates.order;
  proj.clips.sort((a, b) => a.order - b.order);
  proj.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveState(stateCache);
  return proj;
}
function deleteProjectClip(projectId, clipId) {
  const proj = stateCache.projects.find((p) => p.id === projectId);
  if (!proj) return void 0;
  proj.clips = proj.clips.filter((c) => c.clipId !== clipId);
  proj.clips.forEach((c, idx) => {
    c.order = idx + 1;
  });
  proj.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveState(stateCache);
  return proj;
}

// src/server/ttsService.ts
import crypto2 from "node:crypto";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// src/utils/pronunciationAndEmotion.ts
var EMOTION_STYLE_MAP = {
  CURIOUS: "inquisitive, curious upward inflection, engaged wonder",
  CHALLENGING: "pointed, challenging emphasis with crisp contrast",
  AWE: "awed, reverent sense of scale and quiet amazement",
  QUIET: "intimate, lowered voice, soft and reflective",
  EXCITED: "energetic, enthusiastic momentum",
  SERIOUS: "grave, serious, focused authority",
  WARM: "warm, reassuring, friendly proximity",
  DRAMATIC: "cinematic dramatic tension and deliberate weight",
  FAST: "brisk, urgent forward pacing",
  SLOW: "deliberate, unhurried pacing"
};
var BRACKET_TAG_RE = /\[([A-Z_]{2,24})\]/g;
function stripInlinePerformanceTags(text) {
  return text.replace(BRACKET_TAG_RE, " ").replace(/<[^>]+>/g, " ").replace(/\|[^|]+\|/g, " ").replace(/\s+/g, " ").trim();
}
function getEmotionStyleHint(tag) {
  if (!tag) return void 0;
  const upper = tag.trim().toUpperCase().replace(/[^A-Z_]/g, "");
  if (!upper) return void 0;
  return EMOTION_STYLE_MAP[upper] || `${upper.toLowerCase().replace(/_/g, " ")} delivery`;
}
function splitScriptIntoSegments(script) {
  const normalized = script.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const rawBlocks = normalized.split(/\n+/).map((b) => b.trim()).filter(Boolean);
  const segments = [];
  let currentEmotion;
  let pendingInlinePrefix = "";
  for (const block of rawBlocks) {
    const subParts = block.split(/(?=(?:\[[A-Z_]{2,24}\]))|(?<=[.!?।])\s+(?=[A-Z0-9\u0900-\u097F"<|\[])/u).map((s) => s.trim()).filter(Boolean);
    for (const part of subParts) {
      let working = part;
      const tagMatches = Array.from(working.matchAll(BRACKET_TAG_RE));
      if (tagMatches.length > 0) {
        currentEmotion = tagMatches[tagMatches.length - 1][1];
        working = working.replace(BRACKET_TAG_RE, "").replace(/\s+/g, " ").trim();
      }
      if (!working) continue;
      const displayText = working.replace(/<[^>]+>/g, " ").replace(/\|[^|]+\|/g, " ").replace(/\s+/g, " ").trim();
      if (!displayText) {
        pendingInlinePrefix = pendingInlinePrefix ? `${pendingInlinePrefix} ${working}` : working;
        continue;
      }
      const rawText = pendingInlinePrefix ? `${pendingInlinePrefix} ${working}` : working;
      pendingInlinePrefix = "";
      segments.push({
        index: segments.length,
        emotion: currentEmotion,
        emotionPrompt: getEmotionStyleHint(currentEmotion),
        displayText,
        rawText
      });
    }
  }
  if (pendingInlinePrefix && segments.length > 0) {
    const last = segments[segments.length - 1];
    last.rawText = `${last.rawText} ${pendingInlinePrefix}`.trim();
  }
  return segments;
}
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function containsDevanagari(str) {
  return /[\u0900-\u097F]/.test(str);
}
function applyPronunciationRules(text, rules, targetLanguage) {
  if (!text.trim() || !rules.length) {
    return { ttsText: text, pronunciationPrompt: "", appliedTerms: [] };
  }
  const activeRules = rules.filter(
    (r) => r.enabled && r.term.trim().length > 0 && r.phonetic.trim().length > 0 && (targetLanguage === "bilingual" || r.language === "bilingual" || r.language === targetLanguage)
  );
  let ttsText = text;
  const appliedTerms = [];
  const promptHints = [];
  for (const rule of activeRules) {
    const term = rule.term.trim();
    const phonetic = rule.phonetic.trim();
    const escaped = escapeRegExp(term);
    const matcher = containsDevanagari(term) ? new RegExp(escaped, "g") : new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "gi");
    if (matcher.test(ttsText)) {
      appliedTerms.push(term);
      const ipaPart = rule.ipa?.trim() ? ` (IPA: ${rule.ipa.trim()})` : "";
      promptHints.push(`"${term}" pronounced "${phonetic}"${ipaPart}`);
      if (!/[\/\[\]]/.test(phonetic)) {
        ttsText = ttsText.replace(matcher, phonetic);
      }
    }
  }
  const pronunciationPrompt = promptHints.length > 0 ? `Pronunciation guide: ${promptHints.join("; ")}` : "";
  return {
    ttsText,
    pronunciationPrompt,
    appliedTerms
  };
}

// src/utils/speechLogic.ts
var VOCAL_TAG_REGEX = /(<[a-z]+>|\|[a-z]+\|)/i;
function countWordsAndChars(text) {
  const chars = text.length;
  const plainText = text.replace(/\[[A-Z_]{2,24}\]/g, " ").replace(/<[^>]+>/g, " ").replace(/\|[^|]+\|/g, " ").trim();
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
function describeExpressiveControls(controls) {
  if (!controls) return [];
  const cues = [];
  if (typeof controls.energy === "number") {
    if (controls.energy >= 75) cues.push("high vocal energy and forward drive");
    else if (controls.energy <= 25) cues.push("calm, low-key restrained energy");
  }
  if (typeof controls.warmth === "number") {
    if (controls.warmth >= 75) cues.push("rich, inviting vocal warmth");
    else if (controls.warmth <= 25) cues.push("cool, analytical objectivity");
  }
  if (typeof controls.authority === "number" && controls.authority >= 70) {
    cues.push("commanding, grounded authority");
  }
  if (typeof controls.curiosity === "number" && controls.curiosity >= 70) {
    cues.push("inquisitive, curious storytelling inflection");
  }
  if (typeof controls.dramaticTension === "number" && controls.dramaticTension >= 70) {
    cues.push("cinematic dramatic tension");
  }
  if (typeof controls.pauseStrength === "number") {
    if (controls.pauseStrength >= 75) cues.push("pronounced, thoughtful pauses at punctuation");
    else if (controls.pauseStrength <= 25) cues.push("tight, minimal pauses between clauses");
  }
  if (typeof controls.smile === "number" && controls.smile >= 70) {
    cues.push("audible warm smile in the voice");
  }
  if (typeof controls.whisper === "number" && controls.whisper >= 65) {
    cues.push("hushed, breathy near-whisper intimacy");
  }
  return cues;
}
function buildStyleInstruction(params) {
  const parts = [];
  if (params.customVoiceDescription && params.customVoiceDescription.trim()) {
    parts.push(`Voice persona: ${params.customVoiceDescription.trim()}`);
  }
  if (params.stylePrompt.trim()) {
    parts.push(`Delivery style: ${params.stylePrompt.trim()}`);
  }
  if (params.emotionHint?.trim()) {
    parts.push(`Scene emotion: ${params.emotionHint.trim()}`);
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
  const expressiveCues = describeExpressiveControls(params.expressiveControls);
  if (expressiveCues.length > 0) {
    parts.push(...expressiveCues);
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
  if (params.pronunciationPrompt?.trim()) {
    parts.push(params.pronunciationPrompt.trim());
  }
  return parts.join(". ");
}
function splitLongScriptIntoChunkPlans(text, maxChunkChars = 3500) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const paragraphs = trimmed.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const plans = [];
  let activeEmotion;
  for (let pIdx = 0; pIdx < paragraphs.length; pIdx += 1) {
    let para = paragraphs[pIdx];
    const emotionMatch = para.match(/^\[([A-Z_]{2,24})\]\s*/);
    if (emotionMatch) {
      activeEmotion = emotionMatch[1];
    } else if (activeEmotion && pIdx > 0 && !/^\[([A-Z_]{2,24})\]/.test(para)) {
    }
    const isLastPara = pIdx === paragraphs.length - 1;
    const paraBreakMs = isLastPara ? 0 : 220;
    if (para.length <= maxChunkChars) {
      const prev = plans[plans.length - 1];
      if (prev && !emotionMatch && prev.text.length + 1 + para.length <= maxChunkChars && plans.length === pIdx) {
        prev.text = `${prev.text}
${para}`;
        prev.breakAfterMs = paraBreakMs;
      } else {
        plans.push({ text: para, breakAfterMs: paraBreakMs, emotion: activeEmotion });
      }
      continue;
    }
    const sentences = para.split(/(?<=[.!?।])\s+/u).map((s) => s.trim()).filter(Boolean);
    let current = "";
    for (let sIdx = 0; sIdx < sentences.length; sIdx += 1) {
      const sentence = sentences[sIdx];
      const sentEmotion = sentence.match(/^\[([A-Z_]{2,24})\]\s*/);
      if (sentEmotion) activeEmotion = sentEmotion[1];
      if (sentence.length > maxChunkChars) {
        if (current) {
          plans.push({ text: current, breakAfterMs: 130, emotion: activeEmotion });
          current = "";
        }
        for (let i = 0; i < sentence.length; i += maxChunkChars) {
          const slice = sentence.slice(i, i + maxChunkChars).trim();
          if (slice) {
            plans.push({
              text: slice,
              breakAfterMs: i + maxChunkChars >= sentence.length && sIdx === sentences.length - 1 ? paraBreakMs : 120,
              emotion: activeEmotion
            });
          }
        }
        continue;
      }
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (candidate.length <= maxChunkChars) {
        current = candidate;
      } else {
        if (current) {
          plans.push({ text: current, breakAfterMs: 130, emotion: activeEmotion });
        }
        current = activeEmotion && !/^\[([A-Z_]{2,24})\]/.test(sentence) ? `[${activeEmotion}] ${sentence}` : sentence;
      }
    }
    if (current) {
      plans.push({ text: current, breakAfterMs: paraBreakMs, emotion: activeEmotion });
    }
  }
  return plans;
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
    if ((!payload.speakerList || payload.speakerList.length === 0) && (!payload.speakers?.A?.name?.trim() || !payload.speakers?.B?.name?.trim())) {
      return {
        valid: false,
        error: "All active speakers must have display names."
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
  return { valid: true };
}

// src/utils/subtitleGenerator.ts
var VOWEL_RUN_RE = /[aeiouy]+|[\u0905-\u0914\u093E-\u094C\u0962-\u0963]/gi;
function estimateWordWeight(word) {
  const clean = word.replace(/[^\p{L}\p{N}]/gu, "");
  if (!clean) return 1;
  const vowelRuns = clean.match(VOWEL_RUN_RE)?.length ?? 0;
  const lenFactor = Math.max(1, Math.sqrt(clean.length));
  const punctuationPause = /[.!?।]$/.test(word) ? 1.8 : /[,;:—-]$/.test(word) ? 0.9 : 0;
  return Math.max(1.1, vowelRuns * 0.8 + lenFactor * 0.65 + punctuationPause);
}
function alignWordsToEnvelope(displayText, durationMs, envelope = []) {
  const safeDurationMs = Math.max(200, Math.round(durationMs));
  const segments = splitScriptIntoSegments(displayText);
  const tokens = [];
  if (segments.length > 0) {
    for (const seg of segments) {
      const cleaned = stripInlinePerformanceTags(seg.displayText);
      const words = cleaned.split(/\s+/).filter(Boolean);
      for (const w of words) {
        tokens.push({
          word: w,
          segmentIndex: seg.index,
          emotion: seg.emotion,
          weight: estimateWordWeight(w)
        });
      }
    }
  } else {
    const cleaned = stripInlinePerformanceTags(displayText);
    for (const w of cleaned.split(/\s+/).filter(Boolean)) {
      tokens.push({ word: w, segmentIndex: 0, weight: estimateWordWeight(w) });
    }
  }
  if (tokens.length === 0) {
    return { wordTimings: [], phraseTimings: [], timingSource: "estimated", timingConfidence: 0 };
  }
  const mergedWindows = [];
  for (const frame of envelope) {
    if (!frame.speechActive) continue;
    const prev = mergedWindows[mergedWindows.length - 1];
    if (prev && frame.startMs - prev.endMs <= 120) {
      prev.endMs = frame.endMs;
    } else {
      mergedWindows.push({ startMs: frame.startMs, endMs: frame.endMs });
    }
  }
  const hasAcousticWindows = envelope.length >= 4 && mergedWindows.length > 0;
  const activeWindows = hasAcousticWindows ? mergedWindows : [{ startMs: 0, endMs: safeDurationMs }];
  const clauseGroups = [];
  let curClause = [];
  for (const tok of tokens) {
    curClause.push(tok);
    if (/[.!?।,;:\u2014-]$/.test(tok.word) && curClause.length >= 2) {
      clauseGroups.push(curClause);
      curClause = [];
    }
  }
  if (curClause.length > 0) clauseGroups.push(curClause);
  const wordTimings = [];
  if (hasAcousticWindows && activeWindows.length >= 2 && clauseGroups.length === activeWindows.length) {
    for (let g = 0; g < clauseGroups.length; g += 1) {
      const group = clauseGroups[g];
      const win = activeWindows[g];
      const span = Math.max(40, win.endMs - win.startMs);
      const groupWeight = group.reduce((acc, t) => acc + t.weight, 0);
      let cursor = 0;
      for (const tok of group) {
        const sMs = Math.round(win.startMs + cursor / groupWeight * span);
        cursor += tok.weight;
        const eMs = Math.max(sMs + 35, Math.min(safeDurationMs, Math.round(win.startMs + cursor / groupWeight * span)));
        wordTimings.push({
          word: tok.word,
          startMs: sMs,
          endMs: eMs,
          startSeconds: Number((sMs / 1e3).toFixed(3)),
          endSeconds: Number((eMs / 1e3).toFixed(3)),
          segmentIndex: tok.segmentIndex,
          emotion: tok.emotion
        });
      }
    }
  } else {
    const totalActiveMs = activeWindows.reduce((acc, w) => acc + Math.max(20, w.endMs - w.startMs), 0);
    const totalWeight = tokens.reduce((acc, t) => acc + t.weight, 0);
    const mapActiveOffsetToMs = (offsetMs) => {
      let remaining = Math.max(0, Math.min(totalActiveMs, offsetMs));
      for (const win of activeWindows) {
        const span = Math.max(20, win.endMs - win.startMs);
        if (remaining <= span) {
          return Math.round(win.startMs + remaining);
        }
        remaining -= span;
      }
      return activeWindows[activeWindows.length - 1].endMs;
    };
    let cursorWeight = 0;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      const startOffset = cursorWeight / totalWeight * totalActiveMs;
      cursorWeight += token.weight;
      const endOffset = cursorWeight / totalWeight * totalActiveMs;
      const rawStartMs = mapActiveOffsetToMs(startOffset);
      const rawEndMs = Math.max(rawStartMs + 40, mapActiveOffsetToMs(endOffset));
      const clampedEndMs = Math.min(safeDurationMs, rawEndMs);
      const clampedStartMs = Math.min(rawStartMs, Math.max(0, clampedEndMs - 30));
      wordTimings.push({
        word: token.word,
        startMs: clampedStartMs,
        endMs: clampedEndMs,
        startSeconds: Number((clampedStartMs / 1e3).toFixed(3)),
        endSeconds: Number((clampedEndMs / 1e3).toFixed(3)),
        segmentIndex: token.segmentIndex,
        emotion: token.emotion
      });
    }
  }
  const phraseTimings = groupWordsIntoPhrases(wordTimings, {
    maxLines: 2,
    maxCharsPerLine: 34,
    maxPhraseDurationMs: 3200
  });
  const timingSource = hasAcousticWindows ? "forced_alignment" : "estimated";
  const timingConfidence = hasAcousticWindows ? activeWindows.length === clauseGroups.length ? 0.88 : 0.78 : 0.45;
  return { wordTimings, phraseTimings, timingSource, timingConfidence };
}
function alignWordsToWavPcm(displayText, pcm, sampleRate, channels = 1) {
  const monoLen = channels > 1 ? Math.floor(pcm.length / channels) : pcm.length;
  const durationMs = Math.max(200, Math.round(monoLen / Math.max(1, sampleRate) * 1e3));
  const frameMs = 10;
  const frameSamples = Math.max(40, Math.round(sampleRate * frameMs / 1e3));
  const frameEnergy = [];
  const envelope = [];
  for (let s = 0; s < monoLen; s += frameSamples) {
    const e = Math.min(monoLen, s + frameSamples);
    let sumSq = 0;
    for (let i = s; i < e; i += 1) {
      let sampleVal = 0;
      if (channels > 1) {
        for (let c = 0; c < channels; c += 1) sampleVal += pcm[i * channels + c] || 0;
        sampleVal /= channels;
      } else {
        sampleVal = pcm[i];
      }
      const norm = sampleVal / 32767;
      sumSq += norm * norm;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, e - s));
    frameEnergy.push(rms);
    const rmsDb = rms > 1e-6 ? Number((20 * Math.log10(rms)).toFixed(1)) : -96;
    envelope.push({
      startMs: Math.round(s / sampleRate * 1e3),
      endMs: Math.round(e / sampleRate * 1e3),
      speechActive: rmsDb > -38,
      rmsDb,
      duckGainDb: rmsDb > -38 ? -14 : 0
    });
  }
  const base = alignWordsToEnvelope(displayText, durationMs, envelope);
  if (base.wordTimings.length <= 1 || frameEnergy.length < 10) {
    return base;
  }
  const smoothed = frameEnergy.map((_, idx) => {
    const prev = frameEnergy[Math.max(0, idx - 1)];
    const cur = frameEnergy[idx];
    const next = frameEnergy[Math.min(frameEnergy.length - 1, idx + 1)];
    return (prev + cur * 2 + next) / 4;
  });
  const searchFrames = 7;
  const snapped = base.wordTimings.map((w) => ({ ...w }));
  let troughSnaps = 0;
  for (let i = 0; i < snapped.length - 1; i += 1) {
    const cur = snapped[i];
    const next = snapped[i + 1];
    if (next.startMs - cur.endMs > 60) continue;
    const boundaryMs = Math.round((cur.endMs + next.startMs) / 2);
    const centerFrame = Math.round(boundaryMs / frameMs);
    const minF = Math.max(1, centerFrame - searchFrames);
    const maxF = Math.min(smoothed.length - 2, centerFrame + searchFrames);
    let bestFrame = centerFrame;
    let lowestEnergy = smoothed[centerFrame] ?? 1;
    for (let f = minF; f <= maxF; f += 1) {
      if (smoothed[f] < lowestEnergy) {
        lowestEnergy = smoothed[f];
        bestFrame = f;
      }
    }
    const snappedMs = bestFrame * frameMs;
    if (snappedMs > cur.startMs + 35 && snappedMs < next.endMs - 35) {
      cur.endMs = snappedMs;
      cur.endSeconds = Number((snappedMs / 1e3).toFixed(3));
      next.startMs = snappedMs;
      next.startSeconds = Number((snappedMs / 1e3).toFixed(3));
      troughSnaps += 1;
    }
  }
  const snapRatio = troughSnaps / Math.max(1, snapped.length - 1);
  const confidence = base.timingSource === "forced_alignment" ? Number(Math.min(0.95, Math.max(0.76, 0.8 + snapRatio * 0.14)).toFixed(2)) : base.timingConfidence;
  const phraseTimings = groupWordsIntoPhrases(snapped, {
    maxLines: 2,
    maxCharsPerLine: 34,
    maxPhraseDurationMs: 3200
  });
  return {
    wordTimings: snapped,
    phraseTimings,
    timingSource: base.timingSource,
    timingConfidence: confidence
  };
}
function wrapWordsToLines(words, maxCharsPerLine, maxLines) {
  const lines = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxCharsPerLine || current.length === 0) {
      current = candidate;
    } else {
      lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}
function groupWordsIntoPhrases(wordTimings, opts = {}) {
  if (!wordTimings.length) return [];
  const maxLines = opts.maxLines ?? 3;
  const maxCharsPerLine = Math.max(12, opts.maxCharsPerLine ?? 26);
  const maxTotalChars = maxLines * maxCharsPerLine;
  const maxPhraseDurationMs = Math.max(800, opts.maxPhraseDurationMs ?? 3e3);
  const phrases = [];
  let bucket = [];
  let bucketChars = 0;
  const flushBucket = () => {
    if (bucket.length === 0) return;
    const rawWords = bucket.map((b) => opts.uppercase ? b.word.toUpperCase() : b.word);
    const wrapped = wrapWordsToLines(rawWords, maxCharsPerLine, maxLines);
    phrases.push({
      text: wrapped.join("\n"),
      startMs: bucket[0].startMs,
      endMs: bucket[bucket.length - 1].endMs,
      words: bucket
    });
    bucket = [];
    bucketChars = 0;
  };
  for (const wt of wordTimings) {
    const prev = bucket[bucket.length - 1];
    const nextChars = bucketChars + (bucket.length > 0 ? 1 : 0) + wt.word.length;
    const nextDur = bucket.length > 0 ? wt.endMs - bucket[0].startMs : 0;
    const segmentChanged = prev && prev.segmentIndex !== wt.segmentIndex;
    const prevEndedSentence = prev && /[.!?।]$/.test(prev.word);
    const largeGap = prev && wt.startMs - prev.endMs > 550;
    if (bucket.length > 0 && (segmentChanged || prevEndedSentence || largeGap || nextChars > maxTotalChars || nextDur > maxPhraseDurationMs)) {
      flushBucket();
    }
    bucket.push(wt);
    bucketChars += (bucket.length > 1 ? 1 : 0) + wt.word.length;
  }
  flushBucket();
  return phrases;
}
function formatSrtTime(ms) {
  const safe = Math.max(0, Math.round(ms));
  const hrs = Math.floor(safe / 36e5);
  const mins = Math.floor(safe % 36e5 / 6e4);
  const secs = Math.floor(safe % 6e4 / 1e3);
  const millis = safe % 1e3;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}
function formatVttTime(ms) {
  return formatSrtTime(ms).replace(",", ".");
}
function formatAssTime(ms) {
  const safe = Math.max(0, Math.round(ms));
  const hrs = Math.floor(safe / 36e5);
  const mins = Math.floor(safe % 36e5 / 6e4);
  const secs = Math.floor(safe % 6e4 / 1e3);
  const cs = Math.floor(safe % 1e3 / 10);
  return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
function generateSubtitles(opts) {
  const isRainbow = (opts.preset ?? "rainbow_reels") === "rainbow_reels";
  const uppercase = opts.uppercase ?? isRainbow;
  const maxLines = opts.maxLines ?? (isRainbow ? 3 : 2);
  const maxCharsPerLine = opts.maxCharsPerLine ?? (isRainbow ? 22 : 38);
  const maxPhraseDurationMs = opts.maxPhraseDurationMs ?? (typeof opts.maxDurationSeconds === "number" && opts.maxDurationSeconds > 0 ? Math.round(opts.maxDurationSeconds * 1e3) : isRainbow ? 2600 : 3800);
  const marginV = opts.safeAreaMarginV ?? (isRainbow ? 340 : 120);
  const phrases = groupWordsIntoPhrases(opts.wordTimings, {
    maxLines,
    maxCharsPerLine,
    maxPhraseDurationMs,
    uppercase
  });
  if (opts.format === "json") {
    return JSON.stringify(
      {
        preset: opts.preset ?? "rainbow_reels",
        wordTimings: opts.wordTimings,
        phrases
      },
      null,
      2
    );
  }
  if (opts.format === "srt") {
    return phrases.map(
      (p, idx) => `${idx + 1}
${formatSrtTime(p.startMs)} --> ${formatSrtTime(p.endMs)}
${p.text}`
    ).join("\n\n");
  }
  if (opts.format === "vtt") {
    const cues = phrases.map((p) => `${formatVttTime(p.startMs)} --> ${formatVttTime(p.endMs)}
${p.text}`).join("\n\n");
    return `WEBVTT

${cues}`;
  }
  const playResX = isRainbow ? 1080 : 1920;
  const playResY = isRainbow ? 1920 : 1080;
  const fontSize = isRainbow ? 74 : 58;
  const primaryColour = isRainbow ? "&H00FFE500" : "&H00FFFFFF";
  const secondaryColour = "&H00FFFFFF";
  const header = [
    "[Script Info]",
    `Title: Svara Studio Captions (${isRainbow ? "Rainbow Reels" : "Clean Editorial"})`,
    "ScriptType: v4.00+",
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,Plus Jakarta Sans,${fontSize},${primaryColour},${secondaryColour},&H00090D16,&H80000000,-1,0,0,0,100,100,1,0,1,5,2,2,72,72,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
  ].join("\n");
  const events = phrases.map((phrase) => {
    const start = formatAssTime(phrase.startMs);
    const end = formatAssTime(phrase.endMs);
    const lines = phrase.text.split("\n");
    let wordCursor = 0;
    const assLines = lines.map((lineText) => {
      const lineWords = lineText.split(" ").filter(Boolean);
      return lineWords.map((displayWord) => {
        const wt = phrase.words[wordCursor];
        wordCursor += 1;
        const durCs = wt ? Math.max(4, Math.round((wt.endMs - wt.startMs) / 10)) : 20;
        return isRainbow ? `{\\kf${durCs}}${displayWord}` : displayWord;
      }).join(" ");
    });
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${assLines.join("\\N")}`;
  });
  return `${header}
${events.join("\n")}
`;
}

// src/server/quotaError.ts
var InputValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.error_code = "INVALID_ARGUMENT";
    this.retryable = false;
    this.name = "InputValidationError";
  }
};
var QuotaExhaustedError = class extends Error {
  constructor(params) {
    super(
      params.message || "All configured TTS providers are currently unavailable. Enable billing or configure a fallback provider (OPENAI_API_KEY or ELEVENLABS_API_KEY) in Settings > Secrets."
    );
    this.status = 429;
    this.error_code = "RESOURCE_EXHAUSTED";
    this.retryable = true;
    this.name = "QuotaExhaustedError";
    this.attemptedModels = params.attemptedModels;
    this.retryAfterSeconds = typeof params.retryAfterSeconds === "number" && params.retryAfterSeconds > 0 ? Math.round(params.retryAfterSeconds) : 3600;
  }
  toPayload() {
    return {
      status: 429,
      error_code: "RESOURCE_EXHAUSTED",
      retryable: true,
      retryAfterSeconds: this.retryAfterSeconds,
      attemptedModels: this.attemptedModels,
      message: this.message
    };
  }
};
var modelCooldownUntil = /* @__PURE__ */ new Map();
function markModelCooldown(model, retryAfterSeconds) {
  const safeSeconds = Math.max(15, Math.min(86400, Math.round(retryAfterSeconds || 60)));
  modelCooldownUntil.set(model, Date.now() + safeSeconds * 1e3);
}
function isModelOnCooldown(model) {
  const until = modelCooldownUntil.get(model);
  if (!until) return false;
  if (Date.now() >= until) {
    modelCooldownUntil.delete(model);
    return false;
  }
  return true;
}
function getModelCooldownRemainingSec(model) {
  const until = modelCooldownUntil.get(model);
  if (!until) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1e3));
}
function parseJsonSafe(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    const idx = trimmed.indexOf("{");
    if (idx === -1) return null;
    try {
      return JSON.parse(trimmed.slice(idx));
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
function collectErrorNodes(err) {
  const nodes = [];
  const queue = [err];
  const seen = /* @__PURE__ */ new Set();
  while (queue.length > 0 && nodes.length < 40) {
    const cur = queue.shift();
    if (!cur || seen.has(cur)) continue;
    if (typeof cur === "string") {
      nodes.push(cur);
      const parsed = parseJsonSafe(cur);
      if (parsed && typeof parsed === "object") {
        queue.push(parsed);
      }
      continue;
    }
    if (typeof cur !== "object") continue;
    seen.add(cur);
    const obj = cur;
    nodes.push(obj);
    if (typeof obj.message === "string") {
      nodes.push(obj.message);
      const parsed = parseJsonSafe(obj.message);
      if (parsed && typeof parsed === "object") {
        queue.push(parsed);
      }
    }
    if (obj.error) queue.push(obj.error);
    if (obj.cause) queue.push(obj.cause);
    if (obj.response) queue.push(obj.response);
    if (obj.data) queue.push(obj.data);
    if (obj.body) queue.push(obj.body);
    if (Array.isArray(obj.details)) {
      for (const d of obj.details) queue.push(d);
    }
  }
  return nodes;
}
function isQuotaOrRateError(err) {
  if (err instanceof QuotaExhaustedError) return true;
  const nodes = collectErrorNodes(err);
  for (const node of nodes) {
    if (typeof node === "string") {
      const lower = node.toLowerCase();
      if (lower.includes("resource_exhausted") || lower.includes("quota") || lower.includes("rate limit") || lower.includes("rate_limit") || lower.includes("too many requests") || /\b429\b/.test(lower)) {
        return true;
      }
      continue;
    }
    const status = node.status;
    const code = node.code ?? node.statusCode;
    const reason = typeof node.reason === "string" ? node.reason.toUpperCase() : "";
    const errCode = typeof node.error_code === "string" ? node.error_code.toUpperCase() : "";
    if (status === 429 || code === 429 || code === "429") return true;
    if (typeof status === "string" && status.toUpperCase() === "RESOURCE_EXHAUSTED") return true;
    if (errCode === "RESOURCE_EXHAUSTED") return true;
    if (reason.includes("QUOTA") || reason.includes("RATE_LIMIT")) return true;
  }
  return false;
}
function extractRetryAfterSeconds(err) {
  const nodes = collectErrorNodes(err);
  for (const node of nodes) {
    if (typeof node === "string") {
      const retryMatch = node.match(/retry\s+in\s+(\d+(?:\.\d+)?)\s*s/i) || node.match(/retryDelay["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)s?/i) || node.match(/retryAfterSeconds["']?\s*[:=]\s*(\d+)/i);
      if (retryMatch) {
        const val = Math.ceil(Number(retryMatch[1]));
        if (Number.isFinite(val) && val > 0) return val;
      }
      continue;
    }
    if (typeof node.retryAfterSeconds === "number" && node.retryAfterSeconds > 0) {
      return Math.ceil(node.retryAfterSeconds);
    }
    if (typeof node.retryDelay === "string") {
      const match = node.retryDelay.match(/(\d+(?:\.\d+)?)/);
      if (match) {
        const val = Math.ceil(Number(match[1]));
        if (Number.isFinite(val) && val > 0) return val;
      }
    }
    if (node.headers && typeof node.headers === "object") {
      const headers = node.headers;
      const ra = headers["retry-after"] ?? headers["Retry-After"];
      if (typeof ra === "string" || typeof ra === "number") {
        const val = Math.ceil(Number(ra));
        if (Number.isFinite(val) && val > 0) return val;
      }
    }
  }
  const fullText = nodes.filter((n) => typeof n === "string").join(" ").toLowerCase();
  if (fullText.includes("perday") || fullText.includes("per_day") || fullText.includes("daily")) {
    return 3600;
  }
  return 60;
}
function mapApiError(error) {
  if (error instanceof QuotaExhaustedError) {
    return error.toPayload();
  }
  if (error instanceof InputValidationError) {
    return {
      status: 400,
      error_code: "INVALID_ARGUMENT",
      retryable: false,
      message: error.message
    };
  }
  const errObj = error;
  const rawMessage = errObj?.message || "An unexpected speech synthesis error occurred.";
  if (isQuotaOrRateError(error)) {
    const retryAfterSeconds = extractRetryAfterSeconds(error);
    return {
      status: 429,
      error_code: "RESOURCE_EXHAUSTED",
      retryable: true,
      retryAfterSeconds,
      attemptedModels: Array.isArray(errObj?.attemptedModels) ? errObj.attemptedModels : void 0,
      message: "All configured TTS providers are currently unavailable due to API quota or rate limits. Enable billing on your Google AI project or add a fallback provider key in Settings > Secrets."
    };
  }
  if (rawMessage.includes("GEMINI_API_KEY")) {
    return {
      status: 400,
      error_code: "INVALID_ARGUMENT",
      retryable: false,
      message: rawMessage
    };
  }
  const numericStatus = typeof errObj?.status === "number" ? errObj.status : typeof errObj?.code === "number" ? errObj.code : 500;
  if (numericStatus === 403 || rawMessage.includes("PERMISSION_DENIED") || rawMessage.includes("API_KEY_INVALID")) {
    return {
      status: 403,
      error_code: "PERMISSION_DENIED",
      retryable: false,
      message: "Gemini API authentication failed. Please verify your key in Settings > Secrets."
    };
  }
  if (numericStatus === 400 || rawMessage.includes("INVALID_ARGUMENT")) {
    return {
      status: 400,
      error_code: "INVALID_ARGUMENT",
      retryable: false,
      message: rawMessage
    };
  }
  return {
    status: numericStatus >= 400 && numericStatus < 600 ? numericStatus : 500,
    error_code: "INTERNAL",
    retryable: numericStatus >= 500,
    message: rawMessage
  };
}

// src/server/wavAudio.ts
import { execFile } from "node:child_process";
import fs2 from "node:fs/promises";
import os from "node:os";
import path2 from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
function parseWavBuffer(buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF") {
    const sampleCount2 = Math.floor(buffer.length / 2);
    const pcm2 = new Int16Array(sampleCount2);
    for (let i = 0; i < sampleCount2; i += 1) {
      pcm2[i] = buffer.readInt16LE(i * 2);
    }
    return {
      sampleRate: 24e3,
      channels: 1,
      bitsPerSample: 16,
      pcm: pcm2,
      durationMs: Math.round(sampleCount2 / 24e3 * 1e3)
    };
  }
  let offset = 12;
  let sampleRate = 24e3;
  let channels = 1;
  let bitsPerSample = 16;
  let dataStart = 44;
  let dataSize = Math.max(0, buffer.length - 44);
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;
    if (chunkId === "fmt " && payloadOffset + 16 <= buffer.length) {
      channels = buffer.readUInt16LE(payloadOffset + 2) || 1;
      sampleRate = buffer.readUInt32LE(payloadOffset + 4) || 24e3;
      bitsPerSample = buffer.readUInt16LE(payloadOffset + 14) || 16;
    } else if (chunkId === "data") {
      dataStart = payloadOffset;
      dataSize = Math.min(chunkSize, Math.max(0, buffer.length - payloadOffset));
      break;
    }
    offset = payloadOffset + chunkSize + chunkSize % 2;
  }
  const bytesPerSample = Math.max(2, Math.floor(bitsPerSample / 8));
  const sampleCount = Math.floor(dataSize / bytesPerSample);
  const pcm = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const bytePos = dataStart + i * bytesPerSample;
    if (bytePos + 1 < buffer.length) {
      pcm[i] = buffer.readInt16LE(bytePos);
    }
  }
  const frames = Math.floor(sampleCount / Math.max(1, channels));
  const durationMs = Math.round(frames / Math.max(1, sampleRate) * 1e3);
  return { sampleRate, channels, bitsPerSample, pcm, durationMs };
}
function encodeWavBuffer(pcm, sampleRate, channels = 1) {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * bytesPerSample;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);
  const dataBuf = Buffer.allocUnsafe(dataSize);
  for (let i = 0; i < pcm.length; i += 1) {
    dataBuf.writeInt16LE(pcm[i], i * 2);
  }
  return Buffer.concat([header, dataBuf]);
}
function toMonoPcm(pcm, channels) {
  if (channels <= 1) return pcm;
  const frames = Math.floor(pcm.length / channels);
  const out = new Int16Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) {
      sum += pcm[f * channels + c];
    }
    out[f] = Math.round(sum / channels);
  }
  return out;
}
function toChannelCount(monoPcm, channels) {
  if (channels === 1) return monoPcm;
  const out = new Int16Array(monoPcm.length * 2);
  for (let i = 0; i < monoPcm.length; i += 1) {
    out[i * 2] = monoPcm[i];
    out[i * 2 + 1] = monoPcm[i];
  }
  return out;
}
function trimSilenceMono(pcm, sampleRate, thresholdDb = -42, padMs = 60) {
  if (pcm.length === 0) return pcm;
  const thresholdAmp = Math.pow(10, thresholdDb / 20) * 32767;
  const winSize = Math.max(64, Math.round(sampleRate * 0.01));
  const padSamples = Math.round(padMs / 1e3 * sampleRate);
  let firstActive = -1;
  let lastActive = -1;
  for (let start = 0; start < pcm.length; start += winSize) {
    const end = Math.min(pcm.length, start + winSize);
    let peak = 0;
    for (let i = start; i < end; i += 1) {
      const abs = Math.abs(pcm[i]);
      if (abs > peak) peak = abs;
    }
    if (peak >= thresholdAmp) {
      if (firstActive === -1) firstActive = start;
      lastActive = end;
    }
  }
  if (firstActive === -1 || lastActive === -1) {
    return pcm;
  }
  const trimmedStart = Math.max(0, firstActive - padSamples);
  const trimmedEnd = Math.min(pcm.length, lastActive + padSamples);
  return pcm.slice(trimmedStart, trimmedEnd);
}
function normalizeMonoPcm(pcm, targetPeakDb = -1, targetRmsDb = -16) {
  if (pcm.length === 0) return pcm;
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < pcm.length; i += 1) {
    const v = pcm[i];
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
    sumSq += v * v;
  }
  if (peak < 16) return pcm;
  const rms = Math.sqrt(sumSq / pcm.length);
  const desiredPeak = Math.pow(10, targetPeakDb / 20) * 32767;
  const desiredRms = Math.pow(10, targetRmsDb / 20) * 32767;
  const peakGain = desiredPeak / peak;
  const rmsGain = rms > 1 ? desiredRms / rms : peakGain;
  const gain = Math.min(peakGain * 1.35, Math.max(0.5, Math.min(rmsGain, 4)));
  const out = new Int16Array(pcm.length);
  const ceiling = desiredPeak;
  for (let i = 0; i < pcm.length; i += 1) {
    const scaled = pcm[i] * gain;
    if (Math.abs(scaled) <= ceiling) {
      out[i] = Math.round(scaled);
    } else {
      const sign = scaled < 0 ? -1 : 1;
      const excess = (Math.abs(scaled) - ceiling) / 32767;
      const limited = ceiling + (32767 - ceiling) * Math.tanh(excess * 2.5);
      out[i] = Math.round(sign * Math.min(32767, limited));
    }
  }
  return out;
}
function applyMasteringPresetMono(pcm, sampleRate, preset) {
  if (preset === "none" || pcm.length < 4) return pcm;
  const out = new Float64Array(pcm.length);
  const rc = 1 / (2 * Math.PI * 85);
  const dt = 1 / Math.max(8e3, sampleRate);
  const alpha = rc / (rc + dt);
  let prevIn = pcm[0];
  let prevHp = 0;
  let prevLp = pcm[0];
  const warmthWeight = preset === "podcast" || preset === "audiobook" ? 0.14 : 0.06;
  const presenceBoost = preset === "instagram_reel" ? 0.18 : preset === "youtube_narration" ? 0.12 : 0.06;
  for (let i = 0; i < pcm.length; i += 1) {
    const x = pcm[i];
    const hp = alpha * (prevHp + x - prevIn);
    prevIn = x;
    prevHp = hp;
    const lp = prevLp + 0.045 * (hp - prevLp);
    prevLp = lp;
    const high = hp - lp;
    out[i] = hp + warmthWeight * lp + presenceBoost * high;
  }
  const intOut = new Int16Array(pcm.length);
  for (let i = 0; i < out.length; i += 1) {
    intOut[i] = Math.max(-32767, Math.min(32767, Math.round(out[i])));
  }
  const targetRmsDb = preset === "instagram_reel" ? -13.5 : preset === "youtube_narration" ? -14.5 : preset === "podcast" ? -15.5 : -17.5;
  return normalizeMonoPcm(intOut, -0.8, targetRmsDb);
}
function resampleMonoPcm(pcm, fromRate, toRate) {
  if (fromRate === toRate || pcm.length < 2) return pcm;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.round(pcm.length / ratio));
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = pcm[Math.min(idx, pcm.length - 1)];
    const s1 = pcm[Math.min(idx + 1, pcm.length - 1)];
    out[i] = Math.round(s0 + (s1 - s0) * frac);
  }
  return out;
}
function timeStretchMonoPcm(pcm, sampleRate, speedFactor) {
  const clampedFactor = Math.max(0.65, Math.min(1.6, speedFactor));
  if (Math.abs(clampedFactor - 1) < 0.015 || pcm.length < sampleRate * 0.1) {
    return pcm;
  }
  const winSize = Math.max(256, Math.round(sampleRate * 0.032));
  const synthesisHop = Math.floor(winSize / 2);
  const analysisHop = Math.max(16, Math.round(synthesisHop * clampedFactor));
  const outLen = Math.max(winSize, Math.round(pcm.length / clampedFactor));
  const accum = new Float64Array(outLen + winSize);
  const norm = new Float64Array(outLen + winSize);
  const hann = new Float64Array(winSize);
  for (let i = 0; i < winSize; i += 1) {
    hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (winSize - 1)));
  }
  let inPos = 0;
  let outPos = 0;
  const searchRadius = Math.floor(winSize / 4);
  while (inPos + winSize < pcm.length && outPos + winSize < accum.length) {
    let bestInPos = inPos;
    if (outPos > 0) {
      let bestScore = -Infinity;
      const minP = Math.max(0, inPos - searchRadius);
      const maxP = Math.min(pcm.length - winSize - 1, inPos + searchRadius);
      for (let cand = minP; cand <= maxP; cand += 4) {
        let corr = 0;
        for (let k = 0; k < synthesisHop; k += 4) {
          corr += accum[outPos + k] * pcm[cand + k];
        }
        if (corr > bestScore) {
          bestScore = corr;
          bestInPos = cand;
        }
      }
    }
    for (let i = 0; i < winSize; i += 1) {
      const w = hann[i];
      accum[outPos + i] += pcm[bestInPos + i] * w;
      norm[outPos + i] += w;
    }
    inPos += analysisHop;
    outPos += synthesisHop;
  }
  const finalLen = Math.min(outLen, outPos + synthesisHop);
  const out = new Int16Array(finalLen);
  for (let i = 0; i < finalLen; i += 1) {
    const val = norm[i] > 1e-4 ? accum[i] / norm[i] : accum[i];
    out[i] = Math.max(-32767, Math.min(32767, Math.round(val)));
  }
  return out;
}
function extractSpeechEnvelope(pcm, sampleRate, channels = 1, frameMs = 25) {
  const mono = channels > 1 ? toMonoPcm(pcm, channels) : pcm;
  if (mono.length === 0) return [];
  const frameSamples = Math.max(64, Math.round(sampleRate * frameMs / 1e3));
  const intervals = [];
  for (let start = 0; start < mono.length; start += frameSamples) {
    const end = Math.min(mono.length, start + frameSamples);
    let sumSq = 0;
    for (let i = start; i < end; i += 1) {
      const normSample = mono[i] / 32767;
      sumSq += normSample * normSample;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    const rmsDb = rms > 1e-6 ? Number((20 * Math.log10(rms)).toFixed(1)) : -96;
    const speechActive = rmsDb > -38;
    const duckGainDb = speechActive ? -14 : 0;
    intervals.push({
      startMs: Math.round(start / sampleRate * 1e3),
      endMs: Math.round(end / sampleRate * 1e3),
      speechActive,
      rmsDb,
      duckGainDb
    });
  }
  return intervals;
}
function extractWaveformPeaks(pcm, channels = 1, bucketCount = 120) {
  const mono = channels > 1 ? toMonoPcm(pcm, channels) : pcm;
  if (mono.length === 0 || bucketCount <= 0) return [];
  const count = Math.max(8, Math.min(240, Math.round(bucketCount)));
  const bucketSize = Math.max(1, Math.floor(mono.length / count));
  const rawPeaks = [];
  let maxPeak = 0;
  for (let b = 0; b < count; b += 1) {
    const start = Math.min(mono.length - 1, Math.floor(b * mono.length / count));
    const end = Math.min(mono.length, Math.max(start + 1, Math.floor((b + 1) * mono.length / count), start + bucketSize));
    let peak = 0;
    for (let i = start; i < end; i += 1) {
      const abs = Math.abs(mono[i]);
      if (abs > peak) peak = abs;
    }
    rawPeaks.push(peak);
    if (peak > maxPeak) maxPeak = peak;
  }
  const divisor = maxPeak > 64 ? maxPeak : 32767;
  return rawPeaks.map((p) => Number(Math.max(0.04, Math.min(1, p / divisor)).toFixed(3)));
}
function processWavAudio(rawWavBuffer, options = {}) {
  const parsed = parseWavBuffer(rawWavBuffer);
  let mono = toMonoPcm(parsed.pcm, parsed.channels);
  if (options.trimSilence !== false) {
    mono = trimSilenceMono(mono, parsed.sampleRate);
  }
  if (typeof options.targetDurationSeconds === "number" && options.targetDurationSeconds > 0.3 && options.fitMode !== "natural") {
    const currentSec = mono.length / Math.max(1, parsed.sampleRate);
    const tol = options.durationToleranceSeconds ?? 0.35;
    const diff = Math.abs(currentSec - options.targetDurationSeconds);
    if (diff > tol) {
      const factor = currentSec / options.targetDurationSeconds;
      if (options.fitMode === "stretch" || factor >= 0.78) {
        mono = timeStretchMonoPcm(mono, parsed.sampleRate, factor);
      } else {
        const targetSamples = Math.round(options.targetDurationSeconds * parsed.sampleRate);
        if (mono.length > targetSamples) {
          mono = timeStretchMonoPcm(mono, parsed.sampleRate, factor);
        } else {
          const padded = new Int16Array(targetSamples);
          padded.set(mono, 0);
          mono = padded;
        }
      }
    }
  }
  const targetRate = options.targetSampleRate || 48e3;
  if (parsed.sampleRate !== targetRate) {
    mono = resampleMonoPcm(mono, parsed.sampleRate, targetRate);
  }
  const preset = options.masteringPreset || "none";
  if (preset !== "none") {
    mono = applyMasteringPresetMono(mono, targetRate, preset);
  } else if (options.normalize !== false) {
    mono = normalizeMonoPcm(mono);
  }
  const targetChannels = options.targetChannels === 2 ? 2 : 1;
  const finalPcm = toChannelCount(mono, targetChannels);
  const wavBuffer = encodeWavBuffer(finalPcm, targetRate, targetChannels);
  const durationMs = Math.round(mono.length / targetRate * 1e3);
  const speechEnvelope = extractSpeechEnvelope(mono, targetRate, 1, 25);
  const waveformPeaks = extractWaveformPeaks(mono, 1, 120);
  return {
    wavBuffer,
    sampleRate: targetRate,
    channels: targetChannels,
    durationMs,
    speechEnvelope,
    waveformPeaks
  };
}
function stitchWavBuffers(wavBuffers, gapMs = 160, targetRate = 48e3, targetChannels = 1) {
  const gapSamples = Math.max(0, Math.round(gapMs / 1e3 * targetRate));
  const monoSegments = [];
  const offsetsMs = [];
  let totalSamples = 0;
  for (let i = 0; i < wavBuffers.length; i += 1) {
    const parsed = parseWavBuffer(wavBuffers[i]);
    let mono = toMonoPcm(parsed.pcm, parsed.channels);
    mono = trimSilenceMono(mono, parsed.sampleRate, -44, 40);
    if (parsed.sampleRate !== targetRate) {
      mono = resampleMonoPcm(mono, parsed.sampleRate, targetRate);
    }
    const startMs = Math.round(totalSamples / targetRate * 1e3);
    totalSamples += mono.length;
    const endMs = Math.round(totalSamples / targetRate * 1e3);
    offsetsMs.push({ startMs, endMs });
    monoSegments.push(mono);
    if (i < wavBuffers.length - 1) {
      totalSamples += gapSamples;
    }
  }
  const combinedMono = new Int16Array(totalSamples);
  let cursor = 0;
  for (let i = 0; i < monoSegments.length; i += 1) {
    combinedMono.set(monoSegments[i], cursor);
    cursor += monoSegments[i].length;
    if (i < monoSegments.length - 1) {
      cursor += gapSamples;
    }
  }
  const normalized = normalizeMonoPcm(combinedMono);
  const finalPcm = toChannelCount(normalized, targetChannels);
  const wavBuffer = encodeWavBuffer(finalPcm, targetRate, targetChannels);
  const durationMs = Math.round(normalized.length / targetRate * 1e3);
  const speechEnvelope = extractSpeechEnvelope(normalized, targetRate, 1, 25);
  const waveformPeaks = extractWaveformPeaks(normalized, 1, 120);
  return { wavBuffer, durationMs, offsetsMs, speechEnvelope, waveformPeaks };
}
function getAudioMimeType(format) {
  switch (format) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "flac":
      return "audio/flac";
    default:
      return "audio/wav";
  }
}
async function transcodeWavToFormat(wavBuffer, format, bitrateKbps = 192) {
  if (format === "wav") {
    return { buffer: wavBuffer, mimeType: "audio/wav", actualFormat: "wav" };
  }
  const tmpDir = await fs2.mkdtemp(path2.join(os.tmpdir(), "svara-encode-"));
  const inPath = path2.join(tmpDir, "input.wav");
  const outPath = path2.join(tmpDir, `output.${format}`);
  try {
    await fs2.writeFile(inPath, wavBuffer);
    const args = ["-y", "-i", inPath];
    if (format === "mp3") {
      args.push("-c:a", "libmp3lame", "-b:a", `${bitrateKbps}k`);
    } else if (format === "m4a") {
      args.push("-c:a", "aac", "-b:a", `${bitrateKbps}k`, "-movflags", "+faststart");
    } else if (format === "flac") {
      args.push("-c:a", "flac");
    }
    args.push(outPath);
    await execFileAsync("ffmpeg", args, { timeout: 25e3 });
    const outBuffer = await fs2.readFile(outPath);
    return {
      buffer: outBuffer,
      mimeType: getAudioMimeType(format),
      actualFormat: format
    };
  } finally {
    await fs2.rm(tmpDir, { recursive: true, force: true }).catch(() => {
    });
  }
}

// src/server/ttsService.ts
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
var chunkSynthesisCache = /* @__PURE__ */ new Map();
var MAX_CHUNK_CACHE = 80;
function makeChunkCacheKey(params) {
  return crypto2.createHash("sha1").update(`${params.voiceName}|${params.styleInstruction}|${params.seed ?? ""}|${params.text}`).digest("hex");
}
function saveChunkToCache(key, buffer, actualModel) {
  chunkSynthesisCache.set(key, { buffer, actualModel, createdAt: Date.now() });
  if (chunkSynthesisCache.size > MAX_CHUNK_CACHE) {
    const oldestKey = chunkSynthesisCache.keys().next().value;
    if (oldestKey) chunkSynthesisCache.delete(oldestKey);
  }
}
var GEMINI_STANDARD_CHAIN = [
  "gemini-3.8-flash-lite-tts",
  "gemini-2.5-flash-preview-tts",
  "gemini-3.8-flash-tts",
  "gemini-2.5-pro-preview-tts"
];
var GEMINI_EXPRESSIVE_CHAIN = [
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts"
];
function buildCandidateChain(preferredModel, modelTier) {
  const baseList = modelTier === "expressive" ? [...GEMINI_EXPRESSIVE_CHAIN] : [...GEMINI_STANDARD_CHAIN];
  const ordered = [preferredModel, ...baseList.filter((m) => m !== preferredModel)];
  if (process.env.OPENAI_API_KEY?.trim()) {
    ordered.push("openai:gpt-4o-mini-tts");
  }
  if (process.env.ELEVENLABS_API_KEY?.trim()) {
    ordered.push("elevenlabs:eleven_multilingual_v2");
  }
  return ordered;
}
function isModelNotFoundOrUnsupported(err) {
  const obj = err;
  const msg = String(obj?.message || "").toLowerCase();
  const status = obj?.status ?? obj?.code;
  return status === 404 || msg.includes("not found") || msg.includes("is not supported") || msg.includes("unknown model") || msg.includes("model_not_found");
}
async function callGeminiSingleTtsModel(params) {
  const config = {
    responseModalities: ["AUDIO"],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: params.voiceName }
      }
    }
  };
  if (typeof params.seed === "number" && Number.isFinite(params.seed)) {
    config.seed = Math.round(params.seed);
  }
  const isGemini25 = params.model.startsWith("gemini-2.5");
  const cleanText = params.text.trim();
  const partPayload = isGemini25 ? {
    text: params.styleInstruction ? `Deliver with the following style (${params.styleInstruction}): ${cleanText}` : cleanText
  } : {
    text: cleanText,
    speechMetadata: {
      style: params.styleInstruction || "Natural, clear voice delivery"
    }
  };
  const response = await params.ai.models.generateContent({
    model: params.model,
    contents: [{ role: "user", parts: [partPayload] }],
    config
  });
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const audioPart = parts.find((p) => p.inlineData?.data);
  const base64Audio = audioPart?.inlineData?.data;
  if (!base64Audio) {
    const err = new Error(
      `Model ${params.model} did not return audio data.`
    );
    err.status = 502;
    throw err;
  }
  const rawBuf = Buffer.from(base64Audio, "base64");
  if (rawBuf.length >= 4 && rawBuf.toString("ascii", 0, 4) === "RIFF") {
    return rawBuf;
  }
  const pcm16 = new Int16Array(
    rawBuf.buffer,
    rawBuf.byteOffset,
    Math.floor(rawBuf.byteLength / 2)
  );
  return encodeWavBuffer(pcm16, 24e3, 1);
}
function mapVoiceToOpenAi(voiceName) {
  switch (voiceName) {
    case "Charon":
      return "onyx";
    case "Fenrir":
      return "ash";
    case "Puck":
      return "echo";
    case "Zephyr":
      return "nova";
    case "Kore":
    default:
      return "coral";
  }
}
async function callOpenAiTts(params) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: mapVoiceToOpenAi(params.voiceName),
      input: params.text.trim(),
      instructions: params.styleInstruction || void 0,
      response_format: "wav"
    })
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const retryHeader = res.headers.get("retry-after");
    const err = new Error(`OpenAI TTS failed (${res.status}): ${errBody}`);
    err.status = res.status;
    if (retryHeader) err.retryAfterSeconds = Number(retryHeader);
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}
async function callElevenLabsTts(params) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");
  const voiceId = params.voiceName === "Charon" || params.voiceName === "Fenrir" ? "pNInz6obpgDQGcFmaJgB" : params.voiceName === "Puck" ? "TxGEqnHWrfWFTfGW9XjX" : "21m00Tcm4TlvDq8ikWAM";
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: params.text.trim(),
        model_id: "eleven_multilingual_v2"
      })
    }
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const retryHeader = res.headers.get("retry-after");
    const err = new Error(`ElevenLabs TTS failed (${res.status}): ${errBody}`);
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
  return encodeWavBuffer(pcm16, 24e3, 1);
}
async function synthesizeSingleChunkAcrossProviders(params) {
  if (params.useChunkCache) {
    const key = makeChunkCacheKey(params);
    const cached = chunkSynthesisCache.get(key);
    if (cached) {
      return { buffer: cached.buffer, actualModel: cached.actualModel };
    }
  }
  const candidates = buildCandidateChain(params.preferredModel, params.modelTier);
  const attemptedModels = [];
  let sawQuota = false;
  let maxRetryAfter = 0;
  let lastNonQuotaError = null;
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
      let buffer;
      if (candidate === "openai:gpt-4o-mini-tts") {
        buffer = await callOpenAiTts({
          text: params.text,
          voiceName: params.voiceName,
          styleInstruction: params.styleInstruction
        });
      } else if (candidate === "elevenlabs:eleven_multilingual_v2") {
        buffer = await callElevenLabsTts({
          text: params.text,
          voiceName: params.voiceName
        });
      } else {
        buffer = await callGeminiSingleTtsModel({
          ai: params.ai,
          model: candidate,
          text: params.text,
          voiceName: params.voiceName,
          styleInstruction: params.styleInstruction,
          seed: params.seed
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
      lastNonQuotaError = err;
      const errStatus = err?.status;
      if (i < candidates.length - 1 && (errStatus === 400 || errStatus === 502 || errStatus === 503)) {
        continue;
      }
      throw err;
    }
  }
  if (sawQuota) {
    throw new QuotaExhaustedError({
      attemptedModels,
      retryAfterSeconds: maxRetryAfter || 3600
    });
  }
  if (lastNonQuotaError) {
    throw lastNonQuotaError;
  }
  throw new QuotaExhaustedError({
    attemptedModels,
    retryAfterSeconds: 3600
  });
}
async function generateTextWithFallback(params) {
  const models = [params.primaryModel, params.fallbackModel || "gemini-2.5-flash"].filter(
    (m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx
  );
  const attemptedModels = [];
  let sawQuota = false;
  let maxRetryAfter = 0;
  let lastError;
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
        contents: params.contents,
        config: params.config
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
      retryAfterSeconds: maxRetryAfter || 3600
    });
  }
  throw lastError || new Error("Text model call failed.");
}
async function synthesizeSpeech(payload) {
  const validation = validateGeneratePayload(payload);
  if (!validation.valid) {
    throw new InputValidationError(validation.error || "Invalid synthesis payload.");
  }
  const mode = payload.mode === "multi" ? "multi" : "single";
  const language = payload.language || "en";
  const modelTier = payload.modelTier === "expressive" ? "expressive" : "standard";
  const speed = clampSpeed(typeof payload.speed === "number" ? payload.speed : 1);
  const pitchRegister = payload.pitchRegister || "balanced";
  const emotionIntensity = payload.emotionIntensity || "natural";
  const format = payload.format || "wav";
  const targetSampleRate = payload.sampleRate || 48e3;
  const targetChannels = payload.channels === 2 ? 2 : 1;
  const normalize = payload.normalize ?? true;
  const trimSilence = payload.trimSilence ?? true;
  const masteringPreset = payload.masteringPreset || "none";
  const bitrateKbps = payload.bitrateKbps || 192;
  const activePronunciations = payload.applyPronunciations === false ? [] : payload.pronunciationRules ?? listPronunciations();
  const resolvedVoicePreset = VOICE_PRESETS.find((v) => v.id === payload.voiceId) ?? VOICE_PRESETS.find((v) => v.baseVoice === payload.voiceName) ?? VOICE_PRESETS[0];
  const voiceId = resolvedVoicePreset.id;
  const voiceName = payload.voiceName || resolvedVoicePreset.baseVoice;
  const voiceDisplayName = payload.customVoiceDescription?.trim() ? `Custom (${voiceName})` : `${resolvedVoicePreset.name} (${resolvedVoicePreset.roleTitle})`;
  let actualModelUsed = selectTtsModel({
    mode,
    modelTier,
    text: payload.text || "",
    customVoiceDescription: payload.customVoiceDescription,
    dialogueLines: payload.dialogueLines
  });
  const ai = getGeminiClient();
  const appliedPronunciations = /* @__PURE__ */ new Set();
  let rawMasterWav = null;
  let displayTextForCaptions = "";
  let segmentsMeta;
  let alignedWordsFromSegments;
  let segmentTimingConfidence;
  let stemsMeta;
  if (mode === "multi") {
    const nonEmptyLines = (payload.dialogueLines ?? []).filter((l) => l.text.trim().length > 0);
    const speakerMap = /* @__PURE__ */ new Map();
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
    displayTextForCaptions = nonEmptyLines.map((l) => `${speakerMap.get(l.speakerKey)?.name || l.speakerKey}: ${stripInlinePerformanceTags(l.text)}`).join(" ");
    if (useNativeDual) {
      const keyA = activeSpeakerKeys[0] || "A";
      const keyB = activeSpeakerKeys[1] || (keyA === "A" ? "B" : "A");
      const spA = speakerMap.get(keyA) || {
        name: "Vikram",
        voiceId: "vikram",
        baseVoice: "Puck",
        style: "Conversational host"
      };
      const spB = speakerMap.get(keyB) || {
        name: "Ananya",
        voiceId: "ananya",
        baseVoice: "Zephyr",
        style: "Warm co-host"
      };
      const parts = nonEmptyLines.map((line) => {
        const speaker = line.speakerKey === keyA ? spA : spB;
        const pron = applyPronunciationRules(line.text.trim(), activePronunciations, language);
        pron.appliedTerms.forEach((t) => appliedPronunciations.add(t));
        const speakerStyle = buildStyleInstruction({
          language,
          stylePrompt: speaker.style || "Natural conversational dialogue",
          speed,
          pitchRegister,
          emotionIntensity,
          expressiveControls: payload.expressiveControls,
          pronunciationPrompt: pron.pronunciationPrompt,
          emotionHint: getEmotionStyleHint(line.emotion)
        });
        return {
          text: `${speaker.name}: ${pron.ttsText}`,
          speechMetadata: {
            speaker: speaker.name,
            style: speakerStyle
          }
        };
      });
      const nativeMultiModel = "gemini-3.8-flash-tts";
      let nativeSuccess = false;
      if (!isModelOnCooldown(nativeMultiModel)) {
        try {
          const response = await ai.models.generateContent({
            model: nativeMultiModel,
            contents: [{ role: "user", parts }],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: [
                    {
                      speaker: spA.name,
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: spA.baseVoice || "Puck" } }
                    },
                    {
                      speaker: spB.name,
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: spB.baseVoice || "Kore" } }
                    }
                  ]
                }
              }
            }
          });
          const audioPart = (response.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
          if (audioPart?.inlineData?.data) {
            rawMasterWav = Buffer.from(audioPart.inlineData.data, "base64");
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
        const fallbackBuffers = [];
        for (const line of nonEmptyLines) {
          const speaker = line.speakerKey === keyA ? spA : spB;
          const pron = applyPronunciationRules(line.text.trim(), activePronunciations, language);
          pron.appliedTerms.forEach((t) => appliedPronunciations.add(t));
          const speakerStyle = buildStyleInstruction({
            language,
            stylePrompt: speaker.style || "Natural conversational dialogue",
            speed,
            pitchRegister,
            emotionIntensity,
            expressiveControls: payload.expressiveControls,
            pronunciationPrompt: pron.pronunciationPrompt,
            emotionHint: getEmotionStyleHint(line.emotion)
          });
          const resTurn = await synthesizeSingleChunkAcrossProviders({
            ai,
            preferredModel: "gemini-3.8-flash-lite-tts",
            modelTier: "standard",
            text: pron.ttsText,
            voiceName: speaker.baseVoice || "Puck",
            styleInstruction: speakerStyle,
            seed: payload.seed,
            useChunkCache: true
          });
          fallbackBuffers.push(resTurn.buffer);
          actualModelUsed = resTurn.actualModel;
        }
        const stitched = stitchWavBuffers(fallbackBuffers, 140, targetSampleRate, targetChannels);
        rawMasterWav = stitched.wavBuffer;
      }
    } else {
      const lineBuffers = [];
      const speakerBuckets = /* @__PURE__ */ new Map();
      for (const line of nonEmptyLines) {
        const sp = speakerMap.get(line.speakerKey) || {
          name: `Speaker ${line.speakerKey}`,
          voiceId: "vikram",
          baseVoice: "Puck",
          style: "Conversational speaker"
        };
        const pron = applyPronunciationRules(line.text.trim(), activePronunciations, language);
        pron.appliedTerms.forEach((t) => appliedPronunciations.add(t));
        const styleInstruction = buildStyleInstruction({
          language,
          stylePrompt: sp.style || "Conversational speaker",
          speed,
          pitchRegister,
          emotionIntensity,
          expressiveControls: payload.expressiveControls,
          pronunciationPrompt: pron.pronunciationPrompt,
          emotionHint: getEmotionStyleHint(line.emotion)
        });
        const turnResult = await synthesizeSingleChunkAcrossProviders({
          ai,
          preferredModel: actualModelUsed,
          modelTier,
          text: pron.ttsText,
          voiceName: sp.baseVoice || "Puck",
          styleInstruction,
          seed: payload.seed,
          useChunkCache: true
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
            format: "wav",
            mimeType: "audio/wav",
            sampleRate: targetSampleRate,
            channels: targetChannels,
            durationMs: stemStitched.durationMs,
            voiceId,
            voiceName: speakerName,
            modelUsed: actualModelUsed,
            language,
            displayText: `${speakerName} stem`,
            masteringPreset,
            timingSource: "estimated",
            timingConfidence: 0.5,
            wordTimings: [],
            phraseTimings: [],
            speechEnvelope: stemStitched.speechEnvelope,
            waveformPeaks: stemStitched.waveformPeaks
          });
          stemsMeta.push({
            speaker: speakerName,
            clipId: stemRecord.id,
            audioUrl: `/api/clips/${stemRecord.id}.wav`,
            durationMs: stemStitched.durationMs
          });
        }
      }
    }
  } else {
    const rawScript = (payload.text || "").trim();
    const parsedSegments = splitScriptIntoSegments(rawScript);
    const hasMultipleEmotions = new Set(parsedSegments.map((s) => s.emotion).filter(Boolean)).size > 1;
    const useSegmentPipeline = Boolean(payload.segmentMode) || parsedSegments.length > 1 && hasMultipleEmotions;
    displayTextForCaptions = stripInlinePerformanceTags(rawScript);
    if (useSegmentPipeline && parsedSegments.length > 1) {
      const segRawWavs = [];
      const segProcessedInfos = [];
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
          emotionHint: seg.emotionPrompt
        });
        const segRes = await synthesizeSingleChunkAcrossProviders({
          ai,
          preferredModel: actualModelUsed,
          modelTier,
          text: pron.ttsText,
          voiceName,
          styleInstruction: segStyle,
          seed: payload.seed,
          useChunkCache: true
        });
        actualModelUsed = segRes.actualModel;
        const processedSeg = processWavAudio(segRes.buffer, {
          targetSampleRate,
          targetChannels,
          trimSilence: true,
          normalize,
          masteringPreset
        });
        segRawWavs.push(processedSeg.wavBuffer);
        segProcessedInfos.push({
          seg,
          wavBuffer: processedSeg.wavBuffer,
          durationMs: processedSeg.durationMs
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
          format: "wav",
          mimeType: "audio/wav",
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
          waveformPeaks: extractWaveformPeaks(parsedSegWav.pcm, parsedSegWav.channels, 120)
        });
        segmentsMeta.push({
          index: i,
          text: info.seg.displayText,
          emotion: info.seg.emotion,
          clipId: segRecord.id,
          audioUrl: `/api/clips/${segRecord.id}.wav`,
          durationMs: info.durationMs,
          startMs: offset.startMs,
          endMs: offset.endMs
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
            startSeconds: Number((absStart / 1e3).toFixed(3)),
            endSeconds: Number((absEnd / 1e3).toFixed(3))
          });
        }
      }
      segmentTimingConfidence = Number((confSum / Math.max(1, segProcessedInfos.length)).toFixed(2));
    } else {
      const pron = applyPronunciationRules(rawScript, activePronunciations, language);
      pron.appliedTerms.forEach((t) => appliedPronunciations.add(t));
      const singleEmotion = parsedSegments[0]?.emotionPrompt;
      const cleanTtsText = pron.ttsText.replace(/\[[A-Z_]{2,24}\]/g, "").replace(/\s+/g, " ").trim();
      const baseStyleInstruction = buildStyleInstruction({
        language,
        stylePrompt: payload.stylePrompt || "",
        customVoiceDescription: payload.customVoiceDescription,
        speed,
        pitchRegister,
        emotionIntensity,
        expressiveControls: payload.expressiveControls,
        pronunciationPrompt: pron.pronunciationPrompt,
        emotionHint: singleEmotion
      });
      const chunkPlans = splitLongScriptIntoChunkPlans(pron.ttsText || cleanTtsText, 3500);
      if (chunkPlans.length <= 1) {
        const singleText = (chunkPlans[0]?.text || cleanTtsText || pron.ttsText).replace(/\[[A-Z_]{2,24}\]/g, "").replace(/\s+/g, " ").trim();
        const singleRes = await synthesizeSingleChunkAcrossProviders({
          ai,
          preferredModel: actualModelUsed,
          modelTier,
          text: singleText,
          voiceName,
          styleInstruction: baseStyleInstruction,
          seed: payload.seed,
          useChunkCache: false
        });
        rawMasterWav = singleRes.buffer;
        actualModelUsed = singleRes.actualModel;
      } else {
        const chunkWavs = [];
        for (const plan of chunkPlans) {
          const chunkCleanText = plan.text.replace(/\[[A-Z_]{2,24}\]/g, "").replace(/\s+/g, " ").trim();
          if (!chunkCleanText) continue;
          const chunkStyle = plan.emotion ? buildStyleInstruction({
            language,
            stylePrompt: payload.stylePrompt || "",
            customVoiceDescription: payload.customVoiceDescription,
            speed,
            pitchRegister,
            emotionIntensity,
            expressiveControls: payload.expressiveControls,
            pronunciationPrompt: pron.pronunciationPrompt,
            emotionHint: getEmotionStyleHint(plan.emotion)
          }) : baseStyleInstruction;
          const chunkRes = await synthesizeSingleChunkAcrossProviders({
            ai,
            preferredModel: actualModelUsed,
            modelTier,
            text: chunkCleanText,
            voiceName,
            styleInstruction: chunkStyle,
            seed: payload.seed,
            useChunkCache: true
          });
          actualModelUsed = chunkRes.actualModel;
          const cleanChunk = processWavAudio(chunkRes.buffer, {
            targetSampleRate,
            targetChannels: 1,
            trimSilence: true,
            normalize: false,
            masteringPreset: "none"
          });
          chunkWavs.push(cleanChunk.wavBuffer);
        }
        const averageGap = Math.round(
          chunkPlans.slice(0, -1).reduce((acc, p) => acc + (p.breakAfterMs || 150), 0) / Math.max(1, chunkPlans.length - 1)
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
  const processed = processWavAudio(rawMasterWav, {
    targetSampleRate,
    targetChannels,
    trimSilence,
    normalize,
    masteringPreset,
    targetDurationSeconds: payload.targetDurationSeconds,
    durationToleranceSeconds: payload.durationToleranceSeconds,
    fitMode: payload.fitMode || "stretch"
  });
  const parsedMaster = parseWavBuffer(processed.wavBuffer);
  let wordTimings;
  let phraseTimings;
  let timingSource;
  let timingConfidence;
  if (alignedWordsFromSegments) {
    const origLastMs = alignedWordsFromSegments[alignedWordsFromSegments.length - 1]?.endMs || processed.durationMs;
    const scale = origLastMs > 0 ? processed.durationMs / origLastMs : 1;
    wordTimings = Math.abs(scale - 1) > 0.03 ? alignedWordsFromSegments.map((w) => {
      const s = Math.round(w.startMs * scale);
      const e = Math.max(s + 35, Math.min(processed.durationMs, Math.round(w.endMs * scale)));
      return {
        ...w,
        startMs: s,
        endMs: e,
        startSeconds: Number((s / 1e3).toFixed(3)),
        endSeconds: Number((e / 1e3).toFixed(3))
      };
    }) : alignedWordsFromSegments;
    phraseTimings = alignWordsToEnvelope(
      displayTextForCaptions,
      processed.durationMs,
      processed.speechEnvelope
    ).phraseTimings;
    timingSource = "forced_alignment";
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
  const encoded = await transcodeWavToFormat(processed.wavBuffer, format, bitrateKbps);
  const saved = saveStoredClip({
    wavBuffer: processed.wavBuffer,
    encodedBuffer: encoded.actualFormat !== "wav" ? encoded.buffer : void 0,
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
    segments: segmentsMeta
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
      downloadUrl: `/api/clips/${saved.id}.${encoded.actualFormat}?download=1`
    });
  }
  const audioUrl = `/api/clips/${saved.id}.${encoded.actualFormat}`;
  const downloadUrl = `/api/clips/${saved.id}.${encoded.actualFormat}?download=1`;
  return {
    clipId: saved.id,
    audioUrl,
    downloadUrl,
    audioBase64: encoded.buffer.toString("base64"),
    mimeType: encoded.mimeType,
    format: encoded.actualFormat,
    sampleRate: processed.sampleRate,
    channels: processed.channels,
    sizeBytes: encoded.buffer.length,
    modelUsed: actualModelUsed,
    voiceId,
    voiceName: voiceDisplayName,
    voiceUsed: voiceDisplayName,
    durationEstimateSec: Math.max(1, Math.round(processed.durationMs / 1e3)),
    durationMs: processed.durationMs,
    timingSource,
    timingConfidence,
    ...payload.returnWordTimings === false ? {} : { wordTimings, phraseTimings },
    speechEnvelope: processed.speechEnvelope,
    ...payload.returnWaveformPeaks === false ? {} : { waveformPeaks: processed.waveformPeaks },
    segments: segmentsMeta,
    stems: stemsMeta,
    appliedPronunciations: Array.from(appliedPronunciations)
  };
}
async function regenerateClipSegment(params) {
  const existing = getClipRecord(params.clipId);
  if (!existing || !existing.segments || !existing.segments[params.segmentIndex]) {
    throw new InputValidationError("Clip or segment index not found.");
  }
  const segments = [...existing.segments];
  const targetSeg = segments[params.segmentIndex];
  const nextText = (params.text ?? targetSeg.text).trim();
  if (!nextText) {
    throw new InputValidationError("Replacement segment text cannot be empty.");
  }
  const nextEmotion = params.emotion ?? targetSeg.emotion;
  const voicePreset = VOICE_PRESETS.find((v) => v.id === (params.voiceId || existing.voiceId)) ?? VOICE_PRESETS[0];
  const activePronunciations = listPronunciations();
  const pron = applyPronunciationRules(nextText, activePronunciations, existing.language);
  const styleInstruction = buildStyleInstruction({
    language: existing.language,
    stylePrompt: params.stylePrompt || voicePreset.defaultStyle,
    speed: params.speed ?? 1,
    pronunciationPrompt: pron.pronunciationPrompt,
    emotionHint: getEmotionStyleHint(nextEmotion)
  });
  const ai = getGeminiClient();
  const segResult = await synthesizeSingleChunkAcrossProviders({
    ai,
    preferredModel: existing.modelUsed || "gemini-3.8-flash-lite-tts",
    modelTier: existing.modelUsed === "gemini-3.8-flash-tts" ? "expressive" : "standard",
    text: pron.ttsText,
    voiceName: voicePreset.baseVoice,
    styleInstruction,
    useChunkCache: true
  });
  const processedNewSeg = processWavAudio(segResult.buffer, {
    targetSampleRate: existing.sampleRate,
    targetChannels: existing.channels,
    trimSilence: true,
    normalize: true,
    masteringPreset: existing.masteringPreset
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
    format: "wav",
    mimeType: "audio/wav",
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
    waveformPeaks: extractWaveformPeaks(parsedNewSeg.pcm, existing.channels, 120)
  });
  segments[params.segmentIndex] = {
    index: params.segmentIndex,
    text: nextText,
    emotion: nextEmotion,
    clipId: savedNewSeg.id,
    audioUrl: `/api/clips/${savedNewSeg.id}.wav`,
    durationMs: processedNewSeg.durationMs,
    startMs: targetSeg.startMs,
    endMs: targetSeg.startMs + processedNewSeg.durationMs
  };
  const segBuffers = [];
  for (const seg of segments) {
    const segAudio = getClipAudioBuffer(seg.clipId, true);
    if (segAudio) segBuffers.push(segAudio.buffer);
  }
  const stitched = stitchWavBuffers(segBuffers, 140, existing.sampleRate, existing.channels);
  const updatedSegments = [];
  const combinedWords = [];
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const off = stitched.offsetsMs[i];
    const segRec = getClipRecord(seg.clipId);
    updatedSegments.push({
      ...seg,
      startMs: off.startMs,
      endMs: off.endMs,
      durationMs: off.endMs - off.startMs
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
          startSeconds: Number((absStart / 1e3).toFixed(3)),
          endSeconds: Number((absEnd / 1e3).toFixed(3))
        });
      }
    }
  }
  const fullDisplayText = updatedSegments.map((s) => s.text).join(" ");
  const fullPhraseTimings = alignWordsToEnvelope(
    fullDisplayText,
    stitched.durationMs,
    stitched.speechEnvelope
  ).phraseTimings;
  const savedMaster = saveStoredClip({
    wavBuffer: stitched.wavBuffer,
    format: "wav",
    mimeType: "audio/wav",
    sampleRate: existing.sampleRate,
    channels: existing.channels,
    durationMs: stitched.durationMs,
    voiceId: existing.voiceId,
    voiceName: existing.voiceName,
    modelUsed: segResult.actualModel,
    language: existing.language,
    displayText: fullDisplayText,
    masteringPreset: existing.masteringPreset,
    timingSource: "forced_alignment",
    timingConfidence: segAlign.timingConfidence,
    wordTimings: combinedWords,
    phraseTimings: fullPhraseTimings,
    speechEnvelope: stitched.speechEnvelope,
    waveformPeaks: stitched.waveformPeaks,
    segments: updatedSegments
  });
  return {
    clipId: savedMaster.id,
    audioUrl: `/api/clips/${savedMaster.id}.wav`,
    downloadUrl: `/api/clips/${savedMaster.id}.wav?download=1`,
    audioBase64: stitched.wavBuffer.toString("base64"),
    mimeType: "audio/wav",
    format: "wav",
    sampleRate: savedMaster.sampleRate,
    channels: savedMaster.channels,
    sizeBytes: stitched.wavBuffer.length,
    modelUsed: savedMaster.modelUsed,
    voiceId: savedMaster.voiceId,
    voiceName: savedMaster.voiceName,
    voiceUsed: savedMaster.voiceName,
    durationEstimateSec: Math.max(1, Math.round(stitched.durationMs / 1e3)),
    durationMs: stitched.durationMs,
    timingSource: "forced_alignment",
    timingConfidence: segAlign.timingConfidence,
    wordTimings: combinedWords,
    phraseTimings: fullPhraseTimings,
    speechEnvelope: stitched.speechEnvelope,
    waveformPeaks: stitched.waveformPeaks,
    segments: updatedSegments
  };
}
async function translateSpeechScript(text, targetLanguage, preserveDuration = false) {
  if (!text || !text.trim()) {
    throw new InputValidationError("Enter text to translate or adapt.");
  }
  const ai = getGeminiClient();
  const targetDesc = targetLanguage === "hi" ? "natural, spoken Hindi in Devanagari script (\u0939\u093F\u0928\u094D\u0926\u0940)" : targetLanguage === "bilingual" ? "natural urban Hinglish (blending Hindi in Devanagari with conversational English phrases where natural)" : "natural, expressive English";
  const durationRule = preserveDuration ? " Match the approximate spoken syllable count and sentence pacing of the source so the localized voiceover fits the same video duration." : "";
  const response = await generateTextWithFallback({
    ai,
    primaryModel: "gemini-4-hydrogen",
    fallbackModel: "gemini-2.5-flash",
    contents: `Translate or adapt the following voiceover script into ${targetDesc}.${durationRule} Preserve any inline vocal tags like <breath>, <laugh>, <chuckle>, <sigh>, <gasp>, |yeah|, |mhm|, or [CURIOUS]/[AWE] exactly as written. Return ONLY the adapted script text with no commentary or quotes.

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
async function localizeNarration(params) {
  if (!params.text?.trim()) {
    throw new InputValidationError("Script text is required for localization.");
  }
  const srcStats = countWordsAndChars(params.text);
  const targetSec = params.targetDurationSeconds || (params.preserveDuration ? Math.max(2, srcStats.estimatedSeconds) : void 0);
  const outputs = [];
  for (const lang of params.targetLanguages) {
    const localizedText = await translateSpeechScript(params.text, lang, Boolean(params.preserveDuration));
    const defaultVoice = lang === "hi" ? "aarav" : lang === "bilingual" ? "vikram" : "ethan";
    const vPreset = VOICE_PRESETS.find((v) => v.id === (params.voiceId || defaultVoice)) ?? VOICE_PRESETS[0];
    const res = await synthesizeSpeech({
      mode: "single",
      language: lang,
      modelTier: "standard",
      text: localizedText,
      voiceId: vPreset.id,
      voiceName: vPreset.baseVoice,
      stylePrompt: vPreset.defaultStyle,
      speed: 1,
      sampleRate: params.sampleRate || 48e3,
      channels: params.channels || 1,
      masteringPreset: params.masteringPreset || "instagram_reel",
      targetDurationSeconds: targetSec,
      fitMode: params.preserveDuration ? "stretch" : "natural"
    });
    const srt = generateSubtitles({
      wordTimings: res.wordTimings || [],
      format: "srt",
      preset: "rainbow_reels"
    });
    outputs.push({
      language: lang,
      script: localizedText,
      result: res,
      srt
    });
  }
  return outputs;
}
async function resolveInputAudioBuffer(input) {
  if (input.clipId) {
    const found = getClipAudioBuffer(input.clipId, true);
    if (!found) {
      throw new InputValidationError(`Audio clip '${input.clipId}' was not found.`);
    }
    return {
      buffer: found.buffer,
      mimeType: found.mimeType,
      sourceText: found.record.displayText
    };
  }
  if (input.audioBase64) {
    const clean = input.audioBase64.replace(/^data:[^;]+;base64,/, "");
    return {
      buffer: Buffer.from(clean, "base64"),
      mimeType: input.audioFile?.mime_type || "audio/wav"
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
      mimeType: res.headers.get("content-type") || input.audioFile?.mime_type || "audio/wav"
    };
  }
  throw new InputValidationError("Provide clipId, audioBase64, audioUrl, or an attached audioFile.");
}
async function transcribeAudioBuffer(buffer, mimeType = "audio/wav") {
  const ai = getGeminiClient();
  const response = await generateTextWithFallback({
    ai,
    primaryModel: "gemini-3.5-transcribe",
    fallbackModel: "gemini-2.5-flash",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: buffer.toString("base64")
          }
        },
        { text: "Transcribe this audio accurately, preserving English and Hindi (Devanagari) words naturally." }
      ]
    }
  });
  return (response.text ?? "").trim();
}
async function analyzeVoiceBuffer(buffer, mimeType = "audio/wav") {
  const ai = getGeminiClient();
  const parsed = parseWavBuffer(buffer);
  const response = await generateTextWithFallback({
    ai,
    primaryModel: "gemini-4-hydrogen",
    fallbackModel: "gemini-2.5-flash",
    contents: {
      parts: [
        { inlineData: { mimeType, data: buffer.toString("base64") } },
        {
          text: `Analyze this speaker's voice characteristics (pitch register, cadence, warmth, accent, energy, and style) and also transcribe what is said. Return JSON with keys: transcript, voiceDescription, recommendedStylePrompt, estimatedWpm, recommendedPresetId (choose best match from: ${VOICE_PRESETS.map((v) => v.id).join(", ")}).`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
    }
  });
  const fallback = {
    transcript: "",
    voiceDescription: "Warm, articulate studio narrator",
    recommendedStylePrompt: "Measured, engaging studio narration",
    estimatedWpm: 145,
    recommendedPresetId: "ethan"
  };
  try {
    const parsedJson = JSON.parse((response.text ?? "{}").trim());
    return {
      transcript: parsedJson.transcript || fallback.transcript,
      voiceDescription: parsedJson.voiceDescription || fallback.voiceDescription,
      recommendedVoiceId: VOICE_PRESETS.find((v) => v.id === parsedJson.recommendedPresetId)?.id || "ethan",
      recommendedStylePrompt: parsedJson.recommendedStylePrompt || fallback.recommendedStylePrompt,
      estimatedWpm: Number(parsedJson.estimatedWpm) || fallback.estimatedWpm,
      durationMs: parsed.durationMs
    };
  } catch {
    return {
      transcript: fallback.transcript,
      voiceDescription: fallback.voiceDescription,
      recommendedVoiceId: "ethan",
      recommendedStylePrompt: fallback.recommendedStylePrompt,
      estimatedWpm: 145,
      durationMs: parsed.durationMs
    };
  }
}
async function matchAudioDuration(params) {
  const rate = params.sampleRate || 48e3;
  const ch = params.channels === 2 ? 2 : 1;
  const processed = processWavAudio(params.buffer, {
    targetSampleRate: rate,
    targetChannels: ch,
    trimSilence: true,
    normalize: true,
    masteringPreset: params.masteringPreset || "none",
    targetDurationSeconds: params.targetDurationSeconds,
    durationToleranceSeconds: 0.1,
    fitMode: "stretch"
  });
  const displayText = params.sourceText || "";
  const parsedMaster = parseWavBuffer(processed.wavBuffer);
  const aligned = alignWordsToWavPcm(displayText, parsedMaster.pcm, rate, ch);
  const saved = saveStoredClip({
    wavBuffer: processed.wavBuffer,
    format: "wav",
    mimeType: "audio/wav",
    sampleRate: rate,
    channels: ch,
    durationMs: processed.durationMs,
    voiceId: "matched",
    voiceName: "Time-Matched Audio",
    modelUsed: "svara-wsola-dsp",
    language: "bilingual",
    displayText,
    masteringPreset: params.masteringPreset || "none",
    timingSource: aligned.timingSource,
    timingConfidence: aligned.timingConfidence,
    wordTimings: aligned.wordTimings,
    phraseTimings: aligned.phraseTimings,
    speechEnvelope: processed.speechEnvelope,
    waveformPeaks: processed.waveformPeaks
  });
  return {
    clipId: saved.id,
    audioUrl: `/api/clips/${saved.id}.wav`,
    downloadUrl: `/api/clips/${saved.id}.wav?download=1`,
    audioBase64: processed.wavBuffer.toString("base64"),
    mimeType: "audio/wav",
    format: "wav",
    sampleRate: rate,
    channels: ch,
    sizeBytes: processed.wavBuffer.length,
    modelUsed: "svara-wsola-dsp",
    voiceId: "matched",
    voiceName: "Time-Matched Audio",
    voiceUsed: "Time-Matched Audio",
    durationEstimateSec: Math.max(1, Math.round(processed.durationMs / 1e3)),
    durationMs: processed.durationMs,
    timingSource: aligned.timingSource,
    timingConfidence: aligned.timingConfidence,
    wordTimings: aligned.wordTimings,
    phraseTimings: aligned.phraseTimings,
    speechEnvelope: processed.speechEnvelope,
    waveformPeaks: processed.waveformPeaks
  };
}
async function replaceAudioSegmentFromBuffer(params) {
  if (!params.replacementText?.trim()) {
    throw new InputValidationError("Replacement text cannot be empty.");
  }
  const rate = params.sampleRate || 48e3;
  const ch = params.channels === 2 ? 2 : 1;
  const parsedOrig = parseWavBuffer(params.buffer);
  let origMono = toMonoPcm(parsedOrig.pcm, parsedOrig.channels);
  if (parsedOrig.sampleRate !== rate) {
    origMono = resampleMonoPcm(origMono, parsedOrig.sampleRate, rate);
  }
  const startSample = Math.max(0, Math.min(origMono.length, Math.round(params.startMs / 1e3 * rate)));
  const endSample = Math.max(startSample, Math.min(origMono.length, Math.round(params.endMs / 1e3 * rate)));
  const targetSpanSec = Math.max(0.4, (endSample - startSample) / rate);
  const preset = VOICE_PRESETS.find((v) => v.id === (params.voiceId || "ethan")) ?? VOICE_PRESETS[0];
  const repRes = await synthesizeSpeech({
    mode: "single",
    language: params.language || "en",
    modelTier: "standard",
    text: params.replacementText,
    voiceId: preset.id,
    voiceName: preset.baseVoice,
    stylePrompt: preset.defaultStyle,
    speed: 1,
    sampleRate: rate,
    channels: 1,
    targetDurationSeconds: targetSpanSec,
    fitMode: "stretch"
  });
  const repParsed = parseWavBuffer(Buffer.from(repRes.audioBase64, "base64"));
  const repMono = toMonoPcm(repParsed.pcm, repParsed.channels);
  const head = origMono.slice(0, startSample);
  const tail = origMono.slice(endSample);
  const combined = new Int16Array(head.length + repMono.length + tail.length);
  combined.set(head, 0);
  combined.set(repMono, head.length);
  combined.set(tail, head.length + repMono.length);
  const finalWav = encodeWavBuffer(toChannelCount(combined, ch), rate, ch);
  const durationMs = Math.round(combined.length / rate * 1e3);
  const speechEnvelope = extractSpeechEnvelope(combined, rate, 1, 25);
  const waveformPeaks = extractWaveformPeaks(combined, 1, 120);
  const aligned = alignWordsToWavPcm(params.replacementText, combined, rate, 1);
  const saved = saveStoredClip({
    wavBuffer: finalWav,
    format: "wav",
    mimeType: "audio/wav",
    sampleRate: rate,
    channels: ch,
    durationMs,
    voiceId: preset.id,
    voiceName: `${preset.name} (${preset.roleTitle})`,
    modelUsed: repRes.modelUsed,
    language: params.language || "en",
    displayText: params.replacementText,
    masteringPreset: "none",
    timingSource: aligned.timingSource,
    timingConfidence: aligned.timingConfidence,
    wordTimings: aligned.wordTimings,
    phraseTimings: aligned.phraseTimings,
    speechEnvelope,
    waveformPeaks
  });
  return {
    clipId: saved.id,
    audioUrl: `/api/clips/${saved.id}.wav`,
    downloadUrl: `/api/clips/${saved.id}.wav?download=1`,
    audioBase64: finalWav.toString("base64"),
    mimeType: "audio/wav",
    format: "wav",
    sampleRate: rate,
    channels: ch,
    sizeBytes: finalWav.length,
    modelUsed: repRes.modelUsed,
    voiceId: preset.id,
    voiceName: `${preset.name} (${preset.roleTitle})`,
    voiceUsed: `${preset.name} (${preset.roleTitle})`,
    durationEstimateSec: Math.max(1, Math.round(durationMs / 1e3)),
    durationMs,
    timingSource: aligned.timingSource,
    timingConfidence: aligned.timingConfidence,
    wordTimings: aligned.wordTimings,
    phraseTimings: aligned.phraseTimings,
    speechEnvelope,
    waveformPeaks
  };
}

// src/mcp/createSvaraMcpServer.ts
var SVARA_MCP_VERSION = "2.2.0";
var SVARA_MCP_BUILD = "2026-11-16.2";
var SVARA_MCP_INSTRUCTIONS = `Svara Studio v${SVARA_MCP_VERSION} is a bilingual English, Hindi (\u0939\u093F\u0928\u094D\u0926\u0940), and Hinglish speech production server for video creators, reels, documentaries, and podcasts.
Recommended creator workflow:
1. Discover voices via list_voices or inspect saved presets via list_voice_presets, and audition quickly with preview_voice.
2. Register proper nouns or tricky words once with add_pronunciation so English and Hindi scripts speak them cleanly.
3. Generate broadcast-ready audio with generate_speech (defaults to 48 kHz normalized mono WAV) or per-line emotion segments with generate_speech_segments. Each synthesis tool returns a native MCP audio attachment, file resource/resource_link, and structuredContent containing clipId, audioUrl, downloadUrl, wordTimings, waveformPeaks, timingSource, timingConfidence, and speechEnvelope.
4. Retrieve previously generated clips anytime using get_clip({ clipId }), and generate synchronized .srt, .vtt, or Rainbow Reels .ass karaoke captions via generate_subtitles without re-transcribing.
5. Use localize_narration for simultaneous Hindi/Hinglish/English dubs, or pass existing files via audioFile/clipId to transcribe_audio, dub_audio, match_duration, analyze_voice, and replace_segment.`;
function handleMcpToolError(error) {
  const mapped = mapApiError(error);
  const errorPayload = {
    error_code: mapped.error_code,
    retryable: mapped.retryable,
    ...typeof mapped.retryAfterSeconds === "number" ? { retryAfterSeconds: mapped.retryAfterSeconds } : {},
    ...mapped.attemptedModels?.length ? { attemptedModels: mapped.attemptedModels } : {},
    message: mapped.message
  };
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(errorPayload, null, 2)
      }
    ],
    structuredContent: errorPayload
  };
}
function buildAudioToolResult(publicBaseUrl, res, extraMeta = {}) {
  const base = publicBaseUrl.replace(/\/$/, "");
  const fullAudioUrl = `${base}${res.audioUrl}`;
  const fullDownloadUrl = `${base}${res.downloadUrl || `${res.audioUrl}?download=1`}`;
  const ext = res.format || "wav";
  const fileName = `svara-${res.clipId}.${ext}`;
  const resourceUri = `svara://clips/${fileName}`;
  const durationMs = res.durationMs ?? (res.durationEstimateSec || 1) * 1e3;
  const durationSeconds = Number((durationMs / 1e3).toFixed(2));
  const voiceUsed = res.voiceUsed || res.voiceName || "Svara Voice";
  const structuredPayload = {
    status: "synthesized",
    clipId: res.clipId,
    file: {
      id: res.clipId,
      name: fileName,
      mimeType: res.mimeType,
      format: ext,
      sizeBytes: res.sizeBytes ?? 0,
      downloadUrl: fullDownloadUrl,
      resourceUri,
      sampleRate: res.sampleRate ?? 48e3,
      channels: res.channels ?? 1
    },
    audioUrl: fullAudioUrl,
    downloadUrl: fullDownloadUrl,
    mimeType: res.mimeType,
    format: ext,
    durationMs,
    durationSeconds,
    sampleRate: res.sampleRate ?? 48e3,
    channels: res.channels ?? 1,
    voiceId: res.voiceId,
    voiceName: res.voiceName,
    voiceUsed,
    model: res.modelUsed,
    modelUsed: res.modelUsed,
    timingSource: res.timingSource || "forced_alignment",
    timingConfidence: res.timingConfidence ?? 0.85,
    appliedPronunciations: res.appliedPronunciations ?? [],
    ...res.wordTimings ? { wordTimings: res.wordTimings } : {},
    ...res.phraseTimings ? { phraseTimings: res.phraseTimings } : {},
    ...res.waveformPeaks ? { waveformPeaks: res.waveformPeaks } : {},
    speechEnvelope: res.speechEnvelope ?? [],
    ...res.segments ? { segments: res.segments } : {},
    ...res.stems ? { stems: res.stems } : {},
    ...extraMeta
  };
  const content = [
    {
      type: "resource_link",
      uri: fullDownloadUrl,
      name: fileName,
      title: `${voiceUsed} (${ext.toUpperCase()})`,
      mimeType: res.mimeType,
      size: res.sizeBytes
    }
  ];
  if (res.audioBase64 && res.audioBase64.length <= 16e6) {
    content.push({
      type: "audio",
      data: res.audioBase64,
      mimeType: res.mimeType
    });
    content.push({
      type: "resource",
      resource: {
        uri: resourceUri,
        mimeType: res.mimeType,
        blob: res.audioBase64
      }
    });
  }
  const rateKhz = ((res.sampleRate ?? 48e3) / 1e3).toFixed(res.sampleRate === 44100 ? 1 : 0);
  const channelLabel = res.channels === 2 ? "stereo" : "mono";
  const wordCount = res.wordTimings?.length ?? 0;
  content.push({
    type: "text",
    text: `Synthesized ${durationSeconds}s ${ext.toUpperCase()} (${rateKhz} kHz ${channelLabel}) with ${voiceUsed} via ${res.modelUsed}. Clip ID: ${res.clipId} \xB7 Words: ${wordCount} (${structuredPayload.timingSource}). Download: ${fullDownloadUrl}`
  });
  return {
    content,
    structuredContent: structuredPayload
  };
}
var ExpressiveControlsSchema = z.object({
  energy: z.number().min(0).max(100).optional(),
  warmth: z.number().min(0).max(100).optional(),
  authority: z.number().min(0).max(100).optional(),
  curiosity: z.number().min(0).max(100).optional(),
  dramaticTension: z.number().min(0).max(100).optional(),
  pace: z.number().min(0).max(100).optional(),
  pauseStrength: z.number().min(0).max(100).optional(),
  smile: z.number().min(0).max(100).optional(),
  whisper: z.number().min(0).max(100).optional()
}).optional();
var AudioFileParamSchema = z.object({
  download_url: z.string().optional(),
  url: z.string().optional(),
  file_id: z.string().optional(),
  mime_type: z.string().optional()
}).optional().describe("Native file upload reference from ChatGPT/MCP client.");
function createSvaraMcpServer(publicBaseUrl) {
  const server = new McpServer(
    {
      name: "svara-studio",
      version: SVARA_MCP_VERSION
    },
    {
      instructions: SVARA_MCP_INSTRUCTIONS
    }
  );
  server.registerResource(
    "voice-catalog",
    "svara://voices",
    {
      title: "Svara Studio Voice Catalog",
      description: "Complete list of English, Hindi, and bilingual voice personas.",
      mimeType: "application/json"
    },
    async () => ({
      contents: [
        {
          uri: "svara://voices",
          mimeType: "application/json",
          text: JSON.stringify(VOICE_PRESETS, null, 2)
        }
      ]
    })
  );
  server.registerResource(
    "pronunciation-dictionary",
    "svara://pronunciations",
    {
      title: "Svara Studio Pronunciation Dictionary",
      description: "Custom English & Hindi phonetic/IPA pronunciation rules.",
      mimeType: "application/json"
    },
    async () => ({
      contents: [
        {
          uri: "svara://pronunciations",
          mimeType: "application/json",
          text: JSON.stringify(listPronunciations(), null, 2)
        }
      ]
    })
  );
  server.registerResource(
    "voice-presets",
    "svara://presets",
    {
      title: "Saved Voice & Mastering Presets",
      description: "Reusable creator presets such as Rainbow Reels \u2014 Science Documentary.",
      mimeType: "application/json"
    },
    async () => ({
      contents: [
        {
          uri: "svara://presets",
          mimeType: "application/json",
          text: JSON.stringify(listVoicePresets(), null, 2)
        }
      ]
    })
  );
  server.registerResource(
    "clip-audio",
    new ResourceTemplate("svara://clips/{fileName}", { list: void 0 }),
    {
      title: "Generated Audio Clip",
      description: "Retrieve generated WAV/MP3/M4A/FLAC clip bytes by file name."
    },
    async (uri, variables) => {
      const fileName = String(variables.fileName || "");
      const cleanId = fileName.replace(/^svara-/, "").replace(/\.(wav|mp3|m4a|flac)$/i, "");
      const found = getClipAudioBuffer(cleanId, fileName.endsWith(".wav"));
      if (!found) {
        throw new Error(`Clip '${fileName}' not found.`);
      }
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: found.mimeType,
            blob: found.buffer.toString("base64")
          }
        ]
      };
    }
  );
  server.registerTool(
    "list_voices",
    {
      title: "List English & Hindi Voices",
      description: "List available Svara Studio voice personas for English, Hindi (\u0939\u093F\u0928\u094D\u0926\u0940), and Bilingual Hinglish text-to-speech.",
      inputSchema: {
        language: z.enum(["All", "English", "Hindi", "Bilingual"]).optional(),
        category: z.enum(["All", "Narration", "Conversational", "Characters", "News & Anchor", "Wellness"]).optional(),
        query: z.string().optional()
      }
    },
    async ({ language = "All", category = "All", query = "" }) => {
      const voices = filterVoices(VOICE_PRESETS, query, language, category).map((v) => ({
        id: v.id,
        name: v.name,
        roleTitle: v.roleTitle,
        language: v.language,
        category: v.category,
        gender: v.gender,
        accent: v.accent,
        defaultStyle: v.defaultStyle,
        description: v.description
      }));
      return {
        content: [
          {
            type: "text",
            text: `Found ${voices.length} Svara Studio voices (${voices.slice(0, 5).map((v) => `${v.id}: ${v.name}`).join(", ")}${voices.length > 5 ? ", ..." : ""}).`
          }
        ],
        structuredContent: { count: voices.length, voices }
      };
    }
  );
  server.registerTool(
    "preview_voice",
    {
      title: "Preview Voice Audition (5-8s)",
      description: "Fast audition of any voice persona with its sample line or a short custom line.",
      inputSchema: {
        voiceId: z.string().describe("Voice ID from list_voices (e.g. ethan, kabir, aarav, maya)."),
        sampleText: z.string().max(400).optional(),
        stylePrompt: z.string().optional()
      }
    },
    async ({ voiceId, sampleText, stylePrompt }) => {
      try {
        const preset = VOICE_PRESETS.find((v) => v.id === voiceId) ?? VOICE_PRESETS[0];
        const res = await synthesizeSpeech({
          mode: "single",
          language: preset.sampleLanguage,
          modelTier: "standard",
          text: sampleText?.trim() || preset.sampleText,
          voiceId: preset.id,
          voiceName: preset.baseVoice,
          stylePrompt: stylePrompt || preset.defaultStyle,
          speed: 1,
          sampleRate: 48e3,
          channels: 1,
          normalize: true,
          trimSilence: true
        });
        return buildAudioToolResult(publicBaseUrl, res, { previewOf: preset.id });
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  server.registerTool(
    "generate_speech",
    {
      title: "Generate Production Speech & Native Audio File",
      description: "Synthesize creator-ready speech in English, Hindi, or Hinglish with automatic multi-model/provider fallback routing. Supports 48 kHz WAV/MP3/M4A/FLAC, normalization, mastering presets, target duration fitting, saved voice presets, custom pronunciations, and returns native MCP audio + resource_link + forced-aligned wordTimings + waveformPeaks + speechEnvelope.",
      inputSchema: {
        text: z.string().min(1),
        voiceId: z.string().optional(),
        voicePresetId: z.string().optional().describe("Optional saved preset ID or name from list_voice_presets."),
        language: z.enum(["en", "hi", "bilingual"]).optional(),
        modelTier: z.enum(["standard", "expressive"]).optional(),
        stylePrompt: z.string().optional(),
        customVoiceDescription: z.string().optional(),
        speed: z.number().min(0.7).max(1.4).optional(),
        pitchRegister: z.enum(["deep", "balanced", "bright"]).optional(),
        emotionIntensity: z.enum(["subtle", "natural", "dramatic"]).optional(),
        expressiveControls: ExpressiveControlsSchema,
        seed: z.number().int().optional(),
        format: z.enum(["wav", "mp3", "m4a", "flac"]).optional(),
        outputFormat: z.enum(["wav", "mp3", "m4a", "flac"]).optional(),
        sampleRate: z.union([z.literal(24e3), z.literal(44100), z.literal(48e3)]).optional().default(48e3),
        channels: z.union([z.literal(1), z.literal(2)]).optional().default(1),
        bitrateKbps: z.number().min(64).max(320).optional(),
        normalize: z.boolean().optional().default(true),
        trimSilence: z.boolean().optional().default(true),
        masteringPreset: z.enum(["none", "youtube_narration", "instagram_reel", "podcast", "audiobook"]).optional().default("none"),
        targetDurationSeconds: z.number().min(0.5).max(300).optional(),
        durationToleranceSeconds: z.number().min(0.05).max(5).optional(),
        fitMode: z.enum(["natural", "tight", "stretch"]).optional(),
        returnWordTimings: z.boolean().optional().default(true),
        returnWaveformPeaks: z.boolean().optional().default(true),
        projectId: z.string().optional()
      }
    },
    async (args) => {
      try {
        const savedPreset = args.voicePresetId ? getVoicePreset(args.voicePresetId) : void 0;
        const language = args.language ?? savedPreset?.language ?? "en";
        const fallbackVoiceId = language === "hi" ? "aarav" : language === "bilingual" ? "vikram" : "ethan";
        const effectiveVoiceId = args.voiceId ?? savedPreset?.voiceId ?? fallbackVoiceId;
        const preset = VOICE_PRESETS.find((v) => v.id === effectiveVoiceId) ?? VOICE_PRESETS[0];
        const chosenFormat = args.format ?? args.outputFormat ?? "wav";
        const chosenTier = args.modelTier ?? (args.expressiveControls || args.customVoiceDescription ? "expressive" : "standard");
        const res = await synthesizeSpeech({
          mode: "single",
          language,
          modelTier: chosenTier,
          text: args.text,
          voiceId: preset.id,
          voiceName: preset.baseVoice,
          stylePrompt: args.stylePrompt ?? savedPreset?.stylePrompt ?? preset.defaultStyle,
          customVoiceDescription: args.customVoiceDescription ?? savedPreset?.customVoiceDescription,
          speed: args.speed ?? savedPreset?.speed ?? 1,
          pitchRegister: args.pitchRegister ?? savedPreset?.pitchRegister ?? "balanced",
          emotionIntensity: args.emotionIntensity ?? savedPreset?.emotionIntensity ?? "natural",
          expressiveControls: args.expressiveControls ?? savedPreset?.expressiveControls,
          seed: args.seed,
          format: chosenFormat,
          sampleRate: args.sampleRate ?? savedPreset?.sampleRate ?? 48e3,
          channels: args.channels ?? savedPreset?.channels ?? 1,
          bitrateKbps: args.bitrateKbps,
          normalize: args.normalize,
          trimSilence: args.trimSilence,
          masteringPreset: args.masteringPreset !== "none" ? args.masteringPreset : savedPreset?.masteringPreset ?? "none",
          targetDurationSeconds: args.targetDurationSeconds,
          durationToleranceSeconds: args.durationToleranceSeconds,
          fitMode: args.fitMode,
          returnWordTimings: args.returnWordTimings,
          returnWaveformPeaks: args.returnWaveformPeaks,
          projectId: args.projectId
        });
        return buildAudioToolResult(publicBaseUrl, res);
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  server.registerTool(
    "get_clip",
    {
      title: "Retrieve Saved Clip Audio & Metadata",
      description: "Retrieve a previously generated Svara Studio clip by clipId, returning a fresh audio attachment, download URL, script, voiceUsed, modelUsed, durationMs, timingSource, timingConfidence, wordTimings, and waveformPeaks.",
      inputSchema: {
        clipId: z.string().min(1)
      }
    },
    async ({ clipId }) => {
      try {
        const found = getClipAudioBuffer(clipId, false);
        if (!found) {
          throw new Error(`Clip '${clipId}' not found.`);
        }
        const rec = found.record;
        const base = publicBaseUrl.replace(/\/$/, "");
        const audioUrl = `${base}/api/clips/${rec.id}.${found.ext}`;
        const downloadUrl = `${audioUrl}?download=1`;
        const fileName = `svara-${rec.id}.${found.ext}`;
        const base64 = found.buffer.toString("base64");
        const structuredPayload = {
          clipId: rec.id,
          audioUrl,
          downloadUrl,
          mimeType: found.mimeType,
          format: found.ext,
          sizeBytes: found.buffer.length,
          sampleRate: rec.sampleRate,
          channels: rec.channels,
          script: rec.displayText,
          voiceId: rec.voiceId,
          voiceUsed: rec.voiceName,
          modelUsed: rec.modelUsed,
          durationMs: rec.durationMs,
          durationSeconds: Number((rec.durationMs / 1e3).toFixed(2)),
          timingSource: rec.timingSource || "forced_alignment",
          timingConfidence: rec.timingConfidence ?? 0.85,
          wordTimings: rec.wordTimings,
          phraseTimings: rec.phraseTimings,
          waveformPeaks: rec.waveformPeaks ?? [],
          speechEnvelope: rec.speechEnvelope,
          segments: rec.segments,
          createdAt: rec.createdAt
        };
        const content = [
          {
            type: "resource_link",
            uri: downloadUrl,
            name: fileName,
            title: `${rec.voiceName} (${found.ext.toUpperCase()})`,
            mimeType: found.mimeType,
            size: found.buffer.length
          }
        ];
        if (base64.length <= 16e6) {
          content.push({
            type: "audio",
            data: base64,
            mimeType: found.mimeType
          });
        }
        content.push({
          type: "text",
          text: `Loaded clip ${rec.id} (${(rec.durationMs / 1e3).toFixed(2)}s, ${rec.voiceName}, ${rec.modelUsed}). Download: ${downloadUrl}`
        });
        return {
          content,
          structuredContent: structuredPayload
        };
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  server.registerTool(
    "generate_speech_segments",
    {
      title: "Generate Timeline & Emotion-Tagged Speech Segments",
      description: "Synthesize a script split into sentences or per-line emotion tags ([CURIOUS], [CHALLENGING], [AWE], [QUIET]). Returns a stitched master WAV plus per-segment clipIds and timings so any single sentence can later be regenerated.",
      inputSchema: {
        text: z.string().min(1),
        voiceId: z.string().optional(),
        language: z.enum(["en", "hi", "bilingual"]).optional().default("en"),
        stylePrompt: z.string().optional(),
        speed: z.number().min(0.7).max(1.4).optional().default(1),
        sampleRate: z.union([z.literal(24e3), z.literal(44100), z.literal(48e3)]).optional().default(48e3),
        channels: z.union([z.literal(1), z.literal(2)]).optional().default(1),
        masteringPreset: z.enum(["none", "youtube_narration", "instagram_reel", "podcast", "audiobook"]).optional().default("instagram_reel")
      }
    },
    async (args) => {
      try {
        const preset = VOICE_PRESETS.find((v) => v.id === (args.voiceId || "ethan")) ?? VOICE_PRESETS[0];
        const res = await synthesizeSpeech({
          mode: "single",
          language: args.language,
          modelTier: "standard",
          text: args.text,
          voiceId: preset.id,
          voiceName: preset.baseVoice,
          stylePrompt: args.stylePrompt ?? preset.defaultStyle,
          speed: args.speed,
          sampleRate: args.sampleRate,
          channels: args.channels,
          masteringPreset: args.masteringPreset,
          segmentMode: true
        });
        return buildAudioToolResult(publicBaseUrl, res);
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  server.registerTool(
    "regenerate_segment",
    {
      title: "Regenerate Single Sentence Segment",
      description: "Regenerate one sentence/segment inside a previously generated segmented clip without re-synthesizing the entire narration, then return the re-stitched master audio file.",
      inputSchema: {
        clipId: z.string(),
        segmentIndex: z.number().int().min(0),
        text: z.string().optional(),
        emotion: z.string().optional(),
        voiceId: z.string().optional(),
        stylePrompt: z.string().optional(),
        speed: z.number().min(0.7).max(1.4).optional()
      }
    },
    async (args) => {
      try {
        const res = await regenerateClipSegment(args);
        return buildAudioToolResult(publicBaseUrl, res, { regeneratedSegmentIndex: args.segmentIndex });
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  server.registerTool(
    "generate_subtitles",
    {
      title: "Generate Synchronized Subtitles (.SRT, .VTT, .ASS, JSON)",
      description: "Generate time-aligned captions from a synthesized clipId based on duration and line constraints. Includes Rainbow Reels Captions preset (white text + cyan #00E5FF active-word karaoke highlighting, max 3 lines, vertical 1080x1920 safe positioning).",
      inputSchema: {
        clipId: z.string(),
        format: z.enum(["srt", "vtt", "ass", "json"]).default("ass"),
        preset: z.enum(["rainbow_reels", "clean_editorial"]).default("rainbow_reels"),
        maxLines: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().default(3),
        maxCharsPerLine: z.number().int().min(10).max(80).optional(),
        maxPhraseDurationMs: z.number().int().min(800).max(1e4).optional(),
        maxDurationSeconds: z.number().min(0.8).max(12).optional(),
        safeAreaMarginV: z.number().int().min(20).max(800).optional()
      }
    },
    async ({
      clipId,
      format,
      preset,
      maxLines,
      maxCharsPerLine,
      maxPhraseDurationMs,
      maxDurationSeconds,
      safeAreaMarginV
    }) => {
      try {
        const record = getClipRecord(clipId);
        if (!record) {
          throw new Error(`Clip '${clipId}' not found.`);
        }
        const subtitleText = generateSubtitles({
          wordTimings: record.wordTimings,
          format,
          preset,
          maxLines,
          maxCharsPerLine,
          maxPhraseDurationMs,
          maxDurationSeconds,
          safeAreaMarginV
        });
        const downloadUrl = `${publicBaseUrl.replace(/\/$/, "")}/api/clips/${clipId}/subtitles/${format}?preset=${preset}&maxLines=${maxLines}&download=1`;
        const mimeMap = {
          srt: "application/x-subrip",
          vtt: "text/vtt",
          ass: "text/x-ssa",
          json: "application/json"
        };
        return {
          content: [
            {
              type: "resource_link",
              uri: downloadUrl,
              name: `svara-${clipId}.${format}`,
              title: `Subtitles (${preset}, ${format.toUpperCase()})`,
              mimeType: mimeMap[format]
            },
            {
              type: "resource",
              resource: {
                uri: `svara://clips/${clipId}.${format}`,
                mimeType: mimeMap[format],
                text: subtitleText
              }
            },
            {
              type: "text",
              text: `Generated ${format.toUpperCase()} subtitles (${preset}, max ${maxLines} lines) for clip ${clipId}. Download: ${downloadUrl}`
            }
          ],
          structuredContent: {
            clipId,
            format,
            preset,
            maxLines,
            timingSource: record.timingSource || "forced_alignment",
            downloadUrl,
            content: subtitleText
          }
        };
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  server.registerTool(
    "generate_dialogue",
    {
      title: "Generate Multi-Speaker Dialogue (2\u20136 Speakers + Stems)",
      description: "Generate multi-speaker podcasts or scenes (2 to 6 speakers) in English, Hindi, or Hinglish with backchanneling (|yeah|, |mhm|), per-line emotion, and optional speaker-separated stems.",
      inputSchema: {
        language: z.enum(["en", "hi", "bilingual"]).default("bilingual"),
        speed: z.number().min(0.7).max(1.4).default(1),
        separateStems: z.boolean().optional().default(false),
        speakers: z.array(
          z.object({
            key: z.string().min(1),
            name: z.string().min(1),
            voiceId: z.string().min(1),
            style: z.string().optional()
          })
        ).min(2).max(6).optional(),
        speakerAName: z.string().optional(),
        speakerAVoiceId: z.string().optional(),
        speakerAStyle: z.string().optional(),
        speakerBName: z.string().optional(),
        speakerBVoiceId: z.string().optional(),
        speakerBStyle: z.string().optional(),
        turns: z.array(
          z.object({
            speaker: z.string().min(1),
            text: z.string().min(1),
            emotion: z.string().optional()
          })
        ).min(1)
      }
    },
    async (args) => {
      try {
        const speakerList = args.speakers?.length ? args.speakers.map((s) => {
          const p = VOICE_PRESETS.find((v) => v.id === s.voiceId) ?? VOICE_PRESETS[0];
          return {
            id: s.key,
            name: s.name,
            voiceId: p.id,
            baseVoice: p.baseVoice,
            style: s.style || p.defaultStyle
          };
        }) : [
          (() => {
            const p = VOICE_PRESETS.find((v) => v.id === (args.speakerAVoiceId || "vikram")) ?? VOICE_PRESETS[3];
            return {
              id: "A",
              name: args.speakerAName || "Vikram",
              voiceId: p.id,
              baseVoice: p.baseVoice,
              style: args.speakerAStyle || p.defaultStyle
            };
          })(),
          (() => {
            const p = VOICE_PRESETS.find((v) => v.id === (args.speakerBVoiceId || "ananya")) ?? VOICE_PRESETS[1];
            return {
              id: "B",
              name: args.speakerBName || "Ananya",
              voiceId: p.id,
              baseVoice: p.baseVoice,
              style: args.speakerBStyle || p.defaultStyle
            };
          })()
        ];
        const res = await synthesizeSpeech({
          mode: "multi",
          language: args.language,
          modelTier: "standard",
          text: "",
          voiceName: speakerList[0].baseVoice,
          stylePrompt: "",
          speed: args.speed,
          speakerList,
          separateStems: args.separateStems,
          dialogueLines: args.turns.map((t, i) => ({
            id: `turn-${i + 1}`,
            speakerKey: t.speaker,
            text: t.text,
            emotion: t.emotion
          })),
          sampleRate: 48e3,
          channels: 1
        });
        return buildAudioToolResult(publicBaseUrl, res, {
          speakers: speakerList.map((s) => s.name)
        });
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  server.registerTool(
    "translate_tts_script",
    {
      title: "Adapt Script Between English, Hindi & Hinglish",
      description: "Adapt a voiceover script into Hindi (Devanagari), English, or Hinglish while preserving tags.",
      inputSchema: {
        text: z.string().min(1),
        targetLanguage: z.enum(["en", "hi", "bilingual"]),
        preserveDuration: z.boolean().optional().default(false)
      }
    },
    async ({ text, targetLanguage, preserveDuration }) => {
      try {
        const translatedText = await translateSpeechScript(text, targetLanguage, preserveDuration);
        return {
          content: [{ type: "text", text: translatedText }],
          structuredContent: { targetLanguage, translatedText }
        };
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  server.registerTool(
    "localize_narration",
    {
      title: "Localize Narration to Hindi / Hinglish / English Audio + Subtitles",
      description: "Translate an English/Hindi script into one or more target languages while optionally preserving duration, and return localized 48 kHz WAV audio + synchronized SRT subtitles + word timings for each language.",
      inputSchema: {
        text: z.string().min(1),
        targetLanguages: z.array(z.enum(["en", "hi", "bilingual"])).min(1),
        voiceId: z.string().optional(),
        preserveDuration: z.boolean().optional().default(true),
        targetDurationSeconds: z.number().min(0.5).max(300).optional()
      }
    },
    async (args) => {
      try {
        const localized = await localizeNarration(args);
        const base = publicBaseUrl.replace(/\/$/, "");
        const summary = localized.map((item) => ({
          language: item.language,
          script: item.script,
          clipId: item.result.clipId,
          audioUrl: `${base}${item.result.audioUrl}`,
          downloadUrl: `${base}${item.result.downloadUrl}`,
          modelUsed: item.result.modelUsed,
          voiceUsed: item.result.voiceUsed || item.result.voiceName,
          durationMs: item.result.durationMs,
          timingSource: item.result.timingSource,
          timingConfidence: item.result.timingConfidence,
          wordTimings: item.result.wordTimings,
          waveformPeaks: item.result.waveformPeaks,
          srt: item.srt
        }));
        const content = [];
        for (const item of localized) {
          content.push({
            type: "resource_link",
            uri: `${base}${item.result.downloadUrl}`,
            name: `svara-${item.language}-${item.result.clipId}.wav`,
            mimeType: "audio/wav"
          });
          if (item.result.audioBase64 && item.result.audioBase64.length <= 8e6) {
            content.push({
              type: "audio",
              data: item.result.audioBase64,
              mimeType: item.result.mimeType
            });
          }
        }
        content.push({
          type: "text",
          text: `Localized narration into ${localized.map((i) => `${i.language} (${i.result.clipId})`).join(", ")}.`
        });
        return {
          content,
          structuredContent: { localizations: summary }
        };
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  server.registerTool(
    "add_pronunciation",
    {
      title: "Add or Update Pronunciation Rule",
      description: "Define a custom phonetic or IPA pronunciation rule for an English, Hindi, or Hinglish term.",
      inputSchema: {
        term: z.string().min(1),
        phonetic: z.string().min(1),
        ipa: z.string().optional(),
        language: z.enum(["en", "hi", "bilingual"]).optional().default("bilingual"),
        notes: z.string().optional()
      }
    },
    async (args) => {
      const entry = upsertPronunciation(args);
      return {
        content: [{ type: "text", text: `Saved pronunciation rule for "${entry.term}" -> "${entry.phonetic}".` }],
        structuredContent: { entry }
      };
    }
  );
  server.registerTool(
    "list_pronunciations",
    {
      title: "List Pronunciation Rules",
      description: "List all saved English and Hindi custom pronunciation guide entries.",
      inputSchema: {}
    },
    async () => {
      const entries = listPronunciations();
      return {
        content: [{ type: "text", text: `${entries.length} pronunciation rules configured.` }],
        structuredContent: { count: entries.length, entries }
      };
    }
  );
  server.registerTool(
    "delete_pronunciation",
    {
      title: "Delete Pronunciation Rule",
      description: "Remove a pronunciation guide entry by ID or term.",
      inputSchema: { idOrTerm: z.string().min(1) }
    },
    async ({ idOrTerm }) => {
      const deleted = deletePronunciation(idOrTerm);
      return {
        content: [{ type: "text", text: deleted ? `Removed "${idOrTerm}".` : `No rule found for "${idOrTerm}".` }],
        structuredContent: { deleted, idOrTerm }
      };
    }
  );
  server.registerTool(
    "create_voice_preset",
    {
      title: "Create or Update Reusable Voice Preset",
      description: "Save a voice + tone + expressive controls + mastering preset (e.g. Rainbow Reels \u2014 Science Documentary).",
      inputSchema: {
        name: z.string().min(1),
        voiceId: z.string().min(1),
        language: z.enum(["en", "hi", "bilingual"]).default("en"),
        stylePrompt: z.string().min(1),
        customVoiceDescription: z.string().optional(),
        speed: z.number().min(0.7).max(1.4).default(1),
        pitchRegister: z.enum(["deep", "balanced", "bright"]).default("balanced"),
        emotionIntensity: z.enum(["subtle", "natural", "dramatic"]).default("natural"),
        expressiveControls: ExpressiveControlsSchema,
        masteringPreset: z.enum(["none", "youtube_narration", "instagram_reel", "podcast", "audiobook"]).default("instagram_reel"),
        sampleRate: z.union([z.literal(24e3), z.literal(44100), z.literal(48e3)]).default(48e3),
        channels: z.union([z.literal(1), z.literal(2)]).default(1)
      }
    },
    async (args) => {
      const preset = upsertVoicePreset(args);
      return {
        content: [{ type: "text", text: `Saved voice preset "${preset.name}" (${preset.id}).` }],
        structuredContent: { preset }
      };
    }
  );
  server.registerTool(
    "list_voice_presets",
    {
      title: "List Saved Voice Presets",
      description: "List saved reusable voice & mastering presets.",
      inputSchema: {}
    },
    async () => {
      const presets = listVoicePresets();
      return {
        content: [{ type: "text", text: `${presets.length} saved voice presets available.` }],
        structuredContent: { count: presets.length, presets }
      };
    }
  );
  server.registerTool(
    "delete_voice_preset",
    {
      title: "Delete Voice Preset",
      description: "Delete a saved voice preset by ID.",
      inputSchema: { id: z.string().min(1) }
    },
    async ({ id }) => {
      const deleted = deleteVoicePreset(id);
      return {
        content: [{ type: "text", text: deleted ? `Deleted preset ${id}.` : `Preset ${id} not found.` }],
        structuredContent: { deleted, id }
      };
    }
  );
  server.registerTool(
    "create_project",
    {
      title: "Create Narration Project",
      description: "Create a named multi-clip narration project for organizing reels, episodes, or dubs.",
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        defaultVoicePresetId: z.string().optional()
      }
    },
    async (args) => {
      const project = createProject(args);
      return {
        content: [{ type: "text", text: `Created project "${project.name}" (${project.id}).` }],
        structuredContent: { project }
      };
    }
  );
  server.registerTool(
    "list_projects",
    {
      title: "List Narration Projects",
      description: "List all saved Svara Studio projects.",
      inputSchema: {}
    },
    async () => {
      const projects = listProjects();
      return {
        content: [{ type: "text", text: `${projects.length} narration projects found.` }],
        structuredContent: { count: projects.length, projects }
      };
    }
  );
  server.registerTool(
    "get_project",
    {
      title: "Get Project Details",
      description: "Inspect a project and all its ordered clips.",
      inputSchema: { projectId: z.string().min(1) }
    },
    async ({ projectId }) => {
      const project = getProject(projectId);
      if (!project) {
        return handleMcpToolError(new Error(`Project '${projectId}' not found.`));
      }
      return {
        content: [{ type: "text", text: `Project "${project.name}" (${project.clips.length} clips).` }],
        structuredContent: { project }
      };
    }
  );
  server.registerTool(
    "add_clip_to_project",
    {
      title: "Add Clip to Project",
      description: "Attach an existing generated clipId to a project.",
      inputSchema: {
        projectId: z.string().min(1),
        clipId: z.string().min(1),
        title: z.string().optional()
      }
    },
    async ({ projectId, clipId, title }) => {
      const rec = getClipRecord(clipId);
      if (!rec) return handleMcpToolError(new Error(`Clip '${clipId}' not found.`));
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
        downloadUrl: `/api/clips/${rec.id}.${rec.format}?download=1`
      });
      if (!updated) return handleMcpToolError(new Error(`Project '${projectId}' not found.`));
      return {
        content: [{ type: "text", text: `Added clip ${clipId} to project "${updated.name}".` }],
        structuredContent: { project: updated }
      };
    }
  );
  server.registerTool(
    "update_clip",
    {
      title: "Update Clip Metadata in Project",
      description: "Rename, update script note, or reorder a clip inside a project.",
      inputSchema: {
        projectId: z.string().min(1),
        clipId: z.string().min(1),
        title: z.string().optional(),
        text: z.string().optional(),
        order: z.number().int().min(1).optional()
      }
    },
    async ({ projectId, clipId, title, text, order }) => {
      const updated = updateProjectClip(projectId, clipId, { title, text, order });
      if (!updated) return handleMcpToolError(new Error("Project or clip not found."));
      return {
        content: [{ type: "text", text: `Updated clip ${clipId} in project "${updated.name}".` }],
        structuredContent: { project: updated }
      };
    }
  );
  server.registerTool(
    "delete_clip",
    {
      title: "Remove Clip from Project",
      description: "Remove a clip reference from a project.",
      inputSchema: { projectId: z.string().min(1), clipId: z.string().min(1) }
    },
    async ({ projectId, clipId }) => {
      const updated = deleteProjectClip(projectId, clipId);
      if (!updated) return handleMcpToolError(new Error("Project not found."));
      return {
        content: [{ type: "text", text: `Removed clip ${clipId} from project "${updated.name}".` }],
        structuredContent: { project: updated }
      };
    }
  );
  server.registerTool(
    "export_project",
    {
      title: "Export Project Manifest & Combined Subtitles",
      description: "Export all clips, download URLs, and combined SRT/ASS captions for a project.",
      inputSchema: { projectId: z.string().min(1) }
    },
    async ({ projectId }) => {
      const proj = getProject(projectId);
      if (!proj) return handleMcpToolError(new Error(`Project '${projectId}' not found.`));
      const base = publicBaseUrl.replace(/\/$/, "");
      const manifest = {
        ...proj,
        clips: proj.clips.map((c) => ({
          ...c,
          audioUrl: `${base}${c.audioUrl}`,
          downloadUrl: `${base}${c.downloadUrl}`,
          srtUrl: `${base}/api/clips/${c.clipId}/subtitles/srt?download=1`,
          assUrl: `${base}/api/clips/${c.clipId}/subtitles/ass?preset=rainbow_reels&download=1`
        }))
      };
      return {
        content: [{ type: "text", text: `Exported project "${proj.name}" (${manifest.clips.length} clips).` }],
        structuredContent: manifest
      };
    }
  );
  server.registerTool(
    "transcribe_audio",
    {
      title: "Transcribe Audio File",
      description: "Transcribe an uploaded audioFile, audioUrl, or Svara clipId into English/Hindi text.",
      _meta: { "openai/fileParams": ["audioFile"] },
      inputSchema: {
        clipId: z.string().optional(),
        audioUrl: z.string().optional(),
        audioBase64: z.string().optional(),
        audioFile: AudioFileParamSchema
      }
    },
    async (args) => {
      try {
        const { buffer, mimeType } = await resolveInputAudioBuffer(args);
        const transcript = await transcribeAudioBuffer(buffer, mimeType);
        return {
          content: [{ type: "text", text: transcript }],
          structuredContent: { transcript }
        };
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  server.registerTool(
    "analyze_voice",
    {
      title: "Analyze Voice Characteristics from Audio File",
      description: "Analyze an uploaded voice sample to describe its timbre/cadence/pace and recommend a matching Svara voice preset.",
      _meta: { "openai/fileParams": ["audioFile"] },
      inputSchema: {
        clipId: z.string().optional(),
        audioUrl: z.string().optional(),
        audioBase64: z.string().optional(),
        audioFile: AudioFileParamSchema
      }
    },
    async (args) => {
      try {
        const { buffer, mimeType } = await resolveInputAudioBuffer(args);
        const analysis = await analyzeVoiceBuffer(buffer, mimeType);
        return {
          content: [
            {
              type: "text",
              text: `${analysis.voiceDescription} \xB7 Recommended preset: ${analysis.recommendedVoiceId} (~${analysis.estimatedWpm} WPM).`
            }
          ],
          structuredContent: analysis
        };
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  server.registerTool(
    "dub_audio",
    {
      title: "Dub Audio File into Hindi / Hinglish / English",
      description: "Transcribe an input audioFile/clipId, adapt script into targetLanguage, and synthesize duration-matched 48 kHz WAV + captions.",
      _meta: { "openai/fileParams": ["audioFile"] },
      inputSchema: {
        clipId: z.string().optional(),
        audioUrl: z.string().optional(),
        audioBase64: z.string().optional(),
        audioFile: AudioFileParamSchema,
        targetLanguage: z.enum(["en", "hi", "bilingual"]).default("hi"),
        voiceId: z.string().optional(),
        preserveDuration: z.boolean().optional().default(true)
      }
    },
    async (args) => {
      try {
        const { buffer, mimeType, sourceText } = await resolveInputAudioBuffer(args);
        const transcript = sourceText || await transcribeAudioBuffer(buffer, mimeType);
        const [localized] = await localizeNarration({
          text: transcript,
          targetLanguages: [args.targetLanguage],
          voiceId: args.voiceId,
          preserveDuration: args.preserveDuration
        });
        return buildAudioToolResult(publicBaseUrl, localized.result, {
          sourceTranscript: transcript,
          localizedScript: localized.script,
          srt: localized.srt
        });
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  server.registerTool(
    "match_duration",
    {
      title: "Time-Stretch Audio File to Exact Duration",
      description: "Fit an existing clipId or uploaded audioFile to targetDurationSeconds cleanly without pitch distortion.",
      _meta: { "openai/fileParams": ["audioFile"] },
      inputSchema: {
        clipId: z.string().optional(),
        audioUrl: z.string().optional(),
        audioBase64: z.string().optional(),
        audioFile: AudioFileParamSchema,
        targetDurationSeconds: z.number().min(0.5).max(300),
        sampleRate: z.union([z.literal(24e3), z.literal(44100), z.literal(48e3)]).optional().default(48e3),
        channels: z.union([z.literal(1), z.literal(2)]).optional().default(1)
      }
    },
    async (args) => {
      try {
        const { buffer, sourceText } = await resolveInputAudioBuffer(args);
        const res = await matchAudioDuration({
          buffer,
          targetDurationSeconds: args.targetDurationSeconds,
          sampleRate: args.sampleRate,
          channels: args.channels,
          sourceText
        });
        return buildAudioToolResult(publicBaseUrl, res);
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  server.registerTool(
    "replace_segment",
    {
      title: "Replace Time Span in Existing Audio File",
      description: "Replace a specific [startMs..endMs] span in an audioFile or clipId with newly synthesized replacementText matched to that duration.",
      _meta: { "openai/fileParams": ["audioFile"] },
      inputSchema: {
        clipId: z.string().optional(),
        audioUrl: z.string().optional(),
        audioBase64: z.string().optional(),
        audioFile: AudioFileParamSchema,
        startMs: z.number().int().min(0),
        endMs: z.number().int().min(100),
        replacementText: z.string().min(1),
        voiceId: z.string().optional(),
        language: z.enum(["en", "hi", "bilingual"]).optional().default("en")
      }
    },
    async (args) => {
      try {
        const { buffer } = await resolveInputAudioBuffer(args);
        const res = await replaceAudioSegmentFromBuffer({
          buffer,
          startMs: args.startMs,
          endMs: args.endMs,
          replacementText: args.replacementText,
          voiceId: args.voiceId,
          language: args.language
        });
        return buildAudioToolResult(publicBaseUrl, res);
      } catch (error) {
        return handleMcpToolError(error);
      }
    }
  );
  return server;
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path3.dirname(__filename);
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
  app.use(express.json({ limit: "16mb" }));
  const sseSessions = /* @__PURE__ */ new Map();
  app.get("/api/health", (req, res) => {
    const base = resolvePublicBaseUrl(req);
    res.json({
      ok: true,
      version: SVARA_MCP_VERSION,
      build: SVARA_MCP_BUILD,
      mcpToolsCount: 28,
      storageDir: getStoreDir(),
      hasKey: Boolean(process.env.GEMINI_API_KEY),
      providers: {
        gemini: Boolean(process.env.GEMINI_API_KEY),
        openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
        elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY?.trim())
      },
      mcpEndpoint: `${base}/mcp`,
      sseEndpoint: `${base}/sse`
    });
  });
  app.get("/api/clips/:id.:ext", mcpCorsMiddleware, (req, res) => {
    const id = String(req.params.id);
    const ext = String(req.params.ext || "wav").toLowerCase();
    const preferWav = ext === "wav";
    const found = getClipAudioBuffer(id, preferWav);
    if (!found) {
      res.status(404).json({ error: "Audio clip expired or not found." });
      return;
    }
    const isDownload = req.query.download === "1" || req.query.download === "true";
    res.setHeader("Content-Type", found.mimeType || "audio/wav");
    res.setHeader(
      "Content-Disposition",
      `${isDownload ? "attachment" : "inline"}; filename="svara-${id}.${found.ext}"`
    );
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(found.buffer);
  });
  app.get("/api/clips/:id/subtitles/:format", mcpCorsMiddleware, (req, res) => {
    const id = String(req.params.id);
    const format = String(req.params.format || "srt").toLowerCase();
    if (!["srt", "vtt", "ass", "json"].includes(format)) {
      res.status(400).json({ error: "Unsupported subtitle format." });
      return;
    }
    const record = getClipRecord(id);
    if (!record) {
      res.status(404).json({ error: "Clip not found." });
      return;
    }
    const preset = String(req.query.preset || "rainbow_reels");
    const maxLinesNum = Number(req.query.maxLines || 3);
    const maxLines = maxLinesNum === 1 || maxLinesNum === 2 ? maxLinesNum : 3;
    const text = generateSubtitles({
      wordTimings: record.wordTimings,
      format,
      preset,
      maxLines
    });
    const mimeMap = {
      srt: "application/x-subrip; charset=utf-8",
      vtt: "text/vtt; charset=utf-8",
      ass: "text/x-ssa; charset=utf-8",
      json: "application/json; charset=utf-8"
    };
    const isDownload = req.query.download === "1" || req.query.download === "true";
    res.setHeader("Content-Type", mimeMap[format]);
    res.setHeader(
      "Content-Disposition",
      `${isDownload ? "attachment" : "inline"}; filename="svara-${id}.${format}"`
    );
    res.send(text);
  });
  app.post("/api/subtitles", (req, res) => {
    const body = req.body;
    const timings = body.clipId ? getClipRecord(body.clipId)?.wordTimings : body.wordTimings;
    if (!timings || timings.length === 0) {
      res.status(404).json({ error: "No word timings found for subtitle generation." });
      return;
    }
    const content = generateSubtitles({
      wordTimings: timings,
      format: body.format || "srt",
      preset: body.preset || "rainbow_reels",
      maxLines: body.maxLines || 3,
      maxCharsPerLine: body.maxCharsPerLine,
      maxPhraseDurationMs: body.maxPhraseDurationMs
    });
    res.json({ format: body.format || "srt", content });
  });
  app.get("/api/clips", (_req, res) => {
    res.json({ clips: listRecentClips(30) });
  });
  app.get("/api/clips/:id", mcpCorsMiddleware, (req, res) => {
    const id = String(req.params.id);
    const record = getClipRecord(id);
    if (!record) {
      res.status(404).json({
        error_code: "INVALID_ARGUMENT",
        error: `Clip '${id}' not found.`,
        message: `Clip '${id}' not found.`
      });
      return;
    }
    const base = resolvePublicBaseUrl(req);
    const audioPath = `/api/clips/${record.id}.${record.format}`;
    res.json({
      clipId: record.id,
      audioUrl: `${base}${audioPath}`,
      downloadUrl: `${base}${audioPath}?download=1`,
      mimeType: record.mimeType,
      format: record.format,
      sampleRate: record.sampleRate,
      channels: record.channels,
      sizeBytes: record.sizeBytes,
      script: record.displayText,
      voiceId: record.voiceId,
      voiceUsed: record.voiceName,
      modelUsed: record.modelUsed,
      durationMs: record.durationMs,
      timingSource: record.timingSource || "forced_alignment",
      timingConfidence: record.timingConfidence ?? 0.85,
      wordTimings: record.wordTimings,
      phraseTimings: record.phraseTimings,
      waveformPeaks: record.waveformPeaks ?? [],
      segments: record.segments,
      createdAt: record.createdAt
    });
  });
  app.post("/api/tts/generate", async (req, res) => {
    try {
      const payload = req.body;
      const result = await synthesizeSpeech(payload);
      res.json(result);
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message, ...mapped });
    }
  });
  app.post("/api/tts/segments/regenerate", async (req, res) => {
    try {
      const body = req.body;
      const result = await regenerateClipSegment(body);
      res.json(result);
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message, ...mapped });
    }
  });
  app.post("/api/script/translate", async (req, res) => {
    try {
      const { text, targetLanguage, preserveDuration } = req.body;
      const translatedText = await translateSpeechScript(
        text || "",
        targetLanguage || "hi",
        Boolean(preserveDuration)
      );
      res.json({ translatedText });
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message, ...mapped });
    }
  });
  app.get("/api/pronunciations", (_req, res) => {
    res.json({ entries: listPronunciations() });
  });
  app.post("/api/pronunciations", (req, res) => {
    const body = req.body;
    if (!body.term?.trim() || !body.phonetic?.trim()) {
      res.status(400).json({ error: "Both term and phonetic spelling are required." });
      return;
    }
    const entry = upsertPronunciation({
      id: body.id,
      term: body.term,
      phonetic: body.phonetic,
      ipa: body.ipa,
      language: body.language,
      notes: body.notes,
      enabled: body.enabled
    });
    res.json({ entry, entries: listPronunciations() });
  });
  app.delete("/api/pronunciations/:id", (req, res) => {
    const deleted = deletePronunciation(String(req.params.id));
    res.json({ deleted, entries: listPronunciations() });
  });
  app.get("/api/presets", (_req, res) => {
    res.json({ presets: listVoicePresets() });
  });
  app.post("/api/presets", (req, res) => {
    const body = req.body;
    if (!body.name?.trim() || !body.voiceId?.trim()) {
      res.status(400).json({ error: "Preset name and voiceId are required." });
      return;
    }
    const preset = upsertVoicePreset(body);
    res.json({ preset, presets: listVoicePresets() });
  });
  app.delete("/api/presets/:id", (req, res) => {
    const deleted = deleteVoicePreset(String(req.params.id));
    res.json({ deleted, presets: listVoicePresets() });
  });
  app.get("/api/projects", (_req, res) => {
    res.json({ projects: listProjects() });
  });
  app.post("/api/projects", (req, res) => {
    const body = req.body;
    if (!body.name?.trim()) {
      res.status(400).json({ error: "Project name is required." });
      return;
    }
    const project = createProject({
      name: body.name,
      description: body.description,
      defaultVoicePresetId: body.defaultVoicePresetId
    });
    res.json({ project });
  });
  app.get("/api/projects/:id", (req, res) => {
    const proj = getProject(String(req.params.id));
    if (!proj) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    res.json({ project: proj });
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
    const distPath = path3.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      const indexFile = path3.join(distPath, "index.html");
      if (fs3.existsSync(indexFile)) {
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
