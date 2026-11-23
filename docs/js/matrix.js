/* ==========================================================
   Matrix calculator mode (overlay) — Desmos "Matrix Calculator" style.
   Editable matrices A–F + an expression line supporting
   + − * / ^ , functions det inv transpose rref rank trace eig identity solve
   Exposes window.Mat and window.MatrixMath (pure logic, also used by tests)
   ========================================================== */
(function (global) {
  'use strict';

  /* ---------------- linear algebra ---------------- */
  const isM = (v) => Array.isArray(v);
  const dims = (A) => [A.length, A[0].length];
  const clone = (A) => A.map((r) => r.slice());
  const eye = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const mapM = (A, f) => A.map((r) => r.map(f));
  const EPS = 1e-10;

  function add(A, B, sign) { const [r, c] = dims(A); if (r !== B.length || c !== B[0].length) throw new Error('Matrices must have the same size'); return A.map((row, i) => row.map((v, j) => v + sign * B[i][j])); }
  function mul(A, B) {
    const [r, c] = dims(A), [c2, k] = dims(B);
    if (c !== c2) throw new Error(`Cannot multiply ${r}×${c} by ${c2}×${k}`);
    return Array.from({ length: r }, (_, i) => Array.from({ length: k }, (_, j) => { let s = 0; for (let t = 0; t < c; t++) s += A[i][t] * B[t][j]; return s; }));
  }
  function transpose(A) { const [r, c] = dims(A); return Array.from({ length: c }, (_, j) => Array.from({ length: r }, (_, i) => A[i][j])); }
  function square(A) { if (A.length !== A[0].length) throw new Error('This needs a square matrix'); }
  function det(A) {
    square(A); const n = A.length, M = clone(A); let d = 1;
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < EPS) return 0;
      if (p !== c) { [M[p], M[c]] = [M[c], M[p]]; d = -d; }
      d *= M[c][c];
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k < n; k++) M[r][k] -= f * M[c][k]; }
    }
    return d;
  }
  function rref(A) {
    const M = clone(A), [r, c] = dims(M); let lead = 0;
    for (let row = 0; row < r && lead < c; row++) {
      let i = row;
      while (Math.abs(M[i][lead]) < EPS) { i++; if (i === r) { i = row; lead++; if (lead === c) return mapM(M, (v) => (Math.abs(v) < EPS ? 0 : v)); } }
      [M[i], M[row]] = [M[row], M[i]];
      const div = M[row][lead]; M[row] = M[row].map((v) => v / div);
      for (let k = 0; k < r; k++) if (k !== row) { const f = M[k][lead]; M[k] = M[k].map((v, j) => v - f * M[row][j]); }
      lead++;
    }
    return mapM(M, (v) => (Math.abs(v) < EPS ? 0 : v));
  }
  function rank(A) { return rref(A).filter((row) => row.some((v) => Math.abs(v) > EPS)).length; }
  function inv(A) {
    square(A); const n = A.length;
    if (Math.abs(det(A)) < EPS) throw new Error('The matrix is singular (no inverse)');
    const aug = A.map((row, i) => row.concat(eye(n)[i])), R = rref(aug);
    return R.map((row) => row.slice(n));
  }
  function mpow(A, k) {
    square(A); if (!Number.isInteger(k)) throw new Error('Matrix powers must be integers');
    let base = k < 0 ? inv(A) : A, n = Math.abs(k), res = eye(A.length);
    while (n) { if (n & 1) res = mul(res, base); base = mul(base, base); n >>= 1; }
    return res;
  }
  function trace(A) { square(A); return A.reduce((s, r, i) => s + r[i], 0); }
  // eigenvalues via shifted QR iteration; complex pairs come from 2×2 blocks. Returns [{re, im}]
  function eig(A) {
    square(A); const n = A.length;
    let M = clone(A);
    const qr = (X) => {
      const Q = eye(n), Rm = clone(X);
      for (let j = 0; j < n - 1; j++) for (let i = n - 1; i > j; i--) {
        const a = Rm[i - 1][j], b = Rm[i][j]; if (Math.abs(b) < 1e-300) continue;
        const h = Math.hypot(a, b), c = a / h, s = b / h;
        for (let k = 0; k < n; k++) { const t1 = Rm[i - 1][k], t2 = Rm[i][k]; Rm[i - 1][k] = c * t1 + s * t2; Rm[i][k] = -s * t1 + c * t2; }
        for (let k = 0; k < n; k++) { const t1 = Q[k][i - 1], t2 = Q[k][i]; Q[k][i - 1] = c * t1 + s * t2; Q[k][i] = -s * t1 + c * t2; }
      }
      return [Q, Rm];
    };
    for (let it = 0; it < 600; it++) {
      const mu = M[n - 1][n - 1];
      const S = M.map((row, i) => row.map((v, j) => (i === j ? v - mu : v)));
      const [Q, Rm] = qr(S);
      M = mul(Rm, Q).map((row, i) => row.map((v, j) => (i === j ? v + mu : v)));
      let off = 0; for (let i = 1; i < n; i++) off = Math.max(off, Math.abs(M[i][i - 1]));
      if (off < 1e-12) break;
    }
    const out = []; let i = 0;
    while (i < n) {
      if (i < n - 1 && Math.abs(M[i + 1][i]) > 1e-7) {
        const a = M[i][i], b = M[i][i + 1], c = M[i + 1][i], d = M[i + 1][i + 1], tr = a + d, dt = a * d - b * c, disc = tr * tr / 4 - dt;
        if (disc >= 0) { out.push({ re: tr / 2 + Math.sqrt(disc), im: 0 }, { re: tr / 2 - Math.sqrt(disc), im: 0 }); }
        else { out.push({ re: tr / 2, im: Math.sqrt(-disc) }, { re: tr / 2, im: -Math.sqrt(-disc) }); }
        i += 2;
      } else { out.push({ re: M[i][i], im: 0 }); i++; }
    }
    return out.sort((x, y) => y.re - x.re || y.im - x.im);
  }
  function solve(A, B) { return mul(inv(A), B); }

  /* ---------------- expression parser ---------------- */
  function evaluate(src, env, num) {
    const toks = [];
    const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-z][A-Za-z0-9_]*)|(\^T|[-+*/^(),]))/y;
    let pos = 0; const text = String(src).trim();
    while (pos < text.length) {
      re.lastIndex = pos; const m = re.exec(text);
      if (!m) throw new Error(`Unexpected "${text[pos]}"`);
      if (m[1] !== undefined) toks.push({ t: 'n', v: parseFloat(m[1]) }); else if (m[2] !== undefined) toks.push({ t: 'i', v: m[2] }); else toks.push({ t: 'o', v: m[3] });
      pos = re.lastIndex;
    }
    let i = 0;
    const peek = () => toks[i], next = () => toks[i++];
    const isOp = (v) => peek() && peek().t === 'o' && peek().v === v;
    const FN = {
      det: (a) => det(a), inv: (a) => inv(a), inverse: (a) => inv(a), transpose: (a) => transpose(a), rref: (a) => rref(a), rank: (a) => rank(a), trace: (a) => trace(a),
      eig: (a) => eig(a), eigenvalues: (a) => eig(a), identity: (n) => eye(n), solve: (a, b) => solve(a, b),
      sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, ln: Math.log, round: Math.round,
    };
    function scalarOp(op, a, b) { return op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b; }
    function binary(op, a, b) {
      if (!isM(a) && !isM(b)) return scalarOp(op, a, b);
      if (op === '+' || op === '-') { if (isM(a) && isM(b)) return add(a, b, op === '+' ? 1 : -1); throw new Error('Cannot add a number and a matrix'); }
      if (op === '*') { if (isM(a) && isM(b)) return mul(a, b); return isM(a) ? mapM(a, (v) => v * b) : mapM(b, (v) => v * a); }
      if (op === '/') { if (isM(a) && !isM(b)) return mapM(a, (v) => v / b); if (isM(a) && isM(b)) return mul(a, inv(b)); throw new Error('Cannot divide a number by a matrix'); }
      throw new Error('Unsupported operation');
    }
    function parseExpr() { let l = parseTerm(); while (isOp('+') || isOp('-')) { const op = next().v; l = binary(op, l, parseTerm()); } return l; }
    function parseTerm() {
      let l = parseUnary();
      for (;;) {
        if (isOp('*') || isOp('/')) { const op = next().v; l = binary(op, l, parseUnary()); }
        else if (peek() && (peek().t === 'n' || peek().t === 'i' || isOp('('))) l = binary('*', l, parseUnary());
        else break;
      }
      return l;
    }
    function parseUnary() { if (isOp('-')) { next(); const v = parseUnary(); return isM(v) ? mapM(v, (x) => -x) : -v; } if (isOp('+')) { next(); return parseUnary(); } return parsePow(); }
    function parsePow() {
      let b = parsePostfix();
      if (isOp('^')) {
        next(); let neg = false; if (isOp('-')) { next(); neg = true; }
        let e = parsePostfix(); if (neg) e = -e;
        if (isM(b)) { if (isM(e)) throw new Error('Exponent must be a number'); return mpow(b, e); }
        return Math.pow(b, e);
      }
      return b;
    }
    function parsePostfix() { let v = parseAtom(); while (isOp('^T')) { next(); v = transpose(v); } return v; }
    function parseAtom() {
      const t = next(); if (!t) throw new Error('Unexpected end of expression');
      if (t.t === 'n') return t.v;
      if (t.t === 'o' && t.v === '(') { const v = parseExpr(); if (!isOp(')')) throw new Error('Missing )'); next(); return v; }
      if (t.t === 'i') {
        const name = t.v;
        if (isOp('(') && FN[name.toLowerCase()]) {
          next(); const args = [];
          if (!isOp(')')) for (;;) { args.push(parseExpr()); if (isOp(',')) { next(); continue; } break; }
          if (!isOp(')')) throw new Error('Missing )'); next();
          return FN[name.toLowerCase()](...args);
        }
        if (name === 'pi') return Math.PI; if (name === 'e') return Math.E;
        if (env[name]) return env[name];
        throw new Error(`Unknown name "${name}"`);
      }
      throw new Error(`Unexpected "${t.v}"`);
    }
    const out = parseExpr();
    if (i < toks.length) throw new Error(`Unexpected "${toks[i].v}"`);
    return out;
  }

  global.MatrixMath = { add, mul, transpose, det, rref, rank, inv, mpow, trace, eig, solve, evaluate, eye };

  /* ---------------- UI ---------------- */
  const NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
  class Mat {
    constructor(root, numEval, fmt) {
      this.root = root; this.numEval = numEval; this.fmt = fmt || ((v) => String(+v.toPrecision(8)));
      this.mats = { A: { r: 2, c: 2, d: [['1', '2'], ['3', '4']] }, B: { r: 2, c: 2, d: [['0', '1'], ['1', '0']] } };
      this.hist = [];
      try { const d = JSON.parse(localStorage.getItem('graphical-calculator-matrix') || 'null'); if (d && d.mats) { this.mats = d.mats; this.hist = d.hist || []; } } catch (e) { /* ignore */ }
      this._build();
    }
    _save() { try { localStorage.setItem('graphical-calculator-matrix', JSON.stringify({ mats: this.mats, hist: this.hist.slice(-30) })); } catch (e) { /* ignore */ } }
    open() { this.root.hidden = false; this.render(); setTimeout(() => this.inp.focus(), 30); }
    close() { this.root.hidden = true; }
    _build() {
      const r = this.root;
      r.innerHTML = `<div class="mat-card" role="dialog" aria-label="Matrix calculator">
        <div class="sci-head"><b>Matrix calculator</b><button class="ib mat-x" aria-label="Close">✕</button></div>
        <div class="mat-body"><div class="mat-list"></div><button class="ghost mat-add">+ add a matrix</button>
        <div class="mat-quick"></div>
        <input class="mat-in" placeholder="e.g.  A*B   det(A)   A^-1   2A+B   rref(A)   eig(A)   solve(A,B)" spellcheck="false" autocomplete="off" aria-label="Matrix expression">
        <div class="mat-out" aria-live="polite"></div><div class="mat-hist"></div></div></div>`;
      this.list = r.querySelector('.mat-list'); this.inp = r.querySelector('.mat-in'); this.out = r.querySelector('.mat-out'); this.histEl = r.querySelector('.mat-hist');
      r.querySelector('.mat-x').onclick = () => this.close();
      r.addEventListener('click', (e) => { if (e.target === r) this.close(); });
      r.querySelector('.mat-add').onclick = () => { const free = NAMES.find((n) => !this.mats[n]); if (!free) return; this.mats[free] = { r: 2, c: 2, d: [['0', '0'], ['0', '0']] }; this._save(); this.render(); };
      const q = r.querySelector('.mat-quick');
      q.innerHTML = ['det(A)', 'A^-1', 'transpose(A)', 'rref(A)', 'rank(A)', 'trace(A)', 'eig(A)', 'A^2', 'A*B', 'A+B', 'identity(3)'].map((t) => `<button class="chip" data-q="${t}">${t}</button>`).join('');
      q.onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) { this.inp.value = b.dataset.q; this.run(); } };
      this.inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.run(); else if (e.key === 'Escape') this.close(); });
      this.inp.addEventListener('input', () => this.preview());
    }
    values() {
      const env = {};
      for (const [n, m] of Object.entries(this.mats)) {
        env[n] = Array.from({ length: m.r }, (_, i) => Array.from({ length: m.c }, (_, j) => { const v = this.numEval(m.d[i][j] || '0'); if (!Number.isFinite(v)) throw new Error(`Matrix ${n}: entry (${i + 1},${j + 1}) is not a number`); return v; }));
      }
      return env;
    }
    show(v) {
      if (isM(v)) {
        if (v.length && Array.isArray(v[0])) return `<table class="mat-t">${v.map((row) => `<tr>${row.map((x) => `<td>${this.fmt(Math.abs(x) < 1e-12 ? 0 : x)}</td>`).join('')}</tr>`).join('')}</table>`;
      }
      if (Array.isArray(v)) { // eigenvalues
        return '<div class="mat-eig">' + v.map((z, k) => `λ<sub>${k + 1}</sub> = ${Math.abs(z.im) < 1e-9 ? this.fmt(Math.abs(z.re) < 1e-12 ? 0 : z.re) : `${this.fmt(z.re)} ${z.im < 0 ? '−' : '+'} ${this.fmt(Math.abs(z.im))}i`}`).join('<br>') + '</div>';
      }
      return `<b>${this.fmt(v)}</b>`;
    }
    calc(text) { const val = evaluate(text, this.values(), this.numEval); return val; }
    run() {
      const t = this.inp.value.trim(); if (!t) return;
      try { const v = this.calc(t); const html = this.show(v); this.out.innerHTML = html; this.out.classList.remove('err'); this.hist.push({ t, html }); this._save(); this.renderHist(); }
      catch (e) { this.out.textContent = e.message; this.out.classList.add('err'); }
    }
    preview() { if (!this.inp.value.trim()) { this.out.innerHTML = ''; return; } try { this.out.innerHTML = this.show(this.calc(this.inp.value)); this.out.classList.remove('err'); } catch (e) { this.out.textContent = ''; } }
    renderHist() { this.histEl.innerHTML = this.hist.slice(-6).reverse().map((h) => `<div class="mh"><span class="mt" data-t="${h.t.replace(/"/g, '&quot;')}">${h.t.replace(/</g, '&lt;')}</span>${h.html}</div>`).join(''); this.histEl.querySelectorAll('.mt').forEach((el2) => { el2.onclick = () => { this.inp.value = el2.dataset.t; this.preview(); }; }); }
    render() {
      this.list.innerHTML = '';
      for (const n of NAMES) {
        const m = this.mats[n]; if (!m) continue;
        const box = document.createElement('div'); box.className = 'mat-box';
        box.innerHTML = `<div class="mat-name"><b>${n}</b> = <span class="mat-size">${m.r}×${m.c}</span>
          <span class="mat-ctl"><button data-a="r+" title="Add a row">+row</button><button data-a="r-" title="Remove a row">−row</button><button data-a="c+" title="Add a column">+col</button><button data-a="c-" title="Remove a column">−col</button>${n !== 'A' ? '<button data-a="del" title="Delete this matrix">✕</button>' : ''}</span></div>
          <table class="mat-grid">${m.d.slice(0, m.r).map((row, i) => `<tr>${row.slice(0, m.c).map((v, j) => `<td><input data-i="${i}" data-j="${j}" value="${String(v).replace(/"/g, '&quot;')}" aria-label="${n}[${i + 1},${j + 1}]"></td>`).join('')}</tr>`).join('')}</table>`;
        box.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => { m.d[+inp.dataset.i][+inp.dataset.j] = inp.value; this._save(); this.preview(); }));
        box.querySelector('.mat-ctl').onclick = (e) => {
          const a = e.target.dataset.a; if (!a) return;
          if (a === 'del') delete this.mats[n];
          else if (a === 'r+' && m.r < 8) { m.r++; m.d.push(Array(8).fill('0')); }
          else if (a === 'r-' && m.r > 1) m.r--;
          else if (a === 'c+' && m.c < 8) { m.c++; m.d.forEach((row) => { while (row.length < m.c) row.push('0'); }); }
          else if (a === 'c-' && m.c > 1) m.c--;
          this._save(); this.render(); this.preview();
        };
        this.list.appendChild(box);
      }
      this.renderHist();
    }
  }
  global.Mat = Mat;
})(typeof window !== 'undefined' ? window : globalThis);
