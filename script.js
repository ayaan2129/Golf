// Entry point. Imports from ./src/* modules; rest of this file is being
// extracted screen-by-screen into ./src/screens/*. See CONTRIBUTING.md.
import {
  getAccounts,
  saveAccounts,
  getCurrentUsername,
  setCurrentUsername,
  currentAccount,
  isLoggedIn,
} from "./src/core/storage.js";
import { todayISO, calcAge, escapeAttr, escapeHtml } from "./src/core/utils.js";
import {
  COURSES,
  DEFAULT_COURSE_LOCATION,
  locationFor,
  BAD_QUALITIES,
  ALL_CLUBS,
  DEFAULT_CLUBS,
} from "./src/core/courses.js";
import {
  getHistory, saveHistory, getUpcoming, saveUpcoming,
  getStrokesGainedLite, getConfidenceClub, getTopAvoid,
  getScoringZone, getPracticeTransfer, getApproachProximity,
} from "./src/data/rounds.js";
import {
  getPractice, savePractice,
  getPuttingInsights, getChippingInsights, getIronInsights, getDriverInsights,
  getPracticeActivity, getPuttingTrend,
  CHIP_GOOD, CHIP_UD,
  IRON_GOOD_RESULTS, IRON_ACCEPTABLE_RESULTS,
  DRV_FAIRWAY_RESULTS, DRV_PLAYABLE_RESULTS,
} from "./src/data/practice.js";
import {
  getProfile, saveProfile, setProfileField,
  getClubDistance, setClubDistance,
  getSelectedClubs, saveSelectedClubs,
  getObservedClubCarry,
  MAX_CLUBS,
} from "./src/data/profile.js";
import {
  openVideoDB, putVideoBlob, getVideoBlob, deleteVideoBlob,
  getVideoIndex, saveVideoIndex, videoNewId,
} from "./src/data/videos.js";
import { fetchWeatherForDate, weatherCodeToText } from "./src/data/weather.js";
import { aiEnabled, getGrokKey, getProxyUrl, callGrok } from "./src/ai/grok.js";
import { aiBaseContext, setAiOutput } from "./src/ai/context.js";
import {
  generateRoundReport,
  generatePracticePlan,
  generatePreRoundBrief,
  generateTournamentBrief,
  generateGoalPlan,
  generateCourseStrategy,
  generateTodaysFocus,
  analyseSwingFrame,
  analyzeSwingPhoto,
} from "./src/ai/generators.js";
import {
  renderPuttingStatsSummary,
  renderChippingStatsSummary,
  renderIronStatsSummary,
  renderDriverStatsSummary,
  renderPracticeActivity,
  renderPracticeHistory,
  renderPracticeRangesEditor,
  wirePracticeUi,
} from "./src/screens/practice-ui.js";
import { renderVideoLibrary, wireVideosUi } from "./src/screens/videos-ui.js";
import { wireCoachUi, openChatPanel, closeChatPanel } from "./src/screens/coach.js";
import { renderCategoriesGrid, wireStatsCategories } from "./src/screens/stats.js";
import { wireLoginUi } from "./src/screens/login.js";

// One-click activation URL handler: read ?key= / ?proxy= from the URL,
// stash them, and clean the URL bar so the credentials don't linger in
// browser history. applyUrlActivation() is called again after login to
// write the values under the logged-in user's localStorage namespace.
const __urlActivation = { key: null, proxy: null };
(function readUrlActivation() {
  try {
    const u = new URL(window.location.href);
    const key = u.searchParams.get("key");
    const proxy = u.searchParams.get("proxy");
    if (key && /^xai-/.test(key.trim())) __urlActivation.key = key.trim();
    if (proxy && /^https?:\/\//.test(proxy.trim())) __urlActivation.proxy = proxy.trim();
    if (__urlActivation.key || __urlActivation.proxy) {
      u.searchParams.delete("key");
      u.searchParams.delete("proxy");
      window.history.replaceState({}, "", u.pathname + (u.searchParams.toString() ? "?" + u.searchParams : "") + u.hash);
    }
  } catch (e) { /* non-fatal */ }
})();

function applyUrlActivationToCurrentUser() {
  if (!isLoggedIn()) return;
  let changed = false;
  if (__urlActivation.key) {
    localStorage.setItem("grokApiKey", __urlActivation.key);
    changed = true;
  }
  if (__urlActivation.proxy) {
    localStorage.setItem("aiProxyUrl", __urlActivation.proxy);
    changed = true;
  }
  if (changed) {
    localStorage.setItem("aiMode", "on");
    __urlActivation.key = null;
    __urlActivation.proxy = null;
    const ki = document.getElementById("grokApiKey");
    if (ki) ki.value = localStorage.getItem("grokApiKey") || "";
    const pi = document.getElementById("aiProxyUrl");
    if (pi) pi.value = localStorage.getItem("aiProxyUrl") || "";
    const tg = document.getElementById("aiModeToggle");
    if (tg) tg.checked = true;
    if (typeof renderAiStatus === "function") renderAiStatus();
  }
}
function setShellVisible(visible) {
  const header = document.getElementById("appHeader");
  if (header) header.style.display = visible ? "" : "none";
  const nav = document.getElementById("bottomNav");
  if (nav) nav.style.display = visible ? "" : "none";
}

function showLogin() {
  document.getElementById("loginScreen").style.display = "";
  document.getElementById("welcomeScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "none";
  setShellVisible(false);
}

// Returns the single most actionable practice weakness as { label, cue, metric }
// or null if there's not enough data to say anything specific.
function getPracticeInsight(pi, ci, ii, di) {
  const cues = [];

  // --- Putting: worst make-rate bucket with enough data ---
  if (pi && pi.distanceRates) {
    var worstBucket = null, worstPct = 100;
    for (var i = 0; i < pi.distanceRates.length; i++) {
      var b = pi.distanceRates[i];
      if (b.count >= 5 && b.pct !== null && b.pct < worstPct) {
        worstPct = b.pct; worstBucket = b;
      }
    }
    if (worstBucket && worstPct < 65) {
      cues.push({
        score: 65 - worstPct,
        label: worstBucket.label + " — " + worstPct + "% make rate",
        cue: "Drill " + worstBucket.label.split(" ")[0].toLowerCase() + " putts: 10-ball sets, one target, no rushing. Aim above 65%.",
      });
    }
  }

  // --- Putting: lag distance control ---
  if (pi && pi.lag && pi.lag.count >= 5 && pi.lag.inCirclePct < 60) {
    cues.push({
      score: 60 - pi.lag.inCirclePct,
      label: "Lag putting — " + pi.lag.inCirclePct + "% in circle",
      cue: "Practise 30-40 ft lags: land in a 3-ft circle. Soft hands, feel the pace, don't think direction.",
    });
  }

  // --- Putting: left/right miss tendency ---
  if (pi && pi.topMiss && pi.totalShots >= 10) {
    var missLabel = pi.topMiss;
    var missCue = null;
    if (missLabel === "Left") missCue = "Missing left consistently — check your aim at address, aim slightly right of hole and trust it.";
    else if (missLabel === "Right") missCue = "Missing right consistently — square your putter face at address, hold the follow-through straight.";
    if (missCue) cues.push({ score: 18, label: "Putting miss: " + missLabel.toLowerCase(), cue: missCue });
  }

  // --- Chipping: mishit rate (fat/blade) ---
  if (ci && ci.totalShots >= 8 && ci.mishitPct !== null && ci.mishitPct > 15) {
    cues.push({
      score: ci.mishitPct - 15,
      label: "Chipping — " + ci.mishitPct + "% chunk/blade rate",
      cue: "Weight forward at address (60% lead foot), brush turf first. Slow practice swings before each rep.",
    });
  }

  // --- Chipping: worst up-and-down bucket ---
  if (ci && ci.distanceRates) {
    var worstChip = null, worstChipPct = 100;
    for (var j = 0; j < ci.distanceRates.length; j++) {
      var cb = ci.distanceRates[j];
      if (cb.count >= 5 && cb.pct !== null && cb.pct < worstChipPct) {
        worstChipPct = cb.pct; worstChip = cb;
      }
    }
    if (worstChip && worstChipPct < 50) {
      cues.push({
        score: (50 - worstChipPct) * 0.7,
        label: worstChip.label + " chip — " + worstChipPct + "% up & down",
        cue: "Pick a specific landing spot 1-2 ft onto the green, let the ball roll to the pin. Commit to the landing.",
      });
    }
  }

  // --- Irons: pure strike rate ---
  if (ii && ii.totalShots >= 10 && ii.pureStrikePct !== null && ii.pureStrikePct < 65) {
    cues.push({
      score: 65 - ii.pureStrikePct,
      label: "Iron contact — " + ii.pureStrikePct + "% pure",
      cue: "Ball first, turf second. Slow back, pause at the top, drive hips first. Fat/thin = rushing the downswing.",
    });
  }

  // --- Irons: directional miss ---
  if (ii && ii.topMiss && ii.totalShots >= 10) {
    var ironMiss = ii.topMiss, ironCue = null;
    if (ironMiss === "Right") ironCue = "Irons trending right — check your grip (both thumbs on top), start down with the hips, not the arms.";
    else if (ironMiss === "Left") ironCue = "Irons trending left — don't flip the hands through impact, keep the trail elbow close on the way down.";
    else if (ironMiss === "Short") ironCue = "Coming up short on irons — are you catching it thin? Take one more club and swing at 90%.";
    if (ironCue) cues.push({ score: 20, label: "Iron miss: " + ironMiss.toLowerCase(), cue: ironCue });
  }

  // --- Driver: fairway rate ---
  if (di && di.totalShots >= 5) {
    var drvFw = null;
    if (di.clubStats && di.clubStats.length > 0) drvFw = di.clubStats[0].fairwayPct;
    if (drvFw !== null && drvFw < 40) {
      var sideBias = (di.rightMisses || 0) > (di.leftMisses || 0) ? "right" : ((di.leftMisses || 0) > (di.rightMisses || 0) ? "left" : null);
      var drvCue = "Tee it at 85% — a smooth swing finds more fairways than a hard one.";
      if (sideBias === "right") drvCue = "Driver missing right: tee the ball higher, close stance slightly, think 'swing left of target'.";
      else if (sideBias === "left") drvCue = "Driver missing left: relax grip pressure, feel the club face square at impact, don't flip.";
      cues.push({ score: 40 - drvFw, label: "Driver — " + drvFw + "% fairways", cue: drvCue });
    }
  }

  if (cues.length === 0) return null;
  cues.sort(function (a, b) { return b.score - a.score; });
  return cues[0];
}

function renderHomeDashboard() {
  const profile = getProfile();
  const acct = currentAccount();
  const name = profile.displayName || (acct && acct.displayName) || "Player";
  const greet = document.getElementById("welcomeName");
  if (greet) greet.textContent = name;

  const drawerWelcome = document.getElementById("drawerWelcome");
  if (drawerWelcome) drawerWelcome.textContent = name;

  // Avatar initial
  const avatar = document.getElementById("homeAvatar");
  if (avatar) avatar.textContent = (name || "P").charAt(0).toUpperCase();

  // Time-aware greeting prefix
  const today = new Date();
  const hour = today.getHours();
  let prefix = "Hi";
  if (hour < 5) prefix = "Still up";
  else if (hour < 11) prefix = "Good morning";
  else if (hour < 14) prefix = "Hi";
  else if (hour < 18) prefix = "Good afternoon";
  else if (hour < 22) prefix = "Good evening";
  else prefix = "Late night";
  const pfxEl = document.getElementById("homeGreetPrefix");
  if (pfxEl) pfxEl.textContent = prefix;

  const dayStr = today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const sub = document.getElementById("homeSub");
  if (sub) sub.textContent = dayStr;

  // Ongoing round card — shows when there's a saved-in-progress round (`golfRound` in localStorage)
  const ongoing = document.getElementById("homeOngoingCard");
  if (ongoing) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("golfRound") || "null"); } catch (e) {}
    const hasOngoing = saved && saved.setup && saved.setup.courseSelect && Object.keys(saved.holes || {}).length > 0;
    ongoing.style.display = hasOngoing ? "" : "none";
    if (hasOngoing) {
      const titleEl = document.getElementById("homeOngoingTitle");
      const subEl = document.getElementById("homeOngoingSub");
      if (titleEl) titleEl.textContent = saved.setup.courseSelect + (saved.setup.teeSelect ? " · " + saved.setup.teeSelect : "");
      if (subEl) {
        const filled = Object.keys(saved.holes || {}).filter(function (k) { return saved.holes[k].shots && saved.holes[k].shots.length > 0; }).length;
        const total = saved.setup.holesMode === "front9" || saved.setup.holesMode === "back9" ? 9 : 18;
        subEl.textContent = filled + " of " + total + " holes filled";
      }
    }
  }

  const history = getHistory();
  const hcEl = document.getElementById("homeHandicap");
  if (hcEl) hcEl.textContent = profile.handicap != null ? profile.handicap : "—";
  const bestEl = document.getElementById("homeBest");
  if (bestEl) {
    const scores = history.map(function (r) { return r.totalScore; }).filter(function (s) { return s > 0; });
    bestEl.textContent = scores.length > 0 ? Math.min.apply(null, scores) : "—";
  }
  const roundsEl = document.getElementById("homeRounds");
  if (roundsEl) roundsEl.textContent = history.length;

  const wxText = document.getElementById("homeWeatherText");
  if (wxText) {
    let w = null;
    try { w = JSON.parse(localStorage.getItem("currentWeather") || "null"); } catch (e) {}
    if (w) {
      wxText.textContent = Math.round(w.tempMax || 0) + "°C high · wind " + Math.round(w.windKmh || 0) + " km/h · " + (w.condition || "—");
    } else {
      // Auto-fetch today's weather for the default course
      const t = todayISO();
      const def = (document.getElementById("courseSelect") || {}).value || "RCGC";
      loadTemperatureForDate(t);
      const c = document.getElementById("homeCourse");
      if (c) c.textContent = def;
      wxText.textContent = "Loading...";
    }
  }
  const courseEl = document.getElementById("homeCourse");
  if (courseEl) {
    const defaultCourse = (history.length > 0 ? history[history.length - 1].courseName : "RCGC") || "RCGC";
    courseEl.textContent = defaultCourse;
  }

  const lastEl = document.getElementById("homeLastRoundText");
  if (lastEl) {
    if (history.length === 0) {
      lastEl.textContent = "No rounds yet — tap Start a Round.";
    } else {
      const r = history[history.length - 1];
      const diff = r.scoreVsPar >= 0 ? "+" + r.scoreVsPar : "" + r.scoreVsPar;
      lastEl.textContent = r.courseName + " " + (r.tee || "") + " · " + (r.date || "") + " · " + r.totalScore + " (" + diff + ")";
    }
  }

  const fEl = document.getElementById("homeFocusText");
  if (fEl) {
    const recent = history.slice(-3);
    const allMistakes = [];
    for (const r of recent) for (const m of (r.mistakes || [])) allMistakes.push(m);
    if (allMistakes.length > 0) {
      fEl.textContent = "Work on: " + allMistakes[0];
    } else {
      fEl.textContent = "Pick a target every shot. Stay smooth.";
    }
  }

  const tEl = document.getElementById("homeThoughtText");
  if (tEl) tEl.textContent = getDailyThought();

  // Coach's quick read — Confidence Club + Today's Avoid + last-round SG
  const intelCard = document.getElementById("homeCoachIntel");
  const intelBody = document.getElementById("homeCoachIntelBody");
  if (intelCard && intelBody) {
    const lines = [];
    const cclub = getConfidenceClub(getIronInsights(), getDriverInsights());
    if (cclub) lines.push('<div style="margin:4px 0;"><strong style="color:var(--green-deep);">Confidence club:</strong> ' + cclub.club + ' <span style="color:var(--muted); font-size:11px;">— ' + cclub.why + '</span></div>');
    const avoid = getTopAvoid(history);
    if (avoid) lines.push('<div style="margin:4px 0;"><strong style="color:var(--crimson);">Watch out for:</strong> ' + avoid.label + ' <span style="color:var(--muted); font-size:11px;">— ' + avoid.count + ' times in last 5 rounds</span></div>');
    if (history.length > 0) {
      const last = history[history.length - 1];
      const sg = getStrokesGainedLite(last, history);
      if (sg && sg.score != null) {
        const sign = sg.score > 0 ? "+" : "";
        const col = sg.score > 0 ? "var(--green-bright)" : (sg.score < 0 ? "var(--crimson)" : "var(--ink-soft)");
        let putts = "";
        if (sg.putts != null) {
          const psign = sg.putts > 0 ? "+" : "";
          const pcol = sg.putts > 0 ? "var(--green-bright)" : (sg.putts < 0 ? "var(--crimson)" : "var(--ink-soft)");
          putts = ' · <span style="color:' + pcol + ';">' + psign + sg.putts + ' putts</span>';
        }
        lines.push('<div style="margin:4px 0;"><strong>Last round vs your avg:</strong> <span style="color:' + col + ';">' + sign + sg.score + ' strokes</span>' + putts + '</div>');
      }
    }
    if (lines.length > 0) {
      intelBody.innerHTML = lines.join("");
      intelCard.style.display = "";
    } else {
      intelCard.style.display = "none";
    }
  }

  // Practice insight card — rule-based cue from practice data
  const piCard = document.getElementById("homePracticeInsight");
  const piLabel = document.getElementById("homePracticeInsightLabel");
  const piCue = document.getElementById("homePracticeInsightCue");
  if (piCard && piLabel && piCue) {
    const insight = getPracticeInsight(getPuttingInsights(), getChippingInsights(), getIronInsights(), getDriverInsights());
    if (insight) {
      piLabel.textContent = insight.label;
      piCue.textContent = insight.cue;
      piCard.style.display = "";
    } else {
      piCard.style.display = "none";
    }
  }

  syncDrawerActive("home");
}

function syncDrawerActive(target) {
  document.querySelectorAll(".drawer-item").forEach(function (b) {
    if (b.dataset.goTab === target) b.classList.add("active");
    else b.classList.remove("active");
  });
}

function openDrawer() {
  document.getElementById("sideDrawer").classList.add("open");
  document.getElementById("drawerBackdrop").classList.add("open");
}
function closeDrawer() {
  document.getElementById("sideDrawer").classList.remove("open");
  document.getElementById("drawerBackdrop").classList.remove("open");
}

function showWelcome() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("welcomeScreen").style.display = "";
  document.getElementById("appScreen").style.display = "none";
  setShellVisible(true);
  syncBottomTabs("home");
  renderHomeDashboard();
  renderWelcome();
}

function showApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("welcomeScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "";
  setShellVisible(true);
}

function renderWelcome() {
  const nameEl = document.getElementById("welcomeName");
  const saved = localStorage.getItem("golfRound");
  const profileNow = getProfile();
  const acct = currentAccount();
  let name = profileNow.displayName || (acct && acct.displayName) || "Player";
  if (saved) {
    try {
      const d = JSON.parse(saved);
      if (d.setup && d.setup.playerName) name = d.setup.playerName;
    } catch (e) {}
  }
  nameEl.textContent = name;

  // BYO banner: show only when the AI coach isn't configured yet
  const byo = document.getElementById("byoBanner");
  if (byo) byo.style.display = (typeof aiEnabled === "function" && aiEnabled()) ? "none" : "";
  const byoBtn = document.getElementById("byoOpenSettingsBtn");
  if (byoBtn && !byoBtn._wired) {
    byoBtn._wired = true;
    byoBtn.addEventListener("click", function () {
      showApp();
      switchTab("statsTab");
      setTimeout(function () {
        const card = document.getElementById("grokApiKey");
        if (card) {
          card.scrollIntoView({ block: "center", behavior: "smooth" });
          card.focus();
        }
      }, 250);
    });
  }

  const goalsDiv = document.getElementById("welcomeGoals");
  goalsDiv.innerHTML = "";
  const goal = suggestTeeProgression();
  const goalP = document.createElement("p");
  goalP.textContent = "Current Tee: " + (goal.currentTee || "—");
  goalsDiv.appendChild(goalP);
  const goalText = document.createElement("p");
  goalText.textContent = "Goal: " + goal.goalText;
  goalsDiv.appendChild(goalText);
  if (goal.progress) {
    const p = document.createElement("p");
    p.textContent = goal.progress;
    goalsDiv.appendChild(p);
  }
  if (goal.suggestion) {
    const p = document.createElement("p");
    p.style.fontWeight = "bold";
    p.textContent = goal.suggestion;
    goalsDiv.appendChild(p);
  }

  const mistakesUl = document.getElementById("welcomeMistakes");
  mistakesUl.innerHTML = "";
  const history = getHistory();
  const recent = history.slice(-5);
  const mistakeCounts = {};
  for (const r of recent) {
    for (const m of (r.mistakes || [])) mistakeCounts[m] = (mistakeCounts[m] || 0) + 1;
  }
  const topMistakes = topKeys(mistakeCounts, 3);
  if (topMistakes.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No frequent mistakes yet - play more rounds.";
    mistakesUl.appendChild(li);
  } else {
    for (const m of topMistakes) {
      const li = document.createElement("li");
      li.textContent = m;
      mistakesUl.appendChild(li);
    }
  }

  const strUl = document.getElementById("welcomeStrengths");
  strUl.innerHTML = "";
  const strengthCounts = {};
  for (const r of recent) {
    for (const s of (r.strengths || [])) strengthCounts[s] = (strengthCounts[s] || 0) + 1;
  }
  const topStrengths = topKeys(strengthCounts, 3);
  if (topStrengths.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Play and save rounds to discover your strengths.";
    strUl.appendChild(li);
  } else {
    for (const s of topStrengths) {
      const li = document.createElement("li");
      li.textContent = s;
      strUl.appendChild(li);
    }
  }

  const courseUl = document.getElementById("welcomeCourseMistakes");
  courseUl.innerHTML = "";
  const rcgcRounds = history.filter(function (r) { return r.courseName === "RCGC"; });
  const rcgcMistakes = {};
  for (const r of rcgcRounds) {
    for (const m of (r.mistakes || [])) rcgcMistakes[m] = (rcgcMistakes[m] || 0) + 1;
    if (r.postBiggestMistake) {
      rcgcMistakes[r.postBiggestMistake] = (rcgcMistakes[r.postBiggestMistake] || 0) + 1;
    }
  }
  const topRcgc = topKeys(rcgcMistakes, 3);
  if (topRcgc.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No RCGC rounds saved yet. Play one to see common mistakes here.";
    courseUl.appendChild(li);
  } else {
    for (const m of topRcgc) {
      const li = document.createElement("li");
      li.textContent = m;
      courseUl.appendChild(li);
    }
  }

  const practiceUl = document.getElementById("welcomePractice");
  practiceUl.innerHTML = "";
  const practiceCounts = {};
  for (const r of history) {
    for (const p of (r.practice || [])) practiceCounts[p] = (practiceCounts[p] || 0) + 1;
  }
  const topPractice = topKeys(practiceCounts, 4);
  const dailyPractice = topPractice.length > 0 ? topPractice : [
    "10 short putts from 3 feet",
    "20 chips from 10-20 yards",
    "10 full swings with smooth tempo",
  ];
  for (const p of dailyPractice) {
    const li = document.createElement("li");
    li.textContent = p;
    practiceUl.appendChild(li);
  }

  const posUl = document.getElementById("welcomePositive");
  posUl.innerHTML = "";
  const positiveLines = [
    "Don't hurry - take your time on every shot.",
    "Pick a target before every swing.",
    "One bad shot does not ruin the round.",
    "Trust your practice. You have done this before.",
    "Breathe deep before you putt.",
    "Stay positive - your next shot is the most important one.",
  ];
  for (const line of positiveLines) {
    const li = document.createElement("li");
    li.textContent = line;
    posUl.appendChild(li);
  }

  const thoughtEl = document.getElementById("dailyThought");
  if (thoughtEl) thoughtEl.textContent = getDailyThought();

  const defaultsDateInput = document.getElementById("defaultsDateInput");
  if (defaultsDateInput) {
    const stored = localStorage.getItem("defaultsDate");
    defaultsDateInput.value = stored || todayISO();
    loadTemperatureForDate(defaultsDateInput.value);
  }

  const hcapInput = document.getElementById("handicapInput");
  if (hcapInput) {
    const p = getProfile();
    if (p.handicap != null) hcapInput.value = p.handicap;
  }

  const birthdayInput = document.getElementById("birthdayInput");
  if (birthdayInput) {
    const p = getProfile();
    if (p.birthday) birthdayInput.value = p.birthday;
  }

  const displayInput = document.getElementById("displayNameInput");
  if (displayInput) {
    displayInput.value = name;
  }

  renderPlayerCard();

  const dateInput = document.getElementById("roundDate");
  if (dateInput && !dateInput.value) dateInput.value = todayISO();

  renderPreRoundCoach();
}

async function loadTemperatureForDate(dateStr) {
  const out = document.getElementById("defaultsTemp");
  if (!out || !dateStr) return;
  out.textContent = "Loading...";
  const courseKey = (document.getElementById("courseSelect") || {}).value || "RCGC";
  const w = await fetchWeatherForDate(dateStr, courseKey);
  if (!w || w.tempMax == null) {
    out.textContent = "Could not load weather (no internet?)";
    return;
  }
  const text = Math.round(w.tempMax) + "°C high · " + Math.round(w.tempMin) + "°C low · " + w.condition + (w.windKmh != null ? " · wind " + Math.round(w.windKmh) + " km/h" : "");
  out.textContent = text;
  localStorage.setItem("defaultsTemp", text);
  localStorage.setItem("currentWeather", JSON.stringify(w));
}

wireLoginUi({ showWelcome, showApp, switchTab, syncDrawerActive, applyUrlActivationToCurrentUser });

const continueBtnEl = document.getElementById("continueBtn");
if (continueBtnEl) {
  continueBtnEl.addEventListener("click", function () {
    const d = document.getElementById("defaultsDateInput");
    if (d && d.value) {
      localStorage.setItem("defaultsDate", d.value);
      const roundDate = document.getElementById("roundDate");
      if (roundDate) roundDate.value = d.value;
    }
    showApp();
    switchTab("setupTab");
  });
}

const defaultsDateInputInit = document.getElementById("defaultsDateInput");
if (defaultsDateInputInit) {
  defaultsDateInputInit.addEventListener("change", function () {
    localStorage.setItem("defaultsDate", defaultsDateInputInit.value);
    loadTemperatureForDate(defaultsDateInputInit.value);
  });
}

