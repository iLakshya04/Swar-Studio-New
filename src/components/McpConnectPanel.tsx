import { useState } from 'react';
import { Check, Copy, Play, Plug, Terminal } from 'lucide-react';

interface McpConnectPanelProps {
  serverAppUrl: string | null;
}

const CREATOR_TOOLS_SUMMARY = [
  {
    name: 'generate_speech',
    summary: '48 kHz mono/stereo WAV, MP3/M4A/FLAC, native file handoff, wordTimings, speechEnvelope, target duration',
  },
  {
    name: 'generate_subtitles',
    summary: 'Direct .SRT, .VTT, .ASS (Rainbow Reels white + cyan #00E5FF active word), and word-timing JSON',
  },
  {
    name: 'generate_speech_segments & regenerate_segment',
    summary: 'Per-line [CURIOUS]/[AWE] synthesis + re-stitching a single sentence without redoing the clip',
  },
  {
    name: 'add_pronunciation / list_pronunciations',
    summary: 'Shared English & Hindi phonetic/IPA dictionary applied cleanly without altering captions',
  },
  {
    name: 'localize_narration & generate_dialogue',
    summary: 'Duration-matched EN -> Hindi/Hinglish dubs + 2–6 speaker dialogues with optional speaker stems',
  },
  {
    name: 'transcribe_audio, dub_audio, match_duration, analyze_voice, replace_segment',
    summary: 'Accepts native ChatGPT audioFile uploads (openai/fileParams) or Svara clipIds',
  },
];

