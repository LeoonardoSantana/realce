/* ================= Estado ================= */
export const DEFAULTS = {
  ia: { sharp: 10, noise: 0, bright: 0, contrast: 0, sat: 0, definition: 0 },
  fast: { sharp: 40, noise: 20, bright: 0, contrast: 5, sat: 5, definition: 0 }
};

export const PRESETS = {
  natural: {
    label: 'Natural',
    hint: 'Fiel al original: limpia y define sin que se note el procesado.',
    ia:   { sharp: 10, definition: 10, noise: 0,  bright: 0, contrast: 0,  sat: 0 },
    fast: { sharp: 30, definition: 10, noise: 15, bright: 0, contrast: 3,  sat: 3 }
  },
  claridad: {
    label: 'Claridad',
    hint: 'Máximo detalle y textura: ideal para paisajes, arquitectura y texto.',
    ia:   { sharp: 30, definition: 45, noise: 0,  bright: 0, contrast: 5,  sat: 5 },
    fast: { sharp: 60, definition: 45, noise: 25, bright: 0, contrast: 6,  sat: 5 }
  },
  vivido: {
    label: 'Vívido',
    hint: 'Más color y contraste con buena definición: ideal para redes y retratos.',
    ia:   { sharp: 20, definition: 30, noise: 0,  bright: 3, contrast: 12, sat: 20 },
    fast: { sharp: 45, definition: 30, noise: 20, bright: 3, contrast: 12, sat: 20 }
  }
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
  preset: null,
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
