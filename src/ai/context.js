// Builds the AI base context string fed to every Grok call. Pulls from
// the data layer (profile, rounds, practice insights) plus the static
// course database, and reads the current course selection from the DOM.

import { calcAge } from "../core/utils.js";
import { COURSES } from "../core/courses.js";
import { getCurrentUsername } from "../core/storage.js";
import { getProfile, getSelectedClubs } from "../data/profile.js";
import {
  getHistory, getStrokesGainedLite, getConfidenceClub, getTopAvoid,
  getScoringZone, getApproachProximity, getPracticeTransfer,
} from "../data/rounds.js";
import { aggregateSG, getTrends, getScoringResponse } from "../data/strokes-gained.js";
import {
  getPractice,
  getPuttingInsights,
  getChippingInsights,
  getIronInsights,
  getDriverInsights,
  getPracticeActivity,
} from "../data/practice.js";

export function aiBaseContext() {
  const profile = getProfile();
  const history = getHistory();
  const last5 = history.slice(-5).reverse();
  const age = calcAge(profile.birthday) || 12;
  const hc = profile.handicap != null ? profile.handicap : "unknown";
  const bag = getSelectedClubs().join(", ");
  const clubDist = profile.clubDistances || {};

  const playerName = profile.displayName || getCurrentUsername() || "Ayaan";
  const dream = profile.bigGoal || "become World No. 1, beat Rory McIlroy";
  const courseKey = ((document.getElementById("courseSelect") || {}).value) || "RCGC";
  const course = COURSES[courseKey];
  const lines = [];
  lines.push("Player: " + playerName + ", age " + age + ", based in Kolkata India.");
  lines.push("Dream: " + dream + ". Junior aspiring pro.");
  lines.push("Handicap: " + hc + ".");
  if (course) {
    let locLine = "Home course: " + (course.name || courseKey);
    if (course.location) locLine += " (lat " + course.location.lat + ", lon " + course.location.lon + ")";
    if (course.greenSpeed) locLine += ", typical greens " + course.greenSpeed;
    lines.push(locLine + ".");
    const greensToday = localStorage.getItem("greenSpeedToday");
    if (greensToday) lines.push("Greens today: " + greensToday + ".");
    if (course.notes) lines.push("Course notes: " + course.notes);
  }
  lines.push("Bag (" + getSelectedClubs().length + " clubs): " + bag + ".");
  if (Object.keys(clubDist).length > 0) {
    lines.push("Club distances: " + Object.keys(clubDist).map(function (c) { return c + " " + clubDist[c] + "y"; }).join(", ") + ".");
  }
  lines.push("Total rounds saved: " + history.length + ".");
  if (last5.length > 0) {
    lines.push("Last " + last5.length + " rounds:");
    for (const r of last5) {
      const parts = [
        r.date,
        r.courseName + (r.tee ? " " + r.tee : ""),
        "score " + r.totalScore + " (" + (r.scoreVsPar >= 0 ? "+" : "") + r.scoreVsPar + ")",
        "putts " + (r.totalPutts != null ? r.totalPutts : "?"),
        "GIR " + (r.girPct != null ? r.girPct + "%" : "?"),
        "FW " + (r.fairwayPct != null ? r.fairwayPct + "%" : "?"),
        "scramble " + (r.scramblePct != null ? r.scramblePct + "%" : "?"),
        "pens " + (r.totalPenalties != null ? r.totalPenalties : "?"),
      ];
      if (r.weatherData) parts.push("wx " + Math.round(r.weatherData.tempMax || 0) + "C " + Math.round(r.weatherData.windKmh || 0) + "kmh");
      if (r.greenSpeed) parts.push("greens " + r.greenSpeed);
      if (r.teeOffTime) parts.push("tee-off " + r.teeOffTime + (r.timeBlock ? " (" + r.timeBlock + ")" : ""));
      if (r.back9StartTime) parts.push("back-9 " + r.back9StartTime + (r.back9TimeBlock ? " (" + r.back9TimeBlock + ")" : ""));
      if (r.weatherBack9 && (!r.weatherData || r.weatherBack9.tempMax !== r.weatherData.tempMax || r.weatherBack9.windKmh !== r.weatherData.windKmh)) {
        parts.push("wx-back9 " + Math.round(r.weatherBack9.tempMax || 0) + "C " + Math.round(r.weatherBack9.windKmh || 0) + "kmh");
      }
      lines.push("  - " + parts.join(", "));
    }
  }
  const practice = getPractice().slice(-5).reverse();
  if (practice.length > 0) {
    lines.push("Recent practice:");
    for (const s of practice) {
      lines.push("  - " + s.date + " " + s.area + " " + (s.duration || "?") + "min" + (s.focus ? " (" + s.focus + ")" : ""));
    }
  }
  const pi = getPuttingInsights();
  if (pi.totalShots > 0) {
    lines.push("Putting practice — " + pi.totalShots + " putts across " + pi.sessions + " sessions:");
    for (const b of pi.distanceRates) {
      if (b.count > 0) lines.push("  - " + b.label + ": " + b.pct + "% (" + b.count + " putts)");
    }
    if (pi.topMiss) lines.push("  - Most common miss: " + pi.topMiss);
    if (pi.lag) lines.push("  - Lag in 5-ft circle: " + pi.lag.inCirclePct + "% (" + pi.lag.count + " putts)");
  }
  const ci = getChippingInsights();
  if (ci.totalShots > 0) {
    lines.push("Chipping practice — " + ci.totalShots + " chips across " + ci.sessions + " sessions (up-&-down = inside 6 ft):");
    for (const b of ci.distanceRates) {
      if (b.count > 0) lines.push("  - " + b.label + ": " + b.pct + "% UD (" + b.count + " chips)");
    }
    for (const l of ci.lieRates) {
      lines.push("  - From " + l.lie + ": " + l.pct + "% UD (" + l.count + " chips)");
    }
    if (ci.topMiss) lines.push("  - Most common chip miss: " + ci.topMiss);
    if (ci.mishitPct != null) lines.push("  - Chunk/blade rate: " + ci.mishitPct + "%");
  }
  const ii = getIronInsights();
  if (ii.totalShots > 0) {
    lines.push("Iron practice — " + ii.totalShots + " shots across " + ii.sessions + " sessions:");
    for (const cs of ii.clubStats) {
      const carryStr = cs.avgCarry != null ? cs.avgCarry + "y avg (" + cs.minCarry + "-" + cs.maxCarry + ")" : "no carry data";
      lines.push("  - " + cs.club + " (" + cs.count + " shots): " + carryStr + ", " + cs.onTargetPct + "% on target");
    }
    if (ii.pureStrikePct != null) lines.push("  - Pure-strike rate: " + ii.pureStrikePct + "%");
    if (ii.topMiss) lines.push("  - Most common iron miss: " + ii.topMiss);
  }
  const di = getDriverInsights();
  if (di.totalShots > 0) {
    lines.push("Tee shot practice — " + di.totalShots + " shots across " + di.sessions + " sessions:");
    for (const cs of di.clubStats) {
      const carryStr = cs.avgCarry != null ? cs.avgCarry + "y carry" : "no carry";
      const totalStr = cs.avgTotal != null ? ", " + cs.avgTotal + "y total" : "";
      lines.push("  - " + cs.club + " (" + cs.count + " shots): " + carryStr + totalStr + ", " + cs.fairwayPct + "% FW (" + cs.playablePct + "% playable)");
    }
    if (di.topMiss) lines.push("  - Most common tee miss: " + di.topMiss);
    if (di.leftMisses > di.rightMisses) lines.push("  - Miss bias: left side (" + di.leftMisses + " vs " + di.rightMisses + " right)");
    else if (di.rightMisses > di.leftMisses) lines.push("  - Miss bias: right side (" + di.rightMisses + " vs " + di.leftMisses + " left)");
  }
  // Coach-style derived insights
  if (history.length >= 2) {
    const last = history[history.length - 1];
    const sg = getStrokesGainedLite(last, history);
    if (sg && sg.score != null) {
      const sgLine = "Last round vs personal avg: " + (sg.score > 0 ? "+" : "") + sg.score + " strokes" +
        (sg.putts != null ? ", " + (sg.putts > 0 ? "+" : "") + sg.putts + " putts" : "") +
        (sg.penalties != null && sg.penalties !== 0 ? ", " + (sg.penalties > 0 ? "+" : "") + sg.penalties + " pens" : "");
      lines.push(sgLine + ".");
    }
    const zone = getScoringZone(history.slice(-10));
    if (zone.holes > 0) {
      lines.push("Scoring zone (last " + Math.min(10, history.length) + " rounds): bogey-save " + (zone.bogeySavePct != null ? zone.bogeySavePct + "%" : "?") +
        ", birdie conv " + (zone.birdieConversionPct != null ? zone.birdieConversionPct + "%" : "?") +
        ", 3-putts " + zone.threePutts + " (" + (zone.threePuttPct != null ? zone.threePuttPct + "%" : "?") + " of holes).");
    }
    const avoid = getTopAvoid(history);
    if (avoid) lines.push("Recent miss tendency: " + avoid.label + " (" + avoid.count + "x in last 5 rounds).");
    const prox = getApproachProximity(history.slice(-10));
    if (prox.length > 0) {
      const top = prox.slice(0, 5).map(function (p) { return p.club + " " + p.avgLeft + "ft (n=" + p.count + ")"; }).join(", ");
      lines.push("Approach proximity (avg ft left to pin): " + top + ".");
    }
  }
  const confidenceClub = getConfidenceClub(getIronInsights(), getDriverInsights());
  if (confidenceClub) lines.push("Confidence club right now: " + confidenceClub.club + " — " + confidenceClub.why + ".");
  const activity7 = getPracticeActivity(7);
  if (activity7.totalShots > 0) {
    lines.push("Practice (last 7 days): " + activity7.daysPractised + " days, " + activity7.totalShots + " shots (P" + activity7.byType.Putting + " C" + activity7.byType.Chipping + " I" + activity7.byType.Irons + " D" + activity7.byType.Driver + ").");
  }
  const transfer = getPracticeTransfer(history, activity7);
  if (transfer && transfer.avgPuttsRecent != null && transfer.avgPuttsPrior != null) {
    const delta = transfer.avgPuttsRecent - transfer.avgPuttsPrior;
    if (Math.abs(delta) >= 0.5) {
      lines.push("Practice→game (last 7d vs prior 7d): putts " + (delta > 0 ? "+" : "") + delta.toFixed(1) + "/round.");
    }
  }

  // Strokes Gained breakdown (requires firstPuttDistance data in rounds)
  if (history.length >= 3) {
    const sg = aggregateSG(history.slice(-10));
    const sgParts = [];
    if (sg.offTee.avg != null)     sgParts.push("OTT " + (sg.offTee.avg >= 0 ? "+" : "") + sg.offTee.avg);
    if (sg.approach.avg != null)   sgParts.push("App " + (sg.approach.avg >= 0 ? "+" : "") + sg.approach.avg);
    if (sg.aroundGreen.avg != null) sgParts.push("ARG " + (sg.aroundGreen.avg >= 0 ? "+" : "") + sg.aroundGreen.avg);
    if (sg.putting.avg != null)    sgParts.push("Putt " + (sg.putting.avg >= 0 ? "+" : "") + sg.putting.avg);
    if (sgParts.length > 0) {
      lines.push("Strokes Gained vs scratch (last 10 rounds): " + sgParts.join(", ") + ".");
      // Highlight biggest leak
      const cats = [
        { name: "Off the Tee", val: sg.offTee.avg },
        { name: "Approach",    val: sg.approach.avg },
        { name: "Around Green", val: sg.aroundGreen.avg },
        { name: "Putting",     val: sg.putting.avg },
      ].filter(function (c) { return c.val != null; });
      if (cats.length > 0) {
        const worst = cats.reduce(function (a, b) { return a.val < b.val ? a : b; });
        if (worst.val < -0.3) lines.push("Biggest SG leak: " + worst.name + " (" + worst.val + "/round avg).");
      }
    }
  }

  // Performance trends
  if (history.length >= 5) {
    const trends = getTrends(history);
    if (trends) {
      const trendLines = [];
      const labels = { totalScore: "Score", totalPutts: "Putts/round", fairwayPct: "Fairway%", girPct: "GIR%", scramblePct: "Scramble%", totalPenalties: "Penalties" };
      for (const key in trends) {
        const t = trends[key];
        if (t.last5 == null || t.last10 == null) continue;
        if (t.direction !== "flat") {
          const arrow = t.direction === "improving" ? "↑" : "↓";
          trendLines.push(labels[key] + " " + arrow + " (last5: " + t.last5 + ", last10: " + t.last10 + ")");
        }
      }
      if (trendLines.length > 0) lines.push("Trends: " + trendLines.join("; ") + ".");
    }
    // Mental game: scoring response
    const response = getScoringResponse(history.slice(-15));
    if (response.afterBogey.n >= 5) {
      const avg = response.afterBogey.avgVsPar;
      const label = avg != null ? (avg <= 0 ? "bounces back well" : "compounds mistakes (avg +" + avg + " next hole)") : null;
      if (label) lines.push("After a bogey: " + label + " (" + response.afterBogey.n + " data points).");
    }
  }

  return lines.join("\n");
}

export function setAiOutput(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
