// Swing video storage: blobs in IndexedDB, metadata index in (namespaced)
// localStorage. The library UI lives in src/screens/videos-ui.js.

const VIDEO_DB_NAME = "golfVideosDB";
const VIDEO_STORE = "videoBlobs";
let _videoDbPromise = null;

export function openVideoDB() {
  if (_videoDbPromise) return _videoDbPromise;
  _videoDbPromise = new Promise(function (resolve, reject) {
    if (!window.indexedDB) { reject(new Error("IndexedDB not supported")); return; }
    const req = indexedDB.open(VIDEO_DB_NAME, 1);
    req.onupgradeneeded = function (e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE)) db.createObjectStore(VIDEO_STORE);
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
  return _videoDbPromise;
}

export function putVideoBlob(id, blob) {
  return openVideoDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(VIDEO_STORE, "readwrite");
      tx.objectStore(VIDEO_STORE).put(blob, id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

export function getVideoBlob(id) {
  return openVideoDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(VIDEO_STORE, "readonly");
      const req = tx.objectStore(VIDEO_STORE).get(id);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  });
}

export function deleteVideoBlob(id) {
  return openVideoDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(VIDEO_STORE, "readwrite");
      tx.objectStore(VIDEO_STORE).delete(id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

export function getVideoIndex() {
  try { return JSON.parse(localStorage.getItem("videoLibrary") || "[]"); }
  catch (e) { return []; }
}

export function saveVideoIndex(arr) {
  localStorage.setItem("videoLibrary", JSON.stringify(arr));
}

export function videoNewId() {
  return "v_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
}
