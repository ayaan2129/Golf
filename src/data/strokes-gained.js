// Strokes Gained computation against scratch-golfer benchmarks.
// Positive SG = strokes saved vs. benchmark; negative = strokes lost.
//
// Four categories:
//   OTT  (Off the Tee)     — tee shots on par 4s and 5s
//   APP  (Approach)        — shots from fairway/rough to the green
//   ARG  (Around the Green)— chips, pitches, bunker shots from < 50 yards
//   PUTT (Putting)         — all putts, using firstPuttDistance per hole
//
// Benchmarks are based on published scratch/amateur research tables.
// Tables use linear interpolation between anchor points.

// Expected putts to hole out from distance (feet) — scratch golfer
const PUTT_TABLE = [
  [1,1.00],[2,1.01],[3,1.06],[4,1.12],[5,1.17],[6,1.21],
  [7,1.25],[8,1.29],[9,1.32],[10,1.35],[12,1.41],[15,1.50],
  [20,1.58],[25,1.65],[30,1.72],[40,1.83],[50,1.91],[60,1.96],
  [80,2.01],[100,2.05],[200,2.10],
];

// Expected strokes to hole out from distance (yards) — scratch golfer, fairway
const SCORE_TABLE = [
  [5,2.10],[10,2.38],[15,2.45],[20,2.50],[30,2.60],[40,2.70],
  [50,2.80],[60,2.86],[75,2.92],[100,3.02],[125,3.12],
  [150,3.22],[175,3.33],[200,3.46],[225,3.58],[250,3.70],
  [275,3.83],[300,3.95],[350,4.20],[400,4.40],
];

// Additional strokes expected from a given lie vs. fairway
const LIE_PENALTY = {
  Fairway: 0, Tee: 0,
  Rough: 0.15, "Light Rough": 0.10, "Heavy Rough": 0.30,
  Bunker: 0.35, Sand: 0.35,
  Hardpan: 0.15,
};

