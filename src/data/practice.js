// Practice session storage + insights aggregators.
//
// Each session has: { date, area, type, duration, focus, notes, savedAt,
// shots: [...] }. type ∈ {Putting, Chipping, Irons, Driver}.
//
// The drill state machines (puttingState, chippingState, etc.) and DOM
// rendering live in src/screens/practice-ui.js (Phase 4). This module is
// data-only: read, write, derive insights.

export function getPractice() {
  try { return JSON.parse(localStorage.getItem("practiceSessions") || "[]"); }
  catch (e) { return []; }
}

export function savePractice(arr) {
  localStorage.setItem("practiceSessions", JSON.stringify(arr));
}

// Result classifiers used by chipping / iron / driver insights and by their
// drill UIs to colour result tiles + drive running stats.
export const CHIP_GOOD = ["Holed", "In 3ft", "In 6ft"];
export const CHIP_UD = ["Holed", "In 3ft", "In 6ft"];
export const IRON_GOOD_RESULTS = ["On target"];
export const IRON_ACCEPTABLE_RESULTS = ["On target", "Short", "Long"];
export const DRV_FAIRWAY_RESULTS = ["Fairway"];
export const DRV_PLAYABLE_RESULTS = ["Fairway", "Light rough L", "Light rough R"];

// Date-window practice activity: how often you've practised lately and how
// many shots you've logged across each skill in a given window. AI uses
// this to reason about practice frequency + improvement trends.
export function getPracticeActivity(daysWindow) {
  const days = Number(daysWindow) || 30;
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000);
  const sessions = getPractice().filter(function (s) {
    if (!s.date) return false;
    return new Date(s.date) >= cutoff;
  });
  const daysSet = new Set();
  const byType = { Putting: 0, Chipping: 0, Irons: 0, Driver: 0 };
  let totalShots = 0;
  for (const s of sessions) {
    if (s.date) daysSet.add(s.date);
    const n = Array.isArray(s.shots) ? s.shots.length : 0;
    totalShots += n;
    if (byType[s.type] != null) byType[s.type] += n;
  }
  return {
    windowDays: days,
    daysPractised: daysSet.size,
    sessions: sessions.length,
    totalShots,
    byType,
  };
}

// Practice trend: same insight, computed over windowed slices so we can
// say "putting make-rate over the last 30 days was X%, prior 30 days Y%".
export function getPuttingTrend() {
  const now = new Date();
  function windowed(daysBack, daysSpan) {
    const end = new Date(now.getTime() - daysBack * 24 * 3600 * 1000);
    const start = new Date(end.getTime() - daysSpan * 24 * 3600 * 1000);
    const allShots = [];
    for (const s of getPractice()) {
      if (s.type !== "Putting" || !Array.isArray(s.shots) || !s.date) continue;
      const d = new Date(s.date);
      if (d >= start && d <= end) for (const sh of s.shots) allShots.push(sh);
    }
    const make = allShots.filter(function (sh) { return sh.intent === "make"; });
    const made = make.filter(function (sh) { return sh.result === "Holed"; }).length;
    return { putts: allShots.length, makeIntent: make.length, made, pct: make.length > 0 ? Math.round(made / make.length * 100) : null };
  }
  return {
    last30: windowed(0, 30),
    prior30: windowed(30, 30),
  };
}

