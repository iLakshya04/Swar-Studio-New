export interface ApiErrorPayload {
  status: number;
  error_code: 'RESOURCE_EXHAUSTED' | 'INVALID_ARGUMENT' | 'PERMISSION_DENIED' | 'INTERNAL';
  retryable: boolean;
  retryAfterSeconds?: number;
  attemptedModels?: string[];
  message: string;
}

export class InputValidationError extends Error {
  status = 400;
  error_code = 'INVALID_ARGUMENT' as const;
  retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'InputValidationError';
  }
}

export class QuotaExhaustedError extends Error {
  status = 429;
  error_code = 'RESOURCE_EXHAUSTED' as const;
  retryable = true;
  retryAfterSeconds: number;
  attemptedModels: string[];

  constructor(params: {
    attemptedModels: string[];
    retryAfterSeconds?: number;
    message?: string;
  }) {
    super(
      params.message ||
        'All configured TTS providers are currently unavailable. Enable billing or configure a fallback provider (OPENAI_API_KEY or ELEVENLABS_API_KEY) in Settings > Secrets.'
    );
    this.name = 'QuotaExhaustedError';
    this.attemptedModels = params.attemptedModels;
    this.retryAfterSeconds =
      typeof params.retryAfterSeconds === 'number' && params.retryAfterSeconds > 0
        ? Math.round(params.retryAfterSeconds)
        : 3600;
  }

  toPayload(): ApiErrorPayload {
    return {
      status: 429,
      error_code: 'RESOURCE_EXHAUSTED',
      retryable: true,
      retryAfterSeconds: this.retryAfterSeconds,
      attemptedModels: this.attemptedModels,
      message: this.message,
    };
  }
}

// Track temporarily exhausted models so we do not repeatedly retry known-exhausted models
const modelCooldownUntil = new Map<string, number>();

export function markModelCooldown(model: string, retryAfterSeconds: number): void {
  const safeSeconds = Math.max(15, Math.min(86400, Math.round(retryAfterSeconds || 60)));
  modelCooldownUntil.set(model, Date.now() + safeSeconds * 1000);
}

export function isModelOnCooldown(model: string): boolean {
  const until = modelCooldownUntil.get(model);
  if (!until) return false;
  if (Date.now() >= until) {
    modelCooldownUntil.delete(model);
    return false;
  }
  return true;
}

