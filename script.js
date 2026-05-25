const holesContainer = document.getElementById("holes");

const FIELDS = [
  "par",
  "score",
  "putts",
  "shot1Distance",
  "shot1Direction",
  "fairwayHit",
  "chipDistance",
  "chipResult",
  "penalties",
  "firstPuttResult",
  "missedShortPutt",
];

function makeHoleCard(n) {
  return `
    <div class="hole-card">
      <h2>Hole ${n}</h2>

      <label>Par
        <input type="number" id="par-${n}" min="1" />
      </label>

      <label>Score
        <input type="number" id="score-${n}" min="1" />
      </label>

      <label>Putts
        <input type="number" id="putts-${n}" min="0" />
      </label>

      <h3>Tee Shot</h3>

      <label>Shot 1 Distance (yards)
        <input type="number" id="shot1Distance-${n}" min="0" />
      </label>

      <label>Shot 1 Direction
        <select id="shot1Direction-${n}">
          <option value="">-- choose --</option>
          <option value="Left">Left</option>
          <option value="Straight">Straight</option>
          <option value="Right">Right</option>
        </select>
      </label>

      <label>Fairway Hit?
        <select id="fairwayHit-${n}">
          <option value="">-- choose --</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
      </label>

      <h3>Short Game</h3>

      <label>Chip Distance (yards)
        <input type="number" id="chipDistance-${n}" min="0" />
      </label>

      <label>Chip Result
        <select id="chipResult-${n}">
          <option value="">-- choose --</option>
          <option value="Near">Near</option>
          <option value="Medium">Medium</option>
          <option value="Far">Far</option>
        </select>
      </label>

      <label>Penalties
        <input type="number" id="penalties-${n}" min="0" />
      </label>

      <h3>Putting</h3>

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

for (let i = 1; i <= 18; i++) {
  holesContainer.insertAdjacentHTML("beforeend", makeHoleCard(i));
}

function saveAll() {
  const data = {};
  for (let i = 1; i <= 18; i++) {
    for (const field of FIELDS) {
      const key = field + "-" + i;
      data[key] = document.getElementById(key).value;
    }
  }
  localStorage.setItem("golfRound", JSON.stringify(data));
}

function loadAll() {
  const raw = localStorage.getItem("golfRound");
  if (!raw) return;
  const data = JSON.parse(raw);
  for (const key in data) {
    const el = document.getElementById(key);
    if (el) el.value = data[key];
  }
}

function updateSummary() {
  let totalScore = 0;
  let totalPar = 0;
  let totalPutts = 0;
  let totalPenalties = 0;
  let fairwaysHit = 0;
  let fairwaysAnswered = 0;
  let missedShortPutts = 0;

  for (let i = 1; i <= 18; i++) {
    const par = Number(document.getElementById("par-" + i).value) || 0;
    const score = Number(document.getElementById("score-" + i).value) || 0;
    const putts = Number(document.getElementById("putts-" + i).value) || 0;
    const penalties = Number(document.getElementById("penalties-" + i).value) || 0;
    const fairway = document.getElementById("fairwayHit-" + i).value;
    const missed = document.getElementById("missedShortPutt-" + i).value;

    totalScore += score;
    totalPar += par;
    totalPutts += putts;
    totalPenalties += penalties;

    if (fairway === "Yes") {
      fairwaysHit += 1;
      fairwaysAnswered += 1;
    } else if (fairway === "No") {
      fairwaysAnswered += 1;
    }

    if (missed === "Yes") {
      missedShortPutts += 1;
    }
  }

  const diff = totalScore - totalPar;
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
  let totalPar = 0;
  let totalPutts = 0;
  let totalPenalties = 0;
  let fairwaysHit = 0;
  let fairwaysAnswered = 0;
  let missedShortPutts = 0;
  let firstPuttShort = 0;
  let firstPuttLong = 0;
  let chipsNear = 0;
  let chipsFar = 0;
  let chipsAnswered = 0;
  let threePutts = 0;
  let par3Score = 0;
  let par3ParTotal = 0;
  let par3Count = 0;
  let scoredHoles = 0;

  for (let i = 1; i <= 18; i++) {
    const par = Number(document.getElementById("par-" + i).value) || 0;
    const score = Number(document.getElementById("score-" + i).value) || 0;
    const putts = Number(document.getElementById("putts-" + i).value) || 0;
    const penalties = Number(document.getElementById("penalties-" + i).value) || 0;
    const fairway = document.getElementById("fairwayHit-" + i).value;
    const missed = document.getElementById("missedShortPutt-" + i).value;
    const firstPutt = document.getElementById("firstPuttResult-" + i).value;
    const chip = document.getElementById("chipResult-" + i).value;

    if (score > 0) scoredHoles += 1;

    totalScore += score;
    totalPar += par;
    totalPutts += putts;
    totalPenalties += penalties;

    if (fairway === "Yes") {
      fairwaysHit += 1;
      fairwaysAnswered += 1;
    } else if (fairway === "No") {
      fairwaysAnswered += 1;
    }

    if (missed === "Yes") missedShortPutts += 1;
    if (firstPutt === "Short") firstPuttShort += 1;
    if (firstPutt === "Long") firstPuttLong += 1;

    if (chip === "Near") {
      chipsNear += 1;
      chipsAnswered += 1;
    } else if (chip === "Far") {
      chipsFar += 1;
      chipsAnswered += 1;
    } else if (chip === "Medium") {
      chipsAnswered += 1;
    }

    if (putts >= 3) threePutts += 1;

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
  if (totalPenalties >= 3) {
    mistakes.push("Too many penalties: " + totalPenalties + " strokes lost.");
  }
  if (fairwayPct !== null && fairwayPct < 50) {
    mistakes.push("Missed fairways: only " + fairwayPct + "% hit.");
  }
  if (missedShortPutts >= 2) {
    mistakes.push("Missed " + missedShortPutts + " short putts.");
  }
  if (firstPuttShort >= 4) {
    mistakes.push("First putts too short " + firstPuttShort + " times.");
  }
  if (firstPuttLong >= 4) {
    mistakes.push("First putts too long " + firstPuttLong + " times.");
  }
  if (chipsFar >= 3) {
    mistakes.push("Chips finishing far from the hole (" + chipsFar + " times).");
  }
  if (threePutts >= 3) {
    mistakes.push("Too many 3-putts: " + threePutts + " holes.");
  }

  const strengths = [];
  if (fairwayPct !== null && fairwayPct >= 70) {
    strengths.push("Good fairway accuracy: " + fairwayPct + "%.");
  }
  if (chipsAnswered > 0 && chipsNear / chipsAnswered >= 0.6) {
    strengths.push("Good chip results: " + chipsNear + " near the hole.");
  }
  if (scoredHoles > 0 && totalPutts / scoredHoles < 2) {
    const avg = (totalPutts / scoredHoles).toFixed(1);
    strengths.push("Good putting: " + avg + " putts per hole.");
  }
  if (totalPenalties === 0 && scoredHoles >= 9) {
    strengths.push("Penalty-free round.");
  }
  if (par3Count >= 2 && par3Score <= par3ParTotal + 1) {
    strengths.push("Strong scoring on par 3s.");
  }

  const practice = [];
  if (missedShortPutts >= 2) practice.push("Short putting (3-5 foot putts)");
  if (chipsFar >= 3) practice.push("Chipping 10-30 yards");
  if (fairwayPct !== null && fairwayPct < 50) practice.push("Tee shot accuracy");
  if (firstPuttShort >= 4 || firstPuttLong >= 4) practice.push("Lag putting (long putts)");
  if (totalPenalties >= 3) practice.push("Penalty-free course management");

  const weaknesses = [];
  if (missedShortPutts >= 2) {
    weaknesses.push({
      score: missedShortPutts * 20,
      text:
        "Your biggest weakness today was putting because you had " +
        totalPutts +
        " putts and missed " +
        missedShortPutts +
        " short putts. Practise 3-5 foot putts first.",
    });
  }
  if (threePutts >= 3) {
    weaknesses.push({
      score: threePutts * 18,
      text:
        "Your biggest weakness today was 3-putting because you had " +
        threePutts +
        " three-putts. Practise lag putting from 30+ feet.",
    });
  }
  if (totalPenalties >= 3) {
    weaknesses.push({
      score: totalPenalties * 15,
      text:
        "Your biggest weakness today was penalties because you lost " +
        totalPenalties +
        " strokes. Play safer off the tee.",
    });
  }
  if (fairwayPct !== null && fairwayPct < 50) {
    weaknesses.push({
      score: 50 - fairwayPct,
      text:
        "Your biggest weakness today was driving accuracy because you only hit " +
        fairwayPct +
        "% of fairways. Practise tee shots with a target.",
    });
  }
  if (chipsFar >= 3) {
    weaknesses.push({
      score: chipsFar * 12,
      text:
        "Your biggest weakness today was chipping because " +
        chipsFar +
        " chips finished far from the hole. Practise chips from 10-30 yards.",
    });
  }

  let topWeakness;
  if (scoredHoles < 5) {
    topWeakness = "Fill in at least 5 holes to get your coach feedback.";
  } else if (weaknesses.length === 0) {
    topWeakness = "No big weakness today - well played!";
  } else {
    weaknesses.sort(function (a, b) {
      return b.score - a.score;
    });
    topWeakness = weaknesses[0].text;
  }

  renderList("mistakesList", mistakes, "No big mistakes yet - keep going!");
  renderList("practiceList", practice, "Play more rounds to find what to practise.");
  renderList(
    "strengthsList",
    strengths,
    "Fill in more holes to see your strengths."
  );
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

function handleChange() {
  saveAll();
  updateSummary();
  analyze();
}

holesContainer.addEventListener("input", handleChange);
holesContainer.addEventListener("change", handleChange);

document.getElementById("resetBtn").addEventListener("click", function () {
  if (confirm("Start a new round? This will clear all holes.")) {
    localStorage.removeItem("golfRound");
    for (let i = 1; i <= 18; i++) {
      for (const field of FIELDS) {
        document.getElementById(field + "-" + i).value = "";
      }
    }
    updateSummary();
    analyze();
  }
});

loadAll();
updateSummary();
analyze();
