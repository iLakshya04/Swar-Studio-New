import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStyleInstruction,
  clampSpeed,
  countWordsAndChars,
  detectScriptLanguage,
  filterVoices,
  formatAudioTime,
  insertVocalTagAtCursor,
  selectTtsModel,
  validateGeneratePayload,
} from './speechLogic';
import type { VoicePreset } from '../types';

const SAMPLE_VOICES: VoicePreset[] = [
  {
    id: 'aarav',
    name: 'Aarav',
    roleTitle: 'Kahani Storyteller',
    baseVoice: 'Puck',
    language: 'Hindi',
    category: 'Narration',
    gender: 'Male',
    accent: 'Standard Hindi',
    description: 'Warm, expressive Hindi narrator for stories and audiobooks.',
    defaultStyle: 'Warm, expressive storyteller',
    sampleText: 'नमस्ते, आज हम एक नई कहानी सुनेंगे।',
    sampleLanguage: 'hi',
  },
  {
    id: 'marcus',
    name: 'Marcus',
    roleTitle: 'Grizzled Detective',
    baseVoice: 'Charon',
    language: 'English',
    category: 'Characters',
    gender: 'Male',
    accent: 'American Noir',
    description: 'Low, gravelly voice for noir mysteries.',
    defaultStyle: 'Low, gravelly noir',
    sampleText: 'Rain fell hard on Fifth Street.',
    sampleLanguage: 'en',
  },
  {
    id: 'ananya',
    name: 'Ananya',
    roleTitle: 'Meditation Guide',
    baseVoice: 'Zephyr',
    language: 'Bilingual',
    category: 'Wellness',
    gender: 'Female',
    accent: 'Indian English & Hindi',
    description: 'Airy, soothing bilingual wellness instructor.',
    defaultStyle: 'Airy and soothing',
    sampleText: 'Take a deep breath. एक गहरी सांस लें।',
    sampleLanguage: 'bilingual',
  },
];

test('detectScriptLanguage distinguishes English, Hindi Devanagari, and Bilingual', () => {
  assert.equal(detectScriptLanguage('Welcome to Svara Studio.'), 'en');
  assert.equal(detectScriptLanguage('नमस्ते, आपका स्वागत है।'), 'hi');
  assert.equal(
    detectScriptLanguage('Welcome friends, आज का शो बहुत खास है।'),
    'bilingual'
  );
  assert.equal(detectScriptLanguage('<sigh> Hello world'), 'en');
});

test('countWordsAndChars strips vocal tags for word count and estimates duration', () => {
  const stats = countWordsAndChars('Hello <laugh> world today');
  assert.equal(stats.words, 3);
  assert.equal(stats.chars, 'Hello <laugh> world today'.length);
  assert.ok(stats.estimatedSeconds >= 1);

  const emptyStats = countWordsAndChars('   ');
  assert.equal(emptyStats.words, 0);
  assert.equal(emptyStats.estimatedSeconds, 0);
});

test('insertVocalTagAtCursor inserts spaced vocal tag cleanly at cursor position', () => {
  const res1 = insertVocalTagAtCursor('Hello world', '<laugh>', 5, 5);
  assert.equal(res1.nextText, 'Hello <laugh> world');

  const res2 = insertVocalTagAtCursor('Hello ', '<sigh>', 6, 6);
  assert.equal(res2.nextText, 'Hello <sigh>');

  const res3 = insertVocalTagAtCursor('', '<breath>', 0, 0);
  assert.equal(res3.nextText, '<breath>');
});

test('filterVoices filters by language (including bilingual overlap), category, and search query', () => {
  const hindiVoices = filterVoices(SAMPLE_VOICES, '', 'Hindi', 'All');
  assert.equal(hindiVoices.length, 2); // Aarav (Hindi) + Ananya (Bilingual)

  const characterVoices = filterVoices(SAMPLE_VOICES, '', 'All', 'Characters');
  assert.equal(characterVoices.length, 1);
  assert.equal(characterVoices[0].id, 'marcus');

  const searchMatches = filterVoices(SAMPLE_VOICES, 'noir', 'All', 'All');
  assert.equal(searchMatches.length, 1);
  assert.equal(searchMatches[0].id, 'marcus');
});

test('selectTtsModel routes expressive, multi-speaker, custom voice, and vocal tags to gemini-3.8-flash-tts', () => {
  assert.equal(
    selectTtsModel({ mode: 'single', modelTier: 'standard', text: 'Plain text' }),
    'gemini-3.8-flash-lite-tts'
  );
  assert.equal(
    selectTtsModel({ mode: 'single', modelTier: 'standard', text: 'Wait <gasp> really?' }),
    'gemini-3.8-flash-tts'
  );
  assert.equal(
    selectTtsModel({
      mode: 'single',
      modelTier: 'standard',
      text: 'Plain text',
      customVoiceDescription: 'Laid-back late-night radio DJ',
    }),
    'gemini-3.8-flash-tts'
  );
  assert.equal(
    selectTtsModel({ mode: 'multi', modelTier: 'standard', text: '' }),
    'gemini-3.8-flash-tts'
  );
});

test('clampSpeed restricts speed slider values to [0.7, 1.4] in 0.05 increments', () => {
  assert.equal(clampSpeed(0.2), 0.7);
  assert.equal(clampSpeed(2.0), 1.4);
  assert.equal(clampSpeed(1.13), 1.15);
  assert.equal(clampSpeed(NaN), 1.0);
});

test('buildStyleInstruction includes custom voice, delivery style, pitch, emotion, language hint, and pacing', () => {
  const style = buildStyleInstruction({
    language: 'hi',
    stylePrompt: 'Calm documentary tone',
    customVoiceDescription: 'Deep baritone Hindi storyteller',
    speed: 0.75,
    pitchRegister: 'deep',
    emotionIntensity: 'dramatic',
  });
  assert.match(style, /Deep baritone Hindi storyteller/);
  assert.match(style, /Calm documentary tone/);
  assert.match(style, /lower vocal register/);
  assert.match(style, /theatrical emotional inflection/);
  assert.match(style, /Hindi pronunciation/);
  assert.match(style, /slow pacing/);
});

test('validateGeneratePayload rejects empty scripts and oversized scripts', () => {
  const emptyRes = validateGeneratePayload({ mode: 'single', text: '   ' });
  assert.equal(emptyRes.valid, false);

  const validRes = validateGeneratePayload({ mode: 'single', text: 'नमस्ते दुनिया' });
  assert.equal(validRes.valid, true);

  const emptyMulti = validateGeneratePayload({
    mode: 'multi',
    dialogueLines: [{ id: '1', speakerKey: 'A', text: '  ' }],
  });
  assert.equal(emptyMulti.valid, false);
});

test('formatAudioTime formats seconds as mm:ss', () => {
  assert.equal(formatAudioTime(0), '0:00');
  assert.equal(formatAudioTime(9), '0:09');
  assert.equal(formatAudioTime(75), '1:15');
  assert.equal(formatAudioTime(NaN), '0:00');
});
