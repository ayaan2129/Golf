// Stats redesign: Categories grid + Filters sheet + per-category deep-dive
// sheets (Scoring + Putting fully built; others stubbed pending Phase 3/4
// of the stats redesign).
//
// Filter state is module-scope and persists to localStorage so the user's
// Last 5 / Last 20 / Year / Custom selection sticks across visits.

import { COURSES } from "../core/courses.js";
import { getHistory, getScoringZone, getPracticeTransfer, getApproachProximity } from "../data/rounds.js";
import { getPuttingInsights, getPracticeActivity } from "../data/practice.js";
import { aggregateSG, getTrends, getScoringResponse, computeFullSG } from "../data/strokes-gained.js";

const categoriesFilter = {
  range: "last20",  // last5 | last20 | year | all | custom
  holes: "all",     // 18 | 9 | all
  course: "",
  from: "",
  to: "",
  timeBlock: "all", // all | morning | afternoon | evening
};

// Time-of-day matcher. Rounds with a timeBlock field (added in PR #5) use it
// directly; older rounds derive from teeOffTime ("HH:MM" 24-h) or are kept
// for "all" only.
function roundMatchesTimeBlock(r, want) {
  if (want === "all") return true;
  const tb = (r.timeBlock || "").toLowerCase();
  if (tb) {
    if (want === "morning") return tb === "morning";
    if (want === "afternoon") return tb === "afternoon" || tb === "late afternoon";
    if (want === "evening") return tb === "evening";
    return false;
  }
  if (!r.teeOffTime) return false;
  const h = parseInt(String(r.teeOffTime).split(":")[0], 10);
  if (isNaN(h)) return false;
  if (want === "morning") return h < 11;
  if (want === "afternoon") return h >= 11 && h < 17;
  if (want === "evening") return h >= 17;
  return false;
}

function loadCategoriesFilter() {
  try {
    const saved = JSON.parse(localStorage.getItem("categoriesFilter") || "{}");
    Object.assign(categoriesFilter, saved);
  } catch (e) {}
}

function saveCategoriesFilter() {
  localStorage.setItem("categoriesFilter", JSON.stringify(categoriesFilter));
}

function getFilteredRounds() {
  const all = getHistory().slice().sort(function (a, b) {
    return (b.savedAt || b.date || "").localeCompare(a.savedAt || a.date || "");
  });
  let filtered = all;
  if (categoriesFilter.course) {
    filtered = filtered.filter(function (r) { return r.courseName === categoriesFilter.course; });
  }
  if (categoriesFilter.holes === "18") {
    filtered = filtered.filter(function (r) { return (r.holes || 18) >= 18; });
  } else if (categoriesFilter.holes === "9") {
    filtered = filtered.filter(function (r) { return (r.holes || 18) < 18; });
  }
  if (categoriesFilter.timeBlock && categoriesFilter.timeBlock !== "all") {
    filtered = filtered.filter(function (r) { return roundMatchesTimeBlock(r, categoriesFilter.timeBlock); });
  }
  if (categoriesFilter.range === "last5") filtered = filtered.slice(0, 5);
  else if (categoriesFilter.range === "last20") filtered = filtered.slice(0, 20);
  else if (categoriesFilter.range === "year") {
    const y = new Date().getFullYear();
    filtered = filtered.filter(function (r) { return (r.date || "").slice(0, 4) === String(y); });
  } else if (categoriesFilter.range === "custom") {
    if (categoriesFilter.from) filtered = filtered.filter(function (r) { return (r.date || "") >= categoriesFilter.from; });
    if (categoriesFilter.to) filtered = filtered.filter(function (r) { return (r.date || "") <= categoriesFilter.to; });
  }
  return filtered;
}

export function renderCategoriesGrid() {
  const rounds = getFilteredRounds();
  const setText = function (id, val) { const el = document.getElementById(id); if (el) el.textContent = val; };

  if (rounds.length === 0) {
    setText("catScoringNum", "—");
    setText("catFairwaysNum", "—");
    setText("catGreensNum", "—");
    setText("catUpDownsNum", "—");
    setText("catSandSavesNum", "—");
    setText("catPuttingNum", "—");
    setText("catPenaltiesNum", "—");
  } else {
    const avg = function (arr, key) {
      const vals = arr.map(function (r) { return r[key]; }).filter(function (v) { return v != null && !isNaN(v); });
      return vals.length === 0 ? null : vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    };
    const avgScore = avg(rounds, "totalScore");
    const avgFW = avg(rounds, "fairwayPct");
    const avgGIR = avg(rounds, "girPct");
    const avgScramble = avg(rounds, "scramblePct");
    const avgPutts = avg(rounds, "totalPutts");
    const totalPens = rounds.reduce(function (s, r) { return s + (r.totalPenalties || 0); }, 0);

    setText("catScoringNum", avgScore != null ? avgScore.toFixed(1) : "—");
    setText("catFairwaysNum", avgFW != null ? Math.round(avgFW) + "%" : "—");
    setText("catGreensNum", avgGIR != null ? Math.round(avgGIR) + "%" : "—");
    setText("catUpDownsNum", avgScramble != null ? Math.round(avgScramble) + "%" : "—");
    setText("catSandSavesNum", "—");
    setText("catPuttingNum", avgPutts != null ? avgPutts.toFixed(1) : "—");
    setText("catPenaltiesNum", String(totalPens));

    // SG tile: show best/worst category
    const sg = aggregateSG(rounds);
    const sgCats = [
      { label: "OTT", val: sg.offTee.avg },
      { label: "App", val: sg.approach.avg },
      { label: "ARG", val: sg.aroundGreen.avg },
      { label: "Putt", val: sg.putting.avg },
    ].filter(function (c) { return c.val != null; });
    if (sgCats.length > 0) {
      const worst = sgCats.reduce(function (a, b) { return a.val < b.val ? a : b; });
      setText("catSGNum", worst.label + " " + (worst.val >= 0 ? "+" : "") + worst.val);
    } else {
      setText("catSGNum", "no data");
    }

    // Trends tile: show number of metrics improving
    const history = getHistory();
    const trends = getTrends(history);
    if (trends) {
      const improving = Object.values(trends).filter(function (t) { return t.direction === "improving"; }).length;
      const declining = Object.values(trends).filter(function (t) { return t.direction === "declining"; }).length;
      setText("catTrendsNum", improving + " ↑ " + declining + " ↓");
    } else {
      setText("catTrendsNum", "—");
    }
  }

  document.querySelectorAll(".cat-filter-pill").forEach(function (p) {
    p.classList.toggle("active", p.dataset.range === categoriesFilter.range);
  });

  const courseLabel = categoriesFilter.course || "All courses";
  const holesLabel = categoriesFilter.holes === "all" ? "18 + 9 holes" : categoriesFilter.holes + " holes only";
  const rangeLabel = ({ last5: "Last 5", last20: "Last 20", year: "This Year", all: "All time", custom: "Custom range" })[categoriesFilter.range];
  const timeLabel = categoriesFilter.timeBlock && categoriesFilter.timeBlock !== "all" ? " · " + categoriesFilter.timeBlock + " only" : "";
  const summaryEl = document.getElementById("categoriesFilterSummary");
  if (summaryEl) summaryEl.textContent = courseLabel + " · " + holesLabel + " · " + rangeLabel + timeLabel + " (" + rounds.length + " rounds)";
}

function openDeepDive(cat) {
  const modal = document.getElementById("categoryDeepDive");
  const title = document.getElementById("deepdiveTitle");
  const scope = document.getElementById("deepdiveScope");
  const body = document.getElementById("deepdiveBody");
  if (!modal || !body) return;

  const titles = {
    scoring: "Scoring", fairways: "Fairways", greens: "Greens",
    updowns: "Up & Downs", sandsaves: "Sand Saves",
    putting: "Putting", penalties: "Penalties",
    strokesgained: "Strokes Gained", trends: "Trends",
  };
  title.textContent = titles[cat] || "—";
  const rangeLabel = ({ last5: "Last 5", last20: "Last 20", year: "This Year", all: "All", custom: "Custom" })[categoriesFilter.range];
  scope.textContent = rangeLabel;

  body.innerHTML = "";
  const rounds = getFilteredRounds();
  if (cat === "scoring") renderScoringDeepDive(body, rounds);
  else if (cat === "putting") renderPuttingDeepDive(body, rounds);
  else if (cat === "fairways") renderFairwaysDeepDive(body, rounds);
  else if (cat === "greens") renderGreensDeepDive(body, rounds);
  else if (cat === "updowns") renderUpDownsDeepDive(body, rounds);
  else if (cat === "sandsaves") renderSandSavesDeepDive(body, rounds);
  else if (cat === "penalties") renderPenaltiesDeepDive(body, rounds);
  else if (cat === "strokesgained") renderSGDeepDive(body, rounds);
  else if (cat === "trends") renderTrendsDeepDive(body, rounds);
  else body.innerHTML = '<p style="text-align:center; padding:30px 10px; color:var(--muted);">Deep-dive for <strong>' + titles[cat] + '</strong> is coming next.</p>';
  modal.style.display = "flex";
}

