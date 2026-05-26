const DEMO_USERNAME = "Ayaan";
const DEMO_PASSWORD = "Golf123";

function isLoggedIn() {
  return localStorage.getItem("golfLoggedIn") === "yes";
}

function showLogin() {
  document.getElementById("loginScreen").style.display = "";
  document.getElementById("welcomeScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "none";
}

function showWelcome() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("welcomeScreen").style.display = "";
  document.getElementById("appScreen").style.display = "none";
  renderWelcome();
}

function showApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("welcomeScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "";
}

function renderWelcome() {
  const nameEl = document.getElementById("welcomeName");
  const saved = localStorage.getItem("golfRound");
  let name = DEMO_USERNAME;
  if (saved) {
    try {
      const d = JSON.parse(saved);
      if (d.setup && d.setup.playerName) name = d.setup.playerName;
    } catch (e) {}
  }
  nameEl.textContent = name;

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

  const dateInput = document.getElementById("roundDate");
  if (dateInput && !dateInput.value) dateInput.value = todayISO();

  renderPreRoundCoach();
}

async function loadTemperatureForDate(dateStr) {
  const out = document.getElementById("defaultsTemp");
  if (!out || !dateStr) return;
  out.textContent = "Loading...";
  const lat = 22.55;
  const lon = 88.36;
  const tz = "Asia%2FKolkata";
  const today = todayISO();
  const isPast = dateStr < today;
  const base = isPast
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";
  const url = base + "?latitude=" + lat + "&longitude=" + lon +
    "&start_date=" + dateStr + "&end_date=" + dateStr +
    "&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=" + tz;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    const max = data && data.daily && data.daily.temperature_2m_max && data.daily.temperature_2m_max[0];
    const min = data && data.daily && data.daily.temperature_2m_min && data.daily.temperature_2m_min[0];
    const code = data && data.daily && data.daily.weathercode && data.daily.weathercode[0];
    const condition = weatherCodeToText(code);
    if (max == null) {
      out.textContent = "No data for that date";
    } else {
      out.textContent = Math.round(max) + "°C high · " + Math.round(min) + "°C low · " + condition;
    }
    localStorage.setItem("defaultsTemp", out.textContent);
  } catch (e) {
    out.textContent = "Could not load (no internet?)";
  }
}

function weatherCodeToText(code) {
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

document.getElementById("loginBtn").addEventListener("click", function () {
  const u = document.getElementById("usernameInput").value.trim();
  const p = document.getElementById("passwordInput").value;
  if (u === DEMO_USERNAME && p === DEMO_PASSWORD) {
    localStorage.setItem("golfLoggedIn", "yes");
    document.getElementById("loginError").textContent = "";
    document.getElementById("passwordInput").value = "";
    showWelcome();
  } else {
    document.getElementById("loginError").textContent = "Wrong username or password.";
  }
});

document.getElementById("continueBtn").addEventListener("click", function () {
  const d = document.getElementById("defaultsDateInput");
  if (d && d.value) {
    localStorage.setItem("defaultsDate", d.value);
    const roundDate = document.getElementById("roundDate");
    if (roundDate) roundDate.value = d.value;
  }
  showApp();
  switchTab("setupTab");
});

const defaultsDateInputInit = document.getElementById("defaultsDateInput");
if (defaultsDateInputInit) {
  defaultsDateInputInit.addEventListener("change", function () {
    localStorage.setItem("defaultsDate", defaultsDateInputInit.value);
    loadTemperatureForDate(defaultsDateInputInit.value);
  });
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
  }
  window.scrollTo(0, 0);
}

document.addEventListener("click", function (e) {
  const btn = e.target.closest && e.target.closest("[data-go]");
  if (!btn) return;
  const target = btn.dataset.go;
  if (target === "welcome") {
    showWelcome();
  } else if (target === "setupTab" || target === "clubsTab" || target === "trackerTab" || target === "statsTab" || target === "coachTab") {
    showApp();
    switchTab(target);
  }
});

