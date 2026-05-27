// Coach chat screen: launcher card + chat panel with rule-based replies
// (fallback) and Grok-powered replies (when an AI key is configured).
// Quick-reply chips on the launcher open the panel and fire that question.

import { getHistory } from "../data/rounds.js";
import { aiEnabled, callGrok } from "../ai/grok.js";
import { aiBaseContext } from "../ai/context.js";

const chatHistory = [];

function topKeys(counts, n) {
  return Object.keys(counts)
    .sort(function (a, b) { return counts[b] - counts[a]; })
    .slice(0, n);
}

function addChatMessage(text, role) {
  const wrap = document.getElementById("chatMessages");
  if (!wrap) return;
  const msg = document.createElement("div");
  msg.className = "chat-msg chat-msg-" + role;
  msg.textContent = text;
  wrap.appendChild(msg);
  wrap.scrollTop = wrap.scrollHeight;
}

// Rule-based replies — used as a fallback whenever AI mode is off or the
// Grok call errors. The big if/else ladder pulls from saved-round history.
function coachAnswerFor(question) {
  const q = (question || "").toLowerCase();
  const history = getHistory();
  const recent = history.slice(-5);

  function avg(arr, key) {
    const v = arr.filter(function (r) { return typeof r[key] === "number" && !isNaN(r[key]); });
    if (v.length === 0) return null;
    return v.reduce(function (s, r) { return s + r[key]; }, 0) / v.length;
  }

  if (history.length === 0) {
    return "Save a few rounds first and I'll have real data to talk about. Try to log your next round!";
  }
  if (q.indexOf("hello") !== -1 || q.indexOf("hi ") !== -1 || q === "hi") {
    return "Hey! I'm your golf coach. Ask me about your putting, driving, chipping, weaknesses, strengths, tournaments, or how to improve.";
  }
  if (q.indexOf("putt") !== -1 || q.indexOf("putting") !== -1) {
    const avgPutts = avg(recent, "totalPutts");
    const missed = recent.reduce(function (s, r) { return s + (r.missedShortPutts || 0); }, 0);
    const lines = [];
    if (avgPutts !== null) lines.push("Your average over your last " + recent.length + " rounds is " + avgPutts.toFixed(1) + " putts.");
    if (missed > 0) lines.push("You've missed " + missed + " short putts recently. Drill: 5 balls 3 feet from the hole, don't stop until all 5 go in.");
    else lines.push("Short putts have been solid - keep that confidence.");
    if (avgPutts !== null && avgPutts > 34) lines.push("Lots of putts means 3-putts. Practice lag putting from 30 feet to a coin.");
    return lines.join(" ");
  }
  if (q.indexOf("drive") !== -1 || q.indexOf("driving") !== -1 || q.indexOf("fairway") !== -1 || q.indexOf("tee shot") !== -1) {
    const avgFw = avg(recent, "fairwayPct");
    if (avgFw === null) return "Track your tee shots a few more rounds and I'll tell you your fairway accuracy.";
    if (avgFw >= 70) return "Driving is a strength - " + Math.round(avgFw) + "% fairways. Keep aiming at a target on every tee.";
    if (avgFw >= 50) return "Fairway accuracy is OK at " + Math.round(avgFw) + "%. Pick the safest line and use a club you trust off the tee.";
    return "Fairway hit rate is " + Math.round(avgFw) + "% - that's a weak area. Use a shorter club off the tee and aim 10 yards inside trouble.";
  }
  if (q.indexOf("chip") !== -1) {
    const avgChips = avg(recent, "totalChips");
    if (avgChips === null || avgChips === 0) return "Track your chips (Wedge shots) and I'll have feedback.";
    return "You're averaging " + avgChips.toFixed(1) + " chips per round. Practice 20 chips a day from 10-30 yards to lower this.";
  }
  if (q.indexOf("weakness") !== -1 || q.indexOf("weak") !== -1) {
    if (recent[recent.length - 1] && recent[recent.length - 1].topWeakness) return recent[recent.length - 1].topWeakness;
    return "Play and save a round - the coach picks your biggest weakness automatically.";
  }
  if (q.indexOf("strength") !== -1 || q.indexOf("good at") !== -1 || q.indexOf("best") !== -1) {
    const counts = {};
    for (const r of recent) for (const s of (r.strengths || [])) counts[s] = (counts[s] || 0) + 1;
    const top = topKeys(counts, 2);
    if (top.length === 0) return "Keep playing - you'll show strengths once you save more rounds.";
    return "Your strengths recently: " + top.join(" and ") + ". Keep doing that.";
  }
  if (q.indexOf("practice") !== -1 || q.indexOf("practise") !== -1 || q.indexOf("improve") !== -1 || q.indexOf("drill") !== -1) {
    const counts = {};
    for (const r of recent) for (const p of (r.practice || [])) counts[p] = (counts[p] || 0) + 1;
    const top = topKeys(counts, 3);
    if (top.length === 0) return "Daily: 10 short putts, 20 chips from 15 yards, 10 smooth full swings. That's a solid foundation.";
    return "Top things to practice: " + top.join("; ") + ".";
  }
  if (q.indexOf("tournament") !== -1 || q.indexOf("tour") !== -1) {
    const tournaments = history.filter(function (r) { return r.gameType === "Tournament"; });
    if (tournaments.length === 0) return "You haven't logged any tournament rounds yet. Add one to track tournament stats.";
    const scores = tournaments.map(function (r) { return r.totalScore; }).filter(function (s) { return s > 0; });
    if (scores.length === 0) return "Tournament rounds saved but no scores yet.";
    const best = Math.min.apply(null, scores);
    return "Tournament rounds: " + tournaments.length + ". Best score: " + best + ". Stay patient under pressure - one shot at a time.";
  }
  if (q.indexOf("rcgc") !== -1) {
    const rcgc = history.filter(function (r) { return r.courseName === "RCGC"; });
    if (rcgc.length === 0) return "No RCGC rounds saved yet. Once you play there I'll have RCGC-specific tips.";
    const scores = rcgc.map(function (r) { return r.totalScore; }).filter(function (s) { return s > 0; });
    const best = scores.length > 0 ? Math.min.apply(null, scores) : "—";
    const counts = {};
    for (const r of rcgc) for (const m of (r.mistakes || [])) counts[m] = (counts[m] || 0) + 1;
    const top = topKeys(counts, 2);
    let msg = "RCGC rounds: " + rcgc.length + ". Best score: " + best + ".";
    if (top.length > 0) msg += " Common RCGC mistakes: " + top.join("; ") + ".";
    return msg;
  }
  if (q.indexOf("score") !== -1 || q.indexOf("scoring") !== -1) {
    const scores = recent.map(function (r) { return r.totalScore; }).filter(function (s) { return s > 0; });
    if (scores.length === 0) return "No scored rounds yet - let's get one logged.";
    const a = (scores.reduce(function (s, v) { return s + v; }, 0) / scores.length).toFixed(1);
    const best = Math.min.apply(null, scores);
    const worst = Math.max.apply(null, scores);
    return "Last " + scores.length + " rounds: avg " + a + ", best " + best + ", worst " + worst + ".";
  }
  if (q.indexOf("improv") !== -1 || q.indexOf("getting better") !== -1) {
    const scoresAll = history.map(function (r) { return r.totalScore; }).filter(function (s) { return s > 0; });
    if (scoresAll.length < 2) return "Save at least 2 rounds and I'll tell you the trend.";
    const first = scoresAll[0];
    const last = scoresAll[scoresAll.length - 1];
    const diff = last - first;
    if (diff < -1) return "Yes - your scores are dropping. First saved: " + first + ", latest: " + last + ". Keep grinding.";
    if (diff > 1) return "Scores have gone up by " + diff + " strokes. Focus on your top weakness this week.";
    return "Scores are about the same. Lock in your basics and your average will come down.";
  }
  if (q.indexOf("goal") !== -1 || q.indexOf("tee") !== -1) {
    // suggestTeeProgression lives in legacy script.js; bridged via window.
    const fn = typeof window.suggestTeeProgression === "function" ? window.suggestTeeProgression : null;
    if (!fn) return "Set a tee in Round Setup to start tracking tee-progression goals.";
    const g = fn();
    let msg = "Current tee: " + (g.currentTee || "not set") + ". Goal: " + g.goalText + ".";
    if (g.progress) msg += " " + g.progress + ".";
    if (g.suggestion) msg += " " + g.suggestion;
    return msg;
  }
  if (q.indexOf("ready") !== -1 || q.indexOf("next round") !== -1 || q.indexOf("today") !== -1) {
    const lastMistake = recent[recent.length - 1] && recent[recent.length - 1].mistakes && recent[recent.length - 1].mistakes[0];
    if (lastMistake) return "Today, focus on this: " + lastMistake + ". Warm up with putts and chips, drink water, take it shot by shot.";
    return "Warm up with putts and chips, drink water, pick a target every shot, and don't hurry.";
  }
  if (q.indexOf("rory") !== -1 || q.indexOf("mcilroy") !== -1 || q.indexOf("dream") !== -1 || q.indexOf("pro") !== -1) {
    return "Pros built their game one round at a time. Track everything, fix one weakness at a time, and you keep moving toward World No. 1.";
  }
  if (q.indexOf("swing") !== -1) return "Keep a steady head. Finish your shoulder turn. Accelerate THROUGH the ball, not at it. Practice slow tempo half-swings until contact is clean every time.";
  if (q.indexOf("grip") !== -1) return "Both palms facing each other. The V's from thumb and index finger point at your right shoulder (right-handed). Grip pressure light - like holding a tube of toothpaste.";
  if (q.indexOf("stance") !== -1 || q.indexOf("posture") !== -1 || q.indexOf("setup") !== -1) return "Feet shoulder-width apart, knees slightly bent, tilt from the hips not the waist, weight on the balls of the feet. Stay athletic and balanced.";
  if (q.indexOf("nervous") !== -1 || q.indexOf("anxiety") !== -1 || q.indexOf("scared") !== -1 || q.indexOf("pressure") !== -1 || q.indexOf("fear") !== -1) return "Take 3 deep breaths before any tough shot. Pick a small target. Make one smooth practice swing first. The shot is just a shot - your worth doesn't depend on it.";
  if (q.indexOf("mental") !== -1 || q.indexOf("confidence") !== -1 || q.indexOf("mindset") !== -1) return "After a bad shot: feel it for 10 seconds, then let it go. Picture your best shot before every swing. Never play your next shot angry.";
  if (q.indexOf("slice") !== -1) return "Slice fix: check your grip first (turn left hand slightly to the right). Feel your right shoulder go DOWN and TOWARD the target after impact. Swing more in-to-out.";
  if (q.indexOf("hook") !== -1) return "Hook fix: weaken your grip (turn left hand slightly left). Don't let shoulders open too fast. Feel a more out-to-in swing path with a held-off finish.";
  if (q.indexOf("top") !== -1 || q.indexOf("duff") !== -1 || q.indexOf("fat") !== -1 || q.indexOf("thin") !== -1 || q.indexOf("strike") !== -1 || q.indexOf("contact") !== -1) return "Mishits usually mean you lifted up or scooped. Keep your spine angle through impact. With irons hit DOWN through the ball - trust the loft.";
  if (q.indexOf("bunker") !== -1 || q.indexOf("sand") !== -1) return "Open your stance and clubface. Aim 1-2 inches behind the ball and SPLASH the sand. Don't decelerate - swing through.";
  if (q.indexOf("rain") !== -1 || q.indexOf("wind") !== -1 || q.indexOf("weather") !== -1) return "Wind/rain: take more club, swing easier, keep the ball flight low. Wider stance for balance. Stay patient - everyone's playing the same conditions.";
  if (q.indexOf("warm up") !== -1 || q.indexOf("warmup") !== -1) return "Warm-up: 5 minutes stretch, 5 short putts, 10 chips, 10 short iron half-swings, then a few full swings. Don't skip the short game - it sets your feel.";
  if (q.indexOf("fitness") !== -1 || q.indexOf("workout") !== -1 || q.indexOf("strength") !== -1) return "Junior golf fitness: rotation drills, core planks, single-leg balance, light medicine ball throws. Flexibility matters more than heavy weights.";
  return "Hmm, tell me a bit more or ask in different words. I can help with: swing, grip, stance, slice, hook, mishits, mental game, pressure, bunkers, weather, warm-up, putting, driving, chipping, weakness, strengths, practice, tournaments, RCGC, scoring, improvement, and pre-round advice.";
}