function closeDeepDive() {
  const modal = document.getElementById("categoryDeepDive");
  if (modal) modal.style.display = "none";
}

function renderScoringDeepDive(body, rounds) {
  if (rounds.length === 0) {
    body.innerHTML = '<p style="text-align:center; padding:30px 10px; color:var(--muted);">No rounds in this filter yet. Save a round first.</p>';
    return;
  }
  const scores = rounds.map(function (r) { return r.totalScore; }).filter(function (s) { return s > 0; });
  const avg = scores.length ? scores.reduce(function (a, b) { return a + b; }, 0) / scores.length : null;
  const seasonRounds = rounds.filter(function (r) { return (r.date || "").slice(0, 4) === String(new Date().getFullYear()); });
  const seasonBest = seasonRounds.length ? Math.min.apply(null, seasonRounds.map(function (r) { return r.totalScore; }).filter(Boolean)) : null;
  const allTimeBest = getHistory().length ? Math.min.apply(null, getHistory().map(function (r) { return r.totalScore; }).filter(Boolean)) : null;
  const avgVsPar = rounds.length ? rounds.reduce(function (s, r) { return s + (r.scoreVsPar || 0); }, 0) / rounds.length : null;

  const counts = { birdie: 0, par: 0, bogey: 0, dbogey: 0, worse: 0 };
  let holeTotal = 0;
  const perPar = { 3: { sum: 0, n: 0 }, 4: { sum: 0, n: 0 }, 5: { sum: 0, n: 0 } };
  for (const r of rounds) {
    const holesRaw = (r.fullData && r.fullData.holes) || r.activeHoles || [];
    const holes = Array.isArray(holesRaw) ? holesRaw : Object.values(holesRaw);
    for (const h of holes) {
      const par = h.par || 0;
      const score = h.score || 0;
      if (!par || !score) continue;
      holeTotal++;
      if (perPar[par]) { perPar[par].sum += score; perPar[par].n++; }
      const diff = score - par;
      if (diff <= -1) counts.birdie++;
      else if (diff === 0) counts.par++;
      else if (diff === 1) counts.bogey++;
      else if (diff === 2) counts.dbogey++;
      else counts.worse++;
    }
  }

  const distConfig = [
    { key: "birdie", lbl: "Birdie", col: "#c62828" },
    { key: "par",    lbl: "Par",    col: "#2faf3e" },
    { key: "bogey",  lbl: "Bogey",  col: "#42a5f5" },
    { key: "dbogey", lbl: "D.Bogey", col: "#1565c0" },
    { key: "worse",  lbl: "Worse",  col: "#0d47a1" },
  ];

  let html = '';
  html += '<div class="dd-row">';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">Rounds</div><div class="dd-stat-num">' + rounds.length + '</div></div>';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">Average Shots</div><div class="dd-stat-num">' + (avg != null ? avg.toFixed(1) : "—") + '</div></div>';
  html += '</div>';
  html += '<div class="dd-row">';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">Season Best</div><div class="dd-stat-num">' + (seasonBest != null ? seasonBest : "—") + '</div></div>';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">All-Time Best</div><div class="dd-stat-num">' + (allTimeBest != null ? allTimeBest : "—") + '</div></div>';
  html += '</div>';

  if (holeTotal > 0) {
    html += '<div class="dd-section-title">Hole Distribution</div>';
    html += '<div class="dd-dist-row">';
    for (const d of distConfig) {
      const c = counts[d.key];
      const pct = Math.round(c / holeTotal * 100);
      const heightPct = Math.max(4, Math.round(c / Math.max.apply(null, Object.values(counts)) * 100));
      html += '<div class="dd-dist-col">';
      html += '  <div class="dd-dist-pct">' + pct + '%</div>';
      html += '  <div class="dd-dist-bar" style="height:' + heightPct + '%; background:' + d.col + ';"></div>';
      html += '  <div class="dd-dist-lbl">' + d.lbl + '</div>';
      html += '  <div class="dd-dist-count">' + c + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }

  html += '<div class="dd-section-title">Average to Par</div>';
  html += '<div style="text-align:center; font-size:32px; font-weight:800; color:' + (avgVsPar > 0 ? 'var(--crimson)' : 'var(--green-deep)') + '; margin-bottom:10px;">' + (avgVsPar != null ? (avgVsPar > 0 ? "+" : "") + avgVsPar.toFixed(2) : "—") + '</div>';

  if (perPar[3].n + perPar[4].n + perPar[5].n > 0) {
    html += '<div class="dd-section-title">Average Per Hole</div>';
    for (const p of [3, 4, 5]) {
      const pp = perPar[p];
      const a = pp.n > 0 ? pp.sum / pp.n : null;
      const diff = a != null ? a - p : null;
      const widthPct = diff != null ? Math.min(100, Math.abs(diff) / 2 * 100) : 0;
      html += '<div class="dd-vs-par-row">';
      html += '  <div class="dd-vs-par-lbl">PAR ' + p + '</div>';
      html += '  <div class="dd-vs-par-bar-wrap"><div class="dd-vs-par-bar" style="width:' + widthPct + '%; left:50%;"></div></div>';
      html += '  <div class="dd-vs-par-val">' + (diff != null ? (diff > 0 ? "+" : "") + diff.toFixed(2) : "—") + '</div>';
      html += '</div>';
    }
  }

  // Scoring zone: bogey-save / birdie-conversion / 3-putts
  const zone = getScoringZone(rounds);
  if (zone.holes > 0) {
    html += '<div class="dd-section-title">Scoring Zone</div>';
    html += '<div class="dd-row">';
    html += '  <div class="dd-stat" style="background:rgba(47,175,62,0.1);"><div class="dd-stat-lbl">Bogey-save %</div><div class="dd-stat-num">' + (zone.bogeySavePct != null ? zone.bogeySavePct + "%" : "—") + '</div><div style="font-size:11px; color:var(--muted);">' + zone.bogeySaves + '/' + zone.bogeySaveAttempts + ' missed-green holes</div></div>';
    html += '  <div class="dd-stat" style="background:rgba(240,179,35,0.12);"><div class="dd-stat-lbl">Birdie %</div><div class="dd-stat-num">' + (zone.birdieConversionPct != null ? zone.birdieConversionPct + "%" : "—") + '</div><div style="font-size:11px; color:var(--muted);">' + zone.birdiesMade + '/' + zone.birdieAttempts + ' GIR holes</div></div>';
    html += '</div>';
    html += '<div class="dd-stat" style="background:rgba(198,40,40,0.08); margin-top:8px;"><div class="dd-stat-lbl">3-putts</div><div class="dd-stat-num">' + zone.threePutts + '</div><div style="font-size:11px; color:var(--muted);">' + (zone.threePuttPct != null ? zone.threePuttPct + "% of holes" : "") + '</div></div>';
  }

  body.innerHTML = html;
}

function renderPuttingDeepDive(body, rounds) {
  const practice = getPuttingInsights();
  if (rounds.length === 0 && (!practice || practice.totalShots === 0)) {
    body.innerHTML = '<p style="text-align:center; padding:30px 10px; color:var(--muted);">No round or practice data in this filter yet.</p>';
    return;
  }

  const totalPuttsArr = rounds.map(function (r) { return r.totalPutts; }).filter(function (v) { return v != null && !isNaN(v); });
  const avgPutts = totalPuttsArr.length ? totalPuttsArr.reduce(function (a, b) { return a + b; }, 0) / totalPuttsArr.length : null;

  const puttBuckets = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  let totalHoles = 0;
  const perPar = { 3: { sum: 0, n: 0 }, 4: { sum: 0, n: 0 }, 5: { sum: 0, n: 0 } };
  const girPutts = { sum: 0, n: 0 };
  const nonGirPutts = { sum: 0, n: 0 };
  const distanceBuckets = [
    { lbl: "<1m", min: 0, max: 3.3 },
    { lbl: "1-2m", min: 3.3, max: 6.6 },
    { lbl: "2-4m", min: 6.6, max: 13 },
    { lbl: "4-8m", min: 13, max: 26 },
    { lbl: "+", min: 26, max: 9999 },
  ];
  const distData = distanceBuckets.map(function (b) { return { lbl: b.lbl, total: 0, oneputt: 0, girTotal: 0, girOneputt: 0, nonGirTotal: 0, nonGirOneputt: 0 }; });

  for (const r of rounds) {
    const holesRaw = (r.fullData && r.fullData.holes) || r.activeHoles || [];
    const holes = Array.isArray(holesRaw) ? holesRaw : Object.values(holesRaw);
    for (const h of holes) {
      const putts = h.putts != null ? h.putts : null;
      if (putts == null) continue;
      totalHoles++;
      const key = putts >= 4 ? 4 : putts;
      puttBuckets[key] = (puttBuckets[key] || 0) + 1;
      if (perPar[h.par]) { perPar[h.par].sum += putts; perPar[h.par].n++; }
      if (h.gir) { girPutts.sum += putts; girPutts.n++; }
      else { nonGirPutts.sum += putts; nonGirPutts.n++; }
      const fpd = parseFloat(h.firstPuttDistance);
      if (fpd > 0) {
        const oneputt = (h.firstPuttResult === "Holed");
        for (let i = 0; i < distanceBuckets.length; i++) {
          const meta = distanceBuckets[i];
          if (fpd >= meta.min && fpd < meta.max) {
            distData[i].total++; if (oneputt) distData[i].oneputt++;
            if (h.gir) { distData[i].girTotal++; if (oneputt) distData[i].girOneputt++; }
            else { distData[i].nonGirTotal++; if (oneputt) distData[i].nonGirOneputt++; }
            break;
          }
        }
      }
    }
  }

  let html = "";
  html += '<div class="dd-row">';
  if (rounds.length === 0) {
    // No rounds — show practice-derived stats so the panel isn't a row of dashes.
    const practiceMake = practice && practice.distanceRates ? practice.distanceRates.reduce(function (acc, b) { acc.n += b.count; if (b.pct != null) acc.weighted += b.pct * b.count; return acc; }, { n: 0, weighted: 0 }) : null;
    const overallPct = practiceMake && practiceMake.n > 0 ? Math.round(practiceMake.weighted / practiceMake.n) : null;
    html += '  <div class="dd-stat"><div class="dd-stat-lbl">Putts logged</div><div class="dd-stat-num">' + (practice ? practice.totalShots : 0) + '</div></div>';
    html += '  <div class="dd-stat"><div class="dd-stat-lbl">Make rate</div><div class="dd-stat-num">' + (overallPct != null ? overallPct + "%" : "—") + '</div></div>';
  } else {
    html += '  <div class="dd-stat"><div class="dd-stat-lbl">Putts/Round</div><div class="dd-stat-num">' + (avgPutts != null ? avgPutts.toFixed(1) : "—") + '</div></div>';
    const ppHoleVal = totalHoles > 0 ? (rounds.reduce(function (s, r) { return s + (r.totalPutts || 0); }, 0) / totalHoles).toFixed(2) : "—";
    html += '  <div class="dd-stat"><div class="dd-stat-lbl">Putts/Hole</div><div class="dd-stat-num">' + ppHoleVal + '</div></div>';
  }
  html += '</div>';

  if (totalHoles > 0) {
    html += '<div class="dd-section-title">Putts Per Hole Distribution</div>';
    html += renderPuttsDonut(puttBuckets, totalHoles, avgPutts);
    html += '<div class="putt-dist-legend">';
    const legend = [
      { key: 0, lbl: "0 putts", col: "#1b5e20" },
      { key: 1, lbl: "1 putt",  col: "#2faf3e" },
      { key: 2, lbl: "2 putts", col: "#a5d6a7" },
      { key: 3, lbl: "3 putts", col: "#ef9a9a" },
      { key: 4, lbl: "3+ putts", col: "#c62828" },
    ];
    for (const l of legend) {
      const c = puttBuckets[l.key] || 0;
      const pct = Math.round(c / totalHoles * 100);
      html += '<div class="putt-dist-chip"><span class="putt-dist-dot" style="background:' + l.col + ';"></span>' + l.lbl + ' · ' + pct + '% (' + c + ')</div>';
    }
    html += '</div>';
  }

  if (perPar[3].n + perPar[4].n + perPar[5].n > 0) {
    html += '<div class="dd-section-title">Average Per Hole · By Par</div>';
    for (const p of [3, 4, 5]) {
      const pp = perPar[p];
      const a = pp.n > 0 ? pp.sum / pp.n : null;
      const widthPct = a != null ? Math.min(100, (a / 3) * 100) : 0;
      html += '<div class="dd-vs-par-row">';
      html += '  <div class="dd-vs-par-lbl">PAR ' + p + '</div>';
      html += '  <div class="dd-vs-par-bar-wrap"><div class="dd-vs-par-bar" style="width:' + widthPct + '%; left:0; background:var(--green-bright);"></div></div>';
      html += '  <div class="dd-vs-par-val">' + (a != null ? a.toFixed(2) : "—") + '</div>';
      html += '</div>';
    }
  }

  if (girPutts.n + nonGirPutts.n > 0) {
    html += '<div class="dd-section-title">Putts Per Hole · GIR Split</div>';
    html += '<div class="dd-row">';
    const girAvg = girPutts.n ? (girPutts.sum / girPutts.n).toFixed(2) : "—";
    const nonGirAvg = nonGirPutts.n ? (nonGirPutts.sum / nonGirPutts.n).toFixed(2) : "—";
    html += '  <div class="dd-stat" style="background:rgba(47,175,62,0.1);"><div class="dd-stat-lbl">Green Hit</div><div class="dd-stat-num">' + girAvg + '</div><div style="font-size:11px; color:var(--muted);">' + girPutts.n + ' holes</div></div>';
    html += '  <div class="dd-stat" style="background:rgba(198,40,40,0.08);"><div class="dd-stat-lbl">Green Missed</div><div class="dd-stat-num">' + nonGirAvg + '</div><div style="font-size:11px; color:var(--muted);">' + nonGirPutts.n + ' holes</div></div>';
    html += '</div>';
  }

  if (practice && practice.totalShots > 0) {
    const mapping = [
      { from: "0-3 ft",   to: "<1m"  },
      { from: "3-5 ft",   to: "1-2m" },
      { from: "5-10 ft",  to: "2-4m" },
      { from: "10-20 ft", to: "4-8m" },
      { from: "20+ ft",   to: "+"    },
    ];
    for (const m of mapping) {
      const p = practice.distanceRates.find(function (x) { return x.label === m.from; });
      if (!p || p.count === 0) continue;
      const idx = distData.findIndex(function (b) { return b.lbl === m.to; });
      if (idx === -1) continue;
      const made = Math.round((p.pct || 0) * p.count / 100);
      distData[idx].total += p.count;
      distData[idx].oneputt += made;
    }
  }

  if (distData.some(function (d) { return d.total > 0; })) {
    html += '<div class="dd-section-title">Putting Distances · One-putt %</div>';
    html += '<p style="font-size:11px; color:var(--muted); margin:0 0 10px;">Merged from rounds (first-putt distance) + practice putting drills.</p>';
    html += renderPuttDistanceRadial(distData);

    if (distData.some(function (d) { return d.girTotal + d.nonGirTotal > 0; })) {
      html += '<div class="dd-row" style="margin-top:14px;">';
      html += '  <div><div class="dd-stat-lbl" style="text-align:left; margin-bottom:6px;">Green Hit</div>';
      for (const d of distData) {
        const pct = d.girTotal > 0 ? Math.round(d.girOneputt / d.girTotal * 100) + "%" : "—";
        html += '<div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0; border-bottom:1px solid var(--border);"><span>' + d.lbl + '</span><span style="font-weight:700;">' + pct + '</span></div>';
      }
      html += '</div>';
      html += '  <div><div class="dd-stat-lbl" style="text-align:left; margin-bottom:6px;">Green Miss</div>';
      for (const d of distData) {
        const pct = d.nonGirTotal > 0 ? Math.round(d.nonGirOneputt / d.nonGirTotal * 100) + "%" : "—";
        html += '<div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0; border-bottom:1px solid var(--border);"><span>' + d.lbl + '</span><span style="font-weight:700;">' + pct + '</span></div>';
      }
      html += '</div>';
      html += '</div>';
    }
  }

  body.innerHTML = html;
}

function renderPuttsDonut(buckets, totalHoles, avgPutts) {
  const segments = [
    { key: 0, col: "#1b5e20" },
    { key: 1, col: "#2faf3e" },
    { key: 2, col: "#a5d6a7" },
    { key: 3, col: "#ef9a9a" },
    { key: 4, col: "#c62828" },
  ];
  const cx = 100, cy = 100, r = 70, stroke = 22;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  let arcs = '';
  for (const seg of segments) {
    const count = buckets[seg.key] || 0;
    const frac = count / totalHoles;
    if (frac === 0) continue;
    const len = circ * frac;
    arcs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + seg.col + '" stroke-width="' + stroke + '" stroke-dasharray="' + len + ' ' + (circ - len) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" />';
    offset += len;
  }
  const centerLbl = avgPutts != null ? avgPutts.toFixed(1) : "—";
  return '<div style="display:flex; justify-content:center; padding:10px 0;">' +
         '<svg viewBox="0 0 200 200" width="180" height="180">' +
         '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#eee" stroke-width="' + stroke + '" />' +
         arcs +
         '<text x="100" y="98" text-anchor="middle" font-size="34" font-weight="800" fill="#0b3d0b">' + centerLbl + '</text>' +
         '<text x="100" y="118" text-anchor="middle" font-size="11" fill="#888">putts / round</text>' +
         '</svg></div>';
}

function renderPuttDistanceRadial(buckets) {
  const cx = 160, cy = 170, baseR = 24, ringStep = 22;
  const arr = buckets.map(function (b, i) {
    const pct = b.total > 0 ? Math.round(b.oneputt / b.total * 100) : null;
    const r = baseR + ringStep * (buckets.length - i - 1);
    const opacity = pct != null ? Math.max(0.18, Math.min(1, pct / 100 * 1.1)) : 0.05;
    return { lbl: b.lbl, total: b.total, pct: pct, r: r, opacity: opacity };
  });
  let rings = '';
  for (let i = 0; i < arr.length; i++) {
    const L = arr[i];
    rings += '<path d="M ' + (cx - L.r) + ' ' + cy + ' A ' + L.r + ' ' + L.r + ' 0 0 1 ' + (cx + L.r) + ' ' + cy + ' L ' + cx + ' ' + cy + ' Z" fill="#2faf3e" fill-opacity="' + L.opacity + '" stroke="white" stroke-width="2" />';
  }
  let topLabels = '';
  const slotWidth = 320 / arr.length;
  for (let i = 0; i < arr.length; i++) {
    const L = arr[i];
    const slotX = slotWidth * (i + 0.5);
    topLabels += '<text x="' + slotX + '" y="14" text-anchor="middle" font-size="11" font-weight="700" fill="#0b3d0b">' + L.lbl + '</text>';
    topLabels += '<text x="' + slotX + '" y="30" text-anchor="middle" font-size="13" font-weight="800" fill="#2faf3e">' + (L.pct != null ? L.pct + "%" : "—") + '</text>';
    topLabels += '<text x="' + slotX + '" y="44" text-anchor="middle" font-size="9" fill="#888">' + (L.total > 0 ? "n=" + L.total : "") + '</text>';
  }
  return '<div style="display:flex; justify-content:center; padding:10px 0;">' +
         '<svg viewBox="0 0 320 180" width="300" height="170">' +
         topLabels +
         rings +
         '</svg></div>';
}

// ---------- Fairways deep-dive: gauge + miss-side bias + score split + longest drive ----------
function renderFairwaysDeepDive(body, rounds) {
  if (rounds.length === 0) {
    body.innerHTML = '<p style="text-align:center; padding:30px 10px; color:var(--muted);">No rounds in this filter yet.</p>';
    return;
  }

  let fwHit = 0, fwAns = 0, missLeft = 0, missRight = 0;
  let scoreHitSum = 0, scoreHitN = 0, scoreMissSum = 0, scoreMissN = 0;
  let longestDrive = null;
  for (const r of rounds) {
    const holes = (r.fullData && r.fullData.holes) || {};
    for (const k in holes) {
      const h = holes[k];
      const par = Number(h.par) || 0;
      const score = Number(h.score) || 0;
      if (par < 4 || !Array.isArray(h.shots) || h.shots.length === 0) continue;
      const tee = h.shots[0];
      if (!tee || tee.lie !== "Tee") continue;
      const hit = tee.result === "Fairway" || tee.result === "On fairway";
      fwAns++;
      if (hit) {
        fwHit++;
        if (score > 0) { scoreHitSum += score; scoreHitN++; }
      } else {
        if (tee.direction === "Left") missLeft++;
        else if (tee.direction === "Right") missRight++;
        if (score > 0) { scoreMissSum += score; scoreMissN++; }
      }
      const dist = Number(tee.distanceHit);
      if (dist > 0 && (tee.club || "").toLowerCase().includes("driver")) {
        if (longestDrive == null || dist > longestDrive) longestDrive = dist;
      }
    }
  }
  const fwPct = fwAns > 0 ? Math.round(fwHit / fwAns * 100) : null;
  const scoreHitAvg = scoreHitN > 0 ? scoreHitSum / scoreHitN : null;
  const scoreMissAvg = scoreMissN > 0 ? scoreMissSum / scoreMissN : null;

  let html = "";
  html += '<div class="dd-row">';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">Fairway %</div><div class="dd-stat-num">' + (fwPct != null ? fwPct + "%" : "—") + '</div></div>';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">Holes</div><div class="dd-stat-num">' + fwHit + "/" + fwAns + '</div></div>';
  html += '</div>';

  html += '<div class="dd-section-title">Where the misses go</div>';
  html += renderFairwayGauge(missLeft, fwHit, missRight);

  html += '<div class="dd-row" style="margin-top:14px;">';
  html += '  <div class="dd-stat" style="background:rgba(47,175,62,0.1);"><div class="dd-stat-lbl">Score with Hit</div><div class="dd-stat-num">' + (scoreHitAvg != null ? scoreHitAvg.toFixed(1) : "—") + '</div><div style="font-size:11px; color:var(--muted);">' + scoreHitN + ' holes</div></div>';
  html += '  <div class="dd-stat" style="background:rgba(198,40,40,0.08);"><div class="dd-stat-lbl">Score with Miss</div><div class="dd-stat-num">' + (scoreMissAvg != null ? scoreMissAvg.toFixed(1) : "—") + '</div><div style="font-size:11px; color:var(--muted);">' + scoreMissN + ' holes</div></div>';
  html += '</div>';

  html += '<div class="dd-section-title">Longest Drive</div>';
  html += '<div style="text-align:center; font-size:32px; font-weight:800; color:var(--green-deep); margin-bottom:6px;">' + (longestDrive != null ? longestDrive + "y" : "—") + '</div>';
  if (longestDrive == null) html += '<p style="text-align:center; font-size:11px; color:var(--muted);">Log a driver-tee shot with a yardage to see your longest.</p>';

  body.innerHTML = html;
}

function renderFairwayGauge(missLeft, hit, missRight) {
  const total = missLeft + hit + missRight;
  if (total === 0) return '<p style="text-align:center; color:var(--muted); font-size:13px;">No tee-shot data yet.</p>';
  const lPct = Math.round(missLeft / total * 100);
  const hPct = Math.round(hit / total * 100);
  const rPct = Math.round(missRight / total * 100);
  // Semicircle: 180° split into 3 slices proportional to counts
  const cx = 150, cy = 150, r = 110, sw = 26;
  const circ = Math.PI * r; // half circumference
  function arc(start, frac, col) {
    const len = circ * frac;
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '" stroke-dasharray="' + len + ' ' + (2 * Math.PI * r) + '" stroke-dashoffset="' + (-start) + '" transform="rotate(180 ' + cx + ' ' + cy + ')" />';
  }
  let offset = 0;
  let arcs = '';
  arcs += arc(offset, missLeft / total, "#ef9a9a"); offset += circ * (missLeft / total);
  arcs += arc(offset, hit / total, "#2faf3e"); offset += circ * (hit / total);
  arcs += arc(offset, missRight / total, "#ef9a9a");
  return '<div style="display:flex; justify-content:center; padding:8px 0;">' +
         '<svg viewBox="0 0 300 180" width="290" height="170">' +
         '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#eee" stroke-width="' + sw + '" stroke-dasharray="' + circ + ' ' + (2 * Math.PI * r) + '" transform="rotate(180 ' + cx + ' ' + cy + ')" />' +
         arcs +
         '<text x="40" y="170" text-anchor="middle" font-size="12" font-weight="700" fill="#888">Miss left</text>' +
         '<text x="40" y="185" text-anchor="middle" font-size="13" font-weight="800" fill="#c62828">' + lPct + '%</text>' +
         '<text x="150" y="105" text-anchor="middle" font-size="14" font-weight="800" fill="var(--green-deep)">Hit</text>' +
         '<text x="150" y="125" text-anchor="middle" font-size="18" font-weight="800" fill="var(--green-deep)">' + hPct + '%</text>' +
         '<text x="260" y="170" text-anchor="middle" font-size="12" font-weight="700" fill="#888">Miss right</text>' +
         '<text x="260" y="185" text-anchor="middle" font-size="13" font-weight="800" fill="#c62828">' + rPct + '%</text>' +
         '</svg></div>';
}

// ---------- Greens deep-dive: GIR ring + per-par + GIR x FW cross + green-miss compass ----------
function renderGreensDeepDive(body, rounds) {
  if (rounds.length === 0) {
    body.innerHTML = '<p style="text-align:center; padding:30px 10px; color:var(--muted);">No rounds in this filter yet.</p>';
    return;
  }

  let girHit = 0, girAns = 0;
  const perPar = { 3: { hit: 0, ans: 0 }, 4: { hit: 0, ans: 0 }, 5: { hit: 0, ans: 0 } };
  let fwHitGreens = 0, fwHitTotal = 0, fwMissGreens = 0, fwMissTotal = 0;
  let scoreGirSum = 0, scoreGirN = 0, scoreNonGirSum = 0, scoreNonGirN = 0;
  const missDir = { Long: 0, Short: 0, Left: 0, Right: 0 };
  for (const r of rounds) {
    const holes = (r.fullData && r.fullData.holes) || {};
    for (const k in holes) {
      const h = holes[k];
      const par = Number(h.par) || 0;
      const score = Number(h.score) || 0;
      if (par < 3 || !Array.isArray(h.shots) || h.shots.length === 0) continue;
      const greenIdx = h.shots.findIndex(function (s) { return s.result === "Green" || s.result === "On green" || s.result === "Holed"; });
      const gir = greenIdx !== -1 && (greenIdx + 1) <= (par - 2);
      girAns++;
      if (gir) girHit++;
      if (perPar[par]) { perPar[par].ans++; if (gir) perPar[par].hit++; }
      if (score > 0) {
        if (gir) { scoreGirSum += score; scoreGirN++; }
        else { scoreNonGirSum += score; scoreNonGirN++; }
      }
      // FW × GIR cross
      const tee = h.shots[0];
      if (par >= 4 && tee && tee.lie === "Tee" && tee.result) {
        const fwHit = (tee.result === "Fairway" || tee.result === "On fairway");
        if (fwHit) { fwHitTotal++; if (gir) fwHitGreens++; }
        else { fwMissTotal++; if (gir) fwMissGreens++; }
      }
      // Green miss direction — find the approach shot (last shot that's not a putt)
      if (!gir) {
        // Approach = last non-Tee shot that has a direction. Walk backwards.
        for (let i = h.shots.length - 1; i >= 0; i--) {
          const s = h.shots[i];
          if (s.direction && (s.direction === "Long" || s.direction === "Short" || s.direction === "Left" || s.direction === "Right")) {
            missDir[s.direction] = (missDir[s.direction] || 0) + 1;
            break;
          }
        }
      }
    }
  }
  const girPct = girAns > 0 ? Math.round(girHit / girAns * 100) : null;

  let html = "";
  html += '<div class="dd-row">';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">GIR</div><div class="dd-stat-num">' + (girPct != null ? girPct + "%" : "—") + '</div></div>';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">Holes</div><div class="dd-stat-num">' + girHit + "/" + girAns + '</div></div>';
  html += '</div>';

  html += renderGirRing(girHit, girAns);

  if (perPar[3].ans + perPar[4].ans + perPar[5].ans > 0) {
    html += '<div class="dd-section-title">GIR by Par</div>';
    for (const p of [3, 4, 5]) {
      const pp = perPar[p];
      const pct = pp.ans > 0 ? Math.round(pp.hit / pp.ans * 100) : null;
      const widthPct = pct != null ? pct : 0;
      html += '<div class="dd-vs-par-row">';
      html += '  <div class="dd-vs-par-lbl">PAR ' + p + '</div>';
      html += '  <div class="dd-vs-par-bar-wrap"><div class="dd-vs-par-bar" style="width:' + widthPct + '%; left:0; background:var(--green-bright);"></div></div>';
      html += '  <div class="dd-vs-par-val">' + (pct != null ? pct + "%" : "—") + '</div>';
      html += '</div>';
    }
  }

  if (fwHitTotal + fwMissTotal > 0) {
    html += '<div class="dd-section-title">Greens × Fairway</div>';
    html += '<div class="dd-row">';
    const fwHitPct = fwHitTotal > 0 ? Math.round(fwHitGreens / fwHitTotal * 100) + "%" : "—";
    const fwMissPct = fwMissTotal > 0 ? Math.round(fwMissGreens / fwMissTotal * 100) + "%" : "—";
    html += '  <div class="dd-stat" style="background:rgba(47,175,62,0.1);"><div class="dd-stat-lbl">After FW Hit</div><div class="dd-stat-num">' + fwHitPct + '</div><div style="font-size:11px; color:var(--muted);">' + fwHitGreens + '/' + fwHitTotal + ' greens</div></div>';
    html += '  <div class="dd-stat" style="background:rgba(198,40,40,0.08);"><div class="dd-stat-lbl">After FW Miss</div><div class="dd-stat-num">' + fwMissPct + '</div><div style="font-size:11px; color:var(--muted);">' + fwMissGreens + '/' + fwMissTotal + ' greens</div></div>';
    html += '</div>';
  }

  if (scoreGirN + scoreNonGirN > 0) {
    html += '<div class="dd-section-title">Score Split</div>';
    html += '<div class="dd-row">';
    html += '  <div class="dd-stat" style="background:rgba(47,175,62,0.1);"><div class="dd-stat-lbl">With GIR</div><div class="dd-stat-num">' + (scoreGirN > 0 ? (scoreGirSum / scoreGirN).toFixed(1) : "—") + '</div></div>';
    html += '  <div class="dd-stat" style="background:rgba(198,40,40,0.08);"><div class="dd-stat-lbl">Green Missed</div><div class="dd-stat-num">' + (scoreNonGirN > 0 ? (scoreNonGirSum / scoreNonGirN).toFixed(1) : "—") + '</div></div>';
    html += '</div>';
  }

  if (missDir.Long + missDir.Short + missDir.Left + missDir.Right > 0) {
    html += '<div class="dd-section-title">Green Miss Compass</div>';
    html += renderGreenMissCompass(missDir);
  }

  body.innerHTML = html;
}

function renderGirRing(hit, total) {
  const cx = 100, cy = 100, r = 70, sw = 22;
  const circ = 2 * Math.PI * r;
  const frac = total > 0 ? hit / total : 0;
  const len = circ * frac;
  const pct = total > 0 ? Math.round(frac * 100) : null;
  return '<div style="display:flex; justify-content:center; padding:10px 0;">' +
         '<svg viewBox="0 0 200 200" width="180" height="180">' +
         '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#eee" stroke-width="' + sw + '" />' +
         '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#2faf3e" stroke-width="' + sw + '" stroke-dasharray="' + len + ' ' + (circ - len) + '" stroke-dashoffset="0" stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cy + ')" />' +
         '<text x="100" y="98" text-anchor="middle" font-size="36" font-weight="800" fill="#0b3d0b">' + (pct != null ? pct + "%" : "—") + '</text>' +
         '<text x="100" y="118" text-anchor="middle" font-size="11" fill="#888">GIR</text>' +
         '</svg></div>';
}

