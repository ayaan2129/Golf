// Practice screen: drill picker + four drill state machines (putting,
// chipping, iron, driver) + per-skill summary cards + legacy practice
// session list. Each drill has the same pattern:
//
//   1. start*Drill()  — flips the picker view to the drill view
//   2. record*()      — pushes a shot onto in-memory state
//   3. end*Drill()    — saves the session to practice storage + flips back
//   4. render*StatsSummary() — re-renders the picker summary card
//
// wirePracticeUi() runs once at app boot to attach all DOM listeners.

import { todayISO } from "../core/utils.js";
import {
  getPractice,
  savePractice,
  getPuttingInsights,
  getChippingInsights,
  getIronInsights,
  getDriverInsights,
  getPracticeActivity,
  getPuttingTrend,
  getPuttingRanges,
  savePuttingRanges,
  getChippingRanges,
  saveChippingRanges,
  DEFAULT_PUTTING_RANGES,
  DEFAULT_CHIPPING_RANGES,
  CHIP_UD,
  IRON_GOOD_RESULTS,
  DRV_FAIRWAY_RESULTS,
} from "../data/practice.js";

// ---------------- Session summary modal ----------------
// Called by end*Drill with a description of what was just saved. Builds a
// quick recap so the player feels the accomplishment + sees per-range
// breakdown + how it compares to recent sessions of the same type.
function showSessionSummary(opts) {
  if (!opts || !opts.shots || opts.shots.length === 0) return;
  const modal = document.getElementById("sessionSummaryModal");
  const title = document.getElementById("sessionSummaryTitle");
  const body = document.getElementById("sessionSummaryBody");
  if (!modal || !body) return;
  title.textContent = opts.title || "Session done";

  let html = "";
  const total = opts.shots.length;
  const counter = opts.counter || (total + " shots");
  html += '<div class="dd-row">';
  html += '  <div class="dd-stat"><div class="dd-stat-lbl">This session</div><div class="dd-stat-num">' + total + '</div><div style="font-size:11px; color:var(--muted);">' + (opts.subStat || "shots") + '</div></div>';
  if (opts.pct != null) {
    html += '  <div class="dd-stat" style="background:rgba(47,175,62,0.1);"><div class="dd-stat-lbl">' + (opts.pctLabel || "Make rate") + '</div><div class="dd-stat-num">' + opts.pct + '%</div></div>';
  }
  html += '</div>';

  if (opts.byRange && opts.byRange.length > 0) {
    html += '<div class="dd-section-title">By range</div>';
    for (const r of opts.byRange) {
      html += '<div class="dd-vs-par-row">';
      html += '  <div class="dd-vs-par-lbl">' + r.label + '</div>';
      html += '  <div class="dd-vs-par-bar-wrap"><div class="dd-vs-par-bar" style="width:' + (r.pct || 0) + '%; left:0; background:var(--green-bright);"></div></div>';
      html += '  <div class="dd-vs-par-val">' + (r.pct != null ? r.pct + "%" : "—") + ' <span style="font-weight:400; color:var(--muted); font-size:11px;">(' + r.count + ')</span></div>';
      html += '</div>';
    }
  }

  if (opts.compareLine) {
    html += '<div class="dd-section-title">vs Recent</div>';
    html += '<div style="font-size:13px; color:var(--ink-soft);">' + opts.compareLine + '</div>';
  }

  body.innerHTML = html;
  modal.style.display = "flex";
}

function closeSessionSummary() {
  const modal = document.getElementById("sessionSummaryModal");
  if (modal) modal.style.display = "none";
}

// ---------------- Practice activity (recent days + trend) ----------------
export function renderPracticeActivity() {
  const el = document.getElementById("practiceActivitySummary");
  if (!el) return;
  const a7 = getPracticeActivity(7);
  const a30 = getPracticeActivity(30);
  if (a30.totalShots === 0) {
    el.innerHTML = "No practice logged yet — start a drill below.";
    return;
  }
  function streakLine(window, days, sessions, shots) {
    return '<div class="stat-line"><span>Last ' + window + ' days</span><span class="stat-num">' + days + ' day' + (days === 1 ? "" : "s") + ' · ' + shots + ' shots</span></div>';
  }
  let html = "";
  html += streakLine(7, a7.daysPractised, a7.sessions, a7.totalShots);
  html += streakLine(30, a30.daysPractised, a30.sessions, a30.totalShots);
  // Breakdown by skill (last 30)
  const byType = a30.byType;
  const totals = byType.Putting + byType.Chipping + byType.Irons + byType.Driver;
  if (totals > 0) {
    html += '<div class="stat-line" style="margin-top:6px;"><span>Last 30 by skill</span><span class="stat-num" style="font-size:12px; font-weight:600;">P' + byType.Putting + ' · C' + byType.Chipping + ' · I' + byType.Irons + ' · D' + byType.Driver + '</span></div>';
  }
  // Putting trend (current vs prior 30-day window)
  const trend = getPuttingTrend();
  if (trend.last30.makeIntent >= 5) {
    const cur = trend.last30.pct;
    const prev = trend.prior30.makeIntent >= 5 ? trend.prior30.pct : null;
    let arrow = "";
    let color = "var(--green-deep)";
    if (prev != null) {
      const delta = cur - prev;
      if (delta > 0) { arrow = " ↑ " + delta + " pts"; color = "var(--green-bright)"; }
      else if (delta < 0) { arrow = " ↓ " + Math.abs(delta) + " pts"; color = "var(--crimson)"; }
      else arrow = " → 0 pts";
    }
    html += '<div class="stat-line"><span>Putting make-rate (30d)</span><span class="stat-num" style="color:' + color + ';">' + cur + '%' + arrow + '</span></div>';
  }
  el.innerHTML = html;
}

