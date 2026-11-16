import { useState } from 'react';
import { Check, Copy, Play, Plug, Terminal } from 'lucide-react';

interface McpConnectPanelProps {
  serverAppUrl: string | null;
}

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

  const runMcpRpcTest = async (method: 'tools/list' | 'tools/call') => {
    setIsTesting(true);
    setTestError(null);
    try {
      const rpcBody =
        method === 'tools/list'
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
                name: 'list_voices',
                arguments: { language: 'Hindi' },
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
              Remote MCP Endpoints
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Expose Svara Studio&apos;s English &amp; Hindi voices directly to ChatGPT and Claude over Model Context Protocol.
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

        <p className="text-xs text-slate-500 dark:text-slate-400">
          When sharing externally with ChatGPT or Claude.ai, publish this app in Google AI Studio so your public Shared App URL handles remote HTTPS requests without private preview auth.
        </p>
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
              Send real JSON-RPC 2.0 requests to <code className="font-mono">/mcp</code> to verify exposed tools (<code className="font-mono">list_voices</code>, <code className="font-mono">generate_speech</code>, <code className="font-mono">generate_dialogue</code>, <code className="font-mono">translate_tts_script</code>).
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isTesting}
              onClick={() => runMcpRpcTest('tools/list')}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-[#0F172A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Test tools/list</span>
            </button>
            <button
              type="button"
              disabled={isTesting}
              onClick={() => runMcpRpcTest('tools/call')}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Run list_voices (Hindi)</span>
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