function renderGreenMissCompass(d) {
  const total = d.Long + d.Short + d.Left + d.Right;
  function pct(v) { return total > 0 ? Math.round(v / total * 100) + "%" : "—"; }
  // Cross with flag in centre and the 4 direction labels with counts
  return '<div style="display:flex; justify-content:center; padding:10px 0;">' +
         '<svg viewBox="0 0 300 240" width="280" height="220">' +
         // Crosshair lines
         '<line x1="150" y1="40" x2="150" y2="200" stroke="#eee" stroke-width="2" />' +
         '<line x1="40" y1="120" x2="260" y2="120" stroke="#eee" stroke-width="2" />' +
         // Centre flag
         '<circle cx="150" cy="120" r="22" fill="#2faf3e" />' +
         '<text x="150" y="127" text-anchor="middle" font-size="22" fill="white">⛳</text>' +
         // Long (top)
         '<text x="150" y="28" text-anchor="middle" font-size="12" font-weight="700" fill="#0b3d0b">Long</text>' +
         '<text x="150" y="50" text-anchor="middle" font-size="18" font-weight="800" fill="#c62828">' + pct(d.Long) + '</text>' +
         '<text x="150" y="64" text-anchor="middle" font-size="10" fill="#888">' + d.Long + '</text>' +
         // Short (bottom)
         '<text x="150" y="225" text-anchor="middle" font-size="12" font-weight="700" fill="#0b3d0b">Short</text>' +
         '<text x="150" y="208" text-anchor="middle" font-size="18" font-weight="800" fill="#c62828">' + pct(d.Short) + '</text>' +
         '<text x="150" y="195" text-anchor="middle" font-size="10" fill="#888">' + d.Short + '</text>' +
         // Left
         '<text x="32" y="118" text-anchor="middle" font-size="12" font-weight="700" fill="#0b3d0b">Left</text>' +
         '<text x="78" y="115" text-anchor="middle" font-size="18" font-weight="800" fill="#c62828">' + pct(d.Left) + '</text>' +
         '<text x="78" y="130" text-anchor="middle" font-size="10" fill="#888">' + d.Left + '</text>' +
         // Right
         '<text x="270" y="118" text-anchor="middle" font-size="12" font-weight="700" fill="#0b3d0b">Right</text>' +
         '<text x="222" y="115" text-anchor="middle" font-size="18" font-weight="800" fill="#c62828">' + pct(d.Right) + '</text>' +
         '<text x="222" y="130" text-anchor="middle" font-size="10" fill="#888">' + d.Right + '</text>' +
         '</svg></div>';
}