export function getModelCooldownRemainingSec(model: string): number {
  const until = modelCooldownUntil.get(model);
  if (!until) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export function clearModelCooldowns(): void {
  modelCooldownUntil.clear();
}

function parseJsonSafe(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    const idx = trimmed.indexOf('{');
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

function collectErrorNodes(err: unknown): Array<Record<string, unknown> | string> {
  const nodes: Array<Record<string, unknown> | string> = [];
  const queue: unknown[] = [err];
  const seen = new Set<unknown>();

  while (queue.length > 0 && nodes.length < 40) {
    const cur = queue.shift();
    if (!cur || seen.has(cur)) continue;

    if (typeof cur === 'string') {
      nodes.push(cur);
      const parsed = parseJsonSafe(cur);
      if (parsed && typeof parsed === 'object') {
        queue.push(parsed);
      }
      continue;
    }

    if (typeof cur !== 'object') continue;
    seen.add(cur);

    const obj = cur as Record<string, unknown>;
    nodes.push(obj);

    if (typeof obj.message === 'string') {
      nodes.push(obj.message);
      const parsed = parseJsonSafe(obj.message);
      if (parsed && typeof parsed === 'object') {
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

export function isQuotaOrRateError(err: unknown): boolean {
  if (err instanceof QuotaExhaustedError) return true;
  const nodes = collectErrorNodes(err);

  for (const node of nodes) {
    if (typeof node === 'string') {
      const lower = node.toLowerCase();
      if (
        lower.includes('resource_exhausted') ||
        lower.includes('quota') ||
        lower.includes('rate limit') ||
        lower.includes('rate_limit') ||
        lower.includes('too many requests') ||
        /\b429\b/.test(lower)
      ) {
        return true;
      }
      continue;
    }

    const status = node.status;
    const code = node.code ?? node.statusCode;
    const reason = typeof node.reason === 'string' ? node.reason.toUpperCase() : '';
    const errCode = typeof node.error_code === 'string' ? node.error_code.toUpperCase() : '';

    if (status === 429 || code === 429 || code === '429') return true;
    if (typeof status === 'string' && status.toUpperCase() === 'RESOURCE_EXHAUSTED') return true;
    if (errCode === 'RESOURCE_EXHAUSTED') return true;
    if (reason.includes('QUOTA') || reason.includes('RATE_LIMIT')) return true;
  }

  return false;
}

export function extractRetryAfterSeconds(err: unknown): number {
  const nodes = collectErrorNodes(err);

  for (const node of nodes) {
    if (typeof node === 'string') {
      const retryMatch =
        node.match(/retry\s+in\s+(\d+(?:\.\d+)?)\s*s/i) ||
        node.match(/retryDelay["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)s?/i) ||
        node.match(/retryAfterSeconds["']?\s*[:=]\s*(\d+)/i);
      if (retryMatch) {
        const val = Math.ceil(Number(retryMatch[1]));
        if (Number.isFinite(val) && val > 0) return val;
      }
      continue;
    }

    if (typeof node.retryAfterSeconds === 'number' && node.retryAfterSeconds > 0) {
      return Math.ceil(node.retryAfterSeconds);
    }

    if (typeof node.retryDelay === 'string') {
      const match = node.retryDelay.match(/(\d+(?:\.\d+)?)/);
      if (match) {
        const val = Math.ceil(Number(match[1]));
        if (Number.isFinite(val) && val > 0) return val;
      }
    }

    if (node.headers && typeof node.headers === 'object') {
      const headers = node.headers as Record<string, unknown>;
      const ra = headers['retry-after'] ?? headers['Retry-After'];
      if (typeof ra === 'string' || typeof ra === 'number') {
        const val = Math.ceil(Number(ra));
        if (Number.isFinite(val) && val > 0) return val;
      }
    }
  }

  // Check if message mentions per-day quota -> suggest longer reset window
  const fullText = nodes
    .filter((n): n is string => typeof n === 'string')
    .join(' ')
    .toLowerCase();
  if (fullText.includes('perday') || fullText.includes('per_day') || fullText.includes('daily')) {
    return 3600;
  }
  return 60;
}

export function mapApiError(error: unknown): ApiErrorPayload {
  if (error instanceof QuotaExhaustedError) {
    return error.toPayload();
  }
  if (error instanceof InputValidationError) {
    return {
      status: 400,
      error_code: 'INVALID_ARGUMENT',
      retryable: false,
      message: error.message,
    };
  }

  const errObj = error as {
    status?: number;
    code?: number;
    message?: string;
    attemptedModels?: string[];
  };
  const rawMessage = errObj?.message || 'An unexpected speech synthesis error occurred.';

  if (isQuotaOrRateError(error)) {
    const retryAfterSeconds = extractRetryAfterSeconds(error);
    return {
      status: 429,
      error_code: 'RESOURCE_EXHAUSTED',
      retryable: true,
      retryAfterSeconds,
      attemptedModels: Array.isArray(errObj?.attemptedModels) ? errObj.attemptedModels : undefined,
      message:
        'All configured TTS providers are currently unavailable due to API quota or rate limits. Enable billing on your Google AI project or add a fallback provider key in Settings > Secrets.',
    };
  }

  if (rawMessage.includes('GEMINI_API_KEY')) {
    return {
      status: 400,
      error_code: 'INVALID_ARGUMENT',
      retryable: false,
      message: rawMessage,
    };
  }

  const numericStatus =
    typeof errObj?.status === 'number'
      ? errObj.status
      : typeof errObj?.code === 'number'
        ? errObj.code
        : 500;

  if (
    numericStatus === 403 ||
    rawMessage.includes('PERMISSION_DENIED') ||
    rawMessage.includes('API_KEY_INVALID')
  ) {
    return {
      status: 403,
      error_code: 'PERMISSION_DENIED',
      retryable: false,
      message: 'Gemini API authentication failed. Please verify your key in Settings > Secrets.',
    };
  }

  if (numericStatus === 400 || rawMessage.includes('INVALID_ARGUMENT')) {
    return {
      status: 400,
      error_code: 'INVALID_ARGUMENT',
      retryable: false,
      message: rawMessage,
    };
  }

  return {
    status: numericStatus >= 400 && numericStatus < 600 ? numericStatus : 500,
    error_code: 'INTERNAL',
    retryable: numericStatus >= 500,
    message: rawMessage,
  };
}
