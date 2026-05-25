const DEMO_USERNAME = "Ayaan";
const DEMO_PASSWORD = "Golf123";

function isLoggedIn() {
  return localStorage.getItem("golfLoggedIn") === "yes";
}

function showLogin() {
  document.getElementById("loginScreen").style.display = "";
  document.getElementById("appScreen").style.display = "none";
}

function showApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "";
}

document.getElementById("loginBtn").addEventListener("click", function () {
  const u = document.getElementById("usernameInput").value.trim();
  const p = document.getElementById("passwordInput").value;
  if (u === DEMO_USERNAME && p === DEMO_PASSWORD) {
    localStorage.setItem("golfLoggedIn", "yes");
    document.getElementById("loginError").textContent = "";
    document.getElementById("passwordInput").value = "";
    showApp();
  } else {
    document.getElementById("loginError").textContent = "Wrong username or password.";
  }
});

document.getElementById("passwordInput").addEventListener("keypress", function (e) {
  if (e.key === "Enter") document.getElementById("loginBtn").click();
});

document.getElementById("usernameInput").addEventListener("keypress", function (e) {
  if (e.key === "Enter") document.getElementById("passwordInput").focus();
});

if (isLoggedIn()) showApp();
else showLogin();

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
  "numberOfHoles",
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

      <h3>Putting</h3>

      <label>First Putt Distance (feet)
        <input type="number" id="firstPuttDistance-${n}" min="0" />
      </label>

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
          <option value="Driver">Driver</option>
          <option value="Wood">Wood</option>
          <option value="Hybrid">Hybrid</option>
          <option value="Iron">Iron</option>
          <option value="Wedge">Wedge</option>
          <option value="Putter">Putter</option>
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
          <option value="On fairway">On fairway</option>
          <option value="On green">On green</option>
          <option value="Near hole">Near hole</option>
          <option value="Far from hole">Far from hole</option>
          <option value="Penalty">Penalty</option>
          <option value="Holed">Holed</option>
        </select>
      </label>

      <button type="button" class="remove-shot-btn">Remove Shot</button>
    </div>
  `;
}

function buildHoles() {
  holesContainer.innerHTML = "";
  for (let i = 1; i <= holeCount; i++) {
    holesContainer.insertAdjacentHTML("beforeend", makeHoleCard(i));
    if ((i === 5 || i === 10 || i === 15) && i <= holeCount) {
      holesContainer.insertAdjacentHTML(
        "beforeend",
        `<div class="trend-check" id="trendCheck-${i}" style="display:none;"><h3>Trend Check after Hole ${i}</h3><div class="trend-lines"></div></div>`
      );
    }
  }
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
  document.getElementById("teeRow").style.display = COURSES[course] ? "" : "none";

  const playedIn = document.getElementById("playedIn").value;
  document.getElementById("countryRow").style.display = playedIn === "Outside India" ? "" : "none";
}

function updateCourseInfoFromInputs() {
  let total = 0;
  let front9 = 0;
  let back9 = 0;
  for (let i = 1; i <= holeCount; i++) {
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
  const data = { setup: {}, holes: {} };
  for (const f of SETUP_FIELDS) {
    const el = document.getElementById(f);
    if (el) data.setup[f] = el.value;
  }
  for (let i = 1; i <= holeCount; i++) {
    data.holes[i] = {
      par: document.getElementById("par-" + i).value,
      distance: document.getElementById("holeDistance-" + i).value,
      shots: getShotsForHole(i),
      firstPuttDistance: document.getElementById("firstPuttDistance-" + i).value,
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
    const stored = data.setup.numberOfHoles;
    if (stored === "9" || stored === "18") {
      holeCount = Number(stored);
      buildHoles();
    }
    toggleSetupRows();
  }

  if (data.holes) {
    for (let i = 1; i <= holeCount; i++) {
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
  for (let i = 1; i <= holeCount; i++) {
    total += getShotsForHole(i).length;
  }
  return total;
}

function getHoleStats(i) {
  const par = Number(document.getElementById("par-" + i).value) || 0;
  const shots = getShotsForHole(i);
  const score = shots.length;
  let putts = 0;
  let chips = 0;
  let penalties = 0;
  let badShots = 0;
  let goodShots = 0;
  for (const s of shots) {
    if (s.club === "Putter") putts += 1;
    if (s.club === "Wedge") chips += 1;
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
  for (let i = 1; i <= holeCount; i++) {
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

  for (let i = 1; i <= holeCount; i++) {
    const s = getHoleStats(i);
    document.getElementById("holeScore-" + i).textContent = s.score;
    totalScore += s.score;
    totalPar += s.par;
    totalPutts += s.putts;
    totalChips += s.chips;
    totalPenalties += s.penalties;
    fairwaysHit += s.fwHit;
    fairwaysAnswered += s.fwAns;
    if (s.missedShort) missedShortPutts += 1;
  }

  const coursePar = getCoursePar();
  const parForDiff = coursePar > 0 ? coursePar : totalPar;
  const diff = totalScore - parForDiff;
  const diffText = diff > 0 ? "+" + diff : "" + diff;

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

  for (let i = 1; i <= holeCount; i++) {
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
  if (totalPenalties >= 3) mistakes.push("Too many penalties: " + totalPenalties + " strokes lost.");
  if (fairwayPct !== null && fairwayPct < 50) mistakes.push("Missed fairways: only " + fairwayPct + "% hit.");
  if (missedShortPutts >= 2) mistakes.push("Missed " + missedShortPutts + " short putts.");
  if (firstPuttShort >= 4) mistakes.push("First putts too short " + firstPuttShort + " times.");
  if (firstPuttLong >= 4) mistakes.push("First putts too long " + firstPuttLong + " times.");
  if (threePutts >= 3) mistakes.push("Too many 3-putts: " + threePutts + " holes.");
  if (badShots >= 5) mistakes.push("Many poor shots (" + badShots + " tops/duffs/slices/hooks).");

  const strengths = [];
  if (fairwayPct !== null && fairwayPct >= 70) strengths.push("Good fairway accuracy: " + fairwayPct + "%.");
  if (scoredHoles > 0 && totalPutts / scoredHoles < 2) strengths.push("Good putting: " + (totalPutts / scoredHoles).toFixed(1) + " putts per hole.");
  if (totalPenalties === 0 && scoredHoles >= Math.min(holeCount, 9)) strengths.push("Penalty-free round.");
  if (par3Count >= 2 && par3Score <= par3ParTotal + 1) strengths.push("Strong scoring on par 3s.");
  if (goodShots >= 8) strengths.push("Lots of good shots (" + goodShots + ").");

  const practice = [];
  if (missedShortPutts >= 2) practice.push("Short putting (3-5 foot putts)");
  if (fairwayPct !== null && fairwayPct < 50) practice.push("Tee shot accuracy");
  if (firstPuttShort >= 4 || firstPuttLong >= 4) practice.push("Lag putting (long putts)");
  if (totalPenalties >= 3) practice.push("Penalty-free course management");
  if (badShots >= 5) practice.push("Ball striking (clean contact)");

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

  renderList("mistakesList", mistakes, "No big mistakes yet - keep going!");
  renderList("practiceList", practice, "Play more rounds to find what to practise.");
  renderList("strengthsList", strengths, "Fill in more holes to see your strengths.");
  document.getElementById("topWeakness").textContent = topWeakness;

  renderHoleAnalyses();
  renderTrendChecks();
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
  let totalPutts = 0;
  let totalChips = 0;
  let totalPenalties = 0;
  let fairwaysHit = 0;
  let fairwaysAnswered = 0;
  let missedShortPutts = 0;
  let badShots = 0;

  for (let i = 1; i <= holeCount; i++) {
    const s = getHoleStats(i);
    totalScore += s.score;
    totalPutts += s.putts;
    totalChips += s.chips;
    totalPenalties += s.penalties;
    fairwaysHit += s.fwHit;
    fairwaysAnswered += s.fwAns;
    badShots += s.badShots;
    if (s.missedShort) missedShortPutts += 1;
  }

  const coursePar = getCoursePar();
  const fairwayPct = fairwaysAnswered > 0 ? Math.round((fairwaysHit / fairwaysAnswered) * 100) : null;

  const round = {
    playerName: document.getElementById("playerName").value || "Unknown",
    date: document.getElementById("roundDate").value || "",
    country: getCountry(),
    courseName: getCourseName() || "Unknown course",
    tee: document.getElementById("teeSelect").value || "",
    coursePar,
    totalScore,
    scoreVsPar: coursePar > 0 ? totalScore - coursePar : totalScore,
    totalPutts,
    totalChips,
    totalPenalties,
    fairwayPct,
    badShots,
    missedShortPutts,
    holes: holeCount,
    savedAt: new Date().toISOString(),
  };

  const history = JSON.parse(localStorage.getItem("roundHistory") || "[]");
  history.push(round);
  localStorage.setItem("roundHistory", JSON.stringify(history));
  renderHistory();
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
    const card = document.createElement("div");
    card.className = "round-card";
    const diffText = round.scoreVsPar > 0 ? "+" + round.scoreVsPar : "" + round.scoreVsPar;
    const lines = [
      "Player: " + round.playerName,
      "Date: " + (round.date || "—"),
      "Country: " + round.country,
      "Course: " + round.courseName + (round.tee ? " (" + round.tee + " tees)" : ""),
      "Course Par: " + round.coursePar,
      "Total Score: " + round.totalScore,
      "Score vs Par: " + diffText,
      "Total Putts: " + (round.totalPutts !== undefined ? round.totalPutts : "—"),
      "Total Chips: " + (round.totalChips !== undefined ? round.totalChips : "—"),
    ];
    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      card.appendChild(p);
    }
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
    if (f === "numberOfHoles") el.value = "18";
    else if (f === "playedIn") el.value = "India";
    else el.value = "";
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
  const courseKey = document.getElementById("courseSelect").value;
  if (courseKey === "Other" || COURSES[courseKey]) {
    updateCourseInfoFromInputs();
  }
}

function onSetupChange(event) {
  if (event.target.id === "numberOfHoles") {
    holeCount = Number(event.target.value);
    buildHoles();
    loadAll();
  }
  if (event.target.id === "playedIn") {
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
    handleChange();
  } else if (event.target.matches(".remove-shot-btn")) {
    const card = event.target.closest(".shot-card");
    const shotsList = card.parentElement;
    card.remove();
    renumberShots(shotsList);
    handleChange();
  }
}

setupContainer.addEventListener("change", onSetupChange);
setupContainer.addEventListener("input", handleChange);
holesContainer.addEventListener("input", handleChange);
holesContainer.addEventListener("change", handleChange);
holesContainer.addEventListener("click", onHolesClick);

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

buildHoles();
loadAll();
toggleSetupRows();
applyCourseData();
updateSummary();
analyze();
renderHistory();
