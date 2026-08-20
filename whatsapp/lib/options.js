// Every valid --type, --audience, --tone, --language and --slot lives here, with the
// description that gets rendered into the prompt. One registry so the CLI's validation,
// the --list output and the prompt all read from the same place: a type added here is
// immediately valid everywhere, and can never be listed but unusable.

export const TYPES = {
  myth: {
    label: 'Myth vs Fact',
    file: 'myth.md',
    contrast: 'optional',
    dated: false,
  },
  morning: {
    label: 'Morning Tips',
    file: 'morning.md',
    contrast: 'always',
    dated: true,
  },
  meal: {
    label: 'Meal of the Day',
    file: 'meal.md',
    contrast: 'always',
    dated: true,
    slotted: true,
  },
  cheat: {
    label: 'Sunday Cheat Meal',
    file: 'cheat.md',
    contrast: 'always',
    dated: true,
    // Always written for Sunday, whatever day it is generated on — these get drafted
    // midweek. --day still overrides.
    pinnedDay: 'Sunday',
  },
  habit: {
    label: 'Healthy Habit Challenge',
    file: 'habit.md',
    contrast: 'always',
    dated: false,
  },
  product: {
    label: 'Product Highlight',
    file: 'product.md',
    contrast: 'never',
    dated: false,
    needsProduct: true,
  },
  seasonal: {
    label: 'Seasonal Food',
    file: 'seasonal.md',
    contrast: 'optional',
    dated: false,
    seasonal: true,
  },
  evening: {
    label: 'Evening Wind-Down',
    file: 'evening.md',
    contrast: 'always',
    dated: true,
  },
  customer: {
    label: 'Customer Story',
    file: 'customer.md',
    contrast: 'never',
    dated: false,
  },
};

export const SLOTS = {
  breakfast: { label: 'Breakfast', timeOfDay: 'MORNING', emoji: '🌅' },
  lunch: { label: 'Lunch', timeOfDay: 'AFTERNOON', emoji: '☀️' },
  snack: { label: 'Evening Snack', timeOfDay: 'EVENING', emoji: '🍵' },
  dinner: { label: 'Dinner', timeOfDay: 'EVENING', emoji: '🌆' },
};

export const AUDIENCES = {
  general: {
    label: 'General audience',
    description: [
      'A whole household reading the same post — a grandmother, her son and her',
      'grandchildren. Write the split treatment: a shared opening everyone reads,',
      'then separate sections for the different readers, along the lines of',
      '`👵 FOR ELDERS`, `👶 FOR YOUNG ONES` and `🌿 FOR THE FAMILY`, so each one',
      'finds their own line in it. This is the only audience that gets the split —',
      'the others are written for one reader.',
    ].join(' '),
  },
  elders: {
    label: 'Elderly audience',
    description: [
      'Readers around sixty and above. Favour warm, soft, easily digested food and',
      'smaller quantities; timing and chewing matter more than variety. Respectful,',
      'never patronising — they have cooked for fifty years and know more about food',
      'than the post does. No section for children, no split.',
    ].join(' '),
  },
  diabetics: {
    label: 'Diabetic patients',
    description: [
      'Readers managing diabetes, most of them alongside medication. Sugar-conscious',
      'and portion-aware: talk about fibre, protein, portion size and the order things',
      'are eaten in. Never state or imply that a food treats, controls, lowers,',
      'manages or reverses diabetes, and never suggest changing, reducing or stopping',
      'any medicine. Close with a short plain note — its own small section before the',
      'closing furniture — that this is food, not treatment, and their doctor stays in',
      'charge of the rest.',
    ].join(' '),
  },
  young: {
    label: 'Young adults',
    description: [
      'Readers roughly eighteen to thirty-five. Busy, skipping meals, ordering in,',
      'often cooking for one. Favour quick, cheap options with little or no cooking,',
      'and things that survive a hostel room or a shared kitchen. Slightly more',
      'energetic register, still warm. No slang, and nothing that will read as dated',
      'in six months.',
    ].join(' '),
  },
};

export const TONES = {
  friendly: 'Warm and conversational, like a neighbour who cooks. This is the channel default.',
  professional: 'Calm and matter-of-fact. Fewer exclamations, no jokes. Still warm, never clinical.',
  playful: 'Light and a little funny. Keep the jokes gentle and about the situation, never about the reader.',
  authoritative: 'Confident and direct, the register of someone who plainly knows the subject. Never stern, and never a lecture.',
};

export const LANGUAGES = {
  english: 'Write the post in English.',
  telugu: [
    'Write the post in Telugu, written in the Latin alphabet — Telugu as people type it',
    'on a phone here ("Poddunne thondaraga lechi, konchem thinandi"). Do not use Telugu',
    'script. The headline, the section headings and the fixed closing lines',
    '(`💬 GRILLO SAYS`, `🥗 Know Your Food Better.`, `— Grillo`) stay in English.',
  ].join(' '),
  hindi: [
    'Write the post in Hindi, written in the Latin alphabet — Hindi as people type it on',
    'a phone ("Subah uthkar pehle paani piyein"). Do not use Devanagari. The headline,',
    'the section headings and the fixed closing lines (`💬 GRILLO SAYS`,',
    '`🥗 Know Your Food Better.`, `— Grillo`) stay in English.',
  ].join(' '),
};

export const QUOTE_LANGUAGES = {
  english: 'Write the GRILLO SAYS quote in English.',
  telugu: [
    'Write the GRILLO SAYS quote in Telugu, in the Latin alphabet — the way it would be',
    'typed on a phone, not in Telugu script. The `💬 GRILLO SAYS` heading itself stays in',
    'English, and so does everything after the quote.',
  ].join(' '),
};

export const CONTRAST_RULES = {
  always: 'Include the INSTEAD OF THIS… TRY THIS block.',
  optional: 'Include the INSTEAD OF THIS… TRY THIS block only if this post has real habits worth swapping. Leave it out rather than inventing weak swaps.',
  never: 'Do not include the INSTEAD OF THIS… TRY THIS block on this type.',
};

export const DEFAULTS = {
  audience: 'general',
  tone: 'friendly',
  language: 'english',
  quoteLanguage: 'auto',
};
