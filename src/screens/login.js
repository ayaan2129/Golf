// Login + signup screen wiring.
//
// Navigation helpers (showWelcome, showApp, switchTab, syncDrawerActive,
// applyUrlActivationToCurrentUser) still live in script.js and are injected
// at boot via wireLoginUi(nav). When the nav helpers themselves get
// extracted (Phase 4f+), the import will move here.

import {
  getAccounts,
  saveAccounts,
  setCurrentUsername,
} from "../core/storage.js";

function showLoginError(msg) {
  const el = document.getElementById("loginError");
  if (!el) return;
  if (msg) { el.textContent = msg; el.style.display = ""; }
  else { el.textContent = ""; el.style.display = "none"; }
}
function showSignupError(msg) {
  const el = document.getElementById("signupError");
  if (!el) return;
  if (msg) { el.textContent = msg; el.style.display = ""; }
  else { el.textContent = ""; el.style.display = "none"; }
}

function doLogin(nav) {
  const u = document.getElementById("usernameInput").value.trim().toLowerCase();
  const p = document.getElementById("passwordInput").value;
  const match = getAccounts().find(function (a) { return a.username === u && a.password === p; });
  if (match) {
    setCurrentUsername(match.username);
    showLoginError(null);
    document.getElementById("passwordInput").value = "";
    if (nav.applyUrlActivationToCurrentUser) nav.applyUrlActivationToCurrentUser();
    nav.showWelcome();
  } else {
    showLoginError("Wrong username or password.");
  }
}

export function wireLoginUi(nav) {
  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) loginBtn.addEventListener("click", function () { doLogin(nav); });

  // Enter key on login fields submits
  ["usernameInput", "passwordInput"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(nav); });
  });

  const openSignupBtn = document.getElementById("openSignupBtn");
  if (openSignupBtn) {
    openSignupBtn.addEventListener("click", function (e) {
      e.preventDefault();
      const box = document.getElementById("signupBox");
      const isHidden = box.style.display === "none" || box.style.display === "";
      box.style.display = isHidden ? "" : "none";
      if (isHidden) {
        // Wait for display to apply, then scroll into view
        setTimeout(function () {
          box.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 50);
      }
    });
  }

  const signupBtn = document.getElementById("signupBtn");
  if (signupBtn) {
    signupBtn.addEventListener("click", function () {
      showSignupError(null);
      const displayName = (document.getElementById("signupDisplayName").value || "").trim();
      const username = (document.getElementById("signupUsername").value || "").trim().toLowerCase();
      const password = document.getElementById("signupPassword").value;
      if (!displayName) { showSignupError("Add your name."); return; }
      if (!/^[a-z0-9_.-]{2,20}$/.test(username)) { showSignupError("Username: 2–20 chars, lowercase, no spaces."); return; }
      if (!password || password.length < 4) { showSignupError("Password must be at least 4 characters."); return; }
      const accounts = getAccounts();
      if (accounts.find(function (a) { return a.username === username; })) { showSignupError("That username is already taken."); return; }
      accounts.push({ username, password, displayName, createdAt: new Date().toISOString() });
      saveAccounts(accounts);
      setCurrentUsername(username);
      document.getElementById("signupBox").style.display = "none";
      document.getElementById("signupUsername").value = "";
      document.getElementById("signupPassword").value = "";
      document.getElementById("signupDisplayName").value = "";
      nav.showApp();
      nav.switchTab("profileTab");
      nav.syncDrawerActive("profileTab");
    });

    // Enter key on last signup field submits
    const signupPassword = document.getElementById("signupPassword");
    if (signupPassword) signupPassword.addEventListener("keydown", function (e) { if (e.key === "Enter") signupBtn.click(); });
  }
}
