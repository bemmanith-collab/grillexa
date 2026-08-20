// Assembles the prompt for one post and hands it to Claude.
//
// The split matters: brand.md and example-post.md are byte-identical on every call and
// go in the system prompt behind a cache breakpoint; everything that varies — type,
// audience, tone, language, topic, today's date — goes in the user message after it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generatePost } from './claude.js';
import {
  AUDIENCES,
  CONTRAST_RULES,
  LANGUAGES,
  QUOTE_LANGUAGES,
  SLOTS,
  TONES,
  TYPES,
} from './options.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const promptsDir = path.join(here, '..', 'prompts');

const products = JSON.parse(fs.readFileSync(path.join(here, 'products.json'), 'utf8'));

const readPrompt = (file) => fs.readFileSync(path.join(promptsDir, file), 'utf8').trim();

export const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export function weekdayFor(date = new Date()) {
  return WEEKDAYS[date.getDay()];
}

// Andhra Pradesh / Telangana seasons, roughly.
export function seasonFor(date = new Date()) {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return 'summer — hot and dry';
  if (month >= 6 && month <= 9) return 'the monsoon — wet and humid';
  if (month >= 10 && month <= 11) return 'the festival season — mild, and a lot of cooking';
  return 'winter — cool mornings and evenings';
}

// Which meal a --batch run writes about when nobody said.
export function slotForNow(date = new Date()) {
  const hour = date.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 19) return 'snack';
  return 'dinner';
}

export function productList() {
  return products;
}

export function findProduct(slug) {
  return products.find((p) => p.slug === slug);
}

function pickProduct(slug) {
  if (!slug) return products[Math.floor(Math.random() * products.length)];
  const found = findProduct(slug);
  if (!found) {
    const known = products.map((p) => p.slug).join(', ');
    throw new Error(`Unknown product "${slug}". Known products: ${known}`);
  }
  return found;
}

// `auto` is resolved per post rather than per run, so a batch comes out mixed —
// some posts signing off in English, some in Telugu, which is the point of it.
export function resolveQuoteLanguage(choice) {
  if (choice && choice !== 'auto') return choice;
  return Math.random() < 0.5 ? 'english' : 'telugu';
}

function describeContext(options) {
  const {
    type, audience, tone, language, quoteLanguage, topic, slot, product, day, season,
  } = options;

  const spec = TYPES[type];
  const lines = [
    `- Content type: ${spec.label}`,
    `- Audience: ${AUDIENCES[audience].label} — ${AUDIENCES[audience].description}`,
    `- Tone: ${TONES[tone]}`,
    `- Language: ${LANGUAGES[language]}`,
  ];

  // Only worth saying when the body is English. On a Telugu or Hindi post the body
  // instruction already governs the quote, and a second language line just contradicts it.
  if (language === 'english') {
    lines.push(`- GRILLO SAYS quote: ${QUOTE_LANGUAGES[quoteLanguage]}`);
  }

  lines.push(`- Contrast block: ${CONTRAST_RULES[spec.contrast]}`);

  if (spec.dated) {
    lines.push(`- Today is ${day}. Use that weekday in the headline.`);
  }
  if (spec.slotted) {
    const meal = SLOTS[slot];
    lines.push(
      `- Meal: ${meal.label}. Headline reads ${meal.emoji} ${day.toUpperCase()} ${meal.timeOfDay} ${meal.label.toUpperCase()}.`,
    );
  }
  if (spec.seasonal) {
    lines.push(`- Season: it is currently ${season}.`);
  }
  if (spec.needsProduct) {
    lines.push(
      `- Product: ${product.name}. ${product.description}`,
      `  Everything true about it, and the only things you may state as fact:`,
      ...product.facts.map((fact) => `    · ${fact}`),
    );
  }
  if (topic) {
    lines.push(`- Topic: ${topic}`);
  } else if (type === 'customer') {
    lines.push(
      '- Topic: none supplied. Write the unattributed version — no named person, no',
      '  quoted speech, no outcome.',
    );
  } else {
    lines.push('- Topic: none supplied. Pick one that suits the type and audience.');
  }

  return lines.join('\n');
}

/**
 * Everything that would be sent for one post, without sending it.
 *
 * Separate from generate() so --dry-run can show the exact prompt: prompt files are
 * meant to be edited by hand, and being able to read the assembled result costs nothing.
 */
export function buildRequest(options) {
  const spec = TYPES[options.type];

  const resolved = {
    ...options,
    day: options.day ?? weekdayFor(),
    season: options.season ?? seasonFor(),
    slot: spec.slotted ? (options.slot ?? slotForNow()) : undefined,
    product: spec.needsProduct ? pickProduct(options.product) : undefined,
    quoteLanguage: resolveQuoteLanguage(options.quoteLanguage),
  };

  const systemBlocks = [
    { type: 'text', text: readPrompt('brand.md') },
    {
      type: 'text',
      text: readPrompt('example-post.md'),
      cache_control: { type: 'ephemeral' },
    },
  ];

  const prompt = [
    readPrompt(spec.file),
    '',
    '---',
    '',
    '## This post',
    '',
    describeContext(resolved),
    '',
    'Write the post now. Output the post only.',
  ].join('\n');

  return { systemBlocks, prompt, options: resolved };
}

/** Generate one post. Returns the text plus the resolved options that produced it. */
export async function generate(options) {
  const { systemBlocks, prompt, options: resolved } = buildRequest(options);
  const { text, usage } = await generatePost({ systemBlocks, prompt });
  return { text, usage, options: resolved };
}
