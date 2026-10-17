import { $, toast, formatMB, formatTime, showProgress, hideProgress } from './utils.js';
import { state, DEFAULTS, PRESETS, AI_MODELS } from './state.js';
import { createSegmented, refreshAllSegmented } from './segmented.js';
import { resetView } from './compare.js';
import { loadAI, upscaleWithAI } from './ai.js';
import { processVideo, webCodecsSupported } from './video.js';
import { exportImage, shareCurrent } from './export.js';

/* ================= Render / vista previa ================= */
const video = () => $('#vid');
const beforeCanvas = () => $('#cvBefore');
const beforeCtx = () => beforeCanvas().getContext('2d');

export const params = () => ({
  sharp: state.adj.sharp,
  noise: state.adj.noise,
  skin: state.adj.skin,
  fidelity: state.adj.fidelity,
  bright: state.adj.bright,
  contrast: state.adj.contrast,
  sat: state.adj.sat,
  definition: state.adj.definition
});

export function renderCurrent() {
  if (!state.file || state.tooBig) return;
  const vid = video();
  if (state.mediaType === 'video' && vid.readyState < 2) return;
  const src = state.mediaType === 'image' ? (state.aiSource || state.image) : vid;
  if (!src) return;
  const orig = state.mediaType === 'image' ? state.image : vid;
  state.enhancer.render(src, params(), orig);
  const cb = beforeCanvas();
  const ctx = beforeCtx();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(orig, 0, 0, cb.width, cb.height);
}

let renderPending = false;
export function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    renderCurrent();
  });
}

const RES_BOX = {
  '1080p': [1920, 1080],
  '2K': [2560, 1440],
  '4K': [3840, 2160]
};

export function updateTarget() {
  const box = RES_BOX[state.resolution] || RES_BOX['2K'];
  const portrait = state.origH > state.origW;
  const bw = portrait ? box[1] : box[0];
  const bh = portrait ? box[0] : box[1];
  const sc = Math.min(bw / state.origW, bh / state.origH);
  const w = Math.max(2, Math.round(state.origW * sc / 2) * 2);
  const h = Math.max(2, Math.round(state.origH * sc / 2) * 2);
  state.target = { w, h };
  state.downscaled = sc < 1;
  state.sameRes = Math.abs(sc - 1) < 0.02;
  state.tooBig = !!state.enhancer.max && Math.max(w, h) > state.enhancer.max;
  if (!state.tooBig) {
    state.enhancer.setTarget(w, h);
    const cb = beforeCanvas();
    const bf = Math.min(1, Math.max(w, h) / Math.max(state.origW, state.origH));
    cb.width = Math.max(1, Math.round(state.origW * bf));
    cb.height = Math.max(1, Math.round(state.origH * bf));
    $('#cvAfter').style.width = w + 'px';
    cb.style.width = w + 'px';
    resetView();
  }
  $('#finfo').textContent = `${state.file.name} · ${state.origW}×${state.origH} · ${formatMB(state.file.size)}` +
    (state.mediaType === 'video' ? ` · ${formatTime(state.duration)}` : '') + ` → ${w}×${h}`;
  $('#resHint').textContent = state.tooBig
    ? 'La resolución destino supera el límite de textura de tu GPU.'
    : (state.sameRes
      ? `Misma resolución (${w}×${h}): limpia grano y restaura rostros/detalle sin perder calidad.`
      : (state.downscaled
        ? `Reducido de ${state.origW}×${state.origH} a ${w}×${h} con limpieza de grano y reconstrucción IA.`
        : `Escalado a ${w}×${h} px` + (state.mediaType === 'video' && state.resolution === '1080p' ? ' (óptimo para video rápido con IA)' : '')));
}

/* ================= Segmentados ================= */
let segRes, segEng, segModel, segFmt, segPreset;

const effectiveEngine = () => (state.mediaType === 'video' && !webCodecsSupported()) ? 'fast' : state.engine;

function updatePresetHint() {
  $('#presetHint').textContent = state.preset
    ? PRESETS[state.preset].hint
    : 'Ajustes personalizados';
}

function updateModelHint() {
  const m = AI_MODELS[state.aiModel] || AI_MODELS.nomos8k;
  $('#modelHint').textContent = m.hint;
}

