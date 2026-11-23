/* ==========================================================
   Geometry mode: dynamic constructions on top of the 2D Graph.
   Objects: pt, mid, int (points) · seg, line, ray, perp, par · circ · poly · ang, dist
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
    { id: 'intersect', icon: '✕', label: 'Intersect', hint: 'Click two lines/circles' },
    { id: 'polygon', icon: '▱', label: 'Polygon', hint: 'Click points; click the first point again to close' },
    { id: 'angle', icon: '∠', label: 'Angle', hint: 'Click three points (the vertex is the middle one)' },
    { id: 'distance', icon: '↔', label: 'Distance', hint: 'Click two points' },
    { id: 'delete', icon: '⌫', label: 'Delete', hint: 'Click an object to delete it (and anything built on it)' },
  ];
  const COLORS = { pt: '#2d70b3', curve: '#2d70b3', poly: '#6042a6', meas: '#c74440', hi: '#fa7e19' };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

  class Geo {
    constructor(graph, opts) {
      this.g = graph;
      this.opts = opts || {};
      this.objects = []; this.nextId = 1;
      this.tool = 'move'; this.pending = []; this.hover = null; this.drag = null;
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
    setTool(t) { this.tool = t; this.pending = []; this.g.requestDraw(false); if (this.opts.onTool) this.opts.onTool(t, this.status()); }
    status() { const t = TOOLS.find((x) => x.id === this.tool); return t ? t.hint + (this.pending.length ? `  ·  ${this.pending.length} selected` : '') : ''; }

    get(id) { return this.objects.find((o) => o.id === id); }
    _name() {
      const used = new Set(this.objects.map((o) => o.name));
      for (let k = 0; k < 700; k++) { const n = String.fromCharCode(65 + (k % 26)) + (k >= 26 ? Math.floor(k / 26) : ''); if (!used.has(n)) return n; }
      return 'P';
    }
    _add(o) { o.id = this.nextId++; if (['pt', 'mid', 'int'].includes(o.t)) o.name = this._name(); this.objects.push(o); return o; }

    /* ---------- evaluation ---------- */
    pos(o, depth) {
      depth = depth || 0; if (!o || depth > 40) return null;
      if (o.t === 'pt') return [o.x, o.y];
      if (o.t === 'mid') { const a = this.pos(this.get(o.a), depth + 1), b = this.pos(this.get(o.b), depth + 1); return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null; }
      if (o.t === 'int') {
        const A = this.shape(this.get(o.a), depth + 1), B = this.shape(this.get(o.b), depth + 1);
        return A && B ? this._intersect(A, B, o.k) : null;
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
        case 'circ': {
          const c = this.pos(this.get(o.c), depth + 1), q = this.pos(this.get(o.p), depth + 1);
          if (!c || !q) return null;
          const r = Math.hypot(q[0] - c[0], q[1] - c[1]);
          return r > 0 ? { k: 'circ', c, r } : null;
        }
        default: return null;
      }
    }
    _inRange(k, t) { return k === 'seg' ? t >= -1e-9 && t <= 1 + 1e-9 : k === 'ray' ? t >= -1e-9 : true; }
    _intersect(A, B, k) {
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

    /* ---------- drawing ---------- */
    draw(ctx, g) {
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
      const sx = (p) => g.X(p[0]), sy = (p) => g.Y(p[1]);
      const hi = (o) => this.pending.includes(o.id) || this.hover === o.id;
      const r = g.range(), ext = 4 * Math.hypot(r.xmax - r.xmin, r.ymax - r.ymin);
      // polygons first
      for (const o of this.objects) if (o.t === 'poly') {
        const pts = o.pts.map((id) => this.pos(this.get(id))); if (pts.some((p) => !p)) continue;
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(sx(p), sy(p)) : ctx.moveTo(sx(p), sy(p)))); ctx.closePath();
        ctx.fillStyle = COLORS.poly + '33'; ctx.fill(); ctx.strokeStyle = hi(o) ? COLORS.hi : COLORS.poly; ctx.lineWidth = hi(o) ? 3.4 : 2.2; ctx.stroke();
      }
      // lines, circles
      for (const o of this.objects) {
        const S = this.shape(o); if (!S) continue;
        ctx.strokeStyle = hi(o) ? COLORS.hi : COLORS.curve; ctx.lineWidth = hi(o) ? 3.4 : 2.2;
        ctx.beginPath();
        if (S.k === 'circ') ctx.arc(sx(S.c), sy(S.c), S.r * g.view.sx, 0, Math.PI * 2);
        else {
          const dl = Math.hypot(S.d[0], S.d[1]), u = [S.d[0] / dl, S.d[1] / dl];
          let a = S.p, b;
          if (S.k === 'seg') b = [S.p[0] + S.d[0], S.p[1] + S.d[1]];
          else if (S.k === 'ray') b = [S.p[0] + u[0] * ext, S.p[1] + u[1] * ext];
          else { a = [S.p[0] - u[0] * ext, S.p[1] - u[1] * ext]; b = [S.p[0] + u[0] * ext, S.p[1] + u[1] * ext]; }
          ctx.moveTo(sx(a), sy(a)); ctx.lineTo(sx(b), sy(b));
        }
        ctx.stroke();
      }
      // measurements
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
          const ccw = cross(v1, v2) > 0; // world ccw == canvas counter-clockwise
          ctx.strokeStyle = COLORS.meas; ctx.lineWidth = hi(o) ? 3 : 1.8; ctx.beginPath();
          ctx.arc(sx(b), sy(b), 26, a1, a2, ccw); ctx.stroke();
          const mid = a1 + (ccw ? -ang / 2 : ang / 2);
          this._label(ctx, `${+(ang * 180 / Math.PI).toFixed(2)}°`, sx(b) + Math.cos(mid) * 46, sy(b) + Math.sin(mid) * 46, COLORS.meas);
        }
      }
      // points last
      for (const o of this.objects) {
        if (!['pt', 'mid', 'int'].includes(o.t)) continue;
        const p = this.pos(o); if (!p) continue;
        const x = sx(p), y = sy(p), h = hi(o);
        ctx.beginPath(); ctx.arc(x, y, h ? 8 : 6.5, 0, Math.PI * 2); ctx.fillStyle = g.theme.bg; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, h ? 6.2 : 4.8, 0, Math.PI * 2); ctx.fillStyle = h ? COLORS.hi : (o.t === 'pt' ? COLORS.pt : '#6a6a6a'); ctx.fill();
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
      const pts = this.objects.filter((o) => ['pt', 'mid', 'int'].includes(o.t));
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
        } else if (o.t === 'dist' || o.t === 'ang') {
          const ids = o.t === 'dist' ? [o.a, o.b] : [o.a, o.b, o.c]; const P = ids.map((id) => this.pos(this.get(id))); if (P.some((p) => !p)) continue;
          const c = P[o.t === 'ang' ? 1 : 0], q = o.t === 'ang' ? [c[0], c[1]] : [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
          d = Math.hypot(sxp(q[0]) - mx, syp(q[1]) - my) - (o.t === 'ang' ? 26 : 0); d = Math.abs(d) * (o.t === 'ang' ? 1 : 1) + (o.t === 'dist' ? 0 : 0);
          if (o.t === 'dist') d = segDist([sxp(P[0][0]), syp(P[0][1])], [sxp(P[1][0]), syp(P[1][1])]);
        } else {
          const S = this.shape(o); if (!S) continue;
          if (S.k === 'circ') d = Math.abs(Math.hypot(sxp(S.c[0]) - mx, syp(S.c[1]) - my) - S.r * g.view.sx);
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
        g.over.style.cursor = this.tool === 'move' ? (h && h.t === 'pt' ? 'grab' : h ? 'pointer' : '') : (this.tool === 'delete' ? (h ? 'not-allowed' : '') : 'crosshair');
        if (id !== this.hover) { this.hover = id; g.requestDraw(false); }
        return false;
      }
      if (type === 'down') {
        if (this.tool !== 'move') return false;
        const h = this.hit(wx, wy, 'point');
        if (h && h.t === 'pt') { this._snap(); this.drag = h; g.over.style.cursor = 'grabbing'; return true; }
        return false;
      }
      if (type === 'move') {
        if (this.drag) { this.drag.x = wx; this.drag.y = wy; g.requestDraw(false); }
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
    click(wx, wy) {
      const tool = this.tool, P = this.pending;
      if (tool === 'move') { this.hover = null; return false; }
      if (tool === 'delete') {
        const h = this.hit(wx, wy); if (!h) return true;
        this._snap(); this._remove(h.id); this._changed(); return true;
      }
      if (tool === 'point') { const h = this.hit(wx, wy, 'point'); if (!h) { this._snap(); this._add({ t: 'pt', x: +wx.toFixed(4), y: +wy.toFixed(4) }); this._changed(); } return true; }
      const finish = (o) => { this._add(o); this.pending = []; this._changed(); if (this.opts.onTool) this.opts.onTool(this.tool, this.status()); };
      const needPts = { segment: 2, line: 2, ray: 2, circle: 2, midpoint: 2, distance: 2, angle: 3 }[tool];
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
          else finish({ t: 'ang', a, b, c });
        } else { this.g.requestDraw(false); if (this.opts.onTool) this.opts.onTool(tool, this.status()); }
        return true;
      }
      if (tool === 'perp' || tool === 'parallel') {
        const pHit = this.hit(wx, wy, 'point'), lHit = pHit ? null : this.hit(wx, wy, 'curve');
        const isLine = (o) => o && ['seg', 'line', 'ray', 'perp', 'par'].includes(o.t);
        let pt = P.find((id) => ['pt', 'mid', 'int'].includes(this.get(id).t)), ln = P.find((id) => isLine(this.get(id)));
        if (pHit) { if (pt === undefined) { P.push(pHit.id); pt = pHit.id; } }
        else if (isLine(lHit)) { if (ln === undefined) { P.push(lHit.id); ln = lHit.id; } }
        else if (!lHit && pt === undefined) { this._snap(); const np = this._add({ t: 'pt', x: +wx.toFixed(4), y: +wy.toFixed(4) }); P.push(np.id); pt = np.id; }
        if (pt !== undefined && ln !== undefined) { this._snap(); finish({ t: tool === 'perp' ? 'perp' : 'par', p: pt, l: ln }); }
        else { this.g.requestDraw(false); if (this.opts.onTool) this.opts.onTool(tool, this.status()); }
        return true;
      }
      if (tool === 'intersect') {
        const h = this.hit(wx, wy, 'curve');
        if (!h || !this.shape(h) || P.includes(h.id)) return true;
        P.push(h.id);
        if (P.length === 2) {
          this._snap();
          const A = this.shape(this.get(P[0])), B = this.shape(this.get(P[1]));
          const need = (A.k === 'circ' || B.k === 'circ') ? 2 : 1;
          let made = 0;
          for (let k = 0; k < need; k++) if (this._intersect(A, B, k)) { this._add({ t: 'int', a: P[0], b: P[1], k }); made++; }
          if (!made && this.opts.toast) this.opts.toast('These objects do not intersect');
          this.pending = []; this._changed();
        } else this.g.requestDraw(false);
        if (this.opts.onTool) this.opts.onTool(tool, this.status());
        return true;
      }
      if (tool === 'polygon') {
        const p = this._pointAt(wx, wy);
        if (P.length >= 3 && p.id === P[0]) { this._snap(); const pts = P.slice(); finish({ t: 'poly', pts }); return true; }
        if (!P.includes(p.id)) P.push(p.id);
        this.g.requestDraw(false); if (this.opts.onTool) this.opts.onTool(tool, this.status());
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
          const refs = [o.a, o.b, o.c, o.p, o.l].filter((v) => typeof v === 'number').concat(o.pts || []);
          if (refs.some((r) => dead.has(r))) { dead.add(o.id); changed = true; }
        }
      }
      this.objects = this.objects.filter((o) => !dead.has(o.id));
    }
  }

  global.Geo = Geo;
  global.GEO_TOOLS = TOOLS;
})(window);
