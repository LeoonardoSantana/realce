/* ================= Estado ================= */
export const DEFAULTS = {
  ia:   { sharp: 18, definition: 15, noise: 45, skin: 35, fidelity: 18, bright: 0, contrast: 4, sat: 4 },
  fast: { sharp: 42, definition: 20, noise: 55, skin: 35, fidelity: 0,  bright: 0, contrast: 6, sat: 5 }
};

export const PRESETS = {
  natural: {
    label: 'Natural',
    hint: 'Fotorrealista sin grano: limpia ruido, recupera rostros/piel y conserva textura natural.',
    ia:   { sharp: 18, definition: 15, noise: 50, skin: 45, fidelity: 22, bright: 0, contrast: 4,  sat: 4 },
    fast: { sharp: 35, definition: 18, noise: 60, skin: 45, fidelity: 0,  bright: 0, contrast: 4,  sat: 4 }
  },
  claridad: {
    label: 'Claridad',
    hint: 'Máximo detalle y limpieza de grano: ideal para rostros borrosos, paisajes y texto.',
    ia:   { sharp: 35, definition: 45, noise: 65, skin: 55, fidelity: 15, bright: 0, contrast: 8,  sat: 6 },
    fast: { sharp: 60, definition: 45, noise: 70, skin: 50, fidelity: 0,  bright: 0, contrast: 8,  sat: 6 }
  },
  vivido: {
    label: 'Vívido',
    hint: 'Piel limpia sin ruido con color y contraste fotorrealista: ideal para retratos y redes.',
    ia:   { sharp: 24, definition: 30, noise: 55, skin: 50, fidelity: 18, bright: 2, contrast: 12, sat: 18 },
    fast: { sharp: 45, definition: 30, noise: 60, skin: 50, fidelity: 0,  bright: 2, contrast: 12, sat: 18 }
  }
};

export const AI_MODELS = {
  nomos8k: {
    label: 'Foto Real',
    url: 'models/4x-nomos8k-photo.onnx',
    hint: 'Nomos8k (100 % fotografía real): elimina grano/compresión y reconstruye rostros y texturas reales.'
  },
  clear: {
    label: 'Retrato',
    url: 'models/4x-clear-reality.onnx',
    hint: 'ClearReality: suaviza imperfecciones y recupera facciones limpias con aspecto fotográfico.'
  },
  esrgan: {
    label: 'General',
    url: 'models/realesr-general-x4v3.onnx',
    hint: 'Real-ESRGAN: uso general para bordes marcados, texto, ilustraciones y fotos.'
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
  aiModel: 'nomos8k',
  preset: null,
  format: 'png',
  quality: 0.9,
  adj: { ...DEFAULTS.ia },
  busy: false,
  cancelled: false,
  tooBig: false,
  downscaled: false,
  aiLoad: null,
  aborter: null,
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