// ---------- Up & Downs deep-dive: scramble % + chips/round donut + distribution ----------
function renderUpDownsDeepDive(body, rounds) {
  if (rounds.length === 0) {
    body.innerHTML = '<p style="text-align:center; padding:30px 10px; color:var(--muted);">No rounds in this filter yet.</p>';
    return;
  }

  let scrSave = 0, scrAns = 0;
  let totalChips = 0;
  const chipDist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };  // 4 = "3+ chips"
  let chipsRoundsN = 0;
  for (const r of rounds) {
    const holes = (r.fullData && r.fullData.holes) || {};
    let chipsThisRound = 0;
    for (const k in holes) {
      const h = holes[k];
      const par = Number(h.par) || 0;
      if (par < 3 || !Array.isArray(h.shots)) continue;
      const greenIdx = h.shots.findIndex(function (s) { return s.result === "Green" || s.result === "On green" || s.result === "Holed"; });
      const gir = greenIdx !== -1 && (greenIdx + 1) <= (par - 2);
      const score = Number(h.score) || 0;
      if (!gir && score > 0) {
        scrAns++;
        if (score <= par) scrSave++;
      }
      // Count chips: any short-game shot (Wedge / chip-distance) after missing GIR
      for (const s of h.shots) {
        const club = (s.club || "").toLowerCase();
        if ((club.indexOf("wedge") !== -1 || club === "chipper") && s.lie !== "Tee") {
          chipsThisRound++;
        }
      }
    }
    totalChips += chipsThisRound;
    const key = chipsThisRound >= 4 ? 4 : (chipsThisRound > 3 ? 3 : chipsThisRound);
    chipDist[key] = (chipDist[key] || 0) + 1;
    chipsRoundsN++;
  }
  const scrPct = scrAns > 0 ? Math.round(scrSave / scrAns * 100) : null;
  const avgChips = chipsRoundsN > 0 ? totalChips / chipsRoundsN : null;

  let html = "";
  html += '<div class="dd-row">';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">Scrambling</div><div class="dd-stat-num">' + (scrPct != null ? scrPct + "%" : "—") + '</div></div>';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">Up &amp; Down</div><div class="dd-stat-num">' + scrSave + "/" + scrAns + '</div></div>';
  html += '</div>';

  if (chipsRoundsN > 0) {
    html += '<div class="dd-section-title">Chip shots per round</div>';
    html += renderChipsDonut(chipDist, chipsRoundsN, avgChips);
    html += '<div class="putt-dist-legend">';
    const legend = [
      { key: 0, lbl: "0 Chips", col: "#1b5e20" },
      { key: 1, lbl: "1 Chip",  col: "#2faf3e" },
      { key: 2, lbl: "2 Chips", col: "#a5d6a7" },
      { key: 3, lbl: "3 Chips", col: "#ef9a9a" },
      { key: 4, lbl: "3+ Chips", col: "#c62828" },
    ];
    for (const l of legend) {
      const c = chipDist[l.key] || 0;
      const pct = Math.round(c / chipsRoundsN * 100);
      html += '<div class="putt-dist-chip"><span class="putt-dist-dot" style="background:' + l.col + ';"></span>' + l.lbl + ' · ' + pct + '% (' + c + ')</div>';
    }
    html += '</div>';
  }

  body.innerHTML = html;
}

