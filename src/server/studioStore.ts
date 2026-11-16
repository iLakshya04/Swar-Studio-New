import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AudioFormat,
  ChannelCount,
  MasteringPreset,
  PhraseTiming,
  PronunciationEntry,
  SampleRateHz,
  SavedVoicePresetConfig,
  SpeechEnvelopeInterval,
  SpeechSegmentMeta,
  StudioProject,
  StudioProjectClip,
  WordTiming,
} from '../types';

const STORE_DIR = '/tmp/svara-studio';
const CLIPS_DIR = path.join(STORE_DIR, 'clips');
const STATE_FILE = path.join(STORE_DIR, 'state.json');
const MAX_CLIPS = 120;

export interface StoredClipRecord {
  id: string;
  wavFileName: string;
  encodedFileName?: string;
  format: AudioFormat;
  mimeType: string;
  sampleRate: SampleRateHz;
  channels: ChannelCount;
  durationMs: number;
  sizeBytes: number;
  voiceId: string;
  voiceName: string;
  modelUsed: string;
  language: 'en' | 'hi' | 'bilingual';
  displayText: string;
  masteringPreset: MasteringPreset;
  wordTimings: WordTiming[];
  phraseTimings: PhraseTiming[];
  speechEnvelope: SpeechEnvelopeInterval[];
  segments?: SpeechSegmentMeta[];
  createdAt: string;
}

interface PersistedState {
  pronunciations: PronunciationEntry[];
  voicePresets: SavedVoicePresetConfig[];
  projects: StudioProject[];
  clips: StoredClipRecord[];
}