async function sendChatMessage(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return;
  addChatMessage(trimmed, "user");
  chatHistory.push({ role: "user", content: trimmed });
  if (aiEnabled()) {
    addChatMessage("Coach is thinking...", "coach");
    const thinkingEl = document.getElementById("chatMessages").lastChild;
    try {
      const sys = "You are Coach, a warm and direct coach for a 12-year-old budding pro golfer named Ayaan in Kolkata. His dream is to be World No. 1 and beat Rory McIlroy. Speak in simple, specific words. Reply in 2-4 short sentences for most questions. No emojis. If a question needs his data, use the context below.\n\n" + aiBaseContext();
      const messages = chatHistory.slice(-10);
      const reply = await callGrok(sys, messages);
      chatHistory.push({ role: "assistant", content: reply });
      if (thinkingEl) thinkingEl.remove();
      addChatMessage(reply, "coach");
    } catch (e) {
      if (thinkingEl) thinkingEl.remove();
      addChatMessage("AI error: " + e.message + " (falling back to rule-based)", "coach");
      const fallback = coachAnswerFor(trimmed);
      addChatMessage(fallback, "coach");
    }
  } else {
    const reply = coachAnswerFor(trimmed);
    chatHistory.push({ role: "assistant", content: reply });
    setTimeout(function () { addChatMessage(reply, "coach"); }, 250);
  }
}

