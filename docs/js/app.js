/* ==========================================================
   Application: expression list, evaluation, UI
   ========================================================== */
(function () {
  'use strict';
  const { V, F, R, fmt } = ME;
  const STORE_KEY = 'graphical-calculator-web-v1';
  // Six familiar colours only (no black, which vanishes in dark mode): blue, green, red, yellow, orange, purple.
  const PALETTE = ['#2d70b3', '#388c46', '#c74440', '#d9a400', '#fa7e19', '#6042a6'];
  const RESERVED = new Set(['x', 'y', 'r', 'theta', 'rho', 'phi']);
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
  let graph = null, graph3 = null, geo = null, sci = null, sci4 = null, mat = null;
  const activeGraph = () => (state.settings.mode === '3d' ? graph3 : graph);
  let curOrder = [];        // computed variable evaluation order
  let lastEd = null;
  let hist = [], hIdx = -1, commitTimer = 0, saveTimer = 0, evalTimer = 0;

  function defaultSettings() { return { gridType: 'cartesian', showAxisX: true, showAxisY: true, arrows: false, lock: false, cursor: true, axisLabelX: '', axisLabelY: '', app: 'graph', mode: '2d', box: [-5, 5, -5, 5, -5, 5], light: { mode: 'head', az: 40, el: 55, shadows: false }, section: { on: false, axis: 2, pos: 0, flip: false }, editor: 'live', grid: true, minor: true, numbers: true, piX: false, deg: false, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' }; }
  function newItem(type, props) {
    const it = Object.assign({ id: nextId++, type, text: '', hidden: false, line: 'solid', width: 2.5 }, props || {});
    if (type === 'expr' || type === 'table') {
      if (!it.color) { it.color = PALETTE[state.colorIdx % PALETTE.length]; state.colorIdx++; }
    }
    if (type === 'image') { const dft = { src: '', name: '', x: '0', y: '0', w: '6', h: '', angle: '0', opacity: '1' }; for (const k of Object.keys(dft)) if (it[k] === undefined) it[k] = dft[k]; }
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
  // Display spacing: "y=100x-2x^2" -> "y = 100x − 2x^2" (binary operators only; exponents and unary minus are left alone).
  function spaceMath(t) {
    return String(t)
      .replace(/\s*(≤|≥|≠|=|<|>)\s*/g, ' $1 ')
      .replace(/(?<=[0-9A-Za-zπθτ)\u00b2\u00b3\u00b9\u2070-\u2079\u221e])\s*([+\-])\s*(?=[0-9A-Za-z(√π])/g, (m, op) => ' ' + (op === '-' ? '−' : '+') + ' ')
      .replace(/,(?=\S)/g, ', ').replace(/ {2,}/g, ' ').trim();
  }
  // Plain-text version with Unicode superscripts, for note rows (textareas cannot show <sup>).
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };
  function prettyText(src) {
    let s = String(src).replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠')
      .replace(/(?<![A-Za-z])sqrt(?![A-Za-z])/g, '√').replace(/(?<![A-Za-z])cbrt(?![A-Za-z])/g, '∛')
      .replace(/(?<![A-Za-z])pi(?![A-Za-z])/g, 'π').replace(/(?<![A-Za-z])theta(?![A-Za-z])/g, 'θ')
      .replace(/(?<![A-Za-z])infinity(?![A-Za-z])/g, '∞').replace(/\*/g, '·');
    s = s.replace(/\^(\([^()]*\)|-?[0-9]+|[A-Za-z])/g, (m, ex) => {
      const raw = ex.replace(/^\(|\)$/g, '');
      return [...raw].every((c) => SUP[c] !== undefined) ? [...raw].map((c) => SUP[c]).join('') : '^' + ex;
    });
    return spaceMath(s);
  }
  function pretty(src) {
    let s = spaceMath(src.replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠')
      .replace(/(?<![A-Za-z])sqrt(?![A-Za-z])/g, '√').replace(/(?<![A-Za-z])cbrt(?![A-Za-z])/g, '∛')
      .replace(/(?<![A-Za-z])pi(?![A-Za-z])/g, 'π').replace(/(?<![A-Za-z])theta(?![A-Za-z])/g, 'θ')
      .replace(/(?<![A-Za-z])tau(?![A-Za-z])/g, 'τ').replace(/(?<![A-Za-z])infinity(?![A-Za-z])/g, '∞')
      .replace(/\*/g, '·'));
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

  // Selecting the whole page (Select All, or a stray drag) used to leave everything highlighted with no way back.
  // Text can only be selected where it makes sense (inputs, notes, chat answers, help); anywhere else a selection is dropped.
  (function guardSelection() {
    const EDIT = 'input,textarea,select,math-field,[contenteditable="true"]';
    const KEEP = EDIT + ',.ab,.ask-intro,.popover,.selectable';
    document.addEventListener('selectionchange', () => {
      const a = document.activeElement; if (a && a.matches && a.matches(EDIT)) return;
      const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.anchorNode) return;
      const el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      if (el && el.closest && el.closest(KEEP) && sel.focusNode && (sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement).closest(KEEP)) return;
      sel.removeAllRanges();
    });
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'a' && !(e.target.matches && e.target.matches(EDIT))) e.preventDefault();
    }, true);
    document.addEventListener('mousedown', (e) => { if (!(e.target.closest && e.target.closest(KEEP))) { const sel = window.getSelection(); if (sel && !sel.isCollapsed) sel.removeAllRanges(); } }, true);
  })();

  /* ================= evaluation ================= */
  function fmtValue(v) {
    if (Array.isArray(v)) return '[' + v.slice(0, 12).map(fmtValue).join(', ') + (v.length > 12 ? `, … (${v.length} items)` : '') + ']';
    if (v && v.__dist) return { norm: `normaldist(${fmt(v.a)}, ${fmt(v.b)})`, t: `tdist(${fmt(v.a)})`, binom: `binomialdist(${fmt(v.a)}, ${fmt(v.b)})`, pois: `poissondist(${fmt(v.a)})`, unif: `uniformdist(${fmt(v.a)}, ${fmt(v.b)})` }[v.__dist];
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
    for (const it of state.items) if ((it.type === 'expr' || it.type === 'table') && !PALETTE.includes(String(it.color || '').toLowerCase())) { it.color = PALETTE[state.colorIdx % PALETTE.length]; state.colorIdx++; }
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
      if (/->|\u2192/.test(item.text)) {
        try { rec.action = parseAction(item.text); rec.kind = 'action'; } catch (e) { rec.err = e.message || 'Bad action'; rec.kind = 'error'; }
        continue;
      }
      try { rec.stmt = ME.parseStatement(item.text, []); } catch (e) { rec.err = e.message || 'Syntax error'; rec.kind = 'error'; continue; }
      const st = rec.stmt;
      if (st.ops.length === 1 && st.ops[0] === '=') {
        const L = st.parts[0];
        if (L.t === 'call' && !st.restrict.length && !ME.BUILTINS.has(L.n) && !L.primes && L.args.length && L.args.every((a) => a.t === 'var' && !(a.n in ME.CONSTS)) && !RESERVED.has(L.n) && !(L.n in ME.CONSTS)) {
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
        const dom = rec.restrict && rec.restrict.length ? extractRange(rec.restrict, name) : null;
        if (dom) { const r0 = dom(); if (Number.isFinite(r0.lo)) sl.min = r0.lo; if (Number.isFinite(r0.hi)) sl.max = r0.hi; V[name] = Math.min(Math.max(lit, sl.min), sl.max); rec.domainLocked = true; }
        else { if (lit < sl.min) sl.min = Math.floor(lit); if (lit > sl.max) sl.max = Math.ceil(lit); }
      }
    }
    // lists: table columns, then list-valued variable definitions (fixpoint)
    ME.LISTVARS.clear(); ME.CXVARS.clear(); ME.CXFUNCS.clear();
    for (const name of Object.keys(fnDefs)) { const fr = fnDefs[name]; if (fr.parts && (ME.complexValued(fr.parts[1], new Set(fr.def.params)) || fr.def.params.some((q) => q === 'z' || q === 'w'))) ME.CXFUNCS.add(name); }
    const tableRecs = list.filter((r) => r.item.type === 'table');
    for (const tr of tableRecs) { const n = tr.item.tno; tableCols(tr.item).forEach((c) => { ME.LISTVARS.add(c); V[c] = []; }); ME.LISTVARS.add(`e_${n}`); V[`e_${n}`] = []; }
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
      try { F[name] = ME.compile(rec.parts[1], rec.def.params, { complex: rec.def.params.filter((q) => q === 'z' || q === 'w') }); } catch (e) { rec.err = e.message; }
    }
    for (const tr of tableRecs) {
      const cols = tableCols(tr.item), { out } = tableData(tr.item);
      cols.forEach((c, k) => { V[c] = out[k]; });
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
      if (item.type === 'table') { plots.push(...tablePlot(item)); continue; }
      if (item.type === 'image') { if (item.src) imageData.set(item.id, item.src); plots.push(imagePlot(item)); continue; }
      if (item.type === 'expr' && rec.action && !rec.err) { try { buildAction(rec, defined, varDefs, fnNames); } catch (e) { rec.err = e.message || 'Error'; } continue; }
      if (item.type !== 'expr' || rec.err || !rec.parts) continue;
      try { classify(rec, defined, fnDefs, plots); } catch (e) { rec.err = e.message || 'Error'; }
    }
    const p2 = plots.filter((q) => !THREE_D.has(q.kind)), p3 = plots.filter((q) => THREE_D.has(q.kind));
    graph.setPlots(state.settings.app === 'geometry' ? [geo.plot] : p2); plots3Base = p3; applyPlane();
    // switch to 3D automatically only when an item has *just become* 3D (so the 2D button always works)
    const ids3 = new Set(p3.map((q) => q.id));
    const fresh3 = [...ids3].some((id) => !prev3Ids.has(id));
    const firstRun = !seen3;
    prev3Ids = ids3; seen3 = true;
    if (!firstRun && !suspendAuto && fresh3 && !p2.some((q) => !q.hidden) && state.settings.mode !== '3d') { setMode('3d'); return; }
    updateAllRows();
    graph.requestDraw(false); graph3.requestDraw(false);
  }

  let plots3Base = [];
  let prev3Ids = new Set(), seen3 = false, suspendAuto = false;
  const plane = { on: false, a: 0, b: 0, id: null, pt: null, info: null };
  const isTangentable = (q) => !q.hidden && !q.helper && (q.kind === 'surf' || q.kind === 'psurf' || (q.kind === 'isurf' && !q.alpha));
  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function computeTangent(sp) {
    // returns { P, n, kind, extra } or null
    const bx = state.settings.box || [-5, 5, -5, 5, -5, 5];
    if (sp.kind === 'surf') {
      const f = (x, y) => { const v = sp.f(x, y); return Number.isFinite(v) ? v : NaN; };
      const a = plane.a, b = plane.b, z0 = f(a, b), h = 1e-5 * Math.max(1, Math.abs(a), Math.abs(b));
      const fx = (f(a + h, b) - f(a - h, b)) / (2 * h), fy = (f(a, b + h) - f(a, b - h)) / (2 * h);
      if (![z0, fx, fy].every(Number.isFinite)) return null;
      return { P: [a, b, z0], n: [-fx, -fy, 1], zform: { fx, fy, c: z0 - fx * a - fy * b } };
    }
    if (sp.kind === 'psurf') {
      const u = plane.a, v = plane.b, h = 1e-5, F = (uu, vv) => sp.f(uu, vv);
      const P = F(u, v), Pu1 = F(u + h, v), Pu0 = F(u - h, v), Pv1 = F(u, v + h), Pv0 = F(u, v - h);
      if (![P, Pu1, Pu0, Pv1, Pv0].every((q) => q && q.every(Number.isFinite))) return null;
      const Pu = Pu1.map((q, i) => (q - Pu0[i]) / (2 * h)), Pv = Pv1.map((q, i) => (q - Pv0[i]) / (2 * h));
      const n = cross3(Pu, Pv); if (Math.hypot(...n) < 1e-9) return null;
      return { P, n, e1: unit(Pu) };
    }
    // implicit surface: Newton-project the picked point, then use the gradient
    const g = sp.g, h = 1e-5;
    let P = plane.pt ? plane.pt.slice() : null; if (!P) return null;
    const grad = (q) => [(g(q[0] + h, q[1], q[2]) - g(q[0] - h, q[1], q[2])) / (2 * h), (g(q[0], q[1] + h, q[2]) - g(q[0], q[1] - h, q[2])) / (2 * h), (g(q[0], q[1], q[2] + h) - g(q[0], q[1], q[2] - h)) / (2 * h)];
    for (let k = 0; k < 4; k++) { const gr = grad(P), v = g(P[0], P[1], P[2]), l2 = gr[0] ** 2 + gr[1] ** 2 + gr[2] ** 2; if (!(l2 > 1e-14) || !Number.isFinite(v)) break; P = P.map((c, i) => c - v * gr[i] / l2); }
    const n = grad(P); if (!n.every(Number.isFinite) || Math.hypot(...n) < 1e-9) return null;
    return { P, n };
  }
  function applyPlane() {
    const extra = [];
    const surfs = plots3Base.filter(isTangentable);
    const bar = $('#surfbar');
    if (bar) bar.hidden = !(state.settings.mode === '3d' && surfs.length);
    plane.info = null;
    const sp = surfs.find((q) => q.id === plane.id) || surfs[0];
    const la = $('#spLA'), lb = $('#spLB');
    if (sp && la) {
      la.textContent = sp.kind === 'psurf' ? 'u' : 'x'; lb.textContent = sp.kind === 'psurf' ? 'v' : 'y';
      $('#spA').disabled = $('#spB').disabled = sp.kind === 'isurf';
    }
    if (plane.on && sp) {
      const T = computeTangent(sp);
      if (T) {
        const bx = state.settings.box || [-5, 5, -5, 5, -5, 5];
        const half = 0.3 * Math.min(bx[1] - bx[0], bx[3] - bx[2], bx[5] - bx[4]);
        const n = unit(T.n);
        let e1 = T.e1;
        if (!e1) { const helper = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; e1 = unit(cross3(n, helper)); }
        const e2 = unit(cross3(n, e1));
        extra.push({ id: -1, kind: 'patch', helper: true, alpha: 0.42, color: '#fa7e19', o: T.P, e1, e2, h: half });
        extra.push({ id: -2, kind: 'pt3', get: () => T.P, color: '#fa7e19', size: 6 });
        // normalised plane  A x + B y + C z = D   (largest coefficient = ±1)
        const m = Math.max(Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])) || 1;
        const A = n[0] / m, B = n[1] / m, C = n[2] / m, D = (n[0] * T.P[0] + n[1] * T.P[1] + n[2] * T.P[2]) / m;
        plane.info = { A, B, C, D, P: T.P, zform: T.zform };
      }
    }
    const info = $('#spInfo');
    if (info) {
      let t = '';
      if (plane.info) {
        const I = plane.info, f4 = (v) => fmt(v, 4), sg = (v) => (v < 0 ? '−' : '+');
        t = I.zform ? `z = ${f4(I.zform.fx)}x ${sg(I.zform.fy)} ${f4(Math.abs(I.zform.fy))}y ${sg(I.zform.c)} ${f4(Math.abs(I.zform.c))}\n` : `${f4(I.A)}x ${sg(I.B)} ${f4(Math.abs(I.B))}y ${sg(I.C)} ${f4(Math.abs(I.C))}z = ${f4(I.D)}\n`;
        t += `touching point (${f4(I.P[0])}, ${f4(I.P[1])}, ${f4(I.P[2])}) · normal (${f4(I.A)}, ${f4(I.B)}, ${f4(I.C)})`;
      }
      if (info.textContent !== t) info.textContent = t;
    }
    graph3.setPlots(plots3Base.concat(extra));
    graph3.requestDraw(false);
  }
  const THREE_D = new Set(['surf', 'psurf', 'isurf', 'curve3', 'pt3']);
  const hasPlot = (id) => graph.plots.some((q) => q.id === id) || graph3.plots.some((q) => q.id === id);

  /* ---- actions:  a -> a+1, b -> 0   (buttons + ticker) ---- */
  const tickers = new Map();
  function parseAction(text) {
    const segs = []; let depth = 0, cur = '';
    for (const ch of text) {
      if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--;
      if (ch === ',' && depth === 0) { segs.push(cur); cur = ''; } else cur += ch;
    }
    segs.push(cur);
    return segs.map((sg) => {
      const m = /^\s*([A-Za-z\u0370-\u03ff](?:_\w+|_\{[^}]*\})?)\s*(?:->|\u2192)\s*([\s\S]+)$/.exec(sg);
      if (!m) throw new Error('Actions look like  a → a+1  (separate several with commas)');
      const st = ME.parseStatement(m[2], []);
      if (st.ops.length || st.restrict.length) throw new Error('The right-hand side of an action must be an expression');
      return { name: m[1], stmt: st };
    });
  }
  function buildAction(rec, defined, varDefs, fnNames) {
    const missing = new Set();
    rec.actions = rec.action.map((a) => {
      const target = varDefs[a.name];
      if (!target || !target.isSlider) throw new Error(`"${a.name}" must be a slider variable, e.g. ${a.name}=0`);
      const node = ME.resolve(a.stmt.parts[0], fnNames);
      ME.freeVars(node).forEach((v) => { if (!defined.has(v)) missing.add(v); });
      return { name: a.name, fn: ME.compile(node, []) };
    });
    rec.missing = [...missing];
    rec.kind = 'action';
  }
  function runAction(item) {
    const rec = recs.get(item.id);
    if (!rec || rec.kind !== 'action' || rec.err) { stopTicker(item.id); return; }
    const vals = rec.actions.map((a) => a.fn());
    rec.actions.forEach((a, k) => { const tr = findVarRec(a.name); if (tr && Number.isFinite(vals[k])) setSliderValue(tr.item, vals[k], true); });
    commitSoon(); saveSoon();
  }
  function stopTicker(id) { if (tickers.has(id)) { clearInterval(tickers.get(id)); tickers.delete(id); const rec = recs.get(id); if (rec) updateRowUI(rec); } }
  function toggleTicker(item) {
    if (tickers.has(item.id)) { stopTicker(item.id); return; }
    tickers.set(item.id, setInterval(() => runAction(item), Math.max(16, item.tickMs || 200)));
    const rec = recs.get(item.id); if (rec) updateRowUI(rec);
  }

  function recomputeVars() {
    for (const rec of curOrder) {
      try { V[rec.def.name] = rec.fn(); } catch (e) { V[rec.def.name] = NaN; }
    }
  }

  const VALID_NAME = /^[A-Za-z\u0370-\u03ff](?:_\w+|_\{[^}]*\})?$/;
  function tableCols(item) {
    if (!item.cols || item.cols.length < 2) item.cols = [`x_${item.tno}`, `y_${item.tno}`];
    return item.cols;
  }
  function tableData(item) {
    // numeric values per column; the x list keeps rows where x and the first y column are valid
    const cols = tableCols(item);
    const num = item.rows.map((r) => cols.map((_, c) => evalNumberText(r[c] === undefined ? '' : r[c])));
    const out = cols.map(() => []);
    const xs = [];
    num.forEach((r) => { if (Number.isFinite(r[0]) && Number.isFinite(r[1])) xs.push(r[0]); });
    out[0] = xs;
    for (let c = 1; c < cols.length; c++) num.forEach((r) => { if (Number.isFinite(r[0]) && Number.isFinite(r[c])) out[c].push(r[c]); });
    return { out, num };
  }

  const imgCache = new Map(), imageData = new Map();
  function getImg(src) {
    if (!src) return null;
    let im = imgCache.get(src);
    if (!im) { im = new Image(); im.onload = () => graph.requestDraw(false); im.src = src; imgCache.set(src, im); }
    return im;
  }
  function numField(text, dflt) {
    const t = String(text === undefined ? '' : text).trim();
    if (!t) return () => dflt;
    try {
      const st = ME.parseStatement(t, []);
      const fn = ME.compile(ME.resolve(st.parts[0], new Set(Object.keys(F))), []);
      return () => { const v = fn(); return typeof v === 'number' ? v : NaN; };
    } catch (e) { return () => NaN; }
  }
  function imagePlot(item) {
    const fx = numField(item.x, 0), fy = numField(item.y, 0), fw = numField(item.w, 5), fh = String(item.h || '').trim() ? numField(item.h, NaN) : () => NaN, fa = numField(item.angle, 0), fo = numField(item.opacity, 1);
    return { id: item.id, kind: 'image', hidden: isHidden(item), img: getImg(item.src), get: () => ({ x: fx(), y: fy(), w: fw(), h: fh(), angle: fa(), opacity: fo(), deg: ME.R.deg }) };
  }
  function loadImageFile(file, cb) {
    const rd = new FileReader();
    rd.onload = () => {
      const im = new Image();
      im.onload = () => {
        const max = 1000, sc = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * sc)); c.height = Math.max(1, Math.round(im.naturalHeight * sc));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        cb(c.toDataURL(/png|gif|webp|svg/.test(file.type) ? 'image/png' : 'image/jpeg', 0.85));
      };
      im.onerror = () => toast('Could not read that image');
      im.src = rd.result;
    };
    rd.readAsDataURL(file);
  }
  function buildImage(item, row, main) {
    main.innerHTML = `<div class="imgbox"><div class="imgtop"><label class="imgpick"><input type="file" accept="image/*" hidden><span>${item.src ? 'Change image…' : 'Choose an image…'}</span></label><img class="imgprev" alt="" hidden></div>
      <div class="imgfields">${[['x', 'center x'], ['y', 'center y'], ['w', 'width'], ['h', 'height (auto)'], ['angle', 'angle'], ['opacity', 'opacity']].map(([k, t]) => `<label>${t}<input data-f="${k}" spellcheck="false" value="${esc(String(item[k] === undefined ? '' : item[k]))}"></label>`).join('')}</div></div><div class="msg"></div>`;
    row.msg = $('.msg', main);
    const prev = $('.imgprev', main); if (item.src) { prev.src = item.src; prev.hidden = false; }
    $('input[type=file]', main).addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      loadImageFile(f, (url) => {
        item.src = url; item.name = f.name; imageData.set(item.id, url); prev.src = url; prev.hidden = false;
        $('.imgpick span', main).textContent = 'Change image…';
        if (url.length > 2.5e6) toast('Large image: it may not fit in browser autosave');
        evaluate(); commitSoon(); saveSoon();
      });
      e.target.value = '';
    });
    main.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('input', () => { item[inp.dataset.f] = inp.value; scheduleEval(); commitSoon(); saveSoon(); }));
    row.inp = main.querySelector('[data-f]'); row.ed = plainEd(row.inp);
  }
  function tablePlot(item) {
    const cols = tableCols(item);
    const base = PALETTE.indexOf(item.color);
    return cols.slice(1).map((_, k) => ({
      id: item.id, kind: 'table', width: item.width, lineStyle: item.line, hidden: isHidden(item), showLine: item.showLine, size: 3 + item.width * 1.2,
      color: plotColor(k === 0 || base < 0 ? item.color : PALETTE[(base + k) % PALETTE.length]),
      get points() {
        const pts = [];
        for (const r of item.rows) { const x = evalNumberText(r[0]), y = evalNumberText(r[k + 1] === undefined ? '' : r[k + 1]); if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]); }
        return pts;
      },
    }));
  }

  function classify(rec, defined, fnDefs, plots) {
    const item = rec.item, P = rec.parts, st = rec.stmt, ops = st.ops;
    const fvOf = (n) => ME.freeVars(n);
    const isVar = (n, name) => n.t === 'var' && n.n === name;
    const base = () => ({ id: item.id, color: plotColor(item.color), width: item.width, lineStyle: item.line, hidden: isHidden(item), opacity: item.opacity, fillAlpha: item.fillOpacity, pstyle: item.pointStyle, labelSize: item.labelSize, labelPos: item.labelPos });
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
        if (e.items.length === 3) {
          const f3 = new Set(); e.items.forEach((n) => fvOf(n).forEach((v) => f3.add(v)));
          const un = (v) => f3.has(v) && !defined.has(v);
          const fin = (v, d) => (Number.isFinite(v) ? v : d);
          if (un('u') || un('v')) {
            rec.kind = 'psurf'; needMissing(allNodes(), ['u', 'v']);
            const fs = e.items.map((n) => ME.compile(n, ['u', 'v']));
            const ru = extractRange(rec.restrict, 'u'), rv = extractRange(rec.restrict, 'v');
            plots.push(Object.assign(base(), { kind: 'psurf', f: (u, v) => fs.map((q) => q(u, v)), range: () => { const a = ru ? ru() : {}, b = rv ? rv() : {}; return { u: [fin(a.lo, 0), fin(a.hi, 1)], v: [fin(b.lo, 0), fin(b.hi, 1)] }; } }));
          } else if (un('t')) {
            rec.kind = 'curve3'; needMissing(allNodes(), ['t']);
            const fs = e.items.map((n) => ME.compile(n, ['t']));
            plots.push(Object.assign(base(), { kind: 'curve3', f: (t) => fs.map((q) => q(t)), range: extractRange(rec.restrict, 't') }));
          } else {
            rec.kind = 'pt3'; needMissing(allNodes(), []);
            const fs = e.items.map((n) => ME.compile(n, []));
            const plot3 = Object.assign(base(), { kind: 'pt3', get: () => fs.map((q) => q()), size: 3 + item.width * 1.4 });
            const dragOK3 = e.items.every((n) => n.t === 'num' || (n.t === 'neg' && n.a.t === 'num') || (n.t === 'var' && defined.has(n.n) && varIsSlider(n.n)));
            if (dragOK3) plot3.drag = (x, y, z) => dragPoint(item, e.items, x, y, z);
            plots.push(plot3);
          }
          return;
        }
        if (e.items.length !== 2) throw new ME.MathError('Points have 2 coordinates (x, y) or 3 for 3D (x, y, z)');
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
          const plot = Object.assign(base(), { kind: 'point', get: () => [px(), py()], cond: mkCond([]), size: 3.5 + item.width * 0.8, label: item.showLabel ? (item.label || 'coords') : null });
          if (dragOK && item.dragMode !== 'none') plot.drag = (x, y) => {
            const cur = plot.get();
            if (item.dragMode === 'x' && cur) y = cur[1]; else if (item.dragMode === 'y' && cur) x = cur[0];
            dragPoint(item, e.items, x, y);
          };
          plots.push(plot);
        }
        return;
      }
      const fvs = fvOf(e);
      if (fvs.has('z') && !defined.has('z') && !fvs.has('x') && !fvs.has('y')) {
        rec.kind = 'domain'; needMissing([e], ['z']);
        const f = ME.compile(e, ['z'], { complex: ['z'] });
        plots.push(Object.assign(base(), { kind: 'domain', eval: (x, y) => { const v = f(new ME.Cx(x, y)); return typeof v === 'number' ? [v, 0] : (v instanceof ME.Cx ? [v.re, v.im] : null); } }));
        return;
      }
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
      const v0 = fn();
      if (v0 && v0.__plot) { rec.kind = 'stat'; plots.push(Object.assign(base(), { kind: 'stat', get: fn })); return; }
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
      // multi-start least squares: several initial guesses, keep the best fit
      const yMean = Y.reduce((a, v) => a + v, 0) / Y.length, yScale = Math.max(1e-9, Math.max(...Y.map(Math.abs)));
      const starts = [1, 0.1, 10, -1, yMean || 1, yScale, 0.5, 2, -0.1].map((v) => params.map(() => v));
      starts.push(params.map((_, k) => [yScale, 1, 0.1, yMean || 1][k % 4]));
      let sol = null, bestSse = Infinity;
      for (const st0 of starts) {
        let cand; try { cand = levMar(res, st0); } catch (e) { continue; }
        const rr = res(cand), sse0 = rr.reduce((a, v) => a + v * v, 0);
        if (Number.isFinite(sse0) && (sol === null || sse0 < bestSse - 1e-12 * (1 + bestSse))) { bestSse = sse0; sol = cand; }
        if (bestSse < 1e-20) break;
      }
      if (!sol) sol = params.map(() => NaN);
      const r = res(sol);
      params.forEach((n, i) => { V[n] = sol[i]; defined.add(n); });
      const ym = Lh.t === 'var' && /^[A-Za-z\u0370-\u03ff]_\{?(\d+)\}?$/.exec(Lh.n);
      if (ym) V[`e_${ym[1]}`] = r;
      const sse = r.reduce((a, v) => a + v * v, 0), yb = Y.reduce((a, v) => a + v, 0) / Y.length, sst = Y.reduce((a, v) => a + (v - yb) * (v - yb), 0);
      const r2 = sst > 0 ? 1 - sse / sst : NaN;
      rec.kind = 'regression';
      rec.extraHtml = `<div class="val">${params.map((n) => `${esc(n)} = ${fmt(V[n], 6)}`).join(',  ')}</div><div>r² = ${fmt(r2, 5)}${Number.isFinite(sse) ? ` &nbsp; n = ${Y.length}` : ''}</div>`;
      const rmse = Math.sqrt(sse / Y.length);
      rec.extraHtml += `<div>RMSE = ${fmt(rmse, 5)}</div>`;
      if (listNames.length === 1) {
        const cl = JSON.parse(JSON.stringify(Rh));
        ME.walk(cl, (nd) => { if (nd.t === 'var' && listNames.includes(nd.n)) nd.n = 'x'; });
        plots.push(Object.assign(base(), { kind: 'fx', f: ME.compile(cl, ['x']), cond: null, range: null }));
      } else rec.extraHtml += '<div class="hint3">Several predictor lists: parameters shown, no 2D curve drawn.</div>';
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
      const zFree = (n) => fvOf(n).has('z') && !defined.has('z');
      // cylindrical / spherical coordinates:  rho = f(theta, phi),  r = f(z),  z = g(r, theta)
      const fL0 = fvOf(L), fR0 = fvOf(Rr);
      const usesSph = (f) => (f.has('rho') && !defined.has('rho')) || (f.has('phi') && !defined.has('phi'));
      const usesRT = (f) => (f.has('r') && !defined.has('r')) || (f.has('theta') && !defined.has('theta'));
      if (usesSph(fL0) || usesSph(fR0) || ((zFree(L) || zFree(Rr)) && (usesRT(fL0) || usesRT(fR0)))) {
        const V_ = (n) => ({ t: 'var', n }), N_ = (v) => ({ t: 'num', v }), B_ = (op, a, b) => ({ t: 'bin', op, a, b }), C_ = (n, args) => ({ t: 'call', n, args, primes: 0 });
        const sq = (n) => B_('^', V_(n), N_(2));
        const rcyl = () => C_('sqrt', [B_('+', sq('x'), sq('y'))]), rho = () => C_('sqrt', [B_('+', B_('+', sq('x'), sq('y')), sq('z'))]);
        const sub = (nd) => {
          if (nd.t === 'var') {
            if (nd.n === 'rho' && !defined.has('rho')) return rho();
            if (nd.n === 'phi' && !defined.has('phi')) return C_('acos', [B_('/', V_('z'), rho())]);
            if (nd.n === 'r' && !defined.has('r')) return rcyl();
            if (nd.n === 'theta' && !defined.has('theta')) return C_('atan2', [V_('y'), V_('x')]);
            return nd;
          }
          const c = Object.assign({}, nd);
          switch (nd.t) {
            case 'bin': c.a = sub(nd.a); c.b = sub(nd.b); break;
            case 'neg': case 'fact': c.a = sub(nd.a); break;
            case 'call': c.args = nd.args.map(sub); break;
            case 'tuple': case 'list': c.items = nd.items.map(sub); break;
            case 'rel': c.parts = nd.parts.map(sub); break;
            case 'pw': c.cases = nd.cases.map((k) => ({ cond: sub(k.cond), val: sub(k.val) })); c.def = nd.def ? sub(nd.def) : nd.def; break;
            default: break;
          }
          return c;
        };
        const L3 = sub(L), R3 = sub(Rr);
        rec.kind = 'isurf'; needMissing([L3, R3], ['x', 'y', 'z']);
        plots.push(Object.assign(base(), { kind: 'isurf', g: ME.compile({ t: 'bin', op: '-', a: L3, b: R3 }, ['x', 'y', 'z']) }));
        return;
      }
      if (!kind && isVar(L, 'z') && noVar(Rr, 'z') && !defined.has('z')) {
        rec.kind = 'surf'; needMissing([Rr].concat(rec.restrict), ['x', 'y']);
        plots.push(Object.assign(base(), { kind: 'surf', f: ME.compile(Rr, ['x', 'y']), cond: mkCond(['x', 'y']) }));
        return;
      }
      if (!kind && isVar(Rr, 'z') && noVar(L, 'z') && !defined.has('z')) {
        rec.kind = 'surf'; needMissing([L].concat(rec.restrict), ['x', 'y']);
        plots.push(Object.assign(base(), { kind: 'surf', f: ME.compile(L, ['x', 'y']), cond: mkCond(['x', 'y']) }));
        return;
      }
      if (!kind && (zFree(L) || zFree(Rr))) {
        rec.kind = 'isurf'; needMissing(allNodes(), ['x', 'y', 'z']);
        plots.push(Object.assign(base(), { kind: 'isurf', g: ME.compile({ t: 'bin', op: '-', a: L, b: Rr }, ['x', 'y', 'z']) }));
        return;
      }
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
    if (P.some((n) => fvOf(n).has('z') && !defined.has('z'))) {
      rec.kind = 'isurf'; needMissing(allNodes(), ['x', 'y', 'z']);
      const gs = ops.map((op, i) => ({ op, g: ME.compile({ t: 'bin', op: '-', a: P[i], b: P[i + 1] }, ['x', 'y', 'z']) }));
      const cond3 = mkCond(['x', 'y', 'z']);
      const inside = (x, y, z) => {
        for (const t of gs) { const v = t.g(x, y, z); if (!(t.op === '<' ? v < 0 : t.op === '<=' ? v <= 0 : t.op === '>' ? v > 0 : v >= 0)) return false; }
        return !cond3 || cond3(x, y, z);
      };
      rec.isIneq3 = true;
      gs.forEach((t, i) => plots.push(Object.assign(base(), { kind: 'isurf', alpha: 0.4, g: t.g, inside: i === 0 ? inside : null, volume: !item.noVolume })));
      return;
    }
    rec.kind = 'ineq'; needMissing(allNodes(), ['x', 'y']);
    const tests = ops.map((op, i) => ({ op, g: ME.compile({ t: 'bin', op: '-', a: P[i], b: P[i + 1] }, ['x', 'y']) }));
    plots.push(Object.assign(base(), { kind: 'ineq', tests, cond: mkCond(['x', 'y']), fillAlpha: item.fillOpacity === undefined ? 0.26 : item.fillOpacity }));
  }

  function varIsSlider(name) {
    for (const r of recs.values()) if (r.def && r.def.type === 'var' && r.def.name === name) return r.isSlider;
    return false;
  }
  function findVarRec(name) {
    for (const r of recs.values()) if (r.def && r.def.type === 'var' && r.def.name === name) return r;
    return null;
  }

  function dragPoint(item, nodes, x, y, z) {
    const vals = [x, y, z];
    const texts = nodes.map((n, i) => {
      if (n.t === 'var') { const r = findVarRec(n.n); if (r) { setSliderValue(r.item, vals[i], true); } return n.n; }
      return fmt(vals[i], 8);
    });
    item.text = `(${texts.join(', ')})`;
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
      const isPlot = hasPlot(item.id);
      row.dot.classList.toggle('none', !isPlot);
      row.dot.classList.toggle('off', isHidden(item) && isPlot);
      row.dot.style.setProperty('--c', item.color);
      row.dot.disabled = !isPlot;
      row.el.classList.toggle('is-slider', !!rec.isSlider);
      if (rec.isSlider) syncSliderUI(rec);
    } else if (item.type === 'table') {
      row.dot.style.setProperty('--c', item.color);
      row.dot.classList.toggle('off', isHidden(item));
    } else if (item.type === 'image') {
      row.dot.style.setProperty('--c', '#7a7a7a'); row.dot.classList.toggle('off', isHidden(item));
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
    if (!rec.err && rec.kind === 'action') html += `<div><button class="chip" data-run>▶ Run</button><button class="chip" data-tick>${tickers.has(item.id) ? '■ Stop ticker' : '⏱ Ticker'}</button></div>`;
    if (!rec.err && THREE_D.has(rec.kind) && state.settings.mode !== '3d') html += '<div class="hint3">3D object — press the 3D button to view it</div>';
    if (!rec.err && !THREE_D.has(rec.kind) && state.settings.mode === '3d' && ['fx', 'fy', 'polar', 'param', 'implicit', 'ineq', 'point', 'points', 'domain', 'stat', 'fn'].includes(rec.kind)) html += '<div class="hint3">2D object — press the 2D button to view it</div>';
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
        // load the stored text once the element is ready — but never overwrite what the user has already typed
        mf.addEventListener('input', () => { row.touched = true; });
        if (item.text) setTimeout(() => { if (!row.touched) row.ed.set(item.text); }, 0);
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
    } else if (item.type === 'image') {
      buildImage(item, row, main);
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
    e.addEventListener('click', (ev) => {
      // clicking anywhere in a row (not on a control) puts the cursor in it, like Desmos
      if (ev.target.closest('button, input, textarea, select, a, math-field, .slider, .chip, .tbl, .imgbox, .acts')) return;
      if (row.ed) row.ed.focus(true);
    });
    e.addEventListener('mouseenter', () => { if (graph && graph.highlightId !== item.id) { graph.highlightId = item.id; graph.requestDraw(false); } });
    e.addEventListener('mouseleave', () => { if (graph && graph.highlightId === item.id) { graph.highlightId = null; graph.requestDraw(false); } });
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
    row.inp.addEventListener('paste', (ev) => {
      const txt = (ev.clipboardData && ev.clipboardData.getData('text')) || '';
      const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) return;
      ev.preventDefault(); if (ed.kind === 'math') ev.stopPropagation();
      ed.set(lines[0]); item.text = lines[0]; updatePretty(row);
      let after = item.id;
      for (const line of lines.slice(1)) { const ni = addItem('expr', after, line); after = ni.id; }
      toast(`Pasted ${lines.length} expressions`);
    }, ed.kind === 'math');
    row.msg.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-run]')) { runAction(item); return; }
      if (ev.target.closest('[data-tick]')) { toggleTicker(item); return; }
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
  const animDir = new Map();
  function startAnim() {
    if (animOn) return; animOn = true; lastTs = performance.now();
    const tick = (ts) => {
      if (!playing.size) { animOn = false; return; }
      const dt = Math.min(0.1, (ts - lastTs) / 1000); lastTs = ts;
      for (const id of [...playing]) {
        const rec = recs.get(id); if (!rec || !rec.isSlider) { playing.delete(id); continue; }
        const sl = rec.item.slider, span = sl.max - sl.min;
        const mode = sl.mode || 'loop'; let dir = animDir.get(id) || 1;
        let v = V[rec.def.name] + dir * dt * span / (8 / (sl.speed || 1));
        if (mode === 'bounce') { if (v > sl.max) { v = 2 * sl.max - v; dir = -1; } else if (v < sl.min) { v = 2 * sl.min - v; dir = 1; } }
        else if (mode === 'once') { if (v >= sl.max) { v = sl.max; playing.delete(id); } }
        else if (v > sl.max) v = sl.min + ((v - sl.min) % span);
        animDir.set(id, dir);
        setSliderValue(rec.item, Math.round(v * 1e5) / 1e5, true);
        if (!playing.has(id)) syncSliderUI(rec);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function buildTable(item, row, main) {
    main.innerHTML = '<div class="tblwrap"><table class="tbl"><thead><tr></tr></thead><tbody></tbody></table></div><div class="tblopts"><label><input type="checkbox" class="tl"> connect with line</label><button class="ghost addcol" title="Add a column">+ column</button></div><div class="msg"></div>';
    const tbl = $('.tbl', main), head = $('thead tr', tbl), body = $('tbody', tbl);
    row.msg = $('.msg', main);
    const cols = () => tableCols(item);
    const chk = $('.tl', main); chk.checked = !!item.showLine;
    chk.addEventListener('change', () => { item.showLine = chk.checked; evaluate(); commitSoon(); saveSoon(); });
    $('.addcol', main).addEventListener('click', () => {
      let name, k = cols().length - 1;
      do { name = `y_{${item.tno}.${k}}`; k++; } while (cols().includes(name));
      cols().push(name); item.rows.forEach((r) => r.push(''));
      renderHead(); render(); evaluate(); commitSoon(); saveSoon();
    });
    const renderHead = () => {
      head.innerHTML = '';
      cols().forEach((name, ci) => {
        const th = el('th'); const inp = el('input', 'colname'); inp.value = name; inp.spellcheck = false; inp.setAttribute('aria-label', `column ${ci + 1} name`);
        const chkName = () => inp.classList.toggle('bad', !VALID_NAME.test(inp.value.trim()) || cols().some((n2, k) => k !== ci && n2 === inp.value.trim()));
        chkName();
        inp.addEventListener('change', () => { const v = inp.value.trim(); if (VALID_NAME.test(v) && !cols().some((n2, k) => k !== ci && n2 === v)) { cols()[ci] = v; evaluate(); commitSoon(); saveSoon(); } else { inp.value = cols()[ci]; chkName(); } });
        inp.addEventListener('input', chkName);
        th.appendChild(inp);
        if (ci >= 2) { const x = el('button', 'colx', '×'); x.title = 'Remove column'; x.addEventListener('click', () => { cols().splice(ci, 1); item.rows.forEach((r) => r.splice(ci, 1)); renderHead(); render(); evaluate(); commitSoon(); saveSoon(); }); th.appendChild(x); }
        head.appendChild(th);
      });
    };
    const render = () => {
      body.innerHTML = '';
      item.rows.forEach((r, ri) => {
        const tr = el('tr');
        cols().forEach((_, ci) => {
          if (r[ci] === undefined) r[ci] = '';
          const td = el('td'); const inp = el('input'); inp.value = r[ci]; inp.spellcheck = false; inp.setAttribute('aria-label', `row ${ri + 1} column ${ci + 1}`);
          const chkBad = () => inp.classList.toggle('bad', !!inp.value.trim() && !Number.isFinite(evalNumberText(inp.value)));
          chkBad();
          inp.addEventListener('input', () => {
            r[ci] = inp.value; chkBad();
            if (ri === item.rows.length - 1 && r.some((c) => c)) { item.rows.push(cols().map(() => '')); render(); const ni = body.querySelectorAll('tr')[ri].querySelectorAll('input')[ci]; if (ni) { ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); } }
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
    renderHead(); render();
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
    state.items.splice(i, 1); playing.delete(id); stopTicker(id);
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
    return JSON.stringify({ items: state.items.map((i) => (i.type === 'image' ? Object.assign({}, i, { src: '' }) : i)), colorIdx: state.colorIdx, tableCount: state.tableCount || 0, deg: state.settings.deg });
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
    state.items = d.items; state.items.forEach((i) => { if (i.type === 'image' && !i.src) i.src = imageData.get(i.id) || ''; }); state.colorIdx = d.colorIdx; state.tableCount = d.tableCount; state.settings.deg = !!d.deg;
    playing.clear(); renderList(); evaluate(); saveSoon();
  }
  function undo() { clearTimeout(commitTimer); const s = snapshot(); if (hist[hIdx] !== s) { hist = hist.slice(0, hIdx + 1); hist.push(s); hIdx++; } if (hIdx > 0) { hIdx--; restore(hist[hIdx]); updateUndo(); } }
  function redo() { if (hIdx < hist.length - 1) { hIdx++; restore(hist[hIdx]); updateUndo(); } }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const r = graph.range();
        localStorage.setItem(STORE_KEY, JSON.stringify({ items: state.items, settings: state.settings, colorIdx: state.colorIdx, tableCount: state.tableCount || 0, view: [r.xmin, r.xmax, r.ymin, r.ymax], nextId, geo: geo ? geo.toJSON() : null }));
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
      state = { items: d.items, settings: Object.assign(defaultSettings(), d.settings || {}), colorIdx: d.colorIdx || 0, tableCount: d.tableCount || 0, view: d.view || null, geo: d.geo || null };
      nextId = Math.max(d.nextId || 1, ...state.items.map((i) => i.id + 1));
      return true;
    } catch (e) { return false; }
  }
  function shareLink() {
    const payload = JSON.stringify({ geo: geo.toJSON(), items: state.items.map((i) => (i.type === 'image' ? Object.assign({}, i, { src: '' }) : i)), settings: state.settings, colorIdx: state.colorIdx, tableCount: state.tableCount || 0, view: (() => { const r = graph.range(); return [r.xmin, r.xmax, r.ymin, r.ymax]; })() });
    const bytes = new TextEncoder().encode(payload);
    let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.href.split('#')[0] + '#g=' + b64;
  }

  /* ================= popovers & menus ================= */
  function closePopovers() { $('#modeMenu').hidden = true; $('#pop').hidden = true; $('#gset').hidden = true; $('#mainMenu').hidden = true; $('#addMenu').hidden = true; }
  // keep a dropdown fully on screen: open towards the side with more room and scroll inside it
  function fitMenu(menu, anchor) {
    menu.classList.remove('up'); menu.style.maxHeight = '';
    const a = anchor.getBoundingClientRect(), below = innerHeight - a.bottom - 10, above = a.top - 10;
    if (below < 320 && above > below) { menu.classList.add('up'); menu.style.maxHeight = Math.max(160, above) + 'px'; }
    else menu.style.maxHeight = Math.max(160, below) + 'px';
    menu.scrollTop = 0;
  }
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
      html += `<div class="sec"><h4>Color</h4><div class="sw">${PALETTE.map((c) => `<button data-c="${c}" style="background:${c}" class="${c === item.color ? 'on' : ''}" aria-label="${c}"></button>`).join('')}</div></div>
      <div class="sec"><h4>Line</h4><div class="seg" data-seg="line"><button data-v="solid" class="${item.line === 'solid' ? 'on' : ''}">Solid</button><button data-v="dashed" class="${item.line === 'dashed' ? 'on' : ''}">Dashed</button><button data-v="dotted" class="${item.line === 'dotted' ? 'on' : ''}">Dotted</button></div>
      <label>Thickness <input type="range" min="1" max="8" step="0.5" value="${item.width}" data-width></label></div>`;
    }
    if (isSlider) {
      const sl = item.slider;
      html += `<div class="sec"><h4>Slider</h4><div class="range2"><label>Min<input type="text" data-s="min" value="${fmt(sl.min, 6)}"></label><label>Max<input type="text" data-s="max" value="${fmt(sl.max, 6)}"></label></div>
      <label>Step <input type="text" data-s="step" value="${sl.step}"></label>
      <label>Mode <span class="seg" data-seg="mode">${[['loop', 'Loop'], ['bounce', 'Bounce'], ['once', 'Once']].map(([v, t]) => `<button data-v="${v}" class="${(sl.mode || 'loop') === v ? 'on' : ''}">${t}</button>`).join('')}</span></label>
      <label>Speed <span class="seg" data-seg="speed">${[0.25, 0.5, 1, 2, 4].map((s) => `<button data-v="${s}" class="${(sl.speed || 1) === s ? 'on' : ''}">${s}×</button>`).join('')}</span></label></div>`;
    }
    const pk = rec && ['point', 'points'].includes(rec.kind) || (item.type === 'table');
    if (showStyle && rec && ['fx', 'fy', 'polar', 'param', 'implicit', 'ineq', 'fn', 'point', 'points', 'regression', 'stat'].includes(rec.kind) || item.type === 'table') {
      html += `<div class="sec"><h4>Opacity</h4><label>Line / point <input type="range" min="0.1" max="1" step="0.05" value="${item.opacity === undefined ? 1 : item.opacity}" data-op></label>`;
      if (rec && rec.kind === 'ineq') html += `<label>Fill <input type="range" min="0" max="0.9" step="0.02" value="${item.fillOpacity === undefined ? 0.26 : item.fillOpacity}" data-fillop></label>`;
      html += '</div>';
    }
    if (pk) html += `<div class="sec"><h4>Point style</h4><div class="seg" data-seg="pstyle">${[['dot', 'Point'], ['open', 'Open'], ['cross', 'Cross']].map(([v, t]) => `<button data-v="${v}" class="${(item.pointStyle || 'dot') === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
    if (rec && rec.kind === 'point') {
      html += `<div class="sec"><h4>Dragging</h4><div class="seg" data-seg="dragmode">${[['both', 'Free'], ['x', 'X only'], ['y', 'Y only'], ['none', 'Fixed']].map(([v, t]) => `<button data-v="${v}" class="${(item.dragMode || 'both') === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
      html += `<div class="sec"><h4>Label</h4><label>Show label <input type="checkbox" data-showlabel ${item.showLabel ? 'checked' : ''}></label><label>Text <input type="text" data-label value="${esc(item.label || '')}" placeholder="coordinates"></label>
        <label>Position <select data-lpos>${[['above-right', 'Auto'], ['above', 'Above'], ['below', 'Below'], ['left', 'Left'], ['right', 'Right']].map(([v, t]) => `<option value="${v}" ${(item.labelPos || 'above-right') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Size <select data-lsize>${[[11, 'Small'], [13, 'Medium'], [17, 'Large']].map(([v, t]) => `<option value="${v}" ${(item.labelSize || 13) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>`;
    }
    if (rec && rec.kind === 'action') html += `<div class="sec"><h4>Ticker</h4><label>Interval (ms) <input type="number" min="16" step="10" data-tickms value="${item.tickMs || 200}"></label></div>`;
    if (rec && rec.isIneq3) html += `<div class="sec"><h4>3D region</h4><label>Volume shading <input type="checkbox" data-vol ${item.noVolume ? '' : 'checked'}></label></div>`;
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
    pop.querySelectorAll('[data-seg="mode"] button').forEach((b) => b.onclick = () => { item.slider.mode = b.dataset.v; pop.querySelectorAll('[data-seg="mode"] button').forEach((x) => x.classList.toggle('on', x === b)); saveSoon(); });
    const opr = pop.querySelector('[data-op]'); if (opr) opr.oninput = () => { item.opacity = parseFloat(opr.value); redraw(); };
    const fop = pop.querySelector('[data-fillop]'); if (fop) fop.oninput = () => { item.fillOpacity = parseFloat(fop.value); redraw(); };
    pop.querySelectorAll('[data-seg="pstyle"] button').forEach((b) => b.onclick = () => { item.pointStyle = b.dataset.v; pop.querySelectorAll('[data-seg="pstyle"] button').forEach((x) => x.classList.toggle('on', x === b)); redraw(); });
    pop.querySelectorAll('[data-seg="dragmode"] button').forEach((b) => b.onclick = () => { item.dragMode = b.dataset.v; pop.querySelectorAll('[data-seg="dragmode"] button').forEach((x) => x.classList.toggle('on', x === b)); redraw(); });
    const lps = pop.querySelector('[data-lpos]'); if (lps) lps.onchange = () => { item.labelPos = lps.value; redraw(); };
    const lsz = pop.querySelector('[data-lsize]'); if (lsz) lsz.onchange = () => { item.labelSize = parseInt(lsz.value, 10); redraw(); };
    const sl1 = pop.querySelector('[data-showlabel]'); if (sl1) sl1.onchange = () => { item.showLabel = sl1.checked; redraw(); };
    const sl2 = pop.querySelector('[data-label]'); if (sl2) sl2.oninput = () => { item.label = sl2.value; if (item.showLabel) redraw(); };
    const tk = pop.querySelector('[data-tickms]'); if (tk) tk.onchange = () => { item.tickMs = Math.max(16, parseInt(tk.value, 10) || 200); if (tickers.has(item.id)) { stopTicker(item.id); toggleTicker(item); } saveSoon(); };
    const vol = pop.querySelector('[data-vol]'); if (vol) vol.onchange = () => { item.noVolume = !vol.checked; redraw(); };
    const lc = pop.querySelector('[data-line]'); if (lc) lc.onchange = () => { item.showLine = lc.checked; redraw(); };
    pop.querySelector('[data-act="del"]').onclick = () => deleteItem(item.id);
    pop.querySelector('[data-act="dup"]').onclick = () => { closePopovers(); duplicateItem(item.id); };
  }

  function openGraphSettings() {
    const pop = $('#gset');
    if (!pop.hidden) { pop.hidden = true; return; }
    const r = graph.range(), S = state.settings, is3 = S.mode === '3d';
    const f = (v) => parseFloat(v.toPrecision(6));
    const bx = S.box || [-5, 5, -5, 5, -5, 5];
    const windowHtml = is3 ? `<div class="sec"><h4>3D box</h4><div class="range2">
        ${['x', 'y', 'z'].map((a, k) => `<label>${a} min<input type="number" step="any" data-b="${k * 2}" value="${f(bx[k * 2])}"></label><label>${a} max<input type="number" step="any" data-b="${k * 2 + 1}" value="${f(bx[k * 2 + 1])}"></label>`).join('')}</div>
        <label>Auto-rotate <input type="checkbox" data-spin ${graph3.settings.spin ? 'checked' : ''}></label></div>
      <div class="sec"><h4>Lighting</h4><div class="seg" data-seg="lmode"><button data-v="head" class="${(S.light || {}).mode === 'fixed' ? '' : 'on'}">Headlight</button><button data-v="fixed" class="${(S.light || {}).mode === 'fixed' ? 'on' : ''}">Fixed light</button></div>
        <label>Direction <input type="range" min="0" max="360" step="1" data-l="az" value="${(S.light || {}).az ?? 40}"></label>
        <label>Height <input type="range" min="5" max="90" step="1" data-l="el" value="${(S.light || {}).el ?? 55}"></label>
        <label>Shadows on the floor <input type="checkbox" data-l="shadows" ${(S.light || {}).shadows ? 'checked' : ''}></label></div>
      <div class="sec"><h4>Cross-section</h4><label>Cut with a plane <input type="checkbox" data-s="on" ${(S.section || {}).on ? 'checked' : ''}></label>
        <div class="seg" data-seg="saxis">${['x', 'y', 'z'].map((a, k) => `<button data-v="${k}" class="${((S.section || {}).axis ?? 2) === k ? 'on' : ''}">${a}</button>`).join('')}</div>
        <label>Position <input type="range" data-s="pos" min="${bx[((S.section || {}).axis ?? 2) * 2]}" max="${bx[((S.section || {}).axis ?? 2) * 2 + 1]}" step="any" value="${(S.section || {}).pos ?? 0}"></label>
        <label>Keep the other side <input type="checkbox" data-s="flip" ${(S.section || {}).flip ? 'checked' : ''}></label></div>` : '';
    pop.innerHTML = `${windowHtml}
      <div class="sec"${is3 ? ' hidden' : ''}><h4>Window</h4><div class="range2">
        <label>X min<input type="number" step="any" data-r="xmin" value="${f(r.xmin)}"></label><label>X max<input type="number" step="any" data-r="xmax" value="${f(r.xmax)}"></label>
        <label>Y min<input type="number" step="any" data-r="ymin" value="${f(r.ymin)}"></label><label>Y max<input type="number" step="any" data-r="ymax" value="${f(r.ymax)}"></label></div></div>
      <div class="sec"><h4>Grid</h4>
        <label>Major gridlines <input type="checkbox" data-t="grid" ${S.grid ? 'checked' : ''}></label>
        <label>Minor gridlines <input type="checkbox" data-t="minor" ${S.minor ? 'checked' : ''}></label>
        <label>Axis numbers <input type="checkbox" data-t="numbers" ${S.numbers ? 'checked' : ''}></label>
        <label>X-axis in multiples of π <input type="checkbox" data-t="piX" ${S.piX ? 'checked' : ''}></label>
        <div class="seg" data-seg="gridtype">${[['cartesian', 'Cartesian'], ['polar', 'Polar'], ['none', 'None']].map(([v, t]) => `<button data-v="${v}" class="${(S.gridType || 'cartesian') === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="sec"${is3 ? ' hidden' : ''}><h4>Axes</h4>
        <label>Show x-axis <input type="checkbox" data-t="showAxisX" ${S.showAxisX !== false ? 'checked' : ''}></label>
        <label>Show y-axis <input type="checkbox" data-t="showAxisY" ${S.showAxisY !== false ? 'checked' : ''}></label>
        <label>Arrows <input type="checkbox" data-t="arrows" ${S.arrows ? 'checked' : ''}></label>
        <label>x label <input type="text" data-txt="axisLabelX" value="${esc(S.axisLabelX || '')}" placeholder="x"></label>
        <label>y label <input type="text" data-txt="axisLabelY" value="${esc(S.axisLabelY || '')}" placeholder="y"></label>
        <label>Lock viewport <input type="checkbox" data-t="lock" ${S.lock ? 'checked' : ''}></label>
        <label>Cursor coordinates <input type="checkbox" data-t="cursor" ${S.cursor !== false ? 'checked' : ''}></label></div>
      <div class="sec"><h4>Formula editor</h4><div class="seg" data-seg="editor"><button data-v="live" class="${S.editor === 'text' ? '' : 'on'}"${window.__mlOK ? '' : ' disabled title="Unavailable offline"'}>Live (typeset)</button><button data-v="text" class="${S.editor === 'text' ? 'on' : ''}">Plain text</button></div></div>
      <div class="sec"><h4>Angle unit</h4><div class="seg" data-seg="ang"><button data-v="rad" class="${S.deg ? '' : 'on'}">Radians</button><button data-v="deg" class="${S.deg ? 'on' : ''}">Degrees</button></div></div>
      <div class="sec"><h4>Theme</h4><div class="seg" data-seg="theme"><button data-v="light" class="${S.theme === 'light' ? 'on' : ''}">Light</button><button data-v="dark" class="${S.theme === 'dark' ? 'on' : ''}">Dark</button></div></div>`;
    place(pop, $('#btnSettings'));
    pop.querySelectorAll('[data-seg="lmode"] button').forEach((b) => b.onclick = () => { S.light = Object.assign({}, S.light, { mode: b.dataset.v }); pop.querySelectorAll('[data-seg="lmode"] button').forEach((x) => x.classList.toggle('on', x === b)); graph3.setLight(S.light); saveSoon(); });
    pop.querySelectorAll('[data-l]').forEach((inp) => inp.oninput = () => { const k = inp.dataset.l; S.light = Object.assign({}, S.light, { [k]: inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value) }); graph3.setLight(S.light); saveSoon(); });
    const secSet = (patch) => { S.section = Object.assign({}, S.section, patch); graph3.setSection(S.section); saveSoon(); };
    pop.querySelectorAll('[data-s]').forEach((inp) => inp.oninput = () => { const k = inp.dataset.s; secSet({ [k]: inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value) }); });
    pop.querySelectorAll('[data-seg="saxis"] button').forEach((b) => b.onclick = () => {
      const ax = +b.dataset.v, box = S.box || [-5, 5, -5, 5, -5, 5], sl = pop.querySelector('[data-s="pos"]');
      pop.querySelectorAll('[data-seg="saxis"] button').forEach((x) => x.classList.toggle('on', x === b));
      sl.min = box[ax * 2]; sl.max = box[ax * 2 + 1]; const mid = (box[ax * 2] + box[ax * 2 + 1]) / 2; sl.value = mid;
      secSet({ axis: ax, pos: mid });
    });
    pop.querySelectorAll('[data-b]').forEach((inp) => inp.onchange = () => {
      const nb = [0, 1, 2, 3, 4, 5].map((k) => parseFloat(pop.querySelector(`[data-b="${k}"]`).value));
      if (nb.every(Number.isFinite) && nb[1] > nb[0] && nb[3] > nb[2] && nb[5] > nb[4]) { S.box = nb; graph3.setBox(nb); saveSoon(); }
    });
    const spin = pop.querySelector('[data-spin]'); if (spin) spin.onchange = () => graph3.setSpin(spin.checked);
    pop.querySelectorAll('[data-r]').forEach((inp) => inp.onchange = () => {
      const g = (k) => parseFloat(pop.querySelector(`[data-r="${k}"]`).value);
      const a = g('xmin'), b = g('xmax'), c = g('ymin'), d = g('ymax');
      if ([a, b, c, d].every(Number.isFinite) && b > a && d > c) graph.setRange(a, b, c, d);
    });
    pop.querySelectorAll('[data-t]').forEach((inp) => inp.onchange = () => { S[inp.dataset.t] = inp.checked; applySettings(); saveSoon(); });
    pop.querySelectorAll('[data-txt]').forEach((inp) => inp.oninput = () => { S[inp.dataset.txt] = inp.value; applySettings(); saveSoon(); });
    pop.querySelectorAll('[data-seg="gridtype"] button').forEach((b) => b.onclick = () => { S.gridType = b.dataset.v; pop.querySelectorAll('[data-seg="gridtype"] button').forEach((x) => x.classList.toggle('on', x === b)); applySettings(); saveSoon(); });
    pop.querySelectorAll('[data-seg="ang"] button').forEach((b) => b.onclick = () => { S.deg = b.dataset.v === 'deg'; pop.querySelectorAll('[data-seg="ang"] button').forEach((x) => x.classList.toggle('on', x === b)); evaluate(); commitSoon(); saveSoon(); });
    pop.querySelectorAll('[data-seg="editor"] button').forEach((b) => b.onclick = () => { if (b.disabled) return; S.editor = b.dataset.v; pop.hidden = true; renderList(); evaluate(); saveSoon(); });
    pop.querySelectorAll('[data-seg="theme"] button').forEach((b) => b.onclick = () => { S.theme = b.dataset.v; pop.querySelectorAll('[data-seg="theme"] button').forEach((x) => x.classList.toggle('on', x === b)); applySettings(); evaluate(); saveSoon(); });
  }

  function applySettings() {
    const S = state.settings;
    document.documentElement.dataset.theme = S.theme;
    const isGeo = S.app === 'geometry';
    Object.assign(graph.settings, { grid: S.grid, minor: S.minor, numbers: S.numbers && !isGeo, piX: S.piX, axes: !isGeo, gridType: S.gridType, showAxisX: S.showAxisX, showAxisY: S.showAxisY, arrows: S.arrows, axisLabelX: S.axisLabelX, axisLabelY: S.axisLabelY });
    graph.locked = !!S.lock && !isGeo;
    const cd = $('#coords'); if (cd) cd.dataset.off = S.cursor === false ? '1' : '';
    graph.refreshTheme();
    graph.requestDraw(false);
    Object.assign(graph3.settings, { grid: S.grid, numbers: S.numbers });
    graph3.refreshTheme(); graph3.setBox(S.box || [-5, 5, -5, 5, -5, 5]);
    graph3.setLight(S.light || {}); graph3.setSection(S.section || {});
    graph3.requestDraw(false);
  }
  function setMode(m) {
    state.settings.mode = m;
    const is3 = m === '3d';
    $('#graphHost').style.display = is3 ? 'none' : '';
    $('#graph3Host').style.display = is3 ? 'block' : 'none';
    $('#coords').style.display = is3 ? 'none' : ''; $('#tip').style.display = 'none';
    if (is3) $('#curvebar').hidden = true;
    else { const p = graph.plots.find((q) => q.id === graph.selectedId); $('#curvebar').hidden = !(p && p.kind === 'fx'); }
    $('#btnFit').style.display = is3 ? 'none' : ''; $('#btnSquare').style.display = is3 ? 'none' : '';
    const b = $('#btn3d'); b.textContent = is3 ? '2D' : '3D'; b.title = is3 ? 'Back to the 2D graph' : 'Switch to the 3D graph'; b.classList.toggle('on', is3);
    if (is3) { graph3.resize(); graph3.requestDraw(false); } else { graph.resize(); graph.requestDraw(false); }
    applyPlane(); updateAllRows(); saveSoon();
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
    ['Domain colouring', [{ __view: [-3, 3, -2.25, 2.25] }, { type: 'note', text: 'Hue = argument of f(z), brightness bands = log |f(z)|. Zeros are where all colours meet.' }, '(z^2-1)/(z^2+1)']],
    ['3D surface', [{ __mode: '3d' }, 'a=1', 'z=a*sin(x)*cos(y)', 'z=x^2/10+y^2/10-4']],
    ['3D inequality (volume shading)', [{ __mode: '3d' }, 'z<4-x^2/4-y^2/4', 'x^2+y^2+z^2<=9']],
    ['Tangent plane to a torus', [{ __mode: '3d' }, '((3+cos(v))cos(u), (3+cos(v))sin(u), sin(v)){0<=u<=2pi, 0<=v<=2pi}', { type: 'note', text: 'Click the torus: a tangent plane is placed at that point (bottom bar). Works for z=f(x,y), parametric and implicit surfaces.' }]],
    ['Tangent plane to a sphere', [{ __mode: '3d' }, 'x^2+y^2+z^2=9', { type: 'note', text: 'Click the sphere to place a tangent plane.' }]],
    ['Geometry: reflection, ellipse, area', [{ __app: 'geometry' }]],
    ['Geometry: locus of a midpoint', [{ __app: 'geometry', demo: 'locus' }]],
    ['Geometry: conic intersections', [{ __app: 'geometry', demo: 'conics' }]],
    ['3D lighting & shadows', [{ __mode: '3d' }, { __light: { mode: 'fixed', az: 215, el: 40, shadows: true } }, { __box: [-4, 4, -4, 4, 0, 4] }, 'x^2+y^2+(z-2.2)^2=1.6', 'z=2.8-(x-1.5)^2/4-(y+1)^2/4{(x-1.5)^2+(y+1)^2<=3}']],
    ['3D cross-section of a solid', [{ __mode: '3d' }, { __section: { on: true, axis: 1, pos: 0, flip: false } }, 'x^2+y^2+z^2=9', 'z<2-x^2/4-y^2/4']],
    ['3D curve & points', [{ __mode: '3d' }, '(2cos(t), 2sin(t), t/2){-6<=t<=6}', '(0,0,0)', '(2,0,0)']],
    ['3D parametric surface (torus)', [{ __mode: '3d' }, '((3+cos(v))cos(u), (3+cos(v))sin(u), sin(v)){0<=u<=2pi, 0<=v<=2pi}']],
    ['3D implicit surface (sphere)', [{ __mode: '3d' }, 'x^2+y^2+z^2=9']],
    ['Actions & ticker', ['n=0', 'n -> n+1', 'n -> 0', '(n, n^2/10)', { type: 'note', text: 'Press Run, or Ticker to repeat the action automatically. Gear → Ticker interval.' }]],
    ['Logistic regression', [{ type: 'table', rows: [['-6', '0.04'], ['-4', '0.12'], ['-2', '0.55'], ['-1', '1.2'], ['0', '2.1'], ['1', '3.0'], ['2', '3.9'], ['4', '4.6'], ['6', '4.9'], ['', '']] }, 'y_1 ~ L/(1+e^(-k(x_1-m)))']],
    ['Bar plot & statistics', ['V=[3,5,2,6,4]', 'barplot(V)', 'mean(V)', 'mode([1,2,2,3])', 'percentile([1...11],0.9)', 'cumsum(V)']],
    ['Histogram / box plot / dot plot', ['L=[2,3,3,4,4,4,5,5,6,8,9]', 'histogram(L,1)', 'boxplot(L)', 'dotplot(L)']],
    ['List comprehension', ['P=[(n, n^2/5) for n=[-5...5]]', 'S=[n^2 for n=[1...6]]', 'total(S)']],
    ['Distribution objects', ['D=normaldist(0,1)', 'y=D.pdf(x)', 'D.cdf(1.96)', 'D.inversecdf(0.975)', 'T=tdist(4)', 'y=T.pdf(x)', 'B=binomialdist(10,0.4)', 'B.mean', 'B.pdf(4)']],
    ['Points, polygon & .x/.y', ['P=(1,2)', 'P.x+P.y', 'Q=[(1,1),(3,1),(2,3)]', 'Q.x', 'polygon(Q)', 'distance((1,1),(3,1))', 'midpoint((1,1),(3,1))']],
    ['Derivative operator', ['f(x)=x^3-3x', 'y=f(x)', 'y=ddx(f(x))', 'y=f\'\'(x)']],
    ['Slider with a domain', ['a=2 {0<=a<=5}', 'y=a x^2', { type: 'note', text: 'The restriction on a=… limits the slider range (0 to 5 here).' }]],
    ['3D spherical & cylindrical', [{ __mode: '3d' }, 'rho=2+0.5*sin(5*theta)*sin(3*phi)', 'r=1+0.35*sin(3*z)']],
    ['Folders', [{ type: 'folder', text: 'Circle' }, 'x^2+y^2=4', '(0,0)', { type: 'folder', text: 'Parabola' }, 'y=x^2-2', 'y=-x^2+2']],
    ['Random & distributions', ['y=normpdf(x)', 'y=normpdf(x,1.5,0.6)', 'normcdf(1.96)', 'binompdf(10,0.5,5)', 'invnorm(0.975)', 'R=random(6)', 'shuffle([1...6])']],
    ['Many curves from a list', ['L=[1...5]', 'y=L sin(x)/2']],
    ['Residuals', [{ type: 'table', rows: [['1', '2.1'], ['2', '3.9'], ['3', '6.2'], ['4', '7.8'], ['5', '10.1'], ['', '']] }, 'y_1 ~ m x_1 + b', '(x_1, e_1)']],
    ['Draggable points', ['(1,2)', '(3,-1)', 'y=m x+c', 'm=0.5', 'c=1']],
    ['Lists & statistics', ['L=[1...10]', 'M=L^2', '(L,M)', 'mean(M)', 'median(M)', 'stdev(M)', 'sort([5,3,9,1])', 'L[L>6]', 'total(L)']],
    ['Regression from a table', [{ type: 'table', rows: [['1', '2.1'], ['2', '3.9'], ['3', '6.2'], ['4', '7.8'], ['5', '10.1'], ['6', '12.2'], ['', '']] }, 'y_1 ~ m x_1 + b']],
    ['Quadratic regression', [{ type: 'table', rows: [['-3', '10'], ['-2', '4.5'], ['-1', '1.2'], ['0', '-0.5'], ['1', '1.1'], ['2', '4.2'], ['3', '9.8'], ['', '']] }, 'y_1 ~ a x_1^2 + b x_1 + c']],
  ];
  function loadGeoDemo(demo) {
    const d = { objects: [], nextId: 1 };
    const add = (o) => { o.id = d.nextId++; d.objects.push(o); return o.id; };
    const pt = (x, y, name) => add({ t: 'pt', x, y, name });
    if (demo === 'locus') {
      const O = pt(0, 0, 'O'), Rr = pt(2, 0, 'R'), circ = add({ t: 'circ', c: O, p: Rr });
      const Pn = add({ t: 'onp', obj: circ, s: 0.9, name: 'P' }), A = pt(5, 1, 'A'), M = add({ t: 'mid', a: A, b: Pn, name: 'M' });
      add({ t: 'locus', drv: Pn, tr: M });
      geo.load(d); geo.setTool('move'); saveSoon(); graph.setRange(-8, 12, -7, 8); return;
    }
    if (demo === 'conics') {
      const F = pt(-3, 0, 'F'), G = pt(3, 0, 'G'), Q = pt(0, 4, 'Q'), ell = add({ t: 'ell', f1: F, f2: G, p: Q });
      const O = pt(0, 0, 'O'), R2 = pt(4.5, 0, 'R'), circ = add({ t: 'circ', c: O, p: R2 });
      const L1 = pt(-5, -4, 'U'), L2 = pt(5, 4, 'V'), line = add({ t: 'line', a: L1, b: L2 });
      for (let k = 0; k < 4; k++) add({ t: 'int', a: circ, b: ell, k, name: 'IJKL'[k] });
      for (let k = 0; k < 2; k++) add({ t: 'int', a: line, b: ell, k, name: 'ST'[k] });
      geo.load(d); geo.setTool('move'); saveSoon(); graph.setRange(-10, 10, -6, 9); return;
    }
    // a ready-made construction: triangle, its reflection, an ellipse and an area measurement
    const A = pt(-4, -1, 'A'), B = pt(-1, -1, 'B'), C = pt(-3, 1.5, 'C');
    add({ t: 'poly', pts: [A, B, C] });
    const m1 = pt(-2, -3, 'M'), m2 = pt(3, -3, 'N');
    const mirror = add({ t: 'line', a: m1, b: m2 });
    const img = (id, nm) => add({ t: 'tpt', src: id, op: 'reflect', l: mirror, name: nm });
    const A2 = img(A, "A'"), B2 = img(B, "B'"), C2 = img(C, "C'");
    add({ t: 'poly', pts: [A2, B2, C2] });
    const f1 = pt(4, -1, 'F'), f2 = pt(8, -1, 'G'), q = pt(6, 1.2, 'P');
    add({ t: 'ell', f1, f2, p: q });
    const poly1 = d.objects.find((o) => o.t === 'poly');
    add({ t: 'area', target: poly1.id });
    geo.load(d); geo.setTool('move'); saveSoon();
    graph.setRange(-9, 11, -9, 6);
  }
  function loadExample(texts) {
    state.tableCount = 0;
    const modeEntry = texts.find((t) => typeof t === 'object' && t.__mode);
    const viewEntry = texts.find((t) => typeof t === 'object' && t.__view);
    const appEntry = texts.find((t) => typeof t === 'object' && t.__app);
    if (appEntry) { setApp('geometry'); loadGeoDemo(appEntry.demo); return; }
    const extras = texts.filter((t) => typeof t === 'object' && (t.__light || t.__section || t.__box));
    texts = texts.filter((t) => !(typeof t === 'object' && (t.__mode || t.__view || t.__light || t.__section || t.__box)));
    const S0 = state.settings;
    S0.light = { mode: 'head', az: 40, el: 55, shadows: false }; S0.section = { on: false, axis: 2, pos: 0, flip: false }; S0.box = [-5, 5, -5, 5, -5, 5];
    extras.forEach((e) => { if (e.__light) Object.assign(S0.light, e.__light); if (e.__section) Object.assign(S0.section, e.__section); if (e.__box) S0.box = e.__box.slice(); });
    applySettings();
    let cur = null;
    state.items = texts.map((t) => {
      const it = typeof t === 'string' ? newItem('expr', { text: t }) : newItem(t.type, JSON.parse(JSON.stringify(t)));
      if (it.type === 'folder') cur = it; else if (cur) it.parent = cur.id;
      return it;
    });
    state.items.push(newItem('expr'));
    playing.clear(); graph.setSelected(null); renderList();
    state.settings.mode = '2d'; setMode(modeEntry ? modeEntry.__mode : '2d');
    evaluate(); graph.resetView(); graph3.resetView();
    if (viewEntry) { const v = viewEntry.__view; graph.setRange(v[0], v[1], v[2], v[3]); }
    commitSoon(); saveSoon();
  }

  function buildMainMenu() {
    const m = $('#mainMenu');
    m.innerHTML = `<div class="lbl">Calculator</div>
      <button data-app="graph">Graphing calculator</button><button data-app="geometry">Geometry</button><button data-app="scientific">Scientific calculator</button><button data-app="basic">Four-function calculator</button><button data-app="matrix">Matrix calculator</button><hr>
      <div class="lbl">Graph</div>
      <button data-m="new">New graph</button><button data-m="open">Open file…</button><button data-m="save">Save to file</button>
      <button data-m="png">Export image (PNG)</button><button data-m="link">Copy share link</button><hr>
      <div class="lbl">Examples</div>${EXAMPLES.map((e, i) => `<button data-ex="${i}">${esc(e[0])}</button>`).join('')}<hr>
      <button data-m="keys">Keyboard shortcuts</button><button data-m="print">Print the graph</button>
      <button data-m="help">Help &amp; syntax</button>`;
    m.onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      closePopovers();
      if (b.dataset.app) { setApp(b.dataset.app); return; }
      if (b.dataset.ex !== undefined) { loadExample(EXAMPLES[+b.dataset.ex][1]); return; }
      switch (b.dataset.m) {
        case 'new': if (confirm('Start a new graph? Unsaved work will be cleared.')) { state.items = [newItem('expr')]; playing.clear(); renderList(); evaluate(); graph.resetView(); commitSoon(); saveSoon(); } break;
        case 'open': $('#fileIn').click(); break;
        case 'save': {
          const blob = new Blob([JSON.stringify({ app: 'graphical-calculator', version: 1, items: state.items, settings: state.settings, colorIdx: state.colorIdx, tableCount: state.tableCount || 0, nextId, geo: geo.toJSON() }, null, 2)], { type: 'application/json' });
          download(blob, 'graph.json'); toast('Saved graph.json'); break;
        }
        case 'png': activeGraph().exportPNG((blob) => { download(blob, 'graph.png'); toast('Exported graph.png'); }); break;
        case 'link': copyText(shareLink()).then(() => toast('Share link copied')).catch(() => toast('Could not copy link')); break;
        case 'help': showHelp(); break;
        case 'keys': showShortcuts(); break;
        case 'print': window.print(); break;
        default: break;
      }
    };
  }
  function download(blob, name) { const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function copyText(t) { if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t); return new Promise((res, rej) => { const ta = el('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } ta.remove(); }); }
  let toastT = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }

  function showHelp() {
    const it = newItem('note', { text: 'Syntax cheat-sheet\n• y = x^2, x = y^2, r = 2 sin(3θ)\n• Implicit: x^2 + y^2 = 4   Inequality: y < sin(x), 1 < x < 3\n• Parametric: (cos(t), sin(t)){0<=t<=2π}\n• Points: (1, 2) — drag them!\n• Functions: f(x) = x^2, then f(3) or f\'(x)\n• Sliders: type a new letter (a x) and click “add slider”\n• Restrict a domain: y = x^2 {x > 0}   Piecewise: y = {x<0: -x, x}\n• Lists: L=[1...10], [2,4...20], L^2, L[3], L[L>5], (L, L^2)\n• Stats: mean, median, total, stdev, variance, quartile, corr, cov, sort, join, unique, count\n• Tables make lists x_1, y_1 — fit with  y_1 ~ m x_1 + b  (any model, e.g. a*e^(b x_1))\n• sum(n,1,10,n^2)   int(0,1,x^2)   abs, sqrt, ln, log, nCr, floor …\n• Folders: + → Folder, then drag rows (grip = the number column) to reorder or move into folders\n• random(), random(5), shuffle(L), normpdf/normcdf/invnorm, binompdf/binomcdf, poissonpdf/poissoncdf\n• Residuals after a regression: e_1 → (x_1, e_1)\n• 3D: z = sin(x)cos(y)  ·  (cos t, sin t, t/3)  ·  (x(u,v), y(u,v), z(u,v))  ·  x^2+y^2+z^2=9  ·  (1,2,3)   — drag to rotate, wheel to zoom\n• Domain colouring: type a function of z alone, e.g. (z^2-1)/(z^2+1) or sin(z)\n• Actions: n → n+1 (Run button or Ticker); several with commas: n → n+1, m → 0\n• Stats plots: histogram(L,1), boxplot(L), dotplot(L)   ·   List comprehension: [n^2 for n=[1...5]]\n• Modes (☰ menu): Graphing · Geometry (points, lines, circles, perpendicular/parallel, intersections, polygons, angles, distances) · Scientific calculator\n• 3D: click a surface to place a tangent plane; inequalities like z<4-x^2-y^2 are drawn translucent; drag 3D points (Shift = up/down)\n• Regression fits any model with several restarts: y_1 ~ L/(1+e^(-k(x_1-m)))\n• Points & objects: P.x, P.y (also on lists), distance(P,Q), midpoint(P,Q), polygon(P1,P2,P3) or polygon(L)\n• Distributions: D=normaldist(0,1), tdist(v), binomialdist(n,p), poissondist(l), uniformdist(a,b) → D.pdf(x), D.cdf(x), D.mean, D.stdev, D.random(10), D.inversecdf(p)\n• Derivative operator: ddx(f(x)) or type d/dx f(x) in the live editor. Slider domain: a=2 {0<=a<=5}.  2+2= evaluates.\n• 3D coordinates: rho=2+sin(5θ)sin(3φ) (spherical), r=1+sin(3z) (cylindrical)\n• Images: + → Image (position, size, angle, opacity may use sliders).  Settings: polar grid, axis labels/arrows, lock viewport\n• Zoom Fit / 1:1 buttons, hover a row to highlight its curve, paste many lines to create many rows, 🔊 audio trace on a selected curve\n• Complex numbers: i, 3+4i, abs(z), arg(z), conj(z), e^(i*pi); a complex value plots as a point\n• Click a curve for tangent & secant lines (bar at the bottom), zeros, extrema & intersections' });
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
    .map((n) => [n, n === 'sum' ? 'sum(n,1,10,n)' : n === 'int' ? 'int(0,1,x)' : n + '()', n === 'sum' || n === 'int' ? 0 : 1]).concat([['→', '->', 0]]);
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

  /* ================= view helpers, audio trace, shortcuts ================= */
  function fitView() {
    const pts = [];
    const push = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 1e6 && Math.abs(y) < 1e6) pts.push([x, y]); };
    for (const p of graph.plots) {
      if (p.hidden) continue;
      try {
        switch (p.kind) {
          case 'point': { const q = p.get(); if (q) push(q[0], q[1]); break; }
          case 'points': { const v = p.get(); (Array.isArray(v) ? v : [v]).forEach((q) => { if (q) { if (q.re !== undefined) push(q.re, q.im); else push(q.x, q.y); } }); break; }
          case 'table': p.points.forEach((q) => push(q[0], q[1])); break;
          case 'param': { const rg = p.range ? p.range() : { lo: 0, hi: 1 }, lo = Number.isFinite(rg.lo) ? rg.lo : 0, hi = Number.isFinite(rg.hi) ? rg.hi : 1; for (let i = 0; i <= 160; i++) { const q = p.f(lo + (hi - lo) * i / 160); if (q) push(q[0], q[1]); } break; }
          case 'polar': { const rg = p.range ? p.range() : { lo: 0, hi: 6 * Math.PI }, lo = Number.isFinite(rg.lo) ? rg.lo : 0, hi = Number.isFinite(rg.hi) ? rg.hi : 6 * Math.PI; for (let i = 0; i <= 360; i++) { const th = lo + (hi - lo) * i / 360, r = p.f(th); push(r * Math.cos(th), r * Math.sin(th)); } break; }
          case 'fx': {
            // look for zeros, extrema and the y-intercept near the origin first, then further out
            for (const span of [12, 100]) {
              const N = 2400, xs = [], ys = [], found = [];
              for (let i = 0; i <= N; i++) { const x = -span + 2 * span * i / N, y = p.f(x); xs.push(x); ys.push(Number.isFinite(y) ? y : NaN); }
              for (let i = 1; i < N; i++) {
                const a = ys[i - 1], b = ys[i], c = ys[i + 1];
                if (Number.isFinite(a) && Number.isFinite(b) && a * b < 0) found.push([xs[i - 1] + (xs[i] - xs[i - 1]) * a / (a - b), 0]);
                if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && (b - a) * (c - b) < 0 && Math.abs(b) < 1e4) found.push([xs[i], b]);
              }
              const y0 = p.f(0); if (Number.isFinite(y0)) found.push([0, y0]);
              if (found.length >= 2 || span === 100) { found.forEach((q) => push(q[0], q[1])); if (found.length < 2) { push(-5, p.f(-5)); push(5, p.f(5)); } break; }
            }
            break;
          }
          default: break;
        }
      } catch (e) { /* skip plot */ }
    }
    if (!pts.length) { graph.resetView(); return; }
    let x0 = Math.min(...pts.map((q) => q[0])), x1 = Math.max(...pts.map((q) => q[0])), y0 = Math.min(...pts.map((q) => q[1])), y1 = Math.max(...pts.map((q) => q[1]));
    const grow = (lo, hi, minSpan) => { const span = Math.max(hi - lo, minSpan), mid = (lo + hi) / 2; return [mid - span * 0.6, mid + span * 0.6]; };
    [x0, x1] = grow(x0, x1, 2); [y0, y1] = grow(y0, y1, 2);
    graph.setRange(x0, x1, y0, y1);
  }
  let audioCtx = null;
  function audioTrace() {
    const p = graph.selectedPlot();
    if (!p || p.kind !== 'fx') { toast('Click a y = f(x) curve first'); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast('Audio is not available in this browser'); return; }
    audioCtx = audioCtx || new AC(); if (audioCtx.state === 'suspended') audioCtx.resume();
    const r = graph.range(), N = 160, dur = 4, xs = [], ys = [];
    for (let i = 0; i <= N; i++) { const x = r.xmin + (r.xmax - r.xmin) * i / N, y = p.f(x); xs.push(x); ys.push(Number.isFinite(y) ? y : NaN); }
    const fin = ys.filter(Number.isFinite); if (fin.length < 2) { toast('Nothing to play in this window'); return; }
    const lo = Math.min(...fin), hi = Math.max(...fin), t0 = audioCtx.currentTime + 0.05;
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(); osc.type = 'sine'; osc.connect(gain); gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.0001, t0);
    ys.forEach((y, i) => {
      const t = t0 + dur * i / N;
      if (Number.isFinite(y)) { osc.frequency.setValueAtTime(220 * Math.pow(2, 3 * (hi > lo ? (y - lo) / (hi - lo) : 0.5)), t); gain.gain.linearRampToValueAtTime(0.18, t + 0.01); }
      else gain.gain.linearRampToValueAtTime(0.0001, t + 0.01);
    });
    gain.gain.linearRampToValueAtTime(0.0001, t0 + dur + 0.05);
    osc.start(t0); osc.stop(t0 + dur + 0.1);
    for (let i = 0; i <= N; i += 2) setTimeout(() => { if (Number.isFinite(ys[i])) { graph.trace = { x: xs[i], y: ys[i] }; graph.drawOverlay(); } }, 50 + dur * 1000 * i / N);
    toast('Audio trace: higher pitch = higher y');
  }
  function showShortcuts() {
    let m = $('#kbdModal');
    if (!m) { m = el('div', 'modal'); m.id = 'kbdModal'; document.body.appendChild(m); m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('.modal-x')) m.hidden = true; }); }
    const rows = [
      ['Enter', 'New expression below'], ['Backspace (empty row)', 'Delete the row'], ['↑ / ↓', 'Move between rows'], ['Esc', 'Leave the field / close menus'],
      ['Ctrl/⌘ + Z · Shift + Ctrl/⌘ + Z', 'Undo · redo'], ['/', 'Build a fraction (live editor)'], ['^  _', 'Superscript · subscript (live editor)'],
      ['Mouse wheel · pinch', 'Zoom'], ['Shift + wheel · Alt + wheel', 'Zoom x only · y only'], ['Drag the axis', 'Scale one axis'], ['Double-click', 'Zoom in (graph) · reset view (3D)'],
      ['Click a curve', 'Zeros, extrema, intersections, tangent / secant, audio trace'], ['Click a surface (3D)', 'Place a tangent plane'], ['Shift + drag a 3D point', 'Move it up / down'],
      ['Hover a row', 'Highlights its curve'], ['Paste several lines', 'Creates one expression per line'],
    ];
    m.innerHTML = `<div class="modal-card"><div class="modal-head"><b>Keyboard &amp; mouse shortcuts</b><button class="ib modal-x" aria-label="Close">✕</button></div><table class="kbdtbl">${rows.map(([k, d]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(d)}</td></tr>`).join('')}</table></div>`;
    m.hidden = false;
  }

  /* ================= Ask (question -> editable rows) ================= */
  // Explanation -> plain note text: no markdown marks, maths in Unicode, one step per line, clipped at a sentence end.
  const stripMd = (t) => String(t || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, (_, m) => prettyText(m)).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const clipNote = (t, n) => { if (t.length <= n) return t; const cut = t.slice(0, n); const e = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '), cut.lastIndexOf('? ')); return (e > n * 0.5 ? cut.slice(0, e + 1) : cut.replace(/\s+\S*$/, '')).trim() + '…'; };
  function snapshotAll() {
    const r = graph.range();
    return { items: JSON.stringify(state.items.map((i) => (i.type === 'image' ? Object.assign({}, i, { src: '' }) : i))), colorIdx: state.colorIdx, tableCount: state.tableCount || 0, mode: state.settings.mode, range: [r.xmin, r.xmax, r.ymin, r.ymax] };
  }
  function restoreAll(snap) {
    state.items = JSON.parse(snap.items); state.items.forEach((i) => { if (i.type === 'image' && !i.src) i.src = imageData.get(i.id) || ''; });
    state.colorIdx = snap.colorIdx; state.tableCount = snap.tableCount; playing.clear();
    renderList(); suspendAuto = true; try { evaluate(); } finally { suspendAuto = false; }
    if (state.settings.mode !== snap.mode) setMode(snap.mode);
    graph.setRange(...snap.range); commitSoon(); saveSoon();
  }
  const askApi = {
    toast, pretty,
    relayout: () => setTimeout(() => { graph.resize(); }, 40),
    currentRows: () => state.items.filter((i) => i.type === 'expr' && i.text).map((i) => i.text),
    range: () => { const r = graph.range(); return r && Number.isFinite(r.xmin) ? { lo: r.xmin, hi: r.xmax } : null; },
    setRange: (w) => graph.setRange(w.xmin, w.xmax, w.ymin, w.ymax),
    rangeNow: () => { const r = graph.range(); return [r.xmin, r.xmax, r.ymin, r.ymax].map((v) => +v.toFixed(2)); },
    fit: () => { if (state.settings.mode === '3d') return; fitView(); const r = graph.range(); if (!(r.ymax - r.ymin < 1e7) || !(r.xmax - r.xmin < 1e7)) { graph.setRange(-10, 10, -10, 10); return; } const dy = (r.ymax - r.ymin) * 0.1, dx = (r.xmax - r.xmin) * 0.04; graph.setRange(r.xmin - dx, r.xmax + dx, r.ymin - dy, r.ymax + dy); },
    // dry run: which of these rows cannot be used?
    check(texts) {
      const snap = state.items.slice(); const temps = texts.map((t) => newItem('expr', { text: t }));
      suspendAuto = true;
      try {
        state.items.push(...temps); evaluate();
        return temps.map((it) => ({ text: it.text, err: (recs.get(it.id) || {}).err })).filter((e) => e.err);
      } finally { state.items = snap; evaluate(); suspendAuto = false; }
    },
    apply(plan, opts) {
      const snapshot = snapshotAll();
      const isDefaultDemo = state.items.length <= 3 && state.items.map((i) => i.text).join('|').replace(/\|+$/, '') === 'a=1|y=a sin(x)';
      if ((opts && opts.fresh) || isDefaultDemo) { state.items = []; playing.clear(); state.colorIdx = 0; }
      else state.items = state.items.filter((i) => !(i.type === 'expr' && !(i.text || '').trim() && !i.parent)); // drop blank placeholder rows
      const folder = newItem('folder', { text: String(plan.title || 'Ask').slice(0, 40) });
      const items = [folder];
      const note = clipNote(stripMd(plan.explanation), 1100);
      if (note) { const n = newItem('note', { text: note }); n.parent = folder.id; items.push(n); }
      const rowItems = plan.rows.map((r) => { const it = newItem('expr', { text: r.text }); it.parent = folder.id; return it; });
      items.push(...rowItems); state.items.push(...items);
      renderList(); evaluate();
      // parameters used but never defined become sliders automatically
      const missing = new Set();
      rowItems.forEach((it) => { const rec = recs.get(it.id); if (rec && !rec.err && rec.missing) rec.missing.forEach((m) => { if (/^[A-Za-z\u0370-\u03ff](_\w+)?$/.test(m) && !RESERVED.has(m)) missing.add(m); }); });
      if (missing.size) {
        const at = state.items.indexOf(rowItems[0]);
        const sl = [...missing].map((m) => { const s0 = newItem('expr', { text: `${m}=1`, slider: { min: -10, max: 10, step: 0.01 } }); s0.parent = folder.id; return s0; });
        state.items.splice(at, 0, ...sl); renderList(); evaluate();
      }
      const dropped = [];
      for (const it of rowItems) { const rec = recs.get(it.id); if (rec && rec.err) { dropped.push({ text: it.text, err: rec.err }); state.items.splice(state.items.indexOf(it), 1); } }
      if (dropped.length) { renderList(); evaluate(); }
      // show the right view: all-3D answers open the 3D view, 2D answers bring you back to 2D
      const kept = rowItems.filter((it) => state.items.includes(it)).map((it) => (recs.get(it.id) || {}).kind);
      const is3 = (k) => ['surf', 'psurf', 'isurf', 'curve3', 'pt3'].includes(k);
      if (kept.length && kept.every(is3) && state.settings.mode !== '3d') setMode('3d');
      else if (kept.length && !kept.some(is3) && state.settings.mode === '3d') setMode('2d');
      commitSoon(); saveSoon();
      return { snapshot, ids: rowItems.filter((it) => state.items.includes(it)).map((it) => it.id), folderId: folder.id, added: rowItems.length - dropped.length, dropped };
    },
    rollback(snap) { restoreAll(snap); },
    fxPlots(ids) {
      return graph.plots.filter((p) => p.kind === 'fx' && ids.includes(p.id) && typeof p.f === 'function').map((p) => {
        const it = state.items.find((i) => i.id === p.id);
        return { label: it ? it.text.replace(/\s+/g, '') : 'curve', color: it ? it.color : undefined, f: (x) => { const y = p.f(x); return p.cond && !p.cond(x, y) ? NaN : y; } };
      });
    },
    addPoints(points, folderId) {
      const last = state.items.filter((i) => i.parent === folderId).pop();
      let at = last ? state.items.indexOf(last) + 1 : state.items.length;
      const kinds = { int: 'Intersection', max: 'Maximum', min: 'Minimum', zero: 'Zero' };
      points.filter((pt) => Math.abs(pt.x) < 1e7 && Math.abs(pt.y) < 1e7).forEach((pt) => {
        const it = newItem('expr', Object.assign({ text: `(${parseFloat(pt.x.toPrecision(7))},${parseFloat(pt.y.toPrecision(7))})`, showLabel: true, label: '', dragMode: 'none', pointStyle: 'open' }, pt.color ? { color: pt.color } : {}));
        it.parent = folderId; state.items.splice(at++, 0, it);
      });
      renderList(); evaluate();
    },
  };

  /* ================= calculator modes ================= */
  function buildGeoBar() {
    const bar = $('#geobar');
    bar.innerHTML = '<button class="gt" data-act="back" title="Back to the graphing calculator"><span class="gi">⟵</span><span class="gl">Graphing</span></button><span class="gsep"></span>' + GEO_TOOLS.map((t) => `<button class="gt" data-tool="${t.id}" title="${t.label}: ${t.hint}"><span class="gi">${t.icon}</span><span class="gl">${t.label}</span></button>`).join('')
      + '<span class="gsep"></span><button class="gt" data-act="undo" title="Undo"><span class="gi">↶</span><span class="gl">Undo</span></button><button class="gt" data-act="clear" title="Clear all"><span class="gi">🗑</span><span class="gl">Clear</span></button><button class="gt" data-act="grid" title="Toggle grid"><span class="gi">▦</span><span class="gl">Grid</span></button><span id="geoParam" hidden><label id="geoParamLbl"></label> <input type="number" id="geoParamIn" step="any" aria-label="Transformation parameter"></span><div id="geohint"></div>';
    $('#geoParamIn').oninput = () => { const v = parseFloat($('#geoParamIn').value); if (Number.isFinite(v) && (geo.tool === 'rotate' || geo.tool === 'dilate')) geo.param[geo.tool] = v; };
    bar.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) geo.setTool(b.dataset.tool);
      else if (b.dataset.act === 'back') setApp('graph');
      else if (b.dataset.act === 'undo') geo.undo();
      else if (b.dataset.act === 'clear') { if (!geo.objects.length || confirm('Remove all geometry objects?')) geo.clear(); }
      else if (b.dataset.act === 'grid') { state.settings.grid = !state.settings.grid; state.settings.minor = state.settings.grid; applySettings(); saveSoon(); }
    };
  }
  function geoToolChanged(tool, status) {
    $('#geobar').querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
    const h = $('#geohint'); if (h) h.textContent = status || '';
    const def = GEO_TOOLS.find((t) => t.id === tool), box = $('#geoParam');
    if (box) { box.hidden = !(def && def.param); if (def && def.param) { $('#geoParamLbl').textContent = def.param.label; if (document.activeElement !== $('#geoParamIn')) $('#geoParamIn').value = geo.param[tool]; } }
  }
  function buildModeFab() {
    const menu = $('#modeMenu');
    menu.innerHTML = '<div class="lbl">Calculator</div><button data-app="graph">Graphing calculator</button><button data-app="geometry">Geometry</button><button data-app="scientific">Scientific calculator</button><button data-app="basic">Four-function calculator</button><button data-app="matrix">Matrix calculator</button>';
    $('#btnModes').onclick = (e) => { e.stopPropagation(); const wasHidden = menu.hidden; closePopovers(); menu.hidden = !wasHidden; if (!menu.hidden) fitMenu(menu, $('#btnModes')); };
    menu.onclick = (e) => { const b = e.target.closest('button[data-app]'); if (!b) return; menu.hidden = true; setApp(b.dataset.app); };
  }
  function setApp(name) {
    const S = state.settings;
    if (name === 'scientific') { ME.R.deg = false; sci.open(); return; }
    if (name === 'basic') { ME.R.deg = false; sci4.open(); return; }
    if (name === 'matrix') { mat.open(); return; }
    if (name === S.app) return;
    const body = document.body;
    if (name === 'geometry') {
      S.app = 'geometry'; body.classList.add('app-geo');
      if (S.mode === '3d') setMode('2d');
      graph.cb.onPointer = (t, x, y, e) => geo.pointer(t, x, y, e);
      $('#geobar').hidden = false; $('#curvebar').hidden = true; $('#surfbar').hidden = true; $('#modeFab').hidden = false;
      geo.setTool('move');
      graph.setPlots([geo.plot]);
      applySettings();
      setTimeout(() => { graph.resize(); graph.requestDraw(false); }, 30);
    } else {
      S.app = 'graph'; body.classList.remove('app-geo');
      graph.cb.onPointer = null; graph.over.style.cursor = '';
      $('#geobar').hidden = true; $('#modeFab').hidden = true; $('#modeMenu').hidden = true;
      applySettings();
      evaluate();
      setTimeout(() => { graph.resize(); graph.requestDraw(false); }, 30);
    }
    saveSoon();
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
    graph3 = new Graph3D($('#graph3Host'));
    geo = new Geo(graph, { onChange: () => saveSoon(), onTool: (t, st) => geoToolChanged(t, st), toast });
    if (state.geo) geo.load(state.geo);
    sci = new Sci($('#sci'), ME); sci.onClose = () => { ME.R.deg = !!state.settings.deg; };
    sci4 = new Sci($('#sci4'), ME, { basic: true, storeKey: 'graphical-calculator-basic' }); sci4.onClose = () => { ME.R.deg = !!state.settings.deg; };
    mat = new Mat($('#mat'), evalNumberText, (v) => ME.fmt(v, 8));
    Ask.init(askApi);
    graph.resize();
    if (state.view && state.view.length === 4 && state.view.every(Number.isFinite)) graph.setRange(state.view[0], state.view[1], state.view[2], state.view[3]);
    else graph.resetView();
    applySettings();
    setMode(state.settings.mode === '3d' ? '3d' : '2d');
    buildMainMenu(); buildKeypad(); buildGeoBar(); buildModeFab();
    if (state.settings.app === 'geometry') { state.settings.app = 'graph'; setApp('geometry'); }
    renderList();
    evaluate();
    hist = [snapshot()]; hIdx = 0; updateUndo();

    // toolbar
    $('#btnAdd').onclick = (e) => { e.stopPropagation(); const m = $('#addMenu'); const h = m.hidden; closePopovers(); m.hidden = !h; if (!m.hidden) fitMenu(m, $('#btnAdd')); };
    $('#addMenu').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; closePopovers(); const last = state.items[state.items.length - 1]; addItem(b.dataset.add, last && last.id); };
    $('#btnMenu').onclick = (e) => { e.stopPropagation(); const m = $('#mainMenu'); const h = m.hidden; closePopovers(); m.hidden = !h; if (!m.hidden) fitMenu(m, $('#btnMenu')); };
    $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
    $('#btnCollapse').onclick = () => { $('#app').classList.add('collapsed'); $('#btnExpand').hidden = false; setTimeout(() => graph.resize(), 30); };
    $('#btnExpand').onclick = () => { $('#app').classList.remove('collapsed'); $('#btnExpand').hidden = true; setTimeout(() => graph.resize(), 30); };
    $('#btnKeypad').onclick = () => { const k = $('#keypad'); k.hidden = !k.hidden; setTimeout(() => graph.resize(), 30); };
    $('#btnHome').onclick = () => activeGraph().resetView();
    $('#btnZoomIn').onclick = () => (state.settings.mode === '3d' ? graph3.zoom(1.25) : graph.zoomAt(graph.w / 2, graph.h / 2, 1.3, 1.3));
    $('#btnZoomOut').onclick = () => (state.settings.mode === '3d' ? graph3.zoom(1 / 1.25) : graph.zoomAt(graph.w / 2, graph.h / 2, 1 / 1.3, 1 / 1.3));
    $('#btnFit').onclick = fitView; $('#btnSquare').onclick = () => graph.squareView();
    $('#tAudio').onclick = audioTrace;
    $('#btn3d').onclick = () => setMode(state.settings.mode === '3d' ? '2d' : '3d');
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
          if (d.geo) geo.load(d.geo);
          nextId = Math.max(1, ...state.items.map((i) => i.id + 1));
          playing.clear(); applySettings(); renderList(); evaluate(); commitSoon(); saveSoon(); toast('Graph loaded');
        } catch (err) { toast('Could not read that file'); }
      };
      rd.readAsText(f); e.target.value = '';
    };

    // tangent plane bar (3D)
    const spA = $('#spA'), spB = $('#spB'), spOn = $('#spOn');
    const readPlane = () => { plane.on = spOn.checked; const a = parseFloat(spA.value), b = parseFloat(spB.value); if (Number.isFinite(a)) plane.a = a; if (Number.isFinite(b)) plane.b = b; applyPlane(); };
    spOn.onchange = readPlane; spA.oninput = readPlane; spB.oninput = readPlane;
    graph3.onPick = (hit) => {
      if (!hit) return;
      const r = (v) => parseFloat(v.toPrecision(4));
      plane.id = hit.plot.id; plane.on = true;
      if (hit.plot.kind === 'psurf') { plane.a = r(hit.u); plane.b = r(hit.v); }
      else { plane.a = r(hit.x); plane.b = r(hit.y); }
      plane.pt = hit.plot.kind === 'isurf' ? [hit.x, hit.y, hit.z] : null;
      spOn.checked = true; spA.value = plane.a; spB.value = plane.b; applyPlane();
    };
    $('#spAdd').onclick = () => {
      if (!plane.info) { toast('Turn on Tangent plane first (or click a surface)'); return; }
      const I = plane.info, num = (v) => fmt(v, 6), last = state.items[state.items.length - 1];
      const sg = (v) => (v < 0 ? '-' : '+');
      const text = I.zform ? `z=${num(I.zform.fx)}x${sg(I.zform.fy)}${num(Math.abs(I.zform.fy))}y${sg(I.zform.c)}${num(Math.abs(I.zform.c))}`
        : `${num(I.A)}x${sg(I.B)}${num(Math.abs(I.B))}y${sg(I.C)}${num(Math.abs(I.C))}z=${num(I.D)}`;
      addItem('expr', last && last.id, text);
      toast('Plane added to the list');
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
      if (e.target.closest('.popover, .menu, #btnAdd, #btnMenu, #btnModes, #btnSettings, .gear')) return;
      closePopovers();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closePopovers(); const km = $('#kbdModal'); if (km) km.hidden = true; }
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
    window.__gc = { prettyText, pretty, askApi, state: () => state, recs, graph, graph3, geo: () => geo, plane, evaluate, rows, setText: (i, t) => { const it = state.items[i]; it.text = t; const r = rows.get(it.id); r.ed.set(t); evaluate(); } };
  }

  async function boot() {
    try {
      const timeout = new Promise((r) => setTimeout(() => r(false), 6000));
      window.__mlOK = !!(window.mlReady && await Promise.race([window.mlReady, timeout]));
    } catch (e) { window.__mlOK = false; }
    if (window.__mlOK) configureMathLive();
    if (typeof Graph === 'undefined' || typeof Graph3D === 'undefined' || typeof Geo === 'undefined' || typeof Sci === 'undefined' || typeof Mat === 'undefined' || typeof Ask === 'undefined' || typeof LX === 'undefined') {
      document.body.insertAdjacentHTML('afterbegin', '<div style="position:fixed;inset:0;z-index:999;display:flex;align-items:center;justify-content:center;background:#fff;color:#222;font:16px sans-serif;text-align:center;padding:24px">Some files failed to load (network problem?).<br>Please <a href="" onclick="location.reload();return false">reload the page</a>.</div>');
      return;
    }
    init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
