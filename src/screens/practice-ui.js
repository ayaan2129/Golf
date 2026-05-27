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
  CHIP_UD,
  IRON_GOOD_RESULTS,
  DRV_FAIRWAY_RESULTS,
} from "../data/practice.js";

// ---------------- Putting ----------------
const puttingState = {
  active: false,
  sessionStart: null,
  shots: [],
  conditions: { distance: 5, break: "straight", slope: "flat", speed: "medium", intent: "make", circle: 5 },
};

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
    if (b.count === 0) continue;
    html += '<div class="stat-line"><span>' + b.label + " (" + b.count + ")</span><span class=\"stat-num\">" + b.pct + "%</span></div>";
  }
  if (ins.topMiss) html += '<div class="stat-line"><span>Most common miss</span><span class="stat-num">' + ins.topMiss + "</span></div>";
  if (ins.lag) html += '<div class="stat-line"><span>Lag in circle (' + ins.lag.count + ")</span><span class=\"stat-num\">" + ins.lag.inCirclePct + "%</span></div>";
  el.innerHTML = html || "No make-intent putts yet.";
}

function startPuttingDrill() {
  puttingState.active = true;
  puttingState.sessionStart = new Date().toISOString();
  puttingState.shots = [];
  document.getElementById("practicePickerView").style.display = "none";
  document.getElementById("puttingView").style.display = "";
  updatePuttingRunningStat();
}

function endPuttingDrill() {
  if (!puttingState.active) return;
  if (puttingState.shots.length > 0) {
    const arr = getPractice();
    const ended = new Date();
    const startedAt = new Date(puttingState.sessionStart);
    const durationMin = Math.max(1, Math.round((ended - startedAt) / 60000));
    arr.push({
      date: todayISO(), area: "Putting", type: "Putting", duration: durationMin,
      focus: "Drill — " + puttingState.shots.length + " putts", notes: "",
      savedAt: ended.toISOString(), shots: puttingState.shots.slice(),
    });
    savePractice(arr);
  }
  puttingState.active = false;
  puttingState.shots = [];
  document.getElementById("puttingView").style.display = "none";
  document.getElementById("practicePickerView").style.display = "";
  renderPuttingStatsSummary();
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
  const dist = Number(document.getElementById("puttDistance").value) || puttingState.conditions.distance;
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
    break: puttingState.conditions.break,
    slope: puttingState.conditions.slope,
    speed: puttingState.conditions.speed,
    intent, result: resolvedResult, finishDist,
  });
  updatePuttingRunningStat();
  document.getElementById("puttFinishDist").value = "";
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
  conditions: { distance: 20, lie: "fairway", slope: "flat", club: "SW" },
};

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
  updateChippingRunningStat();
}

function endChippingDrill() {
  if (!chippingState.active) return;
  if (chippingState.shots.length > 0) {
    const arr = getPractice();
    const ended = new Date();
    const startedAt = new Date(chippingState.sessionStart);
    const durationMin = Math.max(1, Math.round((ended - startedAt) / 60000));
    arr.push({
      date: todayISO(), area: "Chipping", type: "Chipping", duration: durationMin,
      focus: "Drill — " + chippingState.shots.length + " chips", notes: "",
      savedAt: ended.toISOString(), shots: chippingState.shots.slice(),
    });
    savePractice(arr);
  }
  chippingState.active = false;
  chippingState.shots = [];
  document.getElementById("chippingView").style.display = "none";
  document.getElementById("practicePickerView").style.display = "";
  renderChippingStatsSummary();
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
  const dist = Number(document.getElementById("chipDistance").value) || chippingState.conditions.distance;
  chippingState.shots.push({
    timestamp: new Date().toISOString(), distance: dist,
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
  if (ironState.shots.length > 0) {
    const arr = getPractice();
    const ended = new Date();
    const startedAt = new Date(ironState.sessionStart);
    const durationMin = Math.max(1, Math.round((ended - startedAt) / 60000));
    arr.push({
      date: todayISO(), area: "Irons", type: "Irons", duration: durationMin,
      focus: "Drill — " + ironState.shots.length + " shots", notes: "",
      savedAt: ended.toISOString(), shots: ironState.shots.slice(),
    });
    savePractice(arr);
  }
  ironState.active = false;
  ironState.shots = [];
  document.getElementById("ironView").style.display = "none";
  document.getElementById("practicePickerView").style.display = "";
  renderIronStatsSummary();
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
  if (driverState.shots.length > 0) {
    const arr = getPractice();
    const ended = new Date();
    const startedAt = new Date(driverState.sessionStart);
    const durationMin = Math.max(1, Math.round((ended - startedAt) / 60000));
    arr.push({
      date: todayISO(), area: "Driver", type: "Driver", duration: durationMin,
      focus: "Drill — " + driverState.shots.length + " tee shots", notes: "",
      savedAt: ended.toISOString(), shots: driverState.shots.slice(),
    });
    savePractice(arr);
  }
  driverState.active = false;
  driverState.shots = [];
  document.getElementById("driverView").style.display = "none";
  document.getElementById("practicePickerView").style.display = "";
  renderDriverStatsSummary();
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

// ---------------- Wiring ----------------
export function wirePracticeUi() {
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
