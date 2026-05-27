// Multi-user localStorage namespace + accounts table.
// Side effect: importing this module sets up the namespace once.
// Every other getItem/setItem/removeItem call is auto-prefixed with
// "u_<currentUser>_" so accounts share the device but never each other's data.

(function setupStorageNamespace() {
  if (window.__storageNamespaceInstalled) return;
  window.__storageNamespaceInstalled = true;

  const CUR_KEY = "__currentUser";
  const ACC_KEY = "accounts";
  const SKIP = [CUR_KEY, ACC_KEY];
  const origGet = localStorage.getItem.bind(localStorage);
  const origSet = localStorage.setItem.bind(localStorage);
  const origRm = localStorage.removeItem.bind(localStorage);

  // One-time migration: if accounts doesn't exist, create the default Ayaan
  // account and move any existing unprefixed data into u_ayaan_*.
  if (!origGet(ACC_KEY)) {
    const initialAccount = {
      username: "ayaan",
      password: "Golf@123",
      displayName: "Ayaan",
      createdAt: new Date().toISOString(),
    };
    origSet(ACC_KEY, JSON.stringify([initialAccount]));
    const keysToMigrate = [
      "roundHistory", "playerProfile", "upcomingRounds", "practiceSessions",
      "selectedClubs", "customClubs", "currentHoleIndex", "roundMode",
      "defaultsDate", "defaultsTemp", "currentWeather",
      "grokApiKey", "aiMode", "demoSeeded", "golfRound", "weatherToday",
      "golfLoggedIn",
    ];
    for (const k of keysToMigrate) {
      const v = origGet(k);
      if (v !== null) {
        origSet("u_ayaan_" + k, v);
        origRm(k);
      }
    }
  }

  function prefix() {
    const u = origGet(CUR_KEY);
    return "u_" + (u || "_anon") + "_";
  }

  localStorage.getItem = function (k) {
    if (SKIP.indexOf(k) !== -1) return origGet(k);
    return origGet(prefix() + k);
  };
  localStorage.setItem = function (k, v) {
    if (SKIP.indexOf(k) !== -1) return origSet(k, v);
    return origSet(prefix() + k, v);
  };
  localStorage.removeItem = function (k) {
    if (SKIP.indexOf(k) !== -1) return origRm(k);
    return origRm(prefix() + k);
  };

  window.__unscoped = { get: origGet, set: origSet, remove: origRm };
})();

export function getAccounts() {
  const raw = window.__unscoped.get("accounts");
  try { return JSON.parse(raw || "[]"); } catch (e) { return []; }
}

export function saveAccounts(arr) {
  window.__unscoped.set("accounts", JSON.stringify(arr));
}

export function getCurrentUsername() {
  return window.__unscoped.get("__currentUser");
}

export function setCurrentUsername(u) {
  if (u === null) window.__unscoped.remove("__currentUser");
  else window.__unscoped.set("__currentUser", u);
}

export function currentAccount() {
  const u = getCurrentUsername();
  if (!u) return null;
  return getAccounts().find(function (a) { return a.username === u; }) || null;
}

export function isLoggedIn() {
  return !!getCurrentUsername();
}
