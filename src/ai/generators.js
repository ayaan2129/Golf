// AI-powered text generators. Each is a thin wrapper:
//  - reads relevant data via the data layer,
//  - builds a system + user prompt,
//  - calls Grok via callGrok,
//  - writes the reply into a known output element on the Stats card.
//
// generateHoleTip lives in the tracker screen (Phase 4) because it needs
// the in-round currentHoleIndex.

import { callGrok } from "./grok.js";
import { aiBaseContext, setAiOutput } from "./context.js";
import { getHistory, getUpcoming } from "../data/rounds.js";

export async function generateRoundReport() {
  const out = "aiRoundReport";
  setAiOutput(out, "Asking the coach...");
  const history = getHistory();
  if (history.length === 0) { setAiOutput(out, "Save a round first."); return; }
  const r = history[history.length - 1];
  const sys = "You are Coach. Speak directly to a 12-year-old budding pro golfer named Ayaan. Be specific, kind, and honest. 4-6 short paragraphs. No emojis.";
  const ctx = aiBaseContext();
  const detailed = JSON.stringify({
    course: r.courseName, tee: r.tee, date: r.date,
    score: r.totalScore, vsPar: r.scoreVsPar,
    putts: r.totalPutts, chips: r.totalChips, penalties: r.totalPenalties,
    fairwayPct: r.fairwayPct, girPct: r.girPct, scramblePct: r.scramblePct,
    mistakes: r.mistakes, strengths: r.strengths, blunders: r.blunders,
    weather: r.weatherData,
  });
  const userMsg = "Player context:\n" + ctx + "\n\nMost recent round JSON:\n" + detailed + "\n\nWrite a personal post-round report covering: what went well, the 1-2 critical mistakes with the exact hole numbers, and what to practise in the next 3 days. End with one motivational sentence tied to his dream of beating Rory.";
  try { setAiOutput(out, await callGrok(sys, userMsg)); }
  catch (e) { setAiOutput(out, "Error: " + e.message); }
}

export async function generatePracticePlan() {
  const out = "aiPracticePlan";
  setAiOutput(out, "Asking the coach...");
  const sys = "You are Coach. Build a 7-day practice plan for a budding 12-year-old golfer named Ayaan. Each day: one focus area + a specific drill + duration. Match his data. Be concrete. No emojis.";
  const ctx = aiBaseContext();
  const userMsg = "Player context:\n" + ctx + "\n\nReturn a Mon-Sun plan, one line per day in this format:\nMonday — focus — drill — minutes\nUse his actual weakest stats from above.";
  try { setAiOutput(out, await callGrok(sys, userMsg)); }
  catch (e) { setAiOutput(out, "Error: " + e.message); }
}

export async function generatePreRoundBrief() {
  const out = "aiPreRoundBrief";
  setAiOutput(out, "Asking the coach...");
  const sys = "You are Coach. Give a tight 5-bullet pre-round game plan for a 12-year-old budding pro golfer named Ayaan. Be specific. No emojis.";
  const ctx = aiBaseContext();
  let weather = null;
  try { weather = JSON.parse(localStorage.getItem("currentWeather") || "null"); } catch (e) {}
  const course = (document.getElementById("courseSelect") || {}).value || "RCGC";
  const tee = (document.getElementById("teeSelect") || {}).value || "";
  const userMsg = "Player context:\n" + ctx + "\n\nNext round: " + course + " " + tee + ". Weather: " + (weather ? Math.round(weather.tempMax || 0) + "C, wind " + Math.round(weather.windKmh || 0) + " kmh, " + (weather.condition || "?") : "unknown") + ".\n\nReturn 5 short bullets covering: (1) tee strategy today, (2) which club is hot, (3) what to avoid based on past mistakes, (4) putting focus, (5) one mental cue.";
  try { setAiOutput(out, await callGrok(sys, userMsg)); }
  catch (e) { setAiOutput(out, "Error: " + e.message); }
}

export async function generateTournamentBrief() {
  const out = "aiTournamentBrief";
  setAiOutput(out, "Asking the coach...");
  const upcoming = getUpcoming();
  const next = upcoming[0] || null;
  const sys = "You are Coach. Multi-day tournament prep plan for a 12-year-old. Specific, kind, honest. No emojis.";
  const ctx = aiBaseContext();
  const target = next ? "Next event: " + next.date + " at " + next.course + " " + (next.tee || "") + " (" + next.holes + " holes)" : "No upcoming round scheduled — assume RCGC Blue tees in 7 days.";
  const userMsg = "Player context:\n" + ctx + "\n\n" + target + "\n\nReturn a 5-day countdown plan (D-5 to D-day). For each day: focus area + drill + duration. Add a 'tournament day' bullet block: warm-up routine, scoring strategy, mental cue.";
  try { setAiOutput(out, await callGrok(sys, userMsg)); }
  catch (e) { setAiOutput(out, "Error: " + e.message); }
}