function applyPreset(key) {
  state.preset = key;
  state.adj = { ...PRESETS[key][effectiveEngine()] };
  syncSliders();
  updatePresetHint();
  scheduleRender();
}

export function applyEngine(v) {
  state.engine = v;
  if (v === 'fast') state.aiSource = null;
  state.adj = { ...(state.preset ? PRESETS[state.preset][effectiveEngine()] : DEFAULTS[v]) };
  syncSliders();
  updatePresetHint();
  updateUI();
  requestAnimationFrame(refreshAllSegmented);
  renderCurrent();
}

export function setEngine(v) {
  segEng.set(v);
  applyEngine(v);
}

/* ================= Sliders ================= */
const SLIDERS = [
  ['slNoise', 'noise', 'vNoise'],
  ['slSkin', 'skin', 'vSkin'],
  ['slFidelity', 'fidelity', 'vFidelity'],
  ['slSharp', 'sharp', 'vSharp'],
  ['slDef', 'definition', 'vDef'],
  ['slBright', 'bright', 'vBright'],
  ['slContrast', 'contrast', 'vContrast'],
  ['slSat', 'sat', 'vSat']
];

function syncSliders() {
  SLIDERS.forEach(([id, key, valId]) => {
    $('#' + id).value = state.adj[key];
    $('#' + valId).textContent = state.adj[key];
  });
  $('#slQ').value = Math.round(state.quality * 100);
  $('#vQ').textContent = Math.round(state.quality * 100);
}

/* ================= UI ================= */
export function updateUI() {
  const img = state.mediaType === 'image';
  const canVideoAI = webCodecsSupported();
  const useAI = effectiveEngine() === 'ia';
  segEng.dis(!img && !canVideoAI);
  $('#grpModel').hidden = !useAI;
  updateModelHint();
  const mLabel = (AI_MODELS[state.aiModel] || AI_MODELS.nomos8k).label;
  $('#engHint').textContent = img
    ? (state.engine === 'ia'
      ? (state.aiEP === 'webgpu'
        ? `IA (${mLabel}) · GPU (WebGPU) · Limpieza profunda de grano y reconstrucción facial`
        : state.aiEP === 'wasm'
          ? `IA (${mLabel}) · CPU (más lento)`
          : `IA (${mLabel}) + Restauración de piel/rostros: elimina grano y reconstruye detalle.`)
      : 'Escalado de alta calidad, eliminación de grano y suavizado de piel al instante.')
    : (canVideoAI
      ? (state.engine === 'ia'
        ? `IA (${mLabel}) en video activada (procesa fotograma a fotograma; puede tardar varios minutos).`
        : 'Motor rápido en video: elimina el grano y mejora rostros/bordes a alta velocidad.')
      : 'Tu navegador no soporta WebCodecs; se usa el motor rápido para video.');
  $('#vseek').hidden = img;
  $('#vnote').hidden = img;
  $('#vnote').textContent = webCodecsSupported()
    ? (state.engine === 'ia'
      ? 'Cada fotograma del video se reconstruirá con IA y limpieza de grano. Mantén la pestaña abierta.'
      : 'El video se genera fotograma a fotograma y se descarga al terminar. No hace falta reproducirlo.')
    : 'El video se procesa en tiempo real: tarda lo mismo que dura. Mantén la pestaña visible.';
  $('#qRow').style.opacity = state.format === 'png' ? .4 : 1;
  $('#slQ').disabled = state.format === 'png';
  $('#btnGo').hidden = img && state.engine !== 'ia';
  $('#btnGo').textContent = img
    ? 'Mejorar con IA'
    : (state.engine === 'ia' ? 'Mejorar video con IA' : 'Mejorar video');
  $('#btnDl').hidden = !img;
  $('#btnDl').className = 'btn ' + (img && state.engine !== 'ia' ? 'btn-p' : 'btn-s');
  $('#btnShare').hidden = !img && !state.share;
  document.querySelectorAll('#ws input,#ws button').forEach(b => {
    if (b.id !== 'btnCancel' && b.id !== 'btnFrame') b.disabled = state.busy;
  });
  $('#btnNavOpen').hidden = !state.file;
  $('#btnNavOpen').disabled = state.busy;
}

/* ================= Entrada de archivo ================= */
function cleanup() {
  if (state.url) {
    URL.revokeObjectURL(state.url);
    state.url = null;
  }
  state.image = null;
  state.aiSource = null;
  state.share = null;
  const vid = video();
  vid.pause();
  vid.removeAttribute('src');
  vid.load();
}