// ---------------- Putting ----------------
const puttingState = {
  active: false,
  sessionStart: null,
  shots: [],
  conditions: { distance: 5, break: "straight", slope: "flat", speed: "medium", intent: "make", circle: 5, rangeId: null },
};

// Render the range pills inside the putting drill from the user's saved
// ranges. Called when the drill opens.
function renderPuttingRangePills() {
  const wrap = document.getElementById("puttRangePills");
  if (!wrap) return;
  const ranges = getPuttingRanges();
  let html = "";
  for (const r of ranges) {
    const label = r.label + "<br><span style=\"font-size:10px; opacity:0.75;\">" + (r.max < 999 ? r.min + "-" + r.max + " ft" : r.min + "+ ft") + "</span>";
    html += '<button class="pill" type="button" data-range-id="' + r.id + '" data-rep="' + r.rep + '" style="flex:1;">' + label + '</button>';
  }
  html += '<button class="pill" type="button" data-range-id="custom" style="flex:1;">Custom<br><span style="font-size:10px; opacity:0.75;">type ft</span></button>';
  wrap.innerHTML = html;
  // Activate the first range by default if no range chosen yet
  const first = wrap.querySelector(".pill");
  if (first) {
    first.classList.add("active");
    puttingState.conditions.rangeId = first.dataset.rangeId;
    puttingState.conditions.distance = Number(first.dataset.rep) || 5;
  }
  wrap.querySelectorAll(".pill").forEach(function (p) {
    p.addEventListener("click", function () {
      wrap.querySelectorAll(".pill").forEach(function (x) { x.classList.remove("active"); });
      p.classList.add("active");
      const id = p.dataset.rangeId;
      puttingState.conditions.rangeId = id;
      const customRow = document.getElementById("puttCustomDistanceRow");
      if (id === "custom") {
        if (customRow) customRow.style.display = "";
        const di = document.getElementById("puttDistance");
        if (di) { di.focus(); puttingState.conditions.distance = Number(di.value) || 5; }
      } else {
        if (customRow) customRow.style.display = "none";
        puttingState.conditions.distance = Number(p.dataset.rep) || 5;
      }
    });
  });
}

export function renderPuttingStatsSummary() {
  const el = document.getElementById("puttStatsSummary");
  if (!el) return;
  const ins = getPuttingInsights();
  if (ins.totalShots === 0) {
    el.innerHTML = "Log some putts to see your make rate.";
    return;
  }
  let html = "";
  for (const b of ins.distanceRates) {
    if (b.count === 0) {
      html += '<div class="stat-line" style="opacity:0.5;"><span>' + b.label + "</span><span class=\"stat-num\" style=\"color:var(--muted); font-weight:400;\">— no putts</span></div>";
    } else {
      html += '<div class="stat-line"><span>' + b.label + " (" + b.count + ")</span><span class=\"stat-num\">" + b.pct + "%</span></div>";
    }
  }
  if (ins.topMiss) html += '<div class="stat-line"><span>Most common miss</span><span class="stat-num">' + ins.topMiss + "</span></div>";
  if (ins.lag) html += '<div class="stat-line"><span>Lag in circle (' + ins.lag.count + ")</span><span class=\"stat-num\">" + ins.lag.inCirclePct + "%</span></div>";
  el.innerHTML = html || "No make-intent putts yet.";
}

function startPuttingDrill() {
  puttingState.active = true;
  puttingState.sessionStart = new Date().toISOString();
  puttingState.shots = [];
  // Reset conditions so a prior session (e.g. ending in lag intent) doesn't
  // leak its mode into the new one.
  puttingState.conditions.intent = "make";
  puttingState.conditions.break = "straight";
  puttingState.conditions.slope = "flat";
  puttingState.conditions.speed = "medium";
  // Reset the pill UI to match
  ["puttBreakPills:break:straight", "puttSlopePills:slope:flat", "puttSpeedPills:speed:medium", "puttIntentPills:intent:make"].forEach(function (spec) {
    const parts = spec.split(":");
    const group = document.getElementById(parts[0]);
    if (group) {
      group.querySelectorAll(".pill").forEach(function (pl) { pl.classList.toggle("active", pl.dataset[parts[1]] === parts[2]); });
    }
  });
  // Make-result row visible, lag row hidden
  const lagRow = document.getElementById("puttLagRow");
  const makeRes = document.getElementById("puttMakeResults");
  const lagRes = document.getElementById("puttLagResults");
  if (lagRow) lagRow.style.display = "none";
  if (makeRes) makeRes.style.display = "";
  if (lagRes) lagRes.style.display = "none";
  document.getElementById("practicePickerView").style.display = "none";
  document.getElementById("puttingView").style.display = "";
  renderPuttingRangePills();
  updatePuttingRunningStat();
}

// Bucket a shot by its explicitly-chosen rangeId if present (no double-count
// at band boundaries); fall back to distance-bucketing for legacy shots and
// for "custom" entries that don't belong to a saved range.
function shotInRange(shot, range) {
  if (shot.rangeId && shot.rangeId !== "custom") return shot.rangeId === range.id;
  return shot.distance >= range.min && shot.distance < (range.max >= 999 ? 99999 : range.max);
}

