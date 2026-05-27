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

// Elevation lookup from Open-Meteo. Returns metres above sea level.
export async function fetchElevation(lat, lon) {
  if (lat == null || lon == null) return null;
  try {
    const res = await fetch("https://api.open-meteo.com/v1/elevation?latitude=" + lat + "&longitude=" + lon);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data.elevation) && data.elevation.length) return data.elevation[0];
    return null;
  } catch (e) { return null; }
}

// Pull today's hourly temperature, windspeed, and wind direction at the
// course location. Used by the yardage matrix to adjust calm baselines.
export async function fetchCurrentConditions(courseKey) {
  const loc = locationFor(courseKey);
  const url = "https://api.open-meteo.com/v1/forecast"
    + "?latitude=" + loc.lat + "&longitude=" + loc.lon
    + "&current=temperature_2m,wind_speed_10m,wind_direction_10m"
    + "&temperature_unit=fahrenheit&wind_speed_unit=mph"
    + "&timezone=" + encodeURIComponent(loc.tz);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const c = data.current || {};
    return {
      locationName: loc.name,
      tempF: c.temperature_2m != null ? c.temperature_2m : null,
      windMph: c.wind_speed_10m != null ? c.wind_speed_10m : null,
      windDirDeg: c.wind_direction_10m != null ? c.wind_direction_10m : null,
      elevationM: data.elevation != null ? data.elevation : null,
    };
  } catch (e) { return null; }
}

// Adjust a calm, sea-level, 70°F baseline carry yardage for today's
// conditions. Rules of thumb used:
//   • Altitude: +2% per 1,000 ft elevation (thinner air carries further)
//   • Temperature: +0.3 yd per °F above 70°F, -0.3 yd per °F below
//   • Wind: +1.0% per mph head, -0.8% per mph tail, +0.2% per mph cross
// windRelation is "head" | "tail" | "cross" | "calm". windMph is the
// 10-min average wind speed at the player's altitude.
export function adjustYardage(baseline, opts) {
  if (baseline == null || isNaN(baseline)) return null;
  const o = opts || {};
  let y = Number(baseline);
  const elevFt = o.elevationFt != null ? o.elevationFt : 0;
  y *= 1 + 0.02 * (elevFt / 1000);
  const tempF = o.tempF != null ? o.tempF : 70;
  y += 0.3 * (tempF - 70);
  const wind = o.windMph != null ? o.windMph : 0;
  const rel = o.windRelation || "calm";
  if (rel === "head") y *= 1 + 0.010 * wind;
  else if (rel === "tail") y *= 1 - 0.008 * wind;
  else if (rel === "cross") y *= 1 + 0.002 * wind;
  return Math.round(y);
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
