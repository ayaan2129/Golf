// Swing video library screen. Upload (or capture on mobile) → save blob to
// IndexedDB → render thumbnail grid → tap a card to open the modal player
// (with editable metadata, linked-shot picker, AI Analyse Frame, delete) or
// enter compare mode and pick two for the side-by-side comparison modal.
//
// Blob storage + index helpers live in src/data/videos.js. AI analysis goes
// through src/ai/generators.js.

import { todayISO, escapeAttr, escapeHtml } from "../core/utils.js";
import {
  putVideoBlob, getVideoBlob, deleteVideoBlob,
  getVideoIndex, saveVideoIndex, videoNewId,
} from "../data/videos.js";
import { getPractice } from "../data/practice.js";
import { analyseSwingFrame } from "../ai/generators.js";

let videoCompareMode = false;
let videoCompareSelection = [];

function generateVideoThumb(file) {
  return new Promise(function (resolve) {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.addEventListener("loadeddata", function () {
      try { video.currentTime = Math.min(0.5, (video.duration || 1) / 2); } catch (e) {}
    }, { once: true });
    video.addEventListener("seeked", function () {
      const c = document.createElement("canvas");
      const w = video.videoWidth || 320;
      const h = video.videoHeight || 240;
      const scale = Math.min(320 / w, 1);
      c.width = Math.round(w * scale);
      c.height = Math.round(h * scale);
      const ctx = c.getContext("2d");
      ctx.drawImage(video, 0, 0, c.width, c.height);
      const data = c.toDataURL("image/jpeg", 0.7);
      URL.revokeObjectURL(url);
      resolve(data);
    }, { once: true });
    video.addEventListener("error", function () { URL.revokeObjectURL(url); resolve(null); }, { once: true });
  });
}

export async function handleVideoUpload(file) {
  const status = document.getElementById("videoUploadStatus");
  if (!file) return;
  if (status) status.textContent = "Saving " + file.name + "...";
  try {
    const id = videoNewId();
    const thumb = await generateVideoThumb(file);
    await putVideoBlob(id, file);
    const idx = getVideoIndex();
    idx.unshift({
      id, label: file.name.replace(/\.[^.]+$/, "").slice(0, 40),
      date: todayISO(), club: "", notes: "",
      thumb, size: file.size, mime: file.type || "video/mp4",
      savedAt: new Date().toISOString(),
    });
    saveVideoIndex(idx);
    if (status) status.textContent = "Saved. " + idx.length + " video" + (idx.length === 1 ? "" : "s") + " in library.";
    renderVideoLibrary();
  } catch (e) {
    if (status) status.textContent = "Failed to save: " + (e.message || e);
  }
}

function describeShot(s, type) {
  if (type === "Irons" || type === "Driver") {
    const carry = s.carry != null ? s.carry + "y" : "?";
    return s.club + " · " + carry + " · " + s.result;
  }
  if (type === "Chipping") return s.club + " · " + s.distance + "y from " + s.lie + " · " + s.result;
  if (type === "Putting") return s.distance + "ft " + (s.intent || "make") + " · " + s.result;
  return s.result || "shot";
}

function parseLinkedShot(val) {
  const parts = val.split("|");
  if (parts.length !== 3) return null;
  return { sessionDate: parts[0], sessionType: parts[1], shotIndex: parseInt(parts[2], 10) };
}

function populateShotPicker(currentLink) {
  const sel = document.getElementById("vmShotPicker");
  if (!sel) return;
  sel.innerHTML = "";
  const none = document.createElement("option");
  none.value = ""; none.textContent = "— None —";
  sel.appendChild(none);
  const sessions = getPractice().filter(function (s) { return Array.isArray(s.shots) && s.shots.length > 0; });
  sessions.sort(function (a, b) { return (b.savedAt || b.date).localeCompare(a.savedAt || a.date); });
  for (const sess of sessions.slice(0, 8)) {
    const grp = document.createElement("optgroup");
    grp.label = sess.date + " · " + sess.type;
    for (let i = 0; i < sess.shots.length; i++) {
      const o = document.createElement("option");
      o.value = sess.savedAt + "|" + sess.type + "|" + i;
      o.textContent = "#" + (i + 1) + " " + describeShot(sess.shots[i], sess.type);
      grp.appendChild(o);
    }
    sel.appendChild(grp);
  }
  if (currentLink) {
    const val = currentLink.sessionDate + "|" + currentLink.sessionType + "|" + currentLink.shotIndex;
    for (const opt of sel.querySelectorAll("option")) {
      if (opt.value === val) { sel.value = val; return; }
    }
  }
}