// ----- Putting -----
export function getPuttingInsights() {
  const sessions = getPractice().filter(function (s) { return s.type === "Putting" && Array.isArray(s.shots); });
  const allShots = [];
  for (const s of sessions) for (const sh of s.shots) allShots.push(sh);
  const buckets = [
    { lbl: "0-3 ft", fn: function (sh) { return sh.distance <= 3 && sh.intent === "make"; } },
    { lbl: "3-5 ft", fn: function (sh) { return sh.distance > 3 && sh.distance <= 5 && sh.intent === "make"; } },
    { lbl: "5-10 ft", fn: function (sh) { return sh.distance > 5 && sh.distance <= 10 && sh.intent === "make"; } },
    { lbl: "10-20 ft", fn: function (sh) { return sh.distance > 10 && sh.distance <= 20 && sh.intent === "make"; } },
    { lbl: "20+ ft", fn: function (sh) { return sh.distance > 20 && sh.intent === "make"; } },
  ];
  const distanceRates = buckets.map(function (b) {
    const set = allShots.filter(b.fn);
    if (set.length === 0) return { label: b.lbl, count: 0, pct: null };
    const made = set.filter(function (sh) { return sh.result === "Holed"; }).length;
    return { label: b.lbl, count: set.length, pct: Math.round(made / set.length * 100) };
  });
  const misses = allShots.filter(function (sh) { return sh.intent === "make" && sh.result !== "Holed"; });
  let topMiss = null;
  if (misses.length > 0) {
    const dirCounts = {};
    for (const m of misses) dirCounts[m.result] = (dirCounts[m.result] || 0) + 1;
    topMiss = Object.keys(dirCounts).sort(function (a, b) { return dirCounts[b] - dirCounts[a]; })[0];
  }
  const lagShots = allShots.filter(function (sh) { return sh.intent === "lag"; });
  let lag = null;
  if (lagShots.length > 0) {
    const inCircle = lagShots.filter(function (sh) { return sh.result === "Holed" || sh.result === "In Circle"; }).length;
    lag = { count: lagShots.length, inCirclePct: Math.round(inCircle / lagShots.length * 100) };
  }
  return { totalShots: allShots.length, sessions: sessions.length, distanceRates, topMiss, lag };
}

// ----- Chipping -----
export function getChippingInsights() {
  const sessions = getPractice().filter(function (s) { return s.type === "Chipping" && Array.isArray(s.shots); });
  const allShots = [];
  for (const s of sessions) for (const sh of s.shots) allShots.push(sh);
  function udRate(set) {
    if (set.length === 0) return null;
    const ud = set.filter(function (sh) { return CHIP_UD.indexOf(sh.result) !== -1; }).length;
    return { count: set.length, ud, pct: Math.round(ud / set.length * 100) };
  }
  const buckets = [
    { lbl: "0-10 y", fn: function (sh) { return sh.distance <= 10; } },
    { lbl: "10-20 y", fn: function (sh) { return sh.distance > 10 && sh.distance <= 20; } },
    { lbl: "20-40 y", fn: function (sh) { return sh.distance > 20 && sh.distance <= 40; } },
    { lbl: "40+ y", fn: function (sh) { return sh.distance > 40; } },
  ];
  const distanceRates = buckets.map(function (b) {
    const r = udRate(allShots.filter(b.fn));
    return { label: b.lbl, count: r ? r.count : 0, pct: r ? r.pct : null };
  });
  const lieGroups = {};
  for (const sh of allShots) {
    if (!lieGroups[sh.lie]) lieGroups[sh.lie] = [];
    lieGroups[sh.lie].push(sh);
  }
  const lieRates = Object.keys(lieGroups).map(function (k) {
    const r = udRate(lieGroups[k]);
    return { lie: k, count: r.count, pct: r.pct };
  }).sort(function (a, b) { return b.count - a.count; });
  const mishits = allShots.filter(function (sh) { return sh.result === "Chunked" || sh.result === "Bladed"; });
  const mishitPct = allShots.length > 0 ? Math.round(mishits.length / allShots.length * 100) : null;
  let topMiss = null;
  const misses = allShots.filter(function (sh) { return CHIP_GOOD.indexOf(sh.result) === -1; });
  if (misses.length > 0) {
    const c = {};
    for (const m of misses) c[m.result] = (c[m.result] || 0) + 1;
    topMiss = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0];
  }
  return { totalShots: allShots.length, sessions: sessions.length, distanceRates, lieRates, mishitPct, topMiss };
}

