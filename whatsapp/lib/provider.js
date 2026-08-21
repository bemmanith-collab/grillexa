// Chooses who writes the post.
//
// Everything above this file — the prompts, the rota, the ingredient rotation,
// the CLI, the dashboard route — is provider-agnostic and stays that way. Only
// the two functions here know that more than one exists.

import * as claude from './providers/claude.js';
import * as gemini from './providers/gemini.js';
import * as pollinations from './providers/pollinations.js';
import { GenerationError } from './errors.js';

export { GenerationError };

// Order is deliberate and is quality-first among what is actually paid for:
// Gemini's free tier holds the format well and costs nothing, Claude writes
// best but bills per post, and Pollinations is the floor — free, keyless, and
// the only one that is always available, which is why it must be last.
const PROVIDERS = [gemini, claude, pollinations];

/** The provider that will be used, honouring AI_PROVIDER if it is set. */
export function activeProvider() {
  const forced = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (forced) {
    const match = PROVIDERS.find((p) => p.name === forced);
    if (!match) {
      throw new GenerationError(`Unknown AI_PROVIDER "${forced}".`, {
        hint: `Valid values: ${PROVIDERS.map((p) => p.name).join(', ')}`,
      });
    }
    // Named explicitly, so say plainly what is missing rather than silently
    // using something else — a post written by an unexpected provider is worse
    // than no post, because nobody looks twice at it.
    if (!match.isConfigured()) {
      throw new GenerationError(`AI_PROVIDER is set to "${forced}", which is not configured.`, {
        hint: hintFor(match),
        code: 'not-configured',
      });
    }
    return match;
  }

  const available = PROVIDERS.find((p) => p.isConfigured());
  if (!available) {
    throw new GenerationError('No content provider is set up.', {
      hint: 'Set GEMINI_API_KEY (free, from https://aistudio.google.com/apikey), or allow the free fallback by removing POLLINATIONS_ENABLED=false.',
      code: 'not-configured',
    });
  }
  return available;
}

/** For --list, help text and the dashboard: which provider and which model. */
export function describeProvider() {
  try {
    const provider = activeProvider();
    return { name: provider.name, label: provider.label, model: provider.modelName() };
  } catch {
    return { name: null, label: 'none configured', model: null };
  }
}

/**
 * One post, one call.
 *
 * `systemBlocks` is Claude's cache-annotated shape; every other provider wants
 * one string, so it is flattened here rather than in each provider. Claude is
 * the only one that gains anything from the split, and the only one that sees it.
 */
export async function generatePost({ systemBlocks, prompt, maxTokens = 4000 }) {
  const provider = activeProvider();
  const system = systemBlocks.map((block) => block.text).join('\n\n');
  return provider.generate({ system, systemBlocks, prompt, maxTokens });
}

function hintFor(provider) {
  if (provider.name === 'gemini') return 'Set GEMINI_API_KEY. Free, from https://aistudio.google.com/apikey';
  if (provider.name === 'claude') return 'Set ANTHROPIC_API_KEY. Billed per post.';
  return 'Remove POLLINATIONS_ENABLED=false to allow it.';
}