const hcapInputInit = document.getElementById("handicapInput");
if (hcapInputInit) {
  hcapInputInit.addEventListener("input", function () {
    const v = hcapInputInit.value === "" ? null : Number(hcapInputInit.value);
    setProfileField("handicap", v);
    renderPlayerCard();
  });
}

const birthdayInputInit = document.getElementById("birthdayInput");
if (birthdayInputInit) {
  birthdayInputInit.addEventListener("change", function () {
    setProfileField("birthday", birthdayInputInit.value || null);
    renderPlayerCard();
  });
}

const displayNameInit = document.getElementById("displayNameInput");
if (displayNameInit) {
  displayNameInit.addEventListener("input", function () {
    const v = (displayNameInit.value || "").trim();
    setProfileField("displayName", v);
    renderPlayerCard();
    const greet = document.getElementById("welcomeName");
    if (greet) greet.textContent = v || "Player";
  });
}

const favEl = document.getElementById("favPlayerInput");
if (favEl) {
  const p = getProfile();
  if (p.favPlayer) favEl.value = p.favPlayer;
  favEl.addEventListener("input", function () { setProfileField("favPlayer", favEl.value || ""); });
}
const goalEl = document.getElementById("bigGoalInput");
if (goalEl) {
  const p = getProfile();
  if (p.bigGoal) goalEl.value = p.bigGoal;
  goalEl.addEventListener("input", function () { setProfileField("bigGoal", goalEl.value || ""); });
}

const profileUsernameEl = document.getElementById("profileUsername");
if (profileUsernameEl) {
  const u = getCurrentUsername();
  profileUsernameEl.textContent = "Username: " + (u || "—");
}

function switchTab(tabId) {
  const pages = document.querySelectorAll(".tab-page");
  pages.forEach(function (p) { p.style.display = p.id === tabId ? "" : "none"; });
  const btns = document.querySelectorAll(".tab-btn");
  btns.forEach(function (b) {
    if (b.dataset.tab === tabId) b.classList.add("active");
    else b.classList.remove("active");
  });
  if (tabId === "clubsTab") {
    buildClubsGrid();
    renderClubDistances();
  }
  if (tabId === "practiceTab") {
    renderPracticeActivity();
    renderPuttingStatsSummary();
    renderChippingStatsSummary();
    renderIronStatsSummary();
    renderDriverStatsSummary();
    renderPracticeHistory();
  }
  if (tabId === "videosTab") {
    renderVideoLibrary();
  }
  if (tabId === "trackerTab") {
    if (!holesContainer || holesContainer.children.length === 0) {
      buildHoles();
    }
    showHole(currentHoleIndex);
  }
  if (tabId === "statsTab") {
    renderDashboard();
    renderHistory();
    if (typeof renderCategoriesGrid === "function") renderCategoriesGrid();
  }
  if (tabId === "profileTab") {
    syncAiStatusOnProfile();
    renderPracticeRangesEditor();
  }
  if (tabId === "coachTab") {
    // Always show the launcher on (re-)entry; the chat panel is opt-in.
    const launcher = document.getElementById("chatLauncher");
    const panel = document.getElementById("chatPanel");
    if (launcher) launcher.style.display = "";
    if (panel) panel.style.display = "none";
  }
  if (tabId === "setupTab") {
    if (typeof autoSetTodayOnSetup === "function") autoSetTodayOnSetup();
  }
  window.scrollTo(0, 0);
}

function syncAiStatusOnProfile() {
  const el = document.getElementById("aiStatusProfile");
  if (!el) return;
  if (typeof aiEnabled === "function" && aiEnabled()) {
    el.textContent = "AI coach ON — your key is set.";
    el.classList.add("on");
  } else {
    el.textContent = "AI coach off — add a key on the Stats tab to enable.";
    el.classList.remove("on");
  }
}

document.addEventListener("click", function (e) {
  const btn = e.target.closest && e.target.closest("[data-go]");
  if (!btn) return;
  const target = btn.dataset.go;
  if (target === "welcome") {
    showWelcome();
  } else if (target === "setupTab" || target === "clubsTab" || target === "trackerTab" || target === "statsTab" || target === "coachTab" || target === "profileTab" || target === "practiceTab" || target === "videosTab") {
    showApp();
    switchTab(target);
    syncBottomTabs(target);
  }
});

function syncBottomTabs(tabId) {
  // trackerTab sits within the Round flow — highlight the Round button
  const mapped = tabId === "trackerTab" ? "setupTab" : tabId;
  document.querySelectorAll(".bt").forEach(function (b) {
    if (b.dataset.goTab === mapped) b.classList.add("active");
    else b.classList.remove("active");
  });
}

document.querySelectorAll(".bt").forEach(function (btn) {
  btn.addEventListener("click", function () {
    const target = btn.dataset.goTab;
    if (target === "home") {
      showWelcome();
    } else {
      showApp();
      switchTab(target);
      syncBottomTabs(target);
    }
  });
});

const homeOngoingResume = document.getElementById("homeOngoingResume");
if (homeOngoingResume) {
  homeOngoingResume.addEventListener("click", function () {
    showApp();
    switchTab("trackerTab");
    syncBottomTabs("trackerTab");
    syncDrawerActive("trackerTab");
  });
}
const homeOngoingDiscard = document.getElementById("homeOngoingDiscard");
if (homeOngoingDiscard) {
  homeOngoingDiscard.addEventListener("click", function () {
    if (confirm("Discard the in-progress round? This clears the holes you've filled.")) {
      if (typeof clearCurrentRound === "function") clearCurrentRound();
      else { localStorage.removeItem("golfRound"); }
      renderHomeDashboard();
    }
  });
}

const homeStart = document.getElementById("homeStartBtn");
if (homeStart) {
  homeStart.addEventListener("click", function () {
    showApp();
    switchTab("setupTab");
    syncDrawerActive("setupTab");
    syncBottomTabs("setupTab");
  });
}

