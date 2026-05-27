// WHS-style Handicap Index ↔ Course Handicap conversion.
// The player's "handicap" stored in profile.handicap is treated as the
// global Handicap Index (e.g. 13.0) — updated monthly from the GHIN/IGU
// email. Course Handicap is computed on the fly from Index + tee rating.

import { COURSES } from "../core/courses.js";
import { getProfile, saveProfile } from "./profile.js";

// Lookup CR + Slope for a course/tee combo. Returns null if not configured.
export function getRating(courseKey, tee) {
  const c = COURSES[courseKey];
  if (!c || !c.ratings) return null;
  return c.ratings[tee] || null;
}

// Course Handicap = round(Index × Slope / 113 + (CR − Par))
export function courseHandicap(index, slope, cr, par) {
  if (index == null || !slope || !cr || !par) return null;
  return Math.round(index * (slope / 113) + (cr - par));
}

// Score Differential = (AdjustedScore − CR) × 113 / Slope
export function differential(score, cr, slope) {
  if (score == null || !cr || !slope) return null;
  return +(((score - cr) * 113) / slope).toFixed(1);
}

// Convenience: full handicap snapshot for a round at the moment it's saved.
export function buildRoundHandicap(courseKey, tee, par, score) {
  const p = getProfile();
  const index = p.handicap != null ? Number(p.handicap) : null;
  const rating = getRating(courseKey, tee);
  if (!rating) return { handicapIndex: index };
  const ch = courseHandicap(index, rating.slope, rating.cr, par);
  const diff = differential(score, rating.cr, rating.slope);
  return {
    handicapIndex: index,
    courseRating: rating.cr,
    slope: rating.slope,
    courseHandicap: ch,
    differential: diff,
  };
}

// Handicap Index history (every time the player logs a new monthly index).
export function getIndexHistory() {
  const p = getProfile();
  return Array.isArray(p.handicapIndexHistory) ? p.handicapIndexHistory : [];
}

export function recordIndex(value, dateISO) {
  const v = Number(value);
  if (!isFinite(v)) return false;
  const p = getProfile();
  const date = dateISO || new Date().toISOString().slice(0, 10);
  p.handicap = v;
  p.handicapIndexDate = date;
  const hist = Array.isArray(p.handicapIndexHistory) ? p.handicapIndexHistory.slice() : [];
  // De-dupe same-date entries: replace
  const existing = hist.findIndex(function (h) { return h.date === date; });
  if (existing >= 0) hist[existing] = { date: date, value: v };
  else hist.push({ date: date, value: v });
  hist.sort(function (a, b) { return a.date.localeCompare(b.date); });
  p.handicapIndexHistory = hist;
  saveProfile(p);
  return true;
}
