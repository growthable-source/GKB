/**
 * Shared helpers for the content-ops scripts: env loading, an OpenRouter chat
 * wrapper (DeepSeek), a hand-rolled concurrency pool, and JSON-file
 * checkpoints so a long classification/rewrite run can resume after being
 * interrupted instead of re-paying for work already done.
 *
 * OpenRouter is OpenAI-compatible (POST /chat/completions); there is no
 * Batches API, so bulk stages here use a concurrency-limited loop plus
 * incremental checkpointing instead of the submit-then-poll batch pattern.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export const ROOT = path.resolve(import.meta.dirname, '..', '..')

export function loadEnv(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
loadEnv(path.join(ROOT, '.env.cloud'))
loadEnv(path.join(ROOT, '.env.local'))

/**
 * Ryan verified this responds correctly live via the OpenRouter chat
 * completions endpoint on 2026-08-01 — use it as the default until there's
 * reason to move. Override with OPS_MODEL for a different tier.
 */
const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3.1'
export const MODEL = process.env.OPS_MODEL || DEFAULT_MODEL

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

function requireApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    throw new Error(
      'Set OPENROUTER_API_KEY (create one at https://openrouter.ai/keys) or add it to .env.cloud',
    )
  }
  return key
}

class RetryableError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 6): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (!(error instanceof RetryableError) || attempt >= maxAttempts) throw error
      const delay = Math.min(30_000, 1000 * 2 ** (attempt - 1)) + Math.random() * 500
      const message = error instanceof Error ? error.message : String(error)
      console.log(`  retry ${label} (attempt ${attempt}/${maxAttempts}) after ${Math.round(delay)}ms: ${message}`)
      await sleep(delay)
    }
  }
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type ChatOptions = {
  maxTokens: number
  /** Requests OpenRouter's `response_format: {type: "json_object"}`. Still parse defensively — see parseJsonLoose. */
  json?: boolean
  temperature?: number
  model?: string
}

/** Calls OpenRouter's chat completions endpoint and returns the raw text content. */
export async function chat(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  const apiKey = requireApiKey()
  const model = opts.model ?? MODEL
  return withRetry(async () => {
    let res: Response
    try {
      res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: opts.maxTokens,
          temperature: opts.temperature ?? 0.2,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      })
    } catch (error) {
      throw new RetryableError(`network error: ${error instanceof Error ? error.message : String(error)}`)
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      if (res.status === 429 || res.status >= 500) {
        throw new RetryableError(`HTTP ${res.status}: ${bodyText.slice(0, 300)}`)
      }
      throw new Error(`OpenRouter request failed (HTTP ${res.status}): ${bodyText.slice(0, 500)}`)
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new Error(`unexpected OpenRouter response shape: ${JSON.stringify(data).slice(0, 300)}`)
    }
    return content
  }, `chat(${model})`)
}

/** Strips code fences and parses JSON, returning null instead of throwing on malformed model output. */
export function parseJsonLoose<T = unknown>(text: string): T | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
  try {
    return JSON.parse(stripped) as T
  } catch {
    return null
  }
}

/** Runs `worker` over `items` with at most `concurrency` in flight, preserving input order in the result. */
export async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function runNext(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, runNext)
  await Promise.all(workers)
  return results
}

function checkpointPath(stage: string): string {
  return path.join(ROOT, 'import/ops/state', `${stage}.json`)
}

/** Loads a stage's checkpoint (keyed by whatever id the caller used), or {} if none exists yet. */
export function loadCheckpoint<T>(stage: string): Record<string, T> {
  const p = checkpointPath(stage)
  if (!existsSync(p)) return {}
  return JSON.parse(readFileSync(p, 'utf8')) as Record<string, T>
}

/** Persists a stage's checkpoint. Called after every completed item so an interrupted run can resume. */
export function saveCheckpoint<T>(stage: string, data: Record<string, T>): void {
  const p = checkpointPath(stage)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(data, null, 1))
}
