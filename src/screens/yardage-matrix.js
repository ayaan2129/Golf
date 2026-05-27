// Yardage Matrix screen. A pro-style page where each club has a row of
// shot-length yardages (Full / ¾ / Half / ¼). The page also shows
// today's conditions (altitude, temperature, wind) auto-pulled from the
// course location, and renders an "adjusted for today" view so the
// player knows the real carry to expect.

import { COURSES, locationFor } from "../core/courses.js";
import {
  getSelectedClubs,
  getYardageCell, setYardageCell, SHOT_TYPES,
} from "../data/profile.js";
import { fetchCurrentConditions, adjustYardage } from "../data/weather.js";

const M_TO_FT = 3.28084;

// Cached so re-renders don't refetch. Cleared when the user picks a new
// course in the matrix's location selector.
let cachedConditions = null;
let cachedCourseKey = null;
let manualWind = { mph: null, relation: "calm" };

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function getActiveCourseKey() {
  const sel = document.getElementById("ymCourseSelect");
  if (sel && sel.value) return sel.value;
  return Object.keys(COURSES)[0] || null;
}

function getEffectiveConditions() {
  const c = cachedConditions || {};
  const elevFt = c.elevationM != null ? c.elevationM * M_TO_FT : 0;
  const useManualWind = manualWind.mph != null;
  return {
    elevationFt: elevFt,
    tempF: c.tempF != null ? c.tempF : 70,
    windMph: useManualWind ? manualWind.mph : (c.windMph != null ? c.windMph : 0),
    windRelation: useManualWind ? manualWind.relation : "calm",
    locationName: c.locationName || null,
  };
}

// Snapshot the effective conditions to localStorage so other screens
// (notably the AI coach context builder) can pick them up.
function persistConditionsCache() {
  try {
    const eff = getEffectiveConditions();
    localStorage.setItem("ymConditionsCache", JSON.stringify({
      elevationFt: eff.elevationFt,
      tempF: eff.tempF,
      windMph: eff.windMph,
      windRelation: eff.windRelation,
      locationName: eff.locationName,
      fetchedAt: Date.now(),
    }));
  } catch (e) {}
}

function renderConditionsBar() {
  const eff = getEffectiveConditions();
  setText("ymCondElev", Math.round(eff.elevationFt) + " ft");
  setText("ymCondTemp", Math.round(eff.tempF) + "°F");
  const windTxt = eff.windMph
    ? Math.round(eff.windMph) + " mph " + eff.windRelation
    : "calm";
  setText("ymCondWind", windTxt);
  setText("ymCondLoc", eff.locationName || "—");
}

function renderMatrix() {
  const host = document.getElementById("ymMatrixBody");
  if (!host) return;
  host.innerHTML = "";
  const clubs = getSelectedClubs().filter(function (c) { return c !== "Putter"; });
  if (clubs.length === 0) {
    const p = document.createElement("p");
    p.style.padding = "12px";
    p.style.color = "var(--muted)";
    p.textContent = "Add clubs to your bag first (My Bag & Distances tab).";
    host.appendChild(p);
    return;
  }
  const eff = getEffectiveConditions();
  for (const club of clubs) {
    const row = document.createElement("div");
    row.className = "ym-row";

    const name = document.createElement("div");
    name.className = "ym-row-club";
    name.textContent = club;
    row.appendChild(name);

    for (const st of SHOT_TYPES) {
      const cell = document.createElement("div");
      cell.className = "ym-cell";

      const lbl = document.createElement("div");
      lbl.className = "ym-cell-lbl";
      lbl.textContent = st.label;
      cell.appendChild(lbl);

      const input = document.createElement("input");
      input.type = "number";
      input.inputMode = "numeric";
      input.placeholder = "—";
      input.min = "0";
      const saved = getYardageCell(club, st.key);
      if (saved != null) input.value = saved;
      input.addEventListener("input", function () {
        setYardageCell(club, st.key, input.value);
        const adj = adjustYardage(input.value === "" ? null : Number(input.value), eff);
        adjEl.textContent = adj != null ? "→ " + adj + "y" : "";
      });
      cell.appendChild(input);

      const adjEl = document.createElement("div");
      adjEl.className = "ym-cell-adj";
      const adj = adjustYardage(saved, eff);
      adjEl.textContent = adj != null ? "→ " + adj + "y" : "";
      cell.appendChild(adjEl);

      row.appendChild(cell);
    }
    host.appendChild(row);
  }
}

async function refreshConditions(courseKey) {
  setText("ymCondElev", "…");
  setText("ymCondTemp", "…");
  setText("ymCondWind", "…");
  setText("ymCondLoc", locationFor(courseKey).name);
  try {
    const c = await fetchCurrentConditions(courseKey);
    cachedConditions = c || {};
    cachedCourseKey = courseKey;
  } catch (e) {
    cachedConditions = {};
  }
  renderConditionsBar();
  renderMatrix();
  persistConditionsCache();
}

function populateCourseSelect() {
  const sel = document.getElementById("ymCourseSelect");
  if (!sel || sel.options.length > 0) return;
  for (const key of Object.keys(COURSES)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = COURSES[key].location ? COURSES[key].location.name : key;
    sel.appendChild(opt);
  }
}

function applyManualWindFromUi() {
  const mphEl = document.getElementById("ymWindMph");
  const relEl = document.getElementById("ymWindRel");
  const mph = mphEl && mphEl.value !== "" ? Number(mphEl.value) : null;
  const rel = relEl ? relEl.value : "calm";
  manualWind = { mph: mph, relation: rel };
  renderConditionsBar();
  renderMatrix();
  persistConditionsCache();
}

function openGrassHelp() {
  const modal = document.getElementById("ymGrassModal");
  if (modal) modal.style.display = "flex";
}

function closeGrassHelp() {
  const modal = document.getElementById("ymGrassModal");
  if (modal) modal.style.display = "none";
}

export function renderYardageMatrix() {
  populateCourseSelect();
  const sel = document.getElementById("ymCourseSelect");
  const key = (sel && sel.value) || getActiveCourseKey();
  if (sel && !sel.value && key) sel.value = key;
  if (cachedCourseKey !== key) {
    refreshConditions(key);
  } else {
    renderConditionsBar();
    renderMatrix();
    persistConditionsCache();
  }
}

export function wireYardageMatrix() {
  const sel = document.getElementById("ymCourseSelect");
  if (sel) sel.addEventListener("change", function () { refreshConditions(sel.value); });
  const refreshBtn = document.getElementById("ymRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", function () { refreshConditions(getActiveCourseKey()); });
  const applyWind = document.getElementById("ymWindApply");
  if (applyWind) applyWind.addEventListener("click", applyManualWindFromUi);
  const clearWind = document.getElementById("ymWindClear");
  if (clearWind) clearWind.addEventListener("click", function () {
    manualWind = { mph: null, relation: "calm" };
    const mphEl = document.getElementById("ymWindMph");
    const relEl = document.getElementById("ymWindRel");
    if (mphEl) mphEl.value = "";
    if (relEl) relEl.value = "calm";
    renderConditionsBar();
    renderMatrix();
    persistConditionsCache();
  });
  const grassBtn = document.getElementById("ymGrassBtn");
  if (grassBtn) grassBtn.addEventListener("click", openGrassHelp);
  const grassClose = document.getElementById("ymGrassClose");
  if (grassClose) grassClose.addEventListener("click", closeGrassHelp);
  const modal = document.getElementById("ymGrassModal");
  if (modal) modal.addEventListener("click", function (e) {
    if (e.target === modal) closeGrassHelp();
  });
}
