/* ==========================================================
   Application: expression list, evaluation, UI
   ========================================================== */
(function () {
  'use strict';
  const { V, F, R, fmt } = ME;
  const STORE_KEY = 'graphical-calculator-web-v1';
  const PALETTE = ['#c74440', '#2d70b3', '#388c46', '#6042a6', '#000000', '#fa7e19'];
  const RESERVED = new Set(['x', 'y', 'r', 'theta']);
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const svg = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const ICON = {
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    undo: svg('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>'),
    redo: svg('<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/>'),
    menu: svg('<path d="M3 6h18M3 12h18M3 18h18"/>'),
    left: svg('<path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>'),
    right: svg('<path d="M13 17l5-5-5-5M6 17l5-5-5-5"/>'),
    home: svg('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
  };

  /* ================= state ================= */
  let state = null;
  let nextId = 1;
  const recs = new Map();   // id -> evaluation record
  const rows = new Map();   // id -> row dom handles
  const playing = new Set();
  let graph = null;
  let curOrder = [];        // computed variable evaluation order
  let lastEd = null;
  let hist = [], hIdx = -1, commitTimer = 0, saveTimer = 0, evalTimer = 0;

  function defaultSettings() { return { editor: 'live', grid: true, minor: true, numbers: true, piX: false, deg: false, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' }; }
  function newItem(type, props) {
    const it = Object.assign({ id: nextId++, type, text: '', hidden: false, line: 'solid', width: 2.5 }, props || {});
    if (type === 'expr' || type === 'table') {
      if (!it.color) { it.color = PALETTE[state.colorIdx % PALETTE.length]; state.colorIdx++; }
    }
    if (type === 'table') { if (!it.rows) it.rows = [['', ''], ['', ''], ['', '']]; it.showLine = !!it.showLine; it.tno = (state.tableCount = (state.tableCount || 0) + 1); }
    return it;
  }
  function defaultState() {
    state = { items: [], settings: defaultSettings(), colorIdx: 0, view: null };
    state.items.push(newItem('expr', { text: 'a=1', slider: { min: -5, max: 5, step: 0.01 } }));
    state.items.push(newItem('expr', { text: 'y=a sin(x)' }));
    state.items.push(newItem('expr', { text: '' }));
  }

  /* ================= pretty printing ================= */
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pretty(src) {
    let s = src.replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠')
      .replace(/(?<![A-Za-z])sqrt(?![A-Za-z])/g, '√').replace(/(?<![A-Za-z])cbrt(?![A-Za-z])/g, '∛')
      .replace(/(?<![A-Za-z])pi(?![A-Za-z])/g, 'π').replace(/(?<![A-Za-z])theta(?![A-Za-z])/g, 'θ')
      .replace(/(?<![A-Za-z])tau(?![A-Za-z])/g, 'τ').replace(/(?<![A-Za-z])infinity(?![A-Za-z])/g, '∞')
      .replace(/\*/g, '·');
    const conv = (t) => {
      let out = '', i = 0;
      while (i < t.length) {
        const ch = t[i];
        if (ch === '^') {
          i++;
          let ex = '';
          if (t[i] === '(') {
            let d = 0, j = i;
            for (; j < t.length; j++) { if (t[j] === '(') d++; else if (t[j] === ')') { d--; if (d === 0) break; } }
            ex = t.slice(i + 1, j); i = j + 1;
          } else {
            const m = /^-?(?:[0-9.]+|[A-Za-zθπτ](?:_[A-Za-z0-9])?)/.exec(t.slice(i));
            ex = m ? m[0] : ''; i += ex.length;
          }
          out += '<sup>' + conv(ex) + '</sup>';
        } else if (ch === '_') {
          i++;
          let sub = '';
          if (t[i] === '{') { const j = t.indexOf('}', i); sub = j < 0 ? t.slice(i + 1) : t.slice(i + 1, j); i = j < 0 ? t.length : j + 1; }
          else { const m = /^(?:[0-9]+|[A-Za-z])/.exec(t.slice(i)); sub = m ? m[0] : ''; i += sub.length; }
          out += '<sub>' + esc(sub) + '</sub>';
        } else { out += esc(ch); i++; }
      }
      return out;
    };
    return conv(s);
  }

  /* ================= evaluation ================= */
  function fmtValue(v) {
    if (Array.isArray(v)) return '[' + v.slice(0, 12).map(fmtValue).join(', ') + (v.length > 12 ? `, … (${v.length} items)` : '') + ']';
    if (v instanceof ME.Pt) return `(${fmt(v.x)}, ${fmt(v.y)})`;
    if (v instanceof ME.Cx) {
      const tiny = (a, b) => Math.abs(a) < 1e-12 * Math.max(1, Math.abs(b));
      const re = tiny(v.re, v.im) ? 0 : v.re, im = tiny(v.im, v.re) ? 0 : v.im;
      if (!im) return fmt(re);
      const imS = Math.abs(im) === 1 ? '' : fmt(Math.abs(im));
      return (re ? fmt(re) + (im < 0 ? ' − ' : ' + ') : (im < 0 ? '−' : '')) + imS + 'i';
    }
    if (typeof v === 'boolean') return String(v);
    return typeof v === 'number' ? fmt(v) : 'undefined';
  }
  const isPt1 = (q) => q instanceof ME.Pt || q instanceof ME.Cx;
  const isPtVal = (v) => isPt1(v) || (Array.isArray(v) && v.length > 0 && v.every(isPt1));

  function solveLinear(M, b) {
    const n = b.length, A = M.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-300) return null;
      [A[c], A[piv]] = [A[piv], A[c]];
      for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) { let s2 = A[i][n]; for (let k = i + 1; k < n; k++) s2 -= A[i][k] * x[k]; x[i] = s2 / A[i][i]; }
    return x;
  }
  // Levenberg–Marquardt least squares: res(p) -> residual array
  function levMar(res, p0) {
    const dot = (a) => a.reduce((s2, v) => s2 + v * v, 0);
    let p = p0.slice(); const k = p.length;
    if (!k) return p;
    let r = res(p), sse = dot(r), lam = 1e-3;
    if (!Number.isFinite(sse)) return p;
    for (let it = 0; it < 300; it++) {
      const n = r.length, J = [];
      for (let j = 0; j < k; j++) {
        const h = 1e-6 * Math.max(1, Math.abs(p[j])); const q = p.slice(); q[j] += h;
        const r2 = res(q); J.push(r.map((v, i) => (v - r2[i]) / h));
      }
      const A = [], g = [];
      for (let a = 0; a < k; a++) {
        A.push([]); let ga = 0; for (let i = 0; i < n; i++) ga += J[a][i] * r[i]; g.push(ga);
        for (let b = 0; b < k; b++) { let sum = 0; for (let i = 0; i < n; i++) sum += J[a][i] * J[b][i]; A[a].push(sum); }
      }
      let improved = false;
      for (let tries = 0; tries < 14; tries++) {
        const M = A.map((row, a) => row.map((v, b) => v + (a === b ? lam * (A[a][a] || 1) : 0)));
        const d = solveLinear(M, g);
        if (!d) { lam *= 10; continue; }
        const q = p.map((v, i) => v + d[i]); const rq = res(q); const s2 = dot(rq);
        if (Number.isFinite(s2) && s2 < sse) {
          const done = Math.abs(sse - s2) <= 1e-15 * (1 + sse);
          p = q; r = rq; sse = s2; lam = Math.max(lam / 5, 1e-12); improved = true;
          if (done) return p;
          break;
        }
        lam *= 5;
      }
      if (!improved) break;
    }
    return p;
  }

  function evalNumberText(text) {
    try {
      const st = ME.parseStatement(String(text), []);
      if (st.ops.length || st.parts.length !== 1) return NaN;
      const fn = ME.compile(ME.resolve(st.parts[0], new Set(Object.keys(F))), []);
      const v = fn();
      return typeof v === 'number' ? v : NaN;
    } catch (e) { return NaN; }
  }

  function reachableVars(ast, fnDefs, seen) {
    const out = new Set(ME.freeVars(ast));
    for (const fn of ME.calledFns(ast)) {
      const d = fnDefs[fn];
      if (d && !seen.has(fn)) {
        seen.add(fn);
        const body = d.parts[1];
        const inner = ME.freeVars(body);
        d.def.params.forEach((p) => inner.delete(p));
        inner.forEach((n) => out.add(n));
        reachableVars(body, fnDefs, seen).forEach((n) => { if (!d.def.params.includes(n)) out.add(n); });
      }
    }
    return out;
  }

  function extractRange(restrict, vname) {
    const los = [], his = [];
    const isV = (n) => n.t === 'var' && n.n === vname;
    const free = (n) => !ME.freeVars(n).has(vname);
    const less = (o) => o === '<' || o === '<=';
    const greater = (o) => o === '>' || o === '>=';
    for (const r of restrict) {
      const P = r.parts, O = r.ops;
      if (O.length === 2 && isV(P[1]) && free(P[0]) && free(P[2])) {
        if (less(O[0]) && less(O[1])) { los.push(P[0]); his.push(P[2]); }
        else if (greater(O[0]) && greater(O[1])) { his.push(P[0]); los.push(P[2]); }
      } else if (O.length === 1) {
        if (isV(P[0]) && free(P[1])) { if (less(O[0])) his.push(P[1]); else if (greater(O[0])) los.push(P[1]); }
        else if (isV(P[1]) && free(P[0])) { if (less(O[0])) los.push(P[0]); else if (greater(O[0])) his.push(P[0]); }
      }
    }
    if (!los.length && !his.length) return null;
    try {
      const lf = los.map((n) => ME.compile(n, [])), hf = his.map((n) => ME.compile(n, []));
      return () => {
        let lo = -Infinity, hi = Infinity;
        for (const f of lf) { const v = f(); if (Number.isFinite(v)) lo = Math.max(lo, v); }
        for (const f of hf) { const v = f(); if (Number.isFinite(v)) hi = Math.min(hi, v); }
        return { lo, hi };
      };
    } catch (e) { return null; }
  }

  function isHidden(item) {
    if (item.hidden) return true;
    if (item.parent) { const par = state.items.find((i) => i.id === item.parent); if (par && par.hidden) return true; }
    return false;
  }
  function plotColor(c) { return state.settings.theme === 'dark' && c.toLowerCase() === '#000000' ? '#f2f2f2' : c; }

  function evaluate() {
    for (const k of Object.keys(V)) delete V[k];
    for (const k of Object.keys(F)) delete F[k];
    R.deg = !!state.settings.deg;
    recs.clear();
    const list = [], fnDefs = {}, varDefs = {};
    // pass 1: parse + detect definitions
    for (const item of state.items) {
      const rec = { item, err: null, stmt: null, kind: null, missing: [], readout: null, plot: null, isSlider: false, def: null };
      recs.set(item.id, rec); list.push(rec);
      if (item.type !== 'expr') continue;
      if (!item.text.trim()) { rec.kind = 'empty'; continue; }
      try { rec.stmt = ME.parseStatement(item.text, []); } catch (e) { rec.err = e.message || 'Syntax error'; rec.kind = 'error'; continue; }
      const st = rec.stmt;
      if (st.ops.length === 1 && st.ops[0] === '=' && !st.restrict.length) {
        const L = st.parts[0];
        if (L.t === 'call' && !ME.BUILTINS.has(L.n) && !L.primes && L.args.length && L.args.every((a) => a.t === 'var' && !(a.n in ME.CONSTS)) && !RESERVED.has(L.n) && !(L.n in ME.CONSTS)) {
          rec.def = { type: 'fn', name: L.n, params: L.args.map((a) => a.n) };
        } else if (L.t === 'var' && !RESERVED.has(L.n) && !(L.n in ME.CONSTS)) {
          rec.def = { type: 'var', name: L.n };
        }
      }
      if (rec.def && rec.def.type === 'fn') {
        if (fnDefs[rec.def.name]) { rec.err = `"${rec.def.name}" is already defined`; rec.def = null; rec.kind = 'error'; }
        else fnDefs[rec.def.name] = rec;
      }
    }
    // pass 2: resolve
    const fnNames = new Set(Object.keys(fnDefs));
    for (const rec of list) {
      if (!rec.stmt || rec.err) continue;
      try {
        rec.parts = rec.stmt.parts.map((p) => ME.resolve(p, fnNames));
        rec.restrict = rec.stmt.restrict.map((p) => ME.resolve(p, fnNames));
      } catch (e) { rec.err = e.message; rec.kind = 'error'; rec.def = null; continue; }
      if (rec.def && rec.def.type === 'var') {
        const fv = ME.freeVars(rec.parts[1]);
        if (fv.has('x') || fv.has('y')) rec.def = null;
        else if (varDefs[rec.def.name]) { rec.err = `"${rec.def.name}" is already defined`; rec.def = null; rec.kind = 'error'; }
        else varDefs[rec.def.name] = rec;
      }
    }
    // variables
    const mark = new Map();
    curOrder = [];
    const visit = (name) => {
      const rec = varDefs[name];
      if (!rec || rec.isSlider) return;
      const m = mark.get(name);
      if (m === 2) return;
      if (m === 1) { rec.err = 'Circular definition'; return; }
      mark.set(name, 1);
      reachableVars(rec.parts[1], fnDefs, new Set()).forEach((d) => visit(d));
      mark.set(name, 2);
      curOrder.push(rec);
    };
    for (const name of Object.keys(varDefs)) {
      const rec = varDefs[name], rhs = rec.parts[1];
      const lit = rhs.t === 'num' ? rhs.v : (rhs.t === 'neg' && rhs.a.t === 'num' ? -rhs.a.v : null);
      if (lit !== null) {
        rec.isSlider = true; V[name] = lit;
        const sl = rec.item.slider || (rec.item.slider = { min: -10, max: 10, step: 0.01 });
        if (lit < sl.min) sl.min = Math.floor(lit); if (lit > sl.max) sl.max = Math.ceil(lit);
      }
    }
    // lists: table columns, then list-valued variable definitions (fixpoint)
    ME.LISTVARS.clear(); ME.CXVARS.clear(); ME.CXFUNCS.clear();
    for (const name of Object.keys(fnDefs)) { const fr = fnDefs[name]; if (fr.parts && ME.complexValued(fr.parts[1], new Set(fr.def.params))) ME.CXFUNCS.add(name); }
    const tableRecs = list.filter((r) => r.item.type === 'table');
    for (const tr of tableRecs) { const n = tr.item.tno; ['x', 'y'].forEach((c) => { ME.LISTVARS.add(`${c}_${n}`); V[`${c}_${n}`] = []; }); ME.LISTVARS.add(`e_${n}`); V[`e_${n}`] = []; }
    for (let guard = 0, changed = true; changed && guard < 12; guard++) {
      changed = false;
      for (const name of Object.keys(varDefs)) {
        const rec = varDefs[name];
        if (rec.isSlider) continue;
        if (!ME.LISTVARS.has(name) && ME.listValued(rec.parts[1])) { ME.LISTVARS.add(name); changed = true; }
        if (!ME.CXVARS.has(name) && ME.complexValued(rec.parts[1])) { ME.CXVARS.add(name); changed = true; }
      }
    }
    // functions
    for (const name of Object.keys(fnDefs)) {
      const rec = fnDefs[name];
      if (!rec.parts) continue;
      try { F[name] = ME.compile(rec.parts[1], rec.def.params); } catch (e) { rec.err = e.message; }
    }
    for (const tr of tableRecs) {
      const xs = [], ys = [];
      for (const r of tr.item.rows) { const x = evalNumberText(r[0]), y = evalNumberText(r[1]); if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); } }
      V[`x_${tr.item.tno}`] = xs; V[`y_${tr.item.tno}`] = ys;
    }
    for (const name of Object.keys(varDefs)) {
      const rec = varDefs[name];
      if (rec.isSlider) continue;
      try { rec.fn = ME.compile(rec.parts[1], []); } catch (e) { rec.err = e.message; continue; }
      visit(name);
    }
    recomputeVars();
    const defined = new Set([...Object.keys(varDefs), ...ME.LISTVARS]);
    // pass 3: classify & build plots
    const plots = [];
    for (const rec of list) {
      const item = rec.item;
      if (item.type === 'table') { plots.push(tablePlot(item)); continue; }
      if (item.type !== 'expr' || rec.err || !rec.parts) continue;
      try { classify(rec, defined, fnDefs, plots); } catch (e) { rec.err = e.message || 'Error'; }
    }
    graph.setPlots(plots);
    updateAllRows();
    graph.requestDraw(false);
  }

  function recomputeVars() {
    for (const rec of curOrder) {
      try { V[rec.def.name] = rec.fn(); } catch (e) { V[rec.def.name] = NaN; }
    }
  }

  function tablePlot(item) {
    const cache = new Map();
    const num = (s) => { if (!cache.has(s)) cache.set(s, evalNumberText(s)); return cache.get(s); };
    return {
      id: item.id, kind: 'table', color: plotColor(item.color), width: item.width, lineStyle: item.line, hidden: isHidden(item),
      showLine: item.showLine, size: 3 + item.width * 1.2,
      get points() {
        const pts = [];
        for (const r of item.rows) { const x = evalNumberText(r[0]), y = evalNumberText(r[1]); if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]); }
        return pts;
      },
    };
  }

  function classify(rec, defined, fnDefs, plots) {
    const item = rec.item, P = rec.parts, st = rec.stmt, ops = st.ops;
    const fvOf = (n) => ME.freeVars(n);
    const isVar = (n, name) => n.t === 'var' && n.n === name;
    const base = () => ({ id: item.id, color: plotColor(item.color), width: item.width, lineStyle: item.line, hidden: isHidden(item) });
    const needMissing = (nodes, params) => {
      const s = new Set();
      nodes.forEach((n) => ME.freeVars(n).forEach((v) => s.add(v)));
      params.forEach((p) => s.delete(p));
      defined.forEach((d) => s.delete(d));
      const miss = [...s];
      if (miss.includes('x') || miss.includes('y')) throw new ME.MathError('x and y cannot be used in this expression');
      if (miss.includes('t') && !params.includes('t') && false) return [];
      rec.missing = miss;
      return miss;
    };
    for (const r of rec.restrict) if (!r.ops.length) throw new ME.MathError('Restrictions must be comparisons, e.g. {x>0}');
    const mkCond = (params) => {
      if (!rec.restrict.length) return null;
      const cs = rec.restrict.map((r) => ME.compile(r, params));
      return (...a) => { for (const c of cs) if (!c(...a)) return false; return true; };
    };
    const allNodes = () => P.concat(rec.restrict);
    const pushFx = (expr, cond, range) => {
      if (ME.listValued(expr)) {
        const f = ME.compile(expr, ['x']); let n = 0;
        for (const x0 of [1, 0.5, 2, 0.25]) { const v = f(x0); if (Array.isArray(v)) { n = v.length; break; } }
        for (let i = 0; i < Math.min(n, 60); i++) plots.push(Object.assign(base(), { kind: 'fx', f: (x) => { const v = f(x); return Array.isArray(v) ? v[i] : NaN; }, cond, range }));
        return;
      }
      plots.push(Object.assign(base(), { kind: 'fx', f: ME.compile(expr, ['x']), cond, range }));
    };

    // function definition
    if (rec.def && rec.def.type === 'fn') {
      rec.kind = 'fn';
      needMissing([P[1]].concat(rec.restrict), rec.def.params);
      if (rec.def.params.length === 1) {
        const pn = rec.def.params[0];
        const f = F[rec.def.name];
        plots.push(Object.assign(base(), { kind: 'fx', f, cond: null, range: null, defFn: true }));
      }
      return;
    }
    if (rec.def && rec.def.type === 'var') {
      rec.kind = 'var';
      needMissing([P[1]], []);
      if (!rec.isSlider) {
        const nm = rec.def.name;
        rec.readout = () => V[nm];
        if (isPtVal(V[nm])) { rec.hasPoints = true; plots.push(Object.assign(base(), { kind: 'points', get: () => V[nm], showLine: !!item.showLine, size: 3.5 + item.width * 0.8 })); }
      }
      return;
    }

    if (ops.length === 0) {
      const e = P[0];
      if (e.t === 'tuple') {
        if (e.items.length !== 2) throw new ME.MathError('Only 2D points (x, y) are supported');
        const fvs = new Set(); e.items.forEach((n) => fvOf(n).forEach((v) => fvs.add(v)));
        if (e.items.some((n) => ME.listValued(n))) {
          rec.kind = 'points'; rec.hasPoints = true;
          needMissing(allNodes(), []);
          const pf = ME.compile(e, []);
          plots.push(Object.assign(base(), { kind: 'points', get: pf, showLine: !!item.showLine, size: 3.5 + item.width * 0.8 }));
        } else if (fvs.has('t') && !defined.has('t')) {
          rec.kind = 'param';
          needMissing(allNodes(), ['t']);
          const fx = ME.compile(e.items[0], ['t']), fy = ME.compile(e.items[1], ['t']);
          plots.push(Object.assign(base(), { kind: 'param', f: (t) => { const a = fx(t), b = fy(t); return typeof a === 'number' && typeof b === 'number' ? [a, b] : null; }, cond: mkCond(['t']), range: extractRange(rec.restrict, 't') }));
        } else {
          rec.kind = 'point';
          needMissing(allNodes(), []);
          const px = ME.compile(e.items[0], []), py = ME.compile(e.items[1], []);
          const dragOK = e.items.every((n) => n.t === 'num' || (n.t === 'neg' && n.a.t === 'num') || (n.t === 'var' && defined.has(n.n) && varIsSlider(n.n)));
          const plot = Object.assign(base(), { kind: 'point', get: () => [px(), py()], cond: mkCond([]), size: 3.5 + item.width * 0.8 });
          if (dragOK) plot.drag = (x, y) => dragPoint(item, e.items, x, y);
          plots.push(plot);
        }
        return;
      }
      const fvs = fvOf(e);
      if (fvs.has('x') && !fvs.has('y')) {
        rec.kind = 'fx'; needMissing(allNodes(), ['x', 'y']);
        pushFx(e, mkCond(['x', 'y']), extractRange(rec.restrict, 'x'));
        return;
      }
      if (fvs.has('x') && fvs.has('y')) throw new ME.MathError('Use an equation or inequality with both x and y');
      if (fvs.has('y')) throw new ME.MathError('Expression needs x (try y = … or x = …)');
      rec.kind = 'value';
      needMissing([e], []);
      const fn = ME.compile(e, []);
      rec.readout = () => fn();
      if (isPtVal(fn())) { rec.hasPoints = true; plots.push(Object.assign(base(), { kind: 'points', get: fn, showLine: !!item.showLine, size: 3.5 + item.width * 0.8 })); }
      return;
    }
    if (ops.length === 1 && ops[0] === '~') {
      const Lh = P[0], Rh = P[1];
      if (!ME.listValued(Lh)) throw new ME.MathError('Left side of ~ must be a list, e.g. y_1');
      const rfv = ME.freeVars(Rh);
      const listNames = [...rfv].filter((n) => ME.LISTVARS.has(n));
      if (!listNames.length) throw new ME.MathError('Right side needs a list, e.g. y_1 ~ m x_1 + b');
      const params = [...rfv].filter((n) => !ME.LISTVARS.has(n) && !defined.has(n) && n !== 'x' && n !== 'y');
      const yf = ME.compile(Lh, []), mf = ME.compile(Rh, []);
      const Y = yf();
      if (!Array.isArray(Y) || !Y.length) throw new ME.MathError('No data in the left-hand list');
      const res = (p) => { params.forEach((n, i) => { V[n] = p[i]; }); const M = mf(); return Y.map((y, i) => y - (Array.isArray(M) ? M[i] : M)); };
      const sol = levMar(res, params.map(() => 1));
      const r = res(sol);
      params.forEach((n, i) => { V[n] = sol[i]; defined.add(n); });
      const ym = Lh.t === 'var' && /^y_(\d+)$/.exec(Lh.n);
      if (ym) V[`e_${ym[1]}`] = r;
      const sse = r.reduce((a, v) => a + v * v, 0), yb = Y.reduce((a, v) => a + v, 0) / Y.length, sst = Y.reduce((a, v) => a + (v - yb) * (v - yb), 0);
      const r2 = sst > 0 ? 1 - sse / sst : NaN;
      rec.kind = 'regression';
      rec.extraHtml = `<div class="val">${params.map((n) => `${esc(n)} = ${fmt(V[n], 6)}`).join(',  ')}</div><div>r² = ${fmt(r2, 5)}${Number.isFinite(sse) ? ` &nbsp; n = ${Y.length}` : ''}</div>`;
      const cl = JSON.parse(JSON.stringify(Rh));
      ME.walk(cl, (nd) => { if (nd.t === 'var' && listNames.includes(nd.n)) nd.n = 'x'; });
      plots.push(Object.assign(base(), { kind: 'fx', f: ME.compile(cl, ['x']), cond: null, range: null }));
      return;
    }
    if (ops.includes('!=')) throw new ME.MathError('≠ is not supported');
    if (ops.length === 1 && ops[0] === '=') {
      const L = P[0], Rr = P[1];
      const noVar = (n, v) => !fvOf(n).has(v);
      let kind = null, expr = null;
      if (isVar(L, 'y') && noVar(Rr, 'y')) { kind = 'fx'; expr = Rr; }
      else if (isVar(Rr, 'y') && noVar(L, 'y')) { kind = 'fx'; expr = L; }
      else if (isVar(L, 'x') && noVar(Rr, 'x')) { kind = 'fy'; expr = Rr; }
      else if (isVar(Rr, 'x') && noVar(L, 'x')) { kind = 'fy'; expr = L; }
      else if (isVar(L, 'r') && noVar(Rr, 'r') && !fvOf(Rr).has('x') && !fvOf(Rr).has('y')) { kind = 'polar'; expr = Rr; }
      if (kind === 'fx') {
        rec.kind = 'fx'; needMissing([expr].concat(rec.restrict), ['x', 'y']);
        pushFx(expr, mkCond(['x', 'y']), extractRange(rec.restrict, 'x'));
      } else if (kind === 'fy') {
        rec.kind = 'fy'; needMissing([expr].concat(rec.restrict), ['x', 'y']);
        plots.push(Object.assign(base(), { kind: 'fy', f: ME.compile(expr, ['y']), cond: mkCond(['x', 'y']), range: extractRange(rec.restrict, 'y') }));
      } else if (kind === 'polar') {
        rec.kind = 'polar'; needMissing([expr].concat(rec.restrict), ['theta', 'r']);
        plots.push(Object.assign(base(), { kind: 'polar', f: ME.compile(expr, ['theta']), cond: mkCond(['theta', 'r']), range: extractRange(rec.restrict, 'theta') }));
      } else {
        rec.kind = 'implicit'; needMissing(allNodes(), ['x', 'y']);
        const g = ME.compile({ t: 'bin', op: '-', a: L, b: Rr }, ['x', 'y']);
        plots.push(Object.assign(base(), { kind: 'implicit', g, cond: mkCond(['x', 'y']) }));
      }
      return;
    }
    // inequality (possibly chained)
    if (ops.some((o) => o === '=')) throw new ME.MathError('Cannot mix = with inequalities');
    rec.kind = 'ineq'; needMissing(allNodes(), ['x', 'y']);
    const tests = ops.map((op, i) => ({ op, g: ME.compile({ t: 'bin', op: '-', a: P[i], b: P[i + 1] }, ['x', 'y']) }));
    plots.push(Object.assign(base(), { kind: 'ineq', tests, cond: mkCond(['x', 'y']), fillAlpha: 0.26 }));
  }

  function varIsSlider(name) {
    for (const r of recs.values()) if (r.def && r.def.type === 'var' && r.def.name === name) return r.isSlider;
    return false;
  }
  function findVarRec(name) {
    for (const r of recs.values()) if (r.def && r.def.type === 'var' && r.def.name === name) return r;
    return null;
  }

  function dragPoint(item, nodes, x, y) {
    const vals = [x, y];
    const texts = nodes.map((n, i) => {
      if (n.t === 'var') { const r = findVarRec(n.n); if (r) { setSliderValue(r.item, vals[i], true); } return n.n; }
      return fmt(vals[i], 8);
    });
    item.text = `(${texts[0]}, ${texts[1]})`;
    const row = rows.get(item.id);
    if (row) row.ed.set(item.text);
    scheduleEval(true);
    commitSoon(); saveSoon();
  }

  /* ================= editors ================= */
  const useMath = () => !!window.__mlOK && state.settings.editor !== 'text';
  function plainEd(inp) {
    return {
      kind: 'text', el: inp,
      get: () => inp.value,
      set(v) { if (inp.value !== v) inp.value = v; },
      queueSet(v) { this.set(v); },
      focus(end) { inp.focus(); if (end) { try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* noop */ } } },
      blur() { inp.blur(); },
      insert(txt, back) {
        inp.focus(); inp.setRangeText(txt, inp.selectionStart, inp.selectionEnd, 'end');
        if (back) { const p = inp.selectionStart - back; inp.setSelectionRange(p, p); }
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      },
      backspace() {
        inp.focus(); const a = inp.selectionStart, b = inp.selectionEnd;
        if (a !== b) inp.setRangeText('', a, b, 'end'); else if (a > 0) inp.setRangeText('', a - 1, a, 'end');
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      },
    };
  }
  const STD_FN = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'coth', 'ln', 'log', 'exp', 'min', 'max', 'gcd']);
  function mathInsert(mf, txt, back) {
    mf.focus();
    const typed = (t) => mf.executeCommand(['typedText', t]);
    const ins = (l) => mf.insert(l, { selectionMode: 'placeholder', focus: true, format: 'latex' });
    let m;
    if (txt === '^2') { typed('^2'); mf.executeCommand('moveToNextChar'); return; }
    if (txt === '^()') { typed('^'); return; }
    if (txt === '_1') { typed('_1'); mf.executeCommand('moveToNextChar'); return; }
    if (txt === 'sqrt()') { ins('\\sqrt{#?}'); return; }
    if (txt === '||') { ins('\\left|#?\\right|'); return; }
    if (txt === 'pi') { ins('\\pi'); return; }
    if (txt === 'theta') { ins('\\theta'); return; }
    if (txt === '<=') { ins('\\le'); return; }
    if (txt === '>=') { ins('\\ge'); return; }
    if (txt === '*') { ins('\\cdot'); return; }
    if (txt === '°') { ins('\\degree'); return; }
    if (txt === '[]') { ins('\\lbrack #?\\rbrack'); return; }
    if (txt === '{}') { ins('\\lbrace #?\\rbrace'); return; }
    if (txt === 'sum(n,1,10,n)') { ins('\\operatorname{sum}\\left(n,1,10,n\\right)'); return; }
    if (txt === 'int(0,1,x)') { ins('\\operatorname{int}\\left(0,1,x\\right)'); return; }
    if ((m = /^([A-Za-z]+)\(\)$/.exec(txt))) { const n = m[1]; ins(STD_FN.has(n) ? `\\${n}\\left(#?\\right)` : n.length === 1 ? `${n}\\left(#?\\right)` : `\\operatorname{${n}}\\left(#?\\right)`); return; }
    typed(txt);
  }
  function mathEd(mf) {
    let pend = null, timer = 0;
    const ed = {
      kind: 'math', el: mf,
      get: () => LX.latexToText(mf.getValue('latex')),
      set(text) {
        if (document.activeElement === mf && ed.get() === text) return;
        const l = LX.textToLatex(text);
        if (mf.getValue('latex') !== l) { try { mf.setValue(l, { silenceNotifications: true }); } catch (e) { mf.value = l; } }
      },
      queueSet(text) { pend = text; if (timer) return; timer = setTimeout(() => { timer = 0; if (pend !== null) { ed.set(pend); pend = null; } }, 120); },
      focus(end) { mf.focus(); if (end) { try { mf.executeCommand('moveToMathfieldEnd'); } catch (e) { /* noop */ } } },
      blur() { mf.blur(); },
      insert(txt, back) { mathInsert(mf, txt, back); },
      backspace() { mf.focus(); mf.executeCommand('deleteBackward'); },
    };
    return ed;
  }
  function configureMathLive() {
    try { MathfieldElement.soundsDirectory = null; MathfieldElement.plonkSound = null; MathfieldElement.keypressSound = null; } catch (e) { /* noop */ }
  }

  /* ================= row ui ================= */
  function updatePretty(row) {
    if (!row.pretty) return;
    const v = row.inp.value;
    row.pretty.innerHTML = pretty(v);
    row.field.classList.toggle('show-pretty', !!v);
  }

  function updateAllRows() { for (const rec of recs.values()) updateRowUI(rec); renumber(); }

  function renumber() {
    let n = 0;
    for (const item of state.items) {
      const r = rows.get(item.id); if (!r) continue;
      n++; r.num.textContent = n;
    }
    applyFolderState();
  }
  function applyFolderState() {
    const byId = new Map(state.items.map((i) => [i.id, i]));
    for (const item of state.items) {
      if (item.parent && !(byId.get(item.parent) && byId.get(item.parent).type === 'folder')) delete item.parent;
      const r = rows.get(item.id); if (!r) continue;
      const par = item.parent && byId.get(item.parent);
      r.el.classList.toggle('in-folder', !!par);
      r.el.classList.toggle('folded', !!(par && par.collapsed));
      if (item.type === 'folder') { r.el.classList.toggle('collapsed', !!item.collapsed); if (r.fold) r.fold.textContent = item.collapsed ? '▸' : '▾'; }
    }
  }

  function updateRowUI(rec) {
    const item = rec.item, row = rows.get(item.id);
    if (!row) return;
    if (item.type === 'expr') {
      const isPlot = !!(graph.plots.find((p) => p.id === item.id));
      row.dot.classList.toggle('none', !isPlot);
      row.dot.classList.toggle('off', isHidden(item) && isPlot);
      row.dot.style.setProperty('--c', item.color);
      row.dot.disabled = !isPlot;
      row.el.classList.toggle('is-slider', !!rec.isSlider);
      if (rec.isSlider) syncSliderUI(rec);
    } else if (item.type === 'table') {
      row.dot.style.setProperty('--c', item.color);
      row.dot.classList.toggle('off', isHidden(item));
    } else if (item.type === 'folder') {
      row.dot.style.setProperty('--c', '#7a7a7a');
      row.dot.classList.toggle('off', !!item.hidden);
    }
    let html = '';
    if (rec.err && item.text.trim()) html += `<div><span class="err">${esc(rec.err)}</span></div>`;
    else if (rec.missing && rec.missing.length) {
      html += '<div>' + rec.missing.filter((m) => /^[A-Za-zͰ-Ͽ](_\w+|_\{[^}]*\})?$/.test(m) && !RESERVED.has(m)).map((m) => `<button class="chip" data-slider="${esc(m)}">add slider: ${esc(m)}</button>`).join('') + '</div>';
    }
    if (!rec.err && rec.readout) {
      let v; try { v = rec.readout(); } catch (e) { v = NaN; }
      const label = rec.kind === 'var' ? `${esc(rec.def.name)} ` : '';
      html += `<div class="val">${label}= ${esc(fmtValue(v))}</div>`;
    }
    if (!rec.err && rec.extraHtml) html += rec.extraHtml;
    row.msg.innerHTML = html;
  }

  function refreshReadouts() {
    for (const rec of recs.values()) {
      if (!rec.readout || rec.err) continue;
      const row = rows.get(rec.item.id); if (!row) continue;
      const vEl = row.msg.querySelector('.val'); if (!vEl) continue;
      let v; try { v = rec.readout(); } catch (e) { v = NaN; }
      const label = rec.kind === 'var' ? `${esc(rec.def.name)} ` : '';
      vEl.innerHTML = `${label}= ${esc(fmtValue(v))}`;
    }
  }

  function syncSliderUI(rec) {
    const item = rec.item, row = rows.get(item.id), sl = item.slider;
    const v = V[rec.def.name];
    row.range.min = sl.min; row.range.max = sl.max; row.range.step = sl.step > 0 ? sl.step : 'any';
    row.range.value = v;
    if (document.activeElement !== row.smin) row.smin.value = fmt(sl.min, 6);
    if (document.activeElement !== row.smax) row.smax.value = fmt(sl.max, 6);
    row.play.textContent = playing.has(item.id) ? '❚❚' : '▶';
  }

  function createRow(item) {
    const row = {};
    const e = el('div', 'row' + (item.type === 'note' ? ' is-note' : ''));
    e.dataset.id = item.id;
    row.el = e;
    e.innerHTML = `
      <div class="gutter"><span class="num"></span><button class="dot" title="Show / hide"><i></i></button></div>
      <div class="main"></div>
      <div class="acts"><button class="ib gear" title="Style & options" aria-label="Options">${ICON.gear}</button><button class="ib del" title="Delete" aria-label="Delete">${ICON.close}</button></div>`;
    row.num = $('.num', e); row.dot = $('.dot', e);
    const main = $('.main', e);
    if (item.type === 'expr') {
      const math = useMath();
      main.innerHTML = `
        <div class="field${math ? ' math' : ''}">${math ? '<math-field class="in mf"></math-field>' : '<div class="pretty"></div><input class="in" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" placeholder="Type an expression, e.g. y = x^2">'}</div>
        <div class="msg"></div>
        <div class="slider"><input class="lim smin" aria-label="Slider minimum"><input type="range" aria-label="Slider"><input class="lim smax" aria-label="Slider maximum"><button class="play" title="Animate">▶</button></div>`;
      row.field = $('.field', main); row.pretty = $('.pretty', main); row.inp = $('.in', main);
      row.msg = $('.msg', main); row.range = $('input[type=range]', main);
      row.smin = $('.smin', main); row.smax = $('.smax', main); row.play = $('.play', main);
      if (math) {
        const mf = row.inp;
        mf.mathVirtualKeyboardPolicy = 'manual'; mf.smartFence = true; mf.smartSuperscript = true; mf.removeExtraneousParentheses = true;
        mf.setAttribute('placeholder', '\\text{Type an expression, e.g. y = x²}');
        row.ed = mathEd(mf);
        setTimeout(() => row.ed.set(item.text), 0);
      } else {
        row.ed = plainEd(row.inp);
        const base = row.ed.set; row.ed.set = (v) => { base.call(row.ed, v); updatePretty(row); };
        row.inp.value = item.text; updatePretty(row);
      }
      wireExprRow(item, row);
    } else if (item.type === 'note') {
      main.innerHTML = '<textarea class="note" rows="1" placeholder="Add a note…"></textarea><div class="msg"></div>';
      row.ta = $('.note', main); row.msg = $('.msg', main);
      row.ta.value = item.text;
      const fit = () => { row.ta.style.height = 'auto'; row.ta.style.height = row.ta.scrollHeight + 'px'; };
      row.ta.addEventListener('input', () => { item.text = row.ta.value; fit(); commitSoon(); saveSoon(); });
      setTimeout(fit, 0);
      row.inp = row.ta; row.ed = plainEd(row.ta);
    } else if (item.type === 'table') {
      buildTable(item, row, main);
    } else if (item.type === 'folder') {
      e.classList.add('is-folder');
      main.innerHTML = '<div class="ftitle"><button class="fold" aria-label="Collapse or expand folder">▾</button><input class="in ftext" type="text" spellcheck="false" placeholder="Folder name"></div>';
      row.fold = $('.fold', main); row.inp = $('.ftext', main); row.msg = el('div');
      row.inp.value = item.text; row.ed = plainEd(row.inp);
      row.inp.addEventListener('input', () => { item.text = row.inp.value; commitSoon(); saveSoon(); });
      row.inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addItem('expr', item.id); } });
      row.fold.addEventListener('click', () => { item.collapsed = !item.collapsed; applyFolderState(); saveSoon(); commitSoon(); });
    }
    $('.gutter', e).draggable = true;
    row.dot.addEventListener('click', () => { item.hidden = !item.hidden; evaluate(); commitSoon(); saveSoon(); });
    $('.gear', e).addEventListener('click', (ev) => openItemPopover(item, ev.currentTarget));
    $('.del', e).addEventListener('click', () => deleteItem(item.id));
    e.addEventListener('focusin', (ev) => { document.querySelectorAll('.row.focus').forEach((r) => r.classList.remove('focus')); e.classList.add('focus'); const t = ev.target; if (row.ed && (t === row.ed.el || (row.ed.el.contains && row.ed.el.contains(t)))) lastEd = row.ed; else if (t && t.matches && t.matches('input:not([type=range]):not([type=checkbox]),textarea')) lastEd = plainEd(t); else if (row.ed) lastEd = row.ed; });
    e.addEventListener('focusout', () => setTimeout(() => { if (!e.contains(document.activeElement)) e.classList.remove('focus'); }, 0));
    rows.set(item.id, row);
    return e;
  }

  function wireExprRow(item, row) {
    const ed = row.ed;
    row.inp.addEventListener('input', () => {
      item.text = ed.get();
      updatePretty(row);
      scheduleEval();
      commitSoon(); saveSoon();
    });
    row.inp.addEventListener('keydown', (ev) => {
      const math = ed.kind === 'math';
      const handled = () => { ev.preventDefault(); if (math) ev.stopPropagation(); };
      if (ev.key === 'Enter') { handled(); addItem('expr', item.id); }
      else if (ev.key === 'Backspace' && !ed.get() && state.items.length > 1) { handled(); const prev = state.items[state.items.findIndex((i) => i.id === item.id) - 1]; deleteItem(item.id); if (prev) focusItem(prev.id); }
      else if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && (!math || !ed.get())) {
        const i = state.items.findIndex((x) => x.id === item.id) + (ev.key === 'ArrowUp' ? -1 : 1);
        if (state.items[i]) { handled(); focusItem(state.items[i].id); }
      } else if (ev.key === 'Escape') { ed.blur(); }
      else if (math && ev.key === '/' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { handled(); ed.el.insert('\\frac{#@}{#?}', { selectionMode: 'placeholder', format: 'latex', focus: true }); }
    }, ed.kind === 'math');
    row.msg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-slider]'); if (!b) return;
      const name = b.dataset.slider;
      const idx = state.items.findIndex((i) => i.id === item.id);
      const ni = newItem('expr', { text: `${name}=1`, slider: { min: -10, max: 10, step: 0.01 } });
      state.items.splice(idx, 0, ni);
      row.el.parentNode.insertBefore(createRow(ni), row.el);
      evaluate(); commitSoon(); saveSoon();
    });
    row.range.addEventListener('input', () => { const rec = recs.get(item.id); if (rec && rec.isSlider) setSliderValue(item, parseFloat(row.range.value), false); });
    const lim = (which) => () => {
      const rec = recs.get(item.id); const v = evalNumberText(which === 'min' ? row.smin.value : row.smax.value);
      if (Number.isFinite(v)) { item.slider[which] = v; if (item.slider.min >= item.slider.max) { item.slider[which === 'min' ? 'max' : 'min'] = v + (which === 'min' ? 1 : -1); } if (rec) syncSliderUI(rec); saveSoon(); commitSoon(); }
    };
    row.smin.addEventListener('change', lim('min')); row.smax.addEventListener('change', lim('max'));
    row.smin.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
    row.smax.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
    row.play.addEventListener('click', () => { if (playing.has(item.id)) playing.delete(item.id); else { playing.add(item.id); startAnim(); } const rec = recs.get(item.id); if (rec && rec.isSlider) syncSliderUI(rec); });
  }

  function setSliderValue(item, v, silent) {
    const rec = recs.get(item.id);
    if (!rec || !rec.isSlider) return;
    const name = rec.def.name;
    V[name] = v;
    item.text = `${name}=${fmt(v, 8)}`;
    const sl = item.slider;
    if (v < sl.min) sl.min = Math.floor(v); if (v > sl.max) sl.max = Math.ceil(v);
    const row = rows.get(item.id);
    if (row) { row.ed.queueSet(item.text); if (document.activeElement !== row.range) row.range.value = v; syncSliderUI(rec); }
    recomputeVars();
    refreshReadouts();
    graph.requestDraw(true);
    if (!silent) { commitSoon(); saveSoon(); }
  }

  let animOn = false, lastTs = 0;
  function startAnim() {
    if (animOn) return; animOn = true; lastTs = performance.now();
    const tick = (ts) => {
      if (!playing.size) { animOn = false; return; }
      const dt = Math.min(0.1, (ts - lastTs) / 1000); lastTs = ts;
      for (const id of [...playing]) {
        const rec = recs.get(id); if (!rec || !rec.isSlider) { playing.delete(id); continue; }
        const sl = rec.item.slider, span = sl.max - sl.min;
        let v = V[rec.def.name] + dt * span / (8 / (sl.speed || 1));
        if (v > sl.max) v = sl.min + ((v - sl.min) % span);
        setSliderValue(rec.item, Math.round(v * 1e5) / 1e5, true);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function buildTable(item, row, main) {
    main.innerHTML = '<table class="tbl"><thead><tr></tr></thead><tbody></tbody></table><div class="tblopts"><label><input type="checkbox" class="tl"> connect with line</label></div><div class="msg"></div>';
    const tbl = $('.tbl', main), head = $('thead tr', tbl), body = $('tbody', tbl);
    row.msg = $('.msg', main);
    const sub = (n) => String(n).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[c]).join('');
    head.innerHTML = `<th>x${sub(item.tno)}</th><th>y${sub(item.tno)}</th>`;
    const chk = $('.tl', main); chk.checked = !!item.showLine;
    chk.addEventListener('change', () => { item.showLine = chk.checked; evaluate(); commitSoon(); saveSoon(); });
    const render = () => {
      body.innerHTML = '';
      item.rows.forEach((r, ri) => {
        const tr = el('tr');
        [0, 1].forEach((ci) => {
          const td = el('td'); const inp = el('input'); inp.value = r[ci]; inp.spellcheck = false; inp.setAttribute('aria-label', `row ${ri + 1} col ${ci + 1}`);
          const chkBad = () => inp.classList.toggle('bad', !!inp.value.trim() && !Number.isFinite(evalNumberText(inp.value)));
          chkBad();
          inp.addEventListener('input', () => {
            r[ci] = inp.value; chkBad();
            if (ri === item.rows.length - 1 && (r[0] || r[1])) { item.rows.push(['', '']); const t2 = el('tr'); body.appendChild(t2); render(); const ni = body.querySelectorAll('tr')[ri].querySelectorAll('input')[ci]; if (ni) { ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); } }
            scheduleEval(); commitSoon(); saveSoon();
          });
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'ArrowDown') { const nx = body.querySelectorAll('tr')[ri + 1]; if (nx) { e.preventDefault(); nx.querySelectorAll('input')[ci].focus(); } }
            else if (e.key === 'ArrowUp') { const pv = body.querySelectorAll('tr')[ri - 1]; if (pv) { e.preventDefault(); pv.querySelectorAll('input')[ci].focus(); } }
          });
          td.appendChild(inp); tr.appendChild(td);
        });
        body.appendChild(tr);
      });
    };
    render();
    row.render = render;
    row.inp = body.querySelector('input');
  }

  /* ================= list management ================= */
  function renderList() {
    const list = $('#list');
    list.innerHTML = ''; rows.clear();
    for (const item of state.items) list.appendChild(createRow(item));
  }

  function addItem(type, afterId, text) {
    const item = newItem(type, text !== undefined ? { text } : {});
    let idx = state.items.length;
    if (afterId) {
      const i = state.items.findIndex((x) => x.id === afterId);
      if (i >= 0) {
        idx = i + 1;
        const a = state.items[i];
        const par = a.type === 'folder' ? a.id : a.parent;
        if (par && type !== 'folder') item.parent = par;
      }
    }
    state.items.splice(idx, 0, item);
    const rowEl = createRow(item);
    const list = $('#list');
    const ref = list.children[idx] || null;
    list.insertBefore(rowEl, ref);
    evaluate();
    focusItem(item.id);
    commitSoon(); saveSoon();
    return item;
  }
  function focusItem(id) {
    const r = rows.get(id); if (!r) return;
    if (r.ed) r.ed.focus(true); else if (r.inp) r.inp.focus();
    r.el.scrollIntoView({ block: 'nearest' });
  }
  function deleteItem(id) {
    const i = state.items.findIndex((x) => x.id === id); if (i < 0) return;
    if (state.items[i].type === 'folder') state.items.forEach((c) => { if (c.parent === id) delete c.parent; });
    state.items.splice(i, 1); playing.delete(id);
    const r = rows.get(id); if (r) { r.el.remove(); rows.delete(id); }
    if (graph.selectedId === id) graph.setSelected(null);
    if (!state.items.length) { const it = newItem('expr'); state.items.push(it); $('#list').appendChild(createRow(it)); }
    closePopovers();
    evaluate(); commitSoon(); saveSoon();
  }
  function duplicateItem(id) {
    const i = state.items.findIndex((x) => x.id === id); if (i < 0) return;
    const src = state.items[i];
    const copy = JSON.parse(JSON.stringify(src)); copy.id = nextId++;
    state.items.splice(i + 1, 0, copy);
    $('#list').insertBefore(createRow(copy), rows.get(id).el.nextSibling);
    evaluate(); commitSoon(); saveSoon();
  }

  let evalPending = false;
  function scheduleEval(now) {
    if (now) { clearTimeout(evalTimer); evalPending = false; evaluate(); return; }
    clearTimeout(evalTimer);
    evalTimer = setTimeout(evaluate, 45);
  }

  /* ================= history / persistence ================= */
  function snapshot() {
    return JSON.stringify({ items: state.items, colorIdx: state.colorIdx, tableCount: state.tableCount || 0, deg: state.settings.deg });
  }
  function commitSoon() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      const s = snapshot();
      if (hist[hIdx] === s) return;
      hist = hist.slice(0, hIdx + 1); hist.push(s); if (hist.length > 100) hist.shift();
      hIdx = hist.length - 1; updateUndo();
    }, 450);
  }
  function updateUndo() { $('#btnUndo').disabled = hIdx <= 0; $('#btnRedo').disabled = hIdx >= hist.length - 1; }
  function restore(s) {
    const d = JSON.parse(s);
    state.items = d.items; state.colorIdx = d.colorIdx; state.tableCount = d.tableCount; state.settings.deg = !!d.deg;
    playing.clear(); renderList(); evaluate(); saveSoon();
  }
  function undo() { clearTimeout(commitTimer); const s = snapshot(); if (hist[hIdx] !== s) { hist = hist.slice(0, hIdx + 1); hist.push(s); hIdx++; } if (hIdx > 0) { hIdx--; restore(hist[hIdx]); updateUndo(); } }
  function redo() { if (hIdx < hist.length - 1) { hIdx++; restore(hist[hIdx]); updateUndo(); } }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const r = graph.range();
        localStorage.setItem(STORE_KEY, JSON.stringify({ items: state.items, settings: state.settings, colorIdx: state.colorIdx, tableCount: state.tableCount || 0, view: [r.xmin, r.xmax, r.ymin, r.ymax], nextId }));
      } catch (e) { /* storage unavailable */ }
    }, 300);
  }
  function loadSaved() {
    try {
      const h = location.hash;
      let raw = null;
      if (h.startsWith('#g=')) {
        const b = h.slice(3).replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(b); const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        raw = new TextDecoder().decode(bytes);
      } else raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!Array.isArray(d.items) || !d.items.length) return false;
      state = { items: d.items, settings: Object.assign(defaultSettings(), d.settings || {}), colorIdx: d.colorIdx || 0, tableCount: d.tableCount || 0, view: d.view || null };
      nextId = Math.max(d.nextId || 1, ...state.items.map((i) => i.id + 1));
      return true;
    } catch (e) { return false; }
  }
  function shareLink() {
    const payload = JSON.stringify({ items: state.items, settings: state.settings, colorIdx: state.colorIdx, tableCount: state.tableCount || 0, view: (() => { const r = graph.range(); return [r.xmin, r.xmax, r.ymin, r.ymax]; })() });
    const bytes = new TextEncoder().encode(payload);
    let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.href.split('#')[0] + '#g=' + b64;
  }

  /* ================= popovers & menus ================= */
  function closePopovers() { $('#pop').hidden = true; $('#gset').hidden = true; $('#mainMenu').hidden = true; $('#addMenu').hidden = true; }
  function place(pop, anchor) {
    pop.hidden = false;
    const a = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    let left = a.right + 8; if (left + w > innerWidth - 8) left = Math.max(8, a.left - w - 8);
    let top = a.top; top = clamp(top, 8, Math.max(8, innerHeight - h - 8));
    if (innerWidth < 720) { left = clamp(a.left - w + a.width, 8, innerWidth - w - 8); top = clamp(a.bottom + 6 - h, 8, innerHeight - h - 8); }
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }

  function openItemPopover(item, anchor) {
    const pop = $('#pop');
    if (!pop.hidden && pop.dataset.id == item.id) { pop.hidden = true; return; }
    pop.dataset.id = item.id;
    const rec = recs.get(item.id);
    const isSlider = rec && rec.isSlider;
    const showStyle = item.type === 'expr' || item.type === 'table';
    let html = '';
    if (showStyle) {
      html += `<div class="sec"><h4>Color</h4><div class="sw">${PALETTE.map((c) => `<button data-c="${c}" style="background:${c}" class="${c === item.color ? 'on' : ''}" aria-label="${c}"></button>`).join('')}<input type="color" value="${/^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#2d70b3'}" aria-label="Custom color"></div></div>
      <div class="sec"><h4>Line</h4><div class="seg" data-seg="line"><button data-v="solid" class="${item.line === 'solid' ? 'on' : ''}">Solid</button><button data-v="dashed" class="${item.line === 'dashed' ? 'on' : ''}">Dashed</button><button data-v="dotted" class="${item.line === 'dotted' ? 'on' : ''}">Dotted</button></div>
      <label>Thickness <input type="range" min="1" max="8" step="0.5" value="${item.width}" data-width></label></div>`;
    }
    if (isSlider) {
      const sl = item.slider;
      html += `<div class="sec"><h4>Slider</h4><div class="range2"><label>Min<input type="text" data-s="min" value="${fmt(sl.min, 6)}"></label><label>Max<input type="text" data-s="max" value="${fmt(sl.max, 6)}"></label></div>
      <label>Step <input type="text" data-s="step" value="${sl.step}"></label>
      <label>Speed <span class="seg" data-seg="speed">${[0.25, 0.5, 1, 2, 4].map((s) => `<button data-v="${s}" class="${(sl.speed || 1) === s ? 'on' : ''}">${s}×</button>`).join('')}</span></label></div>`;
    }
    if (rec && rec.hasPoints) html += `<div class="sec"><label>Connect points with a line <input type="checkbox" data-line ${item.showLine ? 'checked' : ''}></label></div>`;
    html += '<div class="btns"><button data-act="dup">Duplicate</button><button data-act="del" class="danger">Delete</button></div>';
    pop.innerHTML = html;
    place(pop, anchor);
    const redraw = () => { evaluate(); commitSoon(); saveSoon(); };
    pop.querySelectorAll('.sw button').forEach((b) => b.onclick = () => { item.color = b.dataset.c; pop.querySelectorAll('.sw button').forEach((x) => x.classList.toggle('on', x === b)); redraw(); });
    const ci = pop.querySelector('input[type=color]'); if (ci) ci.oninput = () => { item.color = ci.value; redraw(); };
    pop.querySelectorAll('[data-seg="line"] button').forEach((b) => b.onclick = () => { item.line = b.dataset.v; pop.querySelectorAll('[data-seg="line"] button').forEach((x) => x.classList.toggle('on', x === b)); redraw(); });
    const wr = pop.querySelector('[data-width]'); if (wr) wr.oninput = () => { item.width = parseFloat(wr.value); redraw(); };
    pop.querySelectorAll('[data-s]').forEach((inp) => inp.onchange = () => {
      const v = evalNumberText(inp.value); if (!Number.isFinite(v)) return;
      const k = inp.dataset.s;
      if (k === 'step' && v < 0) return;
      item.slider[k] = v; if (item.slider.min >= item.slider.max) item.slider.max = item.slider.min + 1;
      const r = recs.get(item.id); if (r) syncSliderUI(r); saveSoon(); commitSoon();
    });
    pop.querySelectorAll('[data-seg="speed"] button').forEach((b) => b.onclick = () => { item.slider.speed = parseFloat(b.dataset.v); pop.querySelectorAll('[data-seg="speed"] button').forEach((x) => x.classList.toggle('on', x === b)); saveSoon(); });
    const lc = pop.querySelector('[data-line]'); if (lc) lc.onchange = () => { item.showLine = lc.checked; redraw(); };
    pop.querySelector('[data-act="del"]').onclick = () => deleteItem(item.id);
    pop.querySelector('[data-act="dup"]').onclick = () => { closePopovers(); duplicateItem(item.id); };
  }

  function openGraphSettings() {
    const pop = $('#gset');
    if (!pop.hidden) { pop.hidden = true; return; }
    const r = graph.range(), S = state.settings;
    const f = (v) => parseFloat(v.toPrecision(6));
    pop.innerHTML = `
      <div class="sec"><h4>Window</h4><div class="range2">
        <label>X min<input type="number" step="any" data-r="xmin" value="${f(r.xmin)}"></label><label>X max<input type="number" step="any" data-r="xmax" value="${f(r.xmax)}"></label>
        <label>Y min<input type="number" step="any" data-r="ymin" value="${f(r.ymin)}"></label><label>Y max<input type="number" step="any" data-r="ymax" value="${f(r.ymax)}"></label></div></div>
      <div class="sec"><h4>Grid</h4>
        <label>Major gridlines <input type="checkbox" data-t="grid" ${S.grid ? 'checked' : ''}></label>
        <label>Minor gridlines <input type="checkbox" data-t="minor" ${S.minor ? 'checked' : ''}></label>
        <label>Axis numbers <input type="checkbox" data-t="numbers" ${S.numbers ? 'checked' : ''}></label>
        <label>X-axis in multiples of π <input type="checkbox" data-t="piX" ${S.piX ? 'checked' : ''}></label></div>
      <div class="sec"><h4>Formula editor</h4><div class="seg" data-seg="editor"><button data-v="live" class="${S.editor === 'text' ? '' : 'on'}"${window.__mlOK ? '' : ' disabled title="Unavailable offline"'}>Live (typeset)</button><button data-v="text" class="${S.editor === 'text' ? 'on' : ''}">Plain text</button></div></div>
      <div class="sec"><h4>Angle unit</h4><div class="seg" data-seg="ang"><button data-v="rad" class="${S.deg ? '' : 'on'}">Radians</button><button data-v="deg" class="${S.deg ? 'on' : ''}">Degrees</button></div></div>
      <div class="sec"><h4>Theme</h4><div class="seg" data-seg="theme"><button data-v="light" class="${S.theme === 'light' ? 'on' : ''}">Light</button><button data-v="dark" class="${S.theme === 'dark' ? 'on' : ''}">Dark</button></div></div>`;
    place(pop, $('#btnSettings'));
    pop.querySelectorAll('[data-r]').forEach((inp) => inp.onchange = () => {
      const g = (k) => parseFloat(pop.querySelector(`[data-r="${k}"]`).value);
      const a = g('xmin'), b = g('xmax'), c = g('ymin'), d = g('ymax');
      if ([a, b, c, d].every(Number.isFinite) && b > a && d > c) graph.setRange(a, b, c, d);
    });
    pop.querySelectorAll('[data-t]').forEach((inp) => inp.onchange = () => { S[inp.dataset.t] = inp.checked; applySettings(); saveSoon(); });
    pop.querySelectorAll('[data-seg="ang"] button').forEach((b) => b.onclick = () => { S.deg = b.dataset.v === 'deg'; pop.querySelectorAll('[data-seg="ang"] button').forEach((x) => x.classList.toggle('on', x === b)); evaluate(); commitSoon(); saveSoon(); });
    pop.querySelectorAll('[data-seg="editor"] button').forEach((b) => b.onclick = () => { if (b.disabled) return; S.editor = b.dataset.v; pop.hidden = true; renderList(); evaluate(); saveSoon(); });
    pop.querySelectorAll('[data-seg="theme"] button').forEach((b) => b.onclick = () => { S.theme = b.dataset.v; pop.querySelectorAll('[data-seg="theme"] button').forEach((x) => x.classList.toggle('on', x === b)); applySettings(); evaluate(); saveSoon(); });
  }

  function applySettings() {
    const S = state.settings;
    document.documentElement.dataset.theme = S.theme;
    Object.assign(graph.settings, { grid: S.grid, minor: S.minor, numbers: S.numbers, piX: S.piX });
    graph.refreshTheme();
    graph.requestDraw(false);
  }

  const EXAMPLES = [
    ['Sliders: parabola', ['a=1', 'h=0', 'k=0', 'y=a(x-h)^2+k']],
    ['Sine wave', ['A=2', 'B=1', 'C=0', 'y=A sin(B x + C)']],
    ['Polar rose', ['k=4', 'r=3 cos(k θ){0<=θ<=2π}']],
    ['Parametric (Lissajous)', ['a=3', 'b=2', '(sin(a t), sin(b t)){0<=t<=2π}']],
    ['Inequalities', ['y<x^2', 'x^2+y^2<=9', '1<x<3']],
    ['Implicit curves', ['x^2+y^2=25', 'x^3+y^3=3 x y', 'y^2=x^3-3x+3']],
    ['Calculus: f, f\' and area', ['f(x)=x^3-3x', 'y=f\'(x)', 'y=f(x){-2<=x<=1}', 'int(0,2,f(x))']],
    ['Piecewise & restrictions', ['y={x<0:-x, x^2}', 'y=2{1<=x<=4}', 'x=-3{-2<=y<=2}']],
    ['Complex numbers', ['z=3+4i', 'abs(z)', 'arg(z)', 'conj(z)', 'w=z*i', 'e^(i*pi/3)', '(1+i)^2']],
    ['Tangent & secant lines', ['y=x^3/6-x', { type: 'note', text: 'Click the curve, then switch on Tangent / Secant in the bar at the bottom.' }]],
    ['Folders', [{ type: 'folder', text: 'Circle' }, 'x^2+y^2=4', '(0,0)', { type: 'folder', text: 'Parabola' }, 'y=x^2-2', 'y=-x^2+2']],
    ['Random & distributions', ['y=normpdf(x)', 'y=normpdf(x,1.5,0.6)', 'normcdf(1.96)', 'binompdf(10,0.5,5)', 'invnorm(0.975)', 'R=random(6)', 'shuffle([1...6])']],
    ['Many curves from a list', ['L=[1...5]', 'y=L sin(x)/2']],
    ['Residuals', [{ type: 'table', rows: [['1', '2.1'], ['2', '3.9'], ['3', '6.2'], ['4', '7.8'], ['5', '10.1'], ['', '']] }, 'y_1 ~ m x_1 + b', '(x_1, e_1)']],
    ['Draggable points', ['(1,2)', '(3,-1)', 'y=m x+c', 'm=0.5', 'c=1']],
    ['Lists & statistics', ['L=[1...10]', 'M=L^2', '(L,M)', 'mean(M)', 'median(M)', 'stdev(M)', 'sort([5,3,9,1])', 'L[L>6]', 'total(L)']],
    ['Regression from a table', [{ type: 'table', rows: [['1', '2.1'], ['2', '3.9'], ['3', '6.2'], ['4', '7.8'], ['5', '10.1'], ['6', '12.2'], ['', '']] }, 'y_1 ~ m x_1 + b']],
    ['Quadratic regression', [{ type: 'table', rows: [['-3', '10'], ['-2', '4.5'], ['-1', '1.2'], ['0', '-0.5'], ['1', '1.1'], ['2', '4.2'], ['3', '9.8'], ['', '']] }, 'y_1 ~ a x_1^2 + b x_1 + c']],
  ];
  function loadExample(texts) {
    state.tableCount = 0;
    let cur = null;
    state.items = texts.map((t) => {
      const it = typeof t === 'string' ? newItem('expr', { text: t }) : newItem(t.type, JSON.parse(JSON.stringify(t)));
      if (it.type === 'folder') cur = it; else if (cur) it.parent = cur.id;
      return it;
    });
    state.items.push(newItem('expr'));
    playing.clear(); graph.setSelected(null); renderList(); evaluate(); graph.resetView(); commitSoon(); saveSoon();
  }

  function buildMainMenu() {
    const m = $('#mainMenu');
    m.innerHTML = `<div class="lbl">Graph</div>
      <button data-m="new">New graph</button><button data-m="open">Open file…</button><button data-m="save">Save to file</button>
      <button data-m="png">Export image (PNG)</button><button data-m="link">Copy share link</button><hr>
      <div class="lbl">Examples</div>${EXAMPLES.map((e, i) => `<button data-ex="${i}">${esc(e[0])}</button>`).join('')}<hr>
      <button data-m="help">Help &amp; syntax</button>`;
    m.onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      closePopovers();
      if (b.dataset.ex !== undefined) { loadExample(EXAMPLES[+b.dataset.ex][1]); return; }
      switch (b.dataset.m) {
        case 'new': if (confirm('Start a new graph? Unsaved work will be cleared.')) { state.items = [newItem('expr')]; playing.clear(); renderList(); evaluate(); graph.resetView(); commitSoon(); saveSoon(); } break;
        case 'open': $('#fileIn').click(); break;
        case 'save': {
          const blob = new Blob([JSON.stringify({ app: 'graphical-calculator', version: 1, items: state.items, settings: state.settings, colorIdx: state.colorIdx, tableCount: state.tableCount || 0, nextId }, null, 2)], { type: 'application/json' });
          download(blob, 'graph.json'); toast('Saved graph.json'); break;
        }
        case 'png': graph.exportPNG((blob) => { download(blob, 'graph.png'); toast('Exported graph.png'); }); break;
        case 'link': copyText(shareLink()).then(() => toast('Share link copied')).catch(() => toast('Could not copy link')); break;
        case 'help': showHelp(); break;
        default: break;
      }
    };
  }
  function download(blob, name) { const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function copyText(t) { if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t); return new Promise((res, rej) => { const ta = el('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } ta.remove(); }); }
  let toastT = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }

  function showHelp() {
    const it = newItem('note', { text: 'Syntax cheat-sheet\n• y = x^2, x = y^2, r = 2 sin(3θ)\n• Implicit: x^2 + y^2 = 4   Inequality: y < sin(x), 1 < x < 3\n• Parametric: (cos(t), sin(t)){0<=t<=2π}\n• Points: (1, 2) — drag them!\n• Functions: f(x) = x^2, then f(3) or f\'(x)\n• Sliders: type a new letter (a x) and click “add slider”\n• Restrict a domain: y = x^2 {x > 0}   Piecewise: y = {x<0: -x, x}\n• Lists: L=[1...10], [2,4...20], L^2, L[3], L[L>5], (L, L^2)\n• Stats: mean, median, total, stdev, variance, quartile, corr, cov, sort, join, unique, count\n• Tables make lists x_1, y_1 — fit with  y_1 ~ m x_1 + b  (any model, e.g. a*e^(b x_1))\n• sum(n,1,10,n^2)   int(0,1,x^2)   abs, sqrt, ln, log, nCr, floor …\n• Folders: + → Folder, then drag rows (grip = the number column) to reorder or move into folders\n• random(), random(5), shuffle(L), normpdf/normcdf/invnorm, binompdf/binomcdf, poissonpdf/poissoncdf\n• Residuals after a regression: e_1 → (x_1, e_1)\n• Complex numbers: i, 3+4i, abs(z), arg(z), conj(z), e^(i*pi); a complex value plots as a point\n• Click a curve for tangent & secant lines (bar at the bottom), zeros, extrema & intersections' });
    state.items.unshift(it); $('#list').insertBefore(createRow(it), $('#list').firstChild); evaluate(); commitSoon(); saveSoon();
    $('#list').scrollTop = 0;
  }

  /* ================= keypad ================= */
  const KP_MAIN = [
    ['x', 'x'], ['y', 'y'], ['a²', '^2'], ['aᵇ', '^()', 1], ['(', '('], [')', ')'], ['<', '<'], ['>', '>'],
    ['|a|', '||', 1], ['π', 'pi'], ['7', '7', 0, 'num'], ['8', '8', 0, 'num'], ['9', '9', 0, 'num'], ['÷', '/', 0, 'op'], ['≤', '<='], ['≥', '>='],
    ['√', 'sqrt()', 1], ['e', 'e'], ['4', '4', 0, 'num'], ['5', '5', 0, 'num'], ['6', '6', 0, 'num'], ['×', '*', 0, 'op'], ['=', '='], ['⌫', '\b', 0, 'op'],
    ['t', 't'], ['θ', 'theta'], ['1', '1', 0, 'num'], ['2', '2', 0, 'num'], ['3', '3', 0, 'num'], ['−', '-', 0, 'op'], ['+', '+', 0, 'op'], ['⏎', '\n', 0, 'op'],
    [',', ','], ['a₁', '_1'], ['0', '0', 0, 'num'], ['.', '.', 0, 'num'], ['[ ]', '[]', 1], ['°', '°'], ['{ }', '{}', 1], ['f(x)', 'f()', 1],
  ];
  const KP_FN = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp', 'sqrt', 'cbrt', 'abs', 'floor', 'ceil', 'round', 'sign', 'min', 'max', 'mod', 'nCr', 'nPr', 'sum', 'int', 'gcd', 'lcm']
    .map((n) => [n, n === 'sum' ? 'sum(n,1,10,n)' : n === 'int' ? 'int(0,1,x)' : n + '()', n === 'sum' || n === 'int' ? 0 : 1]);
  function buildKeypad() {
    const kp = $('#keypad');
    kp.innerHTML = '<div class="tabs"><button data-tab="main" class="on">123</button><button data-tab="fn">functions</button></div><div class="grid"></div>';
    const grid = $('.grid', kp);
    const show = (tab) => {
      kp.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      grid.className = 'grid' + (tab === 'fn' ? ' fn' : '');
      grid.innerHTML = '';
      (tab === 'fn' ? KP_FN : KP_MAIN).forEach((k) => { const b = el('button', 'k ' + (k[3] || ''), esc(k[0])); b.dataset.ins = k[1]; b.dataset.back = k[2] || 0; grid.appendChild(b); });
    };
    show('main');
    kp.addEventListener('mousedown', (e) => e.preventDefault());
    kp.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.tab) { show(t.dataset.tab); return; }
      kpInsert(t.dataset.ins, +t.dataset.back);
    });
  }
  function activeEd() {
    if (lastEd && document.body.contains(lastEd.el)) return lastEd;
    const last = state.items[state.items.length - 1]; const r = rows.get(last.id); return r && r.ed;
  }
  function kpInsert(txt, back) {
    const ed = activeEd(); if (!ed) return;
    ed.el.focus();
    if (txt === '\n') { const rowEl = ed.el.closest('.row'); if (rowEl) addItem('expr', +rowEl.dataset.id); return; }
    if (txt === '\b') { ed.backspace(); return; }
    ed.insert(txt, back);
  }

  function moveItem(id, targetId, after) {
    const items = state.items;
    const src = items.find((i) => i.id === id), tgt = items.find((i) => i.id === targetId);
    if (!src || !tgt || id === targetId) return;
    const block = src.type === 'folder' ? [src, ...items.filter((i) => i.parent === src.id)] : [src];
    if (block.includes(tgt)) return;
    let parent;
    if (src.type === 'folder') parent = undefined;
    else if (tgt.type === 'folder') parent = after ? tgt.id : undefined;
    else parent = tgt.parent;
    state.items = items.filter((i) => !block.includes(i));
    const ti = state.items.indexOf(tgt);
    if (parent === undefined) delete src.parent; else src.parent = parent;
    state.items.splice(ti + (after ? 1 : 0), 0, ...block);
    renderList(); evaluate(); commitSoon(); saveSoon();
  }
  function setupDnD() {
    const list = $('#list'); let dragId = null;
    const clear = () => list.querySelectorAll('.drop-before,.drop-after,.dragging').forEach((r) => r.classList.remove('drop-before', 'drop-after', 'dragging'));
    list.addEventListener('dragstart', (e) => {
      const g = e.target.closest && e.target.closest('.gutter'); const row = e.target.closest && e.target.closest('.row');
      if (!g || !row) return;
      dragId = +row.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragId));
      row.classList.add('dragging');
    });
    list.addEventListener('dragover', (e) => {
      if (dragId === null) return;
      const row = e.target.closest('.row'); if (!row) return;
      e.preventDefault();
      list.querySelectorAll('.drop-before,.drop-after').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
      const r = row.getBoundingClientRect();
      row.classList.add(e.clientY > r.top + r.height / 2 ? 'drop-after' : 'drop-before');
    });
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      const row = e.target.closest('.row');
      if (row && dragId !== null) moveItem(dragId, +row.dataset.id, row.classList.contains('drop-after'));
      dragId = null; clear();
    });
    list.addEventListener('dragend', () => { dragId = null; clear(); });
  }

  /* ================= init ================= */
  function init() {
    // icons
    $('#btnUndo').innerHTML = ICON.undo; $('#btnRedo').innerHTML = ICON.redo; $('#btnMenu').innerHTML = ICON.menu;
    $('#btnCollapse').innerHTML = ICON.left; $('#btnExpand').innerHTML = ICON.right;
    $('#btnSettings').innerHTML = ICON.gear; $('#btnHome').innerHTML = ICON.home;

    if (!loadSaved()) defaultState();
    const coords = $('#coords');
    graph = new Graph($('#graphHost'), {
      tip: $('#tip'),
      callbacks: {
        onView: () => saveSoon(),
        onCursor: (x, y, on) => {
          if (!on) { coords.textContent = ''; return; }
          const dec = clamp(Math.ceil(Math.log10(Math.max(graph.view.sx, graph.view.sy))) + 1, 0, 8);
          coords.textContent = `(${x.toFixed(dec)}, ${y.toFixed(dec)})`;
        },
        onSelect: (id) => { const p = graph.plots.find((q) => q.id === id); $('#curvebar').hidden = !(p && p.kind === 'fx'); if (!p || p.kind !== 'fx') $('#toolInfo').textContent = ''; },
        onTools: (info) => {
          const f = (v) => fmt(v, 5);
          const eq = (m, b) => `y = ${f(m)}x ${b < 0 ? '−' : '+'} ${f(Math.abs(b))}`;
          let t = '';
          if (info && info.tangent) t += `Tangent at x = ${f(info.tangent.x0)}:  ${eq(info.tangent.m, info.tangent.b)}`;
          if (info && info.secant) t += `${t ? '\n' : ''}Secant to x = ${f(info.secant.x1)}:  ${eq(info.secant.m, info.secant.b)}`;
          const el2 = $('#toolInfo'); if (el2.textContent !== t) el2.textContent = t;
          graph.toolInfo = info;
        },
      },
    });
    graph.resize();
    if (state.view && state.view.length === 4 && state.view.every(Number.isFinite)) graph.setRange(state.view[0], state.view[1], state.view[2], state.view[3]);
    else graph.resetView();
    applySettings();
    buildMainMenu(); buildKeypad();
    renderList();
    evaluate();
    hist = [snapshot()]; hIdx = 0; updateUndo();

    // toolbar
    $('#btnAdd').onclick = (e) => { e.stopPropagation(); const m = $('#addMenu'); const h = m.hidden; closePopovers(); m.hidden = !h; };
    $('#addMenu').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; closePopovers(); const last = state.items[state.items.length - 1]; addItem(b.dataset.add, last && last.id); };
    $('#btnMenu').onclick = (e) => { e.stopPropagation(); const m = $('#mainMenu'); const h = m.hidden; closePopovers(); m.hidden = !h; };
    $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
    $('#btnCollapse').onclick = () => { $('#app').classList.add('collapsed'); $('#btnExpand').hidden = false; setTimeout(() => graph.resize(), 30); };
    $('#btnExpand').onclick = () => { $('#app').classList.remove('collapsed'); $('#btnExpand').hidden = true; setTimeout(() => graph.resize(), 30); };
    $('#btnKeypad').onclick = () => { const k = $('#keypad'); k.hidden = !k.hidden; setTimeout(() => graph.resize(), 30); };
    $('#btnHome').onclick = () => graph.resetView();
    $('#btnZoomIn').onclick = () => graph.zoomAt(graph.w / 2, graph.h / 2, 1.3, 1.3);
    $('#btnZoomOut').onclick = () => graph.zoomAt(graph.w / 2, graph.h / 2, 1 / 1.3, 1 / 1.3);
    $('#btnSettings').onclick = (e) => { e.stopPropagation(); const wasHidden = $('#gset').hidden; closePopovers(); if (wasHidden) openGraphSettings(); };
    $('#fileIn').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const d = JSON.parse(rd.result);
          if (!Array.isArray(d.items)) throw new Error('bad file');
          state.items = d.items; state.colorIdx = d.colorIdx || 0; state.tableCount = d.tableCount || 0;
          if (d.settings) Object.assign(state.settings, d.settings);
          nextId = Math.max(1, ...state.items.map((i) => i.id + 1));
          playing.clear(); applySettings(); renderList(); evaluate(); commitSoon(); saveSoon(); toast('Graph loaded');
        } catch (err) { toast('Could not read that file'); }
      };
      rd.readAsText(f); e.target.value = '';
    };

    // tangent / secant bar
    const syncTools = () => { graph.tools.tangent = $('#tTan').checked; graph.tools.secant = $('#tSec').checked; $('#secCtl').hidden = !graph.tools.secant; graph.drawOverlay(); };
    $('#tTan').onchange = syncTools; $('#tSec').onchange = syncTools;
    $('#tH').oninput = () => { const v = parseFloat($('#tH').value); if (Number.isFinite(v) && v !== 0) { graph.tools.h = v; graph.drawOverlay(); } };
    $('#tAdd').onclick = () => {
      const inf = graph.toolInfo; if (!inf) { toast('Click a curve first, then turn on Tangent or Secant'); return; }
      const line = (o) => `y=${fmt(o.m, 6)}x${o.b < 0 ? '-' : '+'}${fmt(Math.abs(o.b), 6)}`;
      const last = state.items[state.items.length - 1];
      if (inf.tangent) addItem('expr', last && last.id, line(inf.tangent));
      if (inf.secant) addItem('expr', state.items[state.items.length - 1].id, line(inf.secant));
      toast('Line added to the list');
    };
    // dismiss popovers
    document.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.popover, .menu, #btnAdd, #btnMenu, #btnSettings, .gear')) return;
      closePopovers();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePopovers();
      const tag = (e.target.tagName || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && tag !== 'input' && tag !== 'textarea') {
        if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
        else if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      }
    });

    // resizable split
    const split = $('#split'), side = $('#side');
    split.addEventListener('pointerdown', (e) => {
      split.setPointerCapture(e.pointerId); split.classList.add('drag');
      const mv = (ev) => { side.style.width = clamp(ev.clientX, 240, innerWidth * 0.8) + 'px'; };
      const up = () => { split.classList.remove('drag'); split.removeEventListener('pointermove', mv); split.removeEventListener('pointerup', up); graph.resize(); };
      split.addEventListener('pointermove', mv); split.addEventListener('pointerup', up);
    });
    setupDnD();
    window.addEventListener('resize', () => graph.resize());
    if (innerWidth < 720) $('#btnKeypad').textContent = '⌨';
    window.__gc = { state: () => state, recs, graph, evaluate, rows, setText: (i, t) => { const it = state.items[i]; it.text = t; const r = rows.get(it.id); r.ed.set(t); evaluate(); } };
  }

  async function boot() {
    try {
      const timeout = new Promise((r) => setTimeout(() => r(false), 6000));
      window.__mlOK = !!(window.mlReady && await Promise.race([window.mlReady, timeout]));
    } catch (e) { window.__mlOK = false; }
    if (window.__mlOK) configureMathLive();
    init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