export async function generateGoalPlan() {
  const out = "aiGoalsOutput";
  setAiOutput(out, "Asking the coach...");
  const sys = "You are Coach. Set realistic but ambitious milestones for a 12-year-old budding pro. Reference his current data. No emojis.";
  const ctx = aiBaseContext();
  const userMsg = "Player context:\n" + ctx + "\n\nReturn 3 sections: 3-month goal (handicap + skill), 6-month goal, 1-year goal. Each section: target number + 2 key milestones to hit it. End with one sentence about how this lines up with his dream of becoming World No. 1.";
  try { setAiOutput(out, await callGrok(sys, userMsg)); }
  catch (e) { setAiOutput(out, "Error: " + e.message); }
}

export async function generateCourseStrategy() {
  const out = "aiCourseOutput";
  setAiOutput(out, "Asking the coach...");
  const counts = {};
  for (const r of getHistory()) {
    if (r.courseName) counts[r.courseName] = (counts[r.courseName] || 0) + 1;
  }
  const top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0] || "RCGC";
  const courseRounds = getHistory().filter(function (r) { return r.courseName === top; });
  const sys = "You are Coach. Build a hole-by-hole strategy for a junior. Reference his actual scoring patterns. No emojis.";
  const ctx = aiBaseContext();
  const summary = courseRounds.slice(-3).map(function (r) {
    if (r.fullData && r.fullData.holes) {
      const ss = [];
      for (const k in r.fullData.holes) {
        const h = r.fullData.holes[k];
        // getHoleStatsFromSavedHole still lives in script.js (legacy); guard.
        const st = (typeof window.getHoleStatsFromSavedHole === "function")
          ? window.getHoleStatsFromSavedHole(h)
          : { par: h.par, score: 0 };
        ss.push("h" + k + " par" + st.par + " score" + st.score);
      }
      return r.date + ": " + ss.join(", ");
    }
    return r.date + ": " + r.totalScore;
  }).join(" | ");
  const userMsg = "Player context:\n" + ctx + "\n\nCourse: " + top + ". Recent rounds there: " + (summary || "none") + ".\n\nReturn an 18-hole strategy: one short line per hole with tee club + key thing to avoid. Group as 'Front 9' and 'Back 9'.";
  try { setAiOutput(out, await callGrok(sys, userMsg)); }
  catch (e) { setAiOutput(out, "Error: " + e.message); }
}

export async function generateTodaysFocus() {
  const out = "aiFocusOutput";
  setAiOutput(out, "Asking the coach...");
  const sys = "You are Coach. One short paragraph (3-4 sentences) on what to focus on today. Warm tone. No emojis. Tie it to his dream of beating Rory.";
  const ctx = aiBaseContext();
  const userMsg = "Player context:\n" + ctx + "\n\nGive Ayaan today's focus.";
  try { setAiOutput(out, await callGrok(sys, userMsg)); }
  catch (e) { setAiOutput(out, "Error: " + e.message); }
}

// Vision: analyse a single swing frame (from video modal) or a stand-alone photo
export async function analyseSwingFrame(dataUrl, notes, outEl) {
  if (!outEl) return;
  outEl.textContent = "Analysing frame...";
  const sys = "You are a golf swing coach for a 12-year-old budding pro. From the video frame, give 3-5 specific observations on grip, posture, alignment, takeaway, top-of-backswing, or impact. Be honest, kind, specific. No emojis.";
  const messages = [{
    role: "user",
    content: [
      { type: "text", text: "Analyse this swing frame. " + (notes ? "Player note: " + notes : "") + "\nPlayer context:\n" + aiBaseContext() },
      { type: "image_url", image_url: { url: dataUrl } }
    ]
  }];
  try {
    const reply = await callGrok(sys, messages, { model: "grok-2-vision-1212" });
    outEl.textContent = reply;
  } catch (e) {
    outEl.textContent = "Error: " + (e.message || e);
  }
}

export async function analyzeSwingPhoto() {
  const out = "aiSwingOutput";
  setAiOutput(out, "Analysing swing...");
  const fileInput = document.getElementById("swingPhoto");
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    setAiOutput(out, "Pick an image first.");
    return;
  }
  const notes = (document.getElementById("swingNotes") || {}).value || "";
  const file = fileInput.files[0];
  const dataUrl = await new Promise(function (resolve, reject) {
    const r = new FileReader();
    r.onload = function () { resolve(r.result); };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const sys = "You are a golf swing coach for a 12-year-old budding pro. From the image, give 3-5 specific observations on grip, posture, alignment, takeaway, top-of-backswing, or impact. Be honest, kind, specific. No emojis.";
  const messages = [{
    role: "user",
    content: [
      { type: "text", text: "Analyse this swing. " + (notes ? "Player note: " + notes : "") + "\nPlayer context:\n" + aiBaseContext() },
      { type: "image_url", image_url: { url: dataUrl } }
    ]
  }];
  try {
    const reply = await callGrok(sys, messages, { model: "grok-2-vision-1212" });
    setAiOutput(out, reply);
  } catch (e) {
    setAiOutput(out, "Error: " + e.message);
  }
}
