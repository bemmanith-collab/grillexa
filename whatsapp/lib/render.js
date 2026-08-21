// Terminal output and file writing.

import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

import { businessDateStr } from './clock.js';
import { describeProvider } from './provider.js';
import { ROTA } from './rota.js';
import { AUDIENCES, LANGUAGES, SLOTS, TONES, TYPES } from './options.js';

const RULE = '─'.repeat(56);

/**
 * Print one post.
 *
 * Only the frame is coloured. The post itself is printed exactly as it will be pasted
 * into WhatsApp — no highlighting, no re-wrapping, no indentation — so what is on the
 * screen and what lands in the chat are the same characters.
 */
export function printPost({ text, options }) {
  const spec = TYPES[options.type];
  const bits = [spec.label];
  if (options.slot) bits.push(SLOTS[options.slot].label);
  bits.push(AUDIENCES[options.audience].label);
  if (options.language === 'english') {
    bits.push(`quote in ${options.quoteLanguage}`);
  } else {
    bits.push(`in ${options.language}`);
  }

  console.log('');
  console.log(chalk.cyan(RULE));
  console.log(chalk.cyan.bold(`  ${bits.join('  ·  ')}`));
  console.log(chalk.cyan(RULE));
  console.log('');
  console.log(text);
  console.log('');
  console.log(chalk.dim(RULE));
}

/** --dry-run: show what would be sent, in the order the API receives it. */
export function printRequest({ systemBlocks, prompt, options }) {
  console.log('');
  console.log(chalk.cyan(RULE));
  console.log(chalk.cyan.bold(`  DRY RUN  ·  ${TYPES[options.type].label}  ·  nothing sent`));
  console.log(chalk.cyan(RULE));
  systemBlocks.forEach((block, index) => {
    console.log(chalk.yellow(`\n[system ${index + 1}/${systemBlocks.length}]`));
    console.log(chalk.dim(block.text));
  });
  console.log(chalk.yellow('\n[user]'));
  console.log(prompt);
  console.log('');
  console.log(chalk.dim(RULE));
}

export function printSaved(file) {
  console.log(chalk.green(`  saved  ${file}`));
}

export function printError(error) {
  console.error('');
  console.error(chalk.red.bold(`  ${error.message}`));
  if (error.hint) console.error(chalk.yellow(`  ${error.hint}`));
  console.error('');
}

export function printList() {
  const section = (title) => {
    console.log('');
    console.log(chalk.cyan.bold(title));
  };
  const row = (key, label) => console.log(`  ${chalk.green(key.padEnd(15))}${label}`);

  section('Content types  (--type)');
  for (const [key, spec] of Object.entries(TYPES)) row(key, spec.label);

  section('Meal slots  (--slot, with --type=meal)');
  for (const [key, slot] of Object.entries(SLOTS)) row(key, slot.label);

  section('Audiences  (--audience)');
  for (const [key, audience] of Object.entries(AUDIENCES)) row(key, audience.label);

  section('Tones  (--tone)');
  for (const key of Object.keys(TONES)) row(key, TONES[key].split('.')[0] + '.');

  section('Languages  (--language)');
  for (const key of Object.keys(LANGUAGES)) {
    const name = key[0].toUpperCase() + key.slice(1);
    row(key, key === 'english' ? 'Plain English.' : `Romanised ${name}, Latin alphabet.`);
  }

  section('The weekly rota  (--today)');
  for (const [day, due] of Object.entries(ROTA)) {
    const label = TYPES[due.type].label + (due.slot ? ` · ${SLOTS[due.slot].label}` : '');
    console.log(`  ${chalk.green(day.padEnd(15))}${label}`);
  }
  console.log(chalk.dim('  Product Highlight and Customer Story are off the rota — post them by hand.'));

  section('Quote language  (--quote-language)');
  row('auto', 'English or Telugu, picked per post. The default.');
  row('english', 'Always English.');
  row('telugu', 'Always romanised Telugu.');

  const provider = describeProvider();
  console.log('');
  console.log(chalk.cyan.bold('Writing with'));
  console.log(`  ${chalk.green(provider.label)}${provider.model ? chalk.dim(`  (${provider.model})`) : ''}`);
  if (!provider.name) {
    console.log(chalk.yellow('  Set GEMINI_API_KEY in .env — free, from https://aistudio.google.com/apikey'));
  }

  console.log('');
}

/** Where a single post's file goes. A path ending in .txt is a file, anything else a folder. */
export function resolveOutFile(outPath, options) {
  if (outPath.toLowerCase().endsWith('.txt')) return outPath;

  // The Indian date, so a post written at 2am IST files under today rather than
  // yesterday, which is what UTC would call it.
  const date = businessDateStr();
  const parts = [options.type];
  if (options.slot) parts.push(options.slot);
  parts.push(options.audience, date);
  return path.join(outPath, `${parts.join('-')}.txt`);
}

export function writePost(file, text) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${text}\n`, 'utf8');
  return file;
}