function renderChipsDonut(buckets, totalRounds, avgChips) {
  const segments = [
    { key: 0, col: "#1b5e20" },
    { key: 1, col: "#2faf3e" },
    { key: 2, col: "#a5d6a7" },
    { key: 3, col: "#ef9a9a" },
    { key: 4, col: "#c62828" },
  ];
  const cx = 100, cy = 100, r = 70, stroke = 22;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  let arcs = '';
  for (const seg of segments) {
    const count = buckets[seg.key] || 0;
    const frac = count / totalRounds;
    if (frac === 0) continue;
    const len = circ * frac;
    arcs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + seg.col + '" stroke-width="' + stroke + '" stroke-dasharray="' + len + ' ' + (circ - len) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" />';
    offset += len;
  }
  const centerLbl = avgChips != null ? avgChips.toFixed(1) : "—";
  return '<div style="display:flex; justify-content:center; padding:10px 0;">' +
         '<svg viewBox="0 0 200 200" width="180" height="180">' +
         '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#eee" stroke-width="' + stroke + '" />' +
         arcs +
         '<text x="100" y="98" text-anchor="middle" font-size="34" font-weight="800" fill="#0b3d0b">' + centerLbl + '</text>' +
         '<text x="100" y="118" text-anchor="middle" font-size="11" fill="#888">chips / round</text>' +
         '</svg></div>';
}