function normalizeImage(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

async function fixInfiniteDuration(vid) {
  if (isFinite(vid.duration)) return;
  vid.currentTime = 1e101;
  await new Promise(res => {
    const t = setTimeout(res, 3000);
    vid.addEventListener('durationchange', () => {
      clearTimeout(t);
      res();
    }, { once: true });
  });
  vid.currentTime = 0;
  await new Promise(res => {
    const t = setTimeout(res, 3000);
    vid.addEventListener('seeked', () => {
      clearTimeout(t);
      res();
    }, { once: true });
  });
}

export async function openFile(f) {
  if (!f) return false;
  if (state.busy) {
    toast('Espera a que termine o cancela el proceso');
    return false;
  }
  const isImg = f.type.startsWith('image/');
  const isVid = f.type.startsWith('video/');
  if (!isImg && !isVid) {
    toast('El archivo debe ser una imagen o un video', 'err');
    return false;
  }
  cleanup();
  state.file = f;
  state.mediaType = isImg ? 'image' : 'video';
  state.url = URL.createObjectURL(f);
  state.duration = 0;
  try {
    if (isImg) {
      const img = new Image();
      img.decoding = 'async';
      img.src = state.url;
      await img.decode();
      state.image = normalizeImage(img);
      state.origW = img.naturalWidth;
      state.origH = img.naturalHeight;
    } else {
      const vid = video();
      vid.src = state.url;
      vid.muted = true;
      await new Promise((res, rej) => {
        vid.onloadedmetadata = res;
        vid.onerror = () => rej(new Error('video'));
      });
      await fixInfiniteDuration(vid);
      state.origW = vid.videoWidth;
      state.origH = vid.videoHeight;
      state.duration = vid.duration;
      $('#seek').max = vid.duration;
      $('#seek').value = 0;
      $('#seekT').textContent = '0:00';
    }
  } catch (e) {
    toast('No se pudo leer el archivo', 'err');
    cleanup();
    state.file = null;
    return false;
  }
  if (!state.glOK)
    toast('WebGL no disponible: motor de reserva (sin nitidez ni reducción de ruido)', 'err');
  const origLong = Math.max(state.origW, state.origH);
  if (isVid) {
    // En video, 1080p por defecto da la mejor relación velocidad/calidad con IA; si el video ya supera 1080p, mantenemos su rango (2K o 4K) para no bajarle resolución.
    const autoRes = origLong > 2560 ? '4K' : (origLong > 1920 ? '2K' : '1080p');
    state.resolution = autoRes;
    if (segRes) segRes.set(autoRes);
  } else if (origLong > 2560 && state.resolution !== '4K') {
    // Si la imagen ya supera 2K, subimos a 4K para conservar su resolución nativa al restaurar.
    state.resolution = '4K';
    if (segRes) segRes.set('4K');
  } else if (origLong > 1920 && state.resolution === '1080p') {
    state.resolution = '2K';
    if (segRes) segRes.set('2K');
  }
  $('#ws').hidden = false;
  $('#drop').hidden = true;
  $('#fname').textContent = f.name;
  updateTarget();
  updateUI();
  if (state.tooBig) toast('La resolución destino supera el límite de tu GPU', 'err');
  requestAnimationFrame(() => {
    refreshAllSegmented();
    renderCurrent();
  });
  return true;
}

function initFileInput() {
  const drop = $('#drop');
  const fileIn = $('#file');
  let dragDepth = 0;
  drop.onclick = () => fileIn.click();
  drop.onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileIn.click();
    }
  };
  drop.addEventListener('dragenter', e => {
    e.preventDefault();
    dragDepth++;
    drop.classList.add('over');
  });
  drop.addEventListener('dragover', e => e.preventDefault());
  drop.addEventListener('dragleave', e => {
    e.preventDefault();
    if (--dragDepth <= 0) {
      dragDepth = 0;
      drop.classList.remove('over');
    }
  });
  drop.addEventListener('drop', e => {
    e.preventDefault();
    dragDepth = 0;
    drop.classList.remove('over');
    openFile(e.dataTransfer.files[0]);
  });
  fileIn.onchange = () => {
    openFile(fileIn.files[0]);
    fileIn.value = '';
  };
  $('#btnChange').onclick = () => fileIn.click();
  $('#btnNavOpen').onclick = () => fileIn.click();
  let docDragDepth = 0;
  const overlay = $('#dropOverlay');
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('dragenter', () => {
    if ($('#ws').hidden) return;
    if (++docDragDepth === 1) overlay.hidden = false;
  });
  document.addEventListener('dragleave', () => {
    if (--docDragDepth <= 0) {
      docDragDepth = 0;
      overlay.hidden = true;
    }
  });
  document.addEventListener('drop', e => {
    e.preventDefault();
    const wasOver = docDragDepth > 0;
    docDragDepth = 0;
    overlay.hidden = true;
    if ($('#ws').hidden || !wasOver) return;
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) openFile(f);
  });
  window.addEventListener('paste', e => {
    const item = [...(e.clipboardData ? e.clipboardData.items : [])]
      .find(i => i.type.startsWith('image/'));
    if (item) {
      const f = item.getAsFile();
      if (f) openFile(f);
    }
  });
}

