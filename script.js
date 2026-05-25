const button = document.getElementById("calculate");

button.addEventListener("click", function () {
  const par = Number(document.getElementById("par").value);
  const score = Number(document.getElementById("score").value);
  const putts = Number(document.getElementById("putts").value);

  const shot1Distance = document.getElementById("shot1Distance").value;
  const shot1Direction = document.getElementById("shot1Direction").value;
  const fairwayHit = document.getElementById("fairwayHit").value;

  const chipDistance = document.getElementById("chipDistance").value;
  const chipResult = document.getElementById("chipResult").value;
  const penalties = document.getElementById("penalties").value;

  const firstPuttResult = document.getElementById("firstPuttResult").value;
  const missedShortPutt = document.getElementById("missedShortPutt").value;

  const diff = score - par;

  let resultName = "";
  if (diff === -1) {
    resultName = "Birdie";
  } else if (diff === 0) {
    resultName = "Par";
  } else if (diff === 1) {
    resultName = "Bogey";
  } else if (diff === 2) {
    resultName = "Double Bogey";
  } else {
    resultName = "Other";
  }

  document.getElementById("diff").textContent = "Score vs Par: " + diff;
  document.getElementById("name").textContent = "Result: " + resultName;
  document.getElementById("totalPutts").textContent = "Total Putts: " + putts;

  document.getElementById("teeShotInfo").textContent =
    "Tee Shot: " + shot1Distance + " yds, " + shot1Direction;
  document.getElementById("fairwayInfo").textContent =
    "Fairway Hit: " + fairwayHit;
  document.getElementById("chipInfo").textContent =
    "Chip: " + chipDistance + " yds (" + chipResult + ")";
  document.getElementById("penaltiesInfo").textContent =
    "Penalties: " + penalties;
  document.getElementById("puttInfo").textContent =
    "First Putt: " + firstPuttResult + " | Missed Short Putt: " + missedShortPutt;
});