export function McpConnectPanel({ serverAppUrl }: McpConnectPanelProps) {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : serverAppUrl || 'http://localhost:3000';

  const activeMcpUrl = `${origin}/mcp`;
  const activeSseUrl = `${origin}/sse`;

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const claudeCodeCmd = `claude mcp add --transport http svara-studio ${activeMcpUrl}`;
  const claudeDesktopJson = JSON.stringify(
    {
      mcpServers: {
        'svara-studio': {
          command: 'npx',
          args: ['-y', 'mcp-remote', activeMcpUrl],
        },
      },
    },
    null,
    2
  );

  const handleCopy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      // Fallback ignored in restricted clipboard contexts
    }
  };

  const runMcpRpcTest = async (
    action: 'tools/list' | 'list_voices' | 'list_pronunciations' | 'initialize'
  ) => {
    setIsTesting(true);
    setTestError(null);
    try {
      const rpcBody =
        action === 'initialize'
          ? {
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'initialize',
              params: {
                protocolVersion: '2025-03-26',
                capabilities: {},
                clientInfo: { name: 'svara-inspector', version: '1.0.0' },
              },
            }
          : action === 'tools/list'
            ? {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/list',
                params: {},
              }
            : {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/call',
                params: {
                  name: action,
                  arguments: action === 'list_voices' ? { language: 'Hindi' } : {},
                },
              };

      const res = await fetch('/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(rpcBody),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || `MCP HTTP ${res.status}`);
      }
      setTestOutput(JSON.stringify(data, null, 2));
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'MCP request failed');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-[#0F172A] dark:text-slate-100">
              Remote Creator Speech MCP Endpoints
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Returns native MCP audio file resources/links, 48 kHz normalized WAVs, word timestamps, Rainbow Reels .ASS captions, and supports ChatGPT file uploads.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
              Streamable HTTP Ready
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Streamable HTTP Endpoint (ChatGPT &amp; Claude.ai)
            </span>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-[#0F172A] dark:text-slate-200 truncate">
                {activeMcpUrl}
              </code>
              <button
                type="button"
                onClick={() => handleCopy('mcp-url', activeMcpUrl)}
                aria-label="Copy Streamable HTTP MCP URL"
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedId === 'mcp-url' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy URL</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Legacy SSE Endpoint (Older MCP Bridges)
            </span>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-[#0F172A] dark:text-slate-200 truncate">
                {activeSseUrl}
              </code>
              <button
                type="button"
                onClick={() => handleCopy('sse-url', activeSseUrl)}
                aria-label="Copy SSE MCP URL"
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedId === 'sse-url' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy SSE</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3">
          {CREATOR_TOOLS_SUMMARY.map((t) => (
            <div key={t.name} className="text-xs space-y-0.5">
              <p className="font-mono font-semibold text-[#0F172A] dark:text-slate-100">
                {t.name}
              </p>
              <p className="text-slate-500 dark:text-slate-400">{t.summary}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Plug className="w-4 h-4 text-[#2563EB]" />
              <h3 className="text-sm font-semibold text-[#0F172A] dark:text-slate-100">
                ChatGPT Connectors
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              In ChatGPT Settings → Connectors → Create (Developer Mode), paste the Streamable HTTP URL below and choose Authentication: None.
            </p>
            <pre className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-800 dark:text-slate-200 overflow-x-auto">
{`Server URL: ${activeMcpUrl}
Transport: Streamable HTTP
Auth: None`}
            </pre>
          </div>
          <button
            type="button"
            onClick={() => handleCopy('chatgpt', activeMcpUrl)}
            className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {copiedId === 'chatgpt' ? 'Copied ChatGPT URL' : 'Copy Server URL for ChatGPT'}
          </button>
        </article>

        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#2563EB]" />
              <h3 className="text-sm font-semibold text-[#0F172A] dark:text-slate-100">
                Claude.ai &amp; Claude Code
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Add as a custom connector in Claude.ai Settings → Connectors, or register directly in Claude Code CLI:
            </p>
            <pre className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-800 dark:text-slate-200 overflow-x-auto whitespace-pre-wrap break-all">
              {claudeCodeCmd}
            </pre>
          </div>
          <button
            type="button"
            onClick={() => handleCopy('claude-code', claudeCodeCmd)}
            className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {copiedId === 'claude-code' ? 'Copied CLI Command' : 'Copy Claude Code Command'}
          </button>
        </article>

        <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#2563EB]" />
              <h3 className="text-sm font-semibold text-[#0F172A] dark:text-slate-100">
                Claude Desktop Config
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Paste into your <code className="font-mono">claude_desktop_config.json</code> file:
            </p>
            <pre className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-800 dark:text-slate-200 overflow-x-auto">
              {claudeDesktopJson}
            </pre>
          </div>
          <button
            type="button"
            onClick={() => handleCopy('claude-desktop', claudeDesktopJson)}
            className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {copiedId === 'claude-desktop' ? 'Copied JSON Config' : 'Copy Claude Desktop JSON'}
          </button>
        </article>
      </div>

      {/* Live MCP Inspector */}
      <section
        aria-label="Live MCP endpoint tester"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#0F172A] dark:text-slate-100">
              Live MCP Endpoint Verification
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Send live JSON-RPC 2.0 requests to <code className="font-mono">/mcp</code> to verify all 27 tools, workflow instructions, and pronunciation dictionary.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isTesting}
              onClick={() => runMcpRpcTest('initialize')}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Test initialize</span>
            </button>
            <button
              type="button"
              disabled={isTesting}
              onClick={() => runMcpRpcTest('tools/list')}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Test tools/list</span>
            </button>
            <button
              type="button"
              disabled={isTesting}
              onClick={() => runMcpRpcTest('list_pronunciations')}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Pronunciations</span>
            </button>
            <button
              type="button"
              disabled={isTesting}
              onClick={() => runMcpRpcTest('list_voices')}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Run list_voices</span>
            </button>
          </div>
        </div>

        {testError && (
          <div className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-xs text-red-700 dark:text-red-300">
            {testError}
          </div>
        )}

        {testOutput && (
          <pre
            data-testid="mcp-test-output"
            className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 max-h-72 overflow-auto"
          >
            {testOutput}
          </pre>
        )}
      </section>
    </div>
  );
}
