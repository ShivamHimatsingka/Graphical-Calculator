/* ==========================================================
   Math engine: tokenizer, parser, resolver, code generator.
   Zero dependencies. Exposes window.ME
   ========================================================== */
(function (global) {
  'use strict';

  const DEG = Math.PI / 180;

  /* ---------------- runtime ---------------- */
  const R = { deg: false };
  const ang = (a) => (R.deg ? a * DEG : a);
  const unang = (a) => (R.deg ? a / DEG : a);

  function fact(n) {
    if (n < 0 || !isFinite(n)) return NaN;
    if (Number.isInteger(n)) {
      if (n > 170) return Infinity;
      let r = 1;
      for (let i = 2; i <= n; i++) r *= i;
      return r;
    }
    return gamma(n + 1);
  }
  function gamma(z) {
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1;
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
      1.5056327351493116e-7];
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

  Object.assign(R, {
    sin: (a) => Math.sin(ang(a)),
    cos: (a) => Math.cos(ang(a)),
    tan: (a) => Math.tan(ang(a)),
    sec: (a) => 1 / Math.cos(ang(a)),
    csc: (a) => 1 / Math.sin(ang(a)),
    cot: (a) => 1 / Math.tan(ang(a)),
    asin: (a) => unang(Math.asin(a)),
    acos: (a) => unang(Math.acos(a)),
    atan: (a) => unang(Math.atan(a)),
    acot: (a) => unang(Math.atan(1 / a)),
    asec: (a) => unang(Math.acos(1 / a)),
    acsc: (a) => unang(Math.asin(1 / a)),
    atan2: (y, x) => unang(Math.atan2(y, x)),
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
    coth: (a) => 1 / Math.tanh(a),
    ln: Math.log,
    log: (a) => Math.log10(a),
    log2: Math.log2,
    logb: (a, b) => Math.log(a) / Math.log(b),
    exp: Math.exp,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: (a, n) => (n === undefined ? Math.round(a) : Math.round(a * Math.pow(10, n)) / Math.pow(10, n)),
    trunc: Math.trunc,
    sign: Math.sign,
    fract: (a) => a - Math.floor(a),
    min: Math.min,
    max: Math.max,
    mod: (a, b) => a - b * Math.floor(a / b),
    gcd,
    lcm: (a, b) => (a && b ? Math.abs(a * b) / gcd(a, b) : 0),
    nCr: (n, k) => (k < 0 || k > n ? 0 : Math.round(fact(n) / (fact(k) * fact(n - k)))),
    nPr: (n, k) => (k < 0 || k > n ? 0 : Math.round(fact(n) / fact(n - k))),
    factorial: fact,
    gamma: (a) => gamma(a),
    hypot: Math.hypot,
    sgn: Math.sign,
    exp2: (a) => Math.pow(2, a),
    rad: (a) => a * DEG,
    degrees: (a) => a / DEG,
    // power with real odd roots of negatives
    pow(a, b) {
      if (a < 0 && b !== Math.floor(b)) {
        for (const q of [3, 5, 7, 9, 11]) {
          const p = b * q;
          if (Math.abs(p - Math.round(p)) < 1e-9) return (Math.round(p) % 2 === 0 ? 1 : -1) * Math.pow(-a, b);
        }
        return NaN;
      }
      return Math.pow(a, b);
    },
    deriv(fn, order, ...args) {
      // numeric derivative wrt first argument
      const x = args[0], rest = args.slice(1);
      const h = 1e-4 * Math.max(1, Math.abs(x));
      if (order === 1) return (fn(x + h, ...rest) - fn(x - h, ...rest)) / (2 * h);
      const h2 = 1e-3 * Math.max(1, Math.abs(x));
      if (order === 2) return (fn(x + h2, ...rest) - 2 * fn(x, ...rest) + fn(x - h2, ...rest)) / (h2 * h2);
      return NaN;
    },
  });

  /* ---- lists & points ---- */
  const isA = Array.isArray;
  class Pt { constructor(x, y) { this.x = x; this.y = y; } }
  function bcast(fn, args) {
    let n = -1;
    for (const a of args) if (isA(a)) n = n < 0 ? a.length : Math.min(n, a.length);
    if (n < 0) return fn(...args);
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = bcast(fn, args.map((a) => (isA(a) ? a[i] : a)));
    return out;
  }
  /* ---- complex numbers ---- */
  class Cx { constructor(re, im) { this.re = re; this.im = im; } }
  const mkC = (re, im) => (im === 0 ? re : new Cx(re, im));
  const toC = (a) => (a instanceof Cx ? a : new Cx(a, 0));
  const cabs = (z) => Math.hypot(z.re, z.im);
  const carg = (z) => Math.atan2(z.im, z.re);
  const cmulR = (a, b) => new Cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const cdivR = (a, b) => { const d = b.re * b.re + b.im * b.im; return new Cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
  const cexpR = (z) => { const m = Math.exp(z.re); return new Cx(m * Math.cos(z.im), m * Math.sin(z.im)); };
  const clnR = (z) => new Cx(Math.log(cabs(z)), carg(z));
  function csqrtR(z) {
    if (z.im === 0) return z.re >= 0 ? new Cx(Math.sqrt(z.re), 0) : new Cx(0, Math.sqrt(-z.re));
    const r = cabs(z);
    return new Cx(Math.sqrt((r + z.re) / 2), Math.sign(z.im) * Math.sqrt((r - z.re) / 2));
  }
  function cpowR(a, b) {
    if (b.im === 0 && Number.isInteger(b.re) && Math.abs(b.re) <= 64) {
      let n = Math.abs(b.re), base = a, res = new Cx(1, 0);
      while (n) { if (n & 1) res = cmulR(res, base); base = cmulR(base, base); n >>= 1; }
      return b.re < 0 ? cdivR(new Cx(1, 0), res) : res;
    }
    if (a.re === 0 && a.im === 0) return b.re > 0 ? new Cx(0, 0) : new Cx(NaN, NaN);
    return cexpR(cmulR(b, clnR(a)));
  }
  const CF = {
    sqrt: (z) => csqrtR(toC(z)), exp: (z) => cexpR(toC(z)), ln: (z) => clnR(toC(z)),
    log: (z) => { const l = clnR(toC(z)); return new Cx(l.re / Math.LN10, l.im / Math.LN10); },
    sin: (z) => { z = toC(z); return new Cx(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im)); },
    cos: (z) => { z = toC(z); return new Cx(Math.cos(z.re) * Math.cosh(z.im), -Math.sin(z.re) * Math.sinh(z.im)); },
    tan: (z) => cdivR(CF.sin(z), CF.cos(z)),
    sinh: (z) => { z = toC(z); return new Cx(Math.sinh(z.re) * Math.cos(z.im), Math.cosh(z.re) * Math.sin(z.im)); },
    cosh: (z) => { z = toC(z); return new Cx(Math.cosh(z.re) * Math.cos(z.im), Math.sinh(z.re) * Math.sin(z.im)); },
    tanh: (z) => cdivR(CF.sinh(z), CF.cosh(z)),
    abs: (z) => cabs(toC(z)), arg: (z) => carg(toC(z)),
    real: (z) => toC(z).re, imag: (z) => toC(z).im, conj: (z) => { z = toC(z); return new Cx(z.re, -z.im); },
  };
  function cop(op, a, b) {
    a = toC(a); b = toC(b);
    switch (op) {
      case '+': return new Cx(a.re + b.re, a.im + b.im);
      case '-': return new Cx(a.re - b.re, a.im - b.im);
      case '*': return cmulR(a, b);
      case '/': return cdivR(a, b);
      default: return cpowR(a, b);
    }
  }
  const OPF = { '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b, '^': (a, b) => R.pow(a, b) };
  const CMP = { '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '=': (a, b) => Math.abs(a - b) < 1e-9, '!=': (a, b) => a !== b };
  const ptwise = (f) => (a, b) => {
    if (a instanceof Pt || b instanceof Pt) {
      const A = a instanceof Pt ? a : new Pt(a, a), B = b instanceof Pt ? b : new Pt(b, b);
      return new Pt(f(A.x, B.x), f(A.y, B.y));
    }
    return f(a, b);
  };
  const nums = (a) => (isA(a) ? a : [a]).filter((v) => typeof v === 'number' && !Number.isNaN(v));
  const flatNums = (args) => nums(args.length === 1 ? args[0] : args.flatMap((a) => (isA(a) ? a : [a])));
  const meanOf = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  const varOf = (a, ddof) => { if (a.length - ddof <= 0) return NaN; const m = meanOf(a); return a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - ddof); };
  const H = {
    Pt, bc: bcast,
    pt: (x, y) => ((isA(x) || isA(y)) ? bcast((a, b) => new Pt(a, b), [x, y]) : new Pt(x, y)),
    I: new Cx(0, 1), Cx,
    bop: (op, a, b) => bcast((x, y) => ((x instanceof Cx || y instanceof Cx) ? (() => { const r = cop(op, x, y); return mkC(r.re, r.im); })() : ptwise(OPF[op])(x, y)), [a, b]),
    bcf: (name, args) => bcast((...v) => (v.some((x) => x instanceof Cx) ? (CF[name] ? (() => { const r = CF[name](...v); return r instanceof Cx ? mkC(r.re, r.im) : r; })() : NaN) : R[name](...v)), args),
    neg: (a) => bcast((x) => (x instanceof Pt ? new Pt(-x.x, -x.y) : x instanceof Cx ? new Cx(-x.re, -x.im) : -x), [a]),
    cmp: (op, a, b) => bcast(CMP[op], [a, b]),
    land: (...xs) => bcast((...v) => v.every(Boolean), xs),
    range(a, b, next) {
      const step = next === undefined ? 1 : next - a;
      if (!Number.isFinite(a) || !Number.isFinite(b) || !step || !Number.isFinite(step)) return [];
      const n = Math.floor((b - a) / step + 1e-9) + 1;
      if (n <= 0) return [];
      const out = []; for (let i = 0; i < Math.min(n, 100000); i++) out.push(a + i * step);
      return out;
    },
    index(L, idx) {
      if (!isA(L)) return NaN;
      if (isA(idx)) {
        if (idx.length && typeof idx[0] === 'boolean') return L.filter((_, i) => idx[i]);
        return idx.map((i) => { const v = L[Math.round(i) - 1]; return v === undefined ? NaN : v; });
      }
      if (typeof idx === 'boolean') return idx ? L : [];
      const v = L[Math.round(idx) - 1];
      return v === undefined ? NaN : v;
    },
  };
  Object.assign(R, {
    total: (...a) => flatNums(a).reduce((s, v) => s + v, 0),
    mean: (...a) => meanOf(flatNums(a)),
    median: (...a) => { const v = flatNums(a).sort((x, y) => x - y), n = v.length; return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : NaN; },
    min: (...a) => { const v = flatNums(a); return v.length ? Math.min(...v) : NaN; },
    max: (...a) => { const v = flatNums(a); return v.length ? Math.max(...v) : NaN; },
    count: (a) => (isA(a) ? a.length : 1),
    length: (a) => (isA(a) ? a.length : 1),
    stdev: (...a) => Math.sqrt(varOf(flatNums(a), 1)),
    stdevp: (...a) => Math.sqrt(varOf(flatNums(a), 0)),
    variance: (...a) => varOf(flatNums(a), 1),
    varp: (...a) => varOf(flatNums(a), 0),
    mad: (...a) => { const v = flatNums(a), m = meanOf(v); return meanOf(v.map((x) => Math.abs(x - m))); },
    quartile: (L, q) => { const v = nums(L).sort((x, y) => x - y); if (!v.length) return NaN; const pos = clampQ(q) / 4 * (v.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos); return v[lo] + (v[hi] - v[lo]) * (pos - lo); },
    corr: (A, B) => { const n = Math.min(A.length, B.length), a = A.slice(0, n), b = B.slice(0, n), ma = meanOf(a), mb = meanOf(b); let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb); },
    cov: (A, B) => { const n = Math.min(A.length, B.length), a = A.slice(0, n), b = B.slice(0, n), ma = meanOf(a), mb = meanOf(b); let s = 0; for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb); return s / (n - 1); },
    sort: (L, K) => { if (!isA(L)) return L; if (isA(K)) { return L.map((v, i) => [v, K[i]]).sort((x, y) => x[1] - y[1]).map((x) => x[0]); } return L.slice().sort((x, y) => x - y); },
    unique: (L) => [...new Set(isA(L) ? L : [L])].sort((x, y) => x - y),
    join: (...a) => a.flatMap((x) => (isA(x) ? x : [x])),
  });
  /* ---- random & distributions ---- */
  function erf(x) {
    const ax = Math.abs(x);
    if (ax > 6) return Math.sign(x);
    if (ax < 3) {
      let sum = 0, term = ax;
      for (let n = 0; n < 80; n++) { sum += term / (2 * n + 1); term *= -ax * ax / (n + 1); if (Math.abs(term) < 1e-18) break; }
      return Math.sign(x) * 2 / Math.sqrt(Math.PI) * sum;
    }
    let cf = 0;
    for (let k = 60; k >= 1; k--) cf = (k / 2) / (ax + cf);
    return Math.sign(x) * (1 - Math.exp(-ax * ax) / Math.sqrt(Math.PI) / (ax + cf));
  }
  function lgamma(z) {
    if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
    z -= 1;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    let x = c[0]; for (let i = 1; i < 9; i++) x += c[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  const ncdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
  function invStdNorm(p) {
    if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
    // bisection refined with Newton (robust, 1e-12)
    let lo = -40, hi = 40;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (ncdf(m) < p) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  const binomP = (n, p, k) => (k < 0 || k > n || k !== Math.floor(k) ? 0 : Math.exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + (k ? k * Math.log(p) : 0) + (n - k ? (n - k) * Math.log(1 - p) : 0)));
  const poisP = (l, k) => (k < 0 || k !== Math.floor(k) ? 0 : Math.exp(-l + (k ? k * Math.log(l) : 0) - lgamma(k + 1)));
  Object.assign(R, {
    real: (a) => a, imag: () => 0, conj: (a) => a, arg: (a) => Math.atan2(0, a),
    erf,
    random: (n) => (n === undefined ? Math.random() : Array.from({ length: Math.max(0, Math.min(1e5, Math.floor(n))) }, () => Math.random())),
    shuffle: (L) => { const a = (isA(L) ? L : [L]).slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    normpdf: (x, mu = 0, sd = 1) => Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI)),
    normcdf: (x, mu = 0, sd = 1) => ncdf((x - mu) / sd),
    invnorm: (p, mu = 0, sd = 1) => mu + sd * invStdNorm(p),
    binompdf: binomP,
    binomcdf: (n, p, k) => { let s2 = 0; for (let i = 0; i <= Math.min(Math.floor(k), n); i++) s2 += binomP(n, p, i); return Math.min(1, s2); },
    poissonpdf: poisP,
    poissoncdf: (l, k) => { let s2 = 0; for (let i = 0; i <= Math.floor(k); i++) s2 += poisP(l, i); return Math.min(1, s2); },
    exppdf: (x, l = 1) => (x < 0 ? 0 : l * Math.exp(-l * x)),
    expcdf: (x, l = 1) => (x < 0 ? 0 : 1 - Math.exp(-l * x)),
    unifpdf: (x, a = 0, b = 1) => (x >= a && x <= b ? 1 / (b - a) : 0),
    unifcdf: (x, a = 0, b = 1) => (x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a)),
  });
  function clampQ(q) { return Math.max(0, Math.min(4, Number.isFinite(q) ? q : 2)); }
  const AGG = new Set(['shuffle', 'total', 'mean', 'median', 'min', 'max', 'count', 'length', 'stdev', 'stdevp', 'variance', 'varp', 'mad', 'quartile', 'corr', 'cov', 'sort', 'unique', 'join']);
  const AGG_ALWAYS = new Set([...AGG].filter((x) => x !== 'min' && x !== 'max'));
  const LISTVARS = new Set();
  const CXVARS = new Set();   // variables holding complex values
  const CXFUNCS = new Set();  // user functions returning complex values

  const ALIAS = {
    arcsin: 'asin', arccos: 'acos', arctan: 'atan', arccot: 'acot', arcsec: 'asec', arccsc: 'acsc',
    arsinh: 'asinh', arcosh: 'acosh', artanh: 'atanh', arcsinh: 'asinh', arccosh: 'acosh', arctanh: 'atanh',
    ncr: 'nCr', npr: 'nPr', lg: 'log', sgn: 'sign', cosec: 'csc', ctg: 'cot', tg: 'tan', ceiling: 'ceil',
  };
  const BUILTINS = new Set(Object.keys(R).filter((k) => typeof R[k] === 'function' &&
    !['pow', 'deriv', 'logb'].includes(k)));
  Object.keys(ALIAS).forEach((k) => BUILTINS.add(k));
  const SPECIAL = new Set(['sum', 'prod', 'int', 'nderiv']);
  const CONSTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI, infinity: Infinity, i: 0 };

  /* ---------------- tokenizer ---------------- */
  class MathError extends Error {}

  function isLetter(ch) { return /[A-Za-zͰ-Ͽ]/.test(ch); }

  function tokenize(src, userNames) {
    let s = src
      .replace(/π/g, 'pi').replace(/θ/g, 'theta').replace(/τ/g, 'tau')
      .replace(/−/g, '-').replace(/[×⋅·]/g, '*').replace(/÷/g, '/')
      .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=')
      .replace(/²/g, '^2').replace(/³/g, '^3')
      .replace(/\\left|\\right/g, '').replace(/\\cdot/g, '*').replace(/\\le(?![a-z])/g, '<=')
      .replace(/\\ge(?![a-z])/g, '>=').replace(/\\pi/g, 'pi').replace(/\\theta/g, 'theta');
    const toks = [];
    let i = 0;
    const known = new Set([...BUILTINS, ...SPECIAL, ...Object.keys(CONSTS), 'theta', ...(userNames || [])]);
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      // number
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        const m = /^(?:\d+(?:\.(?!\.)\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
        let txt = m[0];
        // "2e" followed by non-digit handled since regex requires digits after e
        toks.push({ t: 'num', v: parseFloat(txt) });
        i += txt.length;
        continue;
      }
      if (isLetter(ch)) {
        let j = i;
        while (j < s.length && isLetter(s[j])) j++;
        let run = s.slice(i, j);
        // subscript
        let sub = '';
        if (s[j] === '_') {
          let k = j + 1;
          if (s[k] === '{') {
            const end = s.indexOf('}', k);
            if (end < 0) throw new MathError('Unclosed subscript');
            sub = s.slice(k + 1, end).replace(/\s+/g, '');
            k = end + 1;
          } else if (/[0-9]/.test(s[k] || '')) {
            let m = k; while (/[0-9]/.test(s[m] || '')) m++;
            sub = s.slice(k, m); k = m;
          } else if (isLetter(s[k] || '')) {
            sub = s[k]; k++;
          }
          if (sub) j = k;
        }
        const dm = /^[0-9]+/.exec(s.slice(j));
        if (!sub && dm && known.has(run + dm[0])) { toks.push({ t: 'id', v: run + dm[0] }); i = j + dm[0].length; continue; }
        // split the letter run into known names / single letters
        let p = 0;
        while (p < run.length) {
          let name = null, len = 1;
          for (let L = Math.min(run.length - p, 10); L >= 1; L--) {
            const cand = run.slice(p, p + L);
            const isLast = p + L === run.length;
            const full = isLast && sub ? cand + '_' + sub : cand;
            if (known.has(full)) { name = full; len = L; break; }
            if (L > 1 && known.has(cand)) { name = isLast && sub ? cand + '_' + sub : cand; len = L; break; }
            if (L === 1) { name = full; len = 1; }
          }
          toks.push({ t: 'id', v: name });
          p += len;
        }
        i = j;
        continue;
      }
      if (ch === 'π') { toks.push({ t: 'id', v: 'pi' }); i++; continue; }
      if (ch === '√') { toks.push({ t: 'id', v: 'sqrt' }); i++; continue; }
      if (ch === '∛') { toks.push({ t: 'id', v: 'cbrt' }); i++; continue; }
      if (ch === '∞') { toks.push({ t: 'id', v: 'infinity' }); i++; continue; }
      if (ch === '°') { toks.push({ t: 'deg' }); i++; continue; }
      if (ch === "'" || ch === '′') { toks.push({ t: 'prime' }); i++; continue; }
      if (ch === '<' || ch === '>' || ch === '=') {
        let op = ch;
        if (s[i + 1] === '=') { op += '='; i++; }
        i++;
        if (op === '==') op = '=';
        toks.push({ t: 'rel', v: op });
        continue;
      }
      if (ch === '!' && s[i + 1] === '=') { toks.push({ t: 'rel', v: '!=' }); i += 2; continue; }
      if ('+-*/^!'.includes(ch)) { toks.push({ t: 'op', v: ch }); i++; continue; }
      if (ch === '(') { toks.push({ t: 'lp' }); i++; continue; }
      if (ch === ')') { toks.push({ t: 'rp' }); i++; continue; }
      if (ch === '[') { toks.push({ t: 'lbr' }); i++; continue; }
      if (ch === ']') { toks.push({ t: 'rbr' }); i++; continue; }
      if (s.startsWith('...', i)) { toks.push({ t: 'dots' }); i += 3; continue; }
      if (ch === '\u2026') { toks.push({ t: 'dots' }); i++; continue; }
      if (ch === '~') { toks.push({ t: 'rel', v: '~' }); i++; continue; }
      if (ch === '{') { toks.push({ t: 'lb' }); i++; continue; }
      if (ch === '}') { toks.push({ t: 'rb' }); i++; continue; }
      if (ch === ',') { toks.push({ t: 'comma' }); i++; continue; }
      if (ch === ':') { toks.push({ t: 'colon' }); i++; continue; }
      if (ch === '|') { toks.push({ t: 'pipe' }); i++; continue; }
      throw new MathError(`Unexpected character "${ch}"`);
    }
    return toks;
  }

  /* ---------------- parser ---------------- */
  // AST: num, var, bin, neg, call, tuple, pw, rel, fact
  function parseStatement(src, userNames) {
    const toks = tokenize(src, userNames);
    let pos = 0;
    let absDepth = 0;
    const peek = () => toks[pos];
    const next = () => toks[pos++];
    const is = (t, v) => toks[pos] && toks[pos].t === t && (v === undefined || toks[pos].v === v);
    function expect(t, what) {
      if (!is(t)) throw new MathError(`Expected ${what || t}`);
      return next();
    }

    function startsAtom() {
      const k = peek();
      if (!k) return false;
      if (k.t === 'num' || k.t === 'id' || k.t === 'lp') return true;
      if (k.t === 'pipe') return absDepth === 0;
      return false;
    }

    function parseExpr() { return parseAdditive(); }

    function parseAdditive() {
      let left = parseTerm();
      while (is('op', '+') || is('op', '-')) {
        const op = next().v;
        const right = parseTerm();
        left = { t: 'bin', op, a: left, b: right };
      }
      return left;
    }

    function parseTerm() {
      let left = parseUnary();
      for (;;) {
        if (is('op', '*') || is('op', '/')) {
          const op = next().v;
          const right = parseUnary();
          left = { t: 'bin', op, a: left, b: right };
        } else if (startsAtom()) {
          const right = parseUnary(true);
          left = { t: 'bin', op: '*', a: left, b: right };
        } else break;
      }
      return left;
    }

    function parseUnary(implicit) {
      if (is('op', '-')) { next(); return { t: 'neg', a: parseUnary() }; }
      if (is('op', '+')) { next(); return parseUnary(); }
      return parsePower();
    }

    function parsePower() {
      let base = parsePostfix();
      if (is('op', '^')) {
        next();
        const exp = parseExponent();
        base = { t: 'bin', op: '^', a: base, b: exp };
      }
      return base;
    }

    function parseExponent() {
      if (is('op', '-')) { next(); return { t: 'neg', a: parseExponent() }; }
      if (is('op', '+')) { next(); return parseExponent(); }
      return parsePower();
    }

    function parsePostfix() {
      let node = parseAtom();
      for (;;) {
        if (is('op', '!')) { next(); node = { t: 'fact', a: node }; }
        else if (is('deg')) { next(); node = { t: 'bin', op: '*', a: node, b: { t: 'num', v: Math.PI / 180 } }; }
        else if (is('lbr') && ['var', 'call', 'list', 'range', 'index'].includes(node.t)) {
          next();
          const savedAbs = absDepth; absDepth = 0;
          const first = parseRelationOrExpr();
          let idx = first;
          if (is('dots')) { next(); idx = { t: 'range', a: first, b: parseExpr() }; }
          absDepth = savedAbs;
          expect('rbr', ']');
          node = { t: 'index', a: node, idx };
        }
        else break;
      }
      return node;
    }

    function parseArgs() {
      expect('lp', '(');
      const args = [];
      if (is('rp')) { next(); return args; }
      for (;;) {
        args.push(parseRelationOrExpr());
        if (is('comma')) { next(); continue; }
        break;
      }
      expect('rp', ')');
      return args;
    }

    function parseAtom() {
      const k = peek();
      if (!k) throw new MathError('Unexpected end of expression');
      if (k.t === 'num') { next(); return { t: 'num', v: k.v }; }
      if (k.t === 'pipe') {
        next(); absDepth++;
        const inner = parseExpr();
        absDepth--;
        expect('pipe', '|');
        return { t: 'call', n: 'abs', args: [inner] };
      }
      if (k.t === 'lb') return parsePiecewise();
      if (k.t === 'lbr') {
        next();
        const savedAbs = absDepth; absDepth = 0;
        let node;
        if (is('rbr')) node = { t: 'list', items: [] };
        else {
          const first = parseExpr();
          if (is('dots')) { next(); node = { t: 'range', a: first, b: parseExpr() }; }
          else if (is('comma')) {
            next();
            const second = parseExpr();
            if (is('dots')) { next(); node = { t: 'range', a: first, next: second, b: parseExpr() }; }
            else { const items = [first, second]; while (is('comma')) { next(); items.push(parseExpr()); } node = { t: 'list', items }; }
          } else node = { t: 'list', items: [first] };
        }
        absDepth = savedAbs;
        expect('rbr', ']');
        return node;
      }
      if (k.t === 'lp') {
        next();
        const savedAbs = absDepth; absDepth = 0;
        const items = [parseExpr()];
        while (is('comma')) { next(); items.push(parseExpr()); }
        absDepth = savedAbs;
        expect('rp', ')');
        return items.length === 1 ? items[0] : { t: 'tuple', items };
      }
      if (k.t === 'id') {
        next();
        let name = k.v;
        // primes: f'(x)
        let primes = 0;
        while (is('prime')) { next(); primes++; }
        const isFn = BUILTINS.has(name) || SPECIAL.has(name);
        // log_b(x)
        const lm = /^log_(.+)$/.exec(name);
        if (lm && is('lp')) {
          const args = parseArgs();
          const baseNode = /^[0-9.]+$/.test(lm[1]) ? { t: 'num', v: parseFloat(lm[1]) } : { t: 'var', n: lm[1] };
          return { t: 'call', n: 'logb', args: [args[0], baseNode] };
        }
        if (name in CONSTS && !is('lp')) return { t: 'var', n: name };
        if (is('lp') && (isFn || primes || /^[A-Za-zͰ-Ͽ]/.test(name))) {
          // function call (or implicit mult, resolved later)
          const args = parseArgs();
          return { t: 'call', n: name, args, primes };
        }
        // function name with exponent: sin^2(x), or no parentheses: sin x
        if (BUILTINS.has(name)) {
          let expo = null;
          if (is('op', '^')) { next(); expo = parseExponent(); }
          let arg;
          if (is('lp')) { arg = parseArgs(); }
          else {
            // implicit product of tight factors, e.g. sin 2x
            let first = parsePowerNoFn();
            while (startsAtom() && !(peek().t === 'id' && BUILTINS.has(peek().v))) {
              first = { t: 'bin', op: '*', a: first, b: parsePowerNoFn() };
            }
            arg = [first];
          }
          const call = { t: 'call', n: name, args: arg, primes: 0 };
          return expo ? { t: 'bin', op: '^', a: call, b: expo } : call;
        }
        return { t: 'var', n: name };
      }
      throw new MathError(k.t === 'rp' ? 'Unexpected )' : `Unexpected "${k.v || k.t}"`);
    }

    function parsePowerNoFn() {
      if (is('op', '-')) { next(); return { t: 'neg', a: parsePowerNoFn() }; }
      return parsePower();
    }

    // comparison chain used inside conditions / piecewise: a < b <= c
    function parseRelation() {
      const parts = [parseExpr()];
      const ops = [];
      while (is('rel')) { ops.push(next().v); parts.push(parseExpr()); }
      return { t: 'rel', ops, parts };
    }
    function parseRelationOrExpr() {
      const r = parseRelation();
      return r.ops.length ? r : r.parts[0];
    }

    function parsePiecewise() {
      expect('lb', '{');
      const cases = [];
      let def = null;
      for (;;) {
        const first = parseRelation();
        if (is('colon')) {
          next();
          const val = parseExpr();
          cases.push({ cond: first, val });
        } else {
          if (first.ops.length) { // bare condition => value 1 (Desmos style {x>0})
            cases.push({ cond: first, val: { t: 'num', v: 1 } });
          } else def = first.parts[0];
        }
        if (is('comma')) { next(); if (is('rb')) break; continue; }
        break;
      }
      expect('rb', '}');
      return { t: 'pw', cases, def };
    }

    // statement: relation chain + optional restrictions
    const parts = [parseExpr()];
    const ops = [];
    while (is('rel')) { ops.push(next().v); parts.push(parseExpr()); }
    const restrict = [];
    while (is('lb')) {
      next();
      for (;;) {
        restrict.push(parseRelation());
        if (is('comma')) { next(); continue; }
        break;
      }
      expect('rb', '}');
    }
    if (pos < toks.length) {
      const k = toks[pos];
      throw new MathError(k.t === 'rp' ? 'Unmatched )' : `Unexpected "${k.v !== undefined ? k.v : k.t}"`);
    }
    return { parts, ops, restrict };
  }

  /* ---------------- AST analysis ---------------- */
  function kids(n) {
    switch (n.t) {
      case 'bin': return [n.a, n.b];
      case 'neg': case 'fact': return [n.a];
      case 'call': return n.args;
      case 'tuple': case 'list': return n.items;
      case 'range': return [n.a, n.next, n.b].filter(Boolean);
      case 'index': return [n.a, n.idx];
      case 'rel': return n.parts;
      case 'pw': return n.cases.flatMap((c) => [c.cond, c.val]).concat(n.def ? [n.def] : []);
      default: return [];
    }
  }
  function walk(node, fn) {
    if (!node) return;
    fn(node);
    kids(node).forEach((k) => walk(k, fn));
  }

  // free variable names (excluding constants and bound variables)
  function freeVars(node, bound, out) {
    out = out || new Set();
    bound = bound || new Set();
    const rec = (n, b) => {
      if (!n) return;
      switch (n.t) {
        case 'var': if (!b.has(n.n) && !(n.n in CONSTS)) out.add(n.n); break;
        case 'bin': rec(n.a, b); rec(n.b, b); break;
        case 'neg': case 'fact': rec(n.a, b); break;
        case 'call':
          if (SPECIAL.has(n.n)) {
            const nb = new Set(b); nb.add(specialVar(n));
            const A = n.args;
            if (n.n === 'sum' || n.n === 'prod') { rec(A[1], b); rec(A[2], b); rec(A[3], nb); }
            else if (n.n === 'int') { rec(A[0], b); rec(A[1], b); rec(A[2], nb); }
            else { rec(A[0], nb); rec(A[1], b); }
          } else n.args.forEach((a) => rec(a, b));
          break;
        case 'tuple': n.items.forEach((a) => rec(a, b)); break;
        case 'pw': n.cases.forEach((c) => { rec(c.cond, b); rec(c.val, b); }); rec(n.def, b); break;
        case 'rel': n.parts.forEach((a) => rec(a, b)); break;
        default: kids(n).forEach((a) => rec(a, b)); break;
      }
    };
    rec(node, bound);
    return out;
  }
  function specialVar(n) {
    if (n.n === 'sum' || n.n === 'prod') return n.args[0].t === 'var' ? n.args[0].n : 'n';
    if (n.n === 'int') return n.args[3] && n.args[3].t === 'var' ? n.args[3].n : 'x';
    if (n.n === 'nderiv') return n.args[2] && n.args[2].t === 'var' ? n.args[2].n : 'x';
    return 'x';
  }
  function calledFns(node) {
    const out = new Set();
    walk(node, (n) => { if (n.t === 'call' && !BUILTINS.has(n.n) && !SPECIAL.has(n.n)) out.add(n.n); });
    return out;
  }

  // Replace f(args) with f*args when f is not a function
  function resolve(node, fnNames) {
    const rec = (n) => {
      if (!n) return n;
      switch (n.t) {
        case 'bin': return { t: 'bin', op: n.op, a: rec(n.a), b: rec(n.b) };
        case 'neg': return { t: 'neg', a: rec(n.a) };
        case 'fact': return { t: 'fact', a: rec(n.a) };
        case 'tuple': return { t: 'tuple', items: n.items.map(rec) };
        case 'rel': return { t: 'rel', ops: n.ops, parts: n.parts.map(rec) };
        case 'list': return { t: 'list', items: n.items.map(rec) };
        case 'range': return { t: 'range', a: rec(n.a), next: n.next ? rec(n.next) : undefined, b: rec(n.b) };
        case 'index': return { t: 'index', a: rec(n.a), idx: rec(n.idx) };
        case 'pw': return { t: 'pw', cases: n.cases.map((c) => ({ cond: rec(c.cond), val: rec(c.val) })), def: rec(n.def) };
        case 'call': {
          const args = n.args.map(rec);
          if (BUILTINS.has(n.n) || SPECIAL.has(n.n) || n.n === 'logb') return { t: 'call', n: n.n, args, primes: n.primes || 0 };
          if (fnNames.has(n.n)) return { t: 'call', n: n.n, args, primes: n.primes || 0 };
          if (n.primes) throw new MathError(`${n.n} is not a function`);
          if (args.length !== 1) {
            if (args.length === 0) throw new MathError(`${n.n}() has no arguments`);
            return { t: 'bin', op: '*', a: { t: 'var', n: n.n }, b: { t: 'tuple', items: args } };
          }
          return { t: 'bin', op: '*', a: { t: 'var', n: n.n }, b: args[0] };
        }
        default: return n;
      }
    };
    return rec(node);
  }

  /* ---------------- code generation ---------------- */
  const jsId = (name) => 'L_' + name.replace(/[^A-Za-z0-9_]/g, (c) => '$' + c.charCodeAt(0).toString(16));

  function listValued(n, locals) {
    locals = locals || new Set();
    switch (n.t) {
      case 'list': case 'range': return true;
      case 'var': return !locals.has(n.n) && LISTVARS.has(n.n);
      case 'index': return listValued(n.a, locals) && (n.idx.t === 'range' || n.idx.t === 'rel' || listValued(n.idx, locals));
      case 'neg': case 'fact': return listValued(n.a, locals);
      case 'bin': return listValued(n.a, locals) || listValued(n.b, locals);
      case 'tuple': return n.items.some((i) => listValued(i, locals));
      case 'call':
        if (n.n === 'sort' || n.n === 'unique' || n.n === 'join' || n.n === 'shuffle' || (n.n === 'random' && n.args.length)) return true;
        if (AGG.has(n.n) || SPECIAL.has(n.n)) return false;
        return n.args.some((a) => listValued(a, locals));
      default: return false;
    }
  }
  const REAL_OF_COMPLEX = new Set(['abs', 'arg', 'real', 'imag']);
  function complexValued(n, locals) {
    locals = locals || new Set();
    switch (n.t) {
      case 'var': return !locals.has(n.n) && (n.n === 'i' || CXVARS.has(n.n));
      case 'call':
        if (REAL_OF_COMPLEX.has(n.n)) return false;
        if (CXFUNCS.has(n.n)) return true;
        if (SPECIAL.has(n.n)) return false;
        return n.args.some((a) => complexValued(a, locals));
      default: return kids(n).some((k) => complexValued(k, locals));
    }
  }
  function touches(n, locals) {
    switch (n.t) {
      case 'list': case 'range': case 'index': return true;
      case 'var': return !locals.has(n.n) && (n.n === 'i' || LISTVARS.has(n.n) || CXVARS.has(n.n));
      case 'call': if (AGG_ALWAYS.has(n.n) || (n.n === 'random' && n.args.length) || CXFUNCS.has(n.n)) return true; return n.args.some((a) => touches(a, locals));
      default: return kids(n).some((k) => touches(k, locals));
    }
  }
  function gen(n, locals) { return touches(n, locals) ? genL(n, locals) : genFast(n, locals); }
  function genL(n, locals) {
    const g = (x) => gen(x, locals);
    switch (n.t) {
      case 'list': return '[' + n.items.map(g).join(',') + ']';
      case 'range': return `H.range(${g(n.a)},${g(n.b)}${n.next ? ',' + g(n.next) : ''})`;
      case 'index': return `H.index(${g(n.a)},${g(n.idx)})`;
      case 'neg': return `H.neg(${g(n.a)})`;
      case 'fact': return `H.bc(R.factorial,[${g(n.a)}])`;
      case 'bin': return `H.bop(${JSON.stringify(n.op)},${g(n.a)},${g(n.b)})`;
      case 'tuple': return n.items.length === 2 ? `H.pt(${g(n.items[0])},${g(n.items[1])})` : '[' + n.items.map(g).join(',') + ']';
      case 'rel': {
        const ps = n.parts.map(g);
        const cs = n.ops.map((op, i) => `H.cmp(${JSON.stringify(op)},${ps[i]},${ps[i + 1]})`);
        return cs.length === 1 ? cs[0] : `H.land(${cs.join(',')})`;
      }
      case 'call': {
        if (SPECIAL.has(n.n)) return genFast(n, locals);
        const a = n.args.map(g).join(',');
        if (AGG.has(n.n)) return `R.${n.n}(${a})`;
        if (n.n === 'logb') return `H.bc(R.logb,[${a}])`;
        if (BUILTINS.has(n.n)) return `H.bcf(${JSON.stringify(ALIAS[n.n] || n.n)},[${a}])`;
        return `H.bc(F[${JSON.stringify(n.n)}],[${a}])`;
      }
      default: return genFast(n, locals);
    }
  }
  function genFast(n, locals) {
    switch (n.t) {
      case 'num': return Number.isFinite(n.v) ? '(' + n.v + ')' : (n.v > 0 ? 'Infinity' : '-Infinity');
      case 'var':
        if (locals.has(n.n)) return jsId(n.n);
        if (n.n === 'i') return 'H.I';
        if (n.n in CONSTS) return n.n === 'infinity' ? 'Infinity' : '(' + CONSTS[n.n] + ')';
        return `V[${JSON.stringify(n.n)}]`;
      case 'neg': return '(-' + gen(n.a, locals) + ')';
      case 'fact': return `R.factorial(${gen(n.a, locals)})`;
      case 'bin': {
        const a = gen(n.a, locals), b = gen(n.b, locals);
        if (n.op === '^') return `R.pow(${a},${b})`;
        return `(${a}${n.op}${b})`;
      }
      case 'tuple': return n.items.length === 2 ? `H.pt(${gen(n.items[0], locals)},${gen(n.items[1], locals)})` : '[' + n.items.map((i) => gen(i, locals)).join(',') + ']';
      case 'rel': {
        const ps = n.parts.map((p) => gen(p, locals));
        const chunks = [];
        for (let i = 0; i < n.ops.length; i++) {
          let op = n.ops[i];
          if (op === '=') op = '===';
          if (op === '!=') op = '!==';
          const A = ps[i], B = ps[i + 1];
          chunks.push(n.ops[i] === '=' ? `(Math.abs(${A}-${B})<1e-9)` : `(${A}${op}${B})`);
        }
        return '(' + chunks.join('&&') + ')';
      }
      case 'pw': {
        let s = n.def ? gen(n.def, locals) : 'NaN';
        for (let i = n.cases.length - 1; i >= 0; i--) {
          s = `(${gen(n.cases[i].cond, locals)}?${gen(n.cases[i].val, locals)}:${s})`;
        }
        return s;
      }
      case 'call': {
        const args = n.args;
        if (n.n === 'sum' || n.n === 'prod') {
          if (args.length !== 4) throw new MathError(`${n.n}(var, from, to, expr)`);
          const v = specialVar(n);
          const inner = new Set(locals); inner.add(v);
          const isSum = n.n === 'sum';
          return `((lo,hi)=>{let s=${isSum ? 0 : 1};if(hi-lo>1e6)return NaN;for(let ${jsId(v)}=Math.ceil(lo);${jsId(v)}<=hi;${jsId(v)}++){${touches(args[3], inner) ? `s=H.bop('${isSum ? '+' : '*'}',s,${gen(args[3], inner)})` : `s${isSum ? '+' : '*'}=${gen(args[3], inner)}`};}return s;})(${gen(args[1], locals)},${gen(args[2], locals)})`;
        }
        if (n.n === 'int') {
          if (args.length < 3) throw new MathError('int(from, to, expr)');
          const v = specialVar(n);
          const inner = new Set(locals); inner.add(v);
          return `((a,b)=>{const N=400,h=(b-a)/N;const f=(${jsId(v)})=>${gen(args[2], inner)};let s=f(a)+f(b);for(let i=1;i<N;i++)s+=f(a+i*h)*(i%2?4:2);return s*h/3;})(${gen(args[0], locals)},${gen(args[1], locals)})`;
        }
        if (n.n === 'nderiv') {
          if (args.length < 2) throw new MathError('nderiv(expr, at)');
          const v = specialVar(n);
          const inner = new Set(locals); inner.add(v);
          return `((p)=>{const f=(${jsId(v)})=>${gen(args[0], inner)};const h=1e-5*Math.max(1,Math.abs(p));return (f(p+h)-f(p-h))/(2*h);})(${gen(args[1], locals)})`;
        }
        const a = args.map((x) => gen(x, locals)).join(',');
        if (n.n === 'logb') return `R.logb(${a})`;
        if (BUILTINS.has(n.n)) {
          const real = ALIAS[n.n] || n.n;
          return `R.${real}(${a})`;
        }
        if (n.primes) return `R.deriv(F[${JSON.stringify(n.n)}],${n.primes},${a})`;
        return `F[${JSON.stringify(n.n)}](${a})`;
      }
      default: throw new MathError('Cannot compile ' + n.t);
    }
  }

  const V = Object.create(null); // variable values
  const F = Object.create(null); // user functions

  function compile(ast, params) {
    const locals = new Set(params);
    const body = gen(ast, locals);
    const plist = params.map(jsId).join(',');
    // eslint-disable-next-line no-new-func
    return new Function('R', 'V', 'F', 'H', `"use strict"; return (${plist})=>{try{return ${body};}catch(e){return NaN;}};`)(R, V, F, H);
  }

  /* ---------------- number formatting ---------------- */
  function fmt(v, digits) {
    digits = digits || 8;
    if (typeof v !== 'number' || Number.isNaN(v)) return 'undefined';
    if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e9 || a < 1e-6) return v.toExponential(Math.min(digits - 1, 6)).replace(/\.?0+e/, 'e').replace('e+', 'e');
    let s = parseFloat(v.toPrecision(digits)).toString();
    return s;
  }

  global.ME = {
    R, V, F, BUILTINS, CONSTS, MathError, parseStatement, resolve, compile, freeVars, calledFns,
    walk, fmt, DEG, tokenize, gen, LISTVARS, CXVARS, CXFUNCS, listValued, complexValued, Pt, Cx, H, kids,
  };
})(window);