export function openChatPanel() {
  const launcher = document.getElementById("chatLauncher");
  const panel = document.getElementById("chatPanel");
  if (launcher) launcher.style.display = "none";
  if (panel) panel.style.display = "";
  const msgs = document.getElementById("chatMessages");
  if (msgs && msgs.children.length === 0) addInitialChatGreeting();
}

export function closeChatPanel() {
  const launcher = document.getElementById("chatLauncher");
  const panel = document.getElementById("chatPanel");
  if (panel) panel.style.display = "none";
  if (launcher) launcher.style.display = "";
}

function addInitialChatGreeting() {
  addChatMessage("Hi! I'm your coach. Ask me anything about your golf game — or tap a question on the previous screen.", "coach");
}

export function wireCoachUi() {
  const sendBtn = document.getElementById("sendBtn");
  const input = document.getElementById("chatInput");
  if (!sendBtn || !input) return;
  sendBtn.addEventListener("click", function () {
    sendChatMessage(input.value);
    input.value = "";
  });
  input.addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      sendChatMessage(input.value);
      input.value = "";
    }
  });
  document.querySelectorAll(".quick-reply").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openChatPanel();
      sendChatMessage(btn.dataset.q);
    });
  });

  const startChatBtn = document.getElementById("startChatBtn");
  if (startChatBtn) startChatBtn.addEventListener("click", function () {
    openChatPanel();
    setTimeout(function () { const el = document.getElementById("chatInput"); if (el) el.focus(); }, 100);
  });
  const closeChatBtn = document.getElementById("closeChatBtn");
  if (closeChatBtn) closeChatBtn.addEventListener("click", closeChatPanel);
  const clearChatBtn = document.getElementById("clearChatBtn");
  if (clearChatBtn) clearChatBtn.addEventListener("click", function () {
    const m = document.getElementById("chatMessages");
    if (m) m.innerHTML = "";
    chatHistory.length = 0;
    addInitialChatGreeting();
  });
}
