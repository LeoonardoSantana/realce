import { $, toast, formatTime, showProgress, hideProgress, downloadBlob } from './utils.js';
import { state } from './state.js';
import { exportImage, addHistory, outputName, baseName } from './export.js';
import { exportVideoWebCodecs } from './video-export.js';
import { loadAI, upscaleWithAI } from './ai.js';

/* ================= Procesado de video ================= */
let renderFrame = () => {};
let updateUI = () => {};
let openFileFn = () => {};
let setEngineFn = () => {};
let paramsFn = () => ({ sharp: 0, noise: 0, skin: 0, fidelity: 0, bright: 0, contrast: 0, sat: 0, definition: 0 });
let frameCanvas = null;
const video = () => $('#vid');

export function webCodecsSupported() {
  return 'VideoEncoder' in window && 'VideoDecoder' in window;
}

async function setupAudio(stream) {
  try {
    if (!state.audioCtx) return false;
    if (!state.mediaSource) {
      state.mediaSource = state.audioCtx.createMediaElementSource(video());
      state.mediaDest = state.audioCtx.createMediaStreamDestination();
      state.mediaSource.connect(state.mediaDest);
    }
    if (state.audioCtx.state === 'suspended') await state.audioCtx.resume();
    state.mediaDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    video().muted = false;
    return true;
  } catch (e) {
    video().muted = true;
    return false;
  }
}

async function lockWake() {
  try {
    state.wakeLock = await (navigator.wakeLock && navigator.wakeLock.request('screen'));
  } catch (e) {}
}

async function unlockWake() {
  try {
    if (state.wakeLock) await state.wakeLock.release();
  } catch (e) {}
  state.wakeLock = null;
}

export async function processVideo() {
  if (webCodecsSupported()) return processVideoWebCodecs();
  return processVideoRecorder();
}

/* ---- Fotograma a fotograma (WebCodecs + Mediabunny) ---- */
async function renderSample(sample) {
  if (!frameCanvas) frameCanvas = document.createElement('canvas');
  const w = sample.displayWidth;
  const h = sample.displayHeight;
  if (frameCanvas.width !== w || frameCanvas.height !== h) {
    frameCanvas.width = w;
    frameCanvas.height = h;
  }
  sample.draw(frameCanvas.getContext('2d'), 0, 0);
  if (state.engine === 'ia') {
    const aiOut = await upscaleWithAI(frameCanvas, true);
    state.enhancer.render(aiOut, paramsFn(), frameCanvas);
  } else {
    state.enhancer.render(frameCanvas, paramsFn(), frameCanvas);
  }
  const cb = $('#cvBefore');
  cb.getContext('2d').drawImage(frameCanvas, 0, 0, cb.width, cb.height);
  return $('#cvAfter');
}

async function processVideoWebCodecs() {
  state.busy = true;
  state.cancelled = false;
  updateUI();
  showProgress(0, state.engine === 'ia' ? 'Cargando modelo de IA para video…' : 'Generando video…');
  await lockWake();
  const aborter = new AbortController();
  state.aborter = aborter;
  try {
    if (state.engine === 'ia') {
      await loadAI();
      updateUI();
    }
    const t0 = performance.now();
    const blob = await exportVideoWebCodecs({
      file: state.file,
      width: state.target.w,
      height: state.target.h,
      render: renderSample,
      onProgress: p => {
        const elapsed = (performance.now() - t0) / 1000;
        const eta = p > 0 ? elapsed / p * (1 - p) : 0;
        const label = state.engine === 'ia' ? 'Video con IA' : 'Generando video';
        showProgress(p * 100,
          `${label} · ${Math.round(p * 100)} % · quedan ${formatTime(eta)}`);
      },
      signal: aborter.signal
    });
    const name = outputName('mp4');
    downloadBlob(blob, name);
    addHistory(blob, name);
    const sharedFile = new File([blob], name, { type: 'video/mp4' });
    state.share = (navigator.canShare && navigator.canShare({ files: [sharedFile] }))
      ? { files: [sharedFile], title: name }
      : null;
    toast('Video mejorado descargado', 'ok');
  } catch (e) {
    const mb = await import('../vendor/mediabunny-1.61.3.min.mjs').catch(() => null);
    if (state.cancelled || (mb && e instanceof mb.ConversionCanceledError)) {
      toast('Proceso cancelado');
    } else {
      state.busy = false;
      state.aborter = null;
      hideProgress();
      updateUI();
      await unlockWake();
      toast('No se pudo generar el video con este método; se usará la grabación en tiempo real', 'err');
      return processVideoRecorder();
    }
  } finally {
    if (state.aborter === aborter) {
      state.busy = false;
      state.aborter = null;
      hideProgress();
      updateUI();
      await unlockWake();
    }
  }
}

