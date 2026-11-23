/* ==========================================================
   3D renderer (canvas, software projection + painter's algorithm).
   Plot kinds:  surf   z = f(x, y)
                psurf  (x(u,v), y(u,v), z(u,v))
                isurf  F(x, y, z) = 0   (marching tetrahedra)
                curve3 (x(t), y(t), z(t))
                pt3    (x, y, z)
   Exposes window.Graph3D
   ========================================================== */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }
  function fmtT(v, step) {
    if (Math.abs(v) < step * 1e-9) return '0';
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    const s = v.toFixed(Math.min(dec, 8));
    return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s;
  }
  function rgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [45, 112, 179];
  }

  // marching tetrahedra tables
  const CORNERS = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];

  class Graph3D {
    constructor(host) {
      this.host = host;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'g3-canvas';
      host.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.cam = { az: 0.85, el: 0.5, dist: 6.4 };
      this.box = [-5, 5, -5, 5, -5, 5];
      this.plots = [];
      this.settings = { grid: true, numbers: true, spin: false };
      this.w = 100; this.h = 100; this.dpr = 1;
      this.interacting = false;
      this._raf = 0; this._idle = 0; this._spin = 0;
      this.refreshTheme();
      this._bind();
      new ResizeObserver(() => this.resize()).observe(host);
      this.resize();
    }

    refreshTheme() {
      const cs = getComputedStyle(document.documentElement);
      const g = (n, d) => (cs.getPropertyValue(n).trim() || d);
      this.theme = { bg: g('--g-bg', '#fff'), minor: g('--g-minor', '#eee'), major: g('--g-major', '#ccc'), axis: g('--g-axis', '#333'), text: g('--g-text', '#444') };
    }
    setPlots(p) { this.plots = p; }
    setBox(b) { if (b.length === 6 && b.every(Number.isFinite) && b[1] > b[0] && b[3] > b[2] && b[5] > b[4]) { this.box = b.slice(); this.requestDraw(false); } }
    resetView() { this.cam = { az: 0.85, el: 0.5, dist: 6.4 }; this.requestDraw(false); }
    zoom(f) { this.cam.dist = clamp(this.cam.dist / f, 2.2, 40); this.requestDraw(true); }
    setSpin(on) {
      this.settings.spin = !!on;
      if (on && !this._spin) {
        const tick = () => { if (!this.settings.spin) { this._spin = 0; return; } this.cam.az += 0.006; this.requestDraw(true); this._spin = requestAnimationFrame(tick); };
        this._spin = requestAnimationFrame(tick);
      }
    }

    resize() {
      const r = this.host.getBoundingClientRect();
      const w = Math.max(50, Math.floor(r.width)), h = Math.max(50, Math.floor(r.height)), dpr = window.devicePixelRatio || 1;
      if (w === this.w && h === this.h && dpr === this.dpr && this.canvas.width) return;
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
      this.requestDraw(false);
    }
    requestDraw(fast) {
      if (fast) {
        this.interacting = true; clearTimeout(this._idle);
        this._idle = setTimeout(() => { this.interacting = false; this.requestDraw(false); }, 160);
      }
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this.draw(); });
    }

    /* ---------- projection ---------- */
    _camera() {
      const { az, el, dist } = this.cam;
      const ce = Math.cos(el), se = Math.sin(el), ca = Math.cos(az), sa = Math.sin(az);
      this.cp = [dist * ce * ca, dist * ce * sa, dist * se];
      this.fwd = [-ce * ca, -ce * sa, -se];
      this.right = [-sa, ca, 0];
      this.up = [-se * ca, -se * sa, ce];
      this.f = Math.min(this.w, this.h) * 1.3;
    }
    // normalised cube coordinates of a world point
    _n(x, y, z) {
      const b = this.box;
      return [(x - (b[0] + b[1]) / 2) / ((b[1] - b[0]) / 2), (y - (b[2] + b[3]) / 2) / ((b[3] - b[2]) / 2), (z - (b[4] + b[5]) / 2) / ((b[5] - b[4]) / 2)];
    }
    _proj(p) {
      const v0 = p[0] - this.cp[0], v1 = p[1] - this.cp[1], v2 = p[2] - this.cp[2];
      const zc = v0 * this.fwd[0] + v1 * this.fwd[1] + v2 * this.fwd[2];
      if (zc < 0.15) return null;
      const xc = v0 * this.right[0] + v1 * this.right[1] + v2 * this.right[2];
      const yc = v0 * this.up[0] + v1 * this.up[1] + v2 * this.up[2];
      return [this.w / 2 + this.f * xc / zc, this.h / 2 - this.f * yc / zc, zc];
    }
    _inBox(x, y, z) {
      const b = this.box, e = 1e-9;
      return x >= b[0] - e && x <= b[1] + e && y >= b[2] - e && y <= b[3] + e && z >= b[4] - e && z <= b[5] + e;
    }

    /* ---------- geometry ---------- */
    _poly(prims, P, col, alpha) {
      const pr = P.map((p) => this._proj(this._n(p[0], p[1], p[2])));
      if (pr.some((q) => !q)) return;
      const N = P.map((p) => this._n(p[0], p[1], p[2]));
      // normal (normalised space)
      const a = [N[1][0] - N[0][0], N[1][1] - N[0][1], N[1][2] - N[0][2]], b = [N[2][0] - N[0][0], N[2][1] - N[0][1], N[2][2] - N[0][2]];
      let nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const dot = Math.abs(nx * -this.fwd[0] + ny * -this.fwd[1] + nz * -this.fwd[2]);
      const dot2 = Math.abs(nx * (this.up[0] * 0.5 - this.fwd[0]) + ny * (this.up[1] * 0.5 - this.fwd[1]) + nz * (this.up[2] * 0.5 - this.fwd[2])) / 1.12;
      const shade = 0.32 + 0.68 * Math.min(1, 0.55 * dot + 0.45 * dot2);
      const d = pr.reduce((s, q) => s + q[2], 0) / pr.length;
      prims.push({ t: 'poly', d, pr, c: `rgba(${Math.round(col[0] * shade)},${Math.round(col[1] * shade)},${Math.round(col[2] * shade)},${alpha})` });
    }

    _surf(prims, p) {
      const b = this.box, n = this.interacting ? 26 : 56, col = rgb(p.color);
      const xs = [], ys = [];
      for (let i = 0; i <= n; i++) { xs.push(b[0] + (b[1] - b[0]) * i / n); ys.push(b[2] + (b[3] - b[2]) * i / n); }
      const Z = [];
      for (let j = 0; j <= n; j++) { const row = []; for (let i = 0; i <= n; i++) { let z = p.f(xs[i], ys[j]); if (typeof z !== 'number' || !Number.isFinite(z) || (p.cond && !p.cond(xs[i], ys[j]))) z = NaN; row.push(z); } Z.push(row); }
      const zlo = b[4], zhi = b[5];
      if (!p.helper) {
        const pv = [];
        for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
          const z = Z[j][i]; if (!(z >= zlo && z <= zhi)) continue;
          const pr = this._proj(this._n(xs[i], ys[j], z)); if (pr) pv.push([pr[0], pr[1], pr[2], xs[i], ys[j]]);
        }
        p._pv = pv;
      }
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const z00 = Z[j][i], z10 = Z[j][i + 1], z11 = Z[j + 1][i + 1], z01 = Z[j + 1][i];
          if (!(z00 >= zlo && z00 <= zhi && z10 >= zlo && z10 <= zhi && z11 >= zlo && z11 <= zhi && z01 >= zlo && z01 <= zhi)) continue;
          this._poly(prims, [[xs[i], ys[j], z00], [xs[i + 1], ys[j], z10], [xs[i + 1], ys[j + 1], z11], [xs[i], ys[j + 1], z01]], col, p.alpha || 1);
        }
      }
    }

    _psurf(prims, p) {
      const rg = p.range ? p.range() : { u: [0, 1], v: [0, 1] };
      const n = this.interacting ? 22 : 48, col = rgb(p.color);
      const G = [];
      for (let j = 0; j <= n; j++) {
        const row = [];
        for (let i = 0; i <= n; i++) {
          const u = rg.u[0] + (rg.u[1] - rg.u[0]) * i / n, v = rg.v[0] + (rg.v[1] - rg.v[0]) * j / n;
          const q = p.f(u, v);
          row.push(q && q.every(Number.isFinite) && this._inBox(q[0], q[1], q[2]) ? q : null);
        }
        G.push(row);
      }
      if (!p.helper) {
        const pv = [];
        for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
          const q = G[j][i]; if (!q) continue;
          const pr = this._proj(this._n(q[0], q[1], q[2]));
          if (pr) pv.push([pr[0], pr[1], pr[2], q[0], q[1], q[2], rg.u[0] + (rg.u[1] - rg.u[0]) * i / n, rg.v[0] + (rg.v[1] - rg.v[0]) * j / n]);
        }
        p._pv = pv;
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = G[j][i], bb = G[j][i + 1], c = G[j + 1][i + 1], d = G[j + 1][i];
        if (a && bb && c && d) this._poly(prims, [a, bb, c, d], col, p.alpha || 1);
      }
    }

    _isurf(prims, p) {
      const b = this.box, n = this.interacting ? 16 : 30, col = rgb(p.color);
      const stride = n + 1, vals = new Float64Array(stride * stride * stride);
      const px = (i) => b[0] + (b[1] - b[0]) * i / n, py = (j) => b[2] + (b[3] - b[2]) * j / n, pz = (k) => b[4] + (b[5] - b[4]) * k / n;
      for (let k = 0; k <= n; k++) for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) vals[(k * stride + j) * stride + i] = p.g(px(i), py(j), pz(k));
      const pvs = [];
      const keep = (P) => { if (p.alpha) return; const cx = (P[0][0] + P[1][0] + P[2][0]) / 3, cy = (P[0][1] + P[1][1] + P[2][1]) / 3, cz = (P[0][2] + P[1][2] + P[2][2]) / 3; const pr = this._proj(this._n(cx, cy, cz)); if (pr) pvs.push([pr[0], pr[1], pr[2], cx, cy, cz]); };
      const interp = (A, B, va, vb) => { const t = va / (va - vb); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; };
      for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const cv = [], cp = [];
        let bad = false;
        for (let c = 0; c < 8; c++) {
          const [di, dj, dk] = CORNERS[c];
          const v = vals[((k + dk) * stride + (j + dj)) * stride + (i + di)];
          if (v !== v) { bad = true; break; }
          cv.push(v); cp.push([px(i + di), py(j + dj), pz(k + dk)]);
        }
        if (bad) continue;
        for (const T of TETS) {
          const ins = [], outs = [];
          for (const c of T) (cv[c] > 0 ? ins : outs).push(c);
          if (!ins.length || !outs.length) continue;
          const E = (a, c) => interp(cp[a], cp[c], cv[a], cv[c]);
          const al = p.alpha || 1;
          const emit = (P) => { this._poly(prims, P, col, al); keep(P); };
          if (ins.length === 1) emit([E(ins[0], outs[0]), E(ins[0], outs[1]), E(ins[0], outs[2])]);
          else if (ins.length === 3) emit([E(outs[0], ins[0]), E(outs[0], ins[1]), E(outs[0], ins[2])]);
          else {
            const q = [E(ins[0], outs[0]), E(ins[0], outs[1]), E(ins[1], outs[1]), E(ins[1], outs[0])];
            emit([q[0], q[1], q[2]]); emit([q[0], q[2], q[3]]);
          }
        }
      }
      p._pv = p.alpha ? null : pvs;
    }

    // (picking vertices are stored by _isurf via p._pv)
    // translucent solid for inequalities: depth-sorted voxel splats
    _region(prims, p) {
      const b = this.box, n = this.interacting ? 9 : 20, col = rgb(p.color);
      const px = (i) => b[0] + (b[1] - b[0]) * (i + 0.5) / n, py = (j) => b[2] + (b[3] - b[2]) * (j + 0.5) / n, pz = (k) => b[4] + (b[5] - b[4]) * (k + 0.5) / n;
      for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        if (!p.inside(px(i), py(j), pz(k))) continue;
        const pr = this._proj(this._n(px(i), py(j), pz(k))); if (!pr) continue;
        prims.push({ t: 'splat', d: pr[2], pr, r: this.f * (2 / n) * 0.85 / pr[2], c: `rgba(${col[0]},${col[1]},${col[2]},0.11)` });
      }
    }

    // flat patch (tangent plane) spanned by unit vectors e1, e2 around origin o
    _patch(prims, p) {
      const n = 10, col = rgb(p.color), P = [];
      for (let j = 0; j <= n; j++) {
        const row = [];
        for (let i = 0; i <= n; i++) {
          const u = -p.h + 2 * p.h * i / n, v = -p.h + 2 * p.h * j / n;
          const q = [p.o[0] + u * p.e1[0] + v * p.e2[0], p.o[1] + u * p.e1[1] + v * p.e2[1], p.o[2] + u * p.e1[2] + v * p.e2[2]];
          row.push(this._inBox(q[0], q[1], q[2]) ? q : null);
        }
        P.push(row);
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = P[j][i], bb = P[j][i + 1], c = P[j + 1][i + 1], d = P[j + 1][i];
        if (a && bb && c && d) this._poly(prims, [a, bb, c, d], col, p.alpha || 0.4);
      }
    }

    _curve(prims, p) {
      const rg = p.range ? p.range() : { lo: 0, hi: 1 };
      const lo = Number.isFinite(rg.lo) ? rg.lo : 0, hi = Number.isFinite(rg.hi) ? rg.hi : 1;
      const n = this.interacting ? 300 : 900;
      let last = null;
      for (let i = 0; i <= n; i++) {
        const t = lo + (hi - lo) * i / n, q = p.f(t);
        if (!q || !q.every(Number.isFinite) || !this._inBox(q[0], q[1], q[2])) { last = null; continue; }
        const pr = this._proj(this._n(q[0], q[1], q[2]));
        if (!pr) { last = null; continue; }
        if (last) prims.push({ t: 'seg', d: (last[2] + pr[2]) / 2 - 0.02, a: last, b: pr, c: p.color, w: p.width || 2.5 });
        last = pr;
      }
    }

    draw() {
      const ctx = this.ctx, T = this.theme, w = this.w, h = this.h;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = T.bg; ctx.fillRect(0, 0, w, h);
      this._camera();
      this._drawBox(ctx);
      const prims = [];
      for (const p of this.plots) {
        if (p.hidden) continue;
        try {
          if (p.kind === 'surf') this._surf(prims, p);
          else if (p.kind === 'psurf') this._psurf(prims, p);
          else if (p.kind === 'isurf') { this._isurf(prims, p); if (p.inside && p.volume !== false) this._region(prims, p); }
          else if (p.kind === 'patch') this._patch(prims, p);
          else if (p.kind === 'curve3') this._curve(prims, p);
          else if (p.kind === 'pt3') {
            const q = p.get();
            if (q && q.every(Number.isFinite)) { const pr = this._proj(this._n(q[0], q[1], q[2])); if (pr) prims.push({ t: 'pt', d: pr[2] - 0.05, pr, c: p.color, r: p.size || 6 }); }
          }
        } catch (e) { /* ignore a broken plot */ }
      }
      prims.sort((a, b) => b.d - a.d);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const q of prims) {
        if (q.t === 'poly') {
          ctx.beginPath(); ctx.moveTo(q.pr[0][0], q.pr[0][1]);
          for (let i = 1; i < q.pr.length; i++) ctx.lineTo(q.pr[i][0], q.pr[i][1]);
          ctx.closePath(); ctx.fillStyle = q.c; ctx.fill(); ctx.strokeStyle = q.c; ctx.lineWidth = 0.6; ctx.stroke();
        } else if (q.t === 'splat') {
          ctx.beginPath(); ctx.arc(q.pr[0], q.pr[1], Math.max(1.5, q.r), 0, TAU); ctx.fillStyle = q.c; ctx.fill();
        } else if (q.t === 'seg') {
          ctx.beginPath(); ctx.moveTo(q.a[0], q.a[1]); ctx.lineTo(q.b[0], q.b[1]); ctx.strokeStyle = q.c; ctx.lineWidth = q.w; ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(q.pr[0], q.pr[1], q.r, 0, TAU); ctx.fillStyle = q.c; ctx.fill(); ctx.strokeStyle = T.bg; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
    }

    _line(ctx, a, b) {
      const pa = this._proj(this._n(a[0], a[1], a[2])), pb = this._proj(this._n(b[0], b[1], b[2]));
      if (!pa || !pb) return;
      ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]);
    }

    _drawBox(ctx) {
      const b = this.box, T = this.theme, S = this.settings;
      ctx.save();
      // floor grid (z = zmin)
      if (S.grid) {
        ctx.lineWidth = 1; ctx.strokeStyle = T.minor;
        ctx.beginPath();
        const sx = niceStep((b[1] - b[0]) / 8), sy = niceStep((b[3] - b[2]) / 8);
        for (let x = Math.ceil(b[0] / sx) * sx; x <= b[1] + 1e-9; x += sx) this._line(ctx, [x, b[2], b[4]], [x, b[3], b[4]]);
        for (let y = Math.ceil(b[2] / sy) * sy; y <= b[3] + 1e-9; y += sy) this._line(ctx, [b[0], y, b[4]], [b[1], y, b[4]]);
        ctx.stroke();
      }
      // box edges
      ctx.strokeStyle = T.major; ctx.lineWidth = 1;
      ctx.beginPath();
      const X = [b[0], b[1]], Y = [b[2], b[3]], Z = [b[4], b[5]];
      for (const y of Y) for (const z of Z) this._line(ctx, [X[0], y, z], [X[1], y, z]);
      for (const x of X) for (const z of Z) this._line(ctx, [x, Y[0], z], [x, Y[1], z]);
      for (const x of X) for (const y of Y) this._line(ctx, [x, y, Z[0]], [x, y, Z[1]]);
      ctx.stroke();
      // axes through (clamped) origin
      const ox = clamp(0, b[0], b[1]), oy = clamp(0, b[2], b[3]), oz = clamp(0, b[4], b[5]);
      const axes = [[[b[0], oy, oz], [b[1], oy, oz], '#c74440', 'x'], [[ox, b[2], oz], [ox, b[3], oz], '#388c46', 'y'], [[ox, oy, b[4]], [ox, oy, b[5]], '#2d70b3', 'z']];
      ctx.lineWidth = 2;
      for (const [a, c, col] of axes) { ctx.strokeStyle = col; ctx.beginPath(); this._line(ctx, a, c); ctx.stroke(); }
      ctx.font = '12px -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const [, c, col, name] of axes) {
        const pr = this._proj(this._n(c[0], c[1], c[2]));
        if (pr) { ctx.fillStyle = col; ctx.font = 'bold 14px -apple-system, "Segoe UI", Roboto, sans-serif'; ctx.fillText(name, pr[0] + 10, pr[1] - 10); }
      }
      if (S.numbers) {
        ctx.font = '11px -apple-system, "Segoe UI", Roboto, sans-serif'; ctx.fillStyle = T.text; ctx.strokeStyle = T.bg; ctx.lineWidth = 3;
        const ticks = (lo, hi, axisIdx) => {
          const st = niceStep((hi - lo) / 6);
          for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) {
            if (Math.abs(v) < st * 1e-9) continue;
            const P = [ox, oy, oz]; P[axisIdx] = v;
            const pr = this._proj(this._n(P[0], P[1], P[2])); if (!pr) continue;
            const off = axisIdx === 2 ? [-14, 0] : [0, 12];
            const t = fmtT(v, st);
            ctx.strokeText(t, pr[0] + off[0], pr[1] + off[1]); ctx.fillText(t, pr[0] + off[0], pr[1] + off[1]);
          }
        };
        ticks(b[0], b[1], 0); ticks(b[2], b[3], 1); ticks(b[4], b[5], 2);
      }
      ctx.restore();
    }

    /* ---------- interaction ---------- */
    _ray(sx, sy) {
      const ux = (sx - this.w / 2) / this.f, uy = -(sy - this.h / 2) / this.f;
      return { o: this.cp, d: [this.fwd[0] + ux * this.right[0] + uy * this.up[0], this.fwd[1] + ux * this.right[1] + uy * this.up[1], this.fwd[2] + ux * this.right[2] + uy * this.up[2]] };
    }
    _denorm(n) {
      const b = this.box;
      return [(b[0] + b[1]) / 2 + n[0] * (b[1] - b[0]) / 2, (b[2] + b[3]) / 2 + n[1] * (b[3] - b[2]) / 2, (b[4] + b[5]) / 2 + n[2] * (b[5] - b[4]) / 2];
    }
    _hitPoint(mx, my) {
      for (const p of this.plots) {
        if (p.hidden || p.kind !== 'pt3' || !p.drag) continue;
        const q = p.get(); if (!q || !q.every(Number.isFinite)) continue;
        const pr = this._proj(this._n(q[0], q[1], q[2]));
        if (pr && Math.hypot(pr[0] - mx, pr[1] - my) < 13) return { p, q };
      }
      return null;
    }
    _bind() {
      const c = this.canvas; const ptrs = new Map(); let last = null, pinch = 0, moved = 0, drag = null, startXY = null;
      const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      const step = (range) => Math.pow(10, Math.floor(Math.log10(range / 300)));
      c.style.touchAction = 'none'; c.style.cursor = 'grab';
      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        let dy = e.deltaY; if (e.deltaMode === 1) dy *= 16;
        this.cam.dist = clamp(this.cam.dist * Math.exp(clamp(dy, -200, 200) * 0.0015), 2.2, 40);
        this.requestDraw(true);
      }, { passive: false });
      c.addEventListener('pointerdown', (e) => {
        c.setPointerCapture(e.pointerId); const [mx, my] = pos(e);
        ptrs.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; moved = 0; startXY = [mx, my]; drag = null;
        if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); return; }
        const hit = this._hitPoint(mx, my);
        if (hit) { drag = hit; c.style.cursor = 'move'; return; }
        c.style.cursor = 'grabbing';
      });
      c.addEventListener('pointermove', (e) => {
        const [mx, my] = pos(e);
        if (!ptrs.has(e.pointerId)) { const h = this._hitPoint(mx, my); c.style.cursor = h ? 'move' : 'grab'; return; }
        ptrs.set(e.pointerId, [e.clientX, e.clientY]);
        if (ptrs.size >= 2) {
          const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (pinch > 0) this.cam.dist = clamp(this.cam.dist * pinch / d, 2.2, 40);
          pinch = d; this.requestDraw(true); return;
        }
        const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY];
        moved += Math.abs(dx) + Math.abs(dy);
        if (drag) {
          const b = this.box, ray = this._ray(mx, my), o = ray.o, d = ray.d;
          const nq = this._n(drag.q[0], drag.q[1], drag.q[2]);
          let np;
          if (e.shiftKey) { // vertical move on a camera-facing vertical plane
            const hl = Math.hypot(o[0], o[1]) || 1, nh = [o[0] / hl, o[1] / hl, 0];
            const den = d[0] * nh[0] + d[1] * nh[1];
            if (Math.abs(den) < 1e-9) return;
            const t = ((nq[0] - o[0]) * nh[0] + (nq[1] - o[1]) * nh[1]) / den;
            np = [nq[0], nq[1], o[2] + t * d[2]];
          } else {
            if (Math.abs(d[2]) < 1e-9) return;
            const t = (nq[2] - o[2]) / d[2];
            np = [o[0] + t * d[0], o[1] + t * d[1], nq[2]];
          }
          const w3 = this._denorm(np);
          const sx = step(b[1] - b[0]), sy = step(b[3] - b[2]), sz = step(b[5] - b[4]);
          const rd = (v, st, lo, hi) => clamp(Math.round(v / st) * st, lo, hi);
          const nv = [rd(w3[0], sx, b[0], b[1]), rd(w3[1], sy, b[2], b[3]), rd(w3[2], sz, b[4], b[5])];
          drag.q = nv; drag.p.drag(nv[0], nv[1], nv[2]);
          return;
        }
        this.cam.az -= dx * 0.008;
        this.cam.el = clamp(this.cam.el + dy * 0.008, -1.5, 1.5);
        this.requestDraw(true);
      });
      const up = (e) => {
        const [mx, my] = pos(e);
        const wasClick = ptrs.size === 1 && moved < 5 && !drag;
        ptrs.delete(e.pointerId); pinch = 0; drag = null; c.style.cursor = 'grab';
        if (wasClick && this.onPick) this._pick(mx, my);
      };
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); drag = null; });
      c.addEventListener('dblclick', () => this.resetView());
    }
    _pick(mx, my) {
      let best = null, bd = 18;
      for (const p of this.plots) {
        if (p.hidden || !['surf', 'psurf', 'isurf'].includes(p.kind) || p.helper || !p._pv) continue;
        for (const v of p._pv) {
          const d = Math.hypot(v[0] - mx, v[1] - my);
          if (d < bd - 0.01 || (best && Math.abs(d - bd) <= 0.01 && v[2] < best.depth)) { bd = d; best = { plot: p, x: v[3], y: v[4], z: p.kind === 'surf' ? undefined : v[5], u: v[6], v: v[7], depth: v[2] }; }
        }
      }
      this.onPick(best ? { plot: best.plot, x: best.x, y: best.y, z: best.z, u: best.u, v: best.v } : null);
    }

    exportPNG(cb) {
      const o = document.createElement('canvas'); o.width = this.canvas.width; o.height = this.canvas.height;
      const x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); x.drawImage(this.canvas, 0, 0);
      o.toBlob(cb, 'image/png');
    }
  }

  global.Graph3D = Graph3D;
})(window);
