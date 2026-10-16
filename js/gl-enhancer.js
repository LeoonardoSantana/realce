import { sourceW, sourceH } from './utils.js';

/* ================= Shaders ================= */
const VS = `attribute vec2 a;
varying vec2 v;
void main() {
  v = a * 0.5 + 0.5;
  gl_Position = vec4(a, 0.0, 1.0);
}`;

// Escalado bicubico Catmull-Rom (9 taps con filtrado LINEAR)
const FS_SCALE = `precision highp float;
varying vec2 v;
uniform sampler2D uTex;
uniform vec2 uTexSize;

vec4 catmull(sampler2D t, vec2 uv, vec2 ts) {
  vec2 sp = uv * ts;
  vec2 tp = floor(sp - 0.5) + 0.5;
  vec2 f = sp - tp;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 o12 = w2 / w12;
  vec2 t0 = (tp - 1.0) / ts;
  vec2 t3 = (tp + 2.0) / ts;
  vec2 t12 = (tp + o12) / ts;
  vec4 r = vec4(0.0);
  r += texture2D(t, vec2(t0.x, t0.y)) * w0.x * w0.y;
  r += texture2D(t, vec2(t12.x, t0.y)) * w12.x * w0.y;
  r += texture2D(t, vec2(t3.x, t0.y)) * w3.x * w0.y;
  r += texture2D(t, vec2(t0.x, t12.y)) * w0.x * w12.y;
  r += texture2D(t, vec2(t12.x, t12.y)) * w12.x * w12.y;
  r += texture2D(t, vec2(t3.x, t12.y)) * w3.x * w12.y;
  r += texture2D(t, vec2(t0.x, t3.y)) * w0.x * w3.y;
  r += texture2D(t, vec2(t12.x, t3.y)) * w12.x * w3.y;
  r += texture2D(t, vec2(t3.x, t3.y)) * w3.x * w3.y;
  return clamp(r, 0.0, 1.0);
}

void main() {
  gl_FragColor = catmull(uTex, v, uTexSize);
}`;

// Reduccion a tamano pequeno: media de 4x4 muestras bilineales en la huella
const FS_DOWN = `precision highp float;
varying vec2 v;
uniform sampler2D uTex;
uniform vec2 uSrcSize;
uniform vec2 uDstSize;

void main() {
  vec2 fp = uSrcSize / uDstSize;
  vec2 lo = (v - 0.5 / uDstSize) * uSrcSize;
  vec3 acc = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 pos = (lo + (vec2(float(i), float(j)) + 0.5) * fp / 4.0) / uSrcSize;
      acc += texture2D(uTex, pos).rgb;
    }
  }
  gl_FragColor = vec4(acc / 16.0, 1.0);
}`;

// Desenfoque gaussiano separable de 9 taps (sigma ~2.5 texels)
const FS_BLUR = `precision highp float;
varying vec2 v;
uniform sampler2D uTex;
uniform vec2 uStep;

void main() {
  vec3 acc = vec3(0.0);
  float ws = 0.0;
  for (int i = -4; i <= 4; i++) {
    float o = float(i);
    float w = exp(-o * o / 12.5);
    acc += texture2D(uTex, v + uStep * o).rgb * w;
    ws += w;
  }
  gl_FragColor = vec4(acc / ws, 1.0);
}`;

