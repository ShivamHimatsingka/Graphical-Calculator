/* ==========================================================
   Graph renderer + interaction (canvas). Exposes window.Graph
   ========================================================== */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    let n;
    if (m <= 1) n = 1; else if (m <= 2) n = 2; else if (m <= 5) n = 5; else n = 10;
    return { step: n * p, mant: n, exp: Math.floor(Math.log10(n * p) + 1e-9) };
  }
  function gcdInt(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }

  function fmtTick(v, step) {
    if (Math.abs(v) < step * 1e-9) return '0';
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    if (Math.abs(v) >= 1e7 || (Math.abs(v) < 1e-5 && v !== 0) || dec > 8) {
      return v.toExponential(Math.min(dec, 3)).replace(/\.?0+e/, 'e').replace('e+', 'e');
    }
    let s = v.toFixed(dec);
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    return s === '-0' ? '0' : s;
  }
  function fmtPiMultiple(k, n, d) {
    // label for k * (n/d) * pi
    let num = k * n, den = d;
    const g = gcdInt(num, den);
    num /= g; den /= g;
    if (num === 0) return '0';
    const sign = num < 0 ? '−' : '';
    const a = Math.abs(num);
    const head = a === 1 ? 'π' : a + 'π';
    return sign + head + (den === 1 ? '' : '/' + den);
  }
  const PI_STEPS = [[1, 12], [1, 6], [1, 4], [1, 3], [1, 2], [1, 1], [2, 1], [4, 1], [6, 1], [12, 1], [24, 1], [48, 1]];

  function fmtCoord(v) {
    if (!Number.isFinite(v)) return String(v);
    if (Math.abs(v) < 1e-9) return '0';
    const a = Math.abs(v);
    if (a >= 1e7 || a < 1e-4) return v.toExponential(3).replace('e+', 'e');
    return String(parseFloat(v.toPrecision(5)));
  }

  class Graph {
    constructor(host, opts) {
      this.host = host;
      this.base = document.createElement('canvas');
      this.over = document.createElement('canvas');
      this.base.className = 'g-base';
      this.over.className = 'g-over';
      host.appendChild(this.base);
      host.appendChild(this.over);
      this.bctx = this.base.getContext('2d');
      this.octx = this.over.getContext('2d');
      this.tip = opts.tip;
      this.cb = opts.callbacks || {};
      this.view = { x0: 0, y0: 0, sx: 40, sy: 40 };
      this.settings = { grid: true, minor: true, numbers: true, piX: false };
      this.plots = [];
      this.w = 100; this.h = 100; this.dpr = 1;
      this.selectedId = null;
      this.pois = [];
      this.trace = null;
      this.pinned = null;
      this.hoverInfo = null;
      this.tools = { tangent: false, secant: false, h: 1 };
      this.interacting = false;
      this._raf = 0;
      this._idle = 0;
      this.refreshTheme();
      this._bind();
      new ResizeObserver(() => this.resize()).observe(host);
      this.resize(true);
    }

    refreshTheme() {
      const cs = getComputedStyle(document.documentElement);
      const g = (n, d) => (cs.getPropertyValue(n).trim() || d);
      this.theme = {
        bg: g('--g-bg', '#fff'), minor: g('--g-minor', '#eee'), major: g('--g-major', '#d0d0d0'),
        axis: g('--g-axis', '#333'), text: g('--g-text', '#444'), halo: g('--g-bg', '#fff'),
      };
    }

    /* ---------- coordinate helpers ---------- */
    X(x) { return this.w / 2 + (x - this.view.x0) * this.view.sx; }
    Y(y) { return this.h / 2 - (y - this.view.y0) * this.view.sy; }
    invX(px) { return this.view.x0 + (px - this.w / 2) / this.view.sx; }
    invY(py) { return this.view.y0 - (py - this.h / 2) / this.view.sy; }
    range() {
      const v = this.view;
      return { xmin: v.x0 - this.w / 2 / v.sx, xmax: v.x0 + this.w / 2 / v.sx, ymin: v.y0 - this.h / 2 / v.sy, ymax: v.y0 + this.h / 2 / v.sy };
    }
    setRange(xmin, xmax, ymin, ymax) {
      if (!(xmax > xmin) || !(ymax > ymin)) return;
      this.view = { x0: (xmin + xmax) / 2, y0: (ymin + ymax) / 2, sx: this.w / (xmax - xmin), sy: this.h / (ymax - ymin) };
      this.autoFit = false; // an explicit view must survive layout changes (a resize used to snap it back to the default)
      this._viewChanged(false);
    }
    resetView() {
      const s = this.w / 20;
      this.view = { x0: 0, y0: 0, sx: s, sy: s };
      this._viewChanged(false);
      this.autoFit = true;
    }
    squareView() { const v = this.view; const s = Math.sqrt(v.sx * v.sy); v.sx = s; v.sy = s; this._viewChanged(false); }
    zoomAt(px, py, fx, fy) {
      if (this.locked) return;
      const v = this.view;
      const wx = this.invX(px), wy = this.invY(py);
      // Keep the visible span between 1e-7 and 1e5 units on each axis: further out the graph is just empty and
      // takes dozens of clicks to get back from, which feels like being stuck.
      v.sx = clamp(v.sx * fx, Math.max(this.w, 1) / 1e5, Math.max(this.w, 1) / 1e-7);
      v.sy = clamp(v.sy * fy, Math.max(this.h, 1) / 1e5, Math.max(this.h, 1) / 1e-7);
      const hitLimit = (fx < 1 && v.sx <= this.w / 1e5 * 1.0001) || (fx > 1 && v.sx >= this.w / 1e-7 * 0.9999);
      if (hitLimit && this.cb.onLimit) this.cb.onLimit();
      v.x0 = wx - (px - this.w / 2) / v.sx;
      v.y0 = wy + (py - this.h / 2) / v.sy;
      this._viewChanged(true);
    }
    _viewChanged(fast) {
      this.autoFit = false;
      // Every way of changing the view (zoom, axis drag, saved/loaded views) ends up inside sane limits.
      const v = this.view, w = Math.max(this.w, 1), h = Math.max(this.h, 1);
      if (![v.x0, v.y0, v.sx, v.sy].every(Number.isFinite)) this.view = { x0: 0, y0: 0, sx: w / 20, sy: w / 20 };
      else { v.sx = clamp(v.sx, w / 1e5, w / 1e-7); v.sy = clamp(v.sy, h / 1e5, h / 1e-7); }
      if (this.cb.onView) this.cb.onView(this.range());
      this.requestDraw(fast);
    }

    resize(initial) {
      const r = this.host.getBoundingClientRect();
      const w = Math.max(50, Math.floor(r.width)), h = Math.max(50, Math.floor(r.height));
      const dpr = window.devicePixelRatio || 1;
      if (!initial && w === this.w && h === this.h && dpr === this.dpr) return;
      // keep the center and scale when resizing
      this.w = w; this.h = h; this.dpr = dpr;
      for (const c of [this.base, this.over]) {
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
        c.style.width = w + 'px'; c.style.height = h + 'px';
      }
      if (initial) { const s = w / 20; this.view = { x0: 0, y0: 0, sx: s, sy: s }; this.autoFit = true; }
      else if (this.autoFit) { const s = w / 20; this.view = { x0: 0, y0: 0, sx: s, sy: s }; }
      this.requestDraw(false);
      if (this.cb.onView) this.cb.onView(this.range());
    }

    setPlots(plots) { this.plots = plots; }

    requestDraw(fast) {
      if (fast) {
        this.interacting = true;
        clearTimeout(this._idle);
        this._idle = setTimeout(() => { this.interacting = false; this.requestDraw(false); }, 140);
      }
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; clearTimeout(this._rafT); this.draw(); });
      // If the page is not being painted (window in the background, a native dialog open) the animation frame may not fire,
      // which used to leave the canvas stuck on an old view. A timer makes sure the latest view is always drawn.
      clearTimeout(this._rafT); this._rafT = setTimeout(() => { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; this.draw(); } }, 120);
    }

    /* ---------- drawing ---------- */
    draw() {
      const ctx = this.bctx, w = this.w, h = this.h, T = this.theme;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = T.bg;
      ctx.fillRect(0, 0, w, h);
      this.drawGrid(ctx);
      const vis = this.plots.filter((p) => !p.hidden);
      for (const p of this.plots) { p._sel = p.id === this.selectedId; p._hl = p.id === this.highlightId; }
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const p of vis) if (p.kind === 'domain') { try { this.drawDomain(ctx, p); } catch (e) { /* ignore */ } }
      for (const p of vis) if (p.kind === 'ineq') this.drawIneq(ctx, p);
      for (const p of vis) if (p.kind === 'image') { try { this.drawImage(ctx, p); } catch (e) { /* ignore */ } }
      for (const p of vis) {
        if (p.kind === 'ineq' || p.kind === 'domain' || p.kind === 'image') continue;
        p._seg = null;
        ctx.globalAlpha = p.opacity === undefined ? 1 : p.opacity;
        try {
          switch (p.kind) {
            case 'fx': this.drawExplicit(ctx, p, true); break;
            case 'fy': this.drawExplicit(ctx, p, false); break;
            case 'polar': this.drawPolar(ctx, p); break;
            case 'param': this.drawParam(ctx, p); break;
            case 'implicit': this.drawImplicit(ctx, p); break;
            case 'table': this.drawTable(ctx, p); break;
            case 'points': this.drawPoints(ctx, p); break;
            case 'stat': this.drawStat(ctx, p); break;
            case 'custom': p.draw(ctx, this); break;
            default: break;
          }
        } catch (e) { /* ignore per-plot failures */ }
      }
      for (const p of vis) if (p.kind === 'point') { ctx.globalAlpha = p.opacity === undefined ? 1 : p.opacity; this.drawPoint(ctx, p); }
      ctx.globalAlpha = 1;
      ctx.restore();
      this.computePOIs();
      this.drawOverlay();
    }

    drawGrid(ctx) {
      const { w, h } = this, T = this.theme, S = this.settings, r = this.range();
      ctx.save();
      ctx.font = '12px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
      // x ticks
      let xs; // {step, minorDiv, label(k)}
      const targetX = 90 / this.view.sx;
      let stepX, minorX, labelX;
      if (S.piX) {
        let pick = PI_STEPS[PI_STEPS.length - 1];
        for (const s of PI_STEPS) { if (s[0] / s[1] * Math.PI >= targetX * 0.8) { pick = s; break; } }
        stepX = pick[0] / pick[1] * Math.PI;
        minorX = pick[1] % 3 === 0 ? 3 : (pick[1] % 2 === 0 ? 2 : (pick[0] === 1 ? 1 : 2));
        labelX = (k) => fmtPiMultiple(k, pick[0], pick[1]);
      } else {
        const nx = niceStep(targetX);
        stepX = nx.step; minorX = nx.mant === 2 ? 4 : 5;
        labelX = (k) => fmtTick(k * stepX, stepX);
      }
      const ny = niceStep(90 / this.view.sy);
      const stepY = ny.step, minorY = ny.mant === 2 ? 4 : 5;

      const lines = (min, max, step, minorDiv, isX) => {
        const out = [];
        const k0 = Math.floor(min / step) - 1, k1 = Math.ceil(max / step) + 1;
        if (k1 - k0 > 400) return out;
        for (let k = k0; k <= k1; k++) {
          out.push({ k, v: k * step, major: true });
          if (S.minor && minorDiv > 1) for (let m = 1; m < minorDiv; m++) out.push({ k, v: k * step + step * m / minorDiv, major: false });
        }
        return out;
      };
      const xl = lines(r.xmin, r.xmax, stepX, minorX, true);
      const yl = lines(r.ymin, r.ymax, stepY, minorY, false);
      if (S.grid && S.gridType === 'polar') {
        const ox = this.X(0), oy = this.Y(0);
        const far = Math.max(Math.hypot(ox, oy), Math.hypot(w - ox, oy), Math.hypot(ox, h - oy), Math.hypot(w - ox, h - oy));
        const ns = niceStep(70 / Math.min(this.view.sx, this.view.sy)).step;
        ctx.lineWidth = 1;
        for (let k = 1; k < 400 && k * ns * Math.min(this.view.sx, this.view.sy) < far; k++) {
          ctx.strokeStyle = k % 5 === 0 ? T.major : T.minor;
          ctx.beginPath(); ctx.ellipse(ox, oy, k * ns * this.view.sx, k * ns * this.view.sy, 0, 0, TAU); ctx.stroke();
        }
        for (let a = 0; a < 24; a++) {
          const ang = a * Math.PI / 12; ctx.strokeStyle = a % 2 === 0 ? T.major : T.minor;
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.cos(ang) * far * 1.5, oy - Math.sin(ang) * far * 1.5); ctx.stroke();
        }
      } else if (S.grid && S.gridType !== 'none') {
        ctx.lineWidth = 1;
        for (const pass of [false, true]) {
          ctx.strokeStyle = pass ? T.major : T.minor;
          ctx.beginPath();
          for (const l of xl) { if (l.major !== pass || Math.abs(l.v) < 1e-12) continue; const px = Math.round(this.X(l.v)) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, h); }
          for (const l of yl) { if (l.major !== pass || Math.abs(l.v) < 1e-12) continue; const py = Math.round(this.Y(l.v)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(w, py); }
          ctx.stroke();
        }
      }
      // axes
      const ax = this.X(0), ay = this.Y(0);
      if (S.axes === false) { ctx.restore(); return; }
      ctx.strokeStyle = T.axis; ctx.lineWidth = 1.4;
      const showX = S.showAxisX !== false, showY = S.showAxisY !== false;
      ctx.beginPath();
      if (showX && ay >= -1 && ay <= h + 1) { ctx.moveTo(0, Math.round(ay) + 0.5); ctx.lineTo(w, Math.round(ay) + 0.5); }
      if (showY && ax >= -1 && ax <= w + 1) { ctx.moveTo(Math.round(ax) + 0.5, 0); ctx.lineTo(Math.round(ax) + 0.5, h); }
      ctx.stroke();
      if (S.arrows) {
        ctx.fillStyle = T.axis;
        const tri = (x, y, dx, dy) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * 10 + dy * 5, y - dy * 10 - dx * 5); ctx.lineTo(x - dx * 10 - dy * 5, y - dy * 10 + dx * 5); ctx.closePath(); ctx.fill(); };
        if (showX && ay >= 0 && ay <= h) { tri(w - 1, Math.round(ay) + 0.5, 1, 0); tri(1, Math.round(ay) + 0.5, -1, 0); }
        if (showY && ax >= 0 && ax <= w) { tri(Math.round(ax) + 0.5, 1, 0, -1); tri(Math.round(ax) + 0.5, h - 1, 0, 1); }
      }
      if ((S.axisLabelX || S.axisLabelY)) {
        ctx.fillStyle = T.text; ctx.strokeStyle = T.halo; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.font = 'italic 14px -apple-system, "Segoe UI", Roboto, sans-serif';
        if (S.axisLabelX && showX) { ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; const yy = clamp(ay, 16, h - 6) - 8; ctx.strokeText(S.axisLabelX, w - 14, yy); ctx.fillText(S.axisLabelX, w - 14, yy); }
        if (S.axisLabelY && showY) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; const xx = clamp(ax, 6, w - 60) + 10; ctx.strokeText(S.axisLabelY, xx, 8); ctx.fillText(S.axisLabelY, xx, 8); }
      }
      // labels
      if (S.numbers) {
        ctx.fillStyle = T.text; ctx.strokeStyle = T.halo; ctx.lineWidth = 4; ctx.lineJoin = 'round';
        const axc = clamp(ax, 0, w), ayc = clamp(ay, 0, h);
        const label = (txt, x, y) => { ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y); };
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        let ly = ayc + 16; if (ly > h - 4) ly = ayc - 7;
        for (const l of xl) {
          if (S.showAxisX === false || !l.major || Math.abs(l.v) < 1e-12) continue;
          const px = this.X(l.v);
          if (px < 12 || px > w - 12) continue;
          label(labelX(l.k), px, ly);
        }
        const leftSide = axc < 44;
        ctx.textAlign = leftSide ? 'left' : 'right';
        const lx = leftSide ? axc + 7 : axc - 7;
        ctx.textBaseline = 'middle';
        for (const l of yl) {
          if (S.showAxisY === false || !l.major || Math.abs(l.v) < 1e-12) continue;
          const py = this.Y(l.v);
          if (py < 10 || py > h - 10) continue;
          label(fmtTick(l.v, stepY), lx, py);
        }
        if (ax > -20 && ax < w + 20 && ay > -20 && ay < h + 20) {
          ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
          label('0', clamp(ax, 14, w) - 6, clamp(ay, 0, h - 4) + 15);
        }
      }
      ctx.restore();
    }

    lineStyle(ctx, p, extra) {
      ctx.strokeStyle = p.color; ctx.fillStyle = p.color;
      ctx.lineWidth = (p.width || 2.5) * (extra || 1) * (p._hl ? 1.5 : 1);
      const lw = ctx.lineWidth;
      if (p.lineStyle === 'dashed') ctx.setLineDash([lw * 3.2, lw * 2.4]);
      else if (p.lineStyle === 'dotted') ctx.setLineDash([0.1, lw * 2.2]);
      else ctx.setLineDash([]);
    }

    /* explicit y=f(x) (horizontal=true) or x=f(y) */
    drawExplicit(ctx, p, horizontal) {
      const r = this.range();
      const umin = horizontal ? r.xmin : r.ymin, umax = horizontal ? r.xmax : r.ymax;
      const rg = p.range ? p.range() : { lo: -Infinity, hi: Infinity };
      const lo = Math.max(umin, rg.lo), hi = Math.min(umax, rg.hi);
      if (!(hi >= lo)) return;
      const pxU = horizontal ? this.view.sx : this.view.sy;
      const stepPx = this.interacting ? 2 : 1;
      const N = Math.max(2, Math.min(8000, Math.ceil((hi - lo) * pxU / stepPx)));
      const f = p.f, cond = p.cond;
      const W = this.w, H = this.h;
      const ev = (u) => {
        const v = f(u);
        if (typeof v !== 'number' || !Number.isFinite(v)) return NaN;
        if (cond && !cond(horizontal ? u : v, horizontal ? v : u)) return NaN;
        return v;
      };
      const sxy = (u, v) => (horizontal ? [this.X(u), this.Y(v)] : [this.X(v), this.Y(u)]);
      const seg = [];
      this.lineStyle(ctx, p, p._sel ? 1.25 : 1);
      ctx.beginPath();
      let pen = false, lu = 0, lv = 0, lx = 0, ly = 0;
      // Keep drawn coordinates close to the visible area. Safari/WebKit takes seconds per frame to stroke paths whose points are
      // hundreds of thousands of pixels away (y=3^x froze the page); Chrome clips them instantly.
      const BAND = 3 * Math.max(W, H) + 100;
      const lim = (a) => clamp(a, -BAND, BAND);
      const perp = (a, b) => (horizontal ? Math.abs(a[1] - b[1]) : Math.abs(a[0] - b[0]));
      const moveTo = (u, v) => { const [a, b] = sxy(u, v); lx = lim(a); ly = lim(b); ctx.moveTo(lx, ly); pen = true; lu = u; lv = v; };
      const lineTo = (u, v) => { const [a, b] = sxy(u, v); const nx = lim(a), ny = lim(b); ctx.lineTo(nx, ny); seg.push(lx, ly, nx, ny); lx = nx; ly = ny; lu = u; lv = v; };
      const subdiv = (u0, v0, u1, v1, depth) => {
        const a = sxy(u0, v0), b = sxy(u1, v1);
        const d = perp(a, b);
        // Both ends off-screen on the same side: nothing visible can happen in between, so don't subdivide. Without this a steep
        // curve (y=3^x) produced ~50,000 segments and Safari needed seconds to stroke them.
        const o = horizontal ? 1 : 0, size = horizontal ? H : W;
        if ((a[o] < 0 && b[o] < 0) || (a[o] > size && b[o] > size)) { lineTo(u1, v1); return; }
        if (d > 3 && depth < 10) {
          const um = (u0 + u1) / 2, vm = ev(um);
          if (Number.isNaN(vm)) { moveTo(u1, v1); return; }
          subdiv(u0, v0, um, vm, depth + 1);
          subdiv(um, vm, u1, v1, depth + 1);
          return;
        }
        if (d > 3) { moveTo(u1, v1); return; } // discontinuity
        lineTo(u1, v1);
      };
      const bisectEdge = (uGood, uBad) => {
        for (let i = 0; i < 18; i++) { const m = (uGood + uBad) / 2; if (Number.isNaN(ev(m))) uBad = m; else uGood = m; }
        return uGood;
      };
      let pu = lo, pv = ev(lo);
      if (!Number.isNaN(pv)) moveTo(pu, pv);
      for (let i = 1; i <= N; i++) {
        const u = lo + (hi - lo) * i / N;
        const v = ev(u);
        const curOk = !Number.isNaN(v), prevOk = !Number.isNaN(pv);
        if (curOk && prevOk) {
          if (!pen) moveTo(pu, pv);
          subdiv(pu, pv, u, v, 0);
        } else if (curOk && !prevOk) {
          const ub = bisectEdge(u, pu);
          const vb = ev(ub);
          moveTo(ub, vb);
          if (ub !== u) subdiv(ub, vb, u, v, 0);
        } else if (!curOk && prevOk) {
          const ub = bisectEdge(pu, u);
          const vb = ev(ub);
          if (!pen) moveTo(pu, pv);
          if (ub !== pu) subdiv(pu, pv, ub, vb, 0);
          pen = false;
        } else pen = false;
        pu = u; pv = v;
      }
      ctx.stroke();
      p._seg = new Float32Array(seg);
    }

    _polyline(ctx, p, N, getPoint) {
      const seg = [];
      this.lineStyle(ctx, p, p._sel ? 1.25 : 1);
      ctx.beginPath();
      let pen = false, lx = 0, ly = 0;
      const W = this.w, H = this.h;
      for (let i = 0; i <= N; i++) {
        const pt = getPoint(i);
        if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) { pen = false; continue; }
        const BAND = 3 * Math.max(W, H) + 100;
        const x = clamp(this.X(pt[0]), -BAND, BAND), y = clamp(this.Y(pt[1]), -BAND, BAND);
        if (!pen) { ctx.moveTo(x, y); pen = true; }
        else {
          if (Math.abs(x - lx) > 3 * W + 100 || Math.abs(y - ly) > 3 * H + 100) { ctx.moveTo(x, y); }
          else { ctx.lineTo(x, y); seg.push(lx, ly, x, y); }
        }
        lx = x; ly = y;
      }
      ctx.stroke();
      p._seg = new Float32Array(seg);
    }

    drawPolar(ctx, p) {
      const rg = p.range ? p.range() : { lo: -Infinity, hi: Infinity };
      let lo = Number.isFinite(rg.lo) ? rg.lo : 0, hi = Number.isFinite(rg.hi) ? rg.hi : 6 * Math.PI;
      if (!(hi > lo)) return;
      const N = clamp(Math.ceil((hi - lo) / TAU * (this.interacting ? 360 : 1000)), 60, 40000);
      this._polyline(ctx, p, N, (i) => {
        const th = lo + (hi - lo) * i / N;
        const rr = p.f(th);
        if (!Number.isFinite(rr)) return null;
        if (p.cond && !p.cond(th, rr)) return null;
        return [rr * Math.cos(th), rr * Math.sin(th)];
      });
    }

    drawParam(ctx, p) {
      const rg = p.range ? p.range() : { lo: -Infinity, hi: Infinity };
      let lo = Number.isFinite(rg.lo) ? rg.lo : 0, hi = Number.isFinite(rg.hi) ? rg.hi : 1;
      if (!(hi >= lo)) return;
      const N = this.interacting ? 1200 : 4000;
      this._polyline(ctx, p, N, (i) => {
        const t = lo + (hi - lo) * i / N;
        const pt = p.f(t);
        if (!pt) return null;
        if (p.cond && !p.cond(t)) return null;
        return pt;
      });
    }

    drawTable(ctx, p) {
      const pts = p.points || [];
      if (p.showLine && pts.length > 1) {
        const seg = [];
        this.lineStyle(ctx, p);
        ctx.beginPath();
        pts.forEach((q, i) => { const x = this.X(q[0]), y = this.Y(q[1]); if (i) { ctx.lineTo(x, y); seg.push(this.X(pts[i - 1][0]), this.Y(pts[i - 1][1]), x, y); } else ctx.moveTo(x, y); });
        ctx.stroke();
        p._seg = new Float32Array(seg);
      }
      ctx.setLineDash([]);
      for (const q of pts) this.dot(ctx, this.X(q[0]), this.Y(q[1]), p.color, p.size || 5, p.pstyle);
    }

    drawPoints(ctx, p) {
      let v;
      try { v = p.get(); } catch (e) { return; }
      const list = (Array.isArray(v) ? v : [v]).map((q) => (q && q.re !== undefined ? { x: q.re, y: q.im } : q)).filter((q) => q && Number.isFinite(q.x) && Number.isFinite(q.y)).slice(0, 50000);
      if (p.showLine && list.length > 1) {
        const seg = [];
        this.lineStyle(ctx, p);
        ctx.beginPath();
        list.forEach((q, i) => { const x = this.X(q.x), y = this.Y(q.y); if (i) { ctx.lineTo(x, y); seg.push(this.X(list[i - 1].x), this.Y(list[i - 1].y), x, y); } else ctx.moveTo(x, y); });
        ctx.stroke();
        p._seg = new Float32Array(seg);
      }
      ctx.setLineDash([]);
      for (const q of list) this.dot(ctx, this.X(q.x), this.Y(q.y), p.color, p.size || 4.5, p.pstyle);
    }

    /* complex domain colouring: hue = arg f(z), brightness bands = log2 |f(z)| */
    drawDomain(ctx, p) {
      const cell = this.interacting ? 8 : 3;
      const W = this.w, H = this.h, nx = Math.ceil(W / cell), ny = Math.ceil(H / cell);
      const img = new ImageData(nx, ny), d = img.data;
      for (let j = 0; j < ny; j++) {
        const y = this.invY((j + 0.5) * cell);
        for (let i = 0; i < nx; i++) {
          const w = p.eval(this.invX((i + 0.5) * cell), y);
          if (!w || !Number.isFinite(w[0]) || !Number.isFinite(w[1])) continue;
          const mag = Math.hypot(w[0], w[1]);
          const h = ((Math.atan2(w[1], w[0]) / TAU) + 1) % 1;
          let v = 0.5, sat = 0.9;
          if (mag === 0) { v = 0; } else { const t = Math.log2(mag); v = 0.5 + 0.5 * (t - Math.floor(t)); sat = 0.55 + 0.45 * (1 - 0.5 * (t - Math.floor(t))); }
          const k = Math.floor(h * 6), f = h * 6 - k, pp = v * (1 - sat), q = v * (1 - f * sat), t2 = v * (1 - (1 - f) * sat);
          const rgb = [[v, t2, pp], [q, v, pp], [pp, v, t2], [pp, q, v], [t2, pp, v], [v, pp, q]][k % 6];
          const o = (j * nx + i) * 4; d[o] = rgb[0] * 255; d[o + 1] = rgb[1] * 255; d[o + 2] = rgb[2] * 255; d[o + 3] = 255;
        }
      }
      const tmp = this._tmp2 || (this._tmp2 = document.createElement('canvas'));
      tmp.width = nx; tmp.height = ny; tmp.getContext('2d').putImageData(img, 0, 0);
      ctx.save(); ctx.globalAlpha = p.alpha === undefined ? 0.88 : p.alpha; ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tmp, 0, 0, nx * cell, ny * cell); ctx.restore();
    }

    /* histogram / box plot / dot plot */
    drawStat(ctx, p) {
      let m; try { m = p.get(); } catch (e) { return; }
      if (!m || !m.__plot) return;
      const data = m.__plot === 'bar' ? m.data.slice() : m.data.filter(Number.isFinite).sort((a, b) => a - b);
      const n = data.length; if (!n) return;
      const col = p.color;
      ctx.save();
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = p.width || 2; ctx.setLineDash([]);
      if (m.__plot === 'hist') {
        const lo = data[0], hi = data[n - 1];
        let w = m.w;
        if (!w) w = hi > lo ? niceStep((hi - lo) / Math.max(1, Math.ceil(Math.log2(n) + 1))).step : 1;
        const start = Math.floor(lo / w) * w, nb = Math.floor((hi - start) / w + 1e-9) + 1;
        if (nb > 5000) { ctx.restore(); return; }
        const counts = new Array(nb).fill(0);
        for (const v of data) counts[Math.min(nb - 1, Math.floor((v - start) / w + 1e-9))]++;
        counts.forEach((c, k) => {
          if (!c) return;
          const x0 = this.X(start + k * w), x1 = this.X(start + (k + 1) * w), y0 = this.Y(0), y1 = this.Y(c);
          ctx.globalAlpha = 0.35; ctx.fillRect(x0, y1, x1 - x0, y0 - y1);
          ctx.globalAlpha = 1; ctx.strokeRect(x0, y1, x1 - x0, y0 - y1);
        });
      } else if (m.__plot === 'bar') {
        const w = m.w || 0.8;
        m.data.forEach((v, k) => {
          if (!Number.isFinite(v)) return;
          const x0 = this.X(k + 1 - w / 2), x1 = this.X(k + 1 + w / 2), y0 = this.Y(0), y1 = this.Y(v);
          ctx.globalAlpha = 0.35; ctx.fillRect(x0, Math.min(y0, y1), x1 - x0, Math.abs(y0 - y1));
          ctx.globalAlpha = 1; ctx.strokeRect(x0, Math.min(y0, y1), x1 - x0, Math.abs(y0 - y1));
        });
      } else if (m.__plot === 'box') {
        const q = (f) => { const pos = f * (n - 1), a = Math.floor(pos), b = Math.ceil(pos); return data[a] + (data[b] - data[a]) * (pos - a); };
        const q1 = q(0.25), q2 = q(0.5), q3 = q(0.75), iqr = q3 - q1;
        const inl = data.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
        const wl = inl[0], wh = inl[inl.length - 1], hw = (m.w || 1) / 2;
        const yt = this.Y(hw), yb = this.Y(-hw), ym = this.Y(0);
        ctx.globalAlpha = 0.25; ctx.fillRect(this.X(q1), yt, this.X(q3) - this.X(q1), yb - yt);
        ctx.globalAlpha = 1; ctx.strokeRect(this.X(q1), yt, this.X(q3) - this.X(q1), yb - yt);
        ctx.beginPath();
        ctx.moveTo(this.X(q2), yt); ctx.lineTo(this.X(q2), yb);
        ctx.moveTo(this.X(wl), ym); ctx.lineTo(this.X(q1), ym); ctx.moveTo(this.X(q3), ym); ctx.lineTo(this.X(wh), ym);
        ctx.moveTo(this.X(wl), this.Y(hw / 2)); ctx.lineTo(this.X(wl), this.Y(-hw / 2)); ctx.moveTo(this.X(wh), this.Y(hw / 2)); ctx.lineTo(this.X(wh), this.Y(-hw / 2));
        ctx.stroke();
        for (const v of data) if (v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr) { ctx.beginPath(); ctx.arc(this.X(v), ym, 3.5, 0, TAU); ctx.stroke(); }
      } else { // dots
        const lo = data[0], hi = data[n - 1];
        const w = m.w || (hi > lo ? niceStep((hi - lo) / 30).step : 1);
        const stacks = new Map();
        for (const v of data) { const key = Math.round(v / w); const c = (stacks.get(key) || 0); stacks.set(key, c + 1); ctx.beginPath(); ctx.arc(this.X(key * w), this.Y(0) - 8 - c * 11, 4.8, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }

    dot(ctx, x, y, color, rad, style) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < -50 || y < -50 || x > this.w + 50 || y > this.h + 50) return;
      const ga = ctx.globalAlpha;
      if (style === 'cross') {
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, rad * 0.45); ctx.lineCap = 'round'; ctx.beginPath();
        ctx.moveTo(x - rad, y - rad); ctx.lineTo(x + rad, y + rad); ctx.moveTo(x + rad, y - rad); ctx.lineTo(x - rad, y + rad); ctx.stroke(); ctx.restore(); return;
      }
      if (style === 'open') {
        ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fillStyle = this.theme.bg; ctx.fill();
        ctx.lineWidth = Math.max(2, rad * 0.4); ctx.strokeStyle = color; ctx.stroke(); return;
      }
      ctx.beginPath(); ctx.arc(x, y, rad + 1.5, 0, TAU); ctx.fillStyle = this.theme.bg; ctx.globalAlpha = ga * 0.9; ctx.fill(); ctx.globalAlpha = ga;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fillStyle = color; ctx.fill();
    }

    drawImage(ctx, p) {
      const v = p.get(), img = p.img;
      if (!v || !img || !img.complete || !img.naturalWidth) return;
      const wU = v.w, hU = Number.isFinite(v.h) && v.h > 0 ? v.h : wU * img.naturalHeight / img.naturalWidth;
      if (!Number.isFinite(wU) || !Number.isFinite(hU) || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, Number.isFinite(v.opacity) ? v.opacity : 1));
      ctx.translate(this.X(v.x), this.Y(v.y));
      if (Number.isFinite(v.angle) && v.angle) ctx.rotate(-(v.deg ? v.angle * Math.PI / 180 : v.angle));
      ctx.drawImage(img, -wU * this.view.sx / 2, -hU * this.view.sy / 2, wU * this.view.sx, hU * this.view.sy);
      ctx.restore();
    }

    drawPoint(ctx, p) {
      const pt = p.get();
      if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) { p._pt = null; return; }
      if (p.cond && !p.cond()) { p._pt = null; return; }
      p._pt = pt;
      this.dot(ctx, this.X(pt[0]), this.Y(pt[1]), p.color, p.size || 5.5, p.pstyle);
      if (p.label) {
        const txt = p.label === 'coords' ? `(${fmtCoord(pt[0])}, ${fmtCoord(pt[1])})` : p.label;
        ctx.save(); ctx.font = `${p.labelSize || 13}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        const pos = p.labelPos || 'above-right', X0 = this.X(pt[0]), Y0 = this.Y(pt[1]), off = 10;
        let lx = X0 + off, ly = Y0 - off, al = 'left', bl = 'bottom';
        if (pos === 'above') { lx = X0; al = 'center'; } else if (pos === 'below') { lx = X0; ly = Y0 + off; al = 'center'; bl = 'top'; }
        else if (pos === 'left') { lx = X0 - off; ly = Y0; al = 'right'; bl = 'middle'; } else if (pos === 'right') { lx = X0 + off; ly = Y0; bl = 'middle'; }
        ctx.textAlign = al; ctx.textBaseline = bl;
        ctx.lineWidth = 4; ctx.strokeStyle = this.theme.bg; ctx.fillStyle = p.color; ctx.lineJoin = 'round';
        ctx.strokeText(txt, lx, ly); ctx.fillText(txt, lx, ly); ctx.restore();
      }
    }

    /* ---------- implicit curves (marching squares) ---------- */
    marchSegments(g, cond, cell) {
      const W = this.w, H = this.h;
      const nx = Math.ceil(W / cell) + 1, ny = Math.ceil(H / cell) + 1;
      const vals = new Float64Array((nx + 1) * (ny + 1));
      const xs = new Float64Array(nx + 1), ys = new Float64Array(ny + 1);
      for (let i = 0; i <= nx; i++) xs[i] = this.invX(i * cell);
      for (let j = 0; j <= ny; j++) ys[j] = this.invY(j * cell);
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) vals[j * (nx + 1) + i] = g(xs[i], ys[j]);
      const segs = [];
      const lerp = (a, b, va, vb) => { const t = va / (va - vb); return a + (b - a) * (Number.isFinite(t) ? t : 0.5); };
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const v0 = vals[j * (nx + 1) + i], v1 = vals[j * (nx + 1) + i + 1];
          const v2 = vals[(j + 1) * (nx + 1) + i + 1], v3 = vals[(j + 1) * (nx + 1) + i];
          if (v0 !== v0 || v1 !== v1 || v2 !== v2 || v3 !== v3) continue;
          const c = (v0 > 0 ? 1 : 0) | (v1 > 0 ? 2 : 0) | (v2 > 0 ? 4 : 0) | (v3 > 0 ? 8 : 0);
          if (c === 0 || c === 15) continue;
          const x0 = i * cell, y0 = j * cell, x1 = x0 + cell, y1 = y0 + cell;
          // edge points
          const e = [
            () => [lerp(x0, x1, v0, v1), y0],
            () => [x1, lerp(y0, y1, v1, v2)],
            () => [lerp(x1, x0, v2, v3), y1],
            () => [x0, lerp(y1, y0, v3, v0)],
          ];
          let pairs;
          switch (c) {
            case 1: case 14: pairs = [[3, 0]]; break;
            case 2: case 13: pairs = [[0, 1]]; break;
            case 3: case 12: pairs = [[3, 1]]; break;
            case 4: case 11: pairs = [[1, 2]]; break;
            case 6: case 9: pairs = [[0, 2]]; break;
            case 7: case 8: pairs = [[3, 2]]; break;
            case 5: case 10: {
              const center = (v0 + v1 + v2 + v3) / 4;
              const pos = center > 0;
              if (c === 5) pairs = pos ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
              else pairs = pos ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
              break;
            }
            default: pairs = [];
          }
          for (const [a, b] of pairs) {
            const A = e[a](), B = e[b]();
            if (cond) {
              const mx = this.invX((A[0] + B[0]) / 2), my = this.invY((A[1] + B[1]) / 2);
              if (!cond(mx, my)) continue;
            }
            segs.push(A[0], A[1], B[0], B[1]);
          }
        }
      }
      return segs;
    }

    drawImplicit(ctx, p) {
      const cell = this.interacting ? 6 : 3;
      const segs = this.marchSegments(p.g, p.cond, cell);
      this.lineStyle(ctx, p, p._sel ? 1.25 : 1);
      ctx.beginPath();
      for (let i = 0; i < segs.length; i += 4) { ctx.moveTo(segs[i], segs[i + 1]); ctx.lineTo(segs[i + 2], segs[i + 3]); }
      ctx.stroke();
      p._seg = new Float32Array(segs);
    }

    drawIneq(ctx, p) {
      const cell = this.interacting ? 6 : 2;
      const W = this.w, H = this.h;
      const nx = Math.ceil(W / cell), ny = Math.ceil(H / cell);
      const img = new ImageData(nx, ny);
      const col = this._rgb(p.color);
      const data = img.data;
      const tests = p.tests;
      for (let j = 0; j < ny; j++) {
        const y = this.invY((j + 0.5) * cell);
        for (let i = 0; i < nx; i++) {
          const x = this.invX((i + 0.5) * cell);
          let ok = true;
          for (let k = 0; k < tests.length; k++) {
            const t = tests[k], v = t.g(x, y);
            if (!(t.op === '<' ? v < 0 : t.op === '<=' ? v <= 0 : t.op === '>' ? v > 0 : v >= 0)) { ok = false; break; }
          }
          if (ok && p.cond && !p.cond(x, y)) ok = false;
          if (ok) { const o = (j * nx + i) * 4; data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255; }
        }
      }
      const tmp = this._tmp || (this._tmp = document.createElement('canvas'));
      tmp.width = nx; tmp.height = ny;
      tmp.getContext('2d').putImageData(img, 0, 0);
      ctx.save();
      ctx.globalAlpha = p.fillAlpha === undefined ? 0.28 : p.fillAlpha;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tmp, 0, 0, nx * cell, ny * cell);
      ctx.restore();
      // boundaries
      ctx.save();
      for (const t of tests) {
        const strict = t.op === '<' || t.op === '>';
        const segs = this.marchSegments(t.g, p.cond, this.interacting ? 6 : 3);
        ctx.strokeStyle = p.color; ctx.lineWidth = p.width || 2.5;
        ctx.setLineDash(strict ? [8, 6] : []);
        ctx.beginPath();
        for (let i = 0; i < segs.length; i += 4) { ctx.moveTo(segs[i], segs[i + 1]); ctx.lineTo(segs[i + 2], segs[i + 3]); }
        ctx.stroke();
      }
      ctx.restore();
    }

    _rgb(hex) {
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
      if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
      const c = document.createElement('canvas').getContext('2d');
      c.fillStyle = hex; const s = c.fillStyle;
      const mm = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s);
      return mm ? [parseInt(mm[1], 16), parseInt(mm[2], 16), parseInt(mm[3], 16)] : [0, 0, 0];
    }

    /* ---------- points of interest ---------- */
    selectedPlot() { return this.plots.find((p) => p.id === this.selectedId && !p.hidden) || null; }

    computePOIs() {
      this.pois = [];
      const sel = this.selectedPlot();
      if (!sel) return;
      if (sel.kind !== 'fx') return;
      const r = this.range();
      const f = (x) => { const v = sel.f(x); return Number.isFinite(v) && (!sel.cond || sel.cond(x, v)) ? v : NaN; };
      const N = 1200, xs = new Float64Array(N + 1), ys = new Float64Array(N + 1);
      for (let i = 0; i <= N; i++) { xs[i] = r.xmin + (r.xmax - r.xmin) * i / N; ys[i] = f(xs[i]); }
      const out = [];
      const near = (x, type) => out.some((q) => q.type === type && Math.abs(q.x - x) < (r.xmax - r.xmin) * 1e-6);
      const span = r.xmax - r.xmin;
      const bisectRoot = (h, a, b) => {
        let ha = h(a);
        for (let k = 0; k < 60; k++) { const m = (a + b) / 2, hm = h(m); if (Number.isNaN(hm)) return NaN; if ((ha < 0) === (hm < 0)) { a = m; ha = hm; } else b = m; }
        return (a + b) / 2;
      };
      for (let i = 0; i < N; i++) {
        const a = ys[i], b = ys[i + 1];
        if (Number.isNaN(a) || Number.isNaN(b)) continue;
        if (a === 0 && !near(xs[i], 'zero')) out.push({ x: xs[i], y: 0, type: 'zero' });
        else if (a * b < 0) {
          const xr = bisectRoot(f, xs[i], xs[i + 1]);
          const yr = f(xr);
          if (Number.isFinite(xr) && Math.abs(yr) < 1e-4 * Math.max(1, Math.abs(a), Math.abs(b)) && !near(xr, 'zero')) out.push({ x: xr, y: 0, type: 'zero' });
        }
      }
      // y-intercept
      if (r.xmin <= 0 && r.xmax >= 0) { const y0 = f(0); if (Number.isFinite(y0)) out.push({ x: 0, y: y0, type: 'yint' }); }
      // extrema
      for (let i = 1; i < N; i++) {
        const a = ys[i - 1], b = ys[i], c = ys[i + 1];
        if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c)) continue;
        if ((b - a) * (c - b) < 0) {
          const isMax = b > a;
          let lo = xs[i - 1], hi = xs[i + 1];
          for (let k = 0; k < 80; k++) {
            const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
            const f1 = f(m1), f2 = f(m2);
            if (Number.isNaN(f1) || Number.isNaN(f2)) break;
            if (isMax ? f1 < f2 : f1 > f2) lo = m1; else hi = m2;
          }
          const xm = (lo + hi) / 2, ym = f(xm), h = span * 1e-7;
          if (!Number.isFinite(ym)) continue;
          if (Math.abs(f(xm + h) - f(xm - h)) > 1e-3 * (1 + Math.abs(ym))) continue; // asymptote
          if (!near(xm, isMax ? 'max' : 'min')) out.push({ x: xm, y: ym, type: isMax ? 'max' : 'min' });
        }
      }
      // intersections with other y=f(x)
      for (const o of this.plots) {
        if (o === sel || o.hidden || o.kind !== 'fx') continue;
        const g = (x) => { const v = o.f(x); return Number.isFinite(v) && (!o.cond || o.cond(x, v)) ? v : NaN; };
        const hh = (x) => f(x) - g(x);
        let pa = hh(xs[0]);
        for (let i = 1; i <= N; i++) {
          const pb = hh(xs[i]);
          if (!Number.isNaN(pa) && !Number.isNaN(pb) && pa * pb <= 0 && !(pa === 0 && pb === 0)) {
            const xr = pa === 0 ? xs[i - 1] : bisectRoot(hh, xs[i - 1], xs[i]);
            const yr = f(xr);
            if (Number.isFinite(xr) && Number.isFinite(yr) && Math.abs(hh(xr)) < 1e-4 * (1 + Math.abs(yr)) && !near(xr, 'int')) out.push({ x: xr, y: yr, type: 'int' });
          }
          pa = pb;
        }
      }
      this.pois = out;
    }

    /* ---------- overlay ---------- */
    drawOverlay() {
      const ctx = this.octx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      const sel = this.selectedPlot();
      if (sel) {
        ctx.save();
        for (const q of this.pois) {
          const x = this.X(q.x), y = this.Y(q.y);
          if (x < -10 || y < -10 || x > this.w + 10 || y > this.h + 10) continue;
          ctx.beginPath(); ctx.arc(x, y, 6.5, 0, TAU); ctx.fillStyle = this.theme.bg; ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, 4.8, 0, TAU); ctx.fillStyle = '#7c7c7c'; ctx.fill();
        }
        ctx.restore();
      }
      const lab = (x, y, text, color) => {
        const X = this.X(x), Y = this.Y(y);
        ctx.save();
        ctx.font = '12.5px -apple-system, "Segoe UI", Roboto, sans-serif';
        const tw = ctx.measureText(text).width + 14;
        let bx = X + 10, by = Y - 30;
        if (bx + tw > this.w - 4) bx = X - tw - 10;
        if (by < 4) by = Y + 12;
        ctx.fillStyle = this.theme.bg; ctx.strokeStyle = color || '#888'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.roundRect(bx, by, tw, 22, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = this.theme.text; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + 7, by + 11.5);
        ctx.restore();
      };
      if (this.pinned && sel) lab(this.pinned.x, this.pinned.y, `(${fmtCoord(this.pinned.x)}, ${fmtCoord(this.pinned.y)})`, '#7c7c7c');
      if (this.trace && sel) {
        const X = this.X(this.trace.x), Y = this.Y(this.trace.y);
        this.dot(ctx, X, Y, sel.color, 6);
        lab(this.trace.x, this.trace.y, `(${fmtCoord(this.trace.x)}, ${fmtCoord(this.trace.y)})`, sel.color);
      }
      let info = null;
      if (sel && sel.kind === 'fx' && this.trace && (this.tools.tangent || this.tools.secant)) info = this.drawTools(ctx, sel);
      if (this.cb.onTools) this.cb.onTools(info);
      if (this.hoverPoint) {
        const q = this.hoverPoint;
        ctx.save(); ctx.beginPath(); ctx.arc(this.X(q.x), this.Y(q.y), 9, 0, TAU); ctx.strokeStyle = q.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
        lab(q.x, q.y, `(${fmtCoord(q.x)}, ${fmtCoord(q.y)})`, q.color);
      }
    }

    /* tangent & secant lines for the selected y=f(x) curve at the trace point */
    drawTools(ctx, sel) {
      const f = (x) => { const v = sel.f(x); return Number.isFinite(v) ? v : NaN; };
      const x0 = this.trace.x, y0 = f(x0);
      if (!Number.isFinite(y0)) return null;
      const r = this.range();
      const info = {};
      const stroke = (m, px, py, dash, width) => {
        const xa = r.xmin - 1, xb = r.xmax + 1;
        ctx.save();
        ctx.strokeStyle = sel.color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(this.X(xa), clamp(this.Y(py + m * (xa - px)), -4 * this.h, 5 * this.h)); ctx.lineTo(this.X(xb), clamp(this.Y(py + m * (xb - px)), -4 * this.h, 5 * this.h)); ctx.stroke();
        ctx.restore();
      };
      if (this.tools.tangent) {
        const h = 1e-5 * Math.max(1, Math.abs(x0));
        const m = (f(x0 + h) - f(x0 - h)) / (2 * h);
        if (Number.isFinite(m)) { stroke(m, x0, y0, [7, 5], 2); info.tangent = { m, b: y0 - m * x0, x0, y0 }; }
      }
      if (this.tools.secant && Number.isFinite(this.tools.h) && this.tools.h !== 0) {
        const x1 = x0 + this.tools.h, y1 = f(x1);
        if (Number.isFinite(y1)) {
          const m = (y1 - y0) / (x1 - x0);
          stroke(m, x0, y0, [], 1.8);
          const X = this.X(x1), Y = this.Y(y1);
          ctx.save(); ctx.beginPath(); ctx.arc(X, Y, 5.5, 0, TAU); ctx.fillStyle = this.theme.bg; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = sel.color; ctx.stroke(); ctx.restore();
          info.secant = { m, b: y0 - m * x0, x0, y0, x1, y1 };
        }
      }
      return info;
    }

    /* ---------- hit testing ---------- */
    hitPOI(mx, my) {
      for (const q of this.pois) {
        if (Math.hypot(this.X(q.x) - mx, this.Y(q.y) - my) < 9) return q;
      }
      return null;
    }
    hitPoint(mx, my) {
      for (let i = this.plots.length - 1; i >= 0; i--) {
        const p = this.plots[i];
        if (p.hidden || p.kind !== 'point' || !p._pt) continue;
        if (Math.hypot(this.X(p._pt[0]) - mx, this.Y(p._pt[1]) - my) < 11) return p;
      }
      return null;
    }
    hitCurve(mx, my, only) {
      let best = null, bd = 8;
      for (let i = this.plots.length - 1; i >= 0; i--) {
        const p = this.plots[i];
        if (p.hidden || !p._seg || p.kind === 'ineq' || p.kind === 'point') continue;
        if (only && p !== only) continue;
        const s = p._seg;
        for (let k = 0; k < s.length; k += 4) {
          const ax = s[k], ay = s[k + 1], bx = s[k + 2], by = s[k + 3];
          if (mx < Math.min(ax, bx) - bd || mx > Math.max(ax, bx) + bd || my < Math.min(ay, by) - bd || my > Math.max(ay, by) + bd) continue;
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
          let t = L ? ((mx - ax) * dx + (my - ay) * dy) / L : 0; t = clamp(t, 0, 1);
          const px = ax + t * dx, py = ay + t * dy, d = Math.hypot(mx - px, my - py);
          if (d < bd) { bd = d; best = { plot: p, px, py }; }
        }
      }
      return best;
    }
    onCurveTrace(sel, mx, my) {
      if (sel.kind === 'fx') {
        let x = this.invX(mx), y = sel.f(x);
        if (!Number.isFinite(y)) return null;
        return { x, y };
      }
      const h = this.hitCurve(mx, my, sel);
      if (!h) return null;
      return { x: this.invX(h.px), y: this.invY(h.py) };
    }

    setSelected(id) {
      const old = this.plots.find((p) => p.id === this.selectedId);
      if (old) old._sel = false;
      this.selectedId = id;
      this.trace = null; this.pinned = null;
      const n = this.plots.find((p) => p.id === id);
      if (n) n._sel = true;
      if (this.cb.onSelect) this.cb.onSelect(id);
      this.requestDraw(false);
    }

    /* ---------- interaction ---------- */
    _bind() {
      const c = this.over;
      const ptrs = new Map();
      let mode = null, start = null, moved = 0, last = null, pinch = null;
      const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

      c.addEventListener('contextmenu', (e) => e.preventDefault());
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (this.locked) return;
        const [mx, my] = pos(e);
        let dy = e.deltaY; if (e.deltaMode === 1) dy *= 16;
        const f = Math.exp(-clamp(dy, -200, 200) * (e.ctrlKey ? 0.01 : 0.0016));
        if (e.shiftKey) this.zoomAt(mx, my, f, 1); else if (e.altKey) this.zoomAt(mx, my, 1, f); else this.zoomAt(mx, my, f, f);
      }, { passive: false });

      c.addEventListener('pointerdown', (e) => {
        c.setPointerCapture(e.pointerId);
        const [mx, my] = pos(e);
        ptrs.set(e.pointerId, [mx, my]);
        if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()];
          pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
          mode = 'pinch'; return;
        }
        start = [mx, my]; last = [mx, my]; moved = 0;
        if (this.cb.onPointer && this.cb.onPointer('down', this.invX(mx), this.invY(my), e)) { mode = 'ext'; return; }
        const pt = this.hitPoint(mx, my);
        if (pt && pt.drag) { mode = 'dragpoint'; this._dragPlot = pt; this.hoverPoint = null; return; }
        const sel = this.selectedPlot();
        if (sel && this.hitPOI(mx, my)) { mode = 'poi'; return; }
        if (sel && this.trace && Math.hypot(this.X(this.trace.x) - mx, this.Y(this.trace.y) - my) < 12) { mode = 'trace'; return; }
        // axis scaling zones
        const ay = clamp(this.Y(0), 0, this.h), ax = clamp(this.X(0), 0, this.w);
        if (this.settings.numbers && !this.locked) {
          if (Math.abs(my - ay) < 20 && !this.hitCurve(mx, my)) { mode = 'axisx'; this._anchor = this.invX(mx); c.style.cursor = 'ew-resize'; return; }
          if (Math.abs(mx - ax) < 28 && !this.hitCurve(mx, my)) { mode = 'axisy'; this._anchor = this.invY(my); c.style.cursor = 'ns-resize'; return; }
        }
        mode = 'pan'; c.style.cursor = 'grabbing';
      });

      c.addEventListener('pointermove', (e) => {
        const [mx, my] = pos(e);
        if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [mx, my]);
        if (mode === 'pinch' && ptrs.size >= 2) {
          const [a, b] = [...ptrs.values()];
          const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
          this.view.x0 -= (cx - pinch.mx) / this.view.sx; this.view.y0 += (cy - pinch.my) / this.view.sy;
          if (pinch.d > 0) this.zoomAt(cx, cy, d / pinch.d, d / pinch.d);
          pinch = { d, mx: cx, my: cy };
          this._viewChanged(true);
          return;
        }
        if (this.cb.onCursor) this.cb.onCursor(this.invX(mx), this.invY(my), true);
        if (!mode) { this._hover(mx, my); return; }
        moved = Math.max(moved, Math.hypot(mx - start[0], my - start[1]));
        if (mode === 'ext') { this.cb.onPointer('move', this.invX(mx), this.invY(my), e); last = [mx, my]; return; }
        if (mode === 'pan') {
          if (moved < 2 || this.locked) return;
          this.view.x0 -= (mx - last[0]) / this.view.sx;
          this.view.y0 += (my - last[1]) / this.view.sy;
          this._viewChanged(true);
        } else if (mode === 'axisx') {
          const f = Math.exp((mx - last[0]) * 0.006);
          const v = this.view; v.sx = clamp(v.sx * f, 1e-9, 1e9);
          v.x0 = this._anchor - (mx - this.w / 2) / v.sx; this._viewChanged(true);
        } else if (mode === 'axisy') {
          const f = Math.exp(-(my - last[1]) * 0.006);
          const v = this.view; v.sy = clamp(v.sy * f, 1e-9, 1e9);
          v.y0 = this._anchor + (my - this.h / 2) / v.sy; this._viewChanged(true);
        } else if (mode === 'dragpoint') {
          const p = this._dragPlot;
          const sc = Math.max(this.view.sx, this.view.sy);
          const dec = Math.max(0, Math.min(8, Math.ceil(Math.log10(sc)) + 1));
          const rd = (v) => { const f = Math.pow(10, dec); return Math.round(v * f) / f; };
          p.drag(rd(this.invX(mx)), rd(this.invY(my)));
        } else if (mode === 'trace') {
          const sel = this.selectedPlot();
          const t = sel && this.onCurveTrace(sel, mx, my);
          if (t) { this.trace = t; this.pinned = null; this.drawOverlay(); }
        }
        last = [mx, my];
      });

      const up = (e) => {
        const [mx, my] = pos(e);
        ptrs.delete(e.pointerId);
        if (mode === 'pinch') { if (ptrs.size < 2) { mode = null; pinch = null; } return; }
        const wasClick = moved < 4;
        if (mode === 'ext') { if (this.cb.onPointer) this.cb.onPointer('up', this.invX(mx), this.invY(my), e); mode = null; c.style.cursor = ''; return; }
        if (wasClick && mode === 'pan' && this.cb.onPointer && this.cb.onPointer('click', this.invX(mx), this.invY(my), e)) { mode = null; c.style.cursor = ''; return; }
        if (wasClick && (mode === 'pan' || mode === 'axisx' || mode === 'axisy' || mode === 'trace')) {
          const h = this.hitCurve(mx, my);
          if (h) {
            if (this.selectedId !== h.plot.id) this.setSelected(h.plot.id);
            const t = this.onCurveTrace(h.plot, mx, my);
            this.trace = t; this.pinned = null; this.drawOverlay();
          } else if (mode === 'pan') {
            this.trace = null; this.pinned = null;
            if (this.selectedId) this.setSelected(null);
            this.drawOverlay();
          }
        } else if (wasClick && mode === 'poi') {
          const q = this.hitPOI(mx, my);
          this.pinned = (q && !(this.pinned && this.pinned.x === q.x)) ? q : null;
          this.drawOverlay();
        }
        mode = null; this._dragPlot = null;
        c.style.cursor = '';
        this._hover(mx, my);
      };
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', up);
      c.addEventListener('pointerleave', () => {
        if (!mode) { this.hoverPoint = null; this.drawOverlay(); this._tip(null); if (this.cb.onCursor) this.cb.onCursor(0, 0, false); }
      });
      c.addEventListener('dblclick', (e) => {
        const [mx, my] = pos(e);
        if (!this.hitCurve(mx, my) && !this.hitPoint(mx, my)) this.zoomAt(mx, my, 1.8, 1.8);
      });
    }

    _tip(html, x, y) {
      const t = this.tip;
      if (!t) return;
      if (!html) { t.style.display = 'none'; return; }
      t.style.display = 'block'; t.innerHTML = html;
      t.style.left = Math.min(x + 12, this.w - t.offsetWidth - 6) + 'px';
      t.style.top = Math.max(4, y - 34) + 'px';
    }

    _hover(mx, my) {
      const c = this.over;
      if (this.cb.onPointer) { this.cb.onPointer('hover', this.invX(mx), this.invY(my)); return; }
      const poi = this.hitPOI(mx, my);
      const pt = this.hitPoint(mx, my);
      let cur = '';
      let hp = null;
      if (pt) { hp = { x: pt._pt[0], y: pt._pt[1], color: pt.color }; cur = pt.drag ? 'grab' : 'pointer'; }
      if (poi) {
        const names = { zero: 'Zero', yint: 'Y-intercept', max: 'Maximum', min: 'Minimum', int: 'Intersection' };
        this._tip(`<b>${names[poi.type]}</b> (${fmtCoord(poi.x)}, ${fmtCoord(poi.y)})`, mx, my);
        cur = 'pointer';
      } else this._tip(null);
      if (!poi && !pt) {
        const h = this.hitCurve(mx, my);
        if (h) cur = 'pointer';
        else if (this.settings.numbers) {
          const ay = clamp(this.Y(0), 0, this.h), ax = clamp(this.X(0), 0, this.w);
          if (Math.abs(my - ay) < 20) cur = 'ew-resize'; else if (Math.abs(mx - ax) < 28) cur = 'ns-resize';
        }
      }
      c.style.cursor = cur;
      const changed = (!!hp !== !!this.hoverPoint) || (hp && this.hoverPoint && (hp.x !== this.hoverPoint.x || hp.y !== this.hoverPoint.y));
      this.hoverPoint = hp;
      if (changed) this.drawOverlay();
    }

    exportPNG(cb) {
      const c = document.createElement('canvas');
      c.width = this.base.width; c.height = this.base.height;
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(this.base, 0, 0);
      c.toBlob(cb, 'image/png');
    }
  }

  global.Graph = Graph;
  global.GraphUtil = { fmtCoord };
})(window);
