// Weather fetching against the Open-Meteo API. Uses the archive endpoint
// for past dates and the forecast endpoint otherwise. Course location
// comes from src/core/courses.js.

import { locationFor } from "../core/courses.js";
import { todayISO } from "../core/utils.js";

export async function fetchWeatherForDate(dateStr, courseKey) {
  if (!dateStr) return null;
  const loc = locationFor(courseKey);
  const today = todayISO();
  const isPast = dateStr < today;
  const base = isPast
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";
  const url = base +
    "?latitude=" + loc.lat + "&longitude=" + loc.lon +
    "&start_date=" + dateStr + "&end_date=" + dateStr +
    "&daily=temperature_2m_max,temperature_2m_min,weathercode,windspeed_10m_max,precipitation_sum" +
    "&timezone=" + encodeURIComponent(loc.tz);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const d = data.daily || {};
    return {
      date: dateStr,
      courseKey: courseKey || null,
      locationName: loc.name,
      tempMax: d.temperature_2m_max ? d.temperature_2m_max[0] : null,
      tempMin: d.temperature_2m_min ? d.temperature_2m_min[0] : null,
      code: d.weathercode ? d.weathercode[0] : null,
      condition: weatherCodeToText(d.weathercode ? d.weathercode[0] : null),
      windKmh: d.windspeed_10m_max ? d.windspeed_10m_max[0] : null,
      precipMm: d.precipitation_sum ? d.precipitation_sum[0] : null,
    };
  } catch (e) {
    return null;
  }
}

export function weatherCodeToText(code) {
  if (code == null) return "—";
  if (code === 0) return "Clear";
  if (code === 1 || code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95 && code <= 99) return "Thunderstorm";
  return "Mild";
}