const FS_POST = `precision highp float;
varying vec2 v;
uniform sampler2D uTex;
uniform sampler2D uBlurTex;
uniform vec2 uTexSize;
uniform float uRadius;
uniform float uDenoise;
uniform float uSharpen;
uniform float uDefinition;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 px(vec2 o) {
  return texture2D(uTex, v + o * uRadius / uTexSize).rgb;
}

void main() {
  vec4 bs = texture2D(uTex, v);
  vec3 base = bs.rgb;
  vec3 c = base;
  if (uDenoise > 0.001) {
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    for (int j = -2; j <= 2; j++) {
      for (int i = -2; i <= 2; i++) {
        vec2 o = vec2(float(i), float(j));
        vec3 s = px(o);
        float w = exp(-dot(o, o) / 4.5) * exp(-dot(s - base, s - base) / 0.02);
        sum += s * w;
        ws += w;
      }
    }
    c = mix(base, sum / ws, uDenoise);
  }
  if (uSharpen > 0.001) {
    vec3 blur = (
      px(vec2(-1.0, -1.0)) + 2.0 * px(vec2(0.0, -1.0)) + px(vec2(1.0, -1.0)) +
      2.0 * px(vec2(-1.0, 0.0)) + 4.0 * c + 2.0 * px(vec2(1.0, 0.0)) +
      px(vec2(-1.0, 1.0)) + 2.0 * px(vec2(0.0, 1.0)) + px(vec2(1.0, 1.0))) / 16.0;
    c = c + uSharpen * (c - blur);
  }
  if (uDefinition > 0.001) {
    float L = luma(c);
    float Lb = luma(texture2D(uBlurTex, v).rgb);
    float d = L - Lb;
    d = d / (1.0 + abs(d) * 3.0);
    float m = clamp(4.0 * L * (1.0 - L), 0.0, 1.0);
    c += vec3(uDefinition * 2.0 * d * m);
  }
  c = (c - 0.5) * uContrast + 0.5 + uBrightness;
  c = mix(vec3(luma(c)), c, uSaturation);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), bs.a);
}`;

/* ================= Motor rápido (WebGL) ================= */
function makeShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}

function makeProgram(gl, fsSource) {
  const p = gl.createProgram();
  gl.attachShader(p, makeShader(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, makeShader(gl, gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) || 'link');
  return p;
}

function makeTexture(gl) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
}

function attachTarget(gl, fbo, tex, w, h) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
}

