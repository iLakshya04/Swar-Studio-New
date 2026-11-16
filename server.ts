import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createSvaraMcpServer } from './src/mcp/createSvaraMcpServer';
import {
  getClip,
  mapApiError,
  synthesizeSpeech,
  translateSpeechScript,
} from './src/server/ttsService';
import type { GenerateRequestPayload } from './src/types';

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
  app.use(express.json({ limit: '4mb' }));

  const sseSessions = new Map<string, SSEServerTransport>();

  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      ok: true,
      hasKey: Boolean(process.env.GEMINI_API_KEY),
      mcpEndpoint: `${resolvePublicBaseUrl(req)}/mcp`,
      sseEndpoint: `${resolvePublicBaseUrl(req)}/sse`,
    });
  });

  app.get('/api/clips/:id.wav', mcpCorsMiddleware, (req: Request, res: Response) => {
    const clip = getClip(String(req.params.id));
    if (!clip) {
      res.status(404).json({ error: 'Audio clip expired or not found.' });
      return;
    }
    res.setHeader('Content-Type', clip.mimeType || 'audio/wav');
    res.setHeader('Content-Disposition', `inline; filename="svara-${clip.id}.wav"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(clip.wavBuffer);
  });

  app.post('/api/tts/generate', async (req: Request, res: Response) => {
    try {
      const payload = req.body as Partial<GenerateRequestPayload>;
      const result = await synthesizeSpeech(payload);
      res.json(result);
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/script/translate', async (req: Request, res: Response) => {
    try {
      const { text, targetLanguage } = req.body as {
        text?: string;
        targetLanguage?: 'en' | 'hi' | 'bilingual';
      };
      const translatedText = await translateSpeechScript(text || '', targetLanguage || 'hi');
      res.json({ translatedText });
    } catch (error) {
      const mapped = mapApiError(error);
      res.status(mapped.status).json({ error: mapped.message });
    }
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
