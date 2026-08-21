// Google Gemini, via the Generative Language REST API.
//
// The free tier is generous enough to post daily and needs no card, which is
// why this is the default provider. A key comes from https://aistudio.google.com
// — a Google account is all it takes.
//
// No SDK: this is one POST, and Node has had fetch built in since 18.

import { GenerationError } from '../errors.js';

const DEFAULT_MODEL = 'gemini-2.0-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export const name = 'gemini';
export const label = 'Google Gemini';

export function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function modelName() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export async function generate({ system, prompt, maxTokens }) {
  const model = modelName();
  const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // In the header rather than the query string: a key in a URL ends up in
        // proxy logs and error messages.
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        // The brand voice and the format exemplar go here rather than in the
        // conversation, which is what keeps them weighted as instructions.
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          // A little warmth. At 0 the posts come out identical week to week,
          // which defeats the ingredient rotation.
          temperature: 0.9,
        },
      }),
    });
  } catch (err) {
    throw new GenerationError('Could not reach the Gemini API.', {
      hint: 'Check the internet connection and try again.',
    });
  }

  if (!response.ok) {
    throw translate(response.status, await safeBody(response), model);
  }

  const body = await response.json();

  // A prompt refused outright comes back with no candidates at all.
  if (body.promptFeedback?.blockReason) {
    throw new GenerationError(
      `Gemini declined the request (${body.promptFeedback.blockReason}).`,
      { hint: 'Rephrase the topic. Health and medical wording is the usual cause.' }
    );
  }

  const candidate = body.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) {
    // MAX_TOKENS here means the post was cut off before any text survived,
    // which is a different problem from an empty response.
    const reason = candidate?.finishReason;
    throw new GenerationError(
      reason === 'MAX_TOKENS'
        ? 'Gemini ran out of room before finishing the post.'
        : 'Gemini returned an empty post.',
      { hint: reason === 'MAX_TOKENS' ? 'Try a narrower topic.' : 'Usually transient — try again.' }
    );
  }

  return {
    text,
    usage: {
      input_tokens: body.usageMetadata?.promptTokenCount,
      output_tokens: body.usageMetadata?.candidatesTokenCount,
    },
  };
}

async function safeBody(response) {
  try {
    const body = await response.json();
    return body?.error?.message || '';
  } catch {
    return '';
  }
}

function translate(status, detail, model) {
  if (status === 400 && /API key/i.test(detail)) {
    return new GenerationError('The Gemini API key was rejected.', {
      hint: 'Check GEMINI_API_KEY. Keys come from https://aistudio.google.com/apikey',
      code: 'not-configured',
    });
  }
  if (status === 401 || status === 403) {
    return new GenerationError('The Gemini API key was refused.', {
      hint: 'The key may be revoked, or the Generative Language API may not be enabled for it.',
      code: 'not-configured',
    });
  }
  if (status === 404) {
    return new GenerationError(`Gemini has no model called "${model}".`, {
      hint: 'Set GEMINI_MODEL to a model your key can use, or remove it for the default.',
    });
  }
  if (status === 429) {
    return new GenerationError('Gemini free-tier rate limit reached.', {
      hint: 'Wait a minute and try again. The free tier allows a limited number of requests per minute.',
    });
  }
  if (status >= 500) {
    return new GenerationError('Gemini is having trouble right now.', {
      hint: 'Try again in a moment.',
    });
  }
  return new GenerationError(`Gemini returned an error${detail ? `: ${detail}` : ` (${status})`}.`);
}
