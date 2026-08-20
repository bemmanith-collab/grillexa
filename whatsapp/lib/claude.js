// Thin wrapper over the Anthropic SDK. The only thing in here that knows about HTTP.

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-opus-5';

// Carries a message written for a person at a terminal rather than a stack trace.
export class GenerationError extends Error {
  constructor(message, { hint } = {}) {
    super(message);
    this.name = 'GenerationError';
    this.hint = hint;
  }
}

let client;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new GenerationError('No Anthropic API key found.', {
      hint: 'Copy .env.example to .env and put your key in it (ANTHROPIC_API_KEY=sk-ant-...).',
    });
  }
  client ??= new Anthropic();
  return client;
}

export function modelName() {
  return process.env.CLAUDE_MODEL || DEFAULT_MODEL;
}

/**
 * One post, one API call.
 *
 * `system` is the brand voice and the format exemplar — identical on every call, so it
 * carries a cache breakpoint and a batch of eight pays for it once. Everything that
 * varies per post goes in the user message, after the breakpoint.
 */
export async function generatePost({ systemBlocks, prompt }) {
  const anthropic = getClient();

  let response;
  try {
    response = await anthropic.messages.create({
      model: modelName(),
      max_tokens: 4000,
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

// Turn an SDK exception into something worth reading at 6am before the day's posts go out.
function translate(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return new GenerationError('The Anthropic API key was rejected.', {
      hint: 'Check ANTHROPIC_API_KEY in .env — it may be mistyped, revoked or from another account.',
    });
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new GenerationError(`This API key cannot use ${modelName()}.`, {
      hint: 'Check the key\'s permissions in the Anthropic console, or set CLAUDE_MODEL in .env to a model it can use.',
    });
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new GenerationError(`No such model: ${modelName()}.`, {
      hint: 'Fix CLAUDE_MODEL in .env, or remove it to fall back to the default.',
    });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new GenerationError('Rate limited by the Anthropic API.', {
      hint: 'Wait a minute and run it again. A --batch run makes eight calls back to back.',
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