function summarizePuttingSession(shots) {
  const makeShots = shots.filter(function (s) { return s.intent === "make"; });
  const lagShots = shots.filter(function (s) { return s.intent === "lag"; });
  const made = makeShots.filter(function (s) { return s.result === "Holed"; }).length;
  const pct = makeShots.length > 0 ? Math.round(made / makeShots.length * 100) : null;
  const ranges = getPuttingRanges();
  const byRange = ranges.map(function (r) {
    const inBucket = makeShots.filter(function (s) { return shotInRange(s, r); });
    if (inBucket.length === 0) return null;
    const m = inBucket.filter(function (s) { return s.result === "Holed"; }).length;
    return { label: r.label, count: inBucket.length, pct: Math.round(m / inBucket.length * 100) };
  }).filter(Boolean);
  if (lagShots.length > 0) {
    const inCircle = lagShots.filter(function (s) { return s.result === "Holed" || s.result === "In Circle"; }).length;
    byRange.push({ label: "Lag → in circle", count: lagShots.length, pct: Math.round(inCircle / lagShots.length * 100) });
  }
  return { total: shots.length, made, pct, byRange };
}

function endPuttingDrill() {
  if (!puttingState.active) return;
  const shotsSnapshot = puttingState.shots.slice();
  if (shotsSnapshot.length > 0) {
    const arr = getPractice();
    const ended = new Date();
    const startedAt = new Date(puttingState.sessionStart);
    const durationMin = Math.max(1, Math.round((ended - startedAt) / 60000));
    arr.push({
      date: todayISO(), area: "Putting", type: "Putting", duration: durationMin,
      focus: "Drill — " + shotsSnapshot.length + " putts", notes: "",
      savedAt: ended.toISOString(), shots: shotsSnapshot,
    });
    savePractice(arr);
    const summary = summarizePuttingSession(shotsSnapshot);
    // Build comparison line by reading the second-to-last session (the prior one)
    // which is now the one BEFORE the just-saved session.
    const allSessions = getPractice().filter(function (s) { return s.type === "Putting" && Array.isArray(s.shots); });
    let compareLine = null;
    if (allSessions.length >= 2) {
      const prev = allSessions[allSessions.length - 2];
      const prevS = summarizePuttingSession(prev.shots);
      if (prevS.pct != null && summary.pct != null) {
        const delta = summary.pct - prevS.pct;
        if (delta === 0) compareLine = "Same make rate as your last session (" + prevS.pct + "%).";
        else {
          const arrow = delta > 0 ? "↑" : "↓";
          const col = delta > 0 ? "var(--green-bright)" : "var(--crimson)";
          compareLine = 'Last session: ' + prevS.pct + '% · this session: <strong>' + summary.pct + '%</strong> · <span style="color:' + col + '; font-weight:700;">' + arrow + ' ' + Math.abs(delta) + ' pts</span>';
        }
      }
    }
    showSessionSummary({
      title: "Putting session — done",
      shots: shotsSnapshot,
      subStat: "putts",
      pct: summary.pct,
      pctLabel: "Make rate",
      byRange: summary.byRange,
      compareLine,
    });
  }
  puttingState.active = false;
  puttingState.shots = [];
  document.getElementById("puttingView").style.display = "none";
  document.getElementById("practicePickerView").style.display = "";
  renderPuttingStatsSummary();
  renderPracticeActivity();
  renderPracticeHistory();
}

function updatePuttingRunningStat() {
  const el = document.getElementById("puttRunning");
  if (!el) return;
  const n = puttingState.shots.length;
  if (n === 0) { el.textContent = "0 putts logged"; return; }
  const makeShots = puttingState.shots.filter(function (s) { return s.intent === "make"; });
  if (makeShots.length === 0) {
    const lag = puttingState.shots.filter(function (s) { return s.intent === "lag"; });
    const inCircle = lag.filter(function (s) { return s.result === "Holed" || s.result === "In Circle"; }).length;
    el.textContent = n + " lag putts · " + Math.round(inCircle / lag.length * 100) + "% in circle";
    return;
  }
  const made = makeShots.filter(function (s) { return s.result === "Holed"; }).length;
  el.textContent = n + " putts · " + made + " made · " + Math.round(made / makeShots.length * 100) + "%";
}

function recordPutt(result, lagResult) {
  // Distance from the active range pill; "Custom" reads the typed input.
  let dist;
  if (puttingState.conditions.rangeId === "custom") {
    dist = Number(document.getElementById("puttDistance").value) || puttingState.conditions.distance;
  } else {
    dist = puttingState.conditions.distance;
  }
  const intent = puttingState.conditions.intent;
  let resolvedResult;
  let finishDist = null;
  if (intent === "lag") {
    finishDist = Number(document.getElementById("puttFinishDist").value);
    resolvedResult = lagResult || (finishDist != null && finishDist <= Number(document.getElementById("puttCircle").value || 5) ? "In Circle" : "Outside Circle");
  } else {
    resolvedResult = result;
  }
  puttingState.shots.push({
    timestamp: new Date().toISOString(),
    distance: dist,
    rangeId: puttingState.conditions.rangeId,
    break: puttingState.conditions.break,
    slope: puttingState.conditions.slope,
    speed: puttingState.conditions.speed,
    intent, result: resolvedResult, finishDist,
  });
  updatePuttingRunningStat();
  const fd = document.getElementById("puttFinishDist");
  if (fd) fd.value = "";
}

