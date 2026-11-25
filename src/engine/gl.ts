// Thin WebGL2 layer: programs, meshes, textures, shadow map, accumulation target.
import type { M4 } from './math';

export class Prog {
  loc = new Map<string, WebGLUniformLocation | null>();
  constructor(public gl: WebGL2RenderingContext, public p: WebGLProgram) {}
  use() { this.gl.useProgram(this.p); }
  l(n: string) { let v = this.loc.get(n); if (v === undefined) { v = this.gl.getUniformLocation(this.p, n); this.loc.set(n, v); } return v; }
  f(n: string, x: number) { const l = this.l(n); if (l) this.gl.uniform1f(l, x); }
  i(n: string, x: number) { const l = this.l(n); if (l) this.gl.uniform1i(l, x); }
  v2(n: string, a: number, b: number) { const l = this.l(n); if (l) this.gl.uniform2f(l, a, b); }
  v3(n: string, a: ArrayLike<number>) { const l = this.l(n); if (l) this.gl.uniform3f(l, a[0], a[1], a[2]); }
  v4(n: string, a: ArrayLike<number>) { const l = this.l(n); if (l) this.gl.uniform4f(l, a[0], a[1], a[2], a[3]); }
  m(n: string, m: M4 | Float32Array) { const l = this.l(n); if (l) this.gl.uniformMatrix4fv(l, false, m); }
}

export interface Mesh { vao: WebGLVertexArrayObject; count: number; type: number; bufs: WebGLBuffer[]; ib?: WebGLBuffer; dyn: boolean; }
export interface AttrSpec { loc: number; data: Float32Array; size: number; }

export class GL {
  gl: WebGL2RenderingContext;
  progs = new Map<string, Prog>();
  aniso = 1;
  maxTex = 4096;
  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', depth: true, stencil: false });
    if (!gl) throw new Error('webgl2 unavailable');
    this.gl = gl;
    const ex = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ex) this.aniso = Math.min(8, gl.getParameter(ex.MAX_TEXTURE_MAX_ANISOTROPY_EXT));
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  }

  program(name: string, vs: string, fs: string): Prog {
    const hit = this.progs.get(name); if (hit) return hit;
    const gl = this.gl;
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s) || '';
        const lines = src.split('\n'); const m = /0:(\d+)/.exec(log);
        const ctx = m ? lines.slice(Math.max(0, +m[1] - 3), +m[1] + 2).join('\n') : '';
        throw new Error(`shader ${name} (${type === gl.VERTEX_SHADER ? 'vs' : 'fs'}): ${log}\n${ctx}`);
      }
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link ${name}: ${gl.getProgramInfoLog(p)}`);
    const pr = new Prog(gl, p); this.progs.set(name, pr); return pr;
  }

  mesh(attrs: AttrSpec[], indices: Uint16Array | Uint32Array | null, count?: number, dyn = false): Mesh {
    const gl = this.gl, vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
    const bufs: WebGLBuffer[] = [];
    for (const a of attrs) {
      const b = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, a.data, dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      gl.enableVertexAttribArray(a.loc); gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, 0, 0); bufs.push(b);
    }
    let ib: WebGLBuffer | undefined, type: number = gl.UNSIGNED_SHORT, n = count ?? 0;
    if (indices) {
      ib = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      type = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT; n = indices.length;
    }
    gl.bindVertexArray(null);
    return { vao, count: n, type, bufs, ib, dyn };
  }
  update(m: Mesh, i: number, data: Float32Array) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, m.bufs[i]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  }
  draw(m: Mesh, mode = this.gl.TRIANGLES, count?: number) {
    const gl = this.gl; gl.bindVertexArray(m.vao);
    if (m.ib) gl.drawElements(mode, count ?? m.count, m.type, 0); else gl.drawArrays(mode, 0, count ?? m.count);
  }

  tex(src: TexImageSource, o: { srgb?: boolean; mip?: boolean; wrap?: number; flipY?: boolean; maxSize?: number } = {}): WebGLTexture {
    const gl = this.gl, t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, o.flipY ?? true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    let s: TexImageSource = src;
    const w = (src as any).width as number, h = (src as any).height as number;
    const lim = Math.min(o.maxSize ?? 16384, this.maxTex);
    if (w > lim || h > lim) {
      const k = lim / Math.max(w, h), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      const cx = c.getContext('2d')!; cx.imageSmoothingQuality = 'high'; cx.drawImage(src as CanvasImageSource, 0, 0, c.width, c.height); s = c;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, o.srgb === false ? gl.RGBA8 : gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, s);
    const mip = o.mip ?? true;
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wr = o.wrap ?? gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
    const ex = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ex && mip) gl.texParameterf(gl.TEXTURE_2D, ex.TEXTURE_MAX_ANISOTROPY_EXT, this.aniso);
    return t;
  }
  updateTex(t: WebGLTexture, src: TexImageSource) {
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
  }
  bind(unit: number, t: WebGLTexture) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }

  // ---- shadow map (hardware compare + raw depth sampler for blocker search)
  shadow(size: number) {
    const gl = this.gl;
    const depth = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, depth);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const fb = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const raw = gl.createSampler()!;
    gl.samplerParameteri(raw, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.samplerParameteri(raw, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.samplerParameteri(raw, gl.TEXTURE_COMPARE_MODE, gl.NONE);
    gl.samplerParameteri(raw, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.samplerParameteri(raw, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { depth, fb, raw, size };
  }

  // ---- RGBA8 accumulation target (motion blur)
  target(w: number, h: number) {
    const gl = this.gl;
    const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindTexture(gl.TEXTURE_2D, null);
    return { tex: t, fb, w, h };
  }
}