// ---------- Sand Saves deep-dive ----------
function renderSandSavesDeepDive(body, rounds) {
  if (rounds.length === 0) {
    body.innerHTML = '<p style="text-align:center; padding:30px 10px; color:var(--muted);">No rounds in this filter yet.</p>';
    return;
  }

  let bunkerHoles = 0, sandSaves = 0;
  let bunkerShots = 0;
  const perRound = [];
  for (const r of rounds) {
    const holes = (r.fullData && r.fullData.holes) || {};
    let bunkersThisRound = 0;
    for (const k in holes) {
      const h = holes[k];
      if (!Array.isArray(h.shots)) continue;
      const par = Number(h.par) || 0;
      const score = Number(h.score) || 0;
      const fromBunker = h.shots.some(function (s) { return s.lie === "Bunker"; });
      if (fromBunker) {
        bunkerHoles++;
        if (score > 0 && score <= par + 1) sandSaves++;  // Sand save = bogey-or-better from sand
        bunkersThisRound += h.shots.filter(function (s) { return s.lie === "Bunker"; }).length;
        bunkerShots += h.shots.filter(function (s) { return s.lie === "Bunker"; }).length;
      }
    }
    perRound.push(bunkersThisRound);
  }
  const ssPct = bunkerHoles > 0 ? Math.round(sandSaves / bunkerHoles * 100) : null;
  const avgBunkers = perRound.length > 0 ? perRound.reduce(function (a, b) { return a + b; }, 0) / perRound.length : null;

  let html = "";
  html += '<div class="dd-row">';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">Sand Save %</div><div class="dd-stat-num">' + (ssPct != null ? ssPct + "%" : "—") + '</div></div>';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">From Sand</div><div class="dd-stat-num">' + sandSaves + "/" + bunkerHoles + '</div></div>';
  html += '</div>';

  html += '<div class="dd-row">';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">Bunker shots / round</div><div class="dd-stat-num">' + (avgBunkers != null ? avgBunkers.toFixed(1) : "—") + '</div></div>';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">Total bunker shots</div><div class="dd-stat-num">' + bunkerShots + '</div></div>';
  html += '</div>';

  if (bunkerHoles === 0) {
    html += '<p style="text-align:center; font-size:13px; color:var(--muted); margin-top:14px;">No bunker shots logged in this filter. Sand save % shows up once you log a bunker shot.</p>';
  } else {
    html += '<p style="font-size:11px; color:var(--muted); margin-top:14px; text-align:center;">Sand save = bogey-or-better on a hole where you played a bunker shot.</p>';
  }

  body.innerHTML = html;
}

