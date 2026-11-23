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

  const ALIAS = {
    arcsin: 'asin', arccos: 'acos', arctan: 'atan', arccot: 'acot', arcsec: 'asec', arccsc: 'acsc',
    arsinh: 'asinh', arcosh: 'acosh', artanh: 'atanh', arcsinh: 'asinh', arccosh: 'acosh', arctanh: 'atanh',
    ncr: 'nCr', npr: 'nPr', lg: 'log', sgn: 'sign', cosec: 'csc', ctg: 'cot', tg: 'tan', ceiling: 'ceil',
  };
  const BUILTINS = new Set(Object.keys(R).filter((k) => typeof R[k] === 'function' &&
    !['pow', 'deriv', 'logb'].includes(k)));
  Object.keys(ALIAS).forEach((k) => BUILTINS.add(k));
  const SPECIAL = new Set(['sum', 'prod', 'int', 'nderiv']);
  const CONSTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI, infinity: Infinity };

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
        const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
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
        // split the letter run into known names / single letters
        let p = 0;
        while (p < run.length) {
          let name = null, len = 1;
          for (let L = Math.min(run.length - p, 10); L >= 1; L--) {
            const cand = run.slice(p, p + L);
            const isLast = p + L === run.length;
            const full = isLast && sub ? cand + '_' + sub : cand;
            if (known.has(full)) { name = full; len = L; break; }
            if (L > 1 && known.has(cand)) { name = cand; len = L; break; }
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
      if (ch === '(' || ch === '[') { toks.push({ t: 'lp' }); i++; continue; }
      if (ch === ')' || ch === ']') { toks.push({ t: 'rp' }); i++; continue; }
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
  function walk(node, fn) {
    if (!node) return;
    fn(node);
    switch (node.t) {
      case 'bin': walk(node.a, fn); walk(node.b, fn); break;
      case 'neg': case 'fact': walk(node.a, fn); break;
      case 'call': node.args.forEach((a) => walk(a, fn)); break;
      case 'tuple': node.items.forEach((a) => walk(a, fn)); break;
      case 'pw': node.cases.forEach((c) => { walk(c.cond, fn); walk(c.val, fn); }); walk(node.def, fn); break;
      case 'rel': node.parts.forEach((a) => walk(a, fn)); break;
      default: break;
    }
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
        default: break;
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

  function gen(n, locals) {
    switch (n.t) {
      case 'num': return Number.isFinite(n.v) ? '(' + n.v + ')' : (n.v > 0 ? 'Infinity' : '-Infinity');
      case 'var':
        if (locals.has(n.n)) return jsId(n.n);
        if (n.n in CONSTS) return n.n === 'infinity' ? 'Infinity' : '(' + CONSTS[n.n] + ')';
        return `V[${JSON.stringify(n.n)}]`;
      case 'neg': return '(-' + gen(n.a, locals) + ')';
      case 'fact': return `R.factorial(${gen(n.a, locals)})`;
      case 'bin': {
        const a = gen(n.a, locals), b = gen(n.b, locals);
        if (n.op === '^') return `R.pow(${a},${b})`;
        return `(${a}${n.op}${b})`;
      }
      case 'tuple': return '[' + n.items.map((i) => gen(i, locals)).join(',') + ']';
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
          return `((lo,hi)=>{let s=${isSum ? 0 : 1};if(hi-lo>1e6)return NaN;for(let ${jsId(v)}=Math.ceil(lo);${jsId(v)}<=hi;${jsId(v)}++){s${isSum ? '+' : '*'}=${gen(args[3], inner)};}return s;})(${gen(args[1], locals)},${gen(args[2], locals)})`;
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
    return new Function('R', 'V', 'F', `"use strict"; return (${plist})=>{try{return ${body};}catch(e){return NaN;}};`)(R, V, F);
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
    walk, fmt, DEG, tokenize, gen,
  };
})(window);
