// Today's weather where the readers are.
//
// A food post that ignores the weather reads as written by somebody who is not
// there. Cooling food on the first cold morning of December, or a cold salad on
// a day of heavy rain, is exactly the small wrongness that makes a channel feel
// automated.
//
// Open-Meteo, because it is free, needs no key and no account, and asks nothing
// of whoever runs this. Amberpet, Hyderabad by default — the business's own
// address — and overridable for anyone running it elsewhere.

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 6000;

const DEFAULT_LAT = 17.3927;  // Amberpet, Hyderabad
const DEFAULT_LON = 78.5108;

// WMO weather codes, grouped to the four things that change what people cook.
function describeCode(code) {
  if (code >= 95) return { sky: 'thunderstorms', wet: true };
  if (code >= 80) return { sky: 'heavy showers', wet: true };
  if (code >= 61) return { sky: 'rain', wet: true };
  if (code >= 51) return { sky: 'drizzle', wet: true };
  if (code >= 45) return { sky: 'fog', wet: false };
  if (code >= 2) return { sky: 'cloudy', wet: false };
  return { sky: 'clear', wet: false };
}

// Hyderabad's range. 34 is a hot day here and 18 is a cold morning; the same
// numbers would mean something else somewhere else, which is why this sits
// beside the coordinates rather than being a global rule.
function describeHeat(maxC, minC) {
  if (maxC >= 38) return 'very hot';
  if (maxC >= 33) return 'hot';
  if (minC <= 15) return 'cold, especially in the morning';
  if (minC <= 19) return 'cool in the morning';
  return 'mild';
}

// One call per day per process. A --batch run is nine posts and needs one
// forecast, not nine.
let cache = { date: null, value: null };

export async function weatherFor(dateStr) {
  if (cache.date === dateStr) return cache.value;

  const params = new URLSearchParams({
    latitude: String(process.env.WEATHER_LAT || DEFAULT_LAT),
    longitude: String(process.env.WEATHER_LON || DEFAULT_LON),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code',
    timezone: 'Asia/Kolkata',
    start_date: dateStr,
    end_date: dateStr,
  });

  try {
    const response = await fetch(`${ENDPOINT}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return remember(dateStr, null);

    const body = await response.json();
    const daily = body?.daily;
    if (!daily?.temperature_2m_max?.length) return remember(dateStr, null);

    const maxC = Math.round(daily.temperature_2m_max[0]);
    const minC = Math.round(daily.temperature_2m_min[0]);
    const rain = daily.precipitation_sum?.[0] ?? 0;
    const { sky, wet } = describeCode(daily.weather_code?.[0] ?? 0);

    return remember(dateStr, {
      maxC,
      minC,
      sky,
      rain,
      raining: wet || rain >= 1,
      heat: describeHeat(maxC, minC),
      summary: `${minC}–${maxC}°C, ${sky}${rain >= 1 ? `, ${rain.toFixed(0)}mm of rain expected` : ''}`,
    });
  } catch {
    // Never fatal. A post written without the weather is a slightly more generic
    // post; a post that fails to write because a forecast service was slow is a
    // channel that goes quiet. The prompt simply omits the line.
    return remember(dateStr, null);
  }
}

function remember(date, value) {
  cache = { date, value };
  return value;
}

/** What the weather should do to the food, in the prompt's own terms. */
export function weatherGuidance(weather) {
  if (!weather) return null;

  if (weather.raining) {
    return 'Rain today. People want warm, cooked, comforting food and hot drinks, and '
      + 'raw or cold things are unappealing — soups, rasam, khichdi, hot chai, anything '
      + 'off the stove. Damp days also mean cut fruit spoils faster.';
  }
  if (weather.heat === 'very hot' || weather.heat === 'hot') {
    return 'A hot day. Cooling, watery food and plenty to drink — buttermilk, majjiga, '
      + 'curd rice, watermelon and other water-heavy fruit, light meals rather than '
      + 'heavy ones, and nothing that needs standing over a stove at midday. Cooking '
      + 'early is worth suggesting.';
  }
  if (weather.heat.startsWith('cold')) {
    return 'A cold morning. Warm food and warm drinks, something hot to start the day, '
      + 'and slightly more substantial meals than usual.';
  }
  if (weather.heat === 'cool in the morning') {
    return 'Cool first thing and pleasant later. A warm start to the day suits it, '
      + 'without the whole post being about the cold.';
  }
  return null;
}
