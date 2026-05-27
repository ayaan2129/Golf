// Round history + upcoming-round storage. All localStorage access goes through
// the namespaced patched API installed in src/core/storage.js, so each
// account's rounds stay isolated.

export function getHistory() {
  try { return JSON.parse(localStorage.getItem("roundHistory") || "[]"); }
  catch (e) { return []; }
}

export function saveHistory(arr) {
  localStorage.setItem("roundHistory", JSON.stringify(arr));
}

export function getUpcoming() {
  try { return JSON.parse(localStorage.getItem("upcomingRounds") || "[]"); }
  catch (e) { return []; }
}

export function saveUpcoming(arr) {
  localStorage.setItem("upcomingRounds", JSON.stringify(arr));
}