// ---------- Penalties deep-dive ----------
function renderPenaltiesDeepDive(body, rounds) {
  if (rounds.length === 0) {
    body.innerHTML = '<p style="text-align:center; padding:30px 10px; color:var(--muted);">No rounds in this filter yet.</p>';
    return;
  }

  let totalPens = 0;
  const perRound = [];
  const penDist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const perPar = { 3: 0, 4: 0, 5: 0 };
  let cleanRounds = 0;
  for (const r of rounds) {
    let pensThisRound = 0;
    const holes = (r.fullData && r.fullData.holes) || {};
    for (const k in holes) {
      const h = holes[k];
      const par = Number(h.par) || 0;
      if (!Array.isArray(h.shots)) continue;
      const pens = h.shots.filter(function (s) { return s.result === "Penalty"; }).length;
      pensThisRound += pens;
      if (pens > 0 && perPar[par] != null) perPar[par] += pens;
    }
    totalPens += pensThisRound;
    perRound.push(pensThisRound);
    if (pensThisRound === 0) cleanRounds++;
    const key = pensThisRound >= 4 ? 4 : pensThisRound;
    penDist[key] = (penDist[key] || 0) + 1;
  }
  const avgPens = perRound.length > 0 ? totalPens / perRound.length : null;

  let html = "";
  html += '<div class="dd-row">';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">Avg / Round</div><div class="dd-stat-num">' + (avgPens != null ? avgPens.toFixed(1) : "—") + '</div></div>';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">Total</div><div class="dd-stat-num">' + totalPens + '</div></div>';
  html += '</div>';

  html += '<div class="dd-row">';
  html += '  <div class="dd-stat" style="background:rgba(47,175,62,0.1);"><div class="dd-stat-lbl">Clean rounds</div><div class="dd-stat-num">' + cleanRounds + '</div><div style="font-size:11px; color:var(--muted);">' + (perRound.length > 0 ? Math.round(cleanRounds / perRound.length * 100) : 0) + '% of rounds</div></div>';
  html += '  <div class="dd-stat" style="background:rgba(198,40,40,0.08);"><div class="dd-stat-lbl">Worst round</div><div class="dd-stat-num">' + (perRound.length > 0 ? Math.max.apply(null, perRound) : 0) + '</div></div>';
  html += '</div>';

  if (perPar[3] + perPar[4] + perPar[5] > 0) {
    html += '<div class="dd-section-title">Penalties by Par</div>';
    const maxV = Math.max(perPar[3], perPar[4], perPar[5], 1);
    for (const p of [3, 4, 5]) {
      const v = perPar[p];
      const widthPct = Math.round(v / maxV * 100);
      html += '<div class="dd-vs-par-row">';
      html += '  <div class="dd-vs-par-lbl">PAR ' + p + '</div>';
      html += '  <div class="dd-vs-par-bar-wrap"><div class="dd-vs-par-bar" style="width:' + widthPct + '%; left:0; background:var(--crimson);"></div></div>';
      html += '  <div class="dd-vs-par-val">' + v + '</div>';
      html += '</div>';
    }
  }

  body.innerHTML = html;
}

function openCategoryFilterSheet() {
  const sheet = document.getElementById("categoryFilterSheet");
  if (!sheet) return;
  const courseSel = document.getElementById("catFilterCourse");
  if (courseSel) {
    const courses = Object.keys(COURSES).concat(getHistory().map(function (r) { return r.courseName; }).filter(Boolean));
    const unique = Array.from(new Set(courses));
    courseSel.innerHTML = '<option value="">All courses</option>' + unique.map(function (c) { return '<option value="' + c + '"' + (c === categoriesFilter.course ? ' selected' : '') + '>' + c + '</option>'; }).join('');
  }
  document.querySelectorAll("#catFilterHolesPills .pill").forEach(function (p) {
    p.classList.toggle("active", p.dataset.holes === categoriesFilter.holes);
  });
  document.querySelectorAll("#catFilterTimePills .pill").forEach(function (p) {
    p.classList.toggle("active", p.dataset.time === (categoriesFilter.timeBlock || "all"));
  });
  document.getElementById("catFilterRange").value = categoriesFilter.range;
  document.getElementById("catFilterFrom").value = categoriesFilter.from || "";
  document.getElementById("catFilterTo").value = categoriesFilter.to || "";
  document.getElementById("catFilterDateRow").style.display = categoriesFilter.range === "custom" ? "" : "none";
  sheet.style.display = "flex";
}

export function wireStatsCategories() {
  loadCategoriesFilter();

  document.querySelectorAll(".cat-filter-pill").forEach(function (p) {
    p.addEventListener("click", function () {
      categoriesFilter.range = p.dataset.range;
      saveCategoriesFilter();
      renderCategoriesGrid();
    });
  });

  document.querySelectorAll(".category-tile").forEach(function (t) {
    t.addEventListener("click", function () { openDeepDive(t.dataset.cat); });
  });

  const dcb = document.getElementById("deepdiveCloseBtn");
  if (dcb) dcb.addEventListener("click", closeDeepDive);

  const cfb = document.getElementById("categoriesFilterBtn");
  if (cfb) cfb.addEventListener("click", openCategoryFilterSheet);
  const cfc = document.getElementById("catFilterClose");
  if (cfc) cfc.addEventListener("click", function () { document.getElementById("categoryFilterSheet").style.display = "none"; });

  document.querySelectorAll("#catFilterHolesPills .pill").forEach(function (p) {
    p.addEventListener("click", function () {
      document.querySelectorAll("#catFilterHolesPills .pill").forEach(function (x) { x.classList.remove("active"); });
      p.classList.add("active");
    });
  });
  document.querySelectorAll("#catFilterTimePills .pill").forEach(function (p) {
    p.addEventListener("click", function () {
      document.querySelectorAll("#catFilterTimePills .pill").forEach(function (x) { x.classList.remove("active"); });
      p.classList.add("active");
    });
  });

  const cfr = document.getElementById("catFilterRange");
  if (cfr) cfr.addEventListener("change", function () {
    document.getElementById("catFilterDateRow").style.display = cfr.value === "custom" ? "" : "none";
  });

  const cfa = document.getElementById("catFilterApply");
  if (cfa) cfa.addEventListener("click", function () {
    const activeHoles = document.querySelector("#catFilterHolesPills .pill.active");
    const activeTime = document.querySelector("#catFilterTimePills .pill.active");
    categoriesFilter.holes = activeHoles ? activeHoles.dataset.holes : "all";
    categoriesFilter.timeBlock = activeTime ? activeTime.dataset.time : "all";
    categoriesFilter.course = document.getElementById("catFilterCourse").value || "";
    categoriesFilter.range = document.getElementById("catFilterRange").value;
    categoriesFilter.from = document.getElementById("catFilterFrom").value || "";
    categoriesFilter.to = document.getElementById("catFilterTo").value || "";
    saveCategoriesFilter();
    renderCategoriesGrid();
    document.getElementById("categoryFilterSheet").style.display = "none";
  });

  const cfReset = document.getElementById("catFilterReset");
  if (cfReset) cfReset.addEventListener("click", function () {
    Object.assign(categoriesFilter, { range: "last20", holes: "all", course: "", from: "", to: "", timeBlock: "all" });
    saveCategoriesFilter();
    openCategoryFilterSheet();
    renderCategoriesGrid();
  });
}

