// Anthropic's Claude — the best writing of the three and the only one that
// costs money, so it is never selected unless a key is present.
//
// It is also the only provider that caches the prompt prefix. The brand voice
// and the format exemplar are identical on every request and get a cache
// breakpoint, which is what makes a --batch run cheap.

import Anthropic from '@anthropic-ai/sdk';
import { GenerationError } from '../errors.js';

const DEFAULT_MODEL = 'claude-opus-5';

export const name = 'claude';
export const label = 'Anthropic Claude';

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function modelName() {
  return process.env.CLAUDE_MODEL || DEFAULT_MODEL;
}

let client;

export async function generate({ systemBlocks, prompt, maxTokens }) {
  client ??= new Anthropic();

  let response;
  try {
    response = await client.messages.create({
      model: modelName(),
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: systemBlocks,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (error) {
    throw translate(error);
  }

  if (response.stop_reason === 'refusal') {
    throw new GenerationError('Claude declined to write this post.', {
      hint: 'Rephrase the topic and try again. Health claims and medical topics are the usual cause.',
    });
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  if (!text) {
    throw new GenerationError('Claude returned an empty post.', {
      hint: 'This is usually transient — run the same command again.',
    });
  }

  return { text, usage: response.usage };
}

function translate(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return new GenerationError('The Anthropic API key was rejected.', {
      hint: 'Check ANTHROPIC_API_KEY — it may be mistyped, revoked or from another account.',
      code: 'not-configured',
    });
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new GenerationError(`This API key cannot use ${modelName()}.`, {
      hint: "Check the key's permissions, or set CLAUDE_MODEL to a model it can use.",
    });
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new GenerationError(`No such model: ${modelName()}.`, {
      hint: 'Fix CLAUDE_MODEL, or remove it to fall back to the default.',
    });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new GenerationError('Rate limited by the Anthropic API.', {
      hint: 'Wait a minute and try again. A --batch run makes nine calls back to back.',
    });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new GenerationError('Could not reach the Anthropic API.', {
      hint: 'Check the internet connection and try again.',
    });
  }
  if (error instanceof Anthropic.APIError) {
    return new GenerationError(`The Anthropic API returned an error: ${error.message}`);
  }
  return error;
}