function setPracticePill(group, key, value) {
  document.querySelectorAll("#" + group + " .pill").forEach(function (p) {
    p.classList.toggle("active", p.dataset[key] === value);
  });
  puttingState.conditions[key] = value;
}

// ---------------- Chipping ----------------
const chippingState = {
  active: false, sessionStart: null, shots: [],
  conditions: { distance: 20, lie: "fairway", slope: "flat", club: "SW", rangeId: null },
};

function renderChippingRangePills() {
  const wrap = document.getElementById("chipRangePills");
  if (!wrap) return;
  const ranges = getChippingRanges();
  let html = "";
  for (const r of ranges) {
    const sub = r.max < 999 ? r.min + "-" + r.max + " yd" : r.min + "+ yd";
    html += '<button class="pill" type="button" data-range-id="' + r.id + '" data-rep="' + r.rep + '" style="flex:1;">' + r.label + '<br><span style="font-size:10px; opacity:0.75;">' + sub + '</span></button>';
  }
  html += '<button class="pill" type="button" data-range-id="custom" style="flex:1;">Custom<br><span style="font-size:10px; opacity:0.75;">type yd</span></button>';
  wrap.innerHTML = html;
  const first = wrap.querySelector(".pill");
  if (first) {
    first.classList.add("active");
    chippingState.conditions.rangeId = first.dataset.rangeId;
    chippingState.conditions.distance = Number(first.dataset.rep) || 20;
  }
  wrap.querySelectorAll(".pill").forEach(function (p) {
    p.addEventListener("click", function () {
      wrap.querySelectorAll(".pill").forEach(function (x) { x.classList.remove("active"); });
      p.classList.add("active");
      const id = p.dataset.rangeId;
      chippingState.conditions.rangeId = id;
      const customRow = document.getElementById("chipCustomDistanceRow");
      if (id === "custom") {
        if (customRow) customRow.style.display = "";
        const di = document.getElementById("chipDistance");
        if (di) chippingState.conditions.distance = Number(di.value) || 20;
      } else {
        if (customRow) customRow.style.display = "none";
        chippingState.conditions.distance = Number(p.dataset.rep) || 20;
      }
    });
  });
}

function setChipPill(group, key, value) {
  document.querySelectorAll("#" + group + " .pill").forEach(function (p) {
    p.classList.toggle("active", p.dataset[key] === value);
  });
  chippingState.conditions[key] = value;
}

function startChippingDrill() {
  chippingState.active = true;
  chippingState.sessionStart = new Date().toISOString();
  chippingState.shots = [];
  document.getElementById("practicePickerView").style.display = "none";
  document.getElementById("chippingView").style.display = "";
  renderChippingRangePills();
  updateChippingRunningStat();
}

function endChippingDrill() {
  if (!chippingState.active) return;
  const shotsSnapshot = chippingState.shots.slice();
  if (shotsSnapshot.length > 0) {
    const arr = getPractice();
    const ended = new Date();
    const startedAt = new Date(chippingState.sessionStart);
    const durationMin = Math.max(1, Math.round((ended - startedAt) / 60000));
    arr.push({
      date: todayISO(), area: "Chipping", type: "Chipping", duration: durationMin,
      focus: "Drill — " + shotsSnapshot.length + " chips", notes: "",
      savedAt: ended.toISOString(), shots: shotsSnapshot,
    });
    savePractice(arr);
    const ud = shotsSnapshot.filter(function (s) { return CHIP_UD.indexOf(s.result) !== -1; }).length;
    const pct = shotsSnapshot.length > 0 ? Math.round(ud / shotsSnapshot.length * 100) : null;
    const ranges = getChippingRanges();
    const byRange = ranges.map(function (r) {
      const inB = shotsSnapshot.filter(function (s) {
        if (s.rangeId && s.rangeId !== "custom") return s.rangeId === r.id;
        return s.distance >= r.min && s.distance < (r.max >= 999 ? 99999 : r.max);
      });
      if (inB.length === 0) return null;
      const udC = inB.filter(function (s) { return CHIP_UD.indexOf(s.result) !== -1; }).length;
      return { label: r.label, count: inB.length, pct: Math.round(udC / inB.length * 100) };
    }).filter(Boolean);
    showSessionSummary({
      title: "Chipping session — done",
      shots: shotsSnapshot,
      subStat: "chips",
      pct: pct,
      pctLabel: "Up-&-down chance",
      byRange: byRange,
    });
  }
  chippingState.active = false;
  chippingState.shots = [];
  document.getElementById("chippingView").style.display = "none";
  document.getElementById("practicePickerView").style.display = "";
  renderChippingStatsSummary();
  renderPracticeActivity();
  renderPracticeHistory();
}

function updateChippingRunningStat() {
  const el = document.getElementById("chipRunning");
  if (!el) return;
  const n = chippingState.shots.length;
  if (n === 0) { el.textContent = "0 chips logged"; return; }
  const ud = chippingState.shots.filter(function (s) { return CHIP_UD.indexOf(s.result) !== -1; }).length;
  el.textContent = n + " chips · " + ud + " up-&-down chance · " + Math.round(ud / n * 100) + "%";
}

function recordChip(result) {
  let dist;
  if (chippingState.conditions.rangeId === "custom") {
    dist = Number(document.getElementById("chipDistance").value) || chippingState.conditions.distance;
  } else {
    dist = chippingState.conditions.distance;
  }
  chippingState.shots.push({
    timestamp: new Date().toISOString(), distance: dist,
    rangeId: chippingState.conditions.rangeId,
    lie: chippingState.conditions.lie,
    slope: chippingState.conditions.slope,
    club: chippingState.conditions.club,
    result,
  });
  updateChippingRunningStat();
}

