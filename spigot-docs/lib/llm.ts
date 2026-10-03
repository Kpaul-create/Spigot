/**
 * Env-selectable chat model for the agent.
 *
 * The app previously had two disconnected LLM paths: `/api/chat` used the
 * LLM Gateway provider, while `lib/agent.ts` made no LLM calls at all and
 * replied from keyword-matched canned strings. This module gives the agent a
 * real model and lets the provider be chosen by env var, so switching does not
 * need a code change.
 *
 * Every provider here is reached through the same OpenAI-compatible client, so
 * a provider is just a (base URL, default model, key env var) triple. That is
 * what lets `gemini` work even though Google is not OpenAI.
 */
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export type ProviderName = 'gateway' | 'openai' | 'gemini';

type ProviderConfig = {
  /** Env var holding the API key. */
  keyEnv: string;
  /** Env var holding a provider-specific base URL override. */
  baseUrlEnv: string;
  /** Env var holding a provider-specific model override. */
  modelEnv: string;
  /**
   * Base URL baked into the client. Left undefined when the OpenAI SDK's own
   * default (`https://api.openai.com/v1`) is correct.
   */
  defaultBaseUrl?: string;
  defaultModel: string;
};

const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  gateway: {
    keyEnv: 'LLM_GATEWAY_API_KEY',
    baseUrlEnv: 'LLM_GATEWAY_BASE_URL',
    modelEnv: 'LLM_GATEWAY_MODEL',
    defaultBaseUrl: 'https://api.llmgateway.dev/v1',
    defaultModel: 'anthropic/claude-3.5-sonnet',
  },
  openai: {
    keyEnv: 'OPENAI_API_KEY',
    baseUrlEnv: 'OPENAI_BASE_URL',
    modelEnv: 'OPENAI_MODEL',
    defaultModel: 'gpt-4o-mini',
  },
  gemini: {
    keyEnv: 'GEMINI_API_KEY',
    baseUrlEnv: 'GEMINI_BASE_URL',
    modelEnv: 'GEMINI_MODEL',
    // Google's OpenAI-compatibility layer. Confirmed against
    // https://ai.google.dev/gemini-api/docs/openai
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.8-flash',
  },
};

const DEFAULT_PROVIDER: ProviderName = 'gateway';

export function getProviderName(): ProviderName {
  const raw = process.env.LLM_PROVIDER ?? DEFAULT_PROVIDER;
  if (!(raw in PROVIDERS)) {
    throw new Error(
      `LLM_PROVIDER="${raw}" is not a known provider. Use one of: ${Object.keys(PROVIDERS).join(', ')}.`,
    );
  }
  return raw as ProviderName;
}

/**
 * Resolves the OpenAI-compatible base URL for the active provider.
 *
 * `LLM_BASE_URL` overrides every provider, so any other OpenAI-compatible host
 * (OpenRouter, Groq, Together, a self-hosted vLLM) can be used without adding a
 * named entry above. The provider-specific variable is checked next, then the
 * built-in default. Returns undefined for OpenAI so the SDK default applies.
 */
function resolveBaseUrl(provider: ProviderName): string | undefined {
  return (
    process.env.LLM_BASE_URL || process.env[PROVIDERS[provider].baseUrlEnv] || PROVIDERS[provider].defaultBaseUrl
  );
}

function resolveModel(provider: ProviderName): string {
  return process.env.LLM_MODEL || process.env[PROVIDERS[provider].modelEnv] || PROVIDERS[provider].defaultModel;
}

/**
 * Builds a chat model from the environment.
 *
 * @throws with a clear message when the selected provider has no key, so a
 * missing key is reported at startup instead of surfacing as a 500 mid-call.
 */
export function getChatModel(): BaseChatModel {
  const provider = getProviderName();
  const config = PROVIDERS[provider];

  const apiKey = process.env[config.keyEnv];
  if (!apiKey) {
    throw new Error(
      `LLM_PROVIDER=${provider} but ${config.keyEnv} is not set. ` +
        `Add ${config.keyEnv} to .env.local, or set LLM_PROVIDER to a different provider.`,
    );
  }

  const baseURL = resolveBaseUrl(provider);

  return new ChatOpenAI({
    apiKey,
    model: resolveModel(provider),
    temperature: 0,
    // Omitted entirely when undefined, so the OpenAI SDK's default host is
    // used rather than being overridden with an empty string.
    ...(baseURL ? { configuration: { baseURL } } : {}),
  });
}

/**
 * Turns a provider error into something a user can act on.
 *
 * The raw Gemini quota error is ~900 characters of nested JSON with a
 * `QuotaFailure` violation list, and it was being returned to the browser
 * verbatim. It is technically accurate and practically unreadable: the one
 * fact that matters is "this model's daily free-tier allowance is spent, it
 * resets at roughly HH:MM".
 *
 * The quota metric is per model (`...PerProjectPerModel-FreeTier`), so a
 * different `GEMINI_MODEL` has its own untouched allowance. That is worth
 * telling the user, because it is the only immediate workaround — the agent
 * makes two calls per task (choose a tool, then answer), so a 20-request
 * allowance is only ten tasks.
 *
 * Returns `null` when the error is not a recognised provider limit, so callers
 * can fall back to the original message rather than losing detail.
 */
export function describeModelError(error: unknown): { status: number; message: string } | null {
  const raw = error instanceof Error ? error.message : String(error);

  if (!/\b429\b/.test(raw) && !/RESOURCE_EXHAUSTED/i.test(raw)) return null;

  const model = /model:\s*([a-z0-9.\-]+)/i.exec(raw)?.[1];
  const limit = /limit:\s*(\d+)/i.exec(raw)?.[1];
  const retryAfterSeconds = /retryDelay"?\s*:?\s*"?(\d+)s/i.exec(raw)?.[1];

  const resetsIn = retryAfterSeconds
    ? Math.round(Number(retryAfterSeconds) / 60)
    : null;

  return {
    // 429, not 500: nothing is broken and retrying later is the fix, which is
    // exactly what a 500 tells the client not to do.
    status: 429,
    message: [
      'The model provider rejected this call: the daily free-tier allowance is used up.',
      model ? `That allowance is counted per model, and this one is ${model}.` : null,
      limit ? `It allows ${limit} requests, and the agent spends two per task (choosing a tool, then answering) - so that is about ${Math.floor(Number(limit) / 2)} tasks.` : null,
      resetsIn ? `It resets in about ${resetsIn < 60 ? `${resetsIn} minutes` : `${Math.round(resetsIn / 60)} hours`}.` : null,
      'Switching GEMINI_MODEL in .env.local to another model this key can reach uses that model\'s own allowance instead.',
      'No payment was made: the call fails before any tool is chosen.',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

/**
 * Human-readable status for the agent UI, never including key material.
 * `baseUrl` is included because "which host is it actually talking to" is the
 * first question when a model call misbehaves.
 */
export function getModelStatus(): {
  provider: ProviderName;
  model: string;
  baseUrl?: string;
  configured: boolean;
} {
  const provider = getProviderName();
  return {
    provider,
    model: resolveModel(provider),
    baseUrl: resolveBaseUrl(provider),
    configured: Boolean(process.env[PROVIDERS[provider].keyEnv]),
  };
}