// ----- Irons -----
export function getIronInsights() {
  const sessions = getPractice().filter(function (s) { return s.type === "Irons" && Array.isArray(s.shots); });
  const allShots = [];
  for (const s of sessions) for (const sh of s.shots) allShots.push(sh);
  const byClub = {};
  for (const sh of allShots) {
    if (!byClub[sh.club]) byClub[sh.club] = [];
    byClub[sh.club].push(sh);
  }
  const clubStats = [];
  const clubOrder = ["3i","4i","5i","6i","7i","8i","9i","PW","3H","4H","5H"];
  for (const c of clubOrder) {
    if (!byClub[c]) continue;
    const set = byClub[c];
    const carries = set.map(function (s) { return s.carry; }).filter(function (v) { return typeof v === "number" && v > 0; });
    const avg = carries.length ? Math.round(carries.reduce(function (a, b) { return a + b; }, 0) / carries.length) : null;
    const min = carries.length ? Math.min.apply(null, carries) : null;
    const max = carries.length ? Math.max.apply(null, carries) : null;
    const good = set.filter(function (sh) { return IRON_GOOD_RESULTS.indexOf(sh.result) !== -1; }).length;
    clubStats.push({
      club: c, count: set.length,
      avgCarry: avg, minCarry: min, maxCarry: max,
      onTargetPct: Math.round(good / set.length * 100),
    });
  }
  const misses = allShots.filter(function (sh) { return IRON_GOOD_RESULTS.indexOf(sh.result) === -1; });
  let topMiss = null;
  if (misses.length > 0) {
    const c = {};
    for (const m of misses) c[m.result] = (c[m.result] || 0) + 1;
    topMiss = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0];
  }
  const shapeCounts = {};
  for (const sh of allShots) shapeCounts[sh.shape] = (shapeCounts[sh.shape] || 0) + 1;
  const pure = allShots.filter(function (sh) { return ["Fat", "Thin", "OB"].indexOf(sh.result) === -1; }).length;
  const pureStrikePct = allShots.length > 0 ? Math.round(pure / allShots.length * 100) : null;
  return { totalShots: allShots.length, sessions: sessions.length, clubStats, topMiss, shapeCounts, pureStrikePct };
}

// ----- Driver / wood -----
export function getDriverInsights() {
  const sessions = getPractice().filter(function (s) { return s.type === "Driver" && Array.isArray(s.shots); });
  const allShots = [];
  for (const s of sessions) for (const sh of s.shots) allShots.push(sh);
  const byClub = {};
  for (const sh of allShots) {
    if (!byClub[sh.club]) byClub[sh.club] = [];
    byClub[sh.club].push(sh);
  }
  const clubStats = [];
  const order = ["Driver","3W","5W","3H","4H"];
  for (const c of order) {
    if (!byClub[c]) continue;
    const set = byClub[c];
    const carries = set.map(function (s) { return s.carry; }).filter(function (v) { return typeof v === "number" && v > 0; });
    const totals = set.map(function (s) { return s.total; }).filter(function (v) { return typeof v === "number" && v > 0; });
    const fw = set.filter(function (sh) { return DRV_FAIRWAY_RESULTS.indexOf(sh.result) !== -1; }).length;
    const playable = set.filter(function (sh) { return DRV_PLAYABLE_RESULTS.indexOf(sh.result) !== -1; }).length;
    clubStats.push({
      club: c, count: set.length,
      avgCarry: carries.length ? Math.round(carries.reduce(function (a, b) { return a + b; }, 0) / carries.length) : null,
      avgTotal: totals.length ? Math.round(totals.reduce(function (a, b) { return a + b; }, 0) / totals.length) : null,
      fairwayPct: Math.round(fw / set.length * 100),
      playablePct: Math.round(playable / set.length * 100),
    });
  }
  const leftMisses = allShots.filter(function (sh) { return sh.result === "Light rough L" || sh.shape === "hook" || sh.shape === "pull"; }).length;
  const rightMisses = allShots.filter(function (sh) { return sh.result === "Light rough R" || sh.shape === "slice" || sh.shape === "push"; }).length;
  const shapeCounts = {};
  for (const sh of allShots) shapeCounts[sh.shape] = (shapeCounts[sh.shape] || 0) + 1;
  let topMiss = null;
  const misses = allShots.filter(function (sh) { return DRV_FAIRWAY_RESULTS.indexOf(sh.result) === -1; });
  if (misses.length > 0) {
    const c = {};
    for (const m of misses) c[m.result] = (c[m.result] || 0) + 1;
    topMiss = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0];
  }
  return { totalShots: allShots.length, sessions: sessions.length, clubStats, topMiss, shapeCounts, leftMisses, rightMisses };
}