export function renderChippingStatsSummary() {
  const el = document.getElementById("chipStatsSummary");
  if (!el) return;
  const ins = getChippingInsights();
  if (ins.totalShots === 0) {
    el.innerHTML = "Log some chips to see your up-and-down rate.";
    return;
  }
  let html = "";
  for (const b of ins.distanceRates) {
    if (b.count === 0) continue;
    html += '<div class="stat-line"><span>' + b.label + " (" + b.count + ")</span><span class=\"stat-num\">" + b.pct + "%</span></div>";
  }
  if (ins.topMiss) html += '<div class="stat-line"><span>Most common miss</span><span class="stat-num">' + ins.topMiss + "</span></div>";
  if (ins.mishitPct != null && ins.totalShots >= 3) html += '<div class="stat-line"><span>Chunk / blade rate</span><span class="stat-num">' + ins.mishitPct + "%</span></div>";
  el.innerHTML = html || "No chips logged yet.";
}

// ---------------- Irons ----------------
const ironState = {
  active: false, sessionStart: null, shots: [],
  conditions: { club: "7i", shape: "straight", target: null },
};

function setIronPill(group, key, value) {
  document.querySelectorAll("#" + group + " .pill").forEach(function (p) {
    p.classList.toggle("active", p.dataset[key] === value);
  });
  ironState.conditions[key] = value;
}

function startIronDrill() {
  ironState.active = true;
  ironState.sessionStart = new Date().toISOString();
  ironState.shots = [];
  document.getElementById("practicePickerView").style.display = "none";
  document.getElementById("ironView").style.display = "";
  updateIronRunningStat();
}

function endIronDrill() {
  if (!ironState.active) return;
  const shotsSnapshot = ironState.shots.slice();
  if (shotsSnapshot.length > 0) {
    const arr = getPractice();
    const ended = new Date();
    const startedAt = new Date(ironState.sessionStart);
    const durationMin = Math.max(1, Math.round((ended - startedAt) / 60000));
    arr.push({
      date: todayISO(), area: "Irons", type: "Irons", duration: durationMin,
      focus: "Drill — " + shotsSnapshot.length + " shots", notes: "",
      savedAt: ended.toISOString(), shots: shotsSnapshot,
    });
    savePractice(arr);
    const good = shotsSnapshot.filter(function (s) { return IRON_GOOD_RESULTS.indexOf(s.result) !== -1; }).length;
    const pct = shotsSnapshot.length > 0 ? Math.round(good / shotsSnapshot.length * 100) : null;
    const byClub = {};
    for (const s of shotsSnapshot) {
      if (!byClub[s.club]) byClub[s.club] = { n: 0, good: 0 };
      byClub[s.club].n++;
      if (IRON_GOOD_RESULTS.indexOf(s.result) !== -1) byClub[s.club].good++;
    }
    const byRange = Object.keys(byClub).map(function (c) {
      const b = byClub[c];
      return { label: c, count: b.n, pct: Math.round(b.good / b.n * 100) };
    });
    showSessionSummary({
      title: "Iron session — done",
      shots: shotsSnapshot,
      subStat: "shots",
      pct: pct,
      pctLabel: "On target",
      byRange: byRange,
    });
  }
  ironState.active = false;
  ironState.shots = [];
  document.getElementById("ironView").style.display = "none";
  document.getElementById("practicePickerView").style.display = "";
  renderIronStatsSummary();
  renderPracticeActivity();
  renderPracticeHistory();
}

function updateIronRunningStat() {
  const el = document.getElementById("ironRunning");
  if (!el) return;
  const n = ironState.shots.length;
  if (n === 0) { el.textContent = "0 shots logged"; return; }
  const good = ironState.shots.filter(function (s) { return IRON_GOOD_RESULTS.indexOf(s.result) !== -1; }).length;
  el.textContent = n + " shots · " + good + " on target · " + Math.round(good / n * 100) + "%";
}

function recordIron(result) {
  const target = Number(document.getElementById("ironTarget").value) || null;
  const carry = Number(document.getElementById("ironCarry").value) || null;
  ironState.shots.push({
    timestamp: new Date().toISOString(),
    club: ironState.conditions.club,
    target, carry,
    shape: ironState.conditions.shape,
    result,
  });
  updateIronRunningStat();
  document.getElementById("ironCarry").value = "";
}

export function renderIronStatsSummary() {
  const el = document.getElementById("ironStatsSummary");
  if (!el) return;
  const ins = getIronInsights();
  if (ins.totalShots === 0) {
    el.innerHTML = "Log some iron shots to see your yardage gapping.";
    return;
  }
  let html = "";
  for (const cs of ins.clubStats) {
    if (cs.avgCarry != null) {
      html += '<div class="stat-line"><span>' + cs.club + " (" + cs.count + ")</span><span class=\"stat-num\">" + cs.avgCarry + " y avg</span></div>";
    } else {
      html += '<div class="stat-line"><span>' + cs.club + " (" + cs.count + ")</span><span class=\"stat-num\">" + cs.onTargetPct + "% on tgt</span></div>";
    }
  }
  if (ins.pureStrikePct != null) html += '<div class="stat-line"><span>Pure-strike rate</span><span class="stat-num">' + ins.pureStrikePct + "%</span></div>";
  if (ins.topMiss) html += '<div class="stat-line"><span>Most common miss</span><span class="stat-num">' + ins.topMiss + "</span></div>";
  el.innerHTML = html || "No iron shots logged yet.";
}

