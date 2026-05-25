const holesContainer = document.getElementById("holes");
const setupContainer = document.querySelector(".setup");

const SETUP_FIELDS = [
  "playerName",
  "roundDate",
  "playedIn",
  "country",
  "courseName",
  "coursePar",
  "numberOfHoles",
];

let holeCount = 18;

function makeHoleCard(n) {
  return `
    <div class="hole-card">
      <h2>Hole ${n}</h2>

      <label>Par
        <input type="number" id="par-${n}" min="1" />
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
          <option value="Tee box">Tee box</option>
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

function toggleCountryRow() {
  const playedIn = document.getElementById("playedIn").value;
  document.getElementById("countryRow").style.display =
    playedIn === "Outside India" ? "" : "none";
}

function saveAll() {
  const data = { setup: {}, holes: {} };
  for (const f of SETUP_FIELDS) {
    data.setup[f] = document.getElementById(f).value;
  }
  for (let i = 1; i <= holeCount; i++) {
    data.holes[i] = {
      par: document.getElementById("par-" + i).value,
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
    toggleCountryRow();
  }

  if (data.holes) {
    for (let i = 1; i <= holeCount; i++) {
      const hole = data.holes[i];
      if (!hole) continue;

      const parEl = document.getElementById("par-" + i);
      if (parEl && hole.par !== undefined) parEl.value = hole.par;

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

function updateSummary() {
  let totalScore = 0;
  let totalPar = 0;
  let totalPutts = 0;
  let totalPenalties = 0;
  let fairwaysHit = 0;
  let fairwaysAnswered = 0;
  let missedShortPutts = 0;

  for (let i = 1; i <= holeCount; i++) {
    const par = Number(document.getElementById("par-" + i).value) || 0;
    const shots = getShotsForHole(i);
    const score = shots.length;

    document.getElementById("holeScore-" + i).textContent = score;

    totalScore += score;
    totalPar += par;

    for (const shot of shots) {
      if (shot.club === "Putter") totalPutts += 1;
      if (shot.result === "Penalty") totalPenalties += 1;
    }

    if (par >= 4 && shots.length > 0) {
      const first = shots[0];
      if (first.lie === "Tee box" && first.result) {
        if (first.result === "On fairway") fairwaysHit += 1;
        fairwaysAnswered += 1;
      }
    }

    const missed = document.getElementById("missedShortPutt-" + i).value;
    if (missed === "Yes") missedShortPutts += 1;
  }

  const coursePar = getCoursePar();
  const parForDiff = coursePar > 0 ? coursePar : totalPar;
  const diff = totalScore - parForDiff;
  const diffText = diff > 0 ? "+" + diff : "" + diff;

  let fairwayPct = 0;
  if (fairwaysAnswered > 0) {
    fairwayPct = Math.round((fairwaysHit / fairwaysAnswered) * 100);
  }

  document.getElementById("sumScore").textContent = "Total Score: " + totalScore;
  document.getElementById("sumDiff").textContent = "Score vs Par: " + diffText;
  document.getElementById("sumPutts").textContent = "Total Putts: " + totalPutts;
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

  const BAD_QUALITIES = ["Top", "Duff", "Slice", "Hook"];

  for (let i = 1; i <= holeCount; i++) {
    const par = Number(document.getElementById("par-" + i).value) || 0;
    const shots = getShotsForHole(i);
    const score = shots.length;

    if (score > 0) scoredHoles += 1;
    totalScore += score;

    let putts = 0;
    for (const shot of shots) {
      if (shot.club === "Putter") putts += 1;
      if (shot.result === "Penalty") totalPenalties += 1;
      if (BAD_QUALITIES.indexOf(shot.quality) !== -1) badShots += 1;
      if (shot.quality === "Good shot") goodShots += 1;
    }
    totalPutts += putts;
    if (putts >= 3) threePutts += 1;

    if (par >= 4 && shots.length > 0) {
      const first = shots[0];
      if (first.lie === "Tee box" && first.result) {
        if (first.result === "On fairway") fairwaysHit += 1;
        fairwaysAnswered += 1;
      }
    }

    const fpr = document.getElementById("firstPuttResult-" + i).value;
    if (fpr === "Short") firstPuttShort += 1;
    if (fpr === "Long") firstPuttLong += 1;

    const missed = document.getElementById("missedShortPutt-" + i).value;
    if (missed === "Yes") missedShortPutts += 1;

    if (par === 3 && score > 0) {
      par3Score += score;
      par3ParTotal += par;
      par3Count += 1;
    }
  }

  let fairwayPct = null;
  if (fairwaysAnswered > 0) {
    fairwayPct = Math.round((fairwaysHit / fairwaysAnswered) * 100);
  }

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
  if (scoredHoles > 0 && totalPutts / scoredHoles < 2) {
    strengths.push("Good putting: " + (totalPutts / scoredHoles).toFixed(1) + " putts per hole.");
  }
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
  if (badShots >= 5) weaknesses.push({ score: badShots * 10, text: "Your biggest weakness today was ball striking - " + badShots + " tops, duffs, slices, or hooks. Spend more time on the range working on clean contact." });

  let topWeakness;
  if (scoredHoles < 5) {
    topWeakness = "Fill in shots for at least 5 holes to get your coach feedback.";
  } else if (weaknesses.length === 0) {
    topWeakness = "No big weakness today - well played!";
  } else {
    weaknesses.sort(function (a, b) { return b.score - a.score; });
    topWeakness = weaknesses[0].text;
  }

  renderList("mistakesList", mistakes, "No big mistakes yet - keep going!");
  renderList("practiceList", practice, "Play more rounds to find what to practise.");
  renderList("strengthsList", strengths, "Fill in more holes to see your strengths.");
  document.getElementById("topWeakness").textContent = topWeakness;
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
  const round = {
    playerName: document.getElementById("playerName").value || "Unknown",
    date: document.getElementById("roundDate").value || "",
    country: getCountry(),
    courseName: document.getElementById("courseName").value || "Unknown course",
    coursePar: getCoursePar(),
    totalScore: getTotalScore(),
    holes: holeCount,
  };
  round.scoreVsPar = round.coursePar > 0 ? round.totalScore - round.coursePar : round.totalScore;

  const history = JSON.parse(localStorage.getItem("roundHistory") || "[]");
  history.push(round);
  localStorage.setItem("roundHistory", JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById("roundsList");
  list.innerHTML = "";
  const history = JSON.parse(localStorage.getItem("roundHistory") || "[]");

  if (history.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No rounds saved yet.";
    list.appendChild(p);
    return;
  }

  for (const round of history) {
    const card = document.createElement("div");
    card.className = "round-card";
    const diffText = round.scoreVsPar > 0 ? "+" + round.scoreVsPar : "" + round.scoreVsPar;
    const lines = [
      "Player: " + round.playerName,
      "Date: " + (round.date || "—"),
      "Country: " + round.country,
      "Course: " + round.courseName,
      "Course Par: " + round.coursePar,
      "Total Score: " + round.totalScore,
      "Score vs Par: " + diffText,
    ];
    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      card.appendChild(p);
    }
    list.appendChild(card);
  }
}

function clearCurrentRound() {
  for (const f of SETUP_FIELDS) {
    const el = document.getElementById(f);
    if (f === "numberOfHoles") el.value = "18";
    else if (f === "playedIn") el.value = "India";
    else el.value = "";
  }
  holeCount = 18;
  buildHoles();
  toggleCountryRow();
  localStorage.removeItem("golfRound");
  updateSummary();
  analyze();
}

function handleChange() {
  saveAll();
  updateSummary();
  analyze();
}

function onSetupChange(event) {
  if (event.target.id === "numberOfHoles") {
    holeCount = Number(event.target.value);
    buildHoles();
    loadAll();
  }
  if (event.target.id === "playedIn") {
    toggleCountryRow();
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

buildHoles();
loadAll();
updateSummary();
analyze();
renderHistory();
