import { $ } from './utils.js';
import { state } from './state.js';
import { createSegmented } from './segmented.js';

/* ================= Comparador ================= */
const view = { z: 1, tx: 0, ty: 0, mode: 'fit' };
let cmp, beforeLayer, divider, stageAfter, stageBefore, afterCanvas, zoomSeg;
let drag = null;
let lastTap = 0;
const pointers = new Map();

function setPosition(p) {
  state.comparePos = Math.max(0, Math.min(100, p));
  beforeLayer.style.clipPath = `inset(0 ${100 - state.comparePos}% 0 0)`;
  divider.style.left = state.comparePos + '%';
  cmp.setAttribute('aria-valuenow', Math.round(state.comparePos));
}

function applyView() {
  const t = `translate(${view.tx}px,${view.ty}px) scale(${view.z})`;
  stageAfter.style.transform = t;
  stageBefore.style.transform = t;
}

function fitScale() {
  const r = cmp.getBoundingClientRect();
  return afterCanvas.width ? r.width / afterCanvas.width : 1;
}

function clampView() {
  const r = cmp.getBoundingClientRect();
  const w = afterCanvas.width * view.z;
  const h = afterCanvas.height * view.z;
  view.tx = w > r.width ? Math.min(0, Math.max(r.width - w, view.tx)) : (r.width - w) / 2;
  view.ty = h > r.height ? Math.min(0, Math.max(r.height - h, view.ty)) : (r.height - h) / 2;
}

function syncZoomUI() {
  zoomSeg.set(view.mode === 'custom' ? null : view.mode);
}

export function resetView() {
  cmp.classList.remove('zoom');
  cmp.style.aspectRatio =
    afterCanvas.width && afterCanvas.height ? afterCanvas.width + '/' + afterCanvas.height : '';
  view.z = fitScale();
  view.tx = 0;
  view.ty = 0;
  view.mode = 'fit';
  applyView();
  syncZoomUI();
}

function setMode(m, cx, cy) {
  if (m === 'fit') {
    resetView();
    return;
  }
  const dpr = devicePixelRatio || 1;
  const nz = +m / 100 / dpr;
  const r = cmp.getBoundingClientRect();
  if (cx == null) {
    cx = r.width / 2;
    cy = r.height / 2;
  }
  const sx = (cx - view.tx) / view.z;
  const sy = (cy - view.ty) / view.z;
  cmp.classList.add('zoom');
  cmp.style.aspectRatio = '';
  view.z = nz;
  view.tx = cx - sx * nz;
  view.ty = cy - sy * nz;
  view.mode = m;
  clampView();
  applyView();
  syncZoomUI();
}

function zoomToAt(nz, cx, cy) {
  const dpr = devicePixelRatio || 1;
  const lo = fitScale();
  const hi = 4 / dpr;
  nz = Math.min(hi, Math.max(lo, nz));
  if (nz <= lo * 1.001) {
    resetView();
    return;
  }
  const sx = (cx - view.tx) / view.z;
  const sy = (cy - view.ty) / view.z;
  cmp.classList.add('zoom');
  cmp.style.aspectRatio = '';
  view.z = nz;
  view.tx = cx - sx * nz;
  view.ty = cy - sy * nz;
  view.mode = 'custom';
  clampView();
  applyView();
  syncZoomUI();
}

function toggleAt(cx, cy) {
  if (view.mode === 'fit') setMode('100', cx, cy);
  else setMode('fit');
}

function onPointerDown(e) {
  if (state.busy) return;
  cmp.setPointerCapture(e.pointerId);
  const r = cmp.getBoundingClientRect();
  const cx = e.clientX - r.left;
  const cy = e.clientY - r.top;
  if (e.pointerType !== 'mouse') {
    const now = performance.now();
    if (now - lastTap < 350) {
      lastTap = 0;
      pointers.clear();
      drag = null;
      toggleAt(cx, cy);
      return;
    }
    lastTap = now;
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    drag = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.z };
    return;
  }
  drag = {
    type: (e.target.closest('.handle') || view.mode === 'fit') ? 'div' : 'pan',
    x: e.clientX,
    y: e.clientY,
    tx0: view.tx,
    ty0: view.ty
  };
  if (drag.type === 'div') setPosition(cx / r.width * 100);
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId) || !drag) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const r = cmp.getBoundingClientRect();
  const cx = e.clientX - r.left;
  const cy = e.clientY - r.top;
  if (drag.type === 'pinch') {
    if (pointers.size < 2) {
      drag = null;
      return;
    }
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomToAt(drag.z0 * d / drag.d0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
  } else if (drag.type === 'pan') {
    view.tx = drag.tx0 + e.clientX - drag.x;
    view.ty = drag.ty0 + e.clientY - drag.y;
    clampView();
    applyView();
  } else {
    setPosition(cx / r.width * 100);
  }
}

function onPointerEnd(e) {
  pointers.delete(e.pointerId);
  if (drag && drag.type === 'pinch' && pointers.size === 1) {
    const [p] = [...pointers.values()];
    drag = { type: 'pan', x: p.x, y: p.y, tx0: view.tx, ty0: view.ty };
  } else if (pointers.size === 0) {
    drag = null;
  }
}

export function initCompare() {
  cmp = $('#cmp');
  beforeLayer = $('#lBefore');
  divider = $('#divi');
  stageAfter = $('#stA');
  stageBefore = $('#stB');
  afterCanvas = $('#cvAfter');
  cmp.addEventListener('pointerdown', onPointerDown);
  cmp.addEventListener('pointermove', onPointerMove);
  cmp.addEventListener('pointerup', onPointerEnd);
  cmp.addEventListener('pointercancel', onPointerEnd);
  cmp.addEventListener('dblclick', e => {
    e.preventDefault();
    const r = cmp.getBoundingClientRect();
    toggleAt(e.clientX - r.left, e.clientY - r.top);
  });
  cmp.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = cmp.getBoundingClientRect();
    zoomToAt(view.z * Math.exp(-e.deltaY * .01), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  cmp.addEventListener('keydown', e => {
    const r = cmp.getBoundingClientRect();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      setPosition(state.comparePos - 2);
      e.preventDefault();
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      setPosition(state.comparePos + 2);
      e.preventDefault();
    }
    if (e.key === '+' || e.key === '=') {
      zoomToAt(view.z * 1.25, r.width / 2, r.height / 2);
      e.preventDefault();
    }
    if (e.key === '-' || e.key === '_') {
      zoomToAt(view.z / 1.25, r.width / 2, r.height / 2);
      e.preventDefault();
    }
  });
  window.addEventListener('resize', () => {
    if (!state.file) return;
    if (view.mode === 'fit') resetView();
    else {
      clampView();
      applyView();
    }
  });
  zoomSeg = createSegmented($('#segZoom'),
    [['fit', 'Ajustar'], ['100', '100%'], ['200', '200%']], 'fit', v => setMode(v));
  setPosition(50);
}
