/** Open-Meteo (no API key). Shared by header chip + home card. */

export type WeatherCurrent = {
  tempC: number;
  weatherCode: number;
  humidity?: number;
  windKmh?: number;
  label: string; // place name
  fetchedAt: number;
};

export type WeatherDay = {
  date: string; // YYYY-MM-DD
  weatherCode: number;
  tempMaxC: number;
  tempMinC: number;
  precipProb?: number;
};

export type WeatherSnapshot = {
  current: WeatherCurrent;
  today: WeatherDay;
  latitude: number;
  longitude: number;
};

export type WeatherLocation = {
  latitude: number;
  longitude: number;
  label: string;
};

const CACHE_KEY = 'fcc-weather-cache-v1';
const LOC_KEY = 'fcc-weather-loc-v1';
const CACHE_MS = 20 * 60 * 1000; // 20 min

/** Brisbane default — family is AEST. */
export const DEFAULT_WEATHER_LOCATION: WeatherLocation = {
  latitude: -27.4698,
  longitude: 153.0251,
  label: 'Brisbane',
};

/** WMO weather interpretation codes → short label + emoji. */
export function weatherCodeMeta(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Clear' };
  if (code === 1) return { emoji: '🌤️', label: 'Mainly clear' };
  if (code === 2) return { emoji: '⛅', label: 'Partly cloudy' };
  if (code === 3) return { emoji: '☁️', label: 'Overcast' };
  if (code === 45 || code === 48) return { emoji: '🌫️', label: 'Fog' };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: 'Drizzle' };
  if (code >= 61 && code <= 67) return { emoji: '🌧️', label: 'Rain' };
  if (code >= 71 && code <= 77) return { emoji: '🌨️', label: 'Snow' };
  if (code >= 80 && code <= 82) return { emoji: '🌧️', label: 'Showers' };
  if (code >= 85 && code <= 86) return { emoji: '🌨️', label: 'Snow showers' };
  if (code === 95) return { emoji: '⛈️', label: 'Thunderstorm' };
  if (code === 96 || code === 99) return { emoji: '⛈️', label: 'Storm' };
  return { emoji: '🌡️', label: 'Weather' };
}

export function loadCachedWeather(): WeatherSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeatherSnapshot;
    if (!parsed?.current?.fetchedAt) return null;
    if (Date.now() - parsed.current.fetchedAt > CACHE_MS * 3) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(snap: WeatherSnapshot) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

export function loadStoredLocation(): WeatherLocation | null {
  try {
    const raw = localStorage.getItem(LOC_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as WeatherLocation;
    if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return null;
    return { ...p, label: p.label || 'Home' };
  } catch {
    return null;
  }
}

export function saveStoredLocation(loc: WeatherLocation) {
  try {
    localStorage.setItem(LOC_KEY, JSON.stringify(loc));
  } catch {
    /* ignore */
  }
}

export async function geocodeCity(query: string): Promise<WeatherLocation | null> {
  const q = query.trim();
  if (!q) return null;
  const url =
    'https://geocoding-api.open-meteo.com/v1/search?' +
    new URLSearchParams({ name: q, count: '1', language: 'en', format: 'json' });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocode failed (${res.status})`);
  const data = (await res.json()) as {
    results?: { name: string; country?: string; latitude: number; longitude: number; admin1?: string }[];
  };
  const hit = data.results?.[0];
  if (!hit) return null;
  const label = [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ');
  return { latitude: hit.latitude, longitude: hit.longitude, label };
}

export async function fetchWeather(loc: WeatherLocation): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(loc.latitude),
    longitude: String(loc.longitude),
    current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '1',
    wind_speed_unit: 'kmh',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Weather failed (${res.status})`);
  const data = (await res.json()) as {
    current: {
      temperature_2m: number;
      relative_humidity_2m?: number;
      weather_code: number;
      wind_speed_10m?: number;
    };
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max?: number[];
    };
  };

  const snap: WeatherSnapshot = {
    latitude: loc.latitude,
    longitude: loc.longitude,
    current: {
      tempC: Math.round(data.current.temperature_2m),
      weatherCode: data.current.weather_code,
      humidity: data.current.relative_humidity_2m,
      windKmh:
        data.current.wind_speed_10m != null
          ? Math.round(data.current.wind_speed_10m)
          : undefined,
      label: loc.label,
      fetchedAt: Date.now(),
    },
    today: {
      date: data.daily.time[0] || '',
      weatherCode: data.daily.weather_code[0] ?? data.current.weather_code,
      tempMaxC: Math.round(data.daily.temperature_2m_max[0] ?? data.current.temperature_2m),
      tempMinC: Math.round(data.daily.temperature_2m_min[0] ?? data.current.temperature_2m),
      precipProb: data.daily.precipitation_probability_max?.[0],
    },
  };
  saveCache(snap);
  return snap;
}

/**
 * Resolve location: settings → localStorage → geolocation → Brisbane default.
 */
export async function resolveWeatherLocation(settingsLoc?: WeatherLocation | null): Promise<WeatherLocation> {
  if (
    settingsLoc &&
    typeof settingsLoc.latitude === 'number' &&
    typeof settingsLoc.longitude === 'number'
  ) {
    return {
      latitude: settingsLoc.latitude,
      longitude: settingsLoc.longitude,
      label: settingsLoc.label || 'Home',
    };
  }
  const stored = loadStoredLocation();
  if (stored) return stored;

  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 5000,
          maximumAge: 3600_000,
        });
      });
      const loc: WeatherLocation = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        label: 'Near you',
      };
      saveStoredLocation(loc);
      return loc;
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_WEATHER_LOCATION;
}

/** Fetch with cache; force=true skips freshness window. */
export async function getWeather(
  settingsLoc?: WeatherLocation | null,
  force = false,
): Promise<WeatherSnapshot> {
  const loc = await resolveWeatherLocation(settingsLoc);
  const cached = loadCachedWeather();
  if (
    !force &&
    cached &&
    Date.now() - cached.current.fetchedAt < CACHE_MS &&
    Math.abs(cached.latitude - loc.latitude) < 0.05 &&
    Math.abs(cached.longitude - loc.longitude) < 0.05
  ) {
    return { ...cached, current: { ...cached.current, label: loc.label } };
  }
  return fetchWeather(loc);
}