function renderLinkedShotInfo(val) {
  const info = document.getElementById("vmShotInfo");
  if (!info) return;
  if (!val) { info.textContent = "Link this video to a specific practice shot to track form vs result."; return; }
  const link = parseLinkedShot(val);
  if (!link) { info.textContent = ""; return; }
  const sess = getPractice().find(function (s) { return (s.savedAt || s.date) === link.sessionDate && s.type === link.sessionType; });
  if (!sess) { info.textContent = "Session no longer available."; return; }
  const shot = sess.shots[link.shotIndex];
  if (!shot) { info.textContent = ""; return; }
  info.textContent = "Linked to " + sess.date + " · " + sess.type + " · " + describeShot(shot, sess.type);
}

export function renderVideoLibrary() {
  const grid = document.getElementById("videoLibraryGrid");
  const toggle = document.getElementById("videoCompareToggle");
  if (!grid) return;
  const idx = getVideoIndex();
  grid.innerHTML = "";
  if (idx.length === 0) {
    const e = document.createElement("div");
    e.className = "video-empty";
    e.textContent = "No videos yet. Upload one above to start your library.";
    grid.appendChild(e);
    if (toggle) toggle.disabled = true;
    return;
  }
  if (toggle) {
    toggle.disabled = false;
    toggle.textContent = videoCompareMode ? "Cancel" : "Compare";
  }
  for (const v of idx) {
    const card = document.createElement("div");
    card.className = "video-card";
    if (videoCompareSelection.indexOf(v.id) !== -1) card.classList.add("selected");
    if (v.thumb) {
      const img = document.createElement("img");
      img.className = "video-card-thumb";
      img.src = v.thumb;
      card.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "video-card-thumb";
      ph.style.display = "flex";
      ph.style.alignItems = "center";
      ph.style.justifyContent = "center";
      ph.style.color = "#888";
      ph.textContent = "▶";
      card.appendChild(ph);
    }
    const badge = document.createElement("div");
    badge.className = "video-card-select-badge";
    badge.textContent = String(videoCompareSelection.indexOf(v.id) + 1 || "");
    card.appendChild(badge);
    const meta = document.createElement("div");
    meta.className = "video-card-meta";
    const lbl = document.createElement("div");
    lbl.className = "video-card-label";
    lbl.textContent = v.label || "Untitled";
    const dt = document.createElement("div");
    dt.className = "video-card-date";
    dt.textContent = v.date + (v.club ? " · " + v.club : "");
    meta.appendChild(lbl);
    meta.appendChild(dt);
    if (v.linkedShot) {
      const link = document.createElement("div");
      link.className = "video-card-date";
      link.style.color = "var(--green-bright)";
      link.style.marginTop = "2px";
      const sess = getPractice().find(function (s) { return (s.savedAt || s.date) === v.linkedShot.sessionDate && s.type === v.linkedShot.sessionType; });
      const shot = sess && sess.shots[v.linkedShot.shotIndex];
      link.textContent = shot ? "🔗 " + describeShot(shot, sess.type) : "🔗 linked";
      meta.appendChild(link);
    }
    card.appendChild(meta);
    card.addEventListener("click", function () {
      if (videoCompareMode) {
        const pos = videoCompareSelection.indexOf(v.id);
        if (pos !== -1) videoCompareSelection.splice(pos, 1);
        else {
          if (videoCompareSelection.length >= 2) videoCompareSelection.shift();
          videoCompareSelection.push(v.id);
        }
        if (videoCompareSelection.length === 2) {
          openVideoCompare(videoCompareSelection[0], videoCompareSelection[1]);
        } else {
          renderVideoLibrary();
        }
      } else {
        openVideoModal(v.id);
      }
    });
    grid.appendChild(card);
  }
}

