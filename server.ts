import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { VOICE_PRESETS } from './src/data/voices';
import {
  SVARA_MCP_BUILD,
  SVARA_MCP_VERSION,
  createSvaraMcpServer,
} from './src/mcp/createSvaraMcpServer';
import { buildAiPluginManifest, buildOpenApiSpec } from './src/server/openApiSpec';
import {
  addClipToProject,
  createProject,
  deletePronunciation,
  deleteProjectClip,
  deleteVoicePreset,
  getClipAudioBuffer,
  getClipRecord,
  getProject,
  getStoreDir,
  listProjects,
  listPronunciations,
  listRecentClips,
  listVoicePresets,
  updateProjectClip,
  upsertPronunciation,
  upsertVoicePreset,
} from './src/server/studioStore';
import {
  analyzeVoiceBuffer,
  localizeNarration,
  mapApiError,
  matchAudioDuration,
  regenerateClipSegment,
  replaceAudioSegmentFromBuffer,
  resolveInputAudioBuffer,
  synthesizeSpeech,
  transcribeAudioBuffer,
  translateSpeechScript,
} from './src/server/ttsService';
import { createClonedVoicePreset } from './src/server/voiceAnalysis';
import { filterVoices } from './src/utils/speechLogic';
import { generateSubtitles } from './src/utils/subtitleGenerator';
import type {
  GenerateRequestPayload,
  SubtitleFormat,
  SubtitleGranularity,
  SubtitlePreset,
  WordTiming,
} from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function resolvePublicBaseUrl(req: Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const forwardedProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim();
  const proto = forwardedProto || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function mcpCorsMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, Authorization, mcp-session-id, mcp-protocol-version, Last-Event-ID'
  );
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '16mb' }));

  const sseSessions = new Map<string, SSEServerTransport>();

  app.get('/api/health', (req: Request, res: Response) => {
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
        elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
        keyless: true,
      },
      mcpEndpoint: `${base}/mcp`,
      sseEndpoint: `${base}/sse`,
      openApiSpec: `${base}/openapi.json`,
      aiPluginManifest: `${base}/.well-known/ai-plugin.json`,
    });
  });

  // ChatGPT Plugin Manifest & OpenAPI 3.1.0 Spec exposing all Svara Studio features
  app.get('/.well-known/ai-plugin.json', mcpCorsMiddleware, (req: Request, res: Response) => {
    res.json(buildAiPluginManifest(resolvePublicBaseUrl(req)));
  });

  app.get('/openapi.json', mcpCorsMiddleware, (req: Request, res: Response) => {
    res.json(buildOpenApiSpec(resolvePublicBaseUrl(req)));
  });

  app.get('/api/voices', mcpCorsMiddleware, (req: Request, res: Response) => {
    const rawLang = String(req.query.language || 'All');
    const language = (['All', 'English', 'Hindi', 'Bilingual'].includes(rawLang)
      ? rawLang
      : 'All') as 'All' | 'English' | 'Hindi' | 'Bilingual';
    const rawCat = String(req.query.category || 'All');
    const category = (
      ['All', 'Narration', 'Conversational', 'Characters', 'News & Anchor', 'Wellness'].includes(
        rawCat
      )
        ? rawCat
        : 'All'
    ) as 'All' | 'Narration' | 'Conversational' | 'Characters' | 'News & Anchor' | 'Wellness';
    const query = String(req.query.query || '');
    const voices = filterVoices(VOICE_PRESETS, query, language, category);
    res.json({ count: voices.length, voices });
  });

  // Serve WAV / MP3 / M4A / FLAC clips with inline or attachment disposition
  app.get('/api/clips/:id.:ext', mcpCorsMiddleware, (req: Request, res: Response) => {
    const id = String(req.params.id);
    const ext = String(req.params.ext || 'wav').toLowerCase();
    const preferWav = ext === 'wav';
    const found = getClipAudioBuffer(id, preferWav);
    if (!found) {
      res.status(404).json({ error: 'Audio clip expired or not found.' });
      return;
    }
    const isDownload = req.query.download === '1' || req.query.download === 'true';
    res.setHeader('Content-Type', found.mimeType || 'audio/wav');
    res.setHeader(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="svara-${id}.${found.ext}"`
    );
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(found.buffer);
  });

  app.get('/api/clips/:id/subtitles/:format', mcpCorsMiddleware, (req: Request, res: Response) => {
    const id = String(req.params.id);
    const format = String(req.params.format || 'srt').toLowerCase() as SubtitleFormat;
    if (!['srt', 'vtt', 'ass', 'json'].includes(format)) {
      res.status(400).json({ error: 'Unsupported subtitle format.' });
      return;
    }
    const record = getClipRecord(id);
    if (!record) {
      res.status(404).json({ error: 'Clip not found.' });
      return;
    }
    const preset = (String(req.query.preset || 'rainbow_reels') as SubtitlePreset);
    const maxLinesNum = Number(req.query.maxLines || 3);
    const maxLines = (maxLinesNum === 1 || maxLinesNum === 2 ? maxLinesNum : 3) as 1 | 2 | 3;
    const maxCharsPerLine = req.query.maxCharsPerLine ? Number(req.query.maxCharsPerLine) : undefined;
    const maxDurationSeconds = req.query.maxDurationSeconds
      ? Number(req.query.maxDurationSeconds)
      : undefined;
    const isWordLevel =
      req.query.granularity === 'word' ||
      req.query.wordLevel === '1' ||
      req.query.wordLevel === 'true';
    const granularity: SubtitleGranularity = isWordLevel ? 'word' : 'phrase';

    const text = generateSubtitles({
      wordTimings: record.wordTimings,
      format,
      granularity,
      wordLevel: isWordLevel,
      preset,
      maxLines,
      maxCharsPerLine: Number.isFinite(maxCharsPerLine) ? maxCharsPerLine : undefined,
      maxDurationSeconds: Number.isFinite(maxDurationSeconds) ? maxDurationSeconds : undefined,
    });
    const mimeMap: Record<SubtitleFormat, string> = {
      srt: 'application/x-subrip; charset=utf-8',
      vtt: 'text/vtt; charset=utf-8',
      ass: 'text/x-ssa; charset=utf-8',
      json: 'application/json; charset=utf-8',
    };
    const isDownload = req.query.download === '1' || req.query.download === 'true';
    res.setHeader('Content-Type', mimeMap[format]);
    res.setHeader(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="svara-${id}${isWordLevel ? '-words' : ''}.${format}"`
    );
    res.send(text);
  });

  app.post('/api/subtitles', mcpCorsMiddleware, (req: Request, res: Response) => {
    const body = req.body as {
      clipId?: string;
      wordTimings?: WordTiming[];
      format?: SubtitleFormat;
      granularity?: SubtitleGranularity;
      wordLevel?: boolean;
      preset?: SubtitlePreset;
      maxLines?: 1 | 2 | 3;
      maxCharsPerLine?: number;
      maxPhraseDurationMs?: number;
      maxDurationSeconds?: number;
    };
    const timings = body.clipId ? getClipRecord(body.clipId)?.wordTimings : body.wordTimings;
    if (!timings || timings.length === 0) {
      res.status(404).json({ error: 'No word timings found for subtitle generation.' });
      return;
    }
    const granularity: SubtitleGranularity =
      body.wordLevel || body.granularity === 'word' ? 'word' : 'phrase';
    const content = generateSubtitles({
      wordTimings: timings,
      format: body.format || 'srt',
      granularity,
      wordLevel: granularity === 'word',
      preset: body.preset || 'rainbow_reels',
      maxLines: body.maxLines || 3,
      maxCharsPerLine: body.maxCharsPerLine,
      maxPhraseDurationMs: body.maxPhraseDurationMs,
      maxDurationSeconds: body.maxDurationSeconds,
    });
    res.json({ format: body.format || 'srt', granularity, content });
  });

  app.get('/api/clips', (_req: Request, res: Response) => {
    res.json({ clips: listRecentClips(30) });
  });

  app.get('/api/clips/:id', mcpCorsMiddleware, (req: Request, res: Response) => {
    const id = String(req.params.id);
    const record = getClipRecord(id);
    if (!record) {
      res.status(404).json({
        error_code: 'INVALID_ARGUMENT',
        error: `Clip '${id}' not found.`,
        message: `Clip '${id}' not found.`,
      });
      return;
    }
    const base = resolvePublicBaseUrl(req);
    const audioPath = `/api/clips/${record.id}.${record.format}`;
    res.json({
      clipId: record.id,
      audioUrl: `${base}${audioPath}`,
      downloadUrl: `${base}${audioPath}?download=1`,
      wordSrtUrl: `${base}/api/clips/${record.id}/subtitles/srt?granularity=word&download=1`,
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
      timingSource: record.timingSource || 'forced_alignment',
      timingConfidence: record.timingConfidence ?? 0.85,
      wordTimings: record.wordTimings,
      phraseTimings: record.phraseTimings,
      waveformPeaks: record.waveformPeaks ?? [],
      segments: record.segments,
      createdAt: record.createdAt,
    });
  });

  app.post('/api/tts/generate', async (req: Request, res: Response) => {
    try {
      const payload = req.body as Partial<GenerateRequestPayload>;
      const result = await synthesizeSpeech(payload);
      res.json(result);
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message, ...mapped });
    }
  });

  app.post('/api/tts/segments/regenerate', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        clipId: string;
        segmentIndex: number;
        text?: string;
        emotion?: string;
        voiceId?: string;
        stylePrompt?: string;
        speed?: number;
      };
      const result = await regenerateClipSegment(body);
      res.json(result);
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message, ...mapped });
    }
  });

  app.post('/api/script/translate', async (req: Request, res: Response) => {
    try {
      const { text, targetLanguage, preserveDuration } = req.body as {
        text?: string;
        targetLanguage?: 'en' | 'hi' | 'bilingual';
        preserveDuration?: boolean;
      };
      const translatedText = await translateSpeechScript(
        text || '',
        targetLanguage || 'hi',
        Boolean(preserveDuration)
      );
      res.json({ translatedText });
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message, ...mapped });
    }
  });

  app.post('/api/script/localize', mcpCorsMiddleware, async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        text?: string;
        targetLanguages?: Array<'en' | 'hi' | 'bilingual'>;
        voiceId?: string;
        preserveDuration?: boolean;
        targetDurationSeconds?: number;
      };
      const localized = await localizeNarration({
        text: body.text || '',
        targetLanguages: body.targetLanguages?.length ? body.targetLanguages : ['hi'],
        voiceId: body.voiceId,
        preserveDuration: body.preserveDuration,
        targetDurationSeconds: body.targetDurationSeconds,
      });
      res.json({ localizations: localized });
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message, ...mapped });
    }
  });

  app.post('/api/audio/transcribe', mcpCorsMiddleware, async (req: Request, res: Response) => {
    try {
      const { buffer, mimeType } = await resolveInputAudioBuffer(req.body || {});
      const transcript = await transcribeAudioBuffer(buffer, mimeType);
      res.json({ transcript });
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message, ...mapped });
    }
  });

  app.post('/api/audio/analyze-voice', mcpCorsMiddleware, async (req: Request, res: Response) => {
    try {
      const { buffer, mimeType } = await resolveInputAudioBuffer(req.body || {});
      const analysis = await analyzeVoiceBuffer(buffer, mimeType);
      res.json(analysis);
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message, ...mapped });
    }
  });

  app.post('/api/audio/clone-preset', mcpCorsMiddleware, async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        audioBase64?: string;
        mimeType?: string;
        presetName?: string;
        language?: 'en' | 'hi' | 'bilingual';
        clipId?: string;
        audioUrl?: string;
      };
      const { buffer, mimeType } = await resolveInputAudioBuffer({
        clipId: body.clipId,
        audioUrl: body.audioUrl,
        audioBase64: body.audioBase64,
        audioFile: body.mimeType ? { mime_type: body.mimeType } : undefined,
      });
      if (!buffer || buffer.length < 256) {
        res.status(400).json({ error: 'Recorded or uploaded audio sample is empty.' });
        return;
      }
      const cloned = await createClonedVoicePreset({
        buffer,
        mimeType: body.mimeType || mimeType,
        presetName: body.presetName || 'My Studio Voice',
        language: body.language || 'en',
        optionalAiAnalyze: (buf, mt) => analyzeVoiceBuffer(buf, mt),
      });
      res.json(cloned);
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message, ...mapped });
    }
  });

  app.post('/api/audio/match-duration', mcpCorsMiddleware, async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        clipId?: string;
        audioUrl?: string;
        audioBase64?: string;
        targetDurationSeconds: number;
        sampleRate?: 24000 | 44100 | 48000;
        channels?: 1 | 2;
      };
      const { buffer, sourceText } = await resolveInputAudioBuffer(body);
      const result = await matchAudioDuration({
        buffer,
        targetDurationSeconds: Number(body.targetDurationSeconds || 5),
        sampleRate: body.sampleRate,
        channels: body.channels,
        sourceText,
      });
      res.json(result);
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message, ...mapped });
    }
  });

  app.post('/api/audio/replace-segment', mcpCorsMiddleware, async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        clipId?: string;
        audioUrl?: string;
        audioBase64?: string;
        startMs: number;
        endMs: number;
        replacementText: string;
        voiceId?: string;
        language?: 'en' | 'hi' | 'bilingual';
      };
      const { buffer } = await resolveInputAudioBuffer(body);
      const result = await replaceAudioSegmentFromBuffer({
        buffer,
        startMs: Number(body.startMs || 0),
        endMs: Number(body.endMs || 500),
        replacementText: body.replacementText || '',
        voiceId: body.voiceId,
        language: body.language,
      });
      res.json(result);
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message, ...mapped });
    }
  });

  // Pronunciation dictionary endpoints
  app.get('/api/pronunciations', (_req: Request, res: Response) => {
    res.json({ entries: listPronunciations() });
  });

  app.post('/api/pronunciations', (req: Request, res: Response) => {
    const body = req.body as {
      id?: string;
      term?: string;
      phonetic?: string;
      ipa?: string;
      language?: 'en' | 'hi' | 'bilingual';
      notes?: string;
      enabled?: boolean;
    };
    if (!body.term?.trim() || !body.phonetic?.trim()) {
      res.status(400).json({ error: 'Both term and phonetic spelling are required.' });
      return;
    }
    const entry = upsertPronunciation({
      id: body.id,
      term: body.term,
      phonetic: body.phonetic,
      ipa: body.ipa,
      language: body.language,
      notes: body.notes,
      enabled: body.enabled,
    });
    res.json({ entry, entries: listPronunciations() });
  });

  app.delete('/api/pronunciations/:id', (req: Request, res: Response) => {
    const deleted = deletePronunciation(String(req.params.id));
    res.json({ deleted, entries: listPronunciations() });
  });

  // Saved voice presets endpoints
  app.get('/api/presets', (_req: Request, res: Response) => {
    res.json({ presets: listVoicePresets() });
  });

  app.post('/api/presets', (req: Request, res: Response) => {
    const body = req.body as Parameters<typeof upsertVoicePreset>[0];
    if (!body.name?.trim() || !body.voiceId?.trim()) {
      res.status(400).json({ error: 'Preset name and voiceId are required.' });
      return;
    }
    const preset = upsertVoicePreset(body);
    res.json({ preset, presets: listVoicePresets() });
  });

  app.delete('/api/presets/:id', (req: Request, res: Response) => {
    const deleted = deleteVoicePreset(String(req.params.id));
    res.json({ deleted, presets: listVoicePresets() });
  });

  // Projects endpoints
  app.get('/api/projects', (_req: Request, res: Response) => {
    res.json({ projects: listProjects() });
  });

  app.post('/api/projects', (req: Request, res: Response) => {
    const body = req.body as { name?: string; description?: string; defaultVoicePresetId?: string };
    if (!body.name?.trim()) {
      res.status(400).json({ error: 'Project name is required.' });
      return;
    }
    const project = createProject({
      name: body.name,
      description: body.description,
      defaultVoicePresetId: body.defaultVoicePresetId,
    });
    res.json({ project });
  });

  app.get('/api/projects/:id', (req: Request, res: Response) => {
    const proj = getProject(String(req.params.id));
    if (!proj) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.json({ project: proj });
  });

  app.post('/api/projects/:id/clips', mcpCorsMiddleware, (req: Request, res: Response) => {
    const projectId = String(req.params.id);
    const body = req.body as { clipId?: string; title?: string };
    if (!body.clipId?.trim()) {
      res.status(400).json({ error: 'clipId is required.' });
      return;
    }
    const rec = getClipRecord(body.clipId.trim());
    if (!rec) {
      res.status(404).json({ error: `Clip '${body.clipId}' not found.` });
      return;
    }
    const updated = addClipToProject(projectId, {
      clipId: rec.id,
      title: body.title || rec.displayText.slice(0, 48),
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
    if (!updated) {
      res.status(404).json({ error: `Project '${projectId}' not found.` });
      return;
    }
    res.json({ project: updated });
  });

  app.patch('/api/projects/:id/clips/:clipId', mcpCorsMiddleware, (req: Request, res: Response) => {
    const body = req.body as { title?: string; text?: string; order?: number };
    const updated = updateProjectClip(String(req.params.id), String(req.params.clipId), body);
    if (!updated) {
      res.status(404).json({ error: 'Project or clip not found.' });
      return;
    }
    res.json({ project: updated });
  });

  app.delete('/api/projects/:id/clips/:clipId', mcpCorsMiddleware, (req: Request, res: Response) => {
    const updated = deleteProjectClip(String(req.params.id), String(req.params.clipId));
    if (!updated) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.json({ project: updated });
  });

  app.get('/api/projects/:id/export', mcpCorsMiddleware, (req: Request, res: Response) => {
    const proj = getProject(String(req.params.id));
    if (!proj) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const base = resolvePublicBaseUrl(req);
    res.json({
      ...proj,
      clips: proj.clips.map((c) => ({
        ...c,
        audioUrl: `${base}${c.audioUrl}`,
        downloadUrl: `${base}${c.downloadUrl}`,
        srtUrl: `${base}/api/clips/${c.clipId}/subtitles/srt?download=1`,
        wordSrtUrl: `${base}/api/clips/${c.clipId}/subtitles/srt?granularity=word&download=1`,
        assUrl: `${base}/api/clips/${c.clipId}/subtitles/ass?preset=rainbow_reels&download=1`,
      })),
    });
  });

  // Streamable HTTP MCP Endpoint for ChatGPT Connectors, Claude.ai, and Claude Code
  app.all('/mcp', mcpCorsMiddleware, async (req: Request, res: Response) => {
    if (req.method !== 'POST') {
      res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed. Send JSON-RPC POST requests to /mcp.' },
        id: null,
      });
      return;
    }

    const baseUrl = resolvePublicBaseUrl(req);
    const mcpServer = createSvaraMcpServer(baseUrl);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      transport.close().catch(() => {});
      mcpServer.close().catch(() => {});
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP request error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal MCP server error' },
          id: null,
        });
      }
    }
  });

  // Legacy HTTP+SSE MCP Endpoint for Claude Desktop / older MCP bridges
  app.get('/sse', mcpCorsMiddleware, async (req: Request, res: Response) => {
    const baseUrl = resolvePublicBaseUrl(req);
    const mcpServer = createSvaraMcpServer(baseUrl);
    const transport = new SSEServerTransport('/messages', res);
    sseSessions.set(transport.sessionId, transport);

    res.on('close', () => {
      sseSessions.delete(transport.sessionId);
      mcpServer.close().catch(() => {});
    });

    await mcpServer.connect(transport);
  });

  app.post('/messages', mcpCorsMiddleware, async (req: Request, res: Response) => {
    const sessionId = String(req.query.sessionId || '');
    const transport = sseSessions.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'Unknown SSE sessionId' });
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*path}', (_req: Request, res: Response) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Svara Studio server & MCP endpoint listening on http://0.0.0.0:${PORT}/mcp`);
  });
}

startServer();
