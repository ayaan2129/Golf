// Player profile: editable display name, birthday, handicap, big goal,
// favourite player, club distances. Stored per-user via the namespaced
// localStorage (src/core/storage.js).

import { DEFAULT_CLUBS } from "../core/courses.js";
import { getIronInsights, getDriverInsights } from "./practice.js";

export const MAX_CLUBS = 14;

export function getProfile() {
  try { return JSON.parse(localStorage.getItem("playerProfile") || "{}"); }
  catch (e) { return {}; }
}

export function saveProfile(p) {
  localStorage.setItem("playerProfile", JSON.stringify(p));
}

export function setProfileField(key, value) {
  const p = getProfile();
  p[key] = value;
  saveProfile(p);
}

export function getClubDistance(club) {
  const p = getProfile();
  return p.clubDistances && p.clubDistances[club] != null ? p.clubDistances[club] : null;
}

export function setClubDistance(club, distance) {
  const p = getProfile();
  if (!p.clubDistances) p.clubDistances = {};
  if (distance === "" || distance == null) delete p.clubDistances[club];
  else p.clubDistances[club] = Number(distance) || 0;
  saveProfile(p);
}

export function getSelectedClubs() {
  const raw = localStorage.getItem("selectedClubs");
  if (raw === null) return DEFAULT_CLUBS.slice();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {}
  return DEFAULT_CLUBS.slice();
}

export function saveSelectedClubs(arr) {
  localStorage.setItem("selectedClubs", JSON.stringify(arr));
}

// Maps bag display names ("7 Iron") to practice short codes ("7i") and
// returns the observed avg carry across iron + driver practice sessions
// when at least 3 shots are logged.
// Per-club shot-length yardage matrix. Each club maps to baseline calm,
// sea-level, ~70°F carry yards for full / ¾ / half / ¼ swings. The
// adjusted-for-today figures (altitude, temp, wind) are computed at
// render time — only baselines are stored.
export const SHOT_TYPES = [
  { key: "full", label: "Full" },
  { key: "threeQ", label: "¾" },
  { key: "half", label: "Half" },
  { key: "quarter", label: "¼" },
];

export function getYardageMatrix() {
  const p = getProfile();
  return p.yardageMatrix && typeof p.yardageMatrix === "object" ? p.yardageMatrix : {};
}

export function getYardageCell(club, shotType) {
  const m = getYardageMatrix();
  const row = m[club];
  if (!row) {
    // Fall back to legacy single distance for "full" so existing users
    // don't see an empty matrix.
    if (shotType === "full") {
      const legacy = getClubDistance(club);
      return legacy != null ? legacy : null;
    }
    return null;
  }
  return row[shotType] != null ? row[shotType] : null;
}

export function setYardageCell(club, shotType, yards) {
  const p = getProfile();
  if (!p.yardageMatrix) p.yardageMatrix = {};
  if (!p.yardageMatrix[club]) p.yardageMatrix[club] = {};
  if (yards === "" || yards == null) delete p.yardageMatrix[club][shotType];
  else p.yardageMatrix[club][shotType] = Number(yards) || 0;
  // Keep the legacy single-distance field synced to the full-swing entry
  // so the rest of the app (rounds, practice) keeps working unchanged.
  if (shotType === "full") {
    if (yards === "" || yards == null) {
      if (p.clubDistances) delete p.clubDistances[club];
    } else {
      if (!p.clubDistances) p.clubDistances = {};
      p.clubDistances[club] = Number(yards) || 0;
    }
  }
  saveProfile(p);
}

export function getObservedClubCarry(club) {
  const aliases = {
    "Driver": ["Driver"],
    "3 Wood": ["3W"],
    "5 Wood": ["5W"],
    "3 Hybrid": ["3H"],
    "4 Hybrid": ["4H"],
    "5 Hybrid": ["5H"],
    "3 Iron": ["3i"],
    "4 Iron": ["4i"],
    "5 Iron": ["5i"],
    "6 Iron": ["6i"],
    "7 Iron": ["7i"],
    "8 Iron": ["8i"],
    "9 Iron": ["9i"],
    "Pitching Wedge": ["PW"],
    "Sand Wedge": ["SW"],
    "Lob Wedge": ["LW"],
  };
  const codes = aliases[club] || [club];
  const ii = getIronInsights();
  const di = getDriverInsights();
  for (const code of codes) {
    if (ii && ii.clubStats) {
      const hit = ii.clubStats.find(function (c) { return c.club === code; });
      if (hit && hit.avgCarry != null && hit.count >= 3) return { carry: hit.avgCarry, count: hit.count };
    }
    if (di && di.clubStats) {
      const hit = di.clubStats.find(function (c) { return c.club === code; });
      if (hit && hit.avgCarry != null && hit.count >= 3) return { carry: hit.avgCarry, count: hit.count };
    }
  }
  return null;
}
