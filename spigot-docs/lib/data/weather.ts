/**
 * Real weather for the paid `/api/weather` endpoint.
 *
 * The endpoint used to return the literal `{ temp: 22, condition: 'sunny' }`
 * regardless of the city requested. It was a working paywall wrapped around a
 * constant, so there was nothing to pay for.
 *
 * Open-Meteo needs no API key and no account, which matters here: the whole
 * point of the endpoint is that an agent can pay for it without first setting
 * up billing anywhere else.
 */
import { cached } from './cache';

/** Geocoding and forecast share this base; they are separate hosts. */
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Weather stays valid for a quarter of an hour. Paid callers are few, and the
 * point of the endpoint is current conditions, so a long TTL would be the wrong
 * kind of cheap.
 */
const WEATHER_TTL_MS = 15 * 60 * 1000;
/** A city name resolves to coordinates that do not move; cache them far longer. */
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CurrentWeather {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  /** Degrees Celsius. */
  temperature: number;
  /** Degrees Celsius. */
  apparentTemperature: number;
  /** Percent, 0-100. */
  humidity: number;
  /** km/h. */
  windSpeed: number;
  /** Human-readable summary derived from the WMO weather code. */
  condition: string;
  /** Raw WMO code, so a consumer can map it however it likes. */
  weatherCode: number;
  /** Observation time, ISO-8601, in the location's own timezone. */
  observedAt: string;
  timezone: string;
}

/**
 * WMO 4677 weather codes, as Open-Meteo reports them.
 *
 * Only the codes that actually occur are mapped; anything unmapped falls
 * through to a generic summary rather than being reported as "unknown", so a
 * new code upstream degrades to less detail instead of an error.
 */
const WMO_CONDITIONS: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'rime fog',
  51: 'light drizzle',
  53: 'drizzle',
  55: 'heavy drizzle',
  56: 'light freezing drizzle',
  57: 'freezing drizzle',
  61: 'light rain',
  63: 'rain',
  65: 'heavy rain',
  66: 'light freezing rain',
  67: 'freezing rain',
  71: 'light snow',
  73: 'snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'light rain showers',
  81: 'rain showers',
  82: 'violent rain showers',
  85: 'light snow showers',
  86: 'snow showers',
  95: 'thunderstorm',
  96: 'thunderstorm with light hail',
  99: 'thunderstorm with hail',
};

function conditionFor(code: number): string {
  return WMO_CONDITIONS[code] ?? 'unsettled';
}

/**
 * Fetches JSON with a timeout.
 *
 * Without this a hung upstream holds the paid request open indefinitely: the
 * caller has already paid, so a request that never resolves is the worst
 * possible outcome. Past the deadline the caller gets an error they can retry.
 */
async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      // Weather data is not request-specific; let Next revalidate it.
      next: { revalidate: 900 },
    });

    if (!response.ok) {
      throw new Error(`Upstream responded ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

interface GeocodeResult {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
}

/**
 * Resolves a city name to coordinates.
 *
 * @throws when the name matches no place, so the endpoint can say "I don't know
 * that city" instead of inventing a forecast for it.
 */
async function geocode(city: string): Promise<GeocodeResult> {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(city)}&count=1`;

  const body = (await cached(`geocode:${city.toLowerCase()}`, GEOCODE_TTL_MS, () =>
    fetchJson(url),
  )) as { results?: GeocodeResult[] };

  const first = body.results?.[0];
  if (!first) {
    throw new Error(`Unknown city "${city}"`);
  }

  return first;
}

/**
 * Current conditions for a city.
 *
 * @throws on an unknown city or an upstream failure. Callers must let this
 * propagate rather than substituting a placeholder: a paid endpoint that
 * invents plausible weather is worse than one that admits it is down.
 */
export async function getCurrentWeather(city: string): Promise<CurrentWeather> {
  const trimmed = city.trim() || 'London';
  const place = await geocode(trimmed);

  const url =
    `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
    '&timezone=auto';

  const body = (await cached(`weather:${place.latitude},${place.longitude}`, WEATHER_TTL_MS, () =>
    fetchJson(url),
  )) as {
    timezone?: string;
    current?: {
      time: string;
      temperature_2m: number;
      relative_humidity_2m: number;
      apparent_temperature: number;
      weather_code: number;
      wind_speed_10m: number;
    };
  };

  const current = body.current;
  if (!current) {
    throw new Error('Upstream returned no current conditions');
  }

  return {
    city: place.name,
    country: place.country,
    latitude: place.latitude,
    longitude: place.longitude,
    temperature: current.temperature_2m,
    apparentTemperature: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    condition: conditionFor(current.weather_code),
    weatherCode: current.weather_code,
    // Open-Meteo returns local wall-clock time with no zone suffix; it is
    // annotated so a consumer can tell it is not UTC.
    observedAt: `${current.time}:00`,
    timezone: body.timezone ?? 'UTC',
  };
}
