const holesContainer = document.getElementById("holes");

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

holesContainer.addEventListener("input", updateSummary);
holesContainer.addEventListener("change", updateSummary);

updateSummary();
