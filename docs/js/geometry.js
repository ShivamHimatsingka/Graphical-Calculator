/* ==========================================================
   Geometry mode: dynamic constructions on top of the 2D Graph.
   Points:  pt (free) · mid · int (intersection) · tpt (transformed image)
   Lines:   seg · line · ray · perp · par · bis (angle bisector)
   Curves:  circ · ell · hyp · parab (conics)
   Other:   poly · ang · dist · area
   Transformations: reflect, rotate, dilate, translate
   Exposes window.Geo
   ========================================================== */
(function (global) {
  'use strict';

  const TOOLS = [
    { id: 'move', icon: '↖', label: 'Move', hint: 'Drag points to move them; drag the background to pan' },
    { id: 'point', icon: '•', label: 'Point', hint: 'Click anywhere to place a point' },
    { id: 'segment', icon: '╱', label: 'Segment', hint: 'Click two points' },
    { id: 'line', icon: '⟷', label: 'Line', hint: 'Click two points' },
    { id: 'ray', icon: '↗', label: 'Ray', hint: 'Click the start point, then another point' },
    { id: 'circle', icon: '○', label: 'Circle', hint: 'Click the centre, then a point on the circle' },
    { id: 'midpoint', icon: '⊹', label: 'Midpoint', hint: 'Click two points' },
    { id: 'perp', icon: '⟂', label: 'Perpendicular', hint: 'Click a point and a line (either order)' },
    { id: 'parallel', icon: '∥', label: 'Parallel', hint: 'Click a point and a line (either order)' },
    { id: 'bisector', icon: '∠/', label: 'Bisector', hint: 'Click three points: the angle’s vertex is the middle one' },
    { id: 'intersect', icon: '✕', label: 'Intersect', hint: 'Click two lines, circles or conics' },
    { id: 'pointon', icon: '⊙', label: 'Point on', hint: 'Click a line, circle or conic to attach a point to it (then drag it along)' },
    { id: 'locus', icon: '∿', label: 'Locus', hint: 'Click the moving point (a point on an object), then the point whose path you want' },
    { id: 'polygon', icon: '▱', label: 'Polygon', hint: 'Click points; click the first point again to close' },
    { id: 'ellipse', icon: '⬭', label: 'Ellipse', hint: 'Click two foci, then a point on the ellipse' },
    { id: 'hyperbola', icon: '⌒⌒', label: 'Hyperbola', hint: 'Click two foci, then a point on the hyperbola' },
    { id: 'parabola', icon: '∪', label: 'Parabola', hint: 'Click the focus, then the directrix line' },
    { id: 'reflect', icon: '⇋', label: 'Reflect', hint: 'Click the mirror line, then click objects to reflect' },
    { id: 'rotate', icon: '↻', label: 'Rotate', hint: 'Click the centre, then objects to rotate (angle in the box)', param: { label: 'angle °', value: 90 } },
    { id: 'dilate', icon: '⤢', label: 'Dilate', hint: 'Click the centre, then objects to scale (factor in the box)', param: { label: 'factor', value: 2 } },
    { id: 'translate', icon: '→', label: 'Translate', hint: 'Click the start and end of the vector, then objects to move' },
    { id: 'angle', icon: '∠', label: 'Angle', hint: 'Click three points (the vertex is the middle one)' },
    { id: 'distance', icon: '↔', label: 'Distance', hint: 'Click two points' },
    { id: 'area', icon: '▨', label: 'Area', hint: 'Click a polygon or a circle to measure its area and perimeter' },
    { id: 'delete', icon: '⌫', label: 'Delete', hint: 'Click an object to delete it (and anything built on it)' },
  ];
  const POINT_TYPES = ['pt', 'mid', 'int', 'tpt', 'onp'];
  const LINE_TYPES = ['seg', 'line', 'ray', 'perp', 'par', 'bis'];
  const CONIC_TYPES = ['ell', 'hyp', 'parab'];
  const COLORS = { locus: '#00897b', onp: '#c9a227', pt: '#2d70b3', curve: '#2d70b3', poly: '#6042a6', meas: '#c74440', hi: '#fa7e19', img: '#388c46' };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const REF_KEYS = ['a', 'b', 'c', 'p', 'l', 'src', 'f1', 'f2', 'f', 'd', 'obj', 'drv', 'tr'];

  class Geo {
    constructor(graph, opts) {
      this.g = graph;
      this.opts = opts || {};
      this.objects = []; this.nextId = 1;
      this.tool = 'move'; this.pending = []; this.hover = null; this.drag = null;
      this.param = { rotate: 90, dilate: 2 };
      this.history = [];
      this.plot = { id: -100, kind: 'custom', hidden: false, draw: (ctx, gr) => this.draw(ctx, gr) };
    }

    /* ---------- state ---------- */
    toJSON() { return { objects: this.objects, nextId: this.nextId }; }
    load(d) { this.objects = (d && d.objects) || []; this.nextId = (d && d.nextId) || 1 + this.objects.reduce((m, o) => Math.max(m, o.id), 0); this.pending = []; this.history = []; this.g.requestDraw(false); }
    _snap() { this.history.push(JSON.stringify(this.toJSON())); if (this.history.length > 80) this.history.shift(); }
    _changed() { this.g.requestDraw(false); if (this.opts.onChange) this.opts.onChange(); }
    undo() { const s = this.history.pop(); if (!s) return; const d = JSON.parse(s); this.objects = d.objects; this.nextId = d.nextId; this.pending = []; this._changed(); }
    clear() { if (!this.objects.length) return; this._snap(); this.objects = []; this.pending = []; this._changed(); }
    setTool(t) { this.tool = t; this.pending = []; this.g.requestDraw(false); this._notify(); }
    _notify() { if (this.opts.onTool) this.opts.onTool(this.tool, this.status()); }
    status() { const t = TOOLS.find((x) => x.id === this.tool); return t ? t.hint + (this.pending.length ? `  ·  ${this.pending.length} selected` : '') : ''; }

    get(id) { return this.objects.find((o) => o.id === id); }
    _name(base) {
      const used = new Set(this.objects.map((o) => o.name));
      if (base) { let n = base + "'"; while (used.has(n)) n += "'"; return n; }
      for (let k = 0; k < 700; k++) { const n = String.fromCharCode(65 + (k % 26)) + (k >= 26 ? Math.floor(k / 26) : ''); if (!used.has(n)) return n; }
      return 'P';
    }
    _add(o) {
      o.id = this.nextId++;
      if (POINT_TYPES.includes(o.t)) { const s = o.t === 'tpt' ? this.get(o.src) : null; o.name = this._name(s && s.name); }
      this.objects.push(o); return o;
    }
    isPoint(o) { return !!o && POINT_TYPES.includes(o.t); }

    /* ---------- evaluation ---------- */
    pos(o, depth) {
      depth = depth || 0; if (!o || depth > 40) return null;
      if (o.t === 'pt') return [o.x, o.y];
      if (o.t === 'mid') { const a = this.pos(this.get(o.a), depth + 1), b = this.pos(this.get(o.b), depth + 1); return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null; }
      if (o.t === 'int') {
        const A = this.shape(this.get(o.a), depth + 1), B = this.shape(this.get(o.b), depth + 1);
        return A && B ? this._intersect(A, B, o.k) : null;
      }
      if (o.t === 'onp') { const S = this.shape(this.get(o.obj), depth + 1); return S ? this._onPos(S, o) : null; }
      if (o.t === 'tpt') {
        const P = this.pos(this.get(o.src), depth + 1); if (!P) return null;
        if (o.op === 'reflect') {
          const L = this.shape(this.get(o.l), depth + 1); if (!L) return null;
          const t = dot(sub(P, L.p), L.d) / dot(L.d, L.d), f = [L.p[0] + t * L.d[0], L.p[1] + t * L.d[1]];
          return [2 * f[0] - P[0], 2 * f[1] - P[1]];
        }
        if (o.op === 'translate') { const a = this.pos(this.get(o.a), depth + 1), b = this.pos(this.get(o.b), depth + 1); return a && b ? [P[0] + b[0] - a[0], P[1] + b[1] - a[1]] : null; }
        const C = this.pos(this.get(o.c), depth + 1); if (!C) return null;
        if (o.op === 'dilate') return [C[0] + o.v * (P[0] - C[0]), C[1] + o.v * (P[1] - C[1])];
        const th = o.v * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th), d = sub(P, C);
        return [C[0] + cs * d[0] - sn * d[1], C[1] + sn * d[0] + cs * d[1]];
      }
      return null;
    }
    shape(o, depth) {
      depth = depth || 0; if (!o || depth > 40) return null;
      switch (o.t) {
        case 'seg': case 'line': case 'ray': {
          const a = this.pos(this.get(o.a), depth + 1), b = this.pos(this.get(o.b), depth + 1);
          return a && b && (a[0] !== b[0] || a[1] !== b[1]) ? { k: o.t, p: a, d: sub(b, a) } : null;
        }
        case 'perp': case 'par': {
          const l = this.shape(this.get(o.l), depth + 1), p = this.pos(this.get(o.p), depth + 1);
          if (!l || !p) return null;
          return { k: 'line', p, d: o.t === 'perp' ? [-l.d[1], l.d[0]] : l.d };
        }
        case 'bis': {
          const a = this.pos(this.get(o.a), depth + 1), b = this.pos(this.get(o.b), depth + 1), c = this.pos(this.get(o.c), depth + 1);
          if (!a || !b || !c) return null;
          const u = sub(a, b), v = sub(c, b), lu = Math.hypot(...u), lv = Math.hypot(...v); if (!lu || !lv) return null;
          let d = [u[0] / lu + v[0] / lv, u[1] / lu + v[1] / lv];
          if (Math.hypot(...d) < 1e-9) d = [-u[1] / lu, u[0] / lu];
          return { k: 'line', p: b, d };
        }
        case 'circ': {
          const c = this.pos(this.get(o.c), depth + 1), q = this.pos(this.get(o.p), depth + 1);
          if (!c || !q) return null;
          const r = Math.hypot(q[0] - c[0], q[1] - c[1]);
          return r > 0 ? { k: 'circ', c, r } : null;
        }
        case 'ell': case 'hyp': {
          const f1 = this.pos(this.get(o.f1), depth + 1), f2 = this.pos(this.get(o.f2), depth + 1), q = this.pos(this.get(o.p), depth + 1);
          if (!f1 || !f2 || !q) return null;
          const c = [(f1[0] + f2[0]) / 2, (f1[1] + f2[1]) / 2], cf = Math.hypot(f2[0] - f1[0], f2[1] - f1[1]) / 2;
          if (cf < 1e-9) return null;
          const d1 = Math.hypot(q[0] - f1[0], q[1] - f1[1]), d2 = Math.hypot(q[0] - f2[0], q[1] - f2[1]);
          const u = [(f2[0] - f1[0]) / (2 * cf), (f2[1] - f1[1]) / (2 * cf)];
          if (o.t === 'ell') { const a = (d1 + d2) / 2; if (a <= cf + 1e-9) return null; return { k: 'conic', type: 'ell', c, u, a, b: Math.sqrt(a * a - cf * cf) }; }
          const a = Math.abs(d1 - d2) / 2; if (a < 1e-9 || a >= cf - 1e-9) return null;
          return { k: 'conic', type: 'hyp', c, u, a, b: Math.sqrt(cf * cf - a * a) };
        }
        case 'parab': {
          const f = this.pos(this.get(o.f), depth + 1), L = this.shape(this.get(o.d), depth + 1);
          if (!f || !L) return null;
          const dl = Math.hypot(...L.d), t = [L.d[0] / dl, L.d[1] / dl];
          let n = [-t[1], t[0]];
          const sgn = dot(sub(f, L.p), n); if (Math.abs(sgn) < 1e-9) return null;
          if (sgn < 0) n = [-n[0], -n[1]];
          const dist = Math.abs(sgn), foot = [f[0] - n[0] * dist, f[1] - n[1] * dist];
          return { k: 'conic', type: 'par', v: [foot[0] + n[0] * dist / 2, foot[1] + n[1] * dist / 2], t, n, p: dist };
        }
        default: return null;
      }
    }
    // world-space polyline(s) of a conic, extended to cover the visible area
    conicPolys(S) {
      const r = this.g.range(), ext = 3 * Math.hypot(r.xmax - r.xmin, r.ymax - r.ymin);
      const polys = [];
      const mk = (fn, t0, t1, n) => { const pts = []; for (let i = 0; i <= n; i++) pts.push(fn(t0 + (t1 - t0) * i / n)); return pts; };
      if (S.type === 'ell') {
        const w = [-S.u[1], S.u[0]];
        polys.push(mk((t) => [S.c[0] + S.a * Math.cos(t) * S.u[0] + S.b * Math.sin(t) * w[0], S.c[1] + S.a * Math.cos(t) * S.u[1] + S.b * Math.sin(t) * w[1]], 0, Math.PI * 2, 240));
      } else if (S.type === 'hyp') {
        const w = [-S.u[1], S.u[0]], T = Math.min(8, Math.asinh(ext / S.b));
        for (const sg of [1, -1]) polys.push(mk((t) => [S.c[0] + sg * S.a * Math.cosh(t) * S.u[0] + S.b * Math.sinh(t) * w[0], S.c[1] + sg * S.a * Math.cosh(t) * S.u[1] + S.b * Math.sinh(t) * w[1]], -T, T, 240));
      } else {
        const R = ext;
        polys.push(mk((s) => [S.v[0] + S.t[0] * s + S.n[0] * s * s / (2 * S.p), S.v[1] + S.t[1] * s + S.n[1] * s * s / (2 * S.p)], -R, R, 400));
      }
      return polys;
    }
    /* ----- points constrained to an object, and loci ----- */
    _onPos(S, o) {
      if (S.k === 'circ') return [S.c[0] + S.r * Math.cos(o.s), S.c[1] + S.r * Math.sin(o.s)];
      if (S.k === 'conic') {
        const w = [-S.u[1], S.u[0]];
        if (S.type === 'ell') return [S.c[0] + S.a * Math.cos(o.s) * S.u[0] + S.b * Math.sin(o.s) * w[0], S.c[1] + S.a * Math.cos(o.s) * S.u[1] + S.b * Math.sin(o.s) * w[1]];
        if (S.type === 'hyp') { const br = o.br || 1; return [S.c[0] + br * S.a * Math.cosh(o.s) * S.u[0] + S.b * Math.sinh(o.s) * w[0], S.c[1] + br * S.a * Math.cosh(o.s) * S.u[1] + S.b * Math.sinh(o.s) * w[1]]; }
        return [S.v[0] + S.t[0] * o.s + S.n[0] * o.s * o.s / (2 * S.p), S.v[1] + S.t[1] * o.s + S.n[1] * o.s * o.s / (2 * S.p)];
      }
      return [S.p[0] + o.s * S.d[0], S.p[1] + o.s * S.d[1]];
    }
    _onParam(S, q) {
      if (S.k === 'circ') return { s: Math.atan2(q[1] - S.c[1], q[0] - S.c[0]) };
      if (S.k === 'conic') {
        if (S.type === 'par') return { s: dot(sub(q, S.v), S.t) };
        const w = [-S.u[1], S.u[0]], d = sub(q, S.c), x = dot(d, S.u), y = dot(d, w);
        if (S.type === 'ell') return { s: Math.atan2(y / S.b, x / S.a) };
        return { s: Math.asinh(y / S.b), br: x >= 0 ? 1 : -1 };
      }
      let t = dot(sub(q, S.p), S.d) / dot(S.d, S.d);
      if (S.k === 'seg') t = Math.max(0, Math.min(1, t)); else if (S.k === 'ray') t = Math.max(0, t);
      return { s: t };
    }
    locusPts(o) {
      const d = this.get(o.drv), tr = this.get(o.tr);
      if (!d || !tr || d.t !== 'onp') return [];
      const S = this.shape(this.get(d.obj)); if (!S) return [];
      const r = this.g.range(), ext = 2 * Math.hypot(r.xmax - r.xmin, r.ymax - r.ymin);
      let lo, hi;
      if (S.k === 'circ' || (S.k === 'conic' && S.type === 'ell')) { lo = -Math.PI; hi = Math.PI; }
      else if (S.k === 'conic') { lo = S.type === 'hyp' ? -4 : -ext; hi = S.type === 'hyp' ? 4 : ext; }
      else { const dl = Math.hypot(...S.d); if (S.k === 'seg') { lo = 0; hi = 1; } else if (S.k === 'ray') { lo = 0; hi = ext / dl; } else { lo = -ext / dl; hi = ext / dl; } }
      const save = { s: d.s, br: d.br }, pts = [], n = 400;
      for (let i = 0; i <= n; i++) { d.s = lo + (hi - lo) * i / n; pts.push(this.pos(tr)); }
      d.s = save.s; d.br = save.br;
      return pts;
    }
    // sampled world polylines + implicit function for a shape (used for conic intersections)
    _polys(S) {
      const r = this.g.range(), ext = 3 * Math.hypot(r.xmax - r.xmin, r.ymax - r.ymin);
      if (S.k === 'conic') return this.conicPolys(S);
      if (S.k === 'circ') { const pts = []; for (let i = 0; i <= 360; i++) pts.push([S.c[0] + S.r * Math.cos(i * Math.PI / 180), S.c[1] + S.r * Math.sin(i * Math.PI / 180)]); return [pts]; }
      const dl = Math.hypot(...S.d), u = [S.d[0] / dl, S.d[1] / dl];
      const line = (a, b, n) => { const pts = []; for (let i = 0; i <= n; i++) pts.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]); return pts; };
      if (S.k === 'seg') return [line(S.p, [S.p[0] + S.d[0], S.p[1] + S.d[1]], 200)];
      if (S.k === 'ray') return [line(S.p, [S.p[0] + u[0] * ext, S.p[1] + u[1] * ext], 800)];
      return [line([S.p[0] - u[0] * ext, S.p[1] - u[1] * ext], [S.p[0] + u[0] * ext, S.p[1] + u[1] * ext], 1200)];
    }
    _implicit(S) {
      if (S.k === 'circ') return (x, y) => (x - S.c[0]) ** 2 + (y - S.c[1]) ** 2 - S.r * S.r;
      if (S.k === 'conic') {
        if (S.type === 'par') return (x, y) => { const dx = x - S.v[0], dy = y - S.v[1], s = dx * S.t[0] + dy * S.t[1], q = dx * S.n[0] + dy * S.n[1]; return q - s * s / (2 * S.p); };
        const w = [-S.u[1], S.u[0]];
        return S.type === 'ell'
          ? (x, y) => { const dx = x - S.c[0], dy = y - S.c[1], a = dx * S.u[0] + dy * S.u[1], b = dx * w[0] + dy * w[1]; return a * a / (S.a * S.a) + b * b / (S.b * S.b) - 1; }
          : (x, y) => { const dx = x - S.c[0], dy = y - S.c[1], a = dx * S.u[0] + dy * S.u[1], b = dx * w[0] + dy * w[1]; return a * a / (S.a * S.a) - b * b / (S.b * S.b) - 1; };
      }
      return (x, y) => S.d[0] * (y - S.p[1]) - S.d[1] * (x - S.p[0]); // signed distance-like for lines
    }
    _validOn(S, P) {
      if (S.k === 'seg' || S.k === 'ray') return this._inRange(S.k, dot(sub(P, S.p), S.d) / dot(S.d, S.d));
      return true;
    }
    // Newton polish so the point lies on both curves (the polyline is only a sampling)
    _refine(P, f, g) {
      let x = P[0], y = P[1];
      const h = 1e-6 * (1 + Math.hypot(x, y));
      for (let it = 0; it < 8; it++) {
        const fv = f(x, y), gv = g(x, y);
        if (!Number.isFinite(fv) || !Number.isFinite(gv)) break;
        const fx = (f(x + h, y) - f(x - h, y)) / (2 * h), fy = (f(x, y + h) - f(x, y - h)) / (2 * h);
        const gx = (g(x + h, y) - g(x - h, y)) / (2 * h), gy = (g(x, y + h) - g(x, y - h)) / (2 * h);
        const det = fx * gy - fy * gx; if (Math.abs(det) < 1e-12) break;
        const dx = (fv * gy - fy * gv) / det, dy = (fx * gv - fv * gx) / det;
        x -= dx; y -= dy;
        if (Math.hypot(dx, dy) < 1e-13) break;
      }
      return [x, y];
    }
    intersectAll(A, B) {
      const g = this._implicit(B), gA = this._implicit(A), out = [];
      const r = this.g.range(), tol = 1e-6 * Math.hypot(r.xmax - r.xmin, r.ymax - r.ymin);
      for (const poly of this._polys(A)) {
        for (let i = 1; i < poly.length; i++) {
          let p0 = poly[i - 1], p1 = poly[i], g0 = g(p0[0], p0[1]), g1 = g(p1[0], p1[1]);
          if (!(Number.isFinite(g0) && Number.isFinite(g1)) || g0 * g1 > 0) continue;
          if (g0 === 0 && g1 === 0) continue;
          for (let it = 0; it < 50; it++) {
            const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], gm = g(m[0], m[1]);
            if (gm * g0 <= 0) { p1 = m; g1 = gm; } else { p0 = m; g0 = gm; }
          }
          let P = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
          P = this._refine(P, gA, g);
          if (!this._validOn(A, P) || !this._validOn(B, P)) continue;
          if (Math.abs(g(P[0], P[1])) > 1e-3 * (1 + Math.abs(g0))) { /* near an asymptote jump, not a root */ if (Math.abs(g(P[0], P[1])) > 1) continue; }
          if (!out.some((q) => Math.hypot(q[0] - P[0], q[1] - P[1]) < tol * 5)) out.push(P);
        }
      }
      return out;
    }
    _inRange(k, t) { return k === 'seg' ? t >= -1e-9 && t <= 1 + 1e-9 : k === 'ray' ? t >= -1e-9 : true; }
    _intersect(A, B, k) {
      if (A.k === 'conic' || B.k === 'conic') { const all = this.intersectAll(A, B); return all[k] || null; }
      if (A.k !== 'circ' && B.k !== 'circ') {
        const den = cross(A.d, B.d); if (Math.abs(den) < 1e-12) return null;
        const w = sub(B.p, A.p), t = cross(w, B.d) / den, u = cross(w, A.d) / den;
        if (!this._inRange(A.k, t) || !this._inRange(B.k, u)) return null;
        return [A.p[0] + t * A.d[0], A.p[1] + t * A.d[1]];
      }
      if (A.k === 'circ' && B.k === 'circ') {
        const dx = B.c[0] - A.c[0], dy = B.c[1] - A.c[1], d = Math.hypot(dx, dy);
        if (d < 1e-12 || d > A.r + B.r || d < Math.abs(A.r - B.r)) return null;
        const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A.r * A.r - a * a));
        const mx = A.c[0] + a * dx / d, my = A.c[1] + a * dy / d, s = k ? -1 : 1;
        return [mx - s * h * dy / d, my + s * h * dx / d];
      }
      const L = A.k === 'circ' ? B : A, C = A.k === 'circ' ? A : B;
      const f = sub(L.p, C.c), a = dot(L.d, L.d), b = 2 * dot(f, L.d), c = dot(f, f) - C.r * C.r;
      const disc = b * b - 4 * a * c; if (disc < 0) return null;
      const s = Math.sqrt(disc), ts = [(-b - s) / (2 * a), (-b + s) / (2 * a)];
      const t = ts[k ? 1 : 0];
      if (!this._inRange(L.k, t)) return null;
      return [L.p[0] + t * L.d[0], L.p[1] + t * L.d[1]];
    }
    polyArea(o) {
      const P = o.pts.map((id) => this.pos(this.get(id))); if (P.some((p) => !p)) return null;
      let s = 0, per = 0;
      for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); }
      return { area: Math.abs(s) / 2, per, c: [P.reduce((q, p) => q + p[0], 0) / P.length, P.reduce((q, p) => q + p[1], 0) / P.length] };
    }
    measure(o) { // for 'area' objects
      const t = this.get(o.target);
      if (!t) return null;
      if (t.t === 'poly') return this.polyArea(t);
      if (t.t === 'circ') { const S = this.shape(t); return S ? { area: Math.PI * S.r * S.r, per: 2 * Math.PI * S.r, c: S.c } : null; }
      return null;
    }

    /* ---------- drawing ---------- */
    draw(ctx, g) {
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
      const sx = (p) => g.X(p[0]), sy = (p) => g.Y(p[1]);
      const hi = (o) => this.pending.includes(o.id) || this.hover === o.id;
      const r = g.range(), ext = 4 * Math.hypot(r.xmax - r.xmin, r.ymax - r.ymin);
      for (const o of this.objects) if (o.t === 'poly') {
        const pts = o.pts.map((id) => this.pos(this.get(id))); if (pts.some((p) => !p)) continue;
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(sx(p), sy(p)) : ctx.moveTo(sx(p), sy(p)))); ctx.closePath();
        ctx.fillStyle = COLORS.poly + '33'; ctx.fill(); ctx.strokeStyle = hi(o) ? COLORS.hi : COLORS.poly; ctx.lineWidth = hi(o) ? 3.4 : 2.2; ctx.stroke();
      }
      for (const o of this.objects) {
        const S = this.shape(o); if (!S) continue;
        ctx.strokeStyle = hi(o) ? COLORS.hi : COLORS.curve; ctx.lineWidth = hi(o) ? 3.4 : 2.2;
        ctx.beginPath();
        if (S.k === 'circ') ctx.arc(sx(S.c), sy(S.c), S.r * g.view.sx, 0, Math.PI * 2);
        else if (S.k === 'conic') {
          for (const poly of this.conicPolys(S)) poly.forEach((p, i) => (i ? ctx.lineTo(sx(p), sy(p)) : ctx.moveTo(sx(p), sy(p))));
        } else {
          const dl = Math.hypot(S.d[0], S.d[1]), u = [S.d[0] / dl, S.d[1] / dl];
          let a = S.p, b;
          if (S.k === 'seg') b = [S.p[0] + S.d[0], S.p[1] + S.d[1]];
          else if (S.k === 'ray') b = [S.p[0] + u[0] * ext, S.p[1] + u[1] * ext];
          else { a = [S.p[0] - u[0] * ext, S.p[1] - u[1] * ext]; b = [S.p[0] + u[0] * ext, S.p[1] + u[1] * ext]; }
          ctx.moveTo(sx(a), sy(a)); ctx.lineTo(sx(b), sy(b));
        }
        ctx.stroke();
      }
      for (const o of this.objects) if (o.t === 'locus') {
        const pts = this.locusPts(o);
        ctx.strokeStyle = hi(o) ? COLORS.hi : COLORS.locus; ctx.lineWidth = hi(o) ? 3.4 : 2.4; ctx.setLineDash([]);
        ctx.beginPath(); let pen = false, lx = 0, ly = 0;
        for (const q of pts) {
          if (!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) { pen = false; continue; }
          const x = sx(q), y = sy(q);
          if (pen && Math.hypot(x - lx, y - ly) < 400) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          pen = true; lx = x; ly = y;
        }
        ctx.stroke();
      }
      ctx.font = '13px -apple-system, "Segoe UI", Roboto, sans-serif';
      for (const o of this.objects) {
        if (o.t === 'dist') {
          const a = this.pos(this.get(o.a)), b = this.pos(this.get(o.b)); if (!a || !b) continue;
          const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          ctx.setLineDash([5, 4]); ctx.strokeStyle = COLORS.meas; ctx.lineWidth = hi(o) ? 3 : 1.6; ctx.beginPath(); ctx.moveTo(sx(a), sy(a)); ctx.lineTo(sx(b), sy(b)); ctx.stroke(); ctx.setLineDash([]);
          this._label(ctx, `${this.get(o.a).name}${this.get(o.b).name} = ${+d.toFixed(4)}`, (sx(a) + sx(b)) / 2, (sy(a) + sy(b)) / 2 - 10, COLORS.meas);
        } else if (o.t === 'ang') {
          const a = this.pos(this.get(o.a)), b = this.pos(this.get(o.b)), c = this.pos(this.get(o.c)); if (!a || !b || !c) continue;
          const v1 = sub(a, b), v2 = sub(c, b), l1 = Math.hypot(...v1), l2 = Math.hypot(...v2); if (!l1 || !l2) continue;
          const ang = Math.acos(Math.max(-1, Math.min(1, dot(v1, v2) / (l1 * l2))));
          const a1 = Math.atan2(-v1[1], v1[0]), a2 = Math.atan2(-v2[1], v2[0]);
          const ccw = cross(v1, v2) > 0;
          ctx.strokeStyle = COLORS.meas; ctx.lineWidth = hi(o) ? 3 : 1.8; ctx.beginPath();
          ctx.arc(sx(b), sy(b), 26, a1, a2, ccw); ctx.stroke();
          const mid = a1 + (ccw ? -ang / 2 : ang / 2);
          this._label(ctx, `${+(ang * 180 / Math.PI).toFixed(2)}°`, sx(b) + Math.cos(mid) * 46, sy(b) + Math.sin(mid) * 46, COLORS.meas);
        } else if (o.t === 'area') {
          const m = this.measure(o); if (!m) continue;
          this._label(ctx, `Area = ${+m.area.toFixed(4)}   P = ${+m.per.toFixed(4)}`, sx(m.c) - 56, sy(m.c), COLORS.meas);
        }
      }
      for (const o of this.objects) {
        if (!POINT_TYPES.includes(o.t)) continue;
        const p = this.pos(o); if (!p) continue;
        const x = sx(p), y = sy(p), h = hi(o);
        ctx.beginPath(); ctx.arc(x, y, h ? 8 : 6.5, 0, Math.PI * 2); ctx.fillStyle = g.theme.bg; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, h ? 6.2 : 4.8, 0, Math.PI * 2); ctx.fillStyle = h ? COLORS.hi : (o.t === 'pt' ? COLORS.pt : o.t === 'tpt' ? COLORS.img : o.t === 'onp' ? COLORS.onp : '#6a6a6a'); ctx.fill();
        this._label(ctx, o.name, x + 10, y - 10, g.theme.text, true);
      }
      ctx.restore();
    }
    _label(ctx, text, x, y, color, plain) {
      ctx.save(); ctx.textBaseline = 'middle';
      ctx.font = (plain ? 'italic 600 ' : '') + '14px -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = this.g.theme.bg; ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore();
    }

    /* ---------- hit testing ---------- */
    hit(wx, wy, only) {
      const g = this.g, sxp = (x) => g.X(x), syp = (y) => g.Y(y), mx = sxp(wx), my = syp(wy);
      const pts = this.objects.filter((o) => POINT_TYPES.includes(o.t));
      if (only !== 'curve') for (let i = pts.length - 1; i >= 0; i--) {
        const p = this.pos(pts[i]); if (p && Math.hypot(sxp(p[0]) - mx, syp(p[1]) - my) < 11) return pts[i];
      }
      if (only === 'point') return null;
      let best = null, bd = 8;
      const segDist = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((mx - a[0]) * dx + (my - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(a[0] + t * dx - mx, a[1] + t * dy - my); };
      const r = g.range(), ext = 4 * Math.hypot(r.xmax - r.xmin, r.ymax - r.ymin);
      for (const o of this.objects) {
        let d = Infinity;
        if (o.t === 'poly') {
          const P = o.pts.map((id) => this.pos(this.get(id))); if (P.some((p) => !p)) continue;
          for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; d = Math.min(d, segDist([sxp(a[0]), syp(a[1])], [sxp(b[0]), syp(b[1])])); }
        } else if (o.t === 'dist') {
          const P = [o.a, o.b].map((id) => this.pos(this.get(id))); if (P.some((p) => !p)) continue;
          d = segDist([sxp(P[0][0]), syp(P[0][1])], [sxp(P[1][0]), syp(P[1][1])]);
        } else if (o.t === 'ang') {
          const b = this.pos(this.get(o.b)); if (!b) continue;
          d = Math.abs(Math.hypot(sxp(b[0]) - mx, syp(b[1]) - my) - 26);
        } else if (o.t === 'locus') {
          const L = this.locusPts(o);
          for (let k = 1; k < L.length; k++) if (L[k - 1] && L[k]) d = Math.min(d, segDist([sxp(L[k - 1][0]), syp(L[k - 1][1])], [sxp(L[k][0]), syp(L[k][1])]));
        } else if (o.t === 'area') {
          const m = this.measure(o); if (!m) continue;
          d = Math.hypot(sxp(m.c[0]) - mx, syp(m.c[1]) - my) - 40; d = Math.max(0, d);
        } else {
          const S = this.shape(o); if (!S) continue;
          if (S.k === 'circ') d = Math.abs(Math.hypot(sxp(S.c[0]) - mx, syp(S.c[1]) - my) - S.r * g.view.sx);
          else if (S.k === 'conic') { for (const poly of this.conicPolys(S)) for (let k = 1; k < poly.length; k++) d = Math.min(d, segDist([sxp(poly[k - 1][0]), syp(poly[k - 1][1])], [sxp(poly[k][0]), syp(poly[k][1])])); }
          else {
            const dl = Math.hypot(S.d[0], S.d[1]), u = [S.d[0] / dl, S.d[1] / dl];
            let a = S.p, b;
            if (S.k === 'seg') b = [S.p[0] + S.d[0], S.p[1] + S.d[1]];
            else if (S.k === 'ray') b = [S.p[0] + u[0] * ext, S.p[1] + u[1] * ext];
            else { a = [S.p[0] - u[0] * ext, S.p[1] - u[1] * ext]; b = [S.p[0] + u[0] * ext, S.p[1] + u[1] * ext]; }
            d = segDist([sxp(a[0]), syp(a[1])], [sxp(b[0]), syp(b[1])]);
          }
        }
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    }

    /* ---------- interaction (called by Graph) ---------- */
    pointer(type, wx, wy, e) {
      const g = this.g;
      if (type === 'hover') {
        const h = this.hit(wx, wy), id = h ? h.id : null;
        g.over.style.cursor = this.tool === 'move' ? (h && (h.t === 'pt' || h.t === 'onp') ? 'grab' : h ? 'pointer' : '') : (this.tool === 'delete' ? (h ? 'not-allowed' : '') : 'crosshair');
        if (id !== this.hover) { this.hover = id; g.requestDraw(false); }
        return false;
      }
      if (type === 'down') {
        if (this.tool !== 'move') return false;
        const h = this.hit(wx, wy, 'point');
        if (h && (h.t === 'pt' || h.t === 'onp')) { this._snap(); this.drag = h; g.over.style.cursor = 'grabbing'; return true; }
        return false;
      }
      if (type === 'move') {
        if (this.drag) {
          if (this.drag.t === 'onp') { const S = this.shape(this.get(this.drag.obj)); if (S) { const r = this._onParam(S, [wx, wy]); this.drag.s = r.s; if (r.br) this.drag.br = r.br; } }
          else { this.drag.x = wx; this.drag.y = wy; }
          g.requestDraw(false);
        }
        return true;
      }
      if (type === 'up') {
        if (this.drag) { this.drag = null; this._changed(); }
        return true;
      }
      if (type === 'click') return this.click(wx, wy, e);
      return false;
    }

    _pointAt(wx, wy) {
      const h = this.hit(wx, wy, 'point');
      if (h) return h;
      this._snap();
      return this._add({ t: 'pt', x: +wx.toFixed(4), y: +wy.toFixed(4) });
    }
    _transform(h, ref) {
      const tool = this.tool, pc = new Map(), oc = new Map();
      const base = { op: tool };
      if (tool === 'reflect') base.l = ref[0];
      else if (tool === 'translate') { base.a = ref[0]; base.b = ref[1]; }
      else { base.c = ref[0]; base.v = +this.param[tool]; if (!Number.isFinite(base.v)) base.v = tool === 'rotate' ? 90 : 2; }
      const imgPt = (id) => { if (!pc.has(id)) pc.set(id, this._add(Object.assign({ t: 'tpt', src: id }, base)).id); return pc.get(id); };
      // similarities map lines, circles, conics and constructions onto the same construction built from the images
      const imgObj = (id) => {
        if (oc.has(id)) return oc.get(id);
        const o = this.get(id); if (!o) return null;
        let n = null;
        if (POINT_TYPES.includes(o.t)) n = imgPt(id);
        else if (['seg', 'line', 'ray'].includes(o.t)) n = this._add({ t: o.t, a: imgPt(o.a), b: imgPt(o.b) }).id;
        else if (o.t === 'perp' || o.t === 'par') { const l = imgObj(o.l); n = l === null ? null : this._add({ t: o.t, p: imgPt(o.p), l }).id; }
        else if (o.t === 'bis') n = this._add({ t: 'bis', a: imgPt(o.a), b: imgPt(o.b), c: imgPt(o.c) }).id;
        else if (o.t === 'circ') n = this._add({ t: 'circ', c: imgPt(o.c), p: imgPt(o.p) }).id;
        else if (o.t === 'ell' || o.t === 'hyp') n = this._add({ t: o.t, f1: imgPt(o.f1), f2: imgPt(o.f2), p: imgPt(o.p) }).id;
        else if (o.t === 'parab') { const d = imgObj(o.d); n = d === null ? null : this._add({ t: 'parab', f: imgPt(o.f), d }).id; }
        else if (o.t === 'poly') n = this._add({ t: 'poly', pts: o.pts.map(imgPt) }).id;
        oc.set(id, n); return n;
      };
      return imgObj(h.id) !== null;
    }
    click(wx, wy) {
      const tool = this.tool, P = this.pending;
      if (tool === 'move') { this.hover = null; return false; }
      if (tool === 'delete') {
        const h = this.hit(wx, wy); if (!h) return true;
        this._snap(); this._remove(h.id); this._changed(); return true;
      }
      if (tool === 'point') { const h = this.hit(wx, wy, 'point'); if (!h) { this._snap(); this._add({ t: 'pt', x: +wx.toFixed(4), y: +wy.toFixed(4) }); this._changed(); } return true; }
      const finish = (o) => { this._add(o); this.pending = []; this._changed(); this._notify(); };

      // transformations: first pick the reference, then click objects to transform
      if (['reflect', 'rotate', 'dilate', 'translate'].includes(tool)) {
        const need = tool === 'translate' ? 2 : 1;
        if (P.length < need) {
          if (tool === 'reflect') {
            const h = this.hit(wx, wy, 'curve');
            if (h && LINE_TYPES.includes(h.t)) P.push(h.id);
          } else { const p = this._pointAt(wx, wy); if (!P.includes(p.id)) P.push(p.id); }
          this.g.requestDraw(false); this._notify(); return true;
        }
        const h = this.hit(wx, wy); if (!h) return true;
        this._snap();
        if (this._transform(h, P)) this._changed(); else { this.history.pop(); if (this.opts.toast) this.opts.toast('That kind of object cannot be transformed yet'); }
        return true;
      }
      const needPts = { segment: 2, line: 2, ray: 2, circle: 2, midpoint: 2, distance: 2, angle: 3, bisector: 3, ellipse: 3, hyperbola: 3 }[tool];
      if (needPts) {
        const p = this._pointAt(wx, wy);
        if (P.includes(p.id)) { this.g.requestDraw(false); return true; }
        P.push(p.id);
        if (P.length === needPts) {
          this._snap();
          const [a, b, c] = P;
          if (tool === 'segment') finish({ t: 'seg', a, b });
          else if (tool === 'line') finish({ t: 'line', a, b });
          else if (tool === 'ray') finish({ t: 'ray', a, b });
          else if (tool === 'circle') finish({ t: 'circ', c: a, p: b });
          else if (tool === 'midpoint') finish({ t: 'mid', a, b });
          else if (tool === 'distance') finish({ t: 'dist', a, b });
          else if (tool === 'bisector') finish({ t: 'bis', a, b, c });
          else if (tool === 'ellipse') finish({ t: 'ell', f1: a, f2: b, p: c });
          else if (tool === 'hyperbola') finish({ t: 'hyp', f1: a, f2: b, p: c });
          else finish({ t: 'ang', a, b, c });
        } else { this.g.requestDraw(false); this._notify(); }
        return true;
      }
      if (tool === 'pointon') {
        const h = this.hit(wx, wy, 'curve'), S = h && this.shape(h);
        if (!S) return true;
        this._snap();
        const r = this._onParam(S, [wx, wy]);
        const o = { t: 'onp', obj: h.id, s: r.s }; if (r.br) o.br = r.br;
        this._add(o); this._changed(); return true;
      }
      if (tool === 'locus') {
        const h = this.hit(wx, wy, 'point');
        if (!h) return true;
        if (!P.length) { if (h.t !== 'onp') { if (this.opts.toast) this.opts.toast('First click a point that lies on an object (use the Point on tool)'); return true; } P.push(h.id); this.g.requestDraw(false); this._notify(); return true; }
        if (h.id === P[0]) return true;
        this._snap(); finish({ t: 'locus', drv: P[0], tr: h.id });
        return true;
      }
      if (tool === 'perp' || tool === 'parallel' || tool === 'parabola') {
        const pHit = this.hit(wx, wy, 'point'), lHit = pHit ? null : this.hit(wx, wy, 'curve');
        const isLine = (o) => o && LINE_TYPES.includes(o.t);
        let pt = P.find((id) => this.isPoint(this.get(id))), ln = P.find((id) => isLine(this.get(id)));
        if (pHit) { if (pt === undefined) { P.push(pHit.id); pt = pHit.id; } }
        else if (isLine(lHit)) { if (ln === undefined) { P.push(lHit.id); ln = lHit.id; } }
        else if (!lHit && pt === undefined) { this._snap(); const np = this._add({ t: 'pt', x: +wx.toFixed(4), y: +wy.toFixed(4) }); P.push(np.id); pt = np.id; }
        if (pt !== undefined && ln !== undefined) { this._snap(); finish(tool === 'parabola' ? { t: 'parab', f: pt, d: ln } : { t: tool === 'perp' ? 'perp' : 'par', p: pt, l: ln }); }
        else { this.g.requestDraw(false); this._notify(); }
        return true;
      }
      if (tool === 'intersect') {
        const h = this.hit(wx, wy, 'curve');
        if (!h || !this.shape(h) || P.includes(h.id)) return true;
        P.push(h.id);
        if (P.length === 2) {
          this._snap();
          const A = this.shape(this.get(P[0])), B = this.shape(this.get(P[1]));
          const conic = A.k === 'conic' || B.k === 'conic';
          const need = conic ? Math.min(8, this.intersectAll(A, B).length) : (A.k === 'circ' || B.k === 'circ') ? 2 : 1;
          let made = 0;
          for (let k = 0; k < need; k++) if (this._intersect(A, B, k)) { this._add({ t: 'int', a: P[0], b: P[1], k }); made++; }
          if (!made && this.opts.toast) this.opts.toast('These objects do not intersect');
          this.pending = []; this._changed();
        } else this.g.requestDraw(false);
        this._notify();
        return true;
      }
      if (tool === 'polygon') {
        const p = this._pointAt(wx, wy);
        if (P.length >= 3 && p.id === P[0]) { this._snap(); const pts = P.slice(); finish({ t: 'poly', pts }); return true; }
        if (!P.includes(p.id)) P.push(p.id);
        this.g.requestDraw(false); this._notify();
        return true;
      }
      if (tool === 'area') {
        const h = this.hit(wx, wy, 'curve');
        if (h && (h.t === 'poly' || h.t === 'circ')) { this._snap(); finish({ t: 'area', target: h.id }); }
        return true;
      }
      return false;
    }
    _remove(id) {
      const dead = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const o of this.objects) {
          if (dead.has(o.id)) continue;
          const refs = REF_KEYS.map((k) => o[k]).filter((v) => typeof v === 'number').concat(o.pts || [], typeof o.target === 'number' ? [o.target] : []);
          if (refs.some((r) => dead.has(r))) { dead.add(o.id); changed = true; }
        }
      }
      this.objects = this.objects.filter((o) => !dead.has(o.id));
    }
  }

  global.Geo = Geo;
  global.GEO_TOOLS = TOOLS;
})(window);