export class GLEnhancer {
  constructor(canvas) {
    this.canvas = canvas;
    const attrs = { preserveDrawingBuffer: true, premultipliedAlpha: false };
    const gl = this.gl = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs);
    if (!gl) throw new Error('no-webgl');
    this.progScale = makeProgram(gl, FS_SCALE);
    this.progDown = makeProgram(gl, FS_DOWN);
    this.progBlur = makeProgram(gl, FS_BLUR);
    this.progPost = makeProgram(gl, FS_POST);
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.tex = makeTexture(gl);
    this.fboTex = makeTexture(gl);
    this.fbo = gl.createFramebuffer();
    this.max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.tmp = document.createElement('canvas');
    this.srcW = 0;
    this.srcH = 0;
    this.smallW = 0;
    this.smallH = 0;
    this.smallTexA = null;
    this.smallTexB = null;
    this.fboA = null;
    this.fboB = null;
  }

  uLoc(prog, name) {
    const cache = prog.__u || (prog.__u = {});
    return name in cache ? cache[name] : (cache[name] = this.gl.getUniformLocation(prog, name));
  }

  quad(prog) {
    const gl = this.gl;
    const a = gl.getAttribLocation(prog, 'a');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  }

  setTarget(w, h) {
    const gl = this.gl;
    this.canvas.width = w;
    this.canvas.height = h;
    attachTarget(gl, this.fbo, this.fboTex, w, h);
    const sf = Math.min(1, 320 / Math.max(w, h));
    this.smallW = Math.max(1, Math.round(w * sf));
    this.smallH = Math.max(1, Math.round(h * sf));
    if (this.smallTexA) {
      gl.deleteTexture(this.smallTexA);
      gl.deleteTexture(this.smallTexB);
      gl.deleteFramebuffer(this.fboA);
      gl.deleteFramebuffer(this.fboB);
    }
    this.smallTexA = makeTexture(gl);
    this.smallTexB = makeTexture(gl);
    this.fboA = gl.createFramebuffer();
    this.fboB = gl.createFramebuffer();
    attachTarget(gl, this.fboA, this.smallTexA, this.smallW, this.smallH);
    attachTarget(gl, this.fboB, this.smallTexB, this.smallW, this.smallH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  upload(src) {
    const gl = this.gl;
    let s = src;
    let w = sourceW(src);
    let h = sourceH(src);
    if (Math.max(w, h) > this.max) {
      const f = this.max / Math.max(w, h);
      const t = this.tmp;
      t.width = Math.max(1, Math.floor(w * f));
      t.height = Math.max(1, Math.floor(h * f));
      t.getContext('2d').drawImage(src, 0, 0, t.width, t.height);
      s = t;
      w = t.width;
      h = t.height;
    }
    this.srcW = w;
    this.srcH = h;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s);
  }

  render(src, p) {
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.upload(src);
    gl.useProgram(this.progScale);
    this.quad(this.progScale);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.uLoc(this.progScale, 'uTex'), 0);
    gl.uniform2f(this.uLoc(this.progScale, 'uTexSize'), this.srcW, this.srcH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const df = p.definition / 100;
    if (df > 0) {
      gl.useProgram(this.progDown);
      this.quad(this.progDown);
      gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
      gl.uniform1i(this.uLoc(this.progDown, 'uTex'), 0);
      gl.uniform2f(this.uLoc(this.progDown, 'uSrcSize'), W, H);
      gl.uniform2f(this.uLoc(this.progDown, 'uDstSize'), this.smallW, this.smallH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
      gl.viewport(0, 0, this.smallW, this.smallH);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(this.progBlur);
      this.quad(this.progBlur);
      gl.uniform1i(this.uLoc(this.progBlur, 'uTex'), 0);
      gl.bindTexture(gl.TEXTURE_2D, this.smallTexA);
      gl.uniform2f(this.uLoc(this.progBlur, 'uStep'), 1 / this.smallW, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, this.smallTexB);
      gl.uniform2f(this.uLoc(this.progBlur, 'uStep'), 0, 1 / this.smallH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.useProgram(this.progPost);
    this.quad(this.progPost);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.smallTexA);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uLoc(this.progPost, 'uTex'), 0);
    gl.uniform1i(this.uLoc(this.progPost, 'uBlurTex'), 1);
    gl.uniform2f(this.uLoc(this.progPost, 'uTexSize'), W, H);
    gl.uniform1f(this.uLoc(this.progPost, 'uDenoise'), p.noise / 100);
    gl.uniform1f(this.uLoc(this.progPost, 'uSharpen'), p.sharp / 100 * 1.5);
    gl.uniform1f(this.uLoc(this.progPost, 'uDefinition'), df);
    gl.uniform1f(this.uLoc(this.progPost, 'uBrightness'), p.bright / 100);
    gl.uniform1f(this.uLoc(this.progPost, 'uContrast'), 1 + p.contrast / 100);
    gl.uniform1f(this.uLoc(this.progPost, 'uSaturation'), 1 + p.sat / 100);
    gl.uniform1f(this.uLoc(this.progPost, 'uRadius'), Math.min(4, Math.max(1, W / this.srcW)));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

/* Reserva sin WebGL: canvas 2D, escalado en pasos x2 + filtros CSS */
export class Canvas2DEnhancer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.t1 = document.createElement('canvas');
    this.t2 = document.createElement('canvas');
    this.max = 16384;
  }

  setTarget(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  render(src, p) {
    const { ctx, canvas } = this;
    let cur = src;
    let cw = sourceW(src);
    let ch = sourceH(src);
    let flip = false;
    const draw = (s, dw, dh, dst) => {
      dst.width = dw;
      dst.height = dh;
      const d = dst.getContext('2d');
      d.imageSmoothingEnabled = true;
      d.imageSmoothingQuality = 'high';
      d.drawImage(s, 0, 0, dw, dh);
    };
    let r = canvas.width / cw;
    while (r > 2 || r < .5) {
      const f = r > 2 ? 2 : .5;
      const dst = flip ? this.t1 : this.t2;
      draw(cur, Math.max(1, Math.round(cw * f)), Math.max(1, Math.round(ch * f)), dst);
      cur = dst;
      cw = dst.width;
      ch = dst.height;
      r = canvas.width / cw;
      flip = !flip;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = `brightness(${1 + p.bright / 100}) contrast(${1 + p.contrast / 100}) saturate(${1 + p.sat / 100})`;
    ctx.drawImage(cur, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
  }
}

export function createEnhancer(canvas) {
  try {
    return { enhancer: new GLEnhancer(canvas), glOK: true };
  } catch (e) {
    return { enhancer: new Canvas2DEnhancer(canvas), glOK: false };
  }
}
