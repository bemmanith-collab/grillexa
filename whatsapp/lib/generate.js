// Assembles the prompt for one post and hands it to whichever provider is configured
// (see provider.js). Nothing in this file knows which one that is.
//
// The split matters: brand.md and example-post.md are byte-identical on every call and
// go in the system prompt; everything that varies — type, audience, tone, language,
// topic, today's date — goes in the user message after it. On Claude the split also
// carries a cache breakpoint; the other providers just get the two joined together.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generatePost } from './provider.js';
import { businessHour, businessMonth, businessWeekday } from './clock.js';
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
const pantry = JSON.parse(fs.readFileSync(path.join(here, 'pantry.json'), 'utf8'));

const readPrompt = (file) => fs.readFileSync(path.join(promptsDir, file), 'utf8').trim();

// Andhra Pradesh / Telangana seasons, roughly.
export function seasonFor(now) {
  const month = businessMonth(now);
  if (month >= 3 && month <= 5) return 'summer — hot and dry';
  if (month >= 6 && month <= 9) return 'the monsoon — wet and humid';
  if (month >= 10 && month <= 11) return 'the festival season — mild, and a lot of cooking';
  return 'winter — cool mornings and evenings';
}

// Which meal a post is about when nobody said. Indian hours: someone running this at
// 8am in Vijayawada wants breakfast, whatever the laptop's timezone says.
export function slotForNow(now) {
  const hour = businessHour(now);
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

export function pantryList() {
  return pantry;
}

export function findPantryItem(name) {
  const wanted = name.trim().toLowerCase();
  return pantry.find((item) => item.name.toLowerCase() === wanted)
    ?? pantry.find((item) => item.name.toLowerCase().startsWith(wanted));
}

// Variety cannot come from the prompt. Each call is independent and knows nothing about
// yesterday's post, so "vary the food" reliably produces the same handful of obvious
// ingredients every time. Handing each post a different everyday thing to build around
// is what actually rotates the channel.
function pickPantryItem(name) {
  if (!name) return pantry[Math.floor(Math.random() * pantry.length)];
  const found = findPantryItem(name);
  if (!found) throw new Error(`Unknown ingredient "${name}".`);
  return found;
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
    ingredient,
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
    // Don't claim it is Sunday on a Thursday. A pinned type is written ahead of the day
    // it runs on, and telling the model otherwise invites it to write "today" into a
    // post that will be read four days later.
    lines.push(
      spec.pinnedDay || options.day !== businessWeekday()
        ? `- This post is for ${day}. Use that weekday in the headline. It is being written in advance, so do not refer to it as today.`
        : `- Today is ${day}. Use that weekday in the headline.`,
    );
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
  if (ingredient) {
    lines.push(
      `- Everyday ingredient for this post: ${ingredient.name}. ${ingredient.note}`,
      '  Build at least one section of the food suggestions around it, and mention it by',
      '  name. It is a starting point, not the whole post — if it genuinely does not fit',
      '  this topic, use it in a single line and move on rather than bending the post to it.',
    );
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
    day: options.day ?? spec.pinnedDay ?? businessWeekday(),
    season: options.season ?? seasonFor(),
    slot: spec.slotted ? (options.slot ?? slotForNow()) : undefined,
    product: spec.needsProduct ? pickProduct(options.product) : undefined,
    ingredient: spec.everyday ? pickPantryItem(options.ingredient) : undefined,
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