// Tee pill buttons → set hidden teeSelect and trigger course-data refresh
document.querySelectorAll("#teePillGroup .pill").forEach(function (pill) {
  pill.addEventListener("click", function () {
    document.querySelectorAll("#teePillGroup .pill").forEach(function (p) { p.classList.remove("active"); });
    pill.classList.add("active");
    const tee = pill.dataset.tee;
    const sel = document.getElementById("teeSelect");
    if (sel) {
      sel.value = tee;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    applyCourseData && applyCourseData();
    const d = (document.getElementById("defaultsDateInput") || document.getElementById("roundDate") || {}).value || todayISO();
    loadTemperatureForDate(d);
  });
});

// Holes pill buttons → set hidden holesMode
document.querySelectorAll("#holesPillGroup .pill").forEach(function (pill) {
  pill.addEventListener("click", function () {
    document.querySelectorAll("#holesPillGroup .pill").forEach(function (p) { p.classList.remove("active"); });
    pill.classList.add("active");
    const mode = pill.dataset.holes;
    const sel = document.getElementById("holesMode");
    if (sel) {
      sel.value = mode;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
});

// Green speed pill buttons → store under setup state
document.querySelectorAll("#greenSpeedPills .pill").forEach(function (pill) {
  pill.addEventListener("click", function () {
    document.querySelectorAll("#greenSpeedPills .pill").forEach(function (p) { p.classList.remove("active"); });
    pill.classList.add("active");
    localStorage.setItem("greenSpeedToday", pill.dataset.stimp);
  });
});

// Stats detail (Basic / Advanced) pill — drives the existing roundMode
// (quick = basic = score + putts only; full = advanced = shot-by-shot
// data feeding the AI Coach).
function applyStatsMode(mode) {
  const rmode = mode === "basic" ? "quick" : "full";
  localStorage.setItem("roundMode", rmode);
  const sel = document.getElementById("roundMode");
  if (sel) sel.value = rmode;
  if (typeof applyRoundMode === "function") applyRoundMode();
}
(function restoreStatsMode() {
  // Derive the pill state from existing roundMode if statsMode isn't set yet.
  const existingRoundMode = localStorage.getItem("roundMode") || "full";
  const saved = localStorage.getItem("statsMode") || (existingRoundMode === "quick" ? "basic" : "advanced");
  applyStatsMode(saved);
  localStorage.setItem("statsMode", saved);
  document.querySelectorAll("#statsModePills .pill").forEach(function (p) {
    p.classList.toggle("active", p.dataset.statsMode === saved);
  });
})();
document.querySelectorAll("#statsModePills .pill").forEach(function (pill) {
  pill.addEventListener("click", function () {
    document.querySelectorAll("#statsModePills .pill").forEach(function (p) { p.classList.remove("active"); });
    pill.classList.add("active");
    localStorage.setItem("statsMode", pill.dataset.statsMode);
    applyStatsMode(pill.dataset.statsMode);
  });
});

// Game type pill buttons → update the hidden select that the rest of the code reads
document.querySelectorAll("#gameTypePills .pill").forEach(function (pill) {
  pill.addEventListener("click", function () {
    document.querySelectorAll("#gameTypePills .pill").forEach(function (p) { p.classList.remove("active"); });
    pill.classList.add("active");
    const v = pill.dataset.game;
    const sel = document.getElementById("gameType");
    if (sel) {
      sel.value = v;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    // Show / hide tournament rows
    const tourName = document.getElementById("tournamentNameRow");
    const tourFmt = document.getElementById("tournamentFormatRow");
    const show = v === "Tournament";
    if (tourName) tourName.style.display = show ? "" : "none";
    if (tourFmt) tourFmt.style.display = show ? "" : "none";
  });
});

// Date auto-pickup: every time the setup tab is visited, stamp today's date
function autoSetTodayOnSetup() {
  const dateInput = document.getElementById("roundDate");
  if (dateInput) dateInput.value = todayISO();
  // Tee-off time: default to now if blank, derive block label
  const timeInput = document.getElementById("teeOffTime");
  if (timeInput && !timeInput.value) {
    const now = new Date();
    timeInput.value = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  }
  renderTimeBlockLabel();
}
autoSetTodayOnSetup();

function deriveTimeBlock(hhmm) {
  if (!hhmm) return null;
  const h = parseInt(hhmm.split(":")[0], 10);
  if (isNaN(h)) return null;
  if (h < 11) return "Morning";
  if (h < 16) return "Afternoon";
  if (h < 19) return "Late afternoon";
  return "Evening";
}

function renderTimeBlockLabel() {
  const t = document.getElementById("teeOffTime");
  const lbl = document.getElementById("teeOffBlock");
  if (!t || !lbl) return;
  const block = deriveTimeBlock(t.value);
  lbl.textContent = block || "—";
}

document.addEventListener("input", function (e) {
  if (e.target && e.target.id === "teeOffTime") renderTimeBlockLabel();
});

// Restore the previously chosen green speed (per device)
(function restoreGreenSpeed() {
  const saved = localStorage.getItem("greenSpeedToday");
  if (!saved) return;
  document.querySelectorAll("#greenSpeedPills .pill").forEach(function (p) {
    p.classList.toggle("active", p.dataset.stimp === saved);
  });
})();

// Show green speed + notes when course picked
function renderCourseExtras() {
  const courseKey = (document.getElementById("courseSelect") || {}).value;
  const c = COURSES[courseKey];
  const gsEl = document.getElementById("courseGreenSpeed");
  const notesEl = document.getElementById("courseNotes");
  if (gsEl) gsEl.textContent = c && c.greenSpeed ? "Green speed: " + c.greenSpeed : "";
  if (notesEl) notesEl.textContent = c && c.notes ? c.notes : "";
  // Hero card title reflects current course
  const heroTitle = document.getElementById("setupHeroCourseName");
  if (heroTitle) heroTitle.textContent = c ? (c.location && c.location.name ? c.location.name : courseKey) : "Pick your course";
}

const courseSelectEl = document.getElementById("courseSelect");
if (courseSelectEl) {
  courseSelectEl.addEventListener("change", function () {
    renderCourseExtras();
    const d = todayISO();
    loadTemperatureForDate(d);
  });
}

// Start Round button
const startRoundBtn = document.getElementById("startRoundBtn");
if (startRoundBtn) {
  startRoundBtn.addEventListener("click", function () {
    // Default to today's date if Advanced not filled
    const dateInput = document.getElementById("roundDate");
    if (dateInput && !dateInput.value) dateInput.value = todayISO();
    showApp();
    switchTab("trackerTab");
    syncDrawerActive("trackerTab");
  });
}
const homePractice = document.getElementById("homePracticeBtn");
if (homePractice) {
  homePractice.addEventListener("click", function () {
    showApp();
    switchTab("practiceTab");
    syncDrawerActive("practiceTab");
    syncBottomTabs("practiceTab");
    setTimeout(function () {
      const picker = document.getElementById("practicePickerView");
      if (picker) picker.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  });
}

const menuBtn = document.getElementById("menuBtn");
if (menuBtn) menuBtn.addEventListener("click", openDrawer);
const closeDrawerBtn = document.getElementById("closeDrawerBtn");
if (closeDrawerBtn) closeDrawerBtn.addEventListener("click", closeDrawer);
const drawerBackdrop = document.getElementById("drawerBackdrop");
if (drawerBackdrop) drawerBackdrop.addEventListener("click", closeDrawer);

document.querySelectorAll(".drawer-item").forEach(function (item) {
  item.addEventListener("click", function () {
    const target = item.dataset.goTab;
    if (target === "home") {
      showWelcome();
    } else if (target) {
      showApp();
      switchTab(target);
    }
    syncDrawerActive(target);
    syncBottomTabs(target);
    closeDrawer();
  });
});

const drawerLogout = document.getElementById("drawerLogout");
if (drawerLogout) {
  drawerLogout.addEventListener("click", function () {
    closeDrawer();
    if (confirm("Log out?")) {
      setCurrentUsername(null);
      showLogin();
    }
  });
}

const profileLogout = document.getElementById("profileLogoutBtn");
if (profileLogout) {
  profileLogout.addEventListener("click", function () {
    if (confirm("Log out?")) {
      setCurrentUsername(null);
      showLogin();
    }
  });
}

// ===== Practice — Putting drill =====

const headerHome = document.getElementById("headerHomeBtn");
if (headerHome) {
  headerHome.addEventListener("click", function () { showWelcome(); });
}
const headerLogout = document.getElementById("headerLogoutBtn");
if (headerLogout) {
  headerLogout.addEventListener("click", function () {
    if (confirm("Log out?")) {
      setCurrentUsername(null);
      showLogin();
    }
  });
}

const statsLogoutBtn = document.getElementById("statsLogoutBtn");
if (statsLogoutBtn) {
  statsLogoutBtn.addEventListener("click", function () {
    if (confirm("Log out?")) {
      setCurrentUsername(null);
      showLogin();
    }
  });
}

const welcomeLogoutEl = document.getElementById("welcomeLogoutBtn");
if (welcomeLogoutEl) welcomeLogoutEl.addEventListener("click", function () {
  if (confirm("Log out?")) {
    setCurrentUsername(null);
    showLogin();
  }
});

document.getElementById("passwordInput").addEventListener("keypress", function (e) {
  if (e.key === "Enter") document.getElementById("loginBtn").click();
});

document.getElementById("usernameInput").addEventListener("keypress", function (e) {
  if (e.key === "Enter") document.getElementById("passwordInput").focus();
});

// Initial visibility is set at the END of this file so all const
// declarations (TEE_GOALS, currentDashYear, etc.) are initialized
// before renderWelcome runs. Just show login screen immediately
// so the user sees something during script load.
document.getElementById("loginScreen").style.display = "";
document.getElementById("welcomeScreen").style.display = "none";
document.getElementById("appScreen").style.display = "none";

const holesContainer = document.getElementById("holes");
const setupContainer = document.querySelector(".setup") || document.getElementById("setupTab");

const SETUP_FIELDS = [
  "playerName",
  "roundDate",
  "playedIn",
  "country",
  "courseSelect",
  "customCourseName",
  "teeSelect",
  "coursePar",
  "holesMode",
  "gameType",
  "tournamentName",
  "tournamentFormat",
  "energyLevel",
  "confidenceLevel",
  "sleepQuality",
];

function getActiveHoles() {
  const mode = document.getElementById("holesMode").value;
  if (mode === "front9") return [1,2,3,4,5,6,7,8,9];
  if (mode === "back9") return [10,11,12,13,14,15,16,17,18];
  if (mode === "custom") {
    const checks = document.querySelectorAll("#customHolesChecks input[type=checkbox]:checked");
    const arr = [];
    checks.forEach(function (c) { arr.push(Number(c.value)); });
    arr.sort(function (a,b) { return a-b; });
    return arr.length > 0 ? arr : [1];
  }
  return [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
}

function buildCustomHoleChecks() {
  const div = document.getElementById("customHolesChecks");
  if (!div) return;
  if (div.children.length === 18) return;
  div.innerHTML = "";
  for (let i = 1; i <= 18; i++) {
    const lbl = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = i;
    cb.dataset.holeCheck = "1";
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(i));
    div.appendChild(lbl);
  }
}

const POST_REVIEW_FIELDS = [
  "postFeel",
  "postBestShot",
  "postBiggestMistake",
  "postImprove",
];

const TEE_GOALS = {
  Red: { holes18: 5, holes9: 2 },
  Yellow: { holes18: 5, holes9: 3 },
  White: { holes18: 15, holes9: 6 },
  Blue: { holes18: 18, holes9: 9 },
};

const TEE_ORDER = ["Red", "Yellow", "White", "Blue"];

const ACHIEVEMENTS = [
  { id: "below10", name: "Round below +10", check: function (rounds) { return rounds.some(function (r) { return typeof r.scoreVsPar === "number" && r.scoreVsPar < 10 && r.totalScore > 0; }); } },
  { id: "below5", name: "Round below +5", check: function (rounds) { return rounds.some(function (r) { return typeof r.scoreVsPar === "number" && r.scoreVsPar < 5 && r.totalScore > 0; }); } },
  { id: "tourUnder85", name: "Tournament under 85", check: function (rounds) { return rounds.some(function (r) { return (r.gameType === "Tournament") && r.totalScore > 0 && r.totalScore < 85; }); } },
  { id: "firstTour", name: "First tournament saved", check: function (rounds) { return rounds.some(function (r) { return r.gameType === "Tournament"; }); } },
  { id: "noPenaltyRound", name: "No-penalty round", check: function (rounds) { return rounds.some(function (r) { return r.totalPenalties === 0 && r.totalScore > 0; }); } },
  { id: "fifty50Fairways", name: "50% fairways hit", check: function (rounds) { return rounds.some(function (r) { return typeof r.fairwayPct === "number" && r.fairwayPct >= 50; }); } },
  { id: "tenUnder36", name: "10 rounds under 36 putts", check: function (rounds) { return rounds.filter(function (r) { return typeof r.totalPutts === "number" && r.totalPutts < 36; }).length >= 10; } },
  { id: "fiveRounds", name: "5 rounds saved", check: function (rounds) { return rounds.length >= 5; } },
  { id: "tenRounds", name: "10 rounds saved", check: function (rounds) { return rounds.length >= 10; } },
];

const THOUGHTS = [
  "Practice doesn't make perfect. Perfect practice does.",
  "One shot at a time. The next shot is the most important.",
  "Stay patient - the leaderboard is decided on the back 9.",
  "Pick a target every single shot. Always.",
  "A bad shot is one shot - don't let it become two.",
  "Trust your practice. You've hit this shot before.",
  "Tempo wins more than power. Smooth swings, low scores.",
  "Putts are half the round. Treat them like full shots.",
  "Breathe before every swing. Calm hands, calm head.",
  "Champions practise short putts more than long drives.",
  "Make a smooth practice swing first. Then go.",
  "Your worst shot is just one shot. Your best is coming.",
  "Stay positive. Anger never made a birdie.",
  "Walk the course. Look at the green. Plan your shot.",
  "Rory says: focus on the process, not the result.",
];

function getDailyThought() {
  const d = new Date();
  const dayNumber = d.getFullYear() * 366 + Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return THOUGHTS[dayNumber % THOUGHTS.length];
}


function ageBenchmarkText(age, history) {
  if (age == null) return "";
  let bench;
  if (age <= 9) bench = { low: 110, high: 130 };
  else if (age <= 12) bench = { low: 90, high: 110 };
  else if (age <= 15) bench = { low: 78, high: 100 };
  else bench = { low: 72, high: 90 };
  let recentBest = null;
  for (const r of history) {
    if (r.totalScore > 0) {
      if (recentBest === null || r.totalScore < recentBest) recentBest = r.totalScore;
    }
  }
  let line = "At age " + age + ", junior players typically shoot " + bench.low + "–" + bench.high + " for 18 holes.";
  if (recentBest !== null) {
    if (recentBest < bench.low) line += " Your best (" + recentBest + ") is BELOW that range — you're ahead of the curve!";
    else if (recentBest <= bench.high) line += " Your best (" + recentBest + ") is right in the junior range — keep grinding.";
    else line += " Your best is " + recentBest + " — keep playing, you'll close on " + bench.high + " soon.";
  } else {
    line += " Save a round to see how you compare.";
  }
  return line;
}

function renderPlayerCard() {
  const profile = getProfile();
  const acct = currentAccount();
  const displayName = profile.displayName || (acct && acct.displayName) || "Player";
  const nameEl = document.getElementById("pcName");
  if (nameEl) nameEl.textContent = displayName;
  const greetEl = document.getElementById("welcomeName");
  if (greetEl) greetEl.textContent = displayName;
  const avatarEl = document.getElementById("profileAvatar");
  if (avatarEl) avatarEl.textContent = (displayName || "P").charAt(0).toUpperCase();
  const usernameEl = document.getElementById("profileUsername");
  if (usernameEl) usernameEl.textContent = "@" + (getCurrentUsername() || "");
  const ageEl = document.getElementById("pcAge");
  if (ageEl) {
    const age = calcAge(profile.birthday);
    ageEl.textContent = age != null ? (age + " years") : "Set birthday";
  }
  const hcEl = document.getElementById("pcHandicap");
  if (hcEl) hcEl.textContent = profile.handicap != null ? profile.handicap : "Set handicap";

  const history = getHistory();
  const bestEl = document.getElementById("pcBest");
  if (bestEl) {
    const scores = history.map(function (r) { return r.totalScore; }).filter(function (s) { return s > 0; });
    bestEl.textContent = scores.length > 0 ? Math.min.apply(null, scores) : "—";
  }
  const roundsEl = document.getElementById("pcRounds");
  if (roundsEl) roundsEl.textContent = history.length;

  const badgesEl = document.getElementById("pcBadges");
  if (badgesEl) {
    let unlocked = 0;
    for (const a of ACHIEVEMENTS) if (a.check(history)) unlocked += 1;
    badgesEl.textContent = unlocked + " / " + ACHIEVEMENTS.length;
  }

  const benchEl = document.getElementById("pcBenchmark");
  if (benchEl) {
    const age = calcAge(profile.birthday);
    benchEl.textContent = ageBenchmarkText(age, history);
  }
}

const WEDGE_CLUBS_FULL = ["Pitching Wedge", "Gap Wedge", "Sand Wedge", "Lob Wedge", "Chipper", "PW", "GW", "SW", "LW", "Wedge"];

function getCustomClubs() {
  try {
    const raw = localStorage.getItem("customClubs");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

function saveCustomClubs(arr) {
  localStorage.setItem("customClubs", JSON.stringify(arr));
}

function getAllAvailableClubs() {
  return ALL_CLUBS.concat(getCustomClubs());
}


function renderClubDistances() {
  const list = document.getElementById("clubDistancesList");
  if (!list) return;
  list.innerHTML = "";
  const clubs = getSelectedClubs().filter(function (c) { return c !== "Putter"; });
  if (clubs.length === 0) {
    const p = document.createElement("p");
    p.textContent = "Pick clubs in your bag above to set their distances.";
    list.appendChild(p);
    return;
  }
  let anyObserved = false;
  for (const club of clubs) {
    const row = document.createElement("div");
    row.className = "club-distance-row";
    const lbl = document.createElement("label");
    lbl.textContent = club;
    const input = document.createElement("input");
    input.type = "number";
    input.placeholder = "yards";
    input.min = "0";
    const saved = getClubDistance(club);
    if (saved != null) input.value = saved;
    input.addEventListener("input", function () { setClubDistance(club, input.value); });
    row.appendChild(lbl);
    row.appendChild(input);

    const obs = getObservedClubCarry(club);
    if (obs) {
      anyObserved = true;
      const hint = document.createElement("button");
      hint.type = "button";
      hint.className = "club-observed-hint";
      hint.textContent = "Use " + obs.carry + "y (n=" + obs.count + ")";
      hint.title = "Apply observed average from practice";
      hint.addEventListener("click", function () {
        input.value = obs.carry;
        setClubDistance(club, obs.carry);
      });
      row.appendChild(hint);
    }
    list.appendChild(row);
  }
  if (anyObserved) {
    const applyAll = document.createElement("button");
    applyAll.type = "button";
    applyAll.className = "ai-action-btn";
    applyAll.style.marginTop = "12px";
    applyAll.style.background = "var(--green-bright)";
    applyAll.textContent = "Apply all observed averages";
    applyAll.addEventListener("click", function () {
      for (const c of clubs) {
        const o = getObservedClubCarry(c);
        if (o) setClubDistance(c, o.carry);
      }
      renderClubDistances();
    });
    list.appendChild(applyAll);
  }
}

function updateClubsCounter() {
  const counter = document.getElementById("clubsCounter");
  if (!counter) return;
  const selected = getSelectedClubs();
  counter.textContent = selected.length + " / " + MAX_CLUBS + " clubs selected";
  if (selected.length >= MAX_CLUBS) counter.classList.add("full");
  else counter.classList.remove("full");
}

function buildClubsGrid() {
  const grid = document.getElementById("clubsGrid");
  if (!grid) return;
  grid.innerHTML = "";
  let selected = getSelectedClubs();
  if (selected.length > MAX_CLUBS) {
    selected = selected.slice(0, MAX_CLUBS);
    saveSelectedClubs(selected);
  }
  updateClubsCounter();

  for (const club of getAllAvailableClubs()) {
    const lbl = document.createElement("label");
    const isChecked = selected.indexOf(club) !== -1;
    lbl.className = "club-pill" + (isChecked ? " checked" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = club;
    cb.checked = isChecked;
    cb.addEventListener("change", function () {
      const checkedCount = document.querySelectorAll("#clubsGrid input[type=checkbox]:checked").length;
      if (cb.checked && checkedCount > MAX_CLUBS) {
        cb.checked = false;
        lbl.classList.remove("checked");
        alert("You can only carry " + MAX_CLUBS + " clubs (golf rule). Remove a club first.");
        return;
      }
      if (cb.checked) lbl.classList.add("checked");
      else lbl.classList.remove("checked");
      const arr = [];
      document.querySelectorAll("#clubsGrid input[type=checkbox]:checked").forEach(function (c) {
        arr.push(c.value);
      });
      saveSelectedClubs(arr);
      updateClubsCounter();
      updateDisabledClubs();
      renderClubDistances();
    });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(club));
    grid.appendChild(lbl);
  }
  updateDisabledClubs();
}

function updateDisabledClubs() {
  const grid = document.getElementById("clubsGrid");
  if (!grid) return;
  const checked = grid.querySelectorAll("input[type=checkbox]:checked").length;
  grid.querySelectorAll(".club-pill").forEach(function (lbl) {
    const cb = lbl.querySelector("input[type=checkbox]");
    if (!cb.checked && checked >= MAX_CLUBS) lbl.classList.add("disabled");
    else lbl.classList.remove("disabled");
  });
}

let holeCount = 18;

function sumArray(arr) {
  let total = 0;
  for (const x of arr) total += x;
  return total;
}

function makeHoleCard(n) {
  return `
    <div class="hole-card">
      <h2>Hole ${n}</h2>

      <label>Par
        <input type="number" id="par-${n}" min="1" />
      </label>

      <label class="hole-distance">Distance (yards)
        <input type="number" id="holeDistance-${n}" min="0" />
      </label>

      <label>Pin position
        <select id="pinPosition-${n}">
          <option value="">—</option>
          <option value="Front">Front</option>
          <option value="Middle">Middle</option>
          <option value="Back">Back</option>
          <option value="Front-Left">Front-Left</option>
          <option value="Back-Right">Back-Right</option>
          <option value="Tucked">Tucked</option>
        </select>
      </label>

      <h3>Shots</h3>
      <div class="shots-list" id="shotsList-${n}"></div>
      <button type="button" class="add-shot-btn" data-hole="${n}">+ Add Shot</button>

      <p class="hole-score">Shots so far: <span id="holeScore-${n}">0</span></p>

      <div class="quick-row" id="quickRow-${n}" style="display:none;">
        <h4 style="margin:0 0 6px; color:#8a6d00;">Quick Score</h4>
        <label>Score
          <input type="number" id="quickScore-${n}" min="0" />
        </label>
        <label>Putts (of that score)
          <input type="number" id="quickPutts-${n}" min="0" />
        </label>
      </div>

      <div class="putting-section" id="puttingSection-${n}" style="display:none;">
        <h3>Putting</h3>
        <div class="putts-list" id="puttsList-${n}"></div>
        <button type="button" class="add-putt-btn" data-hole="${n}">+ Add Putt</button>

        <label>First Putt Result
          <select id="firstPuttResult-${n}">
            <option value="">-- choose --</option>
            <option value="Short">Short</option>
            <option value="Long">Long</option>
            <option value="Good">Good</option>
            <option value="Holed">Holed</option>
          </select>
        </label>

        <label>Missed Short Putt?
          <select id="missedShortPutt-${n}">
            <option value="">-- choose --</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </label>
      </div>

      <div class="hole-analysis" id="holeAnalysis-${n}"></div>
    </div>
  `;
}

function makeShotCard(shotNumber) {
  return `
    <div class="shot-card">
      <h4>Shot <span class="shot-number">${shotNumber}</span></h4>

      <label>Club
        <select data-shot-field="club">
          <option value="">-- choose --</option>
          ${getSelectedClubs().map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join("")}
        </select>
      </label>

      <label>Distance Hit (yards)
        <input type="number" data-shot-field="distanceHit" min="0" />
      </label>

      <label>Distance Left to Green (yards)
        <input type="number" data-shot-field="distanceLeft" min="0" />
      </label>

      <label>Lie
        <select data-shot-field="lie">
          <option value="">-- choose --</option>
          <option value="Tee">Tee</option>
          <option value="Fairway">Fairway</option>
          <option value="Rough">Rough</option>
          <option value="Bunker">Bunker</option>
          <option value="Green">Green</option>
        </select>
      </label>

      <label>Direction
        <select data-shot-field="direction">
          <option value="">-- choose --</option>
          <option value="Straight">Straight</option>
          <option value="Left">Left</option>
          <option value="Right">Right</option>
          <option value="Short">Short</option>
          <option value="Long">Long</option>
        </select>
      </label>

      <label>Shot Quality
        <select data-shot-field="quality">
          <option value="">-- choose --</option>
          <option value="Good shot">Good shot</option>
          <option value="Weak shot">Weak shot</option>
          <option value="Top">Top</option>
          <option value="Duff">Duff</option>
          <option value="Slice">Slice</option>
          <option value="Hook">Hook</option>
        </select>
      </label>

      <label>Result
        <select data-shot-field="result">
          <option value="">-- choose --</option>
          <option value="Fairway">Fairway</option>
          <option value="Rough">Rough</option>
          <option value="Bunker">Bunker</option>
          <option value="Green">Green</option>
          <option value="Penalty">Penalty</option>
          <option value="Out of Bounds">Out of Bounds</option>
          <option value="Water">Water</option>
          <option value="Lost Ball">Lost Ball</option>
          <option value="Holed">Holed</option>
        </select>
      </label>

      <button type="button" class="remove-shot-btn">Remove Shot</button>
    </div>
  `;
}

let currentHoleIndex = 0;

function makePuttCard(puttNumber) {
  return `
    <div class="putt-card">
      <h4>Putt <span class="putt-number">${puttNumber}</span></h4>

      <label>Distance (feet)
        <input type="number" data-putt-field="distance" min="0" />
      </label>

      <label>Result
        <select data-putt-field="result">
          <option value="">-- choose --</option>
          <option value="Holed">Holed</option>
          <option value="Short">Short</option>
          <option value="Long">Long</option>
          <option value="Left">Left</option>
          <option value="Right">Right</option>
          <option value="Good lag">Good lag</option>
        </select>
      </label>

      <button type="button" class="remove-putt-btn">Remove Putt</button>
    </div>
  `;
}

function addPutt(holeNum) {
  const list = document.getElementById("puttsList-" + holeNum);
  if (!list) return;
  const count = list.querySelectorAll(".putt-card").length;
  list.insertAdjacentHTML("beforeend", makePuttCard(count + 1));
}

function renumberPutts(list) {
  list.querySelectorAll(".putt-card").forEach(function (card, idx) {
    card.querySelector(".putt-number").textContent = idx + 1;
  });
}

function getPuttsForHole(holeNum) {
  const list = document.getElementById("puttsList-" + holeNum);
  if (!list) return [];
  const cards = list.querySelectorAll(".putt-card");
  const arr = [];
  for (const card of cards) {
    const putt = {};
    card.querySelectorAll("[data-putt-field]").forEach(function (f) {
      putt[f.dataset.puttField] = f.value;
    });
    arr.push(putt);
  }
  return arr;
}

function updatePuttingVisibility(holeNum) {
  const section = document.getElementById("puttingSection-" + holeNum);
  if (!section) return;
  const shots = getShotsForHole(holeNum);
  const reachedGreen = shots.some(function (s) {
    return s.result === "Green" || s.result === "On green" || s.result === "Reached Green";
  });
  section.style.display = reachedGreen ? "" : "none";
}

function recomputeDistancesForHole(holeNum) {
  const holeDistEl = document.getElementById("holeDistance-" + holeNum);
  const holeDist = Number(holeDistEl && holeDistEl.value) || 0;
  const list = document.getElementById("shotsList-" + holeNum);
  if (!list) return;
  const cards = list.querySelectorAll(".shot-card");
  let remaining = holeDist;
  cards.forEach(function (card, idx) {
    const leftEl = card.querySelector("[data-shot-field='distanceLeft']");
    const hitEl = card.querySelector("[data-shot-field='distanceHit']");
    if (leftEl) {
      if (idx === 0) {
        if (!leftEl.value || leftEl.dataset.auto === "1") {
          if (holeDist > 0) {
            leftEl.value = holeDist;
            leftEl.dataset.auto = "1";
          }
        }
      } else {
        if (!leftEl.value || leftEl.dataset.auto === "1") {
          if (remaining > 0) {
            leftEl.value = Math.max(0, remaining);
            leftEl.dataset.auto = "1";
          }
        }
      }
    }
    const hit = Number(hitEl && hitEl.value) || 0;
    remaining = remaining - hit;
  });
}

function buildHoles() {
  holesContainer.innerHTML = "";
  const active = getActiveHoles();
  holeCount = active.length > 0 ? active[active.length - 1] : 18;
  for (let pos = 0; pos < active.length; pos++) {
    const i = active[pos];
    const step = document.createElement("div");
    step.className = "hole-step";
    step.dataset.stepIndex = pos;
    step.innerHTML = makeHoleCard(i);
    const playedSoFar = pos + 1;
    if (playedSoFar === 5 || playedSoFar === 10 || playedSoFar === 15) {
      step.insertAdjacentHTML(
        "beforeend",
        `<div class="trend-check" id="trendCheck-${playedSoFar}" style="display:none;"><h3>Trend Check after ${playedSoFar} Holes</h3><div class="trend-lines"></div></div>`
      );
    }
    holesContainer.appendChild(step);
  }
  if (currentHoleIndex >= active.length) currentHoleIndex = 0;
  showHole(currentHoleIndex);
  applyRoundMode();
}

function showHole(index) {
  const steps = holesContainer.querySelectorAll(".hole-step");
  if (steps.length === 0) return;
  if (index < 0) index = 0;
  if (index >= steps.length) index = steps.length - 1;
  const prevIndex = currentHoleIndex;
  currentHoleIndex = index;
  steps.forEach(function (s, i) {
    s.style.display = i === currentHoleIndex ? "" : "none";
  });
  updateHoleNav();
  localStorage.setItem("currentHoleIndex", String(index));
  window.scrollTo({ top: 0, behavior: "smooth" });
  // Detect crossing from hole 9 → hole 10 (only for 18-hole rounds).
  // Stamp back-9 start time + refresh weather so conditions per 9 are captured.
  const active = getActiveHoles();
  if (active.length >= 18 && prevIndex < 9 && currentHoleIndex >= 9) {
    captureBack9Conditions();
  }
}

function captureBack9Conditions() {
  if (localStorage.getItem("back9StartTime")) return; // already captured this round
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  localStorage.setItem("back9StartTime", hhmm);
  // Re-fetch weather using the same path as setup
  if (typeof fetchWeatherForDate === "function") {
    const courseKey = (document.getElementById("courseSelect") || {}).value || "RCGC";
    fetchWeatherForDate(todayISO(), courseKey).then(function (w) {
      if (w) localStorage.setItem("weatherBack9", JSON.stringify(w));
    }).catch(function () { /* offline — silent */ });
  }
}

function updateHoleNav() {
  const steps = holesContainer.querySelectorAll(".hole-step");
  const total = steps.length;
  const active = getActiveHoles();
  const holeNum = active[currentHoleIndex] || (currentHoleIndex + 1);
  const progressEl = document.getElementById("holeProgress");
  if (progressEl) {
    progressEl.textContent = "Hole " + holeNum + " (" + (currentHoleIndex + 1) + "/" + total + ")";
  }
  const prevBtn = document.getElementById("prevHoleBtn");
  const nextBtn = document.getElementById("nextHoleBtn");
  if (prevBtn) prevBtn.disabled = currentHoleIndex === 0;
  if (nextBtn) {
    nextBtn.classList.remove("done");
    if (currentHoleIndex === total - 1) {
      nextBtn.textContent = "Done →";
      nextBtn.classList.add("done");
    } else {
      nextBtn.textContent = "Next →";
    }
  }
  const fill = document.getElementById("holeProgressFill");
  if (fill && total > 0) {
    let filledCount = 0;
    for (let i = 0; i < total; i++) {
      const a = active[i];
      if (getShotsForHole(a).length > 0) filledCount++;
    }
    fill.style.width = Math.round((filledCount / total) * 100) + "%";
  }
}

function updateHoleParColors() {
  const cards = holesContainer.querySelectorAll(".hole-card");
  cards.forEach(function (card) {
    const parInput = card.querySelector("input[id^='par-']");
    if (parInput) {
      const par = Number(parInput.value) || 0;
      card.dataset.par = par;
    }
  });
}

function addShot(holeNum) {
  const shotsList = document.getElementById("shotsList-" + holeNum);
  const count = shotsList.querySelectorAll(".shot-card").length;
  shotsList.insertAdjacentHTML("beforeend", makeShotCard(count + 1));
}

function renumberShots(shotsList) {
  const cards = shotsList.querySelectorAll(".shot-card");
  cards.forEach(function (card, idx) {
    card.querySelector(".shot-number").textContent = idx + 1;
  });
}

function getShotsForHole(holeNum) {
  const shotsList = document.getElementById("shotsList-" + holeNum);
  if (!shotsList) return [];
  const cards = shotsList.querySelectorAll(".shot-card");
  const shots = [];
  for (const card of cards) {
    const shot = {};
    const fields = card.querySelectorAll("[data-shot-field]");
    for (const f of fields) {
      shot[f.dataset.shotField] = f.value;
    }
    shots.push(shot);
  }
  return shots;
}

function toggleSetupRows() {
  const course = document.getElementById("courseSelect").value;
  document.getElementById("customCourseRow").style.display = course === "Other" ? "" : "none";

  const playedIn = document.getElementById("playedIn").value;
  document.getElementById("countryRow").style.display = playedIn === "Outside India" ? "" : "none";

  const gameType = document.getElementById("gameType").value;
  document.getElementById("tournamentNameRow").style.display = gameType === "Tournament" ? "" : "none";
  document.getElementById("tournamentFormatRow").style.display = gameType === "Tournament" ? "" : "none";

  const holesMode = document.getElementById("holesMode").value;
  document.getElementById("customHolesRow").style.display = holesMode === "custom" ? "" : "none";
}

function updateCourseInfoFromInputs() {
  let total = 0;
  let front9 = 0;
  let back9 = 0;
  for (const i of getActiveHoles()) {
    const v = Number(document.getElementById("holeDistance-" + i).value) || 0;
    total += v;
    if (i <= 9) front9 += v;
    else back9 += v;
  }
  document.getElementById("ciCoursePar").textContent = getCoursePar() || "—";
  document.getElementById("ciTotalDistance").textContent = total || "—";
  document.getElementById("ciFront9").textContent = front9 || "—";
  document.getElementById("ciBack9").textContent = back9 || "—";
}

function applyCourseData() {
  const courseKey = document.getElementById("courseSelect").value;
  const teeKey = document.getElementById("teeSelect").value;
  const courseInfo = document.getElementById("courseInfo");
  const courseNotice = document.getElementById("courseNotice");
  const course = COURSES[courseKey];

  if (courseKey === "Tolly") {
    courseInfo.style.display = "none";
    courseNotice.style.display = "";
    courseNotice.textContent = "Tolly scorecard coming soon. You can still track shots and enter par by hand.";
    return;
  }

  courseNotice.style.display = "none";

  if (courseKey === "Other") {
    courseInfo.style.display = "";
    updateCourseInfoFromInputs();
    return;
  }

  if (!course) {
    courseInfo.style.display = "none";
    return;
  }

  const totalPar = sumArray(course.pars);
  document.getElementById("coursePar").value = totalPar;

  for (let i = 1; i <= Math.min(course.pars.length, holeCount); i++) {
    const parEl = document.getElementById("par-" + i);
    if (parEl) parEl.value = course.pars[i - 1];
  }

  if (teeKey && course.tees[teeKey]) {
    const distances = course.tees[teeKey];
    for (let i = 1; i <= Math.min(distances.length, holeCount); i++) {
      const ds = document.getElementById("holeDistance-" + i);
      if (ds) ds.value = distances[i - 1];
    }
    courseInfo.style.display = "";
    updateCourseInfoFromInputs();
  } else {
    courseInfo.style.display = "none";
  }
}

function saveAll() {
  const data = { setup: {}, holes: {}, post: {} };
  for (const f of SETUP_FIELDS) {
    const el = document.getElementById(f);
    if (el) data.setup[f] = el.value;
  }
  for (const f of POST_REVIEW_FIELDS) {
    const el = document.getElementById(f);
    if (el) data.post[f] = el.value;
  }
  const customCBs = document.querySelectorAll("#customHolesChecks input[type=checkbox]:checked");
  data.setup.customHoles = [];
  customCBs.forEach(function (cb) { data.setup.customHoles.push(Number(cb.value)); });
  for (const i of getActiveHoles()) {
    const parEl = document.getElementById("par-" + i);
    if (!parEl) continue;
    data.holes[i] = {
      par: (parEl || {}).value || "",
      distance: ((document.getElementById("holeDistance-" + i)) || {}).value || "",
      shots: getShotsForHole(i),
      putts: getPuttsForHole(i),
      quickScore: ((document.getElementById("quickScore-" + i)) || {}).value || "",
      quickPutts: ((document.getElementById("quickPutts-" + i)) || {}).value || "",
      firstPuttDistance: ((document.getElementById("firstPuttDistance-" + i)) || {}).value || "",
      firstPuttResult: ((document.getElementById("firstPuttResult-" + i)) || {}).value || "",
      missedShortPutt: ((document.getElementById("missedShortPutt-" + i)) || {}).value || "",
      pinPosition: ((document.getElementById("pinPosition-" + i)) || {}).value || "",
    };
  }
  localStorage.setItem("golfRound", JSON.stringify(data));
}

function loadAll() {
  const raw = localStorage.getItem("golfRound");
  if (!raw) return;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return;
  }

  if (data.setup) {
    for (const f of SETUP_FIELDS) {
      const el = document.getElementById(f);
      if (el && data.setup[f] !== undefined) el.value = data.setup[f];
    }
    if (data.setup.holesMode) {
      buildCustomHoleChecks();
      if (data.setup.customHoles && Array.isArray(data.setup.customHoles)) {
        document.querySelectorAll("#customHolesChecks input[type=checkbox]").forEach(function (cb) {
          cb.checked = data.setup.customHoles.indexOf(Number(cb.value)) !== -1;
        });
      }
      buildHoles();
    }
    toggleSetupRows();
  }

  if (data.post) {
    for (const f of POST_REVIEW_FIELDS) {
      const el = document.getElementById(f);
      if (el && data.post[f] !== undefined) el.value = data.post[f];
    }
  }

  if (data.holes) {
    for (const i of getActiveHoles()) {
      const hole = data.holes[i];
      if (!hole) continue;

      const parEl = document.getElementById("par-" + i);
      if (parEl && hole.par !== undefined) parEl.value = hole.par;

      const distEl = document.getElementById("holeDistance-" + i);
      if (distEl && hole.distance !== undefined) distEl.value = hole.distance;

      const qsEl = document.getElementById("quickScore-" + i);
      if (qsEl && hole.quickScore !== undefined) qsEl.value = hole.quickScore;
      const qpEl = document.getElementById("quickPutts-" + i);
      if (qpEl && hole.quickPutts !== undefined) qpEl.value = hole.quickPutts;

      const fpdEl = document.getElementById("firstPuttDistance-" + i);
      if (fpdEl && hole.firstPuttDistance !== undefined) fpdEl.value = hole.firstPuttDistance;

      const fprEl = document.getElementById("firstPuttResult-" + i);
      if (fprEl && hole.firstPuttResult !== undefined) fprEl.value = hole.firstPuttResult;

      const pinEl = document.getElementById("pinPosition-" + i);
      if (pinEl && hole.pinPosition !== undefined) pinEl.value = hole.pinPosition;

      const msEl = document.getElementById("missedShortPutt-" + i);
      if (msEl && hole.missedShortPutt !== undefined) msEl.value = hole.missedShortPutt;

      const shotsList = document.getElementById("shotsList-" + i);
      if (shotsList && Array.isArray(hole.shots)) {
        shotsList.innerHTML = "";
        for (let s = 0; s < hole.shots.length; s++) {
          shotsList.insertAdjacentHTML("beforeend", makeShotCard(s + 1));
          const cards = shotsList.querySelectorAll(".shot-card");
          const card = cards[cards.length - 1];
          for (const key in hole.shots[s]) {
            const field = card.querySelector('[data-shot-field="' + key + '"]');
            if (field) field.value = hole.shots[s][key];
          }
        }
      }

      const puttsList = document.getElementById("puttsList-" + i);
      if (puttsList && Array.isArray(hole.putts)) {
        puttsList.innerHTML = "";
        for (let p = 0; p < hole.putts.length; p++) {
          puttsList.insertAdjacentHTML("beforeend", makePuttCard(p + 1));
          const cards = puttsList.querySelectorAll(".putt-card");
          const card = cards[cards.length - 1];
          for (const key in hole.putts[p]) {
            const field = card.querySelector('[data-putt-field="' + key + '"]');
            if (field) field.value = hole.putts[p][key];
          }
        }
      }

      updatePuttingVisibility(i);
    }
  }
}

function getCoursePar() {
  return Number(document.getElementById("coursePar").value) || 0;
}

function getCourseName() {
  const sel = document.getElementById("courseSelect").value;
  if (sel === "RCGC") return "RCGC";
  if (sel === "Other") return document.getElementById("customCourseName").value || "Other course";
  return "";
}

function getCountry() {
  const playedIn = document.getElementById("playedIn").value;
  if (playedIn === "India") return "India";
  return document.getElementById("country").value || "Outside India";
}

function getTotalScore() {
  let total = 0;
  for (const i of getActiveHoles()) {
    total += getShotsForHole(i).length;
  }
  return total;
}

function computeHoleStats(par, shots, firstPuttResult, missedShortStr, savedPutts) {
  par = Number(par) || 0;
  shots = shots || [];
  const puttsArr = savedPutts || [];
  let putts = puttsArr.length;
  let chips = 0;
  let penalties = 0;
  let badShots = 0;
  let goodShots = 0;
  for (const s of shots) {
    if (s.club === "Putter") putts += 1;
    if (WEDGE_CLUBS_FULL.indexOf(s.club) !== -1) chips += 1;
    if (s.result === "Penalty" || s.result === "Out of Bounds" || s.result === "Water" || s.result === "Lost Ball") penalties += 1;
    if (BAD_QUALITIES.indexOf(s.quality) !== -1) badShots += 1;
    if (s.quality === "Good shot") goodShots += 1;
  }
  const score = shots.length + puttsArr.length + penalties;
  let fwHit = 0;
  let fwAns = 0;
  if (par >= 4 && shots.length > 0 && shots[0].lie === "Tee" && shots[0].result) {
    fwAns = 1;
    if (shots[0].result === "Fairway" || shots[0].result === "On fairway") fwHit = 1;
  }
  let gir = 0;
  let girAns = 0;
  if (par >= 3 && shots.length > 0) {
    girAns = 1;
    const greenIdx = shots.findIndex(function (s) {
      return s.result === "Green" || s.result === "On green" || s.result === "Holed";
    });
    if (greenIdx !== -1 && (greenIdx + 1) <= (par - 2)) gir = 1;
  }
  let scrambleAns = 0;
  let scrambleSave = 0;
  if (girAns === 1 && gir === 0 && score > 0) {
    scrambleAns = 1;
    if (score <= par) scrambleSave = 1;
  }
  return {
    par, shots, score, putts, chips, penalties, badShots, goodShots,
    fwHit, fwAns, gir, girAns, scrambleAns, scrambleSave,
    firstPuttResult: firstPuttResult || "",
    missedShort: missedShortStr === "Yes",
  };
}

function getRoundMode() {
  const el = document.getElementById("roundMode");
  return (el && el.value) || localStorage.getItem("roundMode") || "full";
}

function applyRoundMode() {
  const mode = getRoundMode();
  const cards = document.querySelectorAll(".hole-card");
  cards.forEach(function (card) {
    const num = card.querySelector(".add-shot-btn") && card.querySelector(".add-shot-btn").dataset.hole;
    if (!num) return;
    const shotsBlock = card.querySelector(".shots-list");
    const addShotBtn = card.querySelector(".add-shot-btn");
    const shotsHeader = Array.from(card.querySelectorAll("h3")).find(function (h) { return h.textContent === "Shots"; });
    const holeScore = card.querySelector(".hole-score");
    const quickRow = card.querySelector(".quick-row");
    const puttingSection = card.querySelector(".putting-section");

    if (mode === "quick") {
      if (shotsBlock) shotsBlock.style.display = "none";
      if (addShotBtn) addShotBtn.style.display = "none";
      if (shotsHeader) shotsHeader.style.display = "none";
      if (holeScore) holeScore.style.display = "none";
      if (puttingSection) puttingSection.style.display = "none";
      if (quickRow) quickRow.style.display = "";
    } else {
      if (shotsBlock) shotsBlock.style.display = "";
      if (addShotBtn) addShotBtn.style.display = "";
      if (shotsHeader) shotsHeader.style.display = "";
      if (holeScore) holeScore.style.display = "";
      if (quickRow) quickRow.style.display = "none";
      updatePuttingVisibility(num);
    }
  });
}

function getHoleStats(i) {
  const parEl = document.getElementById("par-" + i);
  if (!parEl) {
    return {
      par: 0, shots: [], score: 0, putts: 0, chips: 0, penalties: 0,
      badShots: 0, goodShots: 0, fwHit: 0, fwAns: 0,
      gir: 0, girAns: 0, scrambleAns: 0, scrambleSave: 0,
      firstPuttResult: "", missedShort: false,
    };
  }
  const par = Number(parEl.value) || 0;
  if (getRoundMode() === "quick") {
    const score = Number((document.getElementById("quickScore-" + i) || {}).value) || 0;
    const putts = Number((document.getElementById("quickPutts-" + i) || {}).value) || 0;
    return {
      par, shots: [], score, putts, chips: 0, penalties: 0, badShots: 0, goodShots: 0,
      fwHit: 0, fwAns: 0, gir: 0, girAns: 0, scrambleAns: 0, scrambleSave: 0,
      firstPuttResult: "", missedShort: false,
    };
  }
  const shots = getShotsForHole(i);
  const puttsArr = getPuttsForHole(i);
  let putts = puttsArr.length;
  let chips = 0;
  let penalties = 0;
  let badShots = 0;
  let goodShots = 0;
  for (const s of shots) {
    if (s.club === "Putter") putts += 1;
    if (WEDGE_CLUBS_FULL.indexOf(s.club) !== -1) chips += 1;
    if (s.result === "Penalty" || s.result === "Out of Bounds" || s.result === "Water" || s.result === "Lost Ball") penalties += 1;
    if (BAD_QUALITIES.indexOf(s.quality) !== -1) badShots += 1;
    if (s.quality === "Good shot") goodShots += 1;
  }
  // Score = number of swings + number of putts + extra strokes for each penalty
  // (a penalty result on a shot costs 1 stroke for the swing + 1 penalty stroke).
  const score = shots.length + puttsArr.length + penalties;

  let fwHit = 0;
  let fwAns = 0;
  if (par >= 4 && shots.length > 0 && shots[0].lie === "Tee" && shots[0].result) {
    fwAns = 1;
    if (shots[0].result === "Fairway" || shots[0].result === "On fairway") fwHit = 1;
  }

  // Greens in Regulation: ball on green within (par - 2) swings.
  // par 3 → 1 swing, par 4 → 2 swings, par 5 → 3 swings.
  let gir = 0;
  let girAns = 0;
  if (par >= 3 && shots.length > 0) {
    girAns = 1;
    const greenIdx = shots.findIndex(function (s) {
      return s.result === "Green" || s.result === "On green" || s.result === "Holed";
    });
    if (greenIdx !== -1 && (greenIdx + 1) <= (par - 2)) gir = 1;
  }

  // Scrambling: missed GIR but still made par or better.
  let scrambleAns = 0;
  let scrambleSave = 0;
  if (girAns === 1 && gir === 0 && score > 0) {
    scrambleAns = 1;
    if (score <= par) scrambleSave = 1;
  }

  const firstPuttResult = (document.getElementById("firstPuttResult-" + i) || {}).value || "";
  const missedShort = ((document.getElementById("missedShortPutt-" + i) || {}).value || "") === "Yes";
  return {
    par,
    shots,
    score,
    putts,
    chips,
    penalties,
    badShots,
    goodShots,
    fwHit,
    fwAns,
    gir,
    girAns,
    scrambleAns,
    scrambleSave,
    firstPuttResult,
    missedShort,
  };
}

function analyzeHole(i) {
  const s = getHoleStats(i);
  if (s.score === 0) return null;

  let mistake;
  if (s.penalties > 0) mistake = s.penalties + " penalty stroke(s).";
  else if (s.missedShort) mistake = "Missed a short putt.";
  else if (s.putts >= 3) mistake = "3-putt on this hole.";
  else if (s.badShots > 0) {
    const firstBad = s.shots.find(function (sh) { return BAD_QUALITIES.indexOf(sh.quality) !== -1; });
    mistake = (firstBad ? firstBad.quality : "Mishit") + " hurt your hole.";
  } else if (s.par > 0 && s.score > s.par + 1) mistake = "Score was " + (s.score - s.par) + " over par.";
  else mistake = "No major mistake.";

  let wentWell;
  const hitFairway = s.shots.length > 0 && s.shots[0].lie === "Tee" && s.shots[0].result === "On fairway";
  const reachedGreen = s.shots.some(function (sh) { return sh.result === "On green"; });
  if (s.par > 0 && s.score <= s.par) wentWell = "Made par or better.";
  else if (s.firstPuttResult === "Holed") wentWell = "Holed your first putt.";
  else if (hitFairway) wentWell = "Hit the fairway off the tee.";
  else if (reachedGreen) wentWell = "Reached the green.";
  else if (s.goodShots > 0) wentWell = s.goodShots + " good shot(s).";
  else wentWell = "Keep your head up.";

  let practise;
  if (s.missedShort || s.putts >= 3) practise = "Short putting.";
  else if (s.penalties > 0) practise = "Course management.";
  else if (s.badShots > 0) practise = "Ball striking.";
  else if (s.par >= 4 && !hitFairway && s.shots.length > 0 && s.shots[0].lie === "Tee") practise = "Tee shot accuracy.";
  else if (s.firstPuttResult === "Short" || s.firstPuttResult === "Long") practise = "Lag putting.";
  else if (s.par > 0 && s.score > s.par + 1) practise = "Approach shots.";
  else practise = "Keep doing what you're doing.";

  return { mistake, wentWell, practise };
}

function renderHoleAnalyses() {
  for (const i of getActiveHoles()) {
    const div = document.getElementById("holeAnalysis-" + i);
    if (!div) continue;
    div.innerHTML = "";
    const a = analyzeHole(i);
    if (!a) continue;
    const lines = [
      "Main mistake: " + a.mistake,
      "What went well: " + a.wentWell,
      "Practise: " + a.practise,
    ];
    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      div.appendChild(p);
    }
  }
}

function getTrendLines(throughHole) {
  const half = Math.floor(throughHole / 2);

  function avg(holes, key) {
    if (holes.length === 0) return null;
    let total = 0;
    for (const h of holes) total += h[key];
    return total / holes.length;
  }
  function avgPct(holes, hitKey, ansKey) {
    let hit = 0;
    let ans = 0;
    for (const h of holes) {
      hit += h[hitKey];
      ans += h[ansKey];
    }
    if (ans === 0) return null;
    return hit / ans;
  }

  const allStats = [];
  for (let i = 1; i <= throughHole; i++) {
    const s = getHoleStats(i);
    if (s.score > 0) allStats.push(s);
  }
  if (allStats.length < 2) return ["Play more holes for a trend check."];

  const first = [];
  const second = [];
  for (const st of allStats) {
    if (st === undefined) continue;
  }
  for (let i = 1; i <= throughHole; i++) {
    const s = getHoleStats(i);
    if (s.score === 0) continue;
    if (i <= half) first.push(s);
    else second.push(s);
  }
  if (first.length === 0 || second.length === 0) return ["Play more holes for a trend check."];

  const lines = [];

  const firstBad = avg(first, "badShots");
  const secondBad = avg(second, "badShots");
  if (firstBad !== null && secondBad !== null) {
    if (secondBad > firstBad + 0.5) lines.push("Misses are increasing - take a breath.");
    else if (secondBad < firstBad - 0.5) lines.push("Fewer misses than earlier - great rhythm.");
  }

  const firstPutts = avg(first, "putts");
  const secondPutts = avg(second, "putts");
  if (firstPutts !== null && secondPutts !== null) {
    if (secondPutts > firstPutts + 0.4) lines.push("Putting is getting worse.");
    else if (secondPutts < firstPutts - 0.4) lines.push("Putting is improving.");
  }

  const firstFw = avgPct(first, "fwHit", "fwAns");
  const secondFw = avgPct(second, "fwHit", "fwAns");
  if (firstFw !== null && secondFw !== null) {
    if (secondFw > firstFw + 0.2) lines.push("Tee shots are improving.");
    else if (secondFw < firstFw - 0.2) lines.push("Tee shots getting less accurate.");
  }

  const firstScore = avg(first, "score");
  const secondScore = avg(second, "score");
  if (firstScore !== null && secondScore !== null) {
    if (secondScore > firstScore + 0.8) lines.push("Fatigue may be showing - score per hole going up.");
  }

  if (lines.length === 0) lines.push("Steady performance - keep going.");
  return lines;
}

function renderTrendChecks() {
  for (const h of [5, 10, 15]) {
    if (h > holeCount) continue;
    const wrap = document.getElementById("trendCheck-" + h);
    if (!wrap) continue;
    let hasData = false;
    for (let i = 1; i <= h; i++) {
      if (getShotsForHole(i).length > 0) { hasData = true; break; }
    }
    if (!hasData) {
      wrap.style.display = "none";
      continue;
    }
    wrap.style.display = "";
    const linesDiv = wrap.querySelector(".trend-lines");
    linesDiv.innerHTML = "";
    const lines = getTrendLines(h);
    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      linesDiv.appendChild(p);
    }
  }
}

function updateSummary() {
  let totalScore = 0;
  let totalPar = 0;
  let totalPutts = 0;
  let totalChips = 0;
  let totalPenalties = 0;
  let fairwaysHit = 0;
  let fairwaysAnswered = 0;
  let missedShortPutts = 0;
  let scoredHolesCount = 0;
  let girHit = 0;
  let girAns = 0;
  let scrambleSave = 0;
  let scrambleAns = 0;

  for (const i of getActiveHoles()) {
    const s = getHoleStats(i);
    document.getElementById("holeScore-" + i).textContent = s.score;
    totalScore += s.score;
    if (s.score > 0) {
      totalPar += s.par;
      scoredHolesCount += 1;
    }
    totalPutts += s.putts;
    totalChips += s.chips;
    totalPenalties += s.penalties;
    fairwaysHit += s.fwHit;
    fairwaysAnswered += s.fwAns;
    girHit += s.gir;
    girAns += s.girAns;
    scrambleSave += s.scrambleSave;
    scrambleAns += s.scrambleAns;
    if (s.missedShort) missedShortPutts += 1;
  }

  const coursePar = getCoursePar();
  const parForDiff = totalPar > 0 ? totalPar : coursePar;
  const diff = totalScore - parForDiff;
  const diffText = totalScore === 0 ? "—" : (diff > 0 ? "+" + diff : "" + diff);

  let fairwayPct = 0;
  if (fairwaysAnswered > 0) fairwayPct = Math.round((fairwaysHit / fairwaysAnswered) * 100);

  document.getElementById("sumScore").textContent = "Total Score: " + totalScore;
  document.getElementById("sumDiff").textContent = "Score vs Par: " + diffText;
  document.getElementById("sumPutts").textContent = "Total Putts: " + totalPutts;
  document.getElementById("sumChips").textContent = "Total Chips: " + totalChips;
  document.getElementById("sumChipsPutts").textContent = "Chips + Putts: " + (totalChips + totalPutts);
  document.getElementById("sumFairway").textContent = "Fairway Hit %: " + fairwayPct + "%";

  const girEl = document.getElementById("sumGir");
  if (girEl) {
    const pct = girAns > 0 ? Math.round((girHit / girAns) * 100) : 0;
    girEl.textContent = "Greens in Regulation: " + pct + "% (" + girHit + "/" + girAns + ")";
  }
  const scrEl = document.getElementById("sumScramble");
  if (scrEl) {
    if (scrambleAns === 0) scrEl.textContent = "Scrambling: — (every green hit)";
    else {
      const pct = Math.round((scrambleSave / scrambleAns) * 100);
      scrEl.textContent = "Scrambling: " + pct + "% (" + scrambleSave + "/" + scrambleAns + ")";
    }
  }

  document.getElementById("sumPenalties").textContent = "Penalties: " + totalPenalties;
  document.getElementById("sumMissed").textContent = "Missed Short Putts: " + missedShortPutts;
}

function analyze() {
  let totalScore = 0;
  let totalPutts = 0;
  let totalPenalties = 0;
  let fairwaysHit = 0;
  let fairwaysAnswered = 0;
  let missedShortPutts = 0;
  let firstPuttShort = 0;
  let firstPuttLong = 0;
  let threePutts = 0;
  let badShots = 0;
  let goodShots = 0;
  let par3Score = 0;
  let par3ParTotal = 0;
  let par3Count = 0;
  let scoredHoles = 0;

  let girHit = 0, girAns = 0, scrambleSave = 0, scrambleAns = 0;
  for (const i of getActiveHoles()) {
    const s = getHoleStats(i);
    if (s.score > 0) scoredHoles += 1;
    totalScore += s.score;
    totalPutts += s.putts;
    totalPenalties += s.penalties;
    fairwaysHit += s.fwHit;
    fairwaysAnswered += s.fwAns;
    badShots += s.badShots;
    goodShots += s.goodShots;
    girHit += s.gir || 0;
    girAns += s.girAns || 0;
    scrambleSave += s.scrambleSave || 0;
    scrambleAns += s.scrambleAns || 0;
    if (s.putts >= 3) threePutts += 1;
    if (s.firstPuttResult === "Short") firstPuttShort += 1;
    if (s.firstPuttResult === "Long") firstPuttLong += 1;
    if (s.missedShort) missedShortPutts += 1;
    if (s.par === 3 && s.score > 0) {
      par3Score += s.score;
      par3ParTotal += s.par;
      par3Count += 1;
    }
  }

  let fairwayPct = null;
  if (fairwaysAnswered > 0) fairwayPct = Math.round((fairwaysHit / fairwaysAnswered) * 100);
  const girPct = girAns > 0 ? Math.round((girHit / girAns) * 100) : null;
  const scramblePct = scrambleAns > 0 ? Math.round((scrambleSave / scrambleAns) * 100) : null;

  const mistakes = [];
  if (totalPenalties >= 1) mistakes.push("Penalty strokes lost: " + totalPenalties + ".");
  if (fairwayPct !== null && fairwayPct < 60) mistakes.push("Missed fairways: only " + fairwayPct + "% hit.");
  if (girPct !== null && girAns >= 3 && girPct < 30) mistakes.push("Greens in Regulation only " + girPct + "% — approach play needs work.");
  if (scramblePct !== null && scrambleAns >= 3 && scramblePct < 30) mistakes.push("Scrambling only " + scramblePct + "% — short game lost strokes.");
  if (missedShortPutts >= 1) mistakes.push("Missed " + missedShortPutts + " short putt(s).");
  if (firstPuttShort >= 2) mistakes.push("First putts too short " + firstPuttShort + " times.");
  if (firstPuttLong >= 2) mistakes.push("First putts too long " + firstPuttLong + " times.");
  if (threePutts >= 1) mistakes.push(threePutts + " three-putt(s).");
  if (badShots >= 2) mistakes.push("Poor shots (top/duff/slice/hook): " + badShots + ".");

  const strengths = [];
  if (fairwayPct !== null && fairwayPct >= 70) strengths.push("Good fairway accuracy: " + fairwayPct + "%.");
  if (girPct !== null && girAns >= 3 && girPct >= 50) strengths.push("Strong approach play: " + girPct + "% GIR.");
  if (scramblePct !== null && scrambleAns >= 3 && scramblePct >= 50) strengths.push("Sharp short game: " + scramblePct + "% scrambling.");
  if (scoredHoles > 0 && totalPutts / scoredHoles < 2) strengths.push("Good putting: " + (totalPutts / scoredHoles).toFixed(1) + " putts per hole.");
  if (totalPenalties === 0 && scoredHoles >= Math.min(holeCount, 9)) strengths.push("Penalty-free round.");
  if (par3Count >= 2 && par3Score <= par3ParTotal + 1) strengths.push("Strong scoring on par 3s.");
  if (goodShots >= 8) strengths.push("Lots of good shots (" + goodShots + ").");

  const practice = [];
  if (missedShortPutts >= 1) practice.push("Short putting (3-5 foot putts)");
  if (fairwayPct !== null && fairwayPct < 60) practice.push("Tee shot accuracy");
  if (firstPuttShort >= 2 || firstPuttLong >= 2) practice.push("Lag putting (long putts)");
  if (totalPenalties >= 1) practice.push("Course management - safer lines off the tee");
  if (badShots >= 2) practice.push("Ball striking (clean contact, smooth tempo)");
  if (threePutts >= 1) practice.push("Speed control on long putts");
  if (scoredHoles >= 3 && practice.length === 0) {
    practice.push("Keep the basics sharp - 20 chips and 20 short putts a day");
    practice.push("Mix in lag putts from 30+ feet to keep speed control sharp");
  }

  const weaknesses = [];
  if (missedShortPutts >= 2) weaknesses.push({ score: missedShortPutts * 20, text: "Your biggest weakness today was putting because you had " + totalPutts + " putts and missed " + missedShortPutts + " short putts. Practise 3-5 foot putts first." });
  if (threePutts >= 3) weaknesses.push({ score: threePutts * 18, text: "Your biggest weakness today was 3-putting because you had " + threePutts + " three-putts. Practise lag putting from 30+ feet." });
  if (totalPenalties >= 3) weaknesses.push({ score: totalPenalties * 15, text: "Your biggest weakness today was penalties because you lost " + totalPenalties + " strokes. Play safer off the tee." });
  if (fairwayPct !== null && fairwayPct < 50) weaknesses.push({ score: 50 - fairwayPct, text: "Your biggest weakness today was driving accuracy because you only hit " + fairwayPct + "% of fairways. Practise tee shots with a target." });
  if (badShots >= 5) weaknesses.push({ score: badShots * 10, text: "Your biggest weakness today was ball striking - " + badShots + " tops/duffs/slices/hooks. Spend more time on the range." });

  let topWeakness;
  if (scoredHoles < 5) topWeakness = "Fill in shots for at least 5 holes to get your coach feedback.";
  else if (weaknesses.length === 0) topWeakness = "No big weakness today - well played!";
  else {
    weaknesses.sort(function (a, b) { return b.score - a.score; });
    topWeakness = weaknesses[0].text;
  }

  const blunders = collectBlunders();
  const improve = buildImproveAdvice(mistakes);

  renderList("mistakesList", mistakes, "No big mistakes yet - keep going!");
  renderList("blundersList", blunders, "No blunders this round!");
  renderList("practiceList", practice, "Play more rounds to find what to practise.");
  renderList("improveList", improve, "Fill in shots to get improvement tips.");
  renderList("strengthsList", strengths, "Fill in more holes to see your strengths.");
  document.getElementById("topWeakness").textContent = topWeakness;

  renderHoleAnalyses();
  renderTrendChecks();
}

function collectBlunders() {
  const blunders = [];
  for (const i of getActiveHoles()) {
    const s = getHoleStats(i);
    if (s.score === 0) continue;
    if (s.penalties > 0) blunders.push("Hole " + i + ": " + s.penalties + " penalty stroke(s).");
    if (s.putts >= 3) blunders.push("Hole " + i + ": 3-putt (" + s.putts + " putts).");
    if (s.missedShort) blunders.push("Hole " + i + ": missed a short putt.");
    if (s.par > 0 && s.score >= s.par + 3) blunders.push("Hole " + i + ": " + (s.score - s.par) + " over par.");
  }
  return blunders.slice(0, 5);
}

function buildImproveAdvice(mistakes) {
  const tips = [];
  const seen = {};
  function add(key, text) {
    if (seen[key]) return;
    seen[key] = true;
    tips.push(text);
  }
  for (const m of mistakes) {
    const lower = m.toLowerCase();
    if (lower.indexOf("short putt") !== -1) {
      add("shortputt", "Drill: place 5 balls in a circle 3 feet from the hole. Don't leave until you hole all 5 in a row.");
    }
    if (lower.indexOf("3-putt") !== -1) {
      add("threeputt", "Drill: roll 10 lag putts from 30 feet to a coin. Focus on speed, not the line.");
    }
    if (lower.indexOf("fairway") !== -1) {
      add("fairway", "Use a club you trust off the tee. Aim at a small target, not the whole fairway.");
    }
    if (lower.indexOf("penalty") !== -1 || lower.indexOf("penalties") !== -1) {
      add("penalty", "Pick a safe line. Aim 10 yards inside trouble. Take one less club when you're not sure.");
    }
    if (lower.indexOf("first putts too short") !== -1) {
      add("puttshort", "Practice: hit putts past the hole on purpose. A putt short of the hole never goes in.");
    }
    if (lower.indexOf("first putts too long") !== -1) {
      add("puttlong", "Slow your backswing. Use shoulders, not wrists, for long putts.");
    }
    if (lower.indexOf("poor shots") !== -1 || lower.indexOf("tops") !== -1 || lower.indexOf("ball striking") !== -1) {
      add("strike", "Slow your tempo. Practice half-swings with your 7-iron until contact is clean.");
    }
  }
  if (tips.length === 0) {
    tips.push("Keep practising your strengths - chip 20 balls and putt 20 short putts each day.");
  }
  return tips;
}

function renderList(id, items, emptyText) {
  const ul = document.getElementById(id);
  ul.innerHTML = "";
  const list = items.length > 0 ? items : [emptyText];
  for (const item of list) {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  }
}

function saveRoundToHistory() {
  let totalScore = 0;
  let totalPar = 0;
  let totalPutts = 0;
  let totalChips = 0;
  let totalPenalties = 0;
  let fairwaysHit = 0;
  let fairwaysAnswered = 0;
  let missedShortPutts = 0;
  let badShots = 0;
  let girHit = 0;
  let girAns = 0;
  let scrambleSave = 0;
  let scrambleAns = 0;

  for (const i of getActiveHoles()) {
    const s = getHoleStats(i);
    totalScore += s.score;
    if (s.score > 0) totalPar += s.par;
    totalPutts += s.putts;
    totalChips += s.chips;
    totalPenalties += s.penalties;
    fairwaysHit += s.fwHit;
    fairwaysAnswered += s.fwAns;
    badShots += s.badShots;
    girHit += s.gir;
    girAns += s.girAns;
    scrambleSave += s.scrambleSave;
    scrambleAns += s.scrambleAns;
    if (s.missedShort) missedShortPutts += 1;
  }

  const coursePar = getCoursePar();
  const parForRound = totalPar > 0 ? totalPar : coursePar;
  const fairwayPct = fairwaysAnswered > 0 ? Math.round((fairwaysHit / fairwaysAnswered) * 100) : null;
  const girPct = girAns > 0 ? Math.round((girHit / girAns) * 100) : null;
  const scramblePct = scrambleAns > 0 ? Math.round((scrambleSave / scrambleAns) * 100) : null;

  const fullData = { setup: {}, holes: {} };
  for (const f of SETUP_FIELDS) {
    const el = document.getElementById(f);
    if (el) fullData.setup[f] = el.value;
  }
  for (const i of getActiveHoles()) {
    fullData.holes[i] = {
      par: (document.getElementById("par-" + i) || {}).value || "",
      distance: (document.getElementById("holeDistance-" + i) || {}).value || "",
      shots: getShotsForHole(i),
      putts: getPuttsForHole(i),
      firstPuttDistance: (document.getElementById("firstPuttDistance-" + i) || {}).value || "",
      firstPuttResult: (document.getElementById("firstPuttResult-" + i) || {}).value || "",
      missedShortPutt: (document.getElementById("missedShortPutt-" + i) || {}).value || "",
    };
  }

  const analysis = computeAnalysisFromHoles(getAllHoleStatsList());

  const round = {
    playerName: document.getElementById("playerName").value || "Unknown",
    date: document.getElementById("roundDate").value || "",
    country: getCountry(),
    courseName: getCourseName() || "Unknown course",
    tee: document.getElementById("teeSelect").value || "",
    coursePar,
    parPlayed: parForRound,
    handicap: (getProfile().handicap !== undefined ? getProfile().handicap : null),
    birthday: getProfile().birthday || null,
    ageAtRound: calcAge(getProfile().birthday),
    weather: localStorage.getItem("defaultsTemp") || "",
    weatherData: (function () {
      try { return JSON.parse(localStorage.getItem("currentWeather") || "null"); }
      catch (e) { return null; }
    })(),
    totalScore,
    scoreVsPar: parForRound > 0 ? totalScore - parForRound : 0,
    totalPutts,
    totalChips,
    totalPenalties,
    fairwayPct,
    girPct,
    scramblePct,
    badShots,
    missedShortPutts,
    holes: getActiveHoles().length,
    activeHoles: getActiveHoles(),
    holesMode: document.getElementById("holesMode").value || "18",
    roundMode: getRoundMode(),
    savedAt: new Date().toISOString(),
    gameType: document.getElementById("gameType").value || "Normal Game",
    tournamentName: document.getElementById("tournamentName").value || "",
    tournamentFormat: document.getElementById("tournamentFormat").value || "",
    greenSpeed: localStorage.getItem("greenSpeedToday") || "",
    teeOffTime: (document.getElementById("teeOffTime") || {}).value || "",
    timeBlock: deriveTimeBlock((document.getElementById("teeOffTime") || {}).value || ""),
    back9StartTime: localStorage.getItem("back9StartTime") || "",
    back9TimeBlock: deriveTimeBlock(localStorage.getItem("back9StartTime") || ""),
    weatherFront9: (function () {
      try { return JSON.parse(localStorage.getItem("currentWeather") || "null"); }
      catch (e) { return null; }
    })(),
    weatherBack9: (function () {
      try { return JSON.parse(localStorage.getItem("weatherBack9") || "null"); }
      catch (e) { return null; }
    })(),
    energyLevel: (document.getElementById("energyLevel") || {}).value || "",
    confidenceLevel: (document.getElementById("confidenceLevel") || {}).value || "",
    sleepQuality: (document.getElementById("sleepQuality") || {}).value || "",
    postFeel: document.getElementById("postFeel").value || "",
    postBestShot: document.getElementById("postBestShot").value || "",
    postBiggestMistake: document.getElementById("postBiggestMistake").value || "",
    postImprove: document.getElementById("postImprove").value || "",
    mistakes: analysis.mistakes,
    strengths: analysis.strengths,
    practice: analysis.practice,
    topWeakness: analysis.topWeakness,
    fullData: fullData,
  };

  const history = JSON.parse(localStorage.getItem("roundHistory") || "[]");

  const prior = findPriorSameRound(history, round);
  history.push(round);
  localStorage.setItem("roundHistory", JSON.stringify(history));
  renderHistory();
  renderDashboard();

  if (prior) {
    showComparisonModal(round, prior);
  }
}

function findPriorSameRound(history, round) {
  for (let i = history.length - 1; i >= 0; i--) {
    const r = history[i];
    if (r.courseName === round.courseName && (r.tee || "") === (round.tee || "") && r.holes === round.holes) {
      return r;
    }
  }
  return null;
}

function deleteRound(index) {
  if (!confirm("Delete this round? This cannot be undone.")) return;
  const history = getHistory();
  history.splice(index, 1);
  localStorage.setItem("roundHistory", JSON.stringify(history));
  renderHistory();
  renderDashboard();
}

function showComparisonModal(current, prior) {
  const body = document.getElementById("modalBody");
  body.innerHTML = "";

  const title = document.createElement("h2");
  title.textContent = "Compared to last " + current.courseName + (current.tee ? " " + current.tee : "") + " round";
  body.appendChild(title);

  const dateInfo = document.createElement("p");
  dateInfo.textContent = "Previous: " + (prior.date || "—") + " | This round: " + (current.date || "—");
  body.appendChild(dateInfo);

  const strengths = [];
  const weaknesses = [];

  function diff(label, prev, curr, lower) {
    if (prev === undefined || curr === undefined || prev === null || curr === null) return null;
    const d = curr - prev;
    if (Math.abs(d) < 0.5) return label + " is the same.";
    const better = lower ? d < 0 : d > 0;
    const text = label + " " + (better ? "improved" : "got worse") + " (" + prev + " → " + curr + ")";
    if (better) strengths.push(text);
    else weaknesses.push(text);
    return text;
  }

  const lines = [];
  lines.push(diff("Score", prior.totalScore, current.totalScore, true));
  lines.push(diff("Putts", prior.totalPutts, current.totalPutts, true));
  lines.push(diff("Chips", prior.totalChips, current.totalChips, true));
  lines.push(diff("Penalties", prior.totalPenalties, current.totalPenalties, true));
  lines.push(diff("Missed short putts", prior.missedShortPutts, current.missedShortPutts, true));
  if (typeof prior.fairwayPct === "number" && typeof current.fairwayPct === "number") {
    const d = current.fairwayPct - prior.fairwayPct;
    const txt = "Fairway % " + (d >= 0 ? "improved" : "dropped") + " (" + prior.fairwayPct + "% → " + current.fairwayPct + "%)";
    if (d >= 0) strengths.push(txt);
    else weaknesses.push(txt);
    lines.push(txt);
  }

  for (const line of lines) {
    if (!line) continue;
    const p = document.createElement("p");
    p.textContent = line;
    body.appendChild(p);
  }

  if (strengths.length > 0) {
    const h = document.createElement("h3");
    h.textContent = "Biggest improvement";
    body.appendChild(h);
    const p = document.createElement("p");
    p.textContent = strengths[0];
    body.appendChild(p);
  }
  if (weaknesses.length > 0) {
    const h = document.createElement("h3");
    h.textContent = "Biggest problem still remaining";
    body.appendChild(h);
    const p = document.createElement("p");
    p.textContent = weaknesses[0];
    body.appendChild(p);
  }
  if (current.mistakes && current.mistakes.length > 0) {
    const h = document.createElement("h3");
    h.textContent = "Main mistakes this round";
    body.appendChild(h);
    const ul = document.createElement("ul");
    for (const m of current.mistakes) {
      const li = document.createElement("li");
      li.textContent = m;
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  document.getElementById("roundDetailModal").style.display = "";
  window.scrollTo(0, 0);
}

function renderHistory() {
  const list = document.getElementById("roundsList");
  list.innerHTML = "";
  const history = JSON.parse(localStorage.getItem("roundHistory") || "[]");

  if (history.length >= 5) {
    list.appendChild(makeImprovementBanner(history));
  }

  const comparisons = makeCourseComparisons(history);
  for (const c of comparisons) list.appendChild(c);

  if (history.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No rounds saved yet.";
    list.appendChild(p);
    return;
  }

  for (let i = history.length - 1; i >= 0; i--) {
    const round = history[i];
    const idx = i;
    const card = document.createElement("div");
    card.className = "round-card";

    const diffText = round.scoreVsPar > 0 ? "+" + round.scoreVsPar : "" + round.scoreVsPar;
    const holesLabel = round.holesMode === "front9" ? "Front 9" :
                       round.holesMode === "back9" ? "Back 9" :
                       round.holesMode === "custom" ? "Custom (" + (round.holes || "?") + ")" :
                       (round.holes || 18) + " holes";
    const lines = [
      "Date: " + (round.date || "—") + " — " + (round.gameType || "Normal Game"),
      "Course: " + round.courseName + (round.tee ? " (" + round.tee + ")" : ""),
      "Holes Played: " + holesLabel,
      "Score: " + round.totalScore + "  |  vs Par: " + diffText,
    ];
    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      card.appendChild(p);
    }

    const btns = document.createElement("div");
    btns.className = "round-card-buttons";

    const viewBtn = document.createElement("button");
    viewBtn.className = "btn-view";
    viewBtn.textContent = "View";
    viewBtn.addEventListener("click", function () { showRoundDetail(round); });
    btns.appendChild(viewBtn);

    const compareBtn = document.createElement("button");
    compareBtn.className = "btn-compare";
    compareBtn.textContent = "Compare";
    compareBtn.addEventListener("click", function () {
      const earlier = getHistory().slice(0, idx);
      const prior = findPriorSameRound(earlier, round);
      if (prior) showComparisonModal(round, prior);
      else alert("No earlier round at " + round.courseName + (round.tee ? " " + round.tee : "") + " (" + (round.holes || 18) + " holes) to compare.");
    });
    btns.appendChild(compareBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", function () { deleteRound(idx); });
    btns.appendChild(deleteBtn);

    card.appendChild(btns);
    list.appendChild(card);
  }
}

function makeImprovementBanner(history) {
  const div = document.createElement("div");
  div.className = "improvement-banner";
  const h = document.createElement("h3");
  h.textContent = "After " + history.length + " rounds";
  div.appendChild(h);

  const first = history[0];
  const last = history[history.length - 1];
  const change = last.totalScore - first.totalScore;

  let msg;
  if (first.coursePar && last.coursePar) {
    const firstDiff = first.totalScore - first.coursePar;
    const lastDiff = last.totalScore - last.coursePar;
    const diffChange = lastDiff - firstDiff;
    if (diffChange < 0) msg = "Your game has IMPROVED. Score vs par changed from " + (firstDiff >= 0 ? "+" + firstDiff : firstDiff) + " to " + (lastDiff >= 0 ? "+" + lastDiff : lastDiff) + " - " + Math.abs(diffChange) + " strokes better.";
    else if (diffChange > 0) msg = "Your scores have gone UP by " + diffChange + " strokes vs par. Time to focus on weak areas.";
    else msg = "Your score is steady at " + (firstDiff >= 0 ? "+" + firstDiff : firstDiff) + " vs par.";
  } else if (change < 0) msg = "Your game has IMPROVED. First round: " + first.totalScore + ". Latest: " + last.totalScore + ". Drop of " + Math.abs(change) + " strokes.";
  else if (change > 0) msg = "Your scores have gone UP. First: " + first.totalScore + ". Latest: " + last.totalScore + ".";
  else msg = "Your score is steady at " + last.totalScore + ".";

  const p = document.createElement("p");
  p.textContent = msg;
  div.appendChild(p);
  return div;
}

function makeCourseComparisons(history) {
  const byCourse = {};
  for (const r of history) {
    if (!byCourse[r.courseName]) byCourse[r.courseName] = [];
    byCourse[r.courseName].push(r);
  }
  const cards = [];
  for (const course in byCourse) {
    const rounds = byCourse[course];
    if (rounds.length < 2) continue;
    const r1 = rounds[rounds.length - 2];
    const r2 = rounds[rounds.length - 1];
    cards.push(buildComparisonCard(course, r1, r2));
  }
  return cards;
}

function buildComparisonCard(course, r1, r2) {
  const div = document.createElement("div");
  div.className = "comparison-card";
  const h = document.createElement("h3");
  h.textContent = course + " - Last 2 Rounds Comparison";
  div.appendChild(h);

  const strengths = [];
  const weaknesses = [];

  const scoreChange = r2.totalScore - r1.totalScore;
  if (scoreChange < 0) strengths.push("Score dropped by " + Math.abs(scoreChange) + " strokes.");
  else if (scoreChange > 0) weaknesses.push("Score went up by " + scoreChange + " strokes.");

  if (r2.totalPutts !== undefined && r1.totalPutts !== undefined) {
    const puttChange = r2.totalPutts - r1.totalPutts;
    if (puttChange < 0) strengths.push("Putting improved (" + Math.abs(puttChange) + " fewer putts).");
    else if (puttChange > 0) weaknesses.push("Putting got worse (" + puttChange + " more putts).");
  }

  if (r2.totalPenalties !== undefined && r1.totalPenalties !== undefined) {
    const penChange = r2.totalPenalties - r1.totalPenalties;
    if (penChange < 0) strengths.push("Fewer penalties this round.");
    else if (penChange > 0) weaknesses.push("More penalties this round.");
  }

  if (r2.fairwayPct != null && r1.fairwayPct != null) {
    const fwChange = r2.fairwayPct - r1.fairwayPct;
    if (fwChange >= 5) strengths.push("Fairway accuracy up " + fwChange + "%.");
    else if (fwChange <= -5) weaknesses.push("Fairway accuracy down " + Math.abs(fwChange) + "%.");
  }

  if (r2.missedShortPutts !== undefined && r1.missedShortPutts !== undefined) {
    const msChange = r2.missedShortPutts - r1.missedShortPutts;
    if (msChange < 0) strengths.push("Fewer missed short putts.");
    else if (msChange > 0) weaknesses.push("More missed short putts.");
  }

  function addSection(title, items, fallback) {
    const h4 = document.createElement("h4");
    h4.textContent = title;
    div.appendChild(h4);
    if (items.length === 0) {
      const p = document.createElement("p");
      p.textContent = fallback;
      div.appendChild(p);
      return;
    }
    const ul = document.createElement("ul");
    for (const it of items) {
      const li = document.createElement("li");
      li.textContent = it;
      ul.appendChild(li);
    }
    div.appendChild(ul);
  }

  addSection("Strengths", strengths, "No clear strengths yet.");
  addSection("Weaknesses", weaknesses, "No clear weaknesses.");

  return div;
}

function clearCurrentRound() {
  for (const f of SETUP_FIELDS) {
    const el = document.getElementById(f);
    if (!el) continue;
    if (f === "holesMode") el.value = "18";
    else if (f === "playedIn") el.value = "India";
    else if (f === "gameType") el.value = "Normal Game";
    else el.value = "";
  }
  for (const f of POST_REVIEW_FIELDS) {
    const el = document.getElementById(f);
    if (el) el.value = "";
  }
  holeCount = 18;
  buildHoles();
  toggleSetupRows();
  applyCourseData();
  localStorage.removeItem("golfRound");
  // Per-round transient state (back-9 timestamp + weather snapshot) should
  // not bleed into the next round.
  localStorage.removeItem("back9StartTime");
  localStorage.removeItem("weatherBack9");
  updateSummary();
  analyze();
}

function handleChange() {
  saveAll();
  updateSummary();
  analyze();
  updateHoleParColors();
  updateHoleNav();
  const courseKey = document.getElementById("courseSelect").value;
  if (courseKey === "Other" || COURSES[courseKey]) {
    updateCourseInfoFromInputs();
  }
}

function onSetupChange(event) {
  if (event.target.id === "holesMode") {
    if (event.target.value === "custom") {
      buildCustomHoleChecks();
    }
    toggleSetupRows();
    buildHoles();
    loadAll();
  }
  if (event.target.dataset && event.target.dataset.holeCheck) {
    buildHoles();
  }
  if (event.target.id === "playedIn") {
    toggleSetupRows();
  }
  if (event.target.id === "gameType") {
    toggleSetupRows();
  }
  if (event.target.id === "courseSelect" || event.target.id === "teeSelect") {
    toggleSetupRows();
    applyCourseData();
    const d = (document.getElementById("defaultsDateInput") || {}).value;
    if (d) loadTemperatureForDate(d);
  }
  handleChange();
}

function onHolesClick(event) {
  if (event.target.matches(".add-shot-btn")) {
    const holeNum = event.target.dataset.hole;
    addShot(holeNum);
    recomputeDistancesForHole(holeNum);
    handleChange();
  } else if (event.target.matches(".remove-shot-btn")) {
    const card = event.target.closest(".shot-card");
    const shotsList = card.parentElement;
    const holeCard = card.closest(".hole-card");
    const holeNum = holeCard ? holeCard.querySelector(".add-shot-btn").dataset.hole : null;
    card.remove();
    renumberShots(shotsList);
    if (holeNum) recomputeDistancesForHole(holeNum);
    handleChange();
  } else if (event.target.matches(".add-putt-btn")) {
    const holeNum = event.target.dataset.hole;
    addPutt(holeNum);
    handleChange();
  } else if (event.target.matches(".remove-putt-btn")) {
    const card = event.target.closest(".putt-card");
    const list = card.parentElement;
    card.remove();
    renumberPutts(list);
    handleChange();
  }
}

function onHolesInput(event) {
  if (event.target.dataset && event.target.dataset.shotField === "distanceLeft") {
    event.target.dataset.auto = "0";
  }
  const t = event.target;
  if (t.dataset && t.dataset.shotField === "club") {
    const shotCard = t.closest(".shot-card");
    if (shotCard) {
      const hitEl = shotCard.querySelector('[data-shot-field="distanceHit"]');
      if (hitEl && (!hitEl.value || hitEl.dataset.autoFromClub === "1")) {
        const dist = getClubDistance(t.value);
        if (dist != null && dist > 0) {
          hitEl.value = dist;
          hitEl.dataset.autoFromClub = "1";
        }
      }
    }
  }
  if (t.dataset && t.dataset.shotField === "distanceHit") {
    t.dataset.autoFromClub = "0";
  }
  if (t.dataset && (t.dataset.shotField === "distanceHit" || t.dataset.shotField === "result")) {
    const holeCard = t.closest(".hole-card");
    if (holeCard) {
      const btn = holeCard.querySelector(".add-shot-btn");
      if (btn) {
        recomputeDistancesForHole(btn.dataset.hole);
        updatePuttingVisibility(btn.dataset.hole);
      }
    }
  }
  if (t.id && t.id.indexOf("holeDistance-") === 0) {
    const num = t.id.split("-")[1];
    recomputeDistancesForHole(num);
  }
}

setupContainer.addEventListener("change", onSetupChange);
setupContainer.addEventListener("input", handleChange);

const teeSelectEl = document.getElementById("teeSelect");
if (teeSelectEl) {
  teeSelectEl.addEventListener("change", function () {
    toggleSetupRows();
    applyCourseData();
    handleChange();
  });
}
holesContainer.addEventListener("input", function (e) { onHolesInput(e); handleChange(); });
holesContainer.addEventListener("change", function (e) { onHolesInput(e); handleChange(); });
holesContainer.addEventListener("click", onHolesClick);

const postReview = document.querySelector(".post-review");
if (postReview) {
  postReview.addEventListener("input", handleChange);
}

document.getElementById("saveRoundBtn").addEventListener("click", function () {
  if (getTotalScore() === 0) {
    alert("Add some shots before saving the round.");
    return;
  }
  saveRoundToHistory();
  if (confirm("Round saved! Start a new round now?")) {
    clearCurrentRound();
  }
});

document.getElementById("resetBtn").addEventListener("click", function () {
  if (confirm("Start a new round? This will clear all holes (not your previous rounds).")) {
    clearCurrentRound();
  }
});

document.getElementById("logoutBtn").addEventListener("click", function () {
  if (confirm("Log out? Your saved rounds will stay safe.")) {
    localStorage.removeItem("golfLoggedIn");
    showLogin();
  }
});

function getAllHoleStatsList() {
  const list = [];
  for (const i of getActiveHoles()) {
    list.push(getHoleStats(i));
  }
  return list;
}

function getHoleStatsFromSavedHole(holeData) {
  return computeHoleStats(
    holeData.par,
    holeData.shots || [],
    holeData.firstPuttResult,
    holeData.missedShortPutt,
    holeData.putts || []
  );
}

function computeAnalysisFromHoles(holeStatsList) {
  let totalScore = 0;
  let totalPutts = 0;
  let totalPenalties = 0;
  let fairwaysHit = 0;
  let fairwaysAnswered = 0;
  let missedShortPutts = 0;
  let firstPuttShort = 0;
  let firstPuttLong = 0;
  let threePutts = 0;
  let badShots = 0;
  let goodShots = 0;
  let par3Score = 0;
  let par3ParTotal = 0;
  let par3Count = 0;
  let scoredHoles = 0;
  const localHoleCount = holeStatsList.length;

  for (const s of holeStatsList) {
    if (s.score > 0) scoredHoles += 1;
    totalScore += s.score;
    totalPutts += s.putts;
    totalPenalties += s.penalties;
    fairwaysHit += s.fwHit;
    fairwaysAnswered += s.fwAns;
    badShots += s.badShots;
    goodShots += s.goodShots;
    if (s.putts >= 3) threePutts += 1;
    if (s.firstPuttResult === "Short") firstPuttShort += 1;
    if (s.firstPuttResult === "Long") firstPuttLong += 1;
    if (s.missedShort) missedShortPutts += 1;
    if (s.par === 3 && s.score > 0) {
      par3Score += s.score;
      par3ParTotal += s.par;
      par3Count += 1;
    }
  }

  let fairwayPct = null;
  if (fairwaysAnswered > 0) fairwayPct = Math.round((fairwaysHit / fairwaysAnswered) * 100);

  let girHit = 0, girAns = 0, scrambleSave = 0, scrambleAns = 0;
  for (const s of holeStatsList) {
    girHit += s.gir || 0;
    girAns += s.girAns || 0;
    scrambleSave += s.scrambleSave || 0;
    scrambleAns += s.scrambleAns || 0;
  }
  const girPct = girAns > 0 ? Math.round((girHit / girAns) * 100) : null;
  const scramblePct = scrambleAns > 0 ? Math.round((scrambleSave / scrambleAns) * 100) : null;

  const mistakes = [];
  if (totalPenalties >= 1) mistakes.push("Penalty strokes lost: " + totalPenalties + ".");
  if (fairwayPct !== null && fairwayPct < 60) mistakes.push("Missed fairways: only " + fairwayPct + "% hit.");
  if (girPct !== null && girAns >= 3 && girPct < 30) mistakes.push("Greens in Regulation only " + girPct + "% — approach play needs work.");
  if (scramblePct !== null && scrambleAns >= 3 && scramblePct < 30) mistakes.push("Scrambling only " + scramblePct + "% — short game lost strokes.");
  if (missedShortPutts >= 1) mistakes.push("Missed " + missedShortPutts + " short putt(s).");
  if (firstPuttShort >= 2) mistakes.push("First putts too short " + firstPuttShort + " times.");
  if (firstPuttLong >= 2) mistakes.push("First putts too long " + firstPuttLong + " times.");
  if (threePutts >= 1) mistakes.push(threePutts + " three-putt(s).");
  if (badShots >= 2) mistakes.push("Poor shots (top/duff/slice/hook): " + badShots + ".");

  const strengths = [];
  if (fairwayPct !== null && fairwayPct >= 70) strengths.push("Good fairway accuracy: " + fairwayPct + "%.");
  if (girPct !== null && girAns >= 3 && girPct >= 50) strengths.push("Strong approach play: " + girPct + "% GIR.");
  if (scramblePct !== null && scrambleAns >= 3 && scramblePct >= 50) strengths.push("Sharp short game: " + scramblePct + "% scrambling.");
  if (scoredHoles > 0 && totalPutts / scoredHoles < 2) strengths.push("Good putting: " + (totalPutts / scoredHoles).toFixed(1) + " putts per hole.");
  if (totalPenalties === 0 && scoredHoles >= Math.min(localHoleCount, 9)) strengths.push("Penalty-free round.");
  if (par3Count >= 2 && par3Score <= par3ParTotal + 1) strengths.push("Strong scoring on par 3s.");
  if (goodShots >= 8) strengths.push("Lots of good shots (" + goodShots + ").");

  const practice = [];
  if (missedShortPutts >= 1) practice.push("Short putting (3-5 foot putts)");
  if (fairwayPct !== null && fairwayPct < 60) practice.push("Tee shot accuracy");
  if (firstPuttShort >= 2 || firstPuttLong >= 2) practice.push("Lag putting (long putts)");
  if (totalPenalties >= 1) practice.push("Course management - safer lines off the tee");
  if (badShots >= 2) practice.push("Ball striking (clean contact, smooth tempo)");
  if (threePutts >= 1) practice.push("Speed control on long putts");
  if (scoredHoles >= 3 && practice.length === 0) {
    practice.push("Keep the basics sharp - 20 chips and 20 short putts a day");
    practice.push("Mix in lag putts from 30+ feet to keep speed control sharp");
  }

  const weaknesses = [];
  if (missedShortPutts >= 2) weaknesses.push({ score: missedShortPutts * 20, text: "Your biggest weakness was putting - " + totalPutts + " putts and " + missedShortPutts + " missed short putts. Practise 3-5 foot putts." });
  if (threePutts >= 3) weaknesses.push({ score: threePutts * 18, text: "Your biggest weakness was 3-putting - " + threePutts + " three-putts. Practise lag putting." });
  if (totalPenalties >= 3) weaknesses.push({ score: totalPenalties * 15, text: "Your biggest weakness was penalties - " + totalPenalties + " strokes lost. Play safer." });
  if (fairwayPct !== null && fairwayPct < 50) weaknesses.push({ score: 50 - fairwayPct, text: "Your biggest weakness was driving accuracy - " + fairwayPct + "% fairways. Practise tee shots." });
  if (badShots >= 5) weaknesses.push({ score: badShots * 10, text: "Your biggest weakness was ball striking - " + badShots + " mishits. Work on clean contact." });

  let topWeakness;
  if (scoredHoles < 5) topWeakness = "Fill in shots for at least 5 holes to get coach feedback.";
  else if (weaknesses.length === 0) topWeakness = "No big weakness - well played!";
  else {
    weaknesses.sort(function (a, b) { return b.score - a.score; });
    topWeakness = weaknesses[0].text;
  }

  return { mistakes, strengths, practice, topWeakness };
}

function computeHoleAnalysisFromStats(s) {
  if (s.score === 0) return null;

  let mistake;
  if (s.penalties > 0) mistake = s.penalties + " penalty stroke(s).";
  else if (s.missedShort) mistake = "Missed a short putt.";
  else if (s.putts >= 3) mistake = "3-putt on this hole.";
  else if (s.badShots > 0) {
    const firstBad = s.shots.find(function (sh) { return BAD_QUALITIES.indexOf(sh.quality) !== -1; });
    mistake = (firstBad ? firstBad.quality : "Mishit") + " hurt your hole.";
  } else if (s.par > 0 && s.score > s.par + 1) mistake = "Score was " + (s.score - s.par) + " over par.";
  else mistake = "No major mistake.";

  let wentWell;
  const hitFairway = s.shots.length > 0 && s.shots[0].lie === "Tee" && s.shots[0].result === "On fairway";
  const reachedGreen = s.shots.some(function (sh) { return sh.result === "On green"; });
  if (s.par > 0 && s.score <= s.par) wentWell = "Made par or better.";
  else if (s.firstPuttResult === "Holed") wentWell = "Holed your first putt.";
  else if (hitFairway) wentWell = "Hit the fairway off the tee.";
  else if (reachedGreen) wentWell = "Reached the green.";
  else if (s.goodShots > 0) wentWell = s.goodShots + " good shot(s).";
  else wentWell = "Keep your head up.";

  let practise;
  if (s.missedShort || s.putts >= 3) practise = "Short putting.";
  else if (s.penalties > 0) practise = "Course management.";
  else if (s.badShots > 0) practise = "Ball striking.";
  else if (s.par >= 4 && !hitFairway && s.shots.length > 0 && s.shots[0].lie === "Tee") practise = "Tee shot accuracy.";
  else if (s.firstPuttResult === "Short" || s.firstPuttResult === "Long") practise = "Lag putting.";
  else if (s.par > 0 && s.score > s.par + 1) practise = "Approach shots.";
  else practise = "Keep doing what you're doing.";

  return { mistake, wentWell, practise };
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

let currentDashYear;
let currentDashMonth;

function initDashboard() {
  const monthSel = document.getElementById("monthSelect");
  const yearSel = document.getElementById("yearSelect");
  monthSel.innerHTML = "";
  for (let m = 0; m < 12; m++) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = MONTH_NAMES[m];
    monthSel.appendChild(opt);
  }
  const today = new Date();
  yearSel.innerHTML = "";
  for (let y = today.getFullYear() - 2; y <= today.getFullYear() + 1; y++) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    yearSel.appendChild(opt);
  }
  currentDashYear = today.getFullYear();
  currentDashMonth = today.getMonth();
  monthSel.value = currentDashMonth;
  yearSel.value = currentDashYear;

  monthSel.addEventListener("change", function () {
    currentDashMonth = Number(monthSel.value);
    renderDashboard();
  });
  yearSel.addEventListener("change", function () {
    currentDashYear = Number(yearSel.value);
    renderDashboard();
  });

  document.getElementById("upcomingCourse").addEventListener("change", function () {
    document.getElementById("upcomingOtherRow").style.display =
      this.value === "Other" ? "" : "none";
  });

  document.getElementById("addUpcomingBtn").addEventListener("click", addUpcomingRound);

  const grokKeyInput = document.getElementById("grokApiKey");
  const proxyUrlInput = document.getElementById("aiProxyUrl");
  const aiToggle = document.getElementById("aiModeToggle");
  function autoEnableAiOnFirstCredential() {
    // Whenever a user enters any credential, flip aiMode on automatically
    // (unless they've explicitly turned it off).
    if (localStorage.getItem("aiMode") !== "off" && (getProxyUrl() || getGrokKey())) {
      localStorage.setItem("aiMode", "on");
      if (aiToggle) aiToggle.checked = true;
    }
  }
  if (grokKeyInput) {
    grokKeyInput.value = localStorage.getItem("grokApiKey") || "";
    grokKeyInput.addEventListener("input", function () {
      const v = grokKeyInput.value.trim();
      if (v) localStorage.setItem("grokApiKey", v);
      else localStorage.removeItem("grokApiKey");
      autoEnableAiOnFirstCredential();
      renderAiStatus();
    });
  }
  if (proxyUrlInput) {
    proxyUrlInput.value = localStorage.getItem("aiProxyUrl") || "";
    proxyUrlInput.addEventListener("input", function () {
      const v = proxyUrlInput.value.trim();
      if (v) localStorage.setItem("aiProxyUrl", v);
      else localStorage.removeItem("aiProxyUrl");
      autoEnableAiOnFirstCredential();
      renderAiStatus();
    });
  }
  if (aiToggle) {
    autoEnableAiOnFirstCredential();
    aiToggle.checked = localStorage.getItem("aiMode") === "on";
    aiToggle.addEventListener("change", function () {
      localStorage.setItem("aiMode", aiToggle.checked ? "on" : "off");
      renderAiStatus();
    });
  }
  renderAiStatus();

  const goToAiSettingsBtn = document.getElementById("goToAiSettingsBtn");
  if (goToAiSettingsBtn) {
    goToAiSettingsBtn.addEventListener("click", function () {
      switchTab("statsTab");
      setTimeout(function () {
        const card = document.getElementById("grokApiKey");
        if (card) {
          card.scrollIntoView({ block: "center", behavior: "smooth" });
          try { card.focus(); } catch (e) {}
        }
      }, 250);
    });
  }

  const reportBtn = document.getElementById("genRoundReportBtn");
  if (reportBtn) reportBtn.addEventListener("click", generateRoundReport);
  const planBtn = document.getElementById("genPracticePlanBtn");
  if (planBtn) planBtn.addEventListener("click", generatePracticePlan);
  const preBtn = document.getElementById("genPreRoundBtn");
  if (preBtn) preBtn.addEventListener("click", generatePreRoundBrief);
  const tournBtn = document.getElementById("genTournamentBtn");
  if (tournBtn) tournBtn.addEventListener("click", generateTournamentBrief);
  const goalsBtn = document.getElementById("genGoalsBtn");
  if (goalsBtn) goalsBtn.addEventListener("click", generateGoalPlan);
  const courseBtn = document.getElementById("genCourseBtn");
  if (courseBtn) courseBtn.addEventListener("click", generateCourseStrategy);
  const swingBtn = document.getElementById("analyzeSwingBtn");
  if (swingBtn) swingBtn.addEventListener("click", analyzeSwingPhoto);
  const seedBtn = document.getElementById("seedDemoBtn");
  if (seedBtn) seedBtn.addEventListener("click", seedDemoData);
  const wipeBtn = document.getElementById("wipeDemoBtn");
  if (wipeBtn) wipeBtn.addEventListener("click", wipeAllLocalData);

  const focusBtn = document.getElementById("aiFocusBtn");
  if (focusBtn) focusBtn.addEventListener("click", generateTodaysFocus);

  const holeTipBtn = document.getElementById("aiHoleTipBtn");
  if (holeTipBtn) holeTipBtn.addEventListener("click", generateHoleTip);

  const micBtn = document.getElementById("micBtn");
  if (micBtn) micBtn.addEventListener("click", startVoiceInput);
  const addPracticeBtn = document.getElementById("addPracticeBtn");
  if (addPracticeBtn) {
    addPracticeBtn.addEventListener("click", addPracticeSession);
    const pdate = document.getElementById("practiceDate");
    if (pdate && !pdate.value) pdate.value = todayISO();
  }
  document.getElementById("modalClose").addEventListener("click", closeRoundDetail);
  document.getElementById("roundDetailModal").addEventListener("click", function (e) {
    if (e.target === this) closeRoundDetail();
  });
}

function parseDate(str) {
  if (!str) return null;
  const parts = str.split("-");
  if (parts.length !== 3) return null;
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function dateKey(y, m, d) {
  return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

function renderCalendar(year, month) {
  const cal = document.getElementById("calendar");
  cal.innerHTML = "";

  const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (const d of dayHeaders) {
    const c = document.createElement("div");
    c.className = "cal-header";
    c.textContent = d;
    cal.appendChild(c);
  }

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  for (let i = 0; i < startWeekday; i++) {
    const c = document.createElement("div");
    c.className = "cal-empty";
    cal.appendChild(c);
  }

  const rounds = getHistory();
  const upcoming = getUpcoming();
  const playedMap = {};
  for (const r of rounds) {
    if (r.date) playedMap[r.date] = r;
  }
  const upcomingDates = {};
  for (const u of upcoming) {
    if (u.date) upcomingDates[u.date] = true;
  }

  const today = new Date();
  const todayStr = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  for (let day = 1; day <= daysInMonth; day++) {
    const ds = dateKey(year, month, day);
    const cell = document.createElement("div");
    cell.className = "cal-day";
    cell.textContent = day;
    if (ds === todayStr) cell.classList.add("cal-today");
    if (playedMap[ds]) {
      const round = playedMap[ds];
      if (round.gameType === "Tournament") {
        cell.classList.add("cal-tournament");
        cell.title = "Tournament";
      } else {
        cell.classList.add("cal-played");
        cell.title = "Normal Game";
      }
      cell.addEventListener("click", function () { showRoundDetail(round); });
    } else if (upcomingDates[ds]) {
      cell.classList.add("cal-upcoming");
    }
    cal.appendChild(cell);
  }
}

function getGameType(round) {
  return round.gameType || "Normal Game";
}

function statsForRounds(rounds) {
  const scores = rounds.map(function (r) { return r.totalScore; }).filter(function (s) { return s > 0; });
  if (scores.length === 0) return { count: rounds.length, best: null, worst: null, avg: null };
  const best = Math.min.apply(null, scores);
  const worst = Math.max.apply(null, scores);
  const avg = (scores.reduce(function (a, b) { return a + b; }, 0) / scores.length).toFixed(1);
  return { count: rounds.length, best, worst, avg };
}

function renderMonthlySummary(year, month) {
  const div = document.getElementById("monthlySummary");
  div.innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = MONTH_NAMES[month] + " " + year;
  div.appendChild(h);

  const monthRounds = getHistory().filter(function (r) {
    const d = parseDate(r.date);
    return d && d.getFullYear() === year && d.getMonth() === month;
  });

  if (monthRounds.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No rounds played this month.";
    div.appendChild(p);
    return;
  }

  const normalRounds = monthRounds.filter(function (r) { return getGameType(r) === "Normal Game"; });
  const tournamentRounds = monthRounds.filter(function (r) { return getGameType(r) === "Tournament"; });
  const normal = statsForRounds(normalRounds);
  const tour = statsForRounds(tournamentRounds);

  function fmt(v) { return v === null ? "—" : v; }

  const lines = [
    "Total rounds played: " + monthRounds.length,
    "Total tournaments played: " + tournamentRounds.length,
    "Best normal score: " + fmt(normal.best),
    "Best tournament score: " + fmt(tour.best),
    "Average normal score: " + fmt(normal.avg),
    "Average tournament score: " + fmt(tour.avg),
    "Worst normal score: " + fmt(normal.worst),
    "Worst tournament score: " + fmt(tour.worst),
  ];

  const byCourse = {};
  for (const r of monthRounds) {
    if (!byCourse[r.courseName]) byCourse[r.courseName] = [];
    if (r.totalScore > 0) byCourse[r.courseName].push(r.totalScore);
  }
  for (const c in byCourse) {
    if (byCourse[c].length === 0) continue;
    const cBest = Math.min.apply(null, byCourse[c]);
    const cWorst = Math.max.apply(null, byCourse[c]);
    lines.push(c + " — best: " + cBest + ", worst: " + cWorst);
  }

  for (const line of lines) {
    const p = document.createElement("p");
    p.textContent = line;
    div.appendChild(p);
  }
}

function topKeys(counts, n) {
  const keys = Object.keys(counts);
  keys.sort(function (a, b) { return counts[b] - counts[a]; });
  return keys.slice(0, n);
}

function collectTopItems(rounds, key, n) {
  const counts = {};
  for (const r of rounds) {
    const arr = r[key] || [];
    for (const item of arr) {
      counts[item] = (counts[item] || 0) + 1;
    }
  }
  return topKeys(counts, n);
}

function isPressureMistake(text) {
  const lower = (text || "").toLowerCase();
  return lower.indexOf("penalty") !== -1 ||
    lower.indexOf("penalties") !== -1 ||
    lower.indexOf("short putt") !== -1 ||
    lower.indexOf("3-putt") !== -1;
}

function renderOverallStatsBox(divId, label, rounds, isTournament) {
  const div = document.getElementById(divId);
  div.innerHTML = "";
  div.className = "overall-stats" + (isTournament ? " tournament" : "");

  const h = document.createElement("h3");
  h.textContent = label;
  div.appendChild(h);

  if (rounds.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No " + (isTournament ? "tournament" : "normal") + " rounds saved yet.";
    div.appendChild(p);
    return;
  }

  const s = statsForRounds(rounds);
  function fmt(v) { return v === null ? "—" : v; }
  const summary = [
    "Rounds saved: " + s.count,
    "Best score: " + fmt(s.best),
    "Worst score: " + fmt(s.worst),
    "Average score: " + fmt(s.avg),
  ];
  for (const line of summary) {
    const p = document.createElement("p");
    p.textContent = line;
    div.appendChild(p);
  }

  function addList(title, items, emptyText) {
    const h4 = document.createElement("h4");
    h4.textContent = title;
    div.appendChild(h4);
    const list = items.length > 0 ? items : [emptyText];
    const ul = document.createElement("ul");
    for (const it of list) {
      const li = document.createElement("li");
      li.textContent = it;
      ul.appendChild(li);
    }
    div.appendChild(ul);
  }

  const topMistakes = collectTopItems(rounds, "mistakes", 3);
  const topStrengths = collectTopItems(rounds, "strengths", 3);
  const topPractice = collectTopItems(rounds, "practice", 3);

  if (isTournament) {
    addList("Main tournament problems", topMistakes, "No big problems yet.");
    addList("Main tournament strengths", topStrengths, "Add more rounds to see strengths.");

    const pressureCounts = {};
    for (const r of rounds) {
      for (const m of (r.mistakes || [])) {
        if (isPressureMistake(m)) {
          pressureCounts[m] = (pressureCounts[m] || 0) + 1;
        }
      }
    }
    const pressure = topKeys(pressureCounts, 3);
    addList("Pressure mistakes", pressure, "No pressure mistakes spotted.");
    addList("What to practise for tournaments", topPractice, "Nothing flagged - keep practising your strengths.");
  } else {
    addList("Main mistakes", topMistakes, "No big mistakes yet.");
    addList("Main strengths", topStrengths, "Add more rounds to see strengths.");
  }
}

function renderTypeStats() {
  const history = getHistory();
  const normal = history.filter(function (r) { return getGameType(r) === "Normal Game"; });
  const tournament = history.filter(function (r) { return getGameType(r) === "Tournament"; });
  renderOverallStatsBox("normalGameStats", "Normal Game Stats", normal, false);
  renderOverallStatsBox("tournamentStats", "Tournament Stats", tournament, true);
}

function renderMonthCompare(year, month) {
  const div = document.getElementById("monthCompare");
  div.innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = "Compared to last month";
  div.appendChild(h);

  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear = year - 1;
  }

  const history = getHistory();
  const current = history.filter(function (r) {
    const d = parseDate(r.date);
    return d && d.getFullYear() === year && d.getMonth() === month;
  });
  const previous = history.filter(function (r) {
    const d = parseDate(r.date);
    return d && d.getFullYear() === prevYear && d.getMonth() === prevMonth;
  });

  if (current.length === 0 || previous.length === 0) {
    const p = document.createElement("p");
    p.textContent = "Need rounds in this month and the previous month to compare.";
    div.appendChild(p);
    return;
  }

  function avgKey(arr, key) {
    let total = 0;
    let count = 0;
    for (const r of arr) {
      const v = r[key];
      if (v !== undefined && v !== null && !isNaN(v)) {
        total += v;
        count += 1;
      }
    }
    return count > 0 ? total / count : null;
  }

  const lines = [];
  const cScore = avgKey(current, "totalScore");
  const pScore = avgKey(previous, "totalScore");
  if (cScore !== null && pScore !== null) {
    const d = cScore - pScore;
    if (d < -0.5) lines.push("Scoring better: down " + Math.abs(d).toFixed(1) + " strokes on average.");
    else if (d > 0.5) lines.push("Scoring worse: up " + d.toFixed(1) + " strokes on average.");
    else lines.push("Scoring is steady.");
  }

  const cPutts = avgKey(current, "totalPutts");
  const pPutts = avgKey(previous, "totalPutts");
  if (cPutts !== null && pPutts !== null) {
    const d = cPutts - pPutts;
    if (d < -0.5) lines.push("Putts improving (" + Math.abs(d).toFixed(1) + " fewer).");
    else if (d > 0.5) lines.push("Putts worse (" + d.toFixed(1) + " more).");
  }

  const cChips = avgKey(current, "totalChips");
  const pChips = avgKey(previous, "totalChips");
  if (cChips !== null && pChips !== null) {
    const d = cChips - pChips;
    if (d < -0.5) lines.push("Fewer chips needed - short game sharper.");
    else if (d > 0.5) lines.push("More chips needed - tighten approach play.");
  }

  const cPen = avgKey(current, "totalPenalties");
  const pPen = avgKey(previous, "totalPenalties");
  if (cPen !== null && pPen !== null) {
    const d = cPen - pPen;
    if (d < -0.3) lines.push("Penalties down - smarter course management.");
    else if (d > 0.3) lines.push("Penalties up - play safer off the tee.");
  }

  const cFw = avgKey(current, "fairwayPct");
  const pFw = avgKey(previous, "fairwayPct");
  if (cFw !== null && pFw !== null) {
    const d = cFw - pFw;
    if (d >= 5) lines.push("Fairways improving (+" + Math.round(d) + "%).");
    else if (d <= -5) lines.push("Fairway accuracy dropping (-" + Math.abs(Math.round(d)) + "%).");
  }

  if (lines.length === 0) lines.push("Stats look about the same as last month.");
  for (const line of lines) {
    const p = document.createElement("p");
    p.textContent = line;
    div.appendChild(p);
  }
}

function addUpcomingRound() {
  const date = document.getElementById("upcomingDate").value;
  const course = document.getElementById("upcomingCourse").value;
  const tee = document.getElementById("upcomingTee").value;
  const holes = document.getElementById("upcomingHoles").value;
  const otherName = document.getElementById("upcomingOtherName").value;

  if (!date) {
    alert("Pick a date for your upcoming round.");
    return;
  }

  const courseName = course === "Other" ? (otherName || "Other course") : course;
  const arr = getUpcoming();
  arr.push({ date, course: courseName, tee, holes });
  saveUpcoming(arr);

  document.getElementById("upcomingDate").value = "";
  document.getElementById("upcomingOtherName").value = "";
  document.getElementById("upcomingCourse").value = "RCGC";
  document.getElementById("upcomingOtherRow").style.display = "none";

  renderUpcoming();
  renderCalendar(currentDashYear, currentDashMonth);
}

function renderUpcoming() {
  const list = document.getElementById("upcomingList");
  list.innerHTML = "";
  const arr = getUpcoming().slice().sort(function (a, b) { return a.date.localeCompare(b.date); });

  if (arr.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No upcoming rounds added yet.";
    list.appendChild(p);
    return;
  }

  for (const u of arr) {
    const card = document.createElement("div");
    card.className = "upcoming-card";

    const info = document.createElement("span");
    info.textContent = u.date + " — " + u.course + (u.tee ? " (" + u.tee + ")" : "") + " — " + u.holes + " holes";
    card.appendChild(info);

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", function () {
      const all = getUpcoming();
      const idx = all.findIndex(function (x) { return x.date === u.date && x.course === u.course && x.tee === u.tee && x.holes === u.holes; });
      if (idx >= 0) all.splice(idx, 1);
      saveUpcoming(all);
      renderUpcoming();
      renderCalendar(currentDashYear, currentDashMonth);
    });
    card.appendChild(removeBtn);

    list.appendChild(card);
  }
}

function getCurrentTee() {
  const sel = document.getElementById("teeSelect").value;
  if (sel) return sel;
  const history = getHistory();
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].tee && TEE_GOALS[history[i].tee]) return history[i].tee;
  }
  return null;
}

function avgScoreVsPar(rounds) {
  const valid = rounds.filter(function (r) {
    return typeof r.scoreVsPar === "number" && !isNaN(r.scoreVsPar) && r.totalScore > 0;
  });
  if (valid.length === 0) return null;
  let sum = 0;
  for (const r of valid) sum += r.scoreVsPar;
  return sum / valid.length;
}

function suggestTeeProgression() {
  const currentTee = getCurrentTee();
  if (!currentTee || !TEE_GOALS[currentTee]) {
    return {
      currentTee: null,
      goalText: "Pick a tee in Round Setup to start tracking goals.",
      progress: "",
      suggestion: "",
    };
  }
  const goals = TEE_GOALS[currentTee];
  const history = getHistory();
  const recent = history.filter(function (r) { return r.tee === currentTee; }).slice(-5);

  const goalText = "18 holes: under +" + goals.holes18 + "  •  9 holes: under +" + goals.holes9;

  if (recent.length === 0) {
    return {
      currentTee,
      goalText,
      progress: "No saved rounds yet at " + currentTee + " tees.",
      suggestion: "Play and save a few rounds at " + currentTee + " tees to track progress.",
    };
  }

  const rounds18 = recent.filter(function (r) { return Number(r.holes) === 18; });
  const rounds9 = recent.filter(function (r) { return Number(r.holes) === 9; });
  const avg18 = avgScoreVsPar(rounds18);
  const avg9 = avgScoreVsPar(rounds9);

  const teeIdx = TEE_ORDER.indexOf(currentTee);
  const nextHarder = teeIdx < TEE_ORDER.length - 1 ? TEE_ORDER[teeIdx + 1] : null;
  const nextEasier = teeIdx > 0 ? TEE_ORDER[teeIdx - 1] : null;

  const meeting18 = avg18 !== null && avg18 < goals.holes18;
  const meeting9 = avg9 !== null && avg9 < goals.holes9;
  const struggling18 = avg18 !== null && avg18 > goals.holes18 + 5;
  const struggling9 = avg9 !== null && avg9 > goals.holes9 + 3;

  let suggestion = "Keep playing " + currentTee + " tees and aim for the goal.";

  if ((meeting18 || meeting9) && nextHarder) {
    suggestion = "You are becoming consistent from " + currentTee + " tees. Try " + nextHarder + " tees more often.";
  } else if ((struggling18 || struggling9) && nextEasier) {
    suggestion = "You are struggling from " + currentTee + " tees. Move forward to " + nextEasier + " tees to build confidence.";
  }

  const progressParts = [];
  if (avg18 !== null) progressParts.push("18-hole avg: " + (avg18 >= 0 ? "+" + avg18.toFixed(1) : avg18.toFixed(1)));
  if (avg9 !== null) progressParts.push("9-hole avg: " + (avg9 >= 0 ? "+" + avg9.toFixed(1) : avg9.toFixed(1)));
  const progress = progressParts.length > 0 ? progressParts.join("  •  ") : "Play more rounds to see averages.";

  return { currentTee, goalText, progress, suggestion };
}
// Legacy bridge for src/screens/coach.js — remove once tee-progression
// helpers are extracted in a later modularize phase.
window.suggestTeeProgression = suggestTeeProgression;

function renderGoalTracker() {
  const div = document.getElementById("goalTracker");
  div.innerHTML = "";
  const data = suggestTeeProgression();

  const h = document.createElement("h3");
  h.textContent = "Goal Tracker";
  div.appendChild(h);

  const tee = document.createElement("p");
  tee.textContent = "Current Tee: " + (data.currentTee || "—");
  div.appendChild(tee);

  const goal = document.createElement("p");
  goal.textContent = "Goal: " + data.goalText;
  div.appendChild(goal);

  if (data.progress) {
    const prog = document.createElement("p");
    prog.textContent = data.progress;
    div.appendChild(prog);
  }

  if (data.suggestion) {
    const s = document.createElement("p");
    s.className = "goal-suggestion";
    s.textContent = data.suggestion;
    div.appendChild(s);
  }
}

function renderAchievements() {
  const div = document.getElementById("achievements");
  div.innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = "Achievements";
  div.appendChild(h);

  const rounds = getHistory();
  const grid = document.createElement("div");
  grid.className = "achievement-grid";
  for (const a of ACHIEVEMENTS) {
    const item = document.createElement("div");
    item.className = "achievement" + (a.check(rounds) ? " unlocked" : "");
    item.textContent = a.name;
    grid.appendChild(item);
  }
  div.appendChild(grid);
}

function renderPreRoundCoach() {
  const div = document.getElementById("welcomeFocus");
  if (!div) return;
  div.innerHTML = "";
  const history = getHistory();
  const advice = [];

  if (history.length === 0) {
    advice.push("Welcome! Have fun and focus on smooth, easy swings.");
    advice.push("Trust your practice - one shot at a time.");
  } else {
    const recent = history.slice(-3);
    const mistakeCounts = {};
    const strengthCounts = {};
    for (const r of recent) {
      for (const m of (r.mistakes || [])) mistakeCounts[m] = (mistakeCounts[m] || 0) + 1;
      for (const s of (r.strengths || [])) strengthCounts[s] = (strengthCounts[s] || 0) + 1;
    }
    const topMistake = topKeys(mistakeCounts, 1)[0];
    const topStrength = topKeys(strengthCounts, 1)[0];

    if (topMistake) {
      const lower = topMistake.toLowerCase();
      if (lower.indexOf("short putt") !== -1 || lower.indexOf("3-putt") !== -1) {
        advice.push("Focus on short putting today.");
      } else if (lower.indexOf("fairway") !== -1) {
        advice.push("Focus on tee shot accuracy - pick a target.");
      } else if (lower.indexOf("penalty") !== -1 || lower.indexOf("penalties") !== -1) {
        advice.push("Avoid aggressive shots early in the round.");
      } else if (lower.indexOf("first putts") !== -1) {
        advice.push("Slow down on long putts - judge the speed first.");
      } else if (lower.indexOf("poor shots") !== -1 || lower.indexOf("tops") !== -1 || lower.indexOf("ball striking") !== -1) {
        advice.push("Stay loose and make smooth contact.");
      } else {
        advice.push("Focus today on: " + topMistake);
      }
    }
    if (topStrength) {
      advice.push("Recent strength: " + topStrength);
    }
    advice.push("Believe in your swing - you have done this before.");
  }

  for (const line of advice) {
    const li = document.createElement("li");
    li.textContent = line;
    div.appendChild(li);
  }
}

function renderDashboard() {
  renderCalendar(currentDashYear, currentDashMonth);
  renderMonthlySummary(currentDashYear, currentDashMonth);
  renderMonthCompare(currentDashYear, currentDashMonth);
  renderGoalTracker();
  renderAchievements();
  renderTypeStats();
  renderParTypeStats();
  renderApproachBands();
  renderClubStats();
  renderHandicapTrend();
  renderScoreTrend();
  renderWeatherImpact();
  renderPracticeInsightsCard();
  renderPracticeLog();
  renderUpcoming();
}

function renderPracticeInsightsCard() {
  const card = document.getElementById("practiceInsightsCard");
  if (!card) return;
  card.innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = "Practice Insights";
  card.appendChild(h);

  const pi = typeof getPuttingInsights === "function" ? getPuttingInsights() : { totalShots: 0 };
  const ci = typeof getChippingInsights === "function" ? getChippingInsights() : { totalShots: 0 };
  const ii = typeof getIronInsights === "function" ? getIronInsights() : { totalShots: 0 };
  const di = typeof getDriverInsights === "function" ? getDriverInsights() : { totalShots: 0 };

  const total = pi.totalShots + ci.totalShots + ii.totalShots + di.totalShots;
  if (total === 0) {
    const p = document.createElement("p");
    p.textContent = "Start logging practice shots to see cross-session insights here.";
    card.appendChild(p);
    return;
  }

  const sub = document.createElement("p");
  sub.style.fontSize = "13px";
  sub.style.color = "var(--muted)";
  sub.style.margin = "0 0 10px";
  sub.textContent = total + " shots logged across putting / chipping / iron / driver";
  card.appendChild(sub);

  function makeSection(title, lines) {
    if (lines.length === 0) return;
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "12px";
    const t = document.createElement("div");
    t.style.fontSize = "12px";
    t.style.fontWeight = "700";
    t.style.color = "var(--green-deep)";
    t.style.textTransform = "uppercase";
    t.style.letterSpacing = "0.5px";
    t.style.marginBottom = "4px";
    t.textContent = title;
    wrap.appendChild(t);
    for (const ln of lines) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.padding = "4px 0";
      row.style.fontSize = "13px";
      row.style.borderBottom = "1px solid var(--border)";
      const left = document.createElement("span");
      left.textContent = ln.label;
      const right = document.createElement("span");
      right.style.fontWeight = "700";
      right.style.color = "var(--green-deep)";
      right.textContent = ln.value;
      row.appendChild(left);
      row.appendChild(right);
      wrap.appendChild(row);
    }
    card.appendChild(wrap);
  }

  if (pi.totalShots > 0) {
    const lines = [];
    for (const b of pi.distanceRates) if (b.count > 0) lines.push({ label: "Putts " + b.label, value: b.pct + "% (" + b.count + ")" });
    if (pi.lag) lines.push({ label: "Lag inside 5 ft", value: pi.lag.inCirclePct + "% (" + pi.lag.count + ")" });
    if (pi.topMiss) lines.push({ label: "Top putt miss", value: pi.topMiss });
    makeSection("Putting", lines);
  }
  if (ci.totalShots > 0) {
    const lines = [];
    for (const b of ci.distanceRates) if (b.count > 0) lines.push({ label: "Chip " + b.label, value: b.pct + "% UD (" + b.count + ")" });
    for (const l of ci.lieRates) lines.push({ label: "From " + l.lie, value: l.pct + "% UD (" + l.count + ")" });
    if (ci.mishitPct != null) lines.push({ label: "Chunk/blade rate", value: ci.mishitPct + "%" });
    makeSection("Chipping", lines);
  }
  if (ii.totalShots > 0) {
    const lines = [];
    for (const cs of ii.clubStats) {
      const carry = cs.avgCarry != null ? cs.avgCarry + "y avg" : cs.onTargetPct + "% on tgt";
      lines.push({ label: cs.club + " (" + cs.count + ")", value: carry });
    }
    if (ii.pureStrikePct != null) lines.push({ label: "Pure-strike", value: ii.pureStrikePct + "%" });
    if (ii.topMiss) lines.push({ label: "Top iron miss", value: ii.topMiss });
    makeSection("Irons", lines);
  }
  if (di.totalShots > 0) {
    const lines = [];
    for (const cs of di.clubStats) {
      lines.push({ label: cs.club + " (" + cs.count + ")", value: (cs.avgCarry != null ? cs.avgCarry + "y · " : "") + cs.fairwayPct + "% FW" });
    }
    if (di.leftMisses + di.rightMisses > 0) {
      const bias = di.leftMisses > di.rightMisses ? "Left-side bias" : (di.rightMisses > di.leftMisses ? "Right-side bias" : "Balanced");
      lines.push({ label: "Miss bias", value: bias });
    }
    makeSection("Tee shots", lines);
  }

  // Practice → Game transfer
  const activity = getPracticeActivity(7);
  const transfer = getPracticeTransfer(getHistory(), activity);
  if (transfer && transfer.recentRoundsN > 0 && transfer.practiceDays > 0) {
    const lines = [];
    lines.push({ label: "Practice days (last 7)", value: transfer.practiceDays + " days · " + transfer.practiceShots + " shots" });
    if (transfer.avgPuttsRecent != null) {
      let putsLine = transfer.avgPuttsRecent.toFixed(1) + " putts/round";
      if (transfer.avgPuttsPrior != null) {
        const delta = transfer.avgPuttsRecent - transfer.avgPuttsPrior;
        const sign = delta > 0 ? "+" : "";
        putsLine += " (vs " + sign + delta.toFixed(1) + " prior 7d)";
      }
      lines.push({ label: "Recent rounds", value: putsLine });
    }
    if (transfer.avgScoreRecent != null && transfer.avgScorePrior != null) {
      const delta = transfer.avgScoreRecent - transfer.avgScorePrior;
      const sign = delta > 0 ? "+" : "";
      lines.push({ label: "Score change", value: sign + delta.toFixed(1) + " strokes" });
    }
    makeSection("Practice → Game", lines);
  }
}

function buildDemoShot(club, distHit, lie, dir, q, res) {
  return { club, distanceHit: String(distHit), distanceLeft: "", lie, direction: dir, quality: q, result: res };
}
function buildDemoHole(par, dist, shots, putts) {
  return { par: String(par), distance: String(dist), shots: shots, putts: putts.map(function (p) { return { distance: String(p[0]), result: p[1] }; }), firstPuttDistance: "", firstPuttResult: "", missedShortPutt: "" };
}

function seedDemoData(silent) {
  if (!silent && !confirm("This will add 4 demo rounds + 6 practice sessions for Ayaan, plus set bag/distances/birthday. Existing data stays. Continue?")) return;
  // Profile
  const profile = getProfile();
  profile.handicap = 18;
  profile.birthday = "2013-08-15";
  profile.clubDistances = profile.clubDistances || {};
  Object.assign(profile.clubDistances, {
    "Driver": 215, "3 Wood": 195, "4 Hybrid": 175,
    "6 Iron": 150, "7 Iron": 135, "8 Iron": 120, "9 Iron": 105,
    "Pitching Wedge": 90, "Sand Wedge": 55, "Lob Wedge": 35,
  });
  saveProfile(profile);
  saveSelectedClubs(["Driver", "3 Wood", "4 Hybrid", "6 Iron", "7 Iron", "8 Iron", "9 Iron", "Pitching Wedge", "Sand Wedge", "Lob Wedge", "Putter"]);

  // 4 demo rounds at RCGC White over 6 weeks
  const RCGC_PAR = [4,3,4,5,4,4,4,4,4,4,4,4,3,4,5,4,4,4];
  const RCGC_W = [350,150,388,521,396,420,388,368,396,426,422,341,196,404,494,347,367,429];

  function buildRound(dateStr, scoresOverPar, weather) {
    // Build hole data: for each hole, generate shots+putts that hit the target score
    const holes = {};
    for (let i = 1; i <= 18; i++) {
      const par = RCGC_PAR[i - 1];
      const dist = RCGC_W[i - 1];
      const over = scoresOverPar[i - 1];
      const target = par + over;
      // Shot composition: most strokes from tee-iron-pitch, then putts
      // Simple model: target - 2 swings, 2 putts (unless score very low/high)
      let swings = Math.max(1, target - 2);
      let puttsN = 2;
      if (target <= par - 1) { swings = par - 2; puttsN = 1; }
      if (target <= 2) { swings = 1; puttsN = 1; }
      const shots = [];
      // Tee shot
      let tee = par >= 4 ? ["Driver", 215, "Tee", over <= 0 ? "Straight" : (i % 2 === 0 ? "Right" : "Left"), over <= 0 ? "Good shot" : "Weak shot", over <= 0 ? "Fairway" : (over >= 2 ? "Rough" : "Fairway")] :
                          ["7 Iron", 135, "Tee", over <= 0 ? "Straight" : "Right", over <= 0 ? "Good shot" : "Weak shot", over <= 0 ? "Green" : "Rough"];
      if (over >= 3 && par >= 4) tee = ["Driver", 200, "Tee", "Right", "Slice", "Penalty"];
      shots.push(buildDemoShot(tee[0], tee[1], tee[2], tee[3], tee[4], tee[5]));
      if (tee[5] === "Penalty") {
        // Rehit
        shots.push(buildDemoShot("Driver", 200, "Tee", "Straight", "Good shot", "Fairway"));
        swings = Math.max(swings, 4);
      }
      // Fill rest with iron/wedge until on green
      while (shots.length < swings - 1) {
        shots.push(buildDemoShot("7 Iron", 135, "Fairway", "Straight", "Good shot", "Fairway"));
      }
      // Approach: last swing lands green or rough
      const onGreen = over <= 1;
      const lastClub = par === 3 ? "7 Iron" : (i % 3 === 0 ? "Pitching Wedge" : "9 Iron");
      const lastResult = onGreen ? "Green" : "Rough";
      // If we still need a swing
      if (shots.length < swings) {
        shots.push(buildDemoShot(lastClub, 100, "Fairway", onGreen ? "Straight" : "Long", onGreen ? "Good shot" : "Weak shot", lastResult));
      }
      // If not on green and we have a swing budget, add chip
      if (!onGreen) {
        shots.push(buildDemoShot("Sand Wedge", 30, "Rough", "Straight", "Good shot", "Green"));
        // Adjust putts to keep target total
        const used = shots.length;
        puttsN = Math.max(1, target - used);
      }
      const putts = [];
      for (let p = 0; p < puttsN; p++) {
        const isLast = p === puttsN - 1;
        const dist = isLast ? 3 : (15 - p * 5);
        const r = isLast ? "Holed" : (p === 0 ? "Long" : "Short");
        putts.push([dist, r]);
      }
      holes[i] = buildDemoHole(par, dist, shots, putts);
    }
    // Now compute totals from the hole data
    let totalScore = 0, totalPutts = 0, totalChips = 0, totalPenalties = 0;
    let fwHit = 0, fwAns = 0, girHit = 0, girAns = 0, scrSave = 0, scrAns = 0;
    let badShots = 0;
    for (let i = 1; i <= 18; i++) {
      const h = holes[i];
      const stats = getHoleStatsFromSavedHole(h);
      totalScore += stats.score;
      totalPutts += stats.putts;
      totalChips += stats.chips;
      totalPenalties += stats.penalties;
      fwHit += stats.fwHit; fwAns += stats.fwAns;
      girHit += stats.gir; girAns += stats.girAns;
      scrSave += stats.scrambleSave; scrAns += stats.scrambleAns;
      badShots += stats.badShots;
    }
    const coursePar = 72;
    const mistakes = [], strengths = [], practice = [], blunders = [];
    if (totalPenalties >= 1) mistakes.push("Penalty strokes lost: " + totalPenalties + ".");
    const fwPct = fwAns > 0 ? Math.round(fwHit / fwAns * 100) : null;
    if (fwPct !== null && fwPct < 60) mistakes.push("Missed fairways: " + fwPct + "%.");
    if (totalPutts > 36) mistakes.push("Too many putts: " + totalPutts + ".");
    if (fwPct !== null && fwPct >= 70) strengths.push("Good fairway: " + fwPct + "%.");
    return {
      playerName: "Ayaan",
      date: dateStr,
      country: "India",
      courseName: "RCGC",
      tee: "White",
      coursePar,
      parPlayed: coursePar,
      handicap: 18,
      birthday: "2013-08-15",
      ageAtRound: 12,
      weather: weather.summary,
      weatherData: weather,
      totalScore,
      scoreVsPar: totalScore - coursePar,
      totalPutts,
      totalChips,
      totalPenalties,
      fairwayPct: fwPct,
      girPct: girAns > 0 ? Math.round(girHit / girAns * 100) : null,
      scramblePct: scrAns > 0 ? Math.round(scrSave / scrAns * 100) : null,
      badShots,
      missedShortPutts: 0,
      holes: 18,
      activeHoles: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18],
      holesMode: "18",
      roundMode: "full",
      savedAt: new Date(dateStr).toISOString(),
      gameType: "Normal Game",
      tournamentName: "",
      tournamentFormat: "",
      energyLevel: "",
      confidenceLevel: "",
      sleepQuality: "",
      postFeel: "",
      postBestShot: "",
      postBiggestMistake: "",
      postImprove: "",
      mistakes, strengths, practice, blunders,
      topWeakness: mistakes[0] || "No big weakness today",
      fullData: {
        setup: { playerName: "Ayaan", courseSelect: "RCGC", teeSelect: "White", holesMode: "18", gameType: "Normal Game", coursePar: "72" },
        holes,
      },
    };
  }

  // Round 1 - 6 weeks ago, +18 (rough day)
  const r1Over = [1,2,2,3,1,2,1,1,2,2,1,1,2,3,1,1,2,1];
  // Round 2 - 4 weeks ago, +14
  const r2Over = [1,1,2,2,1,1,1,2,1,1,1,1,1,2,1,1,1,1];
  // Round 3 - 2 weeks ago, +11
  const r3Over = [1,0,2,2,1,1,1,1,1,1,1,1,1,2,0,1,1,1];
  // Round 4 - 5 days ago, +8
  const r4Over = [1,0,1,1,1,1,1,1,1,0,1,1,0,1,1,0,1,1];

  const wxSunny = { date: "", locationName: "RCGC", tempMax: 31, tempMin: 22, code: 1, condition: "Partly cloudy", windKmh: 8, precipMm: 0, summary: "31°C high · 22°C low · Partly cloudy" };
  const wxWindy = { date: "", locationName: "RCGC", tempMax: 28, tempMin: 18, code: 3, condition: "Overcast", windKmh: 24, precipMm: 0, summary: "28°C · windy 24 kmh" };
  const wxHot = { date: "", locationName: "RCGC", tempMax: 36, tempMin: 26, code: 0, condition: "Clear", windKmh: 6, precipMm: 0, summary: "36°C hot" };
  const wxLightRain = { date: "", locationName: "RCGC", tempMax: 27, tempMin: 21, code: 61, condition: "Rain", windKmh: 12, precipMm: 4, summary: "27°C · light rain" };

  const now = new Date();
  function daysAgo(n) {
    const d = new Date(now.getTime() - n * 24 * 3600 * 1000);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  const d1 = daysAgo(42), d2 = daysAgo(28), d3 = daysAgo(14), d4 = daysAgo(5);
  wxSunny.date = d1; wxWindy.date = d2; wxHot.date = d3; wxLightRain.date = d4;

  const rounds = [
    buildRound(d1, r1Over, wxSunny),
    buildRound(d2, r2Over, wxWindy),
    buildRound(d3, r3Over, wxHot),
    buildRound(d4, r4Over, wxLightRain),
  ];

  const existing = JSON.parse(localStorage.getItem("roundHistory") || "[]");
  const merged = existing.concat(rounds);
  localStorage.setItem("roundHistory", JSON.stringify(merged));

  // Practice sessions
  const practices = [
    { date: daysAgo(40), area: "Putting", duration: 30, focus: "3-foot circle drill", notes: "Holed 4 of 5 last attempt", savedAt: new Date().toISOString() },
    { date: daysAgo(35), area: "Range", duration: 45, focus: "7-iron half swings", notes: "Cleaner contact", savedAt: new Date().toISOString() },
    { date: daysAgo(20), area: "Chipping", duration: 30, focus: "Sand wedge 15-25 yards", notes: "", savedAt: new Date().toISOString() },
    { date: daysAgo(10), area: "Range", duration: 60, focus: "Driver tempo work", notes: "Less right miss", savedAt: new Date().toISOString() },
    { date: daysAgo(6), area: "Putting", duration: 30, focus: "Lag putts 30+ feet", notes: "Most ended within 4 ft", savedAt: new Date().toISOString() },
    { date: daysAgo(2), area: "Mixed", duration: 90, focus: "Short game routine", notes: "Range + chip + putt", savedAt: new Date().toISOString() },
  ];
  const existingP = JSON.parse(localStorage.getItem("practiceSessions") || "[]");
  localStorage.setItem("practiceSessions", JSON.stringify(existingP.concat(practices)));

  if (!silent) alert("Seeded 4 demo rounds and 6 practice sessions. Refresh the page to see them everywhere.");
  try { renderHistory(); } catch (e) {}
  try { renderDashboard(); } catch (e) {}
  try { renderPlayerCard(); } catch (e) {}
}

function autoSeedIfNeeded() {
  // Intentionally disabled: in a multi-user world, auto-seeding leaks demo
  // data into every new account's namespace on first visit. Users who want
  // sample data can click 'Seed Ayaan demo data' on the AI Coach card (or
  // we'll wire a dedicated demo flow later). For real accounts, the app
  // starts empty as it should.
  return;
}

function wipeAllLocalData() {
  if (!confirm("This deletes ALL local data including saved rounds, practice, profile, AI key. Are you sure?")) return;
  localStorage.clear();
  // Set a sentinel so the demo data does NOT auto-reseed after a wipe.
  localStorage.setItem("demoSeeded", "wiped");
  alert("All local data wiped. Refresh the page.");
  location.reload();
}

async function generateHoleTip() {
  const out = "aiHoleTipOutput";
  setAiOutput(out, "Asking the coach...");
  const active = getActiveHoles();
  const i = active[currentHoleIndex];
  const parEl = document.getElementById("par-" + i);
  const distEl = document.getElementById("holeDistance-" + i);
  if (!parEl) { setAiOutput(out, "No hole loaded."); return; }
  // Build history on this exact hole across saved rounds
  const histHere = [];
  for (const r of getHistory()) {
    if (r.fullData && r.fullData.holes && r.fullData.holes[i]) {
      const h = r.fullData.holes[i];
      const stats = getHoleStatsFromSavedHole(h);
      if (stats.score > 0) {
        histHere.push({ date: r.date, score: stats.score, shots: (h.shots || []).length, putts: (h.putts || []).length });
      }
    }
  }
  let weather = null;
  try { weather = JSON.parse(localStorage.getItem("currentWeather") || "null"); } catch (e) {}
  const pinEl = document.getElementById("pinPosition-" + i);
  const pin = pinEl && pinEl.value ? pinEl.value : null;
  const sys = "You are Coach. 3-4 short bullets max. Be specific to this hole. No emojis.";
  const userMsg = "Coach a 12-year-old budding pro through hole " + i + ".\nPar: " + parEl.value + ". Distance: " + (distEl && distEl.value || "?") + " yards." + (pin ? "\nPin position today: " + pin + "." : "") + "\nHis history on this hole: " + (histHere.length > 0 ? JSON.stringify(histHere) : "no prior data") + ".\nWeather: " + (weather ? Math.round(weather.tempMax || 0) + "C, wind " + Math.round(weather.windKmh || 0) + " kmh" : "unknown") + ".\nPlayer context:\n" + aiBaseContext() + "\n\nGive 3-4 bullets: club off the tee, target line, what to avoid, mental cue.";
  try { setAiOutput(out, await callGrok(sys, userMsg)); }
  catch (e) { setAiOutput(out, "Error: " + e.message); }
}

function startVoiceInput() {
  const Sp = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = document.getElementById("micBtn");
  const micStatus = document.getElementById("micStatus");
  const chatInput = document.getElementById("chatInput");
  if (!Sp) {
    if (micStatus) micStatus.textContent = "Voice input not supported in this browser.";
    return;
  }
  const rec = new Sp();
  rec.lang = "en-IN";
  rec.continuous = false;
  rec.interimResults = false;
  rec.onstart = function () {
    if (micBtn) micBtn.classList.add("listening");
    if (micStatus) micStatus.textContent = "Listening... speak now.";
  };
  rec.onerror = function (e) {
    if (micStatus) micStatus.textContent = "Mic error: " + e.error;
    if (micBtn) micBtn.classList.remove("listening");
  };
  rec.onend = function () {
    if (micBtn) micBtn.classList.remove("listening");
    if (micStatus && !micStatus.textContent.startsWith("Mic error")) micStatus.textContent = "";
  };
  rec.onresult = function (e) {
    const text = e.results[0][0].transcript;
    if (chatInput) chatInput.value = text;
    if (micStatus) micStatus.textContent = "Heard: \"" + text + "\" — tap Send.";
  };
  rec.start();
}

function renderAiStatus() {
  const el = document.getElementById("aiStatus");
  if (el) {
    if (aiEnabled()) {
      el.textContent = getProxyUrl()
        ? "AI coach ON — routing through your proxy (key stays on server)."
        : "AI coach ON — calling Grok directly with your local key.";
      el.classList.add("on");
    } else {
      el.textContent = "AI coach off — add an AI Proxy URL or a Grok API key to enable.";
      el.classList.remove("on");
    }
  }
  if (typeof syncAiStatusOnProfile === "function") syncAiStatusOnProfile();
}

function renderWeatherImpact() {
  const card = document.getElementById("weatherImpactCard");
  if (!card) return;
  card.innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = "Weather Impact";
  card.appendChild(h);

  const history = getHistory().filter(function (r) { return r.weatherData && r.totalScore > 0 && typeof r.scoreVsPar === "number"; });
  if (history.length < 2) {
    const p = document.createElement("p");
    p.textContent = "Save 2+ rounds with weather to see how conditions affect your scoring.";
    card.appendChild(p);
    return;
  }

  function bucketWind(w) {
    if (w == null) return null;
    if (w < 10) return "Calm (<10 km/h)";
    if (w < 20) return "Breeze (10-20)";
    return "Windy (20+)";
  }
  function bucketTemp(t) {
    if (t == null) return null;
    if (t < 15) return "Cool (<15°C)";
    if (t < 25) return "Mild (15-25)";
    if (t < 32) return "Warm (25-32)";
    return "Hot (32+)";
  }
  function bucketRain(p) {
    if (p == null) return null;
    if (p < 1) return "Dry";
    if (p < 10) return "Light rain";
    return "Heavy rain";
  }

  function avgFor(buckets) {
    const out = {};
    for (const r of history) {
      for (const b of buckets) {
        const key = b.fn(b.val(r));
        if (key == null) continue;
        if (!out[b.label]) out[b.label] = {};
        if (!out[b.label][key]) out[b.label][key] = { count: 0, sum: 0 };
        out[b.label][key].count += 1;
        out[b.label][key].sum += r.scoreVsPar;
      }
    }
    return out;
  }

  const data = avgFor([
    { label: "Wind", fn: bucketWind, val: function (r) { return r.weatherData.windKmh; } },
    { label: "Temperature", fn: bucketTemp, val: function (r) { return r.weatherData.tempMax; } },
    { label: "Rain", fn: bucketRain, val: function (r) { return r.weatherData.precipMm; } },
  ]);

  for (const factor in data) {
    const sub = document.createElement("h4");
    sub.textContent = factor;
    card.appendChild(sub);
    const ul = document.createElement("ul");
    ul.style.paddingLeft = "20px";
    ul.style.fontSize = "13px";
    for (const k in data[factor]) {
      const b = data[factor][k];
      const avg = (b.sum / b.count).toFixed(1);
      const sign = b.sum / b.count >= 0 ? "+" : "";
      const li = document.createElement("li");
      li.textContent = k + ": avg " + sign + avg + " vs par (" + b.count + " round" + (b.count !== 1 ? "s" : "") + ")";
      ul.appendChild(li);
    }
    card.appendChild(ul);
  }

  // One-line insight
  const wind = data.Wind || {};
  if (wind["Windy (20+)"] && wind["Calm (<10 km/h)"]) {
    const diff = (wind["Windy (20+)"].sum / wind["Windy (20+)"].count) - (wind["Calm (<10 km/h)"].sum / wind["Calm (<10 km/h)"].count);
    if (Math.abs(diff) > 1) {
      const p = document.createElement("p");
      p.style.fontSize = "13px";
      p.style.marginTop = "8px";
      p.style.fontWeight = "bold";
      p.style.color = diff > 0 ? "#b71c1c" : "#2e7d32";
      p.textContent = diff > 0
        ? "On windy days you score " + diff.toFixed(1) + " strokes higher. Practise low ball flight."
        : "You actually score better in wind by " + Math.abs(diff).toFixed(1) + " strokes — calm-conditions complacency?";
      card.appendChild(p);
    }
  }
}

function addPracticeSession() {
  const date = document.getElementById("practiceDate").value || todayISO();
  const area = document.getElementById("practiceArea").value || "Range";
  const duration = Number(document.getElementById("practiceDuration").value) || 0;
  const focus = document.getElementById("practiceFocus").value || "";
  const notes = document.getElementById("practiceNotes").value || "";
  if (duration === 0 && !focus) {
    alert("Add a duration or a focus drill to log this practice session.");
    return;
  }
  const session = { date, area, duration, focus, notes, savedAt: new Date().toISOString(), weatherData: null };
  // Async weather fetch; save once it returns (or save immediately and update)
  const arr = getPractice();
  arr.push(session);
  savePractice(arr);
  document.getElementById("practiceDuration").value = "";
  document.getElementById("practiceFocus").value = "";
  document.getElementById("practiceNotes").value = "";
  renderPracticeLog();

  // Try to fetch weather and update the same session.
  fetchWeatherForDate(date, "RCGC").then(function (w) {
    if (!w) return;
    const all = getPractice();
    const idx = all.findIndex(function (s) { return s.savedAt === session.savedAt; });
    if (idx >= 0) {
      all[idx].weatherData = w;
      savePractice(all);
      renderPracticeLog();
    }
  });
}

function renderPracticeLog() {
  const list = document.getElementById("practiceList");
  if (!list) return;
  list.innerHTML = "";
  const arr = getPractice().slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
  if (arr.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No practice sessions logged yet.";
    list.appendChild(p);
  } else {
    for (let i = 0; i < Math.min(arr.length, 10); i++) {
      const s = arr[i];
      const card = document.createElement("div");
      card.className = "practice-card";
      const info = document.createElement("div");
      info.className = "practice-info";
      const headEl = document.createElement("div");
      headEl.innerHTML = "<strong>" + (s.date || "—") + " · " + s.area + "</strong>" + (s.duration ? " · " + s.duration + " min" : "");
      info.appendChild(headEl);
      if (s.focus) {
        const f = document.createElement("div");
        f.style.fontSize = "12px";
        f.textContent = "Focus: " + s.focus;
        info.appendChild(f);
      }
      if (s.notes) {
        const n = document.createElement("div");
        n.style.fontSize = "12px";
        n.style.color = "#555";
        n.textContent = s.notes;
        info.appendChild(n);
      }
      card.appendChild(info);
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", function () {
        const all = getPractice();
        const idx = all.findIndex(function (x) { return x.savedAt === s.savedAt; });
        if (idx >= 0) {
          all.splice(idx, 1);
          savePractice(all);
          renderPracticeLog();
        }
      });
      card.appendChild(removeBtn);
      list.appendChild(card);
    }
  }

  const summary = document.getElementById("practiceSummary");
  if (!summary) return;
  const last7 = arr.filter(function (s) {
    const d = parseDate(s.date);
    if (!d) return false;
    const diff = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 7;
  });
  if (last7.length === 0) {
    summary.textContent = "No practice in the last 7 days. Goal: practise 3+ times this week.";
    summary.style.color = "#b71c1c";
  } else {
    const byArea = {};
    let totalMin = 0;
    for (const s of last7) {
      byArea[s.area] = (byArea[s.area] || 0) + 1;
      totalMin += Number(s.duration) || 0;
    }
    const focusAreas = Object.keys(byArea).map(function (k) { return k + " ×" + byArea[k]; }).join(", ");
    summary.textContent = "This week: " + last7.length + " sessions, " + totalMin + " minutes (" + focusAreas + ").";
    summary.style.color = "#2e7d32";
  }
}

