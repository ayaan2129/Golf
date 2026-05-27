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

export function wireLoginUi(nav) {
  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", function () {
      const u = document.getElementById("usernameInput").value.trim().toLowerCase();
      const p = document.getElementById("passwordInput").value;
      const match = getAccounts().find(function (a) { return a.username === u && a.password === p; });
      if (match) {
        setCurrentUsername(match.username);
        document.getElementById("loginError").textContent = "";
        document.getElementById("passwordInput").value = "";
        if (nav.applyUrlActivationToCurrentUser) nav.applyUrlActivationToCurrentUser();
        nav.showWelcome();
      } else {
        document.getElementById("loginError").textContent = "Wrong username or password.";
      }
    });
  }

  const openSignupBtn = document.getElementById("openSignupBtn");
  if (openSignupBtn) {
    openSignupBtn.addEventListener("click", function (e) {
      e.preventDefault();
      const box = document.getElementById("signupBox");
      box.style.display = box.style.display === "none" ? "" : "none";
    });
  }

  const signupBtn = document.getElementById("signupBtn");
  if (signupBtn) {
    signupBtn.addEventListener("click", function () {
      const errEl = document.getElementById("signupError");
      errEl.textContent = "";
      const displayName = (document.getElementById("signupDisplayName").value || "").trim();
      const username = (document.getElementById("signupUsername").value || "").trim().toLowerCase();
      const password = document.getElementById("signupPassword").value;
      if (!displayName) { errEl.textContent = "Add your name."; return; }
      if (!/^[a-z0-9_.-]{2,20}$/.test(username)) { errEl.textContent = "Username: 2-20 chars, lowercase letters, digits, . _ -"; return; }
      if (!password || password.length < 4) { errEl.textContent = "Password must be at least 4 characters."; return; }
      const accounts = getAccounts();
      if (accounts.find(function (a) { return a.username === username; })) { errEl.textContent = "That username is taken."; return; }
      accounts.push({ username, password, displayName, createdAt: new Date().toISOString() });
      saveAccounts(accounts);
      setCurrentUsername(username);
      document.getElementById("signupBox").style.display = "none";
      document.getElementById("signupUsername").value = "";
      document.getElementById("signupPassword").value = "";
      document.getElementById("signupDisplayName").value = "";
      alert("Account created! Welcome, " + displayName + ". Next: set your birthday, handicap, bag, and yardages in Profile.");
      nav.showApp();
      nav.switchTab("profileTab");
      nav.syncDrawerActive("profileTab");
    });
  }
}