const DEFAULT_PRONUNCIATIONS: PronunciationEntry[] = [
  {
    id: 'pron-leidenfrost',
    term: 'Leidenfrost',
    phonetic: 'LY-den-frost',
    ipa: '/ˈlaɪdənfrɒst/',
    language: 'en',
    notes: 'Physics effect where liquid hovers on vapor',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pron-denmark-strait',
    term: 'Denmark Strait',
    phonetic: 'DEN-mark strayt',
    language: 'en',
    notes: 'Underwater waterfall between Greenland and Iceland',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pron-ionosphere',
    term: 'ionosphere',
    phonetic: 'eye-ON-uh-sfeer',
    ipa: '/aɪˈɒnəsfɪər/',
    language: 'en',
    notes: 'Upper atmospheric charged layer',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pron-baahubali',
    term: 'Baahubali',
    phonetic: 'Baa-hu-ba-li',
    language: 'bilingual',
    notes: 'Clear aspirated long aa/u vowel emphasis',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const DEFAULT_VOICE_PRESETS: SavedVoicePresetConfig[] = [
  {
    id: 'preset-rainbow-science',
    name: 'Rainbow Reels — Science Documentary',
    voiceId: 'ethan',
    language: 'en',
    stylePrompt:
      'Deep cinematic science documentary narrator, authoritative yet filled with quiet wonder',
    speed: 1.0,
    pitchRegister: 'deep',
    emotionIntensity: 'natural',
    expressiveControls: {
      authority: 80,
      curiosity: 75,
      dramaticTension: 65,
      pauseStrength: 60,
    },
    masteringPreset: 'instagram_reel',
    sampleRate: 48000,
    channels: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'preset-hindi-kahani',
    name: 'Hindi Kahani — Warm Audiobook',
    voiceId: 'aarav',
    language: 'hi',
    stylePrompt: 'Warm, expressive Hindi storyteller with natural pauses',
    speed: 0.95,
    pitchRegister: 'balanced',
    emotionIntensity: 'natural',
    expressiveControls: {
      warmth: 85,
      pauseStrength: 70,
    },
    masteringPreset: 'audiobook',
    sampleRate: 48000,
    channels: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'preset-samachar-news',
    name: 'Samachar — Crisp Hindi Broadcast',
    voiceId: 'meera',
    language: 'hi',
    stylePrompt: 'Clear, authoritative Hindi broadcast news anchor',
    speed: 1.05,
    pitchRegister: 'balanced',
    emotionIntensity: 'subtle',
    expressiveControls: {
      authority: 85,
      energy: 65,
    },
    masteringPreset: 'youtube_narration',
    sampleRate: 48000,
    channels: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

function ensureDirs(): void {
  fs.mkdirSync(CLIPS_DIR, { recursive: true });
}

function loadState(): PersistedState {
  ensureDirs();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return {
        pronunciations: Array.isArray(parsed.pronunciations)
          ? parsed.pronunciations
          : [...DEFAULT_PRONUNCIATIONS],
        voicePresets: Array.isArray(parsed.voicePresets)
          ? parsed.voicePresets
          : [...DEFAULT_VOICE_PRESETS],
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        clips: Array.isArray(parsed.clips) ? parsed.clips : [],
      };
    }
  } catch {
    // Fall back to fresh default state
  }
  const initial: PersistedState = {
    pronunciations: [...DEFAULT_PRONUNCIATIONS],
    voicePresets: [...DEFAULT_VOICE_PRESETS],
    projects: [],
    clips: [],
  };
  saveState(initial);
  return initial;
}

function saveState(state: PersistedState): void {
  ensureDirs();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

let stateCache: PersistedState = loadState();

export function listPronunciations(): PronunciationEntry[] {
  return [...stateCache.pronunciations];
}

export function upsertPronunciation(input: {
  id?: string;
  term: string;
  phonetic: string;
  ipa?: string;
  language?: 'en' | 'hi' | 'bilingual';
  notes?: string;
  enabled?: boolean;
}): PronunciationEntry {
  const cleanTerm = input.term.trim();
  const cleanPhonetic = input.phonetic.trim();
  const existingIdx = stateCache.pronunciations.findIndex(
    (p) =>
      (input.id && p.id === input.id) ||
      p.term.toLowerCase() === cleanTerm.toLowerCase()
  );

  const entry: PronunciationEntry = {
    id:
      existingIdx >= 0
        ? stateCache.pronunciations[existingIdx].id
        : input.id || `pron-${crypto.randomUUID().slice(0, 8)}`,
    term: cleanTerm,
    phonetic: cleanPhonetic,
    ipa: input.ipa?.trim() || undefined,
    language: input.language || 'bilingual',
    notes: input.notes?.trim() || undefined,
    enabled: input.enabled ?? true,
    createdAt:
      existingIdx >= 0
        ? stateCache.pronunciations[existingIdx].createdAt
        : new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    stateCache.pronunciations[existingIdx] = entry;
  } else {
    stateCache.pronunciations.unshift(entry);
  }
  saveState(stateCache);
  return entry;
}

export function deletePronunciation(idOrTerm: string): boolean {
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

export function listVoicePresets(): SavedVoicePresetConfig[] {
  return [...stateCache.voicePresets];
}

export function getVoicePreset(idOrName: string): SavedVoicePresetConfig | undefined {
  return stateCache.voicePresets.find(
    (p) => p.id === idOrName || p.name.toLowerCase() === idOrName.toLowerCase()
  );
}

export function upsertVoicePreset(
  input: Omit<SavedVoicePresetConfig, 'id' | 'createdAt'> & { id?: string }
): SavedVoicePresetConfig {
  const existingIdx = stateCache.voicePresets.findIndex(
    (p) =>
      (input.id && p.id === input.id) ||
      p.name.toLowerCase() === input.name.trim().toLowerCase()
  );
  const preset: SavedVoicePresetConfig = {
    ...input,
    id:
      existingIdx >= 0
        ? stateCache.voicePresets[existingIdx].id
        : input.id || `vp-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    createdAt:
      existingIdx >= 0
        ? stateCache.voicePresets[existingIdx].createdAt
        : new Date().toISOString(),
  };
  if (existingIdx >= 0) {
    stateCache.voicePresets[existingIdx] = preset;
  } else {
    stateCache.voicePresets.unshift(preset);
  }
  saveState(stateCache);
  return preset;
}

export function deleteVoicePreset(id: string): boolean {
  const before = stateCache.voicePresets.length;
  stateCache.voicePresets = stateCache.voicePresets.filter((p) => p.id !== id);
  if (stateCache.voicePresets.length !== before) {
    saveState(stateCache);
    return true;
  }
  return false;
}

export function saveStoredClip(params: {
  id?: string;
  wavBuffer: Buffer;
  encodedBuffer?: Buffer;
  format: AudioFormat;
  mimeType: string;
  sampleRate: SampleRateHz;
  channels: ChannelCount;
  durationMs: number;
  voiceId: string;
  voiceName: string;
  modelUsed: string;
  language: 'en' | 'hi' | 'bilingual';
  displayText: string;
  masteringPreset: MasteringPreset;
  wordTimings: WordTiming[];
  phraseTimings: PhraseTiming[];
  speechEnvelope: SpeechEnvelopeInterval[];
  segments?: SpeechSegmentMeta[];
}): StoredClipRecord {
  ensureDirs();
  const id = params.id || crypto.randomUUID().slice(0, 12);
  const wavFileName = `${id}.wav`;
  fs.writeFileSync(path.join(CLIPS_DIR, wavFileName), params.wavBuffer);

  let encodedFileName: string | undefined;
  let primarySizeBytes = params.wavBuffer.length;
  if (params.format !== 'wav' && params.encodedBuffer) {
    encodedFileName = `${id}.${params.format}`;
    fs.writeFileSync(path.join(CLIPS_DIR, encodedFileName), params.encodedBuffer);
    primarySizeBytes = params.encodedBuffer.length;
  }

  const record: StoredClipRecord = {
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
    masteringPreset: params.masteringPreset,
    wordTimings: params.wordTimings,
    phraseTimings: params.phraseTimings,
    speechEnvelope: params.speechEnvelope,
    segments: params.segments,
    createdAt: new Date().toISOString(),
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

export function getClipRecord(id: string): StoredClipRecord | undefined {
  return stateCache.clips.find((c) => c.id === id);
}

export function getClipAudioBuffer(
  id: string,
  preferWav = false
): { record: StoredClipRecord; buffer: Buffer; mimeType: string; ext: string } | undefined {
  const record = getClipRecord(id);
  if (!record) return undefined;

  if (!preferWav && record.encodedFileName && record.format !== 'wav') {
    const encodedPath = path.join(CLIPS_DIR, record.encodedFileName);
    if (fs.existsSync(encodedPath)) {
      return {
        record,
        buffer: fs.readFileSync(encodedPath),
        mimeType: record.mimeType,
        ext: record.format,
      };
    }
  }

  const wavPath = path.join(CLIPS_DIR, record.wavFileName);
  if (!fs.existsSync(wavPath)) return undefined;
  return {
    record,
    buffer: fs.readFileSync(wavPath),
    mimeType: 'audio/wav',
    ext: 'wav',
  };
}

export function listRecentClips(limit = 30): StoredClipRecord[] {
  return stateCache.clips.slice(0, limit);
}

// Projects
export function listProjects(): StudioProject[] {
  return [...stateCache.projects];
}

export function getProject(id: string): StudioProject | undefined {
  return stateCache.projects.find((p) => p.id === id);
}

export function createProject(input: {
  name: string;
  description?: string;
  defaultVoicePresetId?: string;
}): StudioProject {
  const now = new Date().toISOString();
  const project: StudioProject = {
    id: `proj-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    defaultVoicePresetId: input.defaultVoicePresetId,
    clips: [],
    createdAt: now,
    updatedAt: now,
  };
  stateCache.projects.unshift(project);
  saveState(stateCache);
  return project;
}

export function addClipToProject(
  projectId: string,
  clip: Omit<StudioProjectClip, 'order' | 'addedAt'>
): StudioProject | undefined {
  const proj = stateCache.projects.find((p) => p.id === projectId);
  if (!proj) return undefined;
  const existing = proj.clips.find((c) => c.clipId === clip.clipId);
  if (!existing) {
    proj.clips.push({
      ...clip,
      order: proj.clips.length + 1,
      addedAt: new Date().toISOString(),
    });
  }
  proj.updatedAt = new Date().toISOString();
  saveState(stateCache);
  return proj;
}

export function updateProjectClip(
  projectId: string,
  clipId: string,
  updates: Partial<Pick<StudioProjectClip, 'title' | 'text' | 'order'>>
): StudioProject | undefined {
  const proj = stateCache.projects.find((p) => p.id === projectId);
  if (!proj) return undefined;
  const target = proj.clips.find((c) => c.clipId === clipId);
  if (!target) return undefined;
  if (updates.title !== undefined) target.title = updates.title;
  if (updates.text !== undefined) target.text = updates.text;
  if (typeof updates.order === 'number') target.order = updates.order;
  proj.clips.sort((a, b) => a.order - b.order);
  proj.updatedAt = new Date().toISOString();
  saveState(stateCache);
  return proj;
}

export function deleteProjectClip(projectId: string, clipId: string): StudioProject | undefined {
  const proj = stateCache.projects.find((p) => p.id === projectId);
  if (!proj) return undefined;
  proj.clips = proj.clips.filter((c) => c.clipId !== clipId);
  proj.clips.forEach((c, idx) => {
    c.order = idx + 1;
  });
  proj.updatedAt = new Date().toISOString();
  saveState(stateCache);
  return proj;
}