async function openVideoModal(id) {
  const idx = getVideoIndex();
  const v = idx.find(function (x) { return x.id === id; });
  if (!v) return;
  const blob = await getVideoBlob(id);
  if (!blob) { alert("Video file missing."); return; }
  const url = URL.createObjectURL(blob);
  const modal = document.getElementById("videoPlayerModal");
  const body = document.getElementById("videoModalBody");
  body.innerHTML = "";

  const vid = document.createElement("video");
  vid.className = "video-modal-player";
  vid.controls = true;
  vid.playsInline = true;
  vid.src = url;
  body.appendChild(vid);

  const form = document.createElement("div");
  form.className = "video-modal-form";
  form.innerHTML =
    '<div class="profile-row"><label>Label</label><input type="text" id="vmLabel" value="' + escapeAttr(v.label) + '" /></div>' +
    '<div class="profile-row"><label>Date</label><input type="date" id="vmDate" value="' + v.date + '" /></div>' +
    '<div class="profile-row"><label>Club</label><input type="text" id="vmClub" value="' + escapeAttr(v.club) + '" placeholder="e.g. 7i" /></div>' +
    '<div class="profile-row"><label>Notes</label><textarea id="vmNotes" rows="2">' + escapeHtml(v.notes) + '</textarea></div>' +
    '<div class="profile-row" style="align-items:flex-start;"><label>Linked shot</label><div style="flex:1;"><select id="vmShotPicker" style="width:100%; padding:8px; border:1px solid var(--border); border-radius:6px;"></select><div id="vmShotInfo" style="font-size:11px; color:var(--muted); margin-top:4px;"></div></div></div>' +
    '<div style="display:flex; gap:8px; margin-top:12px;">' +
      '<button id="vmSave" class="ai-action-btn" style="flex:1;">Save</button>' +
      '<button id="vmAnalyse" class="ai-action-btn" style="flex:1; background:#1976d2;">AI Analyse Frame</button>' +
    '</div>' +
    '<button id="vmDelete" class="btn-secondary danger" style="margin-top:8px; width:100%;">Delete video</button>' +
    '<div id="vmAiOut" class="ai-output" style="margin-top:10px;"></div>';
  body.appendChild(form);

  populateShotPicker(v.linkedShot);
  document.getElementById("vmShotPicker").addEventListener("change", function () {
    renderLinkedShotInfo(this.value);
  });
  renderLinkedShotInfo(document.getElementById("vmShotPicker").value);

  document.getElementById("vmSave").addEventListener("click", function () {
    const all = getVideoIndex();
    const i = all.findIndex(function (x) { return x.id === id; });
    if (i === -1) return;
    all[i].label = document.getElementById("vmLabel").value.trim() || all[i].label;
    all[i].date = document.getElementById("vmDate").value || all[i].date;
    all[i].club = document.getElementById("vmClub").value.trim();
    all[i].notes = document.getElementById("vmNotes").value.trim();
    const pickerVal = document.getElementById("vmShotPicker").value;
    all[i].linkedShot = pickerVal ? parseLinkedShot(pickerVal) : null;
    saveVideoIndex(all);
    renderVideoLibrary();
    closeVideoModal();
  });
  document.getElementById("vmDelete").addEventListener("click", async function () {
    if (!confirm("Delete this video? It can't be recovered.")) return;
    await deleteVideoBlob(id);
    const all = getVideoIndex().filter(function (x) { return x.id !== id; });
    saveVideoIndex(all);
    renderVideoLibrary();
    closeVideoModal();
  });
  document.getElementById("vmAnalyse").addEventListener("click", async function () {
    const out = document.getElementById("vmAiOut");
    out.textContent = "Pausing video at current frame...";
    vid.pause();
    const c = document.createElement("canvas");
    c.width = vid.videoWidth || 640;
    c.height = vid.videoHeight || 480;
    c.getContext("2d").drawImage(vid, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    let shotContext = v.notes || "";
    if (v.linkedShot) {
      const sess = getPractice().find(function (s) { return (s.savedAt || s.date) === v.linkedShot.sessionDate && s.type === v.linkedShot.sessionType; });
      const shot = sess && sess.shots[v.linkedShot.shotIndex];
      if (shot) shotContext += (shotContext ? " | " : "") + "Linked shot: " + describeShot(shot, sess.type);
    }
    try { await analyseSwingFrame(dataUrl, shotContext, out); }
    catch (e) { out.textContent = "AI error: " + e.message; }
  });

  modal.style.display = "flex";
  modal._objectUrl = url;
}

function closeVideoModal() {
  const modal = document.getElementById("videoPlayerModal");
  if (!modal) return;
  if (modal._objectUrl) URL.revokeObjectURL(modal._objectUrl);
  modal._objectUrl = null;
  modal.style.display = "none";
  document.getElementById("videoModalBody").innerHTML = "";
}

async function openVideoCompare(idA, idB) {
  const idx = getVideoIndex();
  const a = idx.find(function (x) { return x.id === idA; });
  const b = idx.find(function (x) { return x.id === idB; });
  if (!a || !b) return;
  const [blobA, blobB] = await Promise.all([getVideoBlob(idA), getVideoBlob(idB)]);
  if (!blobA || !blobB) { alert("One or both video files missing."); return; }
  const urlA = URL.createObjectURL(blobA);
  const urlB = URL.createObjectURL(blobB);
  const modal = document.getElementById("videoPlayerModal");
  const body = document.getElementById("videoModalBody");
  body.innerHTML = "";

  const heading = document.createElement("h3");
  heading.style.margin = "0 0 10px";
  heading.textContent = "Compare swings";
  body.appendChild(heading);

  const row = document.createElement("div");
  row.className = "video-compare-row";
  for (const item of [{ url: urlA, meta: a }, { url: urlB, meta: b }]) {
    const cell = document.createElement("div");
    const v = document.createElement("video");
    v.src = item.url;
    v.controls = true;
    v.playsInline = true;
    v.muted = true;
    cell.appendChild(v);
    const cap = document.createElement("div");
    cap.className = "video-compare-label";
    cap.textContent = (item.meta.label || "Untitled") + " · " + item.meta.date;
    cell.appendChild(cap);
    row.appendChild(cell);
  }
  body.appendChild(row);

  const ctrlRow = document.createElement("div");
  ctrlRow.style.display = "flex";
  ctrlRow.style.gap = "8px";
  ctrlRow.style.marginTop = "12px";
  const playBoth = document.createElement("button");
  playBoth.className = "ai-action-btn";
  playBoth.style.flex = "1";
  playBoth.textContent = "▶ Play both";
  playBoth.addEventListener("click", function () {
    body.querySelectorAll("video").forEach(function (v) { v.currentTime = 0; v.play(); });
  });
  ctrlRow.appendChild(playBoth);
  const pauseBoth = document.createElement("button");
  pauseBoth.className = "btn-secondary";
  pauseBoth.style.flex = "1";
  pauseBoth.textContent = "❚❚ Pause";
  pauseBoth.addEventListener("click", function () {
    body.querySelectorAll("video").forEach(function (v) { v.pause(); });
  });
  ctrlRow.appendChild(pauseBoth);
  body.appendChild(ctrlRow);

  modal.style.display = "flex";
  modal._objectUrl = urlA;
  modal._objectUrlB = urlB;
}

export function wireVideosUi() {
  const upBtn = document.getElementById("videoUploadBtn");
  const recBtn = document.getElementById("videoRecordBtn");
  const fileIn = document.getElementById("videoFileInput");
  const toggle = document.getElementById("videoCompareToggle");
  const close = document.getElementById("videoModalClose");

  if (upBtn && fileIn) upBtn.addEventListener("click", function () { fileIn.removeAttribute("capture"); fileIn.click(); });
  if (recBtn && fileIn) recBtn.addEventListener("click", function () { fileIn.setAttribute("capture", "environment"); fileIn.click(); });
  if (fileIn) fileIn.addEventListener("change", function (e) {
    const f = e.target.files && e.target.files[0];
    if (f) handleVideoUpload(f);
    fileIn.value = "";
  });
  if (toggle) toggle.addEventListener("click", function () {
    videoCompareMode = !videoCompareMode;
    videoCompareSelection = [];
    renderVideoLibrary();
  });
  if (close) close.addEventListener("click", function () {
    const modal = document.getElementById("videoPlayerModal");
    if (modal && modal._objectUrlB) URL.revokeObjectURL(modal._objectUrlB);
    closeVideoModal();
    if (videoCompareMode) {
      videoCompareSelection = [];
      renderVideoLibrary();
    }
  });
}
