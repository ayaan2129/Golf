// Round history + upcoming-round storage. All localStorage access goes through
// the namespaced patched API installed in src/core/storage.js, so each
// account's rounds stay isolated.

export function getHistory() {
  try { return JSON.parse(localStorage.getItem("roundHistory") || "[]"); }
  catch (e) { return []; }
}

export function saveHistory(arr) {
  localStorage.setItem("roundHistory", JSON.stringify(arr));
}

export function getUpcoming() {
  try { return JSON.parse(localStorage.getItem("upcomingRounds") || "[]"); }
  catch (e) { return []; }
}

export function saveUpcoming(arr) {
  localStorage.setItem("upcomingRounds", JSON.stringify(arr));
}

// ---------------- Coach-style analytics ----------------
// Personal Strokes Gained Lite — compare a round vs the player's rolling
// average. Positive = you saved strokes today, negative = you lost them.
export function getStrokesGainedLite(round, history) {
  if (!round) return null;
  const others = (history || []).filter(function (r) { return r !== round && r.totalScore > 0; }).slice(-5);
  if (others.length < 2) return null;
  function avg(arr, key) {
    const v = arr.map(function (r) { return r[key]; }).filter(function (x) { return typeof x === "number" && !isNaN(x); });
    if (v.length === 0) return null;
    return v.reduce(function (a, b) { return a + b; }, 0) / v.length;
  }
  const avgPutts = avg(others, "totalPutts");
  const avgScore = avg(others, "totalScore");
  const avgPens = avg(others, "totalPenalties");
  return {
    sampleN: others.length,
    putts: avgPutts != null && round.totalPutts != null ? +(avgPutts - round.totalPutts).toFixed(1) : null,   // + = saved putts today
    score: avgScore != null && round.totalScore != null ? +(avgScore - round.totalScore).toFixed(1) : null,
    penalties: avgPens != null && round.totalPenalties != null ? +(avgPens - round.totalPenalties).toFixed(1) : null,
  };
}

