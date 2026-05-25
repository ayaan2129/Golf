const button = document.getElementById("calculate");

button.addEventListener("click", function () {
  const par = Number(document.getElementById("par").value);
  const score = Number(document.getElementById("score").value);
  const putts = Number(document.getElementById("putts").value);

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
});
