/* ================= Exportación de video (WebCodecs + Mediabunny) ================= */
const OPFS_FILE = 'realce-video-output.mp4';
const IDB_NAME = 'realce-recovery-db';
const IDB_STORE = 'videos';
const META_KEY = 'realce_saved_video_v1';

function openRecoveryDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no-idb'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-open'));
  });
}

export async function saveRecoverableVideo(blob, name, fromOpfs = false) {
  const type = (blob && blob.type) || 'video/mp4';
  const size = (blob && blob.size) || 0;
  if (fromOpfs) {
    try {
      localStorage.setItem(META_KEY, JSON.stringify({
        name,
        type,
        size,
        source: 'opfs',
        ts: Date.now()
      }));
      return;
    } catch (e) {}
  }
  try {
    const db = await openRecoveryDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ blob, name, type, size, ts: Date.now() }, 'latest');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem(META_KEY, JSON.stringify({
      name,
      type,
      size,
      source: 'idb',
      ts: Date.now()
    }));
  } catch (e) {}
}

export async function loadRecoverableVideo() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const meta = JSON.parse(raw);
    if (!meta || !meta.name) return null;
    if (meta.source === 'opfs' && navigator.storage && navigator.storage.getDirectory) {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(OPFS_FILE);
      const file = await handle.getFile();
      if (file && file.size > 0) {
        const blob = file.slice(0, file.size, meta.type || 'video/mp4');
        return { blob, name: meta.name, type: meta.type || 'video/mp4', size: file.size, ts: meta.ts };
      }
    }
    if (meta.source === 'idb') {
      const db = await openRecoveryDB();
      const rec = await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get('latest');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (rec && rec.blob && rec.blob.size > 0) {
        return {
          blob: rec.blob,
          name: rec.name || meta.name,
          type: rec.type || meta.type || 'video/mp4',
          size: rec.blob.size,
          ts: rec.ts || meta.ts
        };
      }
    }
  } catch (e) {}
  return null;
}

export async function clearRecoverableVideo() {
  try {
    localStorage.removeItem(META_KEY);
  } catch (e) {}
  try {
    if (navigator.storage && navigator.storage.getDirectory) {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(OPFS_FILE);
    }
  } catch (e) {}
  try {
    const db = await openRecoveryDB();
    await new Promise(resolve => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete('latest');
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    db.close();
  } catch (e) {}
}

function createPagedMemoryStream() {
  const PAGE_SIZE = 8 * 1024 * 1024;
  const pages = [];
  let totalSize = 0;
  const writable = new WritableStream({
    write(chunk) {
      const data = chunk.data;
      const pos = chunk.position;
      if (!data || !data.byteLength) return;
      let offset = 0;
      let curPos = pos;
      const len = data.byteLength;
      while (offset < len) {
        const pageIdx = Math.floor(curPos / PAGE_SIZE);
        const pageOff = curPos - pageIdx * PAGE_SIZE;
        const take = Math.min(PAGE_SIZE - pageOff, len - offset);
        while (pages.length <= pageIdx) {
          pages.push(new Uint8Array(PAGE_SIZE));
        }
        pages[pageIdx].set(data.subarray(offset, offset + take), pageOff);
        offset += take;
        curPos += take;
      }
      if (pos + len > totalSize) totalSize = pos + len;
    }
  });
  const toBlob = () => {
    if (!pages.length || totalSize === 0) return new Blob([], { type: 'video/mp4' });
    const lastIdx = Math.floor((totalSize - 1) / PAGE_SIZE);
    const lastLen = totalSize - lastIdx * PAGE_SIZE;
    const parts = pages.slice(0, lastIdx);
    parts.push(pages[lastIdx].subarray(0, lastLen));
    return new Blob(parts, { type: 'video/mp4' });
  };
  return { writable, toBlob };
}

export async function exportVideoWebCodecs({ file, width, height, render, onProgress, signal }) {
  const mb = await import('../vendor/mediabunny-1.61.3.min.mjs');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const codec = await mb.getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], { width, height });
  if (!codec) throw new Error('no-encoder');

  let opfsHandle = null;
  let opfsWritable = null;
  let pagedStream = null;
  let target = null;

  try {
    if (navigator.storage && navigator.storage.getDirectory) {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle(OPFS_FILE, { create: true });
      if (typeof handle.createWritable === 'function') {
        opfsWritable = await handle.createWritable({ keepExistingData: false });
        target = new mb.StreamTarget(opfsWritable, { chunked: true, chunkSize: 4 * 1024 * 1024 });
        opfsHandle = handle;
      }
    }
  } catch (e) {
    opfsHandle = null;
    opfsWritable = null;
    target = null;
  }

  if (!target) {
    pagedStream = createPagedMemoryStream();
    target = new mb.StreamTarget(pagedStream.writable, { chunked: true, chunkSize: 4 * 1024 * 1024 });
  }

  // fastStart: false evita acumular todos los fotogramas en RAM durante horas y evita duplicar el archivo al 100%
  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: false }),
    target
  });
  const conversion = await mb.Conversion.init({
    input,
    output,
    video: {
      codec,
      forceTranscode: true,
      allowTransformationMetadata: false,
      quality: new mb.Quality({
        bitrate: width * height >= 3840 * 2160 * 0.9 ? 40e6 : (width * height >= 2560 * 1440 * 0.9 ? 20e6 : 12e6)
      }),
      processedWidth: width,
      processedHeight: height,
      process: sample => render(sample)
    }
  });
  if (!conversion.isValid) throw new Error('invalid-conversion');
  conversion.onProgress = onProgress;
  signal.addEventListener('abort', () => conversion.cancel(), { once: true });
  try {
    await conversion.execute();
  } catch (e) {
    try { if (opfsWritable) await opfsWritable.abort(); } catch (err) {}
    throw e;
  }
  if (opfsHandle) {
    const diskFile = await opfsHandle.getFile();
    const blob = diskFile.slice(0, diskFile.size, 'video/mp4');
    blob.__fromOpfs = true;
    return blob;
  }
  return pagedStream.toBlob();
}
