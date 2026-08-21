// The dashboard's WhatsApp panel calls a route that imports the whatsapp/
// subproject across a package boundary — CommonJS reaching into ESM, and a
// relative path that has to resolve both in this repo and at /app in the image.
// Those two joins are the whole risk in the feature: everything else is a form.
//
// What is checked here is the wiring, not the writing. No API key is needed and
// no post is generated — the one call that would cost money is the one this
// deliberately does not make.
//
// Run: npm test (from backend/). No database, no network.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const GENERATOR_DIR = path.join(__dirname, '..', '..', 'whatsapp', 'lib');

const tests = {
  'the subproject is where the route expects it, from the backend': () => {
    // src/routes/whatsapp.js walks ../../../whatsapp; this test sits one level
    // shallower. If someone moves either directory, this fails before a deploy
    // does — the route would otherwise throw only on first use, in production.
    assert.ok(
      fs.existsSync(path.join(GENERATOR_DIR, 'generate.js')),
      `expected the generator at ${GENERATOR_DIR}`
    );
    assert.ok(fs.existsSync(path.join(GENERATOR_DIR, 'options.js')));
  },

  'every prompt file the type registry names actually exists': async () => {
    const options = await import(pathToFileURL(path.join(GENERATOR_DIR, 'options.js')).href);
    const promptsDir = path.join(GENERATOR_DIR, '..', 'prompts');
    for (const [type, spec] of Object.entries(options.TYPES)) {
      assert.ok(
        fs.existsSync(path.join(promptsDir, spec.file)),
        `type "${type}" names ${spec.file}, which is missing`
      );
    }
    // Sent on every request, so a rename here breaks every post at once.
    for (const shared of ['brand.md', 'example-post.md']) {
      assert.ok(fs.existsSync(path.join(promptsDir, shared)), `${shared} is missing`);
    }
  },

  'the dropdowns can be built from the registry': async () => {
    const options = await import(pathToFileURL(path.join(GENERATOR_DIR, 'options.js')).href);
    assert.ok(Object.keys(options.TYPES).length >= 8, 'expected the full set of content types');
    for (const [value, entry] of Object.entries(options.TYPES)) {
      assert.ok(entry.label, `type "${value}" has no label to show in the dropdown`);
    }
    for (const [value, entry] of Object.entries(options.AUDIENCES)) {
      assert.ok(entry.label, `audience "${value}" has no label to show in the dropdown`);
    }
    // The panel decides whether to show the meal field from this.
    assert.ok(
      Object.values(options.TYPES).some((spec) => spec.slotted),
      'no type takes a meal slot, so the panel would never show that field'
    );
  },

  'a request can be assembled without calling the API': async () => {
    const generate = await import(pathToFileURL(path.join(GENERATOR_DIR, 'generate.js')).href);
    const built = generate.buildRequest({
      type: 'myth',
      audience: 'general',
      tone: 'friendly',
      language: 'english',
      quoteLanguage: 'auto',
      topic: 'eating after 8 PM',
    });
    assert.ok(built.prompt.includes('eating after 8 PM'), 'the topic never reached the prompt');
    assert.ok(built.systemBlocks.length >= 2, 'the brand voice and exemplar should both be sent');
    assert.strictEqual(
      built.systemBlocks.at(-1).cache_control?.type,
      'ephemeral',
      'the shared prefix lost its cache breakpoint, so every post pays for it again'
    );
  },

  'the rota names a post for every day of the week': async () => {
    const rota = await import(pathToFileURL(path.join(GENERATOR_DIR, 'rota.js')).href);
    const options = await import(pathToFileURL(path.join(GENERATOR_DIR, 'options.js')).href);
    const week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (const day of week) {
      const due = rota.ROTA[day];
      assert.ok(due, `${day} has nothing to post`);
      assert.ok(options.TYPES[due.type], `${day} is due a "${due.type}", which is not a content type`);
      if (due.slot) {
        assert.ok(options.SLOTS[due.slot], `${day} names meal "${due.slot}", which does not exist`);
        assert.ok(
          options.TYPES[due.type].slotted,
          `${day} names a meal but "${due.type}" does not take one`
        );
      }
    }
  },

  'the rota keeps selling off the weekly rhythm': async () => {
    const rota = await import(pathToFileURL(path.join(GENERATOR_DIR, 'rota.js')).href);
    const scheduled = Object.values(rota.ROTA).map((due) => due.type);
    // A channel that sells every week stops being read. These two are posted by
    // hand, occasionally — if one ends up on the rota it will go out weekly,
    // which is the failure this guards.
    assert.ok(!scheduled.includes('product'), 'product highlights should not be on the weekly rota');
    assert.ok(!scheduled.includes('customer'), 'customer stories should not be on the weekly rota');
  },

  "today's post is a real type the panel can preselect": async () => {
    const rota = await import(pathToFileURL(path.join(GENERATOR_DIR, 'rota.js')).href);
    const options = await import(pathToFileURL(path.join(GENERATOR_DIR, 'options.js')).href);
    const today = rota.postForToday();
    assert.ok(today.day, 'no weekday');
    assert.ok(options.TYPES[today.type], `today is due "${today.type}", which is not a content type`);
  },

  'the provider chain prefers free over paid, and paid over the free-for-all': async () => {
    const provider = await import(pathToFileURL(path.join(GENERATOR_DIR, 'provider.js')).href);
    const saved = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      POLLINATIONS_ENABLED: process.env.POLLINATIONS_ENABLED,
      AI_PROVIDER: process.env.AI_PROVIDER,
    };
    const set = (env) => {
      for (const key of Object.keys(saved)) delete process.env[key];
      Object.assign(process.env, env);
    };

    try {
      set({ GEMINI_API_KEY: 'x', ANTHROPIC_API_KEY: 'x' });
      assert.strictEqual(provider.describeProvider().name, 'gemini', 'Gemini is free and should win');

      set({ ANTHROPIC_API_KEY: 'x' });
      assert.strictEqual(provider.describeProvider().name, 'claude');

      // Nothing configured still writes something, which is the point of the
      // keyless fallback existing at all.
      set({});
      assert.strictEqual(provider.describeProvider().name, 'pollinations');

      // ...unless it has been turned off, which must fail loudly rather than
      // silently producing a worse post.
      set({ POLLINATIONS_ENABLED: 'false' });
      assert.strictEqual(provider.describeProvider().name, null);

      // An explicit choice is never silently overridden.
      set({ AI_PROVIDER: 'claude', GEMINI_API_KEY: 'x', ANTHROPIC_API_KEY: 'x' });
      assert.strictEqual(provider.describeProvider().name, 'claude');
    } finally {
      for (const key of Object.keys(saved)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  },

  'a missing provider is reported as an operator problem, not a user one': async () => {
    const provider = await import(pathToFileURL(path.join(GENERATOR_DIR, 'provider.js')).href);
    const saved = process.env.POLLINATIONS_ENABLED;
    process.env.POLLINATIONS_ENABLED = 'false';
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await assert.rejects(
        () => provider.generatePost({ systemBlocks: [{ text: 'a' }], prompt: 'b' }),
        (err) => {
          // The route turns this code into a 503 with a hint aimed at an
          // administrator. Without it, a missing key reads as a user error.
          assert.strictEqual(err.name, 'GenerationError');
          assert.strictEqual(err.code, 'not-configured');
          return true;
        }
      );
    } finally {
      if (saved === undefined) delete process.env.POLLINATIONS_ENABLED;
      else process.env.POLLINATIONS_ENABLED = saved;
    }
  },

  'the topic is optional': async () => {
    const generate = await import(pathToFileURL(path.join(GENERATOR_DIR, 'generate.js')).href);
    const built = generate.buildRequest({
      type: 'habit',
      audience: 'elders',
      tone: 'friendly',
      language: 'english',
      quoteLanguage: 'english',
    });
    assert.ok(built.prompt.includes('none supplied'), 'a missing topic should say so in the prompt');
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL  ${name}\n      ${err.message}`);
    }
  }
  console.log(failed ? `\n${failed} failing` : `\n${Object.keys(tests).length} passing`);
  process.exit(failed ? 1 : 0);
})();