// ---------------- Driver / wood ----------------
const driverState = {
  active: false, sessionStart: null, shots: [],
  conditions: { club: "Driver", shape: "straight" },
};

function setDrvPill(group, key, value) {
  document.querySelectorAll("#" + group + " .pill").forEach(function (p) {
    p.classList.toggle("active", p.dataset[key] === value);
  });
  driverState.conditions[key] = value;
}

function startDriverDrill() {
  driverState.active = true;
  driverState.sessionStart = new Date().toISOString();
  driverState.shots = [];
  document.getElementById("practicePickerView").style.display = "none";
  document.getElementById("driverView").style.display = "";
  updateDriverRunningStat();
}

function endDriverDrill() {
  if (!driverState.active) return;
  const shotsSnapshot = driverState.shots.slice();
  if (shotsSnapshot.length > 0) {
    const arr = getPractice();
    const ended = new Date();
    const startedAt = new Date(driverState.sessionStart);
    const durationMin = Math.max(1, Math.round((ended - startedAt) / 60000));
    arr.push({
      date: todayISO(), area: "Driver", type: "Driver", duration: durationMin,
      focus: "Drill — " + shotsSnapshot.length + " tee shots", notes: "",
      savedAt: ended.toISOString(), shots: shotsSnapshot,
    });
    savePractice(arr);
    const fw = shotsSnapshot.filter(function (s) { return DRV_FAIRWAY_RESULTS.indexOf(s.result) !== -1; }).length;
    const pct = shotsSnapshot.length > 0 ? Math.round(fw / shotsSnapshot.length * 100) : null;
    const byClub = {};
    for (const s of shotsSnapshot) {
      if (!byClub[s.club]) byClub[s.club] = { n: 0, fw: 0 };
      byClub[s.club].n++;
      if (DRV_FAIRWAY_RESULTS.indexOf(s.result) !== -1) byClub[s.club].fw++;
    }
    const byRange = Object.keys(byClub).map(function (c) {
      const b = byClub[c];
      return { label: c, count: b.n, pct: Math.round(b.fw / b.n * 100) };
    });
    showSessionSummary({
      title: "Tee shots — done",
      shots: shotsSnapshot,
      subStat: "tee shots",
      pct: pct,
      pctLabel: "Fairways hit",
      byRange: byRange,
    });
  }
  driverState.active = false;
  driverState.shots = [];
  document.getElementById("driverView").style.display = "none";
  document.getElementById("practicePickerView").style.display = "";
  renderDriverStatsSummary();
  renderPracticeActivity();
  renderPracticeHistory();
}

function updateDriverRunningStat() {
  const el = document.getElementById("drvRunning");
  if (!el) return;
  const n = driverState.shots.length;
  if (n === 0) { el.textContent = "0 shots logged"; return; }
  const fw = driverState.shots.filter(function (s) { return DRV_FAIRWAY_RESULTS.indexOf(s.result) !== -1; }).length;
  el.textContent = n + " tee shots · " + fw + " fairways · " + Math.round(fw / n * 100) + "%";
}

function recordDriver(result) {
  const carry = Number(document.getElementById("drvCarry").value) || null;
  const total = Number(document.getElementById("drvTotal").value) || null;
  driverState.shots.push({
    timestamp: new Date().toISOString(),
    club: driverState.conditions.club,
    carry, total,
    shape: driverState.conditions.shape,
    result,
  });
  updateDriverRunningStat();
  document.getElementById("drvCarry").value = "";
  document.getElementById("drvTotal").value = "";
}

export function renderDriverStatsSummary() {
  const el = document.getElementById("driverStatsSummary");
  if (!el) return;
  const ins = getDriverInsights();
  if (ins.totalShots === 0) {
    el.innerHTML = "Log some tee shots to see your fairway %.";
    return;
  }
  let html = "";
  for (const cs of ins.clubStats) {
    const carryStr = cs.avgCarry != null ? cs.avgCarry + "y" : "—";
    html += '<div class="stat-line"><span>' + cs.club + " (" + cs.count + ")</span><span class=\"stat-num\">" + carryStr + " · " + cs.fairwayPct + "% FW</span></div>";
  }
  if (ins.topMiss) html += '<div class="stat-line"><span>Most common miss</span><span class="stat-num">' + ins.topMiss + "</span></div>";
  if (ins.leftMisses + ins.rightMisses > 0) {
    const bias = ins.leftMisses > ins.rightMisses ? "Left-side bias" : (ins.rightMisses > ins.leftMisses ? "Right-side bias" : "Balanced");
    html += '<div class="stat-line"><span>Miss bias</span><span class="stat-num">' + bias + "</span></div>";
  }
  el.innerHTML = html || "No tee shots logged yet.";
}

