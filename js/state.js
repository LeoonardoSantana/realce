/* ================= Estado ================= */
export const DEFAULTS = {
  ia: { sharp: 10, noise: 0, bright: 0, contrast: 0, sat: 0, definition: 0 },
  fast: { sharp: 40, noise: 20, bright: 0, contrast: 5, sat: 5, definition: 0 }
};

export const AUTO = {
  ia: { sharp: 20, noise: 0, bright: 0, contrast: 5, sat: 8, definition: 30 },
  fast: { sharp: 50, noise: 25, bright: 0, contrast: 8, sat: 10, definition: 35 }
};

export const state = {
  file: null,
  url: null,
  mediaType: null,          // 'image' | 'video'
  image: null,              // canvas normalizado (orientación EXIF aplicada)
  aiSource: null,           // canvas resultado de la IA
  origW: 0,
  origH: 0,
  duration: 0,
  resolution: '2K',
  engine: 'ia',
  format: 'png',
  quality: 0.9,
  adj: { ...DEFAULTS.ia },
  busy: false,
  cancelled: false,
  tooBig: false,
  downscaled: false,
  aiLoad: null,
  aiEP: null,
  audioCtx: null,
  mediaSource: null,
  mediaDest: null,
  wakeLock: null,
  enhancer: null,
  glOK: true,
  history: [],
  share: null,
  comparePos: 50,
  target: { w: 0, h: 0 }
};