/* ---- Grabación en tiempo real (MediaRecorder) ---- */
async function processVideoRecorder() {
  const afterCanvas = $('#cvAfter');
  const vid = video();
  if (!afterCanvas.captureStream || !window.MediaRecorder) {
    toast('Tu navegador no permite grabar el video procesado', 'err');
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && !state.audioCtx) {
    try { state.audioCtx = new AC(); } catch (e) {}
  }
  if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume();
  state.busy = true;
  state.cancelled = false;
  updateUI();
  showProgress(0, 'Preparando…');
  const stream = afterCanvas.captureStream(30);
  const endTracks = () => {
    stream.getVideoTracks().forEach(t => t.stop());
    stream.getAudioTracks().forEach(t => stream.removeTrack(t));
  };
  const hadAudio = await setupAudio(stream);
  await lockWake();
  const mime = [
    'video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'
  ].find(m => MediaRecorder.isTypeSupported(m)) || '';
  let rec;
  try {
    rec = new MediaRecorder(stream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: state.resolution === '4K' ? 40000000 : 20000000
    });
  } catch (e) {
    state.busy = false;
    hideProgress();
    updateUI();
    unlockWake();
    endTracks();
    toast('No se pudo iniciar la grabación', 'err');
    return;
  }
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise(res => rec.onstop = res);
  const abort = async msg => {
    try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {}
    await stopped;
    vid.pause();
    vid.muted = true;
    endTracks();
    await unlockWake();
    state.busy = false;
    hideProgress();
    updateUI();
    toast(msg, 'err');
  };
  try { vid.currentTime = 0; } catch (e) {}
  await new Promise(res => {
    vid.onseeked = res;
    setTimeout(res, 800);
  });
  rec.start(500);
  renderFrame();
  try {
    await vid.play();
  } catch (e) {
    vid.muted = true;
    try {
      await vid.play();
    } catch (e2) {
      await abort('No se pudo reproducir el video');
      return;
    }
    if (hadAudio) toast('Se grabará sin audio');
  }
  const loop = () => {
    if (state.cancelled || vid.ended || !state.busy) return;
    renderFrame();
    const p = vid.duration ? vid.currentTime / vid.duration : 0;
    showProgress(p * 100, `Quedan ${formatTime(vid.duration - vid.currentTime)}`);
    if ('requestVideoFrameCallback' in vid) vid.requestVideoFrameCallback(() => loop());
    else requestAnimationFrame(loop);
  };
  loop();
  let stoppedEarly = false;
  let videoError = false;
  await new Promise(res => {
    let settled = false;
    let lastT = vid.currentTime;
    let lastAdvance = performance.now();
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(iv);
      vid.removeEventListener('ended', finish);
      vid.removeEventListener('timeupdate', onTime);
      vid.removeEventListener('error', onErr);
      res();
    };
    const onTime = () => {
      if (vid.duration && vid.currentTime >= vid.duration - 0.05) finish();
    };
    const onErr = () => {
      videoError = true;
      finish();
    };
    const iv = setInterval(() => {
      if (state.cancelled) {
        finish();
        return;
      }
      if (vid.ended || (vid.duration && vid.currentTime >= vid.duration - 0.05)) {
        finish();
        return;
      }
      if (!vid.paused) {
        if (vid.currentTime !== lastT) {
          lastT = vid.currentTime;
          lastAdvance = performance.now();
        } else if (performance.now() - lastAdvance > 4000) {
          stoppedEarly = true;
          finish();
        }
      }
    }, 250);
    vid.addEventListener('ended', finish);
    vid.addEventListener('timeupdate', onTime);
    vid.addEventListener('error', onErr);
  });
  vid.pause();
  vid.muted = true;
  if (rec.state !== 'inactive') rec.stop();
  await stopped;
  endTracks();
  await unlockWake();
  state.busy = false;
  hideProgress();
  updateUI();
  if (state.cancelled) {
    toast('Proceso cancelado');
    return;
  }
  if (videoError) {
    toast('Error al leer el video durante el procesado', 'err');
    return;
  }
  if (stoppedEarly)
    toast('El video se detuvo antes de tiempo; se guardó lo procesado');
  const type = mime || 'video/webm';
  const blob = new Blob(chunks, { type });
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  const name = outputName(ext);
  downloadBlob(blob, name);
  addHistory(blob, name);
  const sharedFile = new File([blob], name, { type });
  state.share = (navigator.canShare && navigator.canShare({ files: [sharedFile] }))
    ? { files: [sharedFile], title: name }
    : null;
  toast('Video mejorado descargado', 'ok');
}

function frameStamp(vid) {
  const t = vid.currentTime || 0;
  return Math.floor(t / 60) + 'm' + String(Math.floor(t % 60)).padStart(2, '0') + 's';
}

export function initVideo(callbacks) {
  renderFrame = callbacks.renderCurrent;
  updateUI = callbacks.updateUI;
  openFileFn = callbacks.openFile;
  setEngineFn = callbacks.setEngine;
  paramsFn = callbacks.params;
  const vid = video();
  const seek = $('#seek');
  seek.addEventListener('input', () => {
    vid.currentTime = +seek.value;
    $('#seekT').textContent = formatTime(+seek.value);
  });
  vid.addEventListener('seeked', () => {
    if (state.mediaType === 'video' && !state.busy) renderFrame();
  });
  vid.addEventListener('timeupdate', () => {
    if (!state.busy) {
      seek.value = vid.currentTime;
      $('#seekT').textContent = formatTime(vid.currentTime);
    }
  });
  $('#btnFrame').onclick = () => {
    if (!state.busy) renderFrame();
    const ext = state.format === 'jpg' ? 'jpg' : state.format;
    exportImage(`${baseName()}-fotograma-${frameStamp(vid)}-${state.resolution}.${ext}`);
  };
  $('#btnFrameAI').onclick = () => {
    if (state.busy) return;
    const c = document.createElement('canvas');
    c.width = vid.videoWidth;
    c.height = vid.videoHeight;
    c.getContext('2d').drawImage(vid, 0, 0);
    c.toBlob(async b => {
      if (!b) {
        toast('No se pudo capturar el fotograma', 'err');
        return;
      }
      const f = new File([b], `${baseName()}-fotograma-${frameStamp(vid)}.png`, { type: 'image/png' });
      const ok = await openFileFn(f);
      if (!ok) return;
      setEngineFn('ia');
      toast('Fotograma abierto como imagen. Pulsa «Mejorar con IA».');
    }, 'image/png');
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.busy && state.mediaType === 'video' && !vid.paused) lockWake();
  });
}
