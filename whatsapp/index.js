#!/usr/bin/env node

// CLI entry point. Parses and validates arguments, then hands off to lib/. Nothing in
// here talks to the API or builds a prompt.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { Command } from 'commander';

import { GenerationError, describeProvider } from './lib/provider.js';
import {
  AUDIENCES, DEFAULTS, LANGUAGES, QUOTE_LANGUAGES, SLOTS, TONES, TYPES,
} from './lib/options.js';
import { WEEKDAYS } from './lib/clock.js';
import { ROTA, postForToday } from './lib/rota.js';
import { allOccasions, findOccasion, occasionsOn, unscheduled } from './lib/calendar.js';
import {
  buildRequest, findPantryItem, findProduct, generate, pantryList, productList,
} from './lib/generate.js';
import {
  printError, printList, printPost, printRequest, printSaved, resolveOutFile, writePost,
} from './lib/render.js';

// Read .env from beside this file rather than from the working directory, so the tool
// works the same whether it is run from here or from the repo root.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(here, '.env'), quiet: true });

function must(value, registry, flag) {
  if (Object.hasOwn(registry, value)) return value;
  throw new GenerationError(`Unknown ${flag} "${value}".`, {
    hint: `Valid values: ${Object.keys(registry).join(', ')}`,
  });
}

function validate(opts) {
  const type = opts.type ? must(opts.type, TYPES, '--type') : undefined;

  const resolved = {
    type,
    audience: must(opts.audience ?? DEFAULTS.audience, AUDIENCES, '--audience'),
    tone: must(opts.tone ?? DEFAULTS.tone, TONES, '--tone'),
    language: must(opts.language ?? DEFAULTS.language, LANGUAGES, '--language'),
    quoteLanguage: opts.quoteLanguage === 'auto' || opts.quoteLanguage === undefined
      ? 'auto'
      : must(opts.quoteLanguage, QUOTE_LANGUAGES, '--quote-language'),
    topic: opts.topic,
  };

  if (opts.slot) {
    resolved.slot = must(opts.slot, SLOTS, '--slot');
    if (type && !TYPES[type].slotted) {
      throw new GenerationError(`--slot does not apply to --type=${type}.`, {
        hint: 'Only --type=meal takes a slot.',
      });
    }
  }

  if (opts.product) {
    if (!findProduct(opts.product)) {
      throw new GenerationError(`Unknown product "${opts.product}".`, {
        hint: `Known products: ${productList().map((p) => p.slug).join(', ')}`,
      });
    }
    resolved.product = opts.product;
  }

  if (opts.ingredient) {
    if (!findPantryItem(opts.ingredient)) {
      throw new GenerationError(`Unknown ingredient "${opts.ingredient}".`, {
        hint: `Known: ${pantryList().map((i) => i.name).join(', ')}`,
      });
    }
    resolved.ingredient = opts.ingredient;
  }

  if (opts.day) {
    const day = WEEKDAYS.find((d) => d.toLowerCase() === opts.day.toLowerCase());
    if (!day) {
      throw new GenerationError(`Unknown day "${opts.day}".`, {
        hint: `Valid values: ${WEEKDAYS.join(', ')}`,
      });
    }
    resolved.day = day;
  }

  if (opts.season) resolved.season = opts.season;

  // A festival post is written a day or two ahead, so the date has to be
  // settable — the weekday alone cannot say which Deepavali.
  if (opts.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) {
      throw new GenerationError(`Unknown date "${opts.date}".`, { hint: 'Use YYYY-MM-DD.' });
    }
    resolved.date = opts.date;
    resolved.occasions = occasionsOn(opts.date);
    resolved.day = resolved.day
      ?? new Date(`${opts.date}T00:00:00.000Z`)
        .toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  }

  if (opts.occasion) {
    const found = findOccasion(opts.occasion);
    if (!found) {
      throw new GenerationError(`Unknown occasion "${opts.occasion}".`, {
        hint: `Known: ${allOccasions().map((o) => o.name).join(', ')}`,
      });
    }
    resolved.occasions = [found];
  }

  return resolved;
}

async function runOne(options, { out: outPath, dryRun }) {
  if (dryRun) {
    printRequest(buildRequest(options));
    return;
  }

  const result = await generate(options);
  printPost(result);
  if (outPath) {
    printSaved(writePost(resolveOutFile(outPath, result.options), result.text));
  }
}