function interp(table, x) {
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

export function expectedPutts(distFt) {
  const d = Number(distFt);
  if (!d || d <= 0) return null;
  return +interp(PUTT_TABLE, d).toFixed(3);
}

export function expectedScore(distYds, lie) {
  const d = Number(distYds);
  if (!d || d <= 0) return null;
  const base = interp(SCORE_TABLE, d);
  const penalty = LIE_PENALTY[lie] || 0;
  return +(base + penalty).toFixed(3);
}

// ── SG: Putting ───────────────────────────────────────────────────────────────
// For each hole with firstPuttDistance + actual putts:
//   SG_Putt = expectedPutts(firstPuttDistance) − actualPutts
export function computeSGPutting(round) {
  const holes = (round.fullData && round.fullData.holes) || {};
  let total = 0, n = 0;
  const byHole = {};
  for (const k in holes) {
    const h = holes[k];
    const dist = Number(h.firstPuttDistance);
    const putts = Number(h.putts != null ? h.putts : h.quickPutts);
    if (!dist || dist <= 0 || !putts || putts <= 0) continue;
    const baseline = expectedPutts(dist);
    if (baseline == null) continue;
    const sg = +(baseline - putts).toFixed(3);
    total += sg;
    n++;
    byHole[k] = { dist, putts, baseline, sg };
  }
  if (n < 3) return null;
  return { value: +total.toFixed(2), holes: n, byHole };
}

// ── SG: Approach ──────────────────────────────────────────────────────────────
// For each GIR hole: find the approach shot (last shot to reach green),
// use its distanceLeft as approach distance, result lie + firstPuttDistance as outcome.
//   SG_App = expectedScore(approachDist, lie) − 1 − expectedPutts(firstPuttDist)
export function computeSGApproach(round) {
  const holes = (round.fullData && round.fullData.holes) || {};
  let total = 0, n = 0;
  const byHole = {};
  for (const k in holes) {
    const h = holes[k];
    const proxFt = Number(h.firstPuttDistance);
    if (!proxFt || proxFt <= 0 || !Array.isArray(h.shots) || h.shots.length === 0) continue;
    const par = Number(h.par);
    if (!par) continue;
    // Find GIR approach shot: shot that resulted in "Green", taken by shot ≤ par-2
    const greenIdx = h.shots.findIndex(function (s) {
      return s.result === "Green" || s.result === "Holed";
    });
    if (greenIdx < 0 || greenIdx + 1 > par - 2) continue; // No GIR
    const approachShot = h.shots[greenIdx];
    // Approach distance = distanceLeft on that shot (yards from pin to pin, pre-shot)
    const approachDist = Number(approachShot.distanceLeft) || Number(approachShot.distanceHit);
    if (!approachDist || approachDist <= 0) continue;
    const lie = approachShot.lie || "Fairway";
    const beforeBaseline = expectedScore(approachDist, lie);
    const afterBaseline = expectedPutts(proxFt);
    if (beforeBaseline == null || afterBaseline == null) continue;
    const sg = +(beforeBaseline - 1 - afterBaseline).toFixed(3);
    total += sg;
    n++;
    byHole[k] = { approachDist, lie, proxFt, beforeBaseline, afterBaseline, sg };
  }
  if (n < 2) return null;
  return { value: +total.toFixed(2), holes: n, byHole };
}

// ── SG: Off the Tee ───────────────────────────────────────────────────────────
// For par 4s and 5s: compare expected score from hole distance vs.
// expected score from where the tee shot finished.
//   SG_OTT = expectedScore(holeDist, "Tee") − 1 − expectedScore(distLeft, resultLie)
export function computeSGOffTee(round) {
  const holes = (round.fullData && round.fullData.holes) || {};
  let total = 0, n = 0;
  const byHole = {};
  for (const k in holes) {
    const h = holes[k];
    const par = Number(h.par);
    if (par < 4) continue; // Only par 4s/5s
    if (!Array.isArray(h.shots) || h.shots.length === 0) continue;
    const tee = h.shots[0];
    if (!tee || tee.lie !== "Tee") continue;
    const holeDist = Number(h.distance);
    const distHit = Number(tee.distanceHit);
    if (!holeDist || holeDist <= 0 || !distHit || distHit <= 0) continue;
    const distLeft = Math.max(holeDist - distHit, 5);
    const result = tee.result || "Rough";
    let resultLie;
    if (result === "Fairway" || result === "On fairway") resultLie = "Fairway";
    else if (result === "Bunker") resultLie = "Bunker";
    else if (result === "Out of Bounds" || result === "Lost Ball" || result === "Water" || result === "Penalty") {
      // OB/Penalty: effectively -2 strokes gained (stroke + distance or penalty)
      total -= 2;
      n++;
      byHole[k] = { holeDist, distHit, result, sg: -2, ob: true };
      continue;
    }
    else resultLie = "Rough";
    const beforeBaseline = expectedScore(holeDist, "Tee");
    const afterBaseline = expectedScore(distLeft, resultLie);
    if (beforeBaseline == null || afterBaseline == null) continue;
    const sg = +(beforeBaseline - 1 - afterBaseline).toFixed(3);
    total += sg;
    n++;
    byHole[k] = { holeDist, distHit, distLeft, result, resultLie, beforeBaseline, afterBaseline, sg };
  }
  if (n < 2) return null;
  return { value: +total.toFixed(2), holes: n, byHole };
}

// ── SG: Around the Green ──────────────────────────────────────────────────────
// For missed-GIR situations where a chip/pitch reached the green:
//   SG_ARG = expectedScore(chipDist, lie) − 1 − expectedPutts(firstPuttDist)
export function computeSGAroundGreen(round) {
  const holes = (round.fullData && round.fullData.holes) || {};
  let total = 0, n = 0;
  const byHole = {};
  for (const k in holes) {
    const h = holes[k];
    const proxFt = Number(h.firstPuttDistance);
    if (!proxFt || proxFt <= 0 || !Array.isArray(h.shots) || h.shots.length === 0) continue;
    const par = Number(h.par);
    if (!par) continue;
    const greenIdx = h.shots.findIndex(function (s) {
      return s.result === "Green" || s.result === "Holed";
    });
    if (greenIdx < 0) continue;
    const isGIR = (greenIdx + 1) <= (par - 2);
    if (isGIR) continue; // GIR handled by Approach
    const chipShot = h.shots[greenIdx];
    const chipDist = Number(chipShot.distanceLeft) || Number(chipShot.distanceHit) || 0;
    if (chipDist <= 0 || chipDist > 80) continue; // Only short-game shots (< 80 yards)
    const lie = chipShot.lie || "Rough";
    const beforeBaseline = expectedScore(chipDist, lie);
    const afterBaseline = expectedPutts(proxFt);
    if (beforeBaseline == null || afterBaseline == null) continue;
    const sg = +(beforeBaseline - 1 - afterBaseline).toFixed(3);
    total += sg;
    n++;
    byHole[k] = { chipDist, lie, proxFt, sg };
  }
  if (n < 2) return null;
  return { value: +total.toFixed(2), holes: n, byHole };
}

// ── Full SG for a round ───────────────────────────────────────────────────────
export function computeFullSG(round) {
  return {
    putting: computeSGPutting(round),
    approach: computeSGApproach(round),
    offTee: computeSGOffTee(round),
    aroundGreen: computeSGAroundGreen(round),
  };
}

// ── Aggregate SG across multiple rounds ──────────────────────────────────────
export function aggregateSG(rounds) {
  const cats = { putting: [], approach: [], offTee: [], aroundGreen: [] };
  for (const r of rounds) {
    const sg = computeFullSG(r);
    for (const cat in cats) {
      if (sg[cat] && sg[cat].value != null) cats[cat].push(sg[cat].value);
    }
  }
  function avg(arr) {
    if (!arr.length) return null;
    return +(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length).toFixed(2);
  }
  const result = {};
  for (const cat in cats) {
    result[cat] = { avg: avg(cats[cat]), n: cats[cat].length, values: cats[cat] };
  }
  result.total = {
    avg: (result.putting.avg != null || result.approach.avg != null || result.offTee.avg != null || result.aroundGreen.avg != null)
      ? +([result.putting.avg, result.approach.avg, result.offTee.avg, result.aroundGreen.avg]
          .filter(function (v) { return v != null; })
          .reduce(function (a, b) { return a + b; }, 0)).toFixed(2)
      : null,
  };
  return result;
}

// ── Rolling trends ────────────────────────────────────────────────────────────
export function getTrends(rounds) {
  if (!rounds || rounds.length === 0) return null;

  function rollingAvg(arr, key, n) {
    const slice = arr.slice(-n)
      .map(function (r) { return r[key]; })
      .filter(function (v) { return typeof v === "number" && !isNaN(v); });
    if (!slice.length) return null;
    return +(slice.reduce(function (a, b) { return a + b; }, 0) / slice.length).toFixed(1);
  }
  function rollingPct(arr, key, n) {
    const slice = arr.slice(-n)
      .map(function (r) { return r[key]; })
      .filter(function (v) { return typeof v === "number" && !isNaN(v); });
    if (!slice.length) return null;
    return Math.round(slice.reduce(function (a, b) { return a + b; }, 0) / slice.length);
  }

  const metrics = [
    { key: "totalScore",    fn: rollingAvg, lowerBetter: true  },
    { key: "totalPutts",    fn: rollingAvg, lowerBetter: true  },
    { key: "fairwayPct",    fn: rollingPct, lowerBetter: false },
    { key: "girPct",        fn: rollingPct, lowerBetter: false },
    { key: "scramblePct",   fn: rollingPct, lowerBetter: false },
    { key: "totalPenalties",fn: rollingAvg, lowerBetter: true  },
  ];

  const trends = {};
  for (const m of metrics) {
    const last5  = m.fn(rounds, m.key, 5);
    const last10 = m.fn(rounds, m.key, 10);
    const last20 = m.fn(rounds, m.key, 20);
    let direction = "flat", delta = null;
    if (last5 != null && last10 != null) {
      delta = +(last5 - last10).toFixed(1);
      if (Math.abs(delta) < 0.5 && m.key.endsWith("Pct")) delta = last5 - last10;
      const improving = m.lowerBetter ? delta < 0 : delta > 0;
      const worsening = m.lowerBetter ? delta > 0 : delta < 0;
      direction = improving ? "improving" : worsening ? "declining" : "flat";
    }
    trends[m.key] = { last5, last10, last20, direction, delta, lowerBetter: m.lowerBetter };
  }
  return trends;
}

// ── Scoring response: how player performs after a mistake ─────────────────────
export function getScoringResponse(rounds) {
  const afterBogey = [], afterDouble = [];
  for (const r of rounds) {
    const holes = (r.fullData && r.fullData.holes) || {};
    const keys = Object.keys(holes).map(Number).filter(function (n) { return !isNaN(n); }).sort(function (a, b) { return a - b; });
    for (let i = 0; i < keys.length - 1; i++) {
      const cur  = holes[keys[i]];
      const next = holes[keys[i + 1]];
      const curPar   = Number(cur.par),  curScore  = Number(cur.score  || cur.quickScore);
      const nextPar  = Number(next.par), nextScore = Number(next.score || next.quickScore);
      if (!curPar || !curScore || !nextPar || !nextScore) continue;
      const curVsPar  = curScore  - curPar;
      const nextVsPar = nextScore - nextPar;
      if (curVsPar === 1) afterBogey.push(nextVsPar);
      if (curVsPar >= 2)  afterDouble.push(nextVsPar);
    }
  }
  function avg(arr) {
    if (!arr.length) return null;
    return +(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length).toFixed(2);
  }
  return {
    afterBogey:  { n: afterBogey.length,  avgVsPar: avg(afterBogey)  },
    afterDouble: { n: afterDouble.length, avgVsPar: avg(afterDouble) },
  };
}