// ---------------- Recent practice history (picker card) ----------------
// Quick scrollable list of the last N sessions so the player sees what
// they've actually done lately. Each row links to nothing (read-only);
// keeps the picker honest about session frequency.
export function renderPracticeHistory() {
  const el = document.getElementById("practiceHistoryList");
  if (!el) return;
  const sessions = getPractice().slice().sort(function (a, b) {
    return (b.savedAt || "").localeCompare(a.savedAt || "");
  }).slice(0, 8);
  if (sessions.length === 0) {
    el.innerHTML = '<div style="font-size:13px; color:var(--muted);">No sessions yet. Your first one shows up here.</div>';
    return;
  }
  const iconFor = { Putting: "⛳", Chipping: "◐", Irons: "─", Driver: "▲" };
  let html = "";
  for (const s of sessions) {
    const ico = iconFor[s.type] || "•";
    const n = Array.isArray(s.shots) ? s.shots.length : 0;
    // Headline stat per skill
    let stat = "";
    if (s.type === "Putting" && n > 0) {
      const mk = s.shots.filter(function (x) { return x.intent === "make"; });
      const made = mk.filter(function (x) { return x.result === "Holed"; }).length;
      if (mk.length > 0) stat = Math.round(made / mk.length * 100) + "% make";
      else stat = n + " lag";
    } else if (s.type === "Chipping" && n > 0) {
      const ud = s.shots.filter(function (x) { return CHIP_UD.indexOf(x.result) !== -1; }).length;
      stat = Math.round(ud / n * 100) + "% U&D";
    } else if (s.type === "Irons" && n > 0) {
      const good = s.shots.filter(function (x) { return IRON_GOOD_RESULTS.indexOf(x.result) !== -1; }).length;
      stat = Math.round(good / n * 100) + "% on tgt";
    } else if (s.type === "Driver" && n > 0) {
      const fw = s.shots.filter(function (x) { return DRV_FAIRWAY_RESULTS.indexOf(x.result) !== -1; }).length;
      stat = Math.round(fw / n * 100) + "% FW";
    }
    const when = s.date || "—";
    html += '<div class="stat-line" style="padding:8px 0; border-bottom:1px solid var(--line);">';
    html += '<span><span style="display:inline-block; width:18px;">' + ico + '</span> ' + s.type + ' · <span style="color:var(--muted); font-size:12px;">' + when + '</span></span>';
    html += '<span class="stat-num" style="font-size:13px;">' + n + ' · ' + stat + '</span>';
    html += '</div>';
  }
  el.innerHTML = html;
}

// ---------------- Profile: edit custom ranges ----------------
function renderRangeEditor(opts) {
  const wrap = document.getElementById(opts.containerId);
  if (!wrap) return;
  const ranges = opts.get();
  let html = '<div style="font-size:12px; color:var(--muted); margin-bottom:8px;">Tap a range, edit the min/max distance (in ' + opts.unit + '). Keep ranges in order.</div>';
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    html += '<div class="profile-row" style="display:grid; grid-template-columns: 1fr 70px 70px; gap:6px; align-items:center; padding:6px 0;">';
    html += '  <input type="text" data-range-idx="' + i + '" data-range-field="label" value="' + (r.label || "") + '" style="padding:6px 8px;" />';
    html += '  <input type="number" data-range-idx="' + i + '" data-range-field="min" value="' + r.min + '" min="0" style="padding:6px 8px; text-align:right;" />';
    html += '  <input type="number" data-range-idx="' + i + '" data-range-field="max" value="' + (r.max >= 999 ? "" : r.max) + '" placeholder="∞" style="padding:6px 8px; text-align:right;" />';
    html += '</div>';
  }
  html += '<div style="display:flex; gap:8px; margin-top:10px;">';
  html += '  <button type="button" data-action="save" class="ai-action-btn" style="flex:1;">Save</button>';
  html += '  <button type="button" data-action="reset" class="btn-secondary" style="flex:1;">Reset to defaults</button>';
  html += '</div>';
  html += '<div data-msg style="font-size:12px; color:var(--green-deep); margin-top:6px; height:14px;"></div>';
  wrap.innerHTML = html;

  function readRanges() {
    const current = opts.get();
    return current.map(function (r, i) {
      const labelEl = wrap.querySelector('[data-range-idx="' + i + '"][data-range-field="label"]');
      const minEl = wrap.querySelector('[data-range-idx="' + i + '"][data-range-field="min"]');
      const maxEl = wrap.querySelector('[data-range-idx="' + i + '"][data-range-field="max"]');
      const label = (labelEl && labelEl.value.trim()) || r.label;
      const min = Number(minEl && minEl.value);
      const maxRaw = (maxEl && maxEl.value.trim()) || "";
      const max = maxRaw === "" ? 999 : Number(maxRaw);
      const rep = max >= 999 ? Math.round(min + (opts.unit === "ft" ? 10 : 15)) : Math.round((min + max) / 2);
      return { id: r.id, label, rep, min: Math.max(0, min), max: Math.max(min + 1, max) };
    });
  }

  wrap.querySelector('[data-action="save"]').addEventListener("click", function () {
    const next = readRanges();
    opts.save(next);
    const msg = wrap.querySelector('[data-msg]');
    if (msg) {
      msg.textContent = "Saved · these ranges show up in the drill pills.";
      setTimeout(function () { if (msg) msg.textContent = ""; }, 2500);
    }
  });
  wrap.querySelector('[data-action="reset"]').addEventListener("click", function () {
    opts.save(opts.defaults.slice());
    renderRangeEditor(opts);
    const msg = wrap.querySelector('[data-msg]');
    if (msg) {
      msg.textContent = "Reset to defaults.";
      setTimeout(function () { if (msg) msg.textContent = ""; }, 2500);
    }
  });
}