async function run(opts) {
  if (opts.list) {
    printList();
    return;
  }

  // --today is the everyday path: no decision to make at 6am, just the post this
  // day of the week gets. Anything passed alongside it still wins, so
  // `--today --audience=elders` is today's type written for a different reader.
  if (opts.today) {
    if (opts.batch) {
      throw new GenerationError('Use either --today or --batch, not both.', {
        hint: '--today generates the one post due today; --batch generates every type.',
      });
    }
    const due = postForToday();
    opts.type ??= due.type;
    opts.slot ??= due.slot;
  }

  if (opts.batch && opts.type) {
    throw new GenerationError('Use either --type or --batch, not both.', {
      hint: '--batch generates every type; --type generates one.',
    });
  }
  if (!opts.batch && !opts.type) {
    throw new GenerationError('Nothing to generate.', {
      hint: 'Pass --type=<type>, or --batch for all of them. --list shows what is available.',
    });
  }
  if (opts.batch && opts.out?.toLowerCase().endsWith('.txt')) {
    throw new GenerationError('--batch writes one file per type, so --out must be a folder.', {
      hint: 'Try --out=posts/ instead of a .txt path.',
    });
  }

  const options = validate(opts);

  if (!opts.batch) {
    await runOne(options, opts);
    return;
  }

  // Sequential on purpose: nine parallel calls is the fastest way to get rate limited,
  // and the posts arrive in a readable order this way.
  const types = Object.keys(TYPES);

  // Draw the everyday ingredients without replacement, so a batch never runs the same
  // vegetable through three posts. Per-post random is fine on its own but repeats
  // roughly a third of the time over nine draws, which is exactly what a batch shows.
  const shuffled = pantryList()
    .map((item) => item.name)
    .sort(() => Math.random() - 0.5);

  for (const [index, type] of types.entries()) {
    console.log(`\n  [${index + 1}/${types.length}]  ${TYPES[type].label}…`);
    await runOne(
      { ...options, type, ingredient: options.ingredient ?? shuffled[index % shuffled.length] },
      opts,
    );
  }
}

const program = new Command();

program
  .name('grillo-whatsapp')
  .description('Generates ready-to-post content for the Grillo WhatsApp channel.')
  .version('1.0.0');

program
  .command('generate', { isDefault: true })
  .description('Generate one post, or one of every type with --batch')
  .option('-t, --type <type>', 'content type to generate')
  .option('-a, --audience <audience>', 'who it is written for', DEFAULTS.audience)
  .option('--topic <topic>', 'what the post is about; omitted means one gets chosen for you')
  .option('--tone <tone>', 'voice to write it in', DEFAULTS.tone)
  .option('--language <language>', 'language of the post body', DEFAULTS.language)
  .option('--quote-language <language>', 'language of the GRILLO SAYS quote', DEFAULTS.quoteLanguage)
  .option('--slot <slot>', 'which meal, with --type=meal')
  .option('--product <slug>', 'which product, with --type=product')
  .option('--ingredient <name>', 'everyday ingredient to build the food around; random if omitted')
  .option('--day <weekday>', 'weekday in the headline; defaults to today')
  .option('--season <season>', 'season, with --type=seasonal; defaults to the current one')
  .option('--date <YYYY-MM-DD>', 'write for a specific date, so festivals are picked up')
  .option('--occasion <name>', 'force a festival or observance regardless of the date')
  .option('--today', "generate the post today's weekday is due (see the rota)")
  .option('--batch', 'generate one post of every type')
  .option('--out <path>', 'also write to a .txt file, or to a folder')
  .option('--dry-run', 'print the prompt that would be sent, without calling any provider')
  .option('--list', 'list every type, audience, tone and language, then exit')
  .action(async (opts) => {
    try {
      await run(opts);
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });

program.addHelpText('after', `
Examples:
  $ node index.js generate --list
  $ node index.js generate --type=myth --audience=general --topic="eating after 8 PM"
  $ node index.js generate --type=meal --slot=dinner --audience=elders
  $ node index.js generate --batch --audience=general --out=posts/

Writing with: ${describeProvider().label}${describeProvider().model ? ` (${describeProvider().model})` : ''}
`);

await program.parseAsync();
