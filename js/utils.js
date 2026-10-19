/* ================= Utilidades ================= */
export const $ = selector => document.querySelector(selector);

export const formatMB = bytes => (bytes / 1048576).toFixed(1) + ' MB';

export const formatTime = seconds => {
  if (!isFinite(seconds)) return '0:00';
  const s = Math.max(0, seconds | 0);
  return (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0');
};

export const sourceW = s => s.videoWidth || s.naturalWidth || s.width;
export const sourceH = s => s.videoHeight || s.naturalHeight || s.height;

export function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  setTimeout(() => {
    el.classList.remove('on');
    setTimeout(() => el.remove(), 320);
  }, 3800);
}

const BASE_TITLE = document.title || 'Realce — Mejora imágenes y videos a 2K y 4K';

export function showProgress(pct, txt) {
  const clamped = Math.min(100, Math.max(0, pct));
  const rounded = Math.round(clamped);
  $('#progWrap').hidden = false;
  $('#progBar').style.width = clamped + '%';
  $('#progTrack').setAttribute('aria-valuenow', rounded);
  $('#progTxt').textContent = txt || '';
  document.title = `(${rounded}%) Realce — Procesando…`;
}

export function hideProgress() {
  $('#progWrap').hidden = true;
  document.title = BASE_TITLE;
}

/* ================= Ejecución continua en 2.º plano + Notificaciones ================= */
let wakeSentinel = null;
let webLockRelease = null;
let keepAliveAudioCtx = null;
let keepAliveOsc = null;
let guardActive = false;

async function acquireWakeSentinel() {
  try {
    if (navigator.wakeLock && !document.hidden) {
      wakeSentinel = await navigator.wakeLock.request('screen');
    }
  } catch (e) {}
}

function startSilentAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!keepAliveAudioCtx) keepAliveAudioCtx = new AC();
    if (keepAliveAudioCtx.state === 'suspended') keepAliveAudioCtx.resume();
    if (!keepAliveOsc) {
      const osc = keepAliveAudioCtx.createOscillator();
      const gain = keepAliveAudioCtx.createGain();
      // Ganancia prácticamente cero (-100 dB): inaudible pero evita que el navegador congele la pestaña en 2.º plano
      gain.gain.value = 0.00001;
      osc.frequency.value = 1;
      osc.connect(gain);
      gain.connect(keepAliveAudioCtx.destination);
      osc.start();
      keepAliveOsc = osc;
    }
  } catch (e) {}
}

function stopSilentAudio() {
  try {
    if (keepAliveOsc) {
      keepAliveOsc.stop();
      keepAliveOsc.disconnect();
      keepAliveOsc = null;
    }
    if (keepAliveAudioCtx && keepAliveAudioCtx.state === 'running') {
      keepAliveAudioCtx.suspend();
    }
  } catch (e) {}
}

export async function startBackgroundGuard() {
  guardActive = true;
  // Pedir permiso de notificaciones aprovecha el gesto del usuario al pulsar "Mejorar"
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  } catch (e) {}
  await acquireWakeSentinel();
  startSilentAudio();
  try {
    if (navigator.locks && navigator.locks.request && !webLockRelease) {
      navigator.locks.request('realce-active-job', () => new Promise(res => {
        webLockRelease = res;
      })).catch(() => {});
    }
  } catch (e) {}
}

export async function stopBackgroundGuard() {
  guardActive = false;
  stopSilentAudio();
  if (webLockRelease) {
    const rel = webLockRelease;
    webLockRelease = null;
    rel();
  }
  try {
    if (wakeSentinel) await wakeSentinel.release();
  } catch (e) {}
  wakeSentinel = null;
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && guardActive && !wakeSentinel) {
    acquireWakeSentinel();
  }
});

window.addEventListener('beforeunload', e => {
  if (guardActive) {
    e.preventDefault();
    e.returnValue = '';
  }
});

export async function notifyCompletion(title, body) {
  // Si el usuario está en otra pestaña o la ventana no tiene el foco, enviamos notificación del sistema
  if (!document.hidden && document.hasFocus && document.hasFocus()) return;
  document.title = `✓ ${title} — Realce`;
  const restoreTitle = () => {
    if ($('#progWrap').hidden) document.title = BASE_TITLE;
    window.removeEventListener('focus', restoreTitle);
    document.removeEventListener('visibilitychange', restoreTitle);
  };
  window.addEventListener('focus', restoreTitle);
  document.addEventListener('visibilitychange', restoreTitle);
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = {
    body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'realce-done',
    renotify: true
  };
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) {
      await reg.showNotification(title, opts);
      return;
    }
  } catch (e) {}
  try {
    const n = new Notification(title, opts);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (e) {}
}

export function downloadBlob(blob, name, url) {
  const href = url || URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // No revocar a los 4 s: en videos grandes o tras horas sin interacción el navegador puede tardar en iniciar la descarga
  if (!url) setTimeout(() => URL.revokeObjectURL(href), 300000);
  return href;
}

export function loadScript(src, integrity) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    if (integrity) {
      s.integrity = integrity;
      s.crossOrigin = 'anonymous';
    }
    s.onload = resolve;
    s.onerror = () => reject(new Error('cdn'));
    document.head.appendChild(s);
  });
}
