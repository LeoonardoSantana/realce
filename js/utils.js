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

export function showProgress(pct, txt) {
  const clamped = Math.min(100, Math.max(0, pct));
  $('#progWrap').hidden = false;
  $('#progBar').style.width = clamped + '%';
  $('#progTrack').setAttribute('aria-valuenow', Math.round(clamped));
  $('#progTxt').textContent = txt || '';
}

export function hideProgress() {
  $('#progWrap').hidden = true;
}

export function downloadBlob(blob, name, url) {
  const a = document.createElement('a');
  a.href = url || URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (!url) setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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