export function renderPracticeRangesEditor() {
  renderRangeEditor({
    containerId: "puttingRangesEditor",
    unit: "ft",
    get: getPuttingRanges,
    save: savePuttingRanges,
    defaults: DEFAULT_PUTTING_RANGES,
  });
  renderRangeEditor({
    containerId: "chippingRangesEditor",
    unit: "yd",
    get: getChippingRanges,
    save: saveChippingRanges,
    defaults: DEFAULT_CHIPPING_RANGES,
  });
}

// ---------------- Wiring ----------------
export function wirePracticeUi() {
  const sscClose = document.getElementById("sessionSummaryClose");
  if (sscClose) sscClose.addEventListener("click", closeSessionSummary);
  const sscOk = document.getElementById("sessionSummaryOk");
  if (sscOk) sscOk.addEventListener("click", closeSessionSummary);

  document.querySelectorAll(".practice-type-tile").forEach(function (tile) {
    tile.addEventListener("click", function () {
      const t = tile.dataset.prac;
      if (t === "putting") startPuttingDrill();
      else if (t === "chipping") startChippingDrill();
      else if (t === "iron") startIronDrill();
      else if (t === "driver") startDriverDrill();
      else alert("Drill coming next.");
    });
  });

  document.querySelectorAll("#drvClubPills .pill").forEach(function (p) {
    p.addEventListener("click", function () { setDrvPill("drvClubPills", "club", p.dataset.club); });
  });
  document.querySelectorAll("#drvShapePills .pill").forEach(function (p) {
    p.addEventListener("click", function () { setDrvPill("drvShapePills", "shape", p.dataset.shape); });
  });
  document.querySelectorAll("#driverView .result-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { recordDriver(btn.dataset.drvResult); });
  });
  const drvBackBtn = document.getElementById("drvBackBtn");
  if (drvBackBtn) drvBackBtn.addEventListener("click", endDriverDrill);
  const drvEndBtn = document.getElementById("drvEndBtn");
  if (drvEndBtn) drvEndBtn.addEventListener("click", endDriverDrill);

  document.querySelectorAll("#ironClubPills .pill").forEach(function (p) {
    p.addEventListener("click", function () { setIronPill("ironClubPills", "club", p.dataset.club); });
  });
  document.querySelectorAll("#ironShapePills .pill").forEach(function (p) {
    p.addEventListener("click", function () { setIronPill("ironShapePills", "shape", p.dataset.shape); });
  });
  document.querySelectorAll("#ironView .result-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { recordIron(btn.dataset.ironResult); });
  });
  const ironBackBtn = document.getElementById("ironBackBtn");
  if (ironBackBtn) ironBackBtn.addEventListener("click", endIronDrill);
  const ironEndBtn = document.getElementById("ironEndBtn");
  if (ironEndBtn) ironEndBtn.addEventListener("click", endIronDrill);

  document.querySelectorAll("#chipLiePills .pill").forEach(function (p) {
    p.addEventListener("click", function () { setChipPill("chipLiePills", "lie", p.dataset.lie); });
  });
  document.querySelectorAll("#chipSlopePills .pill").forEach(function (p) {
    p.addEventListener("click", function () { setChipPill("chipSlopePills", "slope", p.dataset.slope); });
  });
  document.querySelectorAll("#chipClubPills .pill").forEach(function (p) {
    p.addEventListener("click", function () { setChipPill("chipClubPills", "club", p.dataset.club); });
  });
  document.querySelectorAll("#chippingView .result-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { recordChip(btn.dataset.chipResult); });
  });
  const chipBackBtn = document.getElementById("chipBackBtn");
  if (chipBackBtn) chipBackBtn.addEventListener("click", endChippingDrill);
  const chipEndBtn = document.getElementById("chipEndBtn");
  if (chipEndBtn) chipEndBtn.addEventListener("click", endChippingDrill);

  document.querySelectorAll("#puttBreakPills .pill").forEach(function (p) {
    p.addEventListener("click", function () { setPracticePill("puttBreakPills", "break", p.dataset.break); });
  });
  document.querySelectorAll("#puttSlopePills .pill").forEach(function (p) {
    p.addEventListener("click", function () { setPracticePill("puttSlopePills", "slope", p.dataset.slope); });
  });
  document.querySelectorAll("#puttSpeedPills .pill").forEach(function (p) {
    p.addEventListener("click", function () { setPracticePill("puttSpeedPills", "speed", p.dataset.speed); });
  });
  document.querySelectorAll("#puttIntentPills .pill").forEach(function (p) {
    p.addEventListener("click", function () {
      setPracticePill("puttIntentPills", "intent", p.dataset.intent);
      const lagRow = document.getElementById("puttLagRow");
      const makeRes = document.getElementById("puttMakeResults");
      const lagRes = document.getElementById("puttLagResults");
      if (p.dataset.intent === "lag") {
        lagRow.style.display = "";
        makeRes.style.display = "none";
        lagRes.style.display = "";
      } else {
        lagRow.style.display = "none";
        makeRes.style.display = "";
        lagRes.style.display = "none";
      }
    });
  });
  document.querySelectorAll("#puttMakeResults .result-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { recordPutt(btn.dataset.result); });
  });
  document.querySelectorAll("#puttLagResults .result-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { recordPutt(null, btn.dataset.lagResult); });
  });
  const puttBackBtn = document.getElementById("puttBackBtn");
  if (puttBackBtn) puttBackBtn.addEventListener("click", endPuttingDrill);
  const puttEndBtn = document.getElementById("puttEndBtn");
  if (puttEndBtn) puttEndBtn.addEventListener("click", endPuttingDrill);
}
