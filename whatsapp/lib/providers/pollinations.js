// Pollinations, the last resort — free, anonymous, no key.
//
// Worth being clear about what this is: an open relay in front of somebody
// else's models, with no account, no quota you control, no uptime promise and no
// say in which model answers. Against a long brand prompt it will sometimes drop
// the section format or the closing lines.
//
// It is here so the tool still does something on a machine with no keys at all.
// Read anything it produces before posting it, and treat a good result as luck
// rather than as the arrangement working.

import { GenerationError } from '../errors.js';

const ENDPOINT = 'https://text.pollinations.ai/openai';
const TIMEOUT_MS = 60000;

export const name = 'pollinations';
export const label = 'Pollinations (free, no key)';

// The only provider that is available by default — which is the point of it.
// POLLINATIONS_ENABLED=false turns it off, so a missing key fails loudly instead
// of quietly producing a worse post.
export function isConfigured() {
  return String(process.env.POLLINATIONS_ENABLED ?? 'true').toLowerCase() !== 'false';
}

export function modelName() {
  return process.env.POLLINATIONS_MODEL || 'openai';
}

export async function generate({ system, prompt, maxTokens }) {
  // No SDK and no keep-alive on a free relay: without a deadline a stalled
  // connection would hang the CLI, or hold a dashboard request open until the
  // browser gave up.
  const abort = AbortSignal.timeout(TIMEOUT_MS);

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: abort,
      body: JSON.stringify({
        model: modelName(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.9,
        stream: false,
      }),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError') {
      throw new GenerationError('Pollinations did not answer in time.', {
        hint: 'It is a free service with no uptime guarantee. Try again, or set GEMINI_API_KEY.',
      });
    }
    throw new GenerationError('Could not reach Pollinations.', {
      hint: 'Check the internet connection, or set GEMINI_API_KEY to use Gemini instead.',
    });
  }

  if (!response.ok) {
    throw new GenerationError(
      response.status === 429
        ? 'Pollinations is rate limiting this address.'
        : `Pollinations returned an error (${response.status}).`,
      { hint: 'Free and shared with everyone. Wait a moment, or set GEMINI_API_KEY.' }
    );
  }

  // Sometimes an OpenAI-shaped JSON body, sometimes bare text — it depends on
  // which backend answered. Handle both rather than assuming today's.
  const raw = await response.text();
  const text = extractText(raw);

  if (!text) {
    throw new GenerationError('Pollinations returned an empty post.', {
      hint: 'Try again. If it keeps happening, set GEMINI_API_KEY to use Gemini instead.',
    });
  }

  return { text, usage: undefined };
}

function extractText(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed;
  try {
    const body = JSON.parse(trimmed);
    const fromChoices = body?.choices?.[0]?.message?.content;
    return String(fromChoices ?? body?.content ?? body?.text ?? trimmed).trim();
  } catch {
    // Not JSON after all — it just happened to start with a brace.
    return trimmed;
  }
}