function gatherAllScoredHoles() {
  const out = [];
  const history = getHistory();
  for (const r of history) {
    if (!r.fullData || !r.fullData.holes) continue;
    for (const k in r.fullData.holes) {
      const h = r.fullData.holes[k];
      const stats = getHoleStatsFromSavedHole(h);
      if (stats.score > 0) out.push(stats);
    }
  }
  for (const i of getActiveHoles()) {
    const s = getHoleStats(i);
    if (s.score > 0) out.push(s);
  }
  return out;
}

function renderParTypeStats() {
  const card = document.getElementById("parTypeCard");
  if (!card) return;
  card.innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = "Performance by Par Type";
  card.appendChild(h);

  const buckets = { 3: { count: 0, sum: 0 }, 4: { count: 0, sum: 0 }, 5: { count: 0, sum: 0 } };
  for (const s of gatherAllScoredHoles()) {
    if (buckets[s.par]) {
      buckets[s.par].count += 1;
      buckets[s.par].sum += s.score;
    }
  }

  if (Object.values(buckets).every(function (b) { return b.count === 0; })) {
    const p = document.createElement("p");
    p.textContent = "Play and save rounds to compare your scoring by par type.";
    card.appendChild(p);
    return;
  }

  const table = document.createElement("table");
  table.className = "club-stats-table";
  table.innerHTML = "<thead><tr><th>Par</th><th>Holes</th><th>Avg score</th><th>vs Par</th></tr></thead>";
  const tbody = document.createElement("tbody");
  for (const p of [3, 4, 5]) {
    const b = buckets[p];
    const tr = document.createElement("tr");
    let avg = "—", vsPar = "—";
    if (b.count > 0) {
      const a = b.sum / b.count;
      avg = a.toFixed(2);
      const diff = a - p;
      vsPar = diff > 0 ? "+" + diff.toFixed(2) : diff.toFixed(2);
    }
    tr.innerHTML = "<td class=\"club-name\">Par " + p + "</td><td>" + b.count + "</td><td>" + avg + "</td><td>" + vsPar + "</td>";
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  card.appendChild(table);

  const insights = [];
  const sorted = [3, 4, 5]
    .filter(function (p) { return buckets[p].count > 0; })
    .map(function (p) { return { p, vs: buckets[p].sum / buckets[p].count - p }; });
  if (sorted.length > 0) {
    sorted.sort(function (a, b) { return b.vs - a.vs; });
    insights.push("Hardest for you: Par " + sorted[0].p + " (avg " + (sorted[0].vs >= 0 ? "+" : "") + sorted[0].vs.toFixed(2) + ").");
    insights.push("Easiest for you: Par " + sorted[sorted.length - 1].p + " (avg " + (sorted[sorted.length - 1].vs >= 0 ? "+" : "") + sorted[sorted.length - 1].vs.toFixed(2) + ").");
  }
  for (const line of insights) {
    const p = document.createElement("p");
    p.style.fontSize = "12px";
    p.style.marginTop = "6px";
    p.textContent = line;
    card.appendChild(p);
  }
}

function bucketFor(yards) {
  if (yards < 50) return null;
  if (yards < 75) return "50-75";
  if (yards < 100) return "75-100";
  if (yards < 125) return "100-125";
  if (yards < 150) return "125-150";
  if (yards < 175) return "150-175";
  if (yards < 200) return "175-200";
  return "200+";
}

function renderApproachBands() {
  const card = document.getElementById("approachBandsCard");
  if (!card) return;
  card.innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = "Approach Shots by Distance";
  card.appendChild(h);

  const shots = gatherAllShots().filter(function (s) {
    return s.club && s.club !== "Putter" && s.distanceHit && Number(s.distanceHit) >= 50;
  });
  if (shots.length === 0) {
    const p = document.createElement("p");
    p.textContent = "Play approach shots (50+ yards) to see distance-band stats.";
    card.appendChild(p);
    return;
  }

  const bands = ["50-75", "75-100", "100-125", "125-150", "150-175", "175-200", "200+"];
  const data = {};
  for (const b of bands) data[b] = { count: 0, onGreen: 0, misses: {} };

  for (const s of shots) {
    const b = bucketFor(Number(s.distanceHit));
    if (!b || !data[b]) continue;
    data[b].count += 1;
    if (s.result === "Green" || s.result === "Holed" || s.result === "On green") data[b].onGreen += 1;
    if (s.direction && s.direction !== "Straight") {
      data[b].misses[s.direction] = (data[b].misses[s.direction] || 0) + 1;
    }
  }

  const table = document.createElement("table");
  table.className = "club-stats-table";
  table.innerHTML = "<thead><tr><th>Yds</th><th>#</th><th>Green %</th><th>Top miss</th></tr></thead>";
  const tbody = document.createElement("tbody");
  for (const b of bands) {
    if (data[b].count === 0) continue;
    let topMiss = "—";
    let topMissCount = 0;
    for (const dir in data[b].misses) {
      if (data[b].misses[dir] > topMissCount) {
        topMiss = dir;
        topMissCount = data[b].misses[dir];
      }
    }
    const pct = Math.round((data[b].onGreen / data[b].count) * 100);
    const tr = document.createElement("tr");
    tr.innerHTML = "<td class=\"club-name\">" + b + "</td><td>" + data[b].count + "</td><td>" + pct + "%</td><td>" + topMiss + "</td>";
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  card.appendChild(table);

  const bandsWithData = bands.filter(function (b) { return data[b].count >= 2; });
  if (bandsWithData.length >= 2) {
    const ranked = bandsWithData
      .map(function (b) { return { b, pct: data[b].onGreen / data[b].count }; })
      .sort(function (a, b) { return b.pct - a.pct; });
    const strongest = ranked[0];
    const weakest = ranked[ranked.length - 1];
    const p1 = document.createElement("p");
    p1.style.fontSize = "12px";
    p1.style.marginTop = "6px";
    p1.textContent = "Strongest yardage: " + strongest.b + " yds (" + Math.round(strongest.pct * 100) + "% on green).";
    card.appendChild(p1);
    const p2 = document.createElement("p");
    p2.style.fontSize = "12px";
    p2.textContent = "Weakest yardage: " + weakest.b + " yds (" + Math.round(weakest.pct * 100) + "% on green) — practice this distance.";
    card.appendChild(p2);
  }
}

function renderScoreTrend() {
  const card = document.getElementById("scoreTrendCard");
  if (!card) return;
  card.innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = "Score Trend";
  card.appendChild(h);

  const rounds = getHistory()
    .filter(function (r) { return r.date && r.totalScore > 0; })
    .sort(function (a, b) { return a.date.localeCompare(b.date); });
  if (rounds.length < 2) {
    const p = document.createElement("p");
    p.textContent = "Save at least 2 rounds to see your score trend.";
    card.appendChild(p);
    return;
  }

  const w = 320, hpx = 160, pad = 24;
  const scores = rounds.map(function (r) { return r.totalScore; });
  const minS = Math.min.apply(null, scores);
  const maxS = Math.max.apply(null, scores);
  const range = Math.max(1, maxS - minS);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 " + w + " " + hpx);
  svg.setAttribute("width", w);
  svg.setAttribute("height", hpx);

  const bg = document.createElementNS(svgNS, "rect");
  bg.setAttribute("width", w);
  bg.setAttribute("height", hpx);
  bg.setAttribute("fill", "#f8fbf8");
  svg.appendChild(bg);

  const pts = rounds.map(function (r, i) {
    const x = pad + (i / Math.max(1, rounds.length - 1)) * (w - 2 * pad);
    const y = pad + ((maxS - r.totalScore) / range) * (hpx - 2 * pad);
    return { x, y, r };
  });

  const path = document.createElementNS(svgNS, "polyline");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#1976d2");
  path.setAttribute("stroke-width", 3);
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("points", pts.map(function (p) { return p.x + "," + p.y; }).join(" "));
  svg.appendChild(path);

  for (const p of pts) {
    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("cx", p.x);
    dot.setAttribute("cy", p.y);
    dot.setAttribute("r", 4);
    dot.setAttribute("fill", p.r.gameType === "Tournament" ? "#7e57c2" : "#2e7d32");
    dot.setAttribute("stroke", "white");
    dot.setAttribute("stroke-width", 1.5);
    svg.appendChild(dot);
  }

  const tMax = document.createElementNS(svgNS, "text");
  tMax.setAttribute("x", 4);
  tMax.setAttribute("y", 14);
  tMax.setAttribute("font-size", 11);
  tMax.setAttribute("fill", "#4f6f4f");
  tMax.textContent = String(maxS);
  svg.appendChild(tMax);
  const tMin = document.createElementNS(svgNS, "text");
  tMin.setAttribute("x", 4);
  tMin.setAttribute("y", hpx - 4);
  tMin.setAttribute("font-size", 11);
  tMin.setAttribute("fill", "#4f6f4f");
  tMin.textContent = String(minS);
  svg.appendChild(tMin);

  card.appendChild(svg);

  const first = rounds[0].totalScore;
  const last = rounds[rounds.length - 1].totalScore;
  const diff = last - first;
  const p = document.createElement("p");
  p.style.fontSize = "12px";
  p.style.marginTop = "6px";
  if (diff < 0) p.textContent = "Down " + Math.abs(diff) + " strokes since first round — improving!";
  else if (diff > 0) p.textContent = "Up " + diff + " strokes — focus on weak areas.";
  else p.textContent = "Steady.";
  card.appendChild(p);
}

function renderHandicapTrend() {
  const card = document.getElementById("handicapTrendCard");
  if (!card) return;
  card.innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = "Handicap Trend";
  card.appendChild(h);

  const history = getHistory()
    .filter(function (r) { return typeof r.handicap === "number" && r.date; })
    .sort(function (a, b) { return a.date.localeCompare(b.date); });

  if (history.length < 2) {
    const p = document.createElement("p");
    p.textContent = "Save at least 2 rounds with a handicap set on the Welcome page to see your trend.";
    card.appendChild(p);
    return;
  }

  const w = 320;
  const hpx = 160;
  const pad = 24;
  const handicaps = history.map(function (r) { return r.handicap; });
  const minH = Math.min.apply(null, handicaps);
  const maxH = Math.max.apply(null, handicaps);
  const rangeH = Math.max(1, maxH - minH);

  const points = history.map(function (r, i) {
    const x = pad + (i / Math.max(1, history.length - 1)) * (w - 2 * pad);
    const y = pad + ((maxH - r.handicap) / rangeH) * (hpx - 2 * pad);
    return { x, y, r };
  });

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 " + w + " " + hpx);
  svg.setAttribute("width", w);
  svg.setAttribute("height", hpx);

  const grid = document.createElementNS(svgNS, "rect");
  grid.setAttribute("x", 0);
  grid.setAttribute("y", 0);
  grid.setAttribute("width", w);
  grid.setAttribute("height", hpx);
  grid.setAttribute("fill", "#f8fbf8");
  svg.appendChild(grid);

  const path = document.createElementNS(svgNS, "polyline");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#2e7d32");
  path.setAttribute("stroke-width", "3");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("points", points.map(function (p) { return p.x + "," + p.y; }).join(" "));
  svg.appendChild(path);

  for (const p of points) {
    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("cx", p.x);
    dot.setAttribute("cy", p.y);
    dot.setAttribute("r", 4);
    dot.setAttribute("fill", "#f5b800");
    dot.setAttribute("stroke", "#8a6d00");
    dot.setAttribute("stroke-width", 1.5);
    svg.appendChild(dot);
  }

  const labelMin = document.createElementNS(svgNS, "text");
  labelMin.setAttribute("x", 4);
  labelMin.setAttribute("y", 14);
  labelMin.setAttribute("font-size", "11");
  labelMin.setAttribute("fill", "#4f6f4f");
  labelMin.textContent = "HC " + maxH;
  svg.appendChild(labelMin);

  const labelMax = document.createElementNS(svgNS, "text");
  labelMax.setAttribute("x", 4);
  labelMax.setAttribute("y", hpx - 4);
  labelMax.setAttribute("font-size", "11");
  labelMax.setAttribute("fill", "#4f6f4f");
  labelMax.textContent = "HC " + minH;
  svg.appendChild(labelMax);

  card.appendChild(svg);

  const summary = document.createElement("p");
  summary.style.fontSize = "12px";
  summary.style.marginTop = "8px";
  const first = history[0].handicap;
  const last = history[history.length - 1].handicap;
  const delta = last - first;
  let trendText = "Steady at " + last.toFixed(1) + ".";
  if (delta < 0) trendText = "Down " + Math.abs(delta).toFixed(1) + " strokes - improving! (" + first.toFixed(1) + " → " + last.toFixed(1) + ")";
  else if (delta > 0) trendText = "Up " + delta.toFixed(1) + " - focus on weak areas. (" + first.toFixed(1) + " → " + last.toFixed(1) + ")";
  summary.textContent = trendText;
  card.appendChild(summary);
}

function gatherAllShots() {
  const allShots = [];
  const history = getHistory();
  for (const r of history) {
    if (r.fullData && r.fullData.holes) {
      for (const hKey in r.fullData.holes) {
        const h = r.fullData.holes[hKey];
        if (Array.isArray(h.shots)) {
          for (const s of h.shots) allShots.push(s);
        }
      }
    }
  }
  for (const i of getActiveHoles()) {
    for (const s of getShotsForHole(i)) allShots.push(s);
  }
  return allShots;
}

function renderClubStats() {
  const card = document.getElementById("clubStatsCard");
  if (!card) return;
  card.innerHTML = "";

  const h = document.createElement("h3");
  h.textContent = "Club Stats (all rounds + current)";
  card.appendChild(h);

  const shots = gatherAllShots().filter(function (s) { return s.club; });
  if (shots.length === 0) {
    const p = document.createElement("p");
    p.textContent = "Add shots in a round to start building per-club stats.";
    card.appendChild(p);
    return;
  }

  const byClub = {};
  for (const s of shots) {
    const c = s.club;
    if (!byClub[c]) byClub[c] = { count: 0, distances: [], misses: {} };
    byClub[c].count += 1;
    const d = Number(s.distanceHit);
    if (!isNaN(d) && d > 0) byClub[c].distances.push(d);
    const dir = s.direction;
    if (dir && dir !== "Straight") {
      byClub[c].misses[dir] = (byClub[c].misses[dir] || 0) + 1;
    }
  }

  const table = document.createElement("table");
  table.className = "club-stats-table";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Club</th><th>Used</th><th>Avg</th><th>Long</th><th>Short</th><th>Top miss</th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");

  const clubs = Object.keys(byClub).sort(function (a, b) { return byClub[b].count - byClub[a].count; });
  for (const c of clubs) {
    const data = byClub[c];
    const tr = document.createElement("tr");
    tr.className = "clickable";
    let avg = "—", longest = "—", shortest = "—";
    if (data.distances.length > 0) {
      avg = Math.round(data.distances.reduce(function (s, v) { return s + v; }, 0) / data.distances.length);
      longest = Math.max.apply(null, data.distances);
      shortest = Math.min.apply(null, data.distances);
    }
    let topMiss = "—";
    let topMissCount = 0;
    for (const dir in data.misses) {
      if (data.misses[dir] > topMissCount) {
        topMiss = dir;
        topMissCount = data.misses[dir];
      }
    }
    tr.innerHTML =
      "<td class=\"club-name\">" + c + "</td>" +
      "<td>" + data.count + "</td>" +
      "<td>" + avg + "</td>" +
      "<td>" + longest + "</td>" +
      "<td>" + shortest + "</td>" +
      "<td>" + topMiss + "</td>";
    tr.addEventListener("click", function () { showClubDetailModal(c); });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  card.appendChild(table);

  const note = document.createElement("p");
  note.style.fontSize = "12px";
  note.style.marginTop = "8px";
  note.style.color = "#8a6d00";
  note.textContent = "Distances in yards. Top miss = your most common direction other than Straight.";
  card.appendChild(note);
}

function showRoundDetail(round) {
  const body = document.getElementById("modalBody");
  body.innerHTML = "";

  const title = document.createElement("h2");
  title.textContent = round.courseName + " — " + (round.date || "no date");
  body.appendChild(title);

  const gameType = getGameType(round);
  const typeLines = ["Round Type: " + gameType];
  if (gameType === "Tournament") {
    if (round.tournamentName) typeLines.push("Tournament: " + round.tournamentName);
    if (round.tournamentFormat) typeLines.push("Format: " + round.tournamentFormat);
  }
  for (const t of typeLines) {
    const p = document.createElement("p");
    p.textContent = t;
    body.appendChild(p);
  }

  const diffText = round.scoreVsPar > 0 ? "+" + round.scoreVsPar : "" + round.scoreVsPar;
  const summary = [
    "Player: " + round.playerName,
    "Tee: " + (round.tee || "—"),
    "Course Par: " + round.coursePar,
    "Total Score: " + round.totalScore,
    "Score vs Par: " + diffText,
    "Total Putts: " + (round.totalPutts !== undefined ? round.totalPutts : "—"),
    "Total Chips: " + (round.totalChips !== undefined ? round.totalChips : "—"),
    "Penalties: " + (round.totalPenalties !== undefined ? round.totalPenalties : "—"),
    "Fairway Hit %: " + (round.fairwayPct !== null && round.fairwayPct !== undefined ? round.fairwayPct + "%" : "—"),
    "Missed Short Putts: " + (round.missedShortPutts !== undefined ? round.missedShortPutts : "—"),
  ];
  for (const s of summary) {
    const p = document.createElement("p");
    p.textContent = s;
    body.appendChild(p);
  }

  if (round.weatherData) {
    const h = document.createElement("h3");
    h.textContent = "Weather That Day";
    body.appendChild(h);
    const w = round.weatherData;
    const lines = [];
    if (w.tempMax != null) lines.push("Temperature: " + Math.round(w.tempMax) + "°C high / " + Math.round(w.tempMin) + "°C low");
    if (w.condition) lines.push("Condition: " + w.condition);
    if (w.windKmh != null) lines.push("Wind: " + Math.round(w.windKmh) + " km/h");
    if (w.precipMm != null) lines.push("Rain: " + w.precipMm + " mm");
    if (w.locationName) lines.push("Location: " + w.locationName);
    for (const l of lines) {
      const p = document.createElement("p");
      p.textContent = l;
      body.appendChild(p);
    }
  } else if (round.weather) {
    const h = document.createElement("h3");
    h.textContent = "Weather That Day";
    body.appendChild(h);
    const p = document.createElement("p");
    p.textContent = round.weather;
    body.appendChild(p);
  }

  if (round.energyLevel || round.confidenceLevel || round.sleepQuality) {
    const h = document.createElement("h3");
    h.textContent = "Round Readiness";
    body.appendChild(h);
    const lines = [];
    if (round.energyLevel) lines.push("Energy: " + round.energyLevel);
    if (round.confidenceLevel) lines.push("Confidence: " + round.confidenceLevel);
    if (round.sleepQuality) lines.push("Sleep: " + round.sleepQuality);
    for (const l of lines) {
      const p = document.createElement("p");
      p.textContent = l;
      body.appendChild(p);
    }
  }

  if (round.postFeel || round.postBestShot || round.postBiggestMistake || round.postImprove) {
    const h = document.createElement("h3");
    h.textContent = "After Round Review";
    body.appendChild(h);
    if (round.postFeel) {
      const p = document.createElement("p");
      p.textContent = "How I felt: " + round.postFeel;
      body.appendChild(p);
    }
    if (round.postBestShot) {
      const p = document.createElement("p");
      p.textContent = "Best shot: " + round.postBestShot;
      body.appendChild(p);
    }
    if (round.postBiggestMistake) {
      const p = document.createElement("p");
      p.textContent = "Biggest mistake: " + round.postBiggestMistake;
      body.appendChild(p);
    }
    if (round.postImprove) {
      const p = document.createElement("p");
      p.textContent = "Improve next round: " + round.postImprove;
      body.appendChild(p);
    }
  }

  if (round.topWeakness) {
    const h = document.createElement("h3");
    h.textContent = "Top Weakness";
    body.appendChild(h);
    const p = document.createElement("p");
    p.textContent = round.topWeakness;
    body.appendChild(p);
  }

  function listSection(title, items, emptyText) {
    const h = document.createElement("h3");
    h.textContent = title;
    body.appendChild(h);
    const arr = items && items.length > 0 ? items : [emptyText];
    const ul = document.createElement("ul");
    for (const item of arr) {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  listSection("Biggest Mistakes", round.mistakes, "No big mistakes.");
  listSection("Strengths", round.strengths, "No clear strengths.");
  listSection("Practice", round.practice, "Nothing flagged - keep playing.");

  if (round.fullData && round.fullData.holes) {
    const h = document.createElement("h3");
    h.textContent = "Hole by Hole";
    body.appendChild(h);

    for (const holeNum in round.fullData.holes) {
      const hole = round.fullData.holes[holeNum];
      const holeDiv = document.createElement("div");
      holeDiv.className = "detail-hole";

      const ht = document.createElement("h4");
      ht.textContent = "Hole " + holeNum + " — Par " + (hole.par || "—") + (hole.distance ? ", " + hole.distance + " yds" : "");
      holeDiv.appendChild(ht);

      const shots = hole.shots || [];
      if (shots.length === 0) {
        const p = document.createElement("p");
        p.textContent = "No shots recorded.";
        holeDiv.appendChild(p);
      } else {
        for (let i = 0; i < shots.length; i++) {
          const sh = shots[i];
          const p = document.createElement("p");
          const parts = [
            "Shot " + (i + 1) + ":",
            sh.club || "—",
            (sh.distanceHit || "—") + " yds hit",
            "lie: " + (sh.lie || "—"),
            "dir: " + (sh.direction || "—"),
            "quality: " + (sh.quality || "—"),
            "result: " + (sh.result || "—"),
          ];
          p.textContent = parts.join(" • ");
          holeDiv.appendChild(p);
        }
      }

      const putting = document.createElement("p");
      putting.textContent =
        "First putt: " + (hole.firstPuttDistance || "—") + " ft, result: " +
        (hole.firstPuttResult || "—") + ", missed short: " + (hole.missedShortPutt || "—");
      holeDiv.appendChild(putting);

      const stats = getHoleStatsFromSavedHole(hole);
      const analysis = computeHoleAnalysisFromStats(stats);
      if (analysis) {
        const ad = document.createElement("div");
        ad.className = "detail-hole-analysis";
        for (const line of [
          "Main mistake: " + analysis.mistake,
          "What went well: " + analysis.wentWell,
          "Practise: " + analysis.practise,
        ]) {
          const p = document.createElement("p");
          p.textContent = line;
          ad.appendChild(p);
        }
        holeDiv.appendChild(ad);
      }

      body.appendChild(holeDiv);
    }
  }

  document.getElementById("roundDetailModal").style.display = "";
  window.scrollTo(0, 0);
}

function closeRoundDetail() {
  document.getElementById("roundDetailModal").style.display = "none";
}

function showClubDetailModal(club) {
  const body = document.getElementById("modalBody");
  body.innerHTML = "";

  const title = document.createElement("h2");
  title.textContent = club + " — Club Lab";
  body.appendChild(title);

  const shots = gatherAllShots().filter(function (s) { return s.club === club; });
  if (shots.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No shots recorded with this club.";
    body.appendChild(p);
    document.getElementById("roundDetailModal").style.display = "";
    return;
  }

  const dists = shots.map(function (s) { return Number(s.distanceHit); }).filter(function (n) { return !isNaN(n) && n > 0; });
  const avg = dists.length ? Math.round(dists.reduce(function (s, v) { return s + v; }, 0) / dists.length) : "—";
  const longest = dists.length ? Math.max.apply(null, dists) : "—";
  const shortest = dists.length ? Math.min.apply(null, dists) : "—";

  const counts = { lie: {}, direction: {}, quality: {}, result: {} };
  for (const s of shots) {
    for (const key in counts) {
      if (s[key]) counts[key][s[key]] = (counts[key][s[key]] || 0) + 1;
    }
  }

  const summary = [
    "Times used: " + shots.length,
    "Average distance: " + avg + " yds",
    "Longest: " + longest + " yds",
    "Shortest: " + shortest + " yds",
  ];
  for (const line of summary) {
    const p = document.createElement("p");
    p.textContent = line;
    body.appendChild(p);
  }

  function topItems(obj) {
    return Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; }).slice(0, 3);
  }

  function section(label, obj) {
    const top = topItems(obj);
    if (top.length === 0) return;
    const h = document.createElement("h3");
    h.textContent = label;
    body.appendChild(h);
    const ul = document.createElement("ul");
    for (const k of top) {
      const li = document.createElement("li");
      li.textContent = k + " — " + obj[k] + " shot(s)";
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }

  section("Most common lie", counts.lie);
  section("Most common direction", counts.direction);
  section("Most common quality", counts.quality);
  section("Most common result", counts.result);

  const setHint = document.createElement("p");
  setHint.style.marginTop = "12px";
  setHint.style.fontStyle = "italic";
  const saved = getClubDistance(club);
  if (saved) setHint.textContent = "Your stored " + club + " distance: " + saved + " yds.";
  else setHint.textContent = "Tip: set a default distance for this club on the Club Setup page.";
  body.appendChild(setHint);

  document.getElementById("roundDetailModal").style.display = "";
  window.scrollTo(0, 0);
}


const roundModeSel = document.getElementById("roundMode");
if (roundModeSel) {
  const stored = localStorage.getItem("roundMode");
  if (stored) roundModeSel.value = stored;
  roundModeSel.addEventListener("change", function () {
    localStorage.setItem("roundMode", roundModeSel.value);
    applyRoundMode();
    handleChange();
  });
}

const prevHoleBtn = document.getElementById("prevHoleBtn");
const nextHoleBtn = document.getElementById("nextHoleBtn");
if (prevHoleBtn) {
  prevHoleBtn.addEventListener("click", function () { showHole(currentHoleIndex - 1); });
}
if (nextHoleBtn) {
  nextHoleBtn.addEventListener("click", function () {
    const steps = holesContainer.querySelectorAll(".hole-step");
    if (currentHoleIndex >= steps.length - 1) {
      showApp();
      switchTab("statsTab");
    } else {
      showHole(currentHoleIndex + 1);
    }
  });
}

const savedIdx = Number(localStorage.getItem("currentHoleIndex"));
if (!isNaN(savedIdx) && savedIdx >= 0) currentHoleIndex = savedIdx;

// Only save defaults on the very first visit (when no selectedClubs key yet).
// Once the user clicks Clear All, we respect the empty bag.
if (localStorage.getItem("selectedClubs") === null) {
  saveSelectedClubs(DEFAULT_CLUBS.slice());
}
buildClubsGrid();

const clubsSelectAll = document.getElementById("clubsSelectAll");
const clubsClearAll = document.getElementById("clubsClearAll");
const clubsDefault = document.getElementById("clubsDefault");
if (clubsSelectAll) {
  clubsSelectAll.addEventListener("click", function () {
    saveSelectedClubs(ALL_CLUBS.slice(0, MAX_CLUBS));
    buildClubsGrid();
  });
}
if (clubsClearAll) {
  clubsClearAll.addEventListener("click", function () {
    saveSelectedClubs([]);
    buildClubsGrid();
  });
}
if (clubsDefault) {
  clubsDefault.addEventListener("click", function () {
    saveSelectedClubs(DEFAULT_CLUBS.slice());
    buildClubsGrid();
  });
}

const addCustomBtn = document.getElementById("addCustomClubBtn");
const customInput = document.getElementById("customClubInput");
if (addCustomBtn && customInput) {
  addCustomBtn.addEventListener("click", function () {
    const name = customInput.value.trim();
    if (!name) return;
    const all = getAllAvailableClubs();
    if (all.indexOf(name) === -1) {
      const custom = getCustomClubs();
      custom.push(name);
      saveCustomClubs(custom);
    }
    customInput.value = "";
    const sel = getSelectedClubs();
    if (sel.indexOf(name) === -1 && sel.length < MAX_CLUBS) {
      sel.push(name);
      saveSelectedClubs(sel);
    }
    buildClubsGrid();
  });
}

[
  "setupLogoutBtn",
  "clubsLogoutBtn",
].forEach(function (id) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("click", function () {
      if (confirm("Log out?")) {
        localStorage.removeItem("golfLoggedIn");
        showLogin();
      }
    });
  }
});

buildCustomHoleChecks();
autoSeedIfNeeded();
buildHoles();
loadAll();
toggleSetupRows();
applyCourseData();
updateSummary();
analyze();
renderHistory();
initDashboard();
renderDashboard();
wireCoachUi();
renderClubDistances();

// Now that all constants and functions are initialized, decide which
// ---------------- Swing Video Library (Phase 6) ----------------


// Screen modules: wire their event listeners on initial load.
wirePracticeUi();
wireVideosUi();
wireStatsCategories();

// when TEE_GOALS was referenced inside renderWelcome before being
// declared).
if (isLoggedIn()) {
  applyUrlActivationToCurrentUser();
  showWelcome();
} else {
  showLogin();
}