// Pick the player's hottest club from recent practice + rounds.
// "Hot" = highest on-target / fairway / pure-strike rate AND enough attempts.
export function getConfidenceClub(ironInsights, driverInsights) {
  const candidates = [];
  if (ironInsights && ironInsights.clubStats) {
    for (const cs of ironInsights.clubStats) {
      if (cs.count >= 5) candidates.push({ club: cs.club, score: cs.onTargetPct, count: cs.count, why: cs.onTargetPct + "% on target (" + cs.count + ")" });
    }
  }
  if (driverInsights && driverInsights.clubStats) {
    for (const cs of driverInsights.clubStats) {
      if (cs.count >= 5) candidates.push({ club: cs.club, score: cs.fairwayPct, count: cs.count, why: cs.fairwayPct + "% fairways (" + cs.count + ")" });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort(function (a, b) { return b.score - a.score; });
  return candidates[0];
}

// Top miss tendency across recent rounds — what the AI / Home card should
// flag as "Today's Avoid".
export function getTopAvoid(rounds) {
  const recent = rounds.slice(-5);
  const tendencies = {};
  for (const r of recent) {
    const holes = (r.fullData && r.fullData.holes) || {};
    for (const k in holes) {
      const h = holes[k];
      if (!Array.isArray(h.shots) || h.shots.length === 0) continue;
      // Tee miss
      const tee = h.shots[0];
      if (tee && tee.lie === "Tee" && tee.result && tee.result !== "Fairway" && tee.result !== "On fairway" && tee.result !== "Green") {
        const key = "tee_" + (tee.direction || "miss") + "_" + (tee.club || "driver");
        tendencies[key] = tendencies[key] || { count: 0, label: tee.club + " missing " + (tee.direction || "off line") + " off the tee" };
        tendencies[key].count++;
      }
      // Approach miss direction
      for (let i = 1; i < h.shots.length; i++) {
        const s = h.shots[i];
        if (s.direction && (s.direction === "Long" || s.direction === "Short" || s.direction === "Left" || s.direction === "Right") && s.result !== "Green" && s.result !== "Holed") {
          const key = "appr_" + s.direction + "_" + (s.club || "iron");
          tendencies[key] = tendencies[key] || { count: 0, label: (s.club || "iron") + " missing " + s.direction.toLowerCase() + " into greens" };
          tendencies[key].count++;
        }
      }
    }
  }
  const sorted = Object.keys(tendencies).sort(function (a, b) { return tendencies[b].count - tendencies[a].count; });
  if (sorted.length === 0 || tendencies[sorted[0]].count < 2) return null;
  const top = tendencies[sorted[0]];
  return { label: top.label, count: top.count };
}

// Scoring-zone analysis — bogey-save % and birdie-conversion + 3-putt count.
export function getScoringZone(rounds) {
  let bogeySaveAttempts = 0, bogeySaves = 0;
  let birdieAttempts = 0, birdiesMade = 0;
  let threePutts = 0, scorableHoles = 0;
  for (const r of rounds) {
    const holes = (r.fullData && r.fullData.holes) || {};
    for (const k in holes) {
      const h = holes[k];
      const par = Number(h.par) || 0;
      const score = Number(h.score) || 0;
      const putts = h.putts != null ? Number(h.putts) : null;
      if (!par || !score) continue;
      scorableHoles++;
      // Bogey-save attempt: missed GIR (score > par - 2 by approach) — proxy: if shots[0..par-3] not on green
      const greenIdx = (h.shots || []).findIndex(function (s) { return s.result === "Green" || s.result === "On green" || s.result === "Holed"; });
      const missedGIR = greenIdx === -1 || (greenIdx + 1) > (par - 2);
      if (missedGIR && score > 0) {
        bogeySaveAttempts++;
        if (score <= par + 1) bogeySaves++;
      }
      // Birdie attempt: GIR + close first putt (within 15 ft proxy: firstPuttDistance ≤ 15 OR not specified but GIR)
      if (!missedGIR) {
        birdieAttempts++;
        if (score <= par - 1) birdiesMade++;
      }
      // 3-putt
      if (putts >= 3) threePutts++;
    }
  }
  return {
    holes: scorableHoles,
    bogeySavePct: bogeySaveAttempts > 0 ? Math.round(bogeySaves / bogeySaveAttempts * 100) : null,
    bogeySaves, bogeySaveAttempts,
    birdieConversionPct: birdieAttempts > 0 ? Math.round(birdiesMade / birdieAttempts * 100) : null,
    birdiesMade, birdieAttempts,
    threePutts,
    threePuttPct: scorableHoles > 0 ? Math.round(threePutts / scorableHoles * 100) : null,
  };
}

// Practice → game transfer: correlate practice days last week with recent round results.
export function getPracticeTransfer(history, practiceActivity) {
  if (!practiceActivity || practiceActivity.daysPractised == null) return null;
  const recentDays = practiceActivity.windowDays || 7;
  const now = new Date();
  const cutoff = new Date(now.getTime() - recentDays * 24 * 3600 * 1000);
  const priorCutoff = new Date(now.getTime() - (recentDays * 2) * 24 * 3600 * 1000);
  const recentRounds = history.filter(function (r) { return r.date && new Date(r.date) >= cutoff; });
  const priorRounds = history.filter(function (r) {
    if (!r.date) return false;
    const d = new Date(r.date);
    return d >= priorCutoff && d < cutoff;
  });
  function avg(arr, key) {
    const v = arr.map(function (r) { return r[key]; }).filter(function (x) { return typeof x === "number" && !isNaN(x); });
    if (v.length === 0) return null;
    return v.reduce(function (a, b) { return a + b; }, 0) / v.length;
  }
  return {
    practiceDays: practiceActivity.daysPractised,
    practiceShots: practiceActivity.totalShots,
    windowDays: recentDays,
    recentRoundsN: recentRounds.length,
    avgPuttsRecent: avg(recentRounds, "totalPutts"),
    avgPuttsPrior: avg(priorRounds, "totalPutts"),
    avgScoreRecent: avg(recentRounds, "totalScore"),
    avgScorePrior: avg(priorRounds, "totalScore"),
  };
}

// Per-club approach proximity — avg distanceLeft after each approach shot.
export function getApproachProximity(rounds) {
  const byClub = {};
  for (const r of rounds) {
    const holes = (r.fullData && r.fullData.holes) || {};
    for (const k in holes) {
      const h = holes[k];
      if (!Array.isArray(h.shots)) continue;
      for (let i = 1; i < h.shots.length; i++) {
        const s = h.shots[i];
        const left = Number(s.distanceLeft);
        const club = s.club;
        if (!club || isNaN(left) || left <= 0) continue;
        if (!byClub[club]) byClub[club] = { sum: 0, n: 0, min: left, max: left };
        byClub[club].sum += left;
        byClub[club].n++;
        if (left < byClub[club].min) byClub[club].min = left;
        if (left > byClub[club].max) byClub[club].max = left;
      }
    }
  }
  return Object.keys(byClub).map(function (c) {
    const b = byClub[c];
    return { club: c, count: b.n, avgLeft: Math.round(b.sum / b.n), min: b.min, max: b.max };
  }).sort(function (a, b) { return b.count - a.count; });
}