/* ================= Procesado de imagen ================= */
async function processImage() {
  if (state.engine !== 'ia') {
    renderCurrent();
    return;
  }
  const fileRef = state.file;
  state.busy = true;
  state.cancelled = false;
  updateUI();
  showProgress(0, 'Cargando modelo de IA…');
  try {
    await loadAI();
    updateUI();
    const out = await upscaleWithAI();
    if (state.file !== fileRef) return;
    state.aiSource = out;
    renderCurrent();
    toast('Imagen mejorada con IA', 'ok');
  } catch (e) {
    if (e && e.name === 'AbortError') {
      toast('Proceso cancelado');
    } else {
      setEngine('fast');
      toast('La IA falló; se usa el motor rápido', 'err');
    }
  } finally {
    state.busy = false;
    hideProgress();
    updateUI();
  }
}

export function initUI() {
  segRes = createSegmented($('#segRes'), [['1080p', '1080p'], ['2K', '2K'], ['4K', '4K']], state.resolution, v => {
    state.resolution = v;
    state.aiSource = null;
    if (state.file) {
      updateTarget();
      renderCurrent();
    }
  });
  segEng = createSegmented($('#segEng'), [['ia', 'IA'], ['fast', 'Rápido']], state.engine, applyEngine);
  segModel = createSegmented($('#segModel'),
    [['nomos8k', 'Foto Real'], ['clear', 'Retrato'], ['esrgan', 'General']],
    state.aiModel, v => {
      state.aiModel = v;
      state.aiSource = null;
      updateUI();
      if (state.file) renderCurrent();
    });
  segPreset = createSegmented($('#segPreset'),
    [['natural', 'Natural'], ['claridad', 'Claridad'], ['vivido', 'Vívido']],
    state.preset, applyPreset);
  segFmt = createSegmented($('#segFmt'), [['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP']],
    state.format, v => {
      state.format = v;
      updateUI();
    });
  SLIDERS.forEach(([id, key, valId]) =>
    $('#' + id).addEventListener('input', e => {
      state.adj[key] = +e.target.value;
      $('#' + valId).textContent = e.target.value;
      if (state.preset) {
        state.preset = null;
        segPreset.set(null);
      }
      updatePresetHint();
      scheduleRender();
    }));
  $('#slQ').addEventListener('input', e => {
    state.quality = +e.target.value / 100;
    $('#vQ').textContent = e.target.value;
  });
  $('#btnReset').onclick = () => {
    state.adj = { ...DEFAULTS[effectiveEngine()] };
    state.preset = null;
    segPreset.set(null);
    syncSliders();
    updatePresetHint();
    scheduleRender();
  };
  $('#btnGo').onclick = () => {
    if (state.busy || state.tooBig) return;
    if (state.mediaType === 'video') processVideo();
    else processImage();
  };
  $('#btnDl').onclick = () => {
    renderCurrent();
    exportImage();
  };
  $('#btnShare').onclick = () => {
    renderCurrent();
    shareCurrent();
  };
  $('#btnCancel').onclick = () => {
    state.cancelled = true;
    if (state.aborter) state.aborter.abort();
  };
  window.addEventListener('resize', refreshAllSegmented);
  initFileInput();
  syncSliders();
  updateUI();
}