// ── Strokes Gained deep-dive ──────────────────────────────────────────────────
function renderSGDeepDive(body, rounds) {
  function sgBar(label, val, n) {
    if (val == null) return '<div class="stat-row"><span class="stat-label">' + label + '</span><span class="stat-val" style="color:var(--muted);">no data — enter first putt distance in tracker</span></div>';
    const color = val >= 0 ? "var(--green-bright)" : "var(--crimson)";
    const sign = val >= 0 ? "+" : "";
    const barW = Math.min(Math.abs(val) / 3 * 100, 100);
    const barDir = val >= 0 ? "left" : "right";
    return [
      '<div class="stat-row" style="flex-direction:column; align-items:flex-start; gap:4px; margin-bottom:12px;">',
      '  <div style="display:flex; justify-content:space-between; width:100%; align-items:baseline;">',
      '    <span class="stat-label" style="font-weight:600;">' + label + '</span>',
      '    <span style="color:' + color + '; font-size:18px; font-weight:700;">' + sign + val + '</span>',
      '  </div>',
      '  <div style="width:100%; height:6px; background:var(--card-border); border-radius:3px; overflow:hidden;">',
      '    <div style="width:' + barW + '%; height:100%; background:' + color + '; margin-' + (val >= 0 ? 'left' : 'right') + ':' + (val < 0 ? (100 - barW) + '%' : '0') + ';"></div>',
      '  </div>',
      '  <span style="font-size:11px; color:var(--muted);">' + n + ' holes with data</span>',
      '</div>',
    ].join("");
  }

  if (rounds.length === 0) {
    body.innerHTML = '<p style="text-align:center; padding:30px; color:var(--muted);">No rounds yet.</p>';
    return;
  }

  const sg = aggregateSG(rounds);
  let html = "";

  html += '<p style="font-size:12px; color:var(--muted); margin:0 0 16px;">Strokes gained vs. scratch benchmark per round (avg). Positive = better than scratch for that category.</p>';

  html += sgBar("Off the Tee (OTT)", sg.offTee.avg, sg.offTee.n);
  html += sgBar("Approach (APP)", sg.approach.avg, sg.approach.n);
  html += sgBar("Around the Green (ARG)", sg.aroundGreen.avg, sg.aroundGreen.n);
  html += sgBar("Putting (PUTT)", sg.putting.avg, sg.putting.n);

  // Total
  if (sg.total.avg != null) {
    const totalColor = sg.total.avg >= 0 ? "var(--green-bright)" : "var(--crimson)";
    const totalSign = sg.total.avg >= 0 ? "+" : "";
    html += '<div style="border-top:1px solid var(--card-border); padding-top:12px; margin-top:4px; display:flex; justify-content:space-between; align-items:baseline;">';
    html += '  <span style="font-weight:700;">Total SG</span>';
    html += '  <span style="font-size:22px; font-weight:800; color:' + totalColor + ';">' + totalSign + sg.total.avg + '</span>';
    html += '</div>';
  }

  // Biggest leak callout
  const cats = [
    { name: "Off the Tee", val: sg.offTee.avg },
    { name: "Approach",    val: sg.approach.avg },
    { name: "Around Green", val: sg.aroundGreen.avg },
    { name: "Putting",     val: sg.putting.avg },
  ].filter(function (c) { return c.val != null; });
  if (cats.length > 0) {
    const worst = cats.reduce(function (a, b) { return a.val < b.val ? a : b; });
    const best  = cats.reduce(function (a, b) { return a.val > b.val ? a : b; });
    html += '<div style="margin-top:20px; background:rgba(220,38,38,0.07); border:1px solid rgba(220,38,38,0.2); border-radius:10px; padding:12px;">';
    html += '  <div style="font-size:12px; font-weight:700; color:var(--crimson); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px;">📍 Biggest leak</div>';
    html += '  <div style="font-size:15px; font-weight:600;">' + worst.name + ' (' + (worst.val >= 0 ? "+" : "") + worst.val + '/round)</div>';
    html += '  <div style="font-size:12px; color:var(--muted); margin-top:4px;">Focus practice here first.</div>';
    html += '</div>';
    html += '<div style="margin-top:10px; background:rgba(19,122,44,0.07); border:1px solid rgba(19,122,44,0.2); border-radius:10px; padding:12px;">';
    html += '  <div style="font-size:12px; font-weight:700; color:var(--green-mid); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px;">💪 Strength</div>';
    html += '  <div style="font-size:15px; font-weight:600;">' + best.name + ' (' + (best.val >= 0 ? "+" : "") + best.val + '/round)</div>';
    html += '</div>';
  }

  // Per-round history
  const recent = rounds.slice(-10).reverse();
  if (recent.length > 0) {
    html += '<h4 style="margin:20px 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted);">Round by round</h4>';
    html += '<div style="overflow-x:auto;"><table style="width:100%; font-size:12px; border-collapse:collapse;">';
    html += '<tr style="color:var(--muted); font-size:11px;"><th style="text-align:left; padding:4px 6px;">Date</th><th style="padding:4px 6px;">OTT</th><th style="padding:4px 6px;">App</th><th style="padding:4px 6px;">ARG</th><th style="padding:4px 6px;">Putt</th></tr>';
    for (const r of recent) {
      const rsg = computeFullSG(r);
      function cell(v) {
        if (!v) return '<td style="padding:4px 6px; text-align:center; color:var(--muted);">—</td>';
        const c = v.value >= 0 ? "var(--green-bright)" : "var(--crimson)";
        const s = v.value >= 0 ? "+" : "";
        return '<td style="padding:4px 6px; text-align:center; color:' + c + '; font-weight:600;">' + s + v.value + '</td>';
      }
      html += '<tr style="border-top:1px solid var(--card-border);">';
      html += '<td style="padding:4px 6px;">' + (r.date || "—") + '</td>';
      html += cell(rsg.offTee) + cell(rsg.approach) + cell(rsg.aroundGreen) + cell(rsg.putting);
      html += '</tr>';
    }
    html += '</table></div>';
  }

  if (sg.offTee.n === 0 && sg.putting.n === 0) {
    html += '<div style="margin-top:20px; background:var(--card-bg); border:1px solid var(--card-border); border-radius:10px; padding:14px; font-size:13px;">';
    html += '<strong>💡 How to unlock SG data</strong><br>';
    html += '<span style="color:var(--muted); font-size:12px; line-height:1.6;">During a round, enter <strong>First putt distance (ft)</strong> in the putting section of each hole. The more holes you enter it for, the more accurate SG gets. Putting SG needs 3+ holes; Approach and OTT also need hole distance + shot data.</span>';
    html += '</div>';
  }

  body.innerHTML = html;
}

// ── Trends deep-dive ──────────────────────────────────────────────────────────
function renderTrendsDeepDive(body, rounds) {
  const allHistory = getHistory();
  if (allHistory.length < 3) {
    body.innerHTML = '<p style="text-align:center; padding:30px; color:var(--muted);">Need at least 3 rounds to show trends.</p>';
    return;
  }

  const trends = getTrends(allHistory);
  const response = getScoringResponse(allHistory.slice(-20));

  function trendRow(label, t, unit) {
    if (!t || t.last5 == null) return "";
    const arrow = t.direction === "improving" ? "↑" : t.direction === "declining" ? "↓" : "→";
    const color = t.direction === "improving" ? "var(--green-bright)" : t.direction === "declining" ? "var(--crimson)" : "var(--muted)";
    return [
      '<div style="border-top:1px solid var(--card-border); padding:12px 0;">',
      '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">',
      '    <span style="font-weight:600;">' + label + '</span>',
      '    <span style="font-size:20px; color:' + color + '; font-weight:700;">' + arrow + '</span>',
      '  </div>',
      '  <div style="display:flex; gap:12px; font-size:12px; color:var(--muted);">',
      t.last5  != null ? '<div><div style="font-size:16px; font-weight:700; color:var(--ink);">' + t.last5  + unit + '</div><div>Last 5</div></div>' : '',
      t.last10 != null ? '<div><div style="font-size:16px; font-weight:700; color:var(--ink);">' + t.last10 + unit + '</div><div>Last 10</div></div>' : '',
      t.last20 != null ? '<div><div style="font-size:16px; font-weight:700; color:var(--ink);">' + t.last20 + unit + '</div><div>Last 20</div></div>' : '',
      '  </div>',
      '</div>',
    ].join("");
  }

  let html = '<p style="font-size:12px; color:var(--muted); margin:0 0 16px;">Rolling averages across all rounds in your history. ↑ = improving, ↓ = declining.</p>';
  html += trendRow("Score", trends.totalScore, "");
  html += trendRow("Putts / round", trends.totalPutts, "");
  html += trendRow("Fairways hit", trends.fairwayPct, "%");
  html += trendRow("Greens in Regulation", trends.girPct, "%");
  html += trendRow("Scrambling (Up & Downs)", trends.scramblePct, "%");
  html += trendRow("Penalties / round", trends.totalPenalties, "");

  // Approach proximity trend
  const proximity = getApproachProximity(allHistory.slice(-20));
  if (proximity.length > 0) {
    html += '<h4 style="margin:20px 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted);">Approach proximity by club (avg ft from pin)</h4>';
    html += '<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px;">';
    for (const p of proximity.slice(0, 8)) {
      html += '<div style="background:var(--card-bg); border:1px solid var(--card-border); border-radius:8px; padding:8px 12px; text-align:center;">';
      html += '<div style="font-size:11px; color:var(--muted);">' + p.club + '</div>';
      html += '<div style="font-size:17px; font-weight:700;">' + p.avgLeft + 'ft</div>';
      html += '<div style="font-size:10px; color:var(--muted);">n=' + p.count + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }

  // Mental game: scoring response
  if (response.afterBogey.n >= 4) {
    const avg = response.afterBogey.avgVsPar;
    const label = avg != null
      ? (avg <= 0 ? "🟢 Bounces back well (" + (avg <= 0 ? avg : "+" + avg) + " avg next hole)"
                  : "🔴 Compounds mistakes (+" + avg + " avg next hole)")
      : null;
    if (label) {
      html += '<div style="margin-top:16px; background:var(--card-bg); border:1px solid var(--card-border); border-radius:10px; padding:14px;">';
      html += '<div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin-bottom:6px;">Mental game — after a bogey</div>';
      html += '<div style="font-size:15px; font-weight:600;">' + label + '</div>';
      html += '<div style="font-size:11px; color:var(--muted); margin-top:4px;">Based on ' + response.afterBogey.n + ' holes following a bogey.</div>';
      html += '</div>';
    }
  }

  body.innerHTML = html;
}