const statsLogoutBtn = document.getElementById("statsLogoutBtn");
if (statsLogoutBtn) {
  statsLogoutBtn.addEventListener("click", function () {
    if (confirm("Log out?")) {
      localStorage.removeItem("golfLoggedIn");
      showLogin();
    }
  });
}

document.getElementById("welcomeLogoutBtn").addEventListener("click", function () {
  if (confirm("Log out?")) {
    localStorage.removeItem("golfLoggedIn");
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
const setupContainer = document.querySelector(".setup");

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

const COURSES = {
  RCGC: {
    pars: [4, 3, 4, 5, 4, 4, 4, 4, 4, 4, 4, 4, 3, 4, 5, 4, 4, 4],
    tees: {
      Blue: [359, 161, 442, 570, 410, 425, 421, 401, 429, 439, 451, 394, 233, 426, 503, 354, 382, 437],
      White: [350, 150, 388, 521, 396, 420, 388, 368, 396, 426, 422, 341, 196, 404, 494, 347, 367, 429],
      Yellow: [309, 142, 368, 463, 382, 377, 333, 352, 316, 371, 359, 326, 157, 348, 409, 329, 357, 367],
      Red: [305, 137, 332, 451, 352, 330, 299, 326, 314, 367, 351, 283, 126, 323, 403, 327, 347, 363],
    },
  },
};

const BAD_QUALITIES = ["Top", "Duff", "Slice", "Hook"];

const ALL_CLUBS = [
  "Driver", "Mini Driver",
  "2 Wood", "3 Wood", "4 Wood", "5 Wood", "7 Wood", "9 Wood",
  "1 Hybrid", "2 Hybrid", "3 Hybrid", "4 Hybrid", "5 Hybrid", "6 Hybrid", "7 Hybrid",
  "1 Iron", "2 Iron", "3 Iron", "4 Iron", "5 Iron", "6 Iron", "7 Iron", "8 Iron", "9 Iron",
  "Pitching Wedge", "Gap Wedge", "Sand Wedge", "Lob Wedge",
  "Chipper", "Putter",
];

const DEFAULT_CLUBS = ["Driver", "3 Wood", "4 Hybrid", "6 Iron", "7 Iron", "8 Iron", "9 Iron", "Pitching Wedge", "Sand Wedge", "Lob Wedge", "Putter"];

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

function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
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

const MAX_CLUBS = 14;

function getSelectedClubs() {
  const raw = localStorage.getItem("selectedClubs");
  if (!raw) return DEFAULT_CLUBS.slice();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (e) {}
  return DEFAULT_CLUBS.slice();
}

function saveSelectedClubs(arr) {
  localStorage.setItem("selectedClubs", JSON.stringify(arr));
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

      <h3>Shots</h3>
      <div class="shots-list" id="shotsList-${n}"></div>
      <button type="button" class="add-shot-btn" data-hole="${n}">+ Add Shot</button>

      <p class="hole-score">Shots so far: <span id="holeScore-${n}">0</span></p>

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
}

function showHole(index) {
  const steps = holesContainer.querySelectorAll(".hole-step");
  if (steps.length === 0) return;
  if (index < 0) index = 0;
  if (index >= steps.length) index = steps.length - 1;
  currentHoleIndex = index;
  steps.forEach(function (s, i) {
    s.style.display = i === currentHoleIndex ? "" : "none";
  });
  updateHoleNav();
  localStorage.setItem("currentHoleIndex", String(index));
  window.scrollTo({ top: 0, behavior: "smooth" });
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
    const fpdEl = document.getElementById("firstPuttDistance-" + i);
    data.holes[i] = {
      par: document.getElementById("par-" + i).value,
      distance: document.getElementById("holeDistance-" + i).value,
      shots: getShotsForHole(i),
      putts: getPuttsForHole(i),
      firstPuttDistance: fpdEl ? fpdEl.value : "",
      firstPuttResult: document.getElementById("firstPuttResult-" + i).value,
      missedShortPutt: document.getElementById("missedShortPutt-" + i).value,
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

      const fpdEl = document.getElementById("firstPuttDistance-" + i);
      if (fpdEl && hole.firstPuttDistance !== undefined) fpdEl.value = hole.firstPuttDistance;

      const fprEl = document.getElementById("firstPuttResult-" + i);
      if (fprEl && hole.firstPuttResult !== undefined) fprEl.value = hole.firstPuttResult;

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

function computeHoleStats(par, shots, firstPuttResult, missedShortStr) {
  par = Number(par) || 0;
  shots = shots || [];
  const score = shots.length;
  let putts = 0;
  let chips = 0;
  let penalties = 0;
  let badShots = 0;
  let goodShots = 0;
  const WEDGE_CLUBS = ["PW", "GW", "SW", "LW", "Wedge"];
  for (const s of shots) {
    if (s.club === "Putter") putts += 1;
    if (WEDGE_CLUBS.indexOf(s.club) !== -1) chips += 1;
    if (s.result === "Penalty") penalties += 1;
    if (BAD_QUALITIES.indexOf(s.quality) !== -1) badShots += 1;
    if (s.quality === "Good shot") goodShots += 1;
  }
  let fwHit = 0;
  let fwAns = 0;
  if (par >= 4 && shots.length > 0 && shots[0].lie === "Tee" && shots[0].result) {
    fwAns = 1;
    if (shots[0].result === "On fairway") fwHit = 1;
  }
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
    firstPuttResult: firstPuttResult || "",
    missedShort: missedShortStr === "Yes",
  };
}

function getHoleStats(i) {
  const par = Number(document.getElementById("par-" + i).value) || 0;
  const shots = getShotsForHole(i);
  const puttsArr = getPuttsForHole(i);
  const score = shots.length + puttsArr.length;
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
  let fwHit = 0;
  let fwAns = 0;
  if (par >= 4 && shots.length > 0 && shots[0].lie === "Tee" && shots[0].result) {
    fwAns = 1;
    if (shots[0].result === "Fairway" || shots[0].result === "On fairway") fwHit = 1;
  }
  const firstPuttResult = document.getElementById("firstPuttResult-" + i).value;
  const missedShort = document.getElementById("missedShortPutt-" + i).value === "Yes";
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

  const mistakes = [];
  if (totalPenalties >= 1) mistakes.push("Penalty strokes lost: " + totalPenalties + ".");
  if (fairwayPct !== null && fairwayPct < 60) mistakes.push("Missed fairways: only " + fairwayPct + "% hit.");
  if (missedShortPutts >= 1) mistakes.push("Missed " + missedShortPutts + " short putt(s).");
  if (firstPuttShort >= 2) mistakes.push("First putts too short " + firstPuttShort + " times.");
  if (firstPuttLong >= 2) mistakes.push("First putts too long " + firstPuttLong + " times.");
  if (threePutts >= 1) mistakes.push(threePutts + " three-putt(s).");
  if (badShots >= 2) mistakes.push("Poor shots (top/duff/slice/hook): " + badShots + ".");

  const strengths = [];
  if (fairwayPct !== null && fairwayPct >= 70) strengths.push("Good fairway accuracy: " + fairwayPct + "%.");
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
    if (s.missedShort) missedShortPutts += 1;
  }

  const coursePar = getCoursePar();
  const parForRound = totalPar > 0 ? totalPar : coursePar;
  const fairwayPct = fairwaysAnswered > 0 ? Math.round((fairwaysHit / fairwaysAnswered) * 100) : null;

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
    totalScore,
    scoreVsPar: parForRound > 0 ? totalScore - parForRound : 0,
    totalPutts,
    totalChips,
    totalPenalties,
    fairwayPct,
    badShots,
    missedShortPutts,
    holes: getActiveHoles().length,
    activeHoles: getActiveHoles(),
    holesMode: document.getElementById("holesMode").value || "18",
    savedAt: new Date().toISOString(),
    gameType: document.getElementById("gameType").value || "Normal Game",
    tournamentName: document.getElementById("tournamentName").value || "",
    tournamentFormat: document.getElementById("tournamentFormat").value || "",
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
    holeData.missedShortPutt
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

  const mistakes = [];
  if (totalPenalties >= 1) mistakes.push("Penalty strokes lost: " + totalPenalties + ".");
  if (fairwayPct !== null && fairwayPct < 60) mistakes.push("Missed fairways: only " + fairwayPct + "% hit.");
  if (missedShortPutts >= 1) mistakes.push("Missed " + missedShortPutts + " short putt(s).");
  if (firstPuttShort >= 2) mistakes.push("First putts too short " + firstPuttShort + " times.");
  if (firstPuttLong >= 2) mistakes.push("First putts too long " + firstPuttLong + " times.");
  if (threePutts >= 1) mistakes.push(threePutts + " three-putt(s).");
  if (badShots >= 2) mistakes.push("Poor shots (top/duff/slice/hook): " + badShots + ".");

  const strengths = [];
  if (fairwayPct !== null && fairwayPct >= 70) strengths.push("Good fairway accuracy: " + fairwayPct + "%.");
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
  document.getElementById("modalClose").addEventListener("click", closeRoundDetail);
  document.getElementById("roundDetailModal").addEventListener("click", function (e) {
    if (e.target === this) closeRoundDetail();
  });
}

function getHistory() {
  return JSON.parse(localStorage.getItem("roundHistory") || "[]");
}

function getUpcoming() {
  return JSON.parse(localStorage.getItem("upcomingRounds") || "[]");
}

function saveUpcoming(arr) {
  localStorage.setItem("upcomingRounds", JSON.stringify(arr));
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
  renderClubStats();
  renderUpcoming();
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

function addChatMessage(text, role) {
  const wrap = document.getElementById("chatMessages");
  const msg = document.createElement("div");
  msg.className = "chat-msg chat-msg-" + role;
  msg.textContent = text;
  wrap.appendChild(msg);
  wrap.scrollTop = wrap.scrollHeight;
}

function coachAnswerFor(question) {
  const q = (question || "").toLowerCase();
  const history = getHistory();
  const recent = history.slice(-5);

  function avg(arr, key) {
    const v = arr.filter(function (r) { return typeof r[key] === "number" && !isNaN(r[key]); });
    if (v.length === 0) return null;
    return v.reduce(function (s, r) { return s + r[key]; }, 0) / v.length;
  }

  if (history.length === 0) {
    return "Save a few rounds first and I'll have real data to talk about. Try to log your next round!";
  }

  if (q.indexOf("hello") !== -1 || q.indexOf("hi ") !== -1 || q === "hi") {
    return "Hey! I'm your golf coach. Ask me about your putting, driving, chipping, weaknesses, strengths, tournaments, or how to improve.";
  }

  if (q.indexOf("putt") !== -1 || q.indexOf("putting") !== -1) {
    const avgPutts = avg(recent, "totalPutts");
    const missed = recent.reduce(function (s, r) { return s + (r.missedShortPutts || 0); }, 0);
    const lines = [];
    if (avgPutts !== null) lines.push("Your average over your last " + recent.length + " rounds is " + avgPutts.toFixed(1) + " putts.");
    if (missed > 0) lines.push("You've missed " + missed + " short putts recently. Drill: 5 balls 3 feet from the hole, don't stop until all 5 go in.");
    else lines.push("Short putts have been solid - keep that confidence.");
    if (avgPutts !== null && avgPutts > 34) lines.push("Lots of putts means 3-putts. Practice lag putting from 30 feet to a coin.");
    return lines.join(" ");
  }

  if (q.indexOf("drive") !== -1 || q.indexOf("driving") !== -1 || q.indexOf("fairway") !== -1 || q.indexOf("tee shot") !== -1) {
    const avgFw = avg(recent, "fairwayPct");
    if (avgFw === null) return "Track your tee shots a few more rounds and I'll tell you your fairway accuracy.";
    if (avgFw >= 70) return "Driving is a strength - " + Math.round(avgFw) + "% fairways. Keep aiming at a target on every tee.";
    if (avgFw >= 50) return "Fairway accuracy is OK at " + Math.round(avgFw) + "%. Pick the safest line and use a club you trust off the tee.";
    return "Fairway hit rate is " + Math.round(avgFw) + "% - that's a weak area. Use a shorter club off the tee and aim 10 yards inside trouble.";
  }

  if (q.indexOf("chip") !== -1) {
    const avgChips = avg(recent, "totalChips");
    if (avgChips === null || avgChips === 0) return "Track your chips (Wedge shots) and I'll have feedback.";
    return "You're averaging " + avgChips.toFixed(1) + " chips per round. Practice 20 chips a day from 10-30 yards to lower this.";
  }

  if (q.indexOf("weakness") !== -1 || q.indexOf("weak") !== -1) {
    if (recent[recent.length - 1] && recent[recent.length - 1].topWeakness) {
      return recent[recent.length - 1].topWeakness;
    }
    return "Play and save a round - the coach picks your biggest weakness automatically.";
  }

  if (q.indexOf("strength") !== -1 || q.indexOf("good at") !== -1 || q.indexOf("best") !== -1) {
    const counts = {};
    for (const r of recent) for (const s of (r.strengths || [])) counts[s] = (counts[s] || 0) + 1;
    const top = topKeys(counts, 2);
    if (top.length === 0) return "Keep playing - you'll show strengths once you save more rounds.";
    return "Your strengths recently: " + top.join(" and ") + ". Keep doing that.";
  }

  if (q.indexOf("practice") !== -1 || q.indexOf("practise") !== -1 || q.indexOf("improve") !== -1 || q.indexOf("drill") !== -1) {
    const counts = {};
    for (const r of recent) for (const p of (r.practice || [])) counts[p] = (counts[p] || 0) + 1;
    const top = topKeys(counts, 3);
    if (top.length === 0) return "Daily: 10 short putts, 20 chips from 15 yards, 10 smooth full swings. That's a solid foundation.";
    return "Top things to practice: " + top.join("; ") + ".";
  }

  if (q.indexOf("tournament") !== -1 || q.indexOf("tour") !== -1) {
    const tournaments = history.filter(function (r) { return r.gameType === "Tournament"; });
    if (tournaments.length === 0) return "You haven't logged any tournament rounds yet. Add one to track tournament stats.";
    const scores = tournaments.map(function (r) { return r.totalScore; }).filter(function (s) { return s > 0; });
    if (scores.length === 0) return "Tournament rounds saved but no scores yet.";
    const best = Math.min.apply(null, scores);
    return "Tournament rounds: " + tournaments.length + ". Best score: " + best + ". Stay patient under pressure - one shot at a time.";
  }

  if (q.indexOf("rcgc") !== -1) {
    const rcgc = history.filter(function (r) { return r.courseName === "RCGC"; });
    if (rcgc.length === 0) return "No RCGC rounds saved yet. Once you play there I'll have RCGC-specific tips.";
    const scores = rcgc.map(function (r) { return r.totalScore; }).filter(function (s) { return s > 0; });
    const best = scores.length > 0 ? Math.min.apply(null, scores) : "—";
    const counts = {};
    for (const r of rcgc) for (const m of (r.mistakes || [])) counts[m] = (counts[m] || 0) + 1;
    const top = topKeys(counts, 2);
    let msg = "RCGC rounds: " + rcgc.length + ". Best score: " + best + ".";
    if (top.length > 0) msg += " Common RCGC mistakes: " + top.join("; ") + ".";
    return msg;
  }

  if (q.indexOf("score") !== -1 || q.indexOf("scoring") !== -1) {
    const scores = recent.map(function (r) { return r.totalScore; }).filter(function (s) { return s > 0; });
    if (scores.length === 0) return "No scored rounds yet - let's get one logged.";
    const a = (scores.reduce(function (s, v) { return s + v; }, 0) / scores.length).toFixed(1);
    const best = Math.min.apply(null, scores);
    const worst = Math.max.apply(null, scores);
    return "Last " + scores.length + " rounds: avg " + a + ", best " + best + ", worst " + worst + ".";
  }

  if (q.indexOf("improv") !== -1 || q.indexOf("getting better") !== -1) {
    const scoresAll = history.map(function (r) { return r.totalScore; }).filter(function (s) { return s > 0; });
    if (scoresAll.length < 2) return "Save at least 2 rounds and I'll tell you the trend.";
    const first = scoresAll[0];
    const last = scoresAll[scoresAll.length - 1];
    const diff = last - first;
    if (diff < -1) return "Yes - your scores are dropping. First saved: " + first + ", latest: " + last + ". Keep grinding.";
    if (diff > 1) return "Scores have gone up by " + diff + " strokes. Focus on your top weakness this week.";
    return "Scores are about the same. Lock in your basics and your average will come down.";
  }

  if (q.indexOf("goal") !== -1 || q.indexOf("tee") !== -1) {
    const g = suggestTeeProgression();
    let msg = "Current tee: " + (g.currentTee || "not set") + ". Goal: " + g.goalText + ".";
    if (g.progress) msg += " " + g.progress + ".";
    if (g.suggestion) msg += " " + g.suggestion;
    return msg;
  }

  if (q.indexOf("ready") !== -1 || q.indexOf("next round") !== -1 || q.indexOf("today") !== -1) {
    const lastMistake = recent[recent.length - 1] && recent[recent.length - 1].mistakes && recent[recent.length - 1].mistakes[0];
    if (lastMistake) return "Today, focus on this: " + lastMistake + ". Warm up with putts and chips, drink water, take it shot by shot.";
    return "Warm up with putts and chips, drink water, pick a target every shot, and don't hurry.";
  }

  if (q.indexOf("rory") !== -1 || q.indexOf("mcilroy") !== -1 || q.indexOf("dream") !== -1 || q.indexOf("pro") !== -1) {
    return "Pros built their game one round at a time. Track everything, fix one weakness at a time, and you keep moving toward World No. 1.";
  }

  if (q.indexOf("swing") !== -1) {
    return "Keep a steady head. Finish your shoulder turn. Accelerate THROUGH the ball, not at it. Practice slow tempo half-swings until contact is clean every time.";
  }
  if (q.indexOf("grip") !== -1) {
    return "Both palms facing each other. The V's from thumb and index finger point at your right shoulder (right-handed). Grip pressure light - like holding a tube of toothpaste.";
  }
  if (q.indexOf("stance") !== -1 || q.indexOf("posture") !== -1 || q.indexOf("setup") !== -1) {
    return "Feet shoulder-width apart, knees slightly bent, tilt from the hips not the waist, weight on the balls of the feet. Stay athletic and balanced.";
  }
  if (q.indexOf("nervous") !== -1 || q.indexOf("anxiety") !== -1 || q.indexOf("scared") !== -1 || q.indexOf("pressure") !== -1 || q.indexOf("fear") !== -1) {
    return "Take 3 deep breaths before any tough shot. Pick a small target. Make one smooth practice swing first. The shot is just a shot - your worth doesn't depend on it.";
  }
  if (q.indexOf("mental") !== -1 || q.indexOf("confidence") !== -1 || q.indexOf("mindset") !== -1) {
    return "After a bad shot: feel it for 10 seconds, then let it go. Picture your best shot before every swing. Never play your next shot angry.";
  }
  if (q.indexOf("slice") !== -1) {
    return "Slice fix: check your grip first (turn left hand slightly to the right). Feel your right shoulder go DOWN and TOWARD the target after impact. Swing more in-to-out.";
  }
  if (q.indexOf("hook") !== -1) {
    return "Hook fix: weaken your grip (turn left hand slightly left). Don't let shoulders open too fast. Feel a more out-to-in swing path with a held-off finish.";
  }
  if (q.indexOf("top") !== -1 || q.indexOf("duff") !== -1 || q.indexOf("fat") !== -1 || q.indexOf("thin") !== -1 || q.indexOf("strike") !== -1 || q.indexOf("contact") !== -1) {
    return "Mishits usually mean you lifted up or scooped. Keep your spine angle through impact. With irons hit DOWN through the ball - trust the loft.";
  }
  if (q.indexOf("bunker") !== -1 || q.indexOf("sand") !== -1) {
    return "Open your stance and clubface. Aim 1-2 inches behind the ball and SPLASH the sand. Don't decelerate - swing through.";
  }
  if (q.indexOf("rain") !== -1 || q.indexOf("wind") !== -1 || q.indexOf("weather") !== -1) {
    return "Wind/rain: take more club, swing easier, keep the ball flight low. Wider stance for balance. Stay patient - everyone's playing the same conditions.";
  }
  if (q.indexOf("warm up") !== -1 || q.indexOf("warmup") !== -1) {
    return "Warm-up: 5 minutes stretch, 5 short putts, 10 chips, 10 short iron half-swings, then a few full swings. Don't skip the short game - it sets your feel.";
  }
  if (q.indexOf("fitness") !== -1 || q.indexOf("workout") !== -1 || q.indexOf("strength") !== -1) {
    return "Junior golf fitness: rotation drills, core planks, single-leg balance, light medicine ball throws. Flexibility matters more than heavy weights.";
  }

  return "Hmm, tell me a bit more or ask in different words. I can help with: swing, grip, stance, slice, hook, mishits, mental game, pressure, bunkers, weather, warm-up, putting, driving, chipping, weakness, strengths, practice, tournaments, RCGC, scoring, improvement, and pre-round advice.";
}

function sendChatMessage(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return;
  addChatMessage(trimmed, "user");
  const reply = coachAnswerFor(trimmed);
  setTimeout(function () { addChatMessage(reply, "coach"); }, 250);
}

function initChat() {
  const messages = document.getElementById("chatMessages");
  if (!messages) return;
  if (messages.children.length === 0) {
    addChatMessage("Hi! I'm your coach. Ask me anything about your golf game - or tap a question below to start.", "coach");
  }
  const sendBtn = document.getElementById("sendBtn");
  const input = document.getElementById("chatInput");
  sendBtn.addEventListener("click", function () {
    sendChatMessage(input.value);
    input.value = "";
  });
  input.addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      sendChatMessage(input.value);
      input.value = "";
    }
  });
  document.querySelectorAll(".quick-reply").forEach(function (btn) {
    btn.addEventListener("click", function () {
      sendChatMessage(btn.dataset.q);
    });
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

(function ensureDefaultClubs() {
  const raw = localStorage.getItem("selectedClubs");
  let needsDefaults = !raw;
  if (!needsDefaults) {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) needsDefaults = true;
    } catch (e) {
      needsDefaults = true;
    }
  }
  if (needsDefaults) saveSelectedClubs(DEFAULT_CLUBS.slice());
})();
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
buildHoles();
loadAll();
toggleSetupRows();
applyCourseData();
updateSummary();
analyze();
renderHistory();
initDashboard();
renderDashboard();
initChat();

// Now that all constants and functions are initialized, decide which
// screen to show (this used to run at the top of the file but crashed
// when TEE_GOALS was referenced inside renderWelcome before being
// declared).
if (isLoggedIn()) showWelcome();
else showLogin();
