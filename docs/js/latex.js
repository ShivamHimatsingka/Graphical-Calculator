/* ==========================================================
   LaTeX <-> calculator-text converters for the live formula editor.
   latexToText(tex)  : what MathLive produces  -> text the math engine parses
   textToLatex(text) : stored expression text  -> LaTeX to load into the editor
   Exposes window.LX (also usable from Node for tests).
   ========================================================== */
(function (global) {
  'use strict';

  const GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', iota: 'ι', kappa: 'κ',
    lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', rho: 'ρ', sigma: 'σ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  };
  const FUNCS = {
    sin: 'sin', cos: 'cos', tan: 'tan', sec: 'sec', csc: 'csc', cot: 'cot', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', coth: 'coth',
    arcsin: 'asin', arccos: 'acos', arctan: 'atan', arccot: 'acot', arcsec: 'asec', arccsc: 'acsc',
    ln: 'ln', log: 'log', exp: 'exp', min: 'min', max: 'max', gcd: 'gcd', lcm: 'lcm', lg: 'log', sgn: 'sign',
  };
  const SIMPLE = {
    cdot: '*', times: '*', ast: '*', div: '/', le: '<=', leq: '<=', leqslant: '<=', ge: '>=', geq: '>=', geqslant: '>=',
    ne: '!=', neq: '!=', lt: '<', gt: '>', sim: '~', pi: 'pi', theta: 'theta', vartheta: 'theta', tau: 'tau', infty: 'infinity',
    ldots: '...', dots: '...', cdots: '...', ldotp: '...', degree: '°', circ: '°', prime: "'", lbrace: '{', rbrace: '}',
    '{': '{', '}': '}', lbrack: '[', rbrack: ']', vert: '|', mid: '|', '|': '|', '%': '%', '#': '', '&': '', '$': '',
    ',': '', ';': '', '!': '', ':': '', ' ': '', quad: '', qquad: '', space: '', '\\': '',
    pm: '±', rightarrow: '->', to: '->', mapsto: '->', longrightarrow: '->',
  };

  function tokenize(t) {
    const out = [];
    let i = 0;
    while (i < t.length) {
      const ch = t[i];
      if (ch === '\\') {
        let j = i + 1;
        if (/[A-Za-z]/.test(t[j] || '')) { while (/[A-Za-z]/.test(t[j] || '')) j++; out.push({ c: 'cmd', v: t.slice(i + 1, j) }); i = j; }
        else { out.push({ c: 'cmd', v: t[i + 1] || '' }); i += 2; }
      } else if (ch === '{') { out.push({ c: '{' }); i++; }
      else if (ch === '}') { out.push({ c: '}' }); i++; }
      else if (ch === '^') { out.push({ c: '^' }); i++; }
      else if (ch === '_') { out.push({ c: '_' }); i++; }
      else if (/\s/.test(ch)) { i++; }
      else { out.push({ c: 'ch', v: ch }); i++; }
    }
    return out;
  }

  const isSimple = (s) => /^(?:[0-9]+(?:\.[0-9]+)?|[A-Za-zͰ-Ͽ])$/.test(s);
  const wrap = (s) => (isSimple(s) ? s : `(${s})`);
  const isPrimes = (s) => /^'+$/.test(s);

  function latexToText(tex) {
    const ts = tokenize(String(tex || ''));
    const st = { i: 0 };

    function parseArg() {
      const t = ts[st.i];
      if (!t) return '';
      if (t.c === '{') { st.i++; const s = parseSeq(true); if (ts[st.i] && ts[st.i].c === '}') st.i++; return s; }
      return parseOne();
    }
    function parseOne() {
      const t = ts[st.i];
      if (!t || t.c === '}') return '';
      st.i++;
      switch (t.c) {
        case 'ch': return t.v;
        case '{': { const s = parseSeq(true); if (ts[st.i] && ts[st.i].c === '}') st.i++; return s; }
        case '^': case '_': return '';
        case 'cmd': return command(t.v);
        default: return '';
      }
    }
    function maybeLimits() {
      let sub = null, sup = null;
      for (let k = 0; k < 2; k++) {
        const t = ts[st.i];
        if (t && t.c === '_' && sub === null) { st.i++; sub = parseArg(); }
        else if (t && t.c === '^' && sup === null) { st.i++; sup = parseArg(); }
        else break;
      }
      return { sub, sup };
    }
    function command(name) {
      switch (name) {
        case 'left': case 'right': { const n = ts[st.i]; if (n && n.c === 'ch' && n.v === '.') st.i++; return ''; }
        case 'frac': case 'dfrac': case 'tfrac': { const a = parseArg(), b = parseArg(); return `(${wrap(a)}/${wrap(b)})`; }
        case 'sqrt': {
          let n = null;
          if (ts[st.i] && ts[st.i].c === 'ch' && ts[st.i].v === '[') {
            st.i++; let s = '';
            while (ts[st.i] && !(ts[st.i].c === 'ch' && ts[st.i].v === ']')) s += parseOne();
            st.i++; n = s;
          }
          const a = parseArg();
          if (n !== null) return n === '2' ? `sqrt(${a})` : n === '3' ? `cbrt(${a})` : `(${a})^(1/(${n}))`;
          return `sqrt(${a})`;
        }
        case 'operatorname': case 'mathrm': case 'text': case 'mathit': case 'mathbf': case 'textrm': case 'mbox': case 'operatorname*': return parseArg();
        case 'placeholder': parseArg(); return '';
        case 'sum': case 'prod': {
          const { sub, sup } = maybeLimits();
          const body = parseSeq(true, true);
          const m = sub && /^([A-Za-zͰ-Ͽ](?:_\w+)?)=(.*)$/.exec(sub);
          if (m && sup !== null) return `${name}(${m[1]},${m[2]},${sup},${body})`;
          return name + '(' + body + ')';
        }
        case 'int': {
          const { sub, sup } = maybeLimits();
          let body = parseSeq(true, true);
          let v = 'x';
          const dm = /^(.*?)d([A-Za-z])$/.exec(body);
          if (dm) { body = dm[1]; v = dm[2]; }
          if (sub !== null && sup !== null) return `int(${sub},${sup},${body}${v !== 'x' ? ',' + v : ''})`;
          return `int(${body})`;
        }
        case 'lim': return 'lim';
        default: break;
      }
      if (name in FUNCS) return FUNCS[name];
      if (name in GREEK) return GREEK[name];
      if (name in SIMPLE) return SIMPLE[name];
      return '';
    }

    function parseSeq(stopAtBrace, toEnd) {
      let out = '';
      while (st.i < ts.length) {
        const t = ts[st.i];
        if (t.c === '}') { if (stopAtBrace) break; st.i++; continue; }
        if (t.c === ',' && toEnd) break;
        if (t.c === 'ch' && toEnd && (t.v === ',' || t.v === '=' || t.v === '<' || t.v === '>')) break;
        if (t.c === '^') {
          st.i++;
          const a = parseArg();
          if (isPrimes(a)) out += a; else out += '^' + (isSimple(a) ? a : `(${a})`);
          continue;
        }
        if (t.c === '_') {
          st.i++;
          const a = parseArg();
          out += '_' + (/^[0-9]+$/.test(a) || a.length === 1 ? a : `{${a}}`);
          continue;
        }
        out += parseOne();
      }
      return out;
    }

    return parseSeq(false).replace(/\s+/g, ' ').trim();
  }

  /* ---------- text -> LaTeX ---------- */
  const LATEX_FN = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'coth', 'ln', 'log', 'exp', 'min', 'max', 'gcd']);
  const KNOWN_FN = new Set(['asin', 'acos', 'atan', 'acot', 'asec', 'acsc', 'asinh', 'acosh', 'atanh', 'abs', 'floor', 'ceil', 'round', 'sign', 'mod', 'nCr', 'nPr',
    'cbrt', 'total', 'mean', 'median', 'count', 'length', 'stdev', 'stdevp', 'variance', 'varp', 'mad', 'quartile', 'corr', 'cov', 'sort', 'unique', 'join',
    'shuffle', 'random', 'normpdf', 'normcdf', 'invnorm', 'binompdf', 'binomcdf', 'poissonpdf', 'poissoncdf', 'exppdf', 'expcdf', 'unifpdf', 'unifcdf', 'erf',
    'sum', 'prod', 'int', 'nderiv', 'real', 'imag', 'conj', 'arg', 'lcm', 'hypot', 'fract', 'trunc', 'sinh', 'exp2', 'log2', 'atan2', 'factorial', 'gamma', 'rad', 'degrees']);
  const ARC = { asin: 'arcsin', acos: 'arccos', atan: 'arctan', acot: 'arccot', asec: 'arcsec', acsc: 'arccsc' };

  function matching(s, open) {
    let d = 0;
    for (let j = open; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')') { d--; if (d === 0) return j; } }
    return -1;
  }
  function textToLatex(text) {
    const s = String(text || '');
    let out = '', i = 0;
    const sub = () => { // subscript operand at s[i] (after '_')
      if (s[i] === '{') { const j = s.indexOf('}', i); const inner = j < 0 ? s.slice(i + 1) : s.slice(i + 1, j); i = j < 0 ? s.length : j + 1; return `_{${inner}}`; }
      const m = /^(?:[0-9]+|[A-Za-z])/.exec(s.slice(i)); if (!m) return '_{}'; i += m[0].length; return `_{${m[0]}}`;
    };
    const operand = () => {
      if (s[i] === '(') { const j = matching(s, i); const inner = j < 0 ? s.slice(i + 1) : s.slice(i + 1, j); i = j < 0 ? s.length : j + 1; return textToLatex(inner); }
      const m = /^-?(?:[0-9.]+|[A-Za-zͰ-Ͽ]+(?:_(?:\{[^}]*\}|[0-9]+|[A-Za-z]))?)/.exec(s.slice(i));
      if (!m) return ''; i += m[0].length; return textToLatex(m[0]);
    };
    while (i < s.length) {
      const ch = s[i];
      if (/[A-Za-z]/.test(ch)) {
        let j = i; while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
        let run = s.slice(i, j);
        // digits that belong to function names (log2, atan2)
        const dm = /^[0-9]+/.exec(s.slice(j));
        if (dm && KNOWN_FN.has(run + dm[0])) { out += `\\operatorname{${run + dm[0]}}`; i = j + dm[0].length; continue; }
        if (s[j] === '_' && /^log$/.test(run)) { i = j + 1; out += '\\log' + sub(); continue; }
        // split run into known tokens
        let p = 0;
        while (p < run.length) {
          let matched = false;
          for (let L = Math.min(run.length - p, 10); L >= 2; L--) {
            const cand = run.slice(p, p + L);
            if (cand === 'pi') { out += '\\pi '; p += L; matched = true; break; }
            if (cand === 'theta') { out += '\\theta '; p += L; matched = true; break; }
            if (cand === 'tau') { out += '\\tau '; p += L; matched = true; break; }
            if (cand === 'infinity') { out += '\\infty '; p += L; matched = true; break; }
            if (cand === 'sqrt' && s[j] === '(' && p + L === run.length) {
              const open = j, close = matching(s, open);
              const inner = close < 0 ? s.slice(open + 1) : s.slice(open + 1, close);
              out += `\\sqrt{${textToLatex(inner)}}`; i = close < 0 ? s.length : close + 1; p = run.length; j = i; matched = 'done'; break;
            }
            if (LATEX_FN.has(cand)) { out += `\\${cand} `; p += L; matched = true; break; }
            if (ARC[cand]) { out += `\\${ARC[cand]} `; p += L; matched = true; break; }
            if (KNOWN_FN.has(cand)) { out += `\\operatorname{${cand}}`; p += L; matched = true; break; }
          }
          if (matched === 'done') break;
          if (!matched) { out += run[p]; p++; }
        }
        if (i < j) i = j;
        continue;
      }
      if (ch === '^') { i++; const o = operand(); out += `^{${o}}`; continue; }
      if (ch === '_') { i++; out += sub(); continue; }
      if (ch === '<' && s[i + 1] === '=') { out += '\\le '; i += 2; continue; }
      if (ch === '>' && s[i + 1] === '=') { out += '\\ge '; i += 2; continue; }
      if (ch === '!' && s[i + 1] === '=') { out += '\\ne '; i += 2; continue; }
      if (ch === '*') { out += '\\cdot '; i++; continue; }
      if (ch === '~') { out += '\\sim '; i++; continue; }
      if (s.startsWith('...', i)) { out += '\\ldots '; i += 3; continue; }
      if (ch === '{') { out += '\\lbrace '; i++; continue; }
      if (ch === '}') { out += '\\rbrace '; i++; continue; }
      if (ch === 'π') { out += '\\pi '; i++; continue; }
      if (ch === 'θ') { out += '\\theta '; i++; continue; }
      if (ch === '°') { out += '\\degree '; i++; continue; }
      if (ch === ' ') { i++; continue; }
      if (ch === '%' || ch === '#' || ch === '$' || ch === '&' || ch === '\\') { i++; continue; }
      if (ch === "'") { out += "'"; i++; continue; }
      out += ch; i++;
    }
    return out;
  }

  global.LX = { latexToText, textToLatex };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.LX;
})(typeof window !== 'undefined' ? window : globalThis);
