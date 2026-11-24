/* ==========================================================
   Ask: turn a question or word problem into editable graph rows.
   1. A built-in rule engine (no network) handles common requests.
   2. Otherwise a Pollinations model (free key, called straight from the browser)
      returns JSON rows + an explanation; rows are validated by the calculator's
      own parser and repaired if needed.
   3. Numbers in the answer (zeros, extrema, intersections) are computed by the
      calculator itself and shown as "Verified results".
   Pure helpers (rules, parseReply, facts) are usable from Node for tests.
   Exposes window.Ask
   ========================================================== */
(function (global) {
  'use strict';

  const Ask = { config: { publishableKey: '' } };
  const LS = 'graphical-calculator-ask-';
  const store = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* ignore */ } } };

  const fmtN = (v) => { if (!Number.isFinite(v)) return String(v); if (Math.abs(v) < 1e-9) return '0'; return String(parseFloat(v.toPrecision(5))); };
  const num = (s) => parseFloat(String(s).replace(/[−–]/g, '-'));

  /* ---------------- system prompt ---------------- */
  Ask.SYSTEM_PROMPT = `You are the graphing assistant inside a web graphing calculator (like Desmos). Turn the user's question (maths, science, or a word problem) into rows the calculator can plot, and explain the answer clearly for any learner.

Reply with ONE JSON object and nothing else:
{"title":"short folder title","explanation":"markdown","rows":[{"text":"calculator expression"}],"window":{"xmin":-10,"xmax":10,"ymin":-10,"ymax":10}}
("window" is optional.)

Rules for rows (plain text, NOT LaTeX, one expression per row):
- x is the horizontal axis, y the vertical. Operators + - * / ^ . Functions: sqrt(x) abs(x) sin cos tan asin acos atan ln log exp floor, constants pi and e. Implicit multiplication is fine (2x, 3(x+1)).
- Functions: y=2x+3   x=y^2   y=sin(x)   f(x)=x^2-4   r=2sin(3theta)   (cos(t),sin(t)){0<=t<=2pi}   x^2+y^2=25
- Inequalities and regions: y>x^2   1<x<3   x^2+y^2<=9
- Restrictions: y=x^2{x>0}   piecewise: y={x<0:-x, x^2}   domain: y=sqrt(x){0<=x<=9}
- Parameters become sliders: put each in its own row first (a=1, or a=2 {0<=a<=5}), then use it (y=a x^2).
- Points (2,3). Lists [1,2,3]. 3D: z=x^2+y^2 or (cos(t),sin(t),t/3){0<=t<=6}.
- Rows must contain only mathematics: no words, units, $ or % signs. Use plain numbers (write 0.07 for 7%).
- Word problems: let x be the independent quantity (time, distance, number of items) and y the dependent one. Say in the explanation what x and y mean, with units. Graph every relationship in the problem as its own row, and graph any constraint or comparison line (for example a budget limit or a second option) so the answer shows up where curves cross.
- Do NOT work out final numeric answers in the explanation. The calculator computes zeros, maxima and intersections itself and shows them under "Verified results"; just refer to them ("the curves cross at the point marked on the graph").
Explanation: friendly, step by step, numbered steps, short paragraphs, at most 220 words, use \`backticks\` around any maths. If nothing can be drawn, say why and return "rows":[].`;

  /* ---------------- reply parsing ---------------- */
  Ask.parseReply = (text) => {
    if (!text) return null;
    let s = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    let obj; try { obj = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
    if (!obj || typeof obj !== 'object') return null;
    const clean = (t) => {
      let r = String(t || '').trim();
      if (/\\/.test(r) && global.LX) r = global.LX.latexToText(r);
      return r.replace(/−/g, '-').slice(0, 220);
    };
    const rows = (Array.isArray(obj.rows) ? obj.rows : []).map((r) => (typeof r === 'string' ? { text: clean(r) } : { text: clean(r && r.text), label: r && r.label ? String(r.label).slice(0, 60) : '' })).filter((r) => r.text).slice(0, 14);
    let win = null;
    if (obj.window && ['xmin', 'xmax', 'ymin', 'ymax'].every((k) => Number.isFinite(+obj.window[k])) && +obj.window.xmax > +obj.window.xmin && +obj.window.ymax > +obj.window.ymin) {
      win = { xmin: +obj.window.xmin, xmax: +obj.window.xmax, ymin: +obj.window.ymin, ymax: +obj.window.ymax };
    }
    return { title: String(obj.title || 'Ask').slice(0, 60), explanation: String(obj.explanation || '').slice(0, 4000), rows, window: win };
  };

  /* ---------------- verified facts (computed by the calculator) ---------------- */
  // fxs: [{ label, f(x) }]  -> { lines:[...], points:[{x,y,label}] }
  Ask.facts = (fxs, range) => {
    const lo = range ? range.lo : -50, hi = range ? range.hi : 50, N = 4000;
    const lines = [], points = [];
    const ok = (v) => Number.isFinite(v) && Math.abs(v) < 1e8;
    const sample = (f) => { const xs = [], ys = []; for (let i = 0; i <= N; i++) { const x = lo + (hi - lo) * i / N; xs.push(x); const y = f(x); ys.push(ok(y) ? y : NaN); } return { xs, ys }; };
    const bisect = (h, a, b) => { let ha = h(a); for (let k = 0; k < 60; k++) { const m = (a + b) / 2, hm = h(m); if (!Number.isFinite(hm)) return NaN; if ((ha < 0) === (hm < 0)) { a = m; ha = hm; } else b = m; } return (a + b) / 2; };
    const roots = (h, xs, ys, tolScale) => {
      const out = [];
      for (let i = 0; i < N; i++) {
        const a = ys[i], b = ys[i + 1];
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        if (a === 0) { out.push(xs[i]); continue; }
        if (a * b < 0) { const r = bisect(h, xs[i], xs[i + 1]); if (Number.isFinite(r) && Math.abs(h(r)) < 1e-6 * (1 + tolScale)) out.push(r); }
      }
      return out.filter((r, i, arr) => !i || Math.abs(r - arr[i - 1]) > 1e-7);
    };
    const S = fxs.map((q) => Object.assign({ s: sample(q.f) }, q));
    for (const q of S) {
      const { xs, ys } = q.s;
      const zs = roots(q.f, xs, ys, 1).slice(0, 4);
      if (zs.length) { lines.push(`**${q.label}** crosses the x-axis at x = ${zs.map(fmtN).join(', ')}.`); zs.forEach((z) => points.push({ x: z, y: 0, kind: 'zero' })); }
      const y0 = q.f(0); if (ok(y0) && lo <= 0 && hi >= 0) lines.push(`**${q.label}** crosses the y-axis at y = ${fmtN(y0)}.`);
      const ext = [];
      for (let i = 1; i < N; i++) { const a = ys[i - 1], b = ys[i], c = ys[i + 1]; if ([a, b, c].every(Number.isFinite) && (b - a) * (c - b) < 0 && Math.abs(b) < 1e6) { let l = xs[i - 1], r = xs[i + 1]; const max = b > a; for (let k = 0; k < 80; k++) { const m1 = l + (r - l) / 3, m2 = r - (r - l) / 3; if (max ? q.f(m1) < q.f(m2) : q.f(m1) > q.f(m2)) l = m1; else r = m2; } const xm = (l + r) / 2; ext.push({ x: xm, y: q.f(xm), max }); } }
      ext.slice(0, 3).forEach((e) => { lines.push(`**${q.label}** has a ${e.max ? 'maximum' : 'minimum'} at (${fmtN(e.x)}, ${fmtN(e.y)}).`); points.push({ x: e.x, y: e.y, kind: e.max ? 'max' : 'min' }); });
    }
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const A = S[i], B = S[j], h = (x) => A.f(x) - B.f(x);
      const ys = A.s.ys.map((v, k) => (Number.isFinite(v) && Number.isFinite(B.s.ys[k]) ? v - B.s.ys[k] : NaN));
      const fin = ys.filter(Number.isFinite); if (fin.length && fin.filter((d) => Math.abs(d) < 1e-9).length > fin.length * 0.5) continue; // same curve
      const rs = roots(h, A.s.xs, ys, 1).slice(0, 4);
      if (rs.length) { lines.push(`**${A.label}** and **${B.label}** meet at ${rs.map((r) => `(${fmtN(r)}, ${fmtN(A.f(r))})`).join(' and ')}.`); rs.forEach((r) => points.push({ x: r, y: A.f(r), kind: 'int' })); }
      else if (fxs.length === 2) lines.push(`**${A.label}** and **${B.label}** do not cross in this range.`);
    }
    const order = { int: 0, max: 1, min: 1, zero: 2 };
    const seen = new Set();
    points.forEach((p) => { if (Math.abs(p.x) < 1e-7) p.x = 0; if (Math.abs(p.y) < 1e-7) p.y = 0; });
    const pts = points.sort((a, b) => order[a.kind] - order[b.kind]).filter((p) => { const k = fmtN(p.x) + ',' + fmtN(p.y); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
    return { lines, points: pts };
  };

  /* ---------------- rule engine (no network) ---------------- */
  const POINT = '\\(\\s*(-?[\\d.]+)\\s*,\\s*(-?[\\d.]+)\\s*\\)';
  const norm = (t) => String(t).replace(/[−–]/g, '-').replace(/²/g, '^2').replace(/³/g, '^3').replace(/×/g, '*').replace(/÷/g, '/').replace(/[“”]/g, '"').trim();
  const stripTail = (e) => e.replace(/\s+(on the same|on one|together|on a graph|on the graph|on the same axes|please|for me)\b.*$/i, '').replace(/[.?!]+$/, '').trim();
  const looksMath = (ME, e) => { try { const st = ME.parseStatement(e, []); return !!st && (st.ops.length > 0 || /[xy]/.test(e)); } catch (err) { return false; } };
  // only accept text that is really mathematics: every word of 3+ letters must be a known function or constant
  const wordsOK = (ME, e) => (String(e).match(/[A-Za-z]{3,}/g) || []).every((w) => { const l = w.toLowerCase(); return ME.BUILTINS.has(l) || ME.BUILTINS.has(w) || ['pi', 'tau', 'theta', 'rho', 'phi', 'infinity', 'ddx', 'int', 'sum', 'prod', 'for'].includes(l); });
  const ok = (ME, e) => { try { ME.parseStatement(e, []); return wordsOK(ME, e); } catch (err) { return false; } };
  const toFn = (ME, expr) => { try { const st = ME.parseStatement(expr, []); return ME.compile(ME.resolve(st.parts[0], new Set()), ['x']); } catch (e) { return null; } };
  const sign = (v) => (v < 0 ? '-' : '+');
  const plan = (title, rows, explanation, extra) => Object.assign({ title, rows: rows.map((t) => (typeof t === 'string' ? { text: t } : t)), explanation, source: 'rules' }, extra || {});

  Ask.rules = (input, ME) => {
    const raw = norm(input), q = raw.toLowerCase();
    if (!raw) return null;
    let m;

    // circle
    if ((m = /circle[^.]*?radius\s*(?:of|=)?\s*(-?[\d.]+)/.exec(q)) || (m = /radius\s*(?:of|=)?\s*(-?[\d.]+)[^.]*circle/.exec(q))) {
      const r = num(m[1]); const c = new RegExp(POINT).exec(q); const h = c ? num(c[1]) : 0, k = c ? num(c[2]) : 0;
      if (r > 0) {
        const hs = h === 0 ? 'x' : `(x${sign(-h)}${Math.abs(h)})`, ks = k === 0 ? 'y' : `(y${sign(-k)}${Math.abs(k)})`;
        return plan(`Circle r=${r}`, [`${hs}^2+${ks}^2=${r * r}`], `**A circle** with centre \`(${h}, ${k})\` and radius \`${r}\` has the equation \`(x - h)^2 + (y - k)^2 = r^2\`.\n\n1. Centre: \`h = ${h}\`, \`k = ${k}\`.\n2. Radius: \`r = ${r}\`, so \`r^2 = ${r * r}\`.\n3. Substitute: \`${hs}^2 + ${ks}^2 = ${r * r}\`.`, { window: { xmin: h - r * 2, xmax: h + r * 2, ymin: k - r * 1.5, ymax: k + r * 1.5 } });
      }
    }
    // line through two points
    if ((m = new RegExp('(?:line|equation)[^.]*?through[^()]*' + POINT + '[^()]*' + POINT).exec(q)) || (m = new RegExp('(?:line|equation)[^.]*?between[^()]*' + POINT + '[^()]*' + POINT).exec(q))) {
      const [x1, y1, x2, y2] = [num(m[1]), num(m[2]), num(m[3]), num(m[4])];
      if (x1 === x2) return plan('Vertical line', [`x=${x1}`, `(${x1},${y1})`, `(${x2},${y2})`], `The two points have the same x-value, so the line is **vertical**: \`x = ${x1}\`.`);
      const slope = (y2 - y1) / (x2 - x1), b = y1 - slope * x1;
      return plan('Line through two points', [`y=${fmtN(slope)}x${sign(b)}${fmtN(Math.abs(b))}`, `(${x1},${y1})`, `(${x2},${y2})`], `**Line through \`(${x1}, ${y1})\` and \`(${x2}, ${y2})\`.**\n\n1. Slope: \`m = (${y2} - ${y1}) / (${x2} - ${x1}) = ${fmtN(slope)}\`.\n2. Intercept: \`b = y - m x = ${y1} - ${fmtN(slope)}·${x1} = ${fmtN(b)}\`.\n3. Equation: \`y = ${fmtN(slope)}x ${sign(b)} ${fmtN(Math.abs(b))}\`.`);
    }
    // parabola from vertex and a point
    if ((m = new RegExp('parabola[^.]*?vertex[^()]*' + POINT + '[^()]*(?:through|passes|passing|and)[^()]*' + POINT).exec(q))) {
      const [h, k, px, py] = [num(m[1]), num(m[2]), num(m[3]), num(m[4])];
      if (px !== h) { const a = (py - k) / ((px - h) ** 2); return plan('Parabola from vertex form', [`y=${fmtN(a)==="1"?"":fmtN(a)}(x${sign(-h)}${Math.abs(h)})^2${sign(k)}${Math.abs(k)}`, `(${h},${k})`, `(${px},${py})`], `**Vertex form** is \`y = a(x - h)^2 + k\` with vertex \`(${h}, ${k})\`.\n\n1. Plug in the point \`(${px}, ${py})\`: \`${py} = a(${px} - ${h})^2 + ${k}\`.\n2. Solve for a: \`a = (${py} - ${k}) / ${(px - h) ** 2} = ${fmtN(a)}\`.\n3. So \`y = ${fmtN(a)}(x ${sign(-h)} ${Math.abs(h)})^2 ${sign(k)} ${Math.abs(k)}\`.`); }
    }
    // sine / cosine wave
    if ((m = /\b(sine|sin|cosine|cos)\b[^.]*?(?:wave|curve|function|graph)?/.exec(q)) && /(amplitude|period)/.test(q)) {
      const A = (/amplitude\s*(?:of|=|is)?\s*(-?[\d.]+)/.exec(q) || [])[1], P = (/period\s*(?:of|=|is)?\s*(-?[\d.]+)/.exec(q) || [])[1];
      const amp = A ? num(A) : 1, per = P ? num(P) : 2 * Math.PI, fn = /^s/.test(m[1]) ? 'sin' : 'cos', B = P ? `2pi/${fmtN(per)}` : '1';
      if (amp && per) return plan('Wave', [`y=${fmtN(amp)==="1"?"":fmtN(amp)}${fn}(${P ? B + ' x' : 'x'})`], `**${fn === 'sin' ? 'Sine' : 'Cosine'} wave** \`y = A ${fn}(B x)\`.\n\n1. Amplitude \`A = ${fmtN(amp)}\` (the height of the peaks).\n2. Period \`P = ${P ? fmtN(per) : '2π'}\`, so \`B = 2π / P\`${P ? ' = `2π/' + fmtN(per) + '`' : ' = 1'}.\n3. Equation: \`y = ${fmtN(amp)} ${fn}(${B} x)\`.`, { window: { xmin: -per, xmax: per * 2, ymin: -amp * 1.6, ymax: amp * 1.6 } });
    }
    // derivative / tangent
    if ((m = /(?:derivative|differentiate|d\/dx)\s*(?:of)?\s*(?:f\(x\)\s*=\s*|y\s*=\s*)?(.+)$/.exec(q))) {
      const ex = stripTail(m[1]);
      if (ok(ME, ex) && /x/.test(ex)) return plan('Derivative', [`f(x)=${ex}`, `y=f(x)`, `y=f'(x)`], `The **derivative** \`f'(x)\` gives the slope of \`f(x) = ${ex}\` at every point.\n\n1. The blue curve is \`f(x)\`.\n2. The second curve is \`f'(x)\`, its slope function (computed numerically by the calculator).\n3. Where \`f'(x) = 0\`, the original curve has a flat spot (a maximum or minimum).`);
    }
    if ((m = /tangent[^.]*?(?:to|of)\s*(?:y\s*=\s*|f\(x\)\s*=\s*)?([^,]+?)\s*(?:at|when|where)\s*x\s*=\s*(-?[\d.]+)/.exec(q))) {
      const ex = m[1].trim(), a = num(m[2]), f = toFn(ME, ex);
      if (f && Number.isFinite(a)) { const h = 1e-5, slope = (f(a + h) - f(a - h)) / (2 * h), y0 = f(a); if (Number.isFinite(slope) && Number.isFinite(y0)) return plan('Tangent line', [`f(x)=${ex}`, `y=f(x)`, `y=${fmtN(slope)}(x${sign(-a)}${Math.abs(a)})${sign(y0)}${fmtN(Math.abs(y0))}`, `(${a},${fmtN(y0)})`], `**Tangent line to \`${ex}\` at \`x = ${a}\`.**\n\n1. The point of tangency is \`(${a}, ${fmtN(y0)})\`.\n2. The slope there is the derivative: \`m = f'(${a}) ≈ ${fmtN(slope)}\`.\n3. Point-slope form: \`y = ${fmtN(slope)}(x ${sign(-a)} ${Math.abs(a)}) ${sign(y0)} ${fmtN(Math.abs(y0))}\`.`); }
    }
    // word problems ---------------------------------------------------------
    if ((m = /(?:thrown|tossed|launched|shot|kicked|hit)\b[^.]*?\b(?:up|upward|upwards|vertically)\b[^.]*?(-?[\d.]+)\s*(?:m\/s|meters? per second|metres? per second)/.exec(q))) {
      const v0 = num(m[1]); const hh = (/(?:height of|from a height of|from a|from|off a|off|on a|on top of a)\s*(?:[a-z]+\s+)?(-?[\d.]+)\s*(?:m|meters?|metres?)\b(?!\s*(?:\/|per))/.exec(q) || [])[1], h0 = hh ? num(hh) : 0;
      return plan('Projectile', [`y=-4.9x^2${sign(v0)}${fmtN(Math.abs(v0))}x${h0 ? sign(h0) + fmtN(Math.abs(h0)) : ''}{x>=0}`], `**Height of a thrown object.** With gravity \`g = 9.8 m/s²\`:\n\n1. Height after \`x\` seconds: \`y = -4.9x^2 + v₀x + h₀\`.\n2. Here \`v₀ = ${fmtN(v0)} m/s\` and \`h₀ = ${fmtN(h0)} m\`.\n3. **x** is time in seconds, **y** is height in metres. The highest point is the peak of the curve; the object lands where the curve returns to \`y = 0\`.`, { window: { xmin: -1, xmax: Math.max(4, (2 * v0) / 9.8 + 2), ymin: -2, ymax: Math.max(5, v0 * v0 / 19.6 + h0 + 3) } });
    }
    if ((m = /\$?\s*(-?[\d.]+)\s*(?:flat|fixed|base|upfront|sign-?up|initial|starting|plus)\b/.exec(q) || /(?:flat|fixed|base|initial|starting)\s*(?:fee|charge|cost|price)?\s*(?:of)?\s*\$?\s*(-?[\d.]+)/.exec(q)) && (/\$?\s*(-?[\d.]+)\s*(?:per|each|a|\/)\s*([a-z]+)/.exec(q))) {
      const per = /\$?\s*(-?[\d.]+)\s*(?:per|each|a|\/)\s*([a-z]+)/.exec(q), A = num(m[1]), B = num(per[1]);
      if (Number.isFinite(A) && Number.isFinite(B)) return plan('Cost model', [`y=${fmtN(A)}+${fmtN(B)}x{x>=0}`], `**Fixed cost plus a rate.**\n\n1. **x** = number of ${per[2]}s, **y** = total cost.\n2. Start with the fixed amount \`${fmtN(A)}\` (the y-intercept).\n3. Add \`${fmtN(B)}\` for each ${per[2]} (the slope).\n4. Model: \`y = ${fmtN(A)} + ${fmtN(B)}x\`. Add a second row for another plan to see where the costs are equal.`);
    }
    if ((m = /(?:doubles?|doubling)\s*every\s*(-?[\d.]+)/.exec(q))) {
      const T = num(m[1]), a0 = num((/(?:starts?|begins?|initial(?:ly)?|from|with)[^.\d]*(-?[\d.]+)/.exec(q) || [, '1'])[1]);
      if (T > 0) return plan('Doubling', [`y=${fmtN(a0)}*2^(x/${fmtN(T)}){x>=0}`], `**Doubling every ${fmtN(T)} units.**\n\n1. **x** = time, **y** = quantity. It starts at \`${fmtN(a0)}\`.\n2. Doubling every \`${fmtN(T)}\` means multiplying by 2 once per period: \`y = ${fmtN(a0)} · 2^(x/${fmtN(T)})\`.`);
    }
    if ((m = /(?:grows?|increases?|decays?|decreases?|depreciates?|loses?)\s*(?:by)?\s*(-?[\d.]+)\s*%/.exec(q))) {
      const p = num(m[1]) / 100, decay = /(decay|decreas|depreciat|lose)/.test(m[0]), a0 = num((/(?:starts?|begins?|initial(?:ly)?|from|with|of|at)[^.\d%]*\$?\s*(-?[\d.]+)(?!\s*%)/.exec(q) || [, '100'])[1]);
      if (p > 0) { const r = decay ? 1 - p : 1 + p; return plan(decay ? 'Exponential decay' : 'Exponential growth', [`y=${fmtN(a0)}*${fmtN(r)}^x{x>=0}`], `**${decay ? 'Decay' : 'Growth'} by ${fmtN(p * 100)}% each period.**\n\n1. **x** = number of periods, **y** = amount. Start value \`${fmtN(a0)}\`.\n2. Each period multiplies by \`${fmtN(r)}\`.\n3. Model: \`y = ${fmtN(a0)} · ${fmtN(r)}^x\`.`); }
    }
    // direct graphing of equations / expressions --------------------------------
    const eqs = [];
    const body = raw.replace(/^(?:please\s+)?(?:can you\s+)?(?:graph|plot|draw|sketch|show|display|visuali[sz]e)\s*(?:me)?\s*(?:the\s+)?(?:graph|function|equation|curve|equations|functions)?\s*(?:of)?\s*:?\s*/i, '');
    const wantsGraph = /^(?:please\s+)?(?:can you\s+)?(?:graph|plot|draw|sketch|show|display|visuali[sz]e|where do|find the intersection|intersection|solve)/i.test(raw) || /\b(intersect|meet|cross|solve)\b/.test(q);
    const parts = stripTail(body).split(/\s+(?:and|vs\.?|versus|with|&)\s+|\s*[;]\s*|,\s*(?=[a-z]\w*\s*=)/i).map((p) => stripTail(p.replace(/^(?:where do|find the intersection of|intersection of|solve)\s*/i, '').replace(/\s+(?:intersect|meet|cross).*$/i, '')));
    for (const p of parts) { if (p && /[=<>]/.test(p) || /^[\dxy(\-+].*x/.test(p)) { const e = p.replace(/^y\s*=\s*$/, ''); if (e && ok(ME, e) && looksMath(ME, e)) eqs.push(/[=<>]/.test(e) ? e : `y=${e}`); } }
    if (eqs.length && (wantsGraph || eqs.length === parts.length)) {
      const two = eqs.length >= 2;
      return plan(two ? 'Comparing graphs' : 'Graph', eqs, `Here ${two ? 'are your graphs' : 'is your graph'}: ${eqs.map((e) => `\`${e}\``).join(', ')}.\n\nEvery equation is in its own box on the left, so you can edit it and watch the graph change.${two ? ' Where the curves cross is shown under **Verified results**.' : ''}`);
    }
    return null;
  };

  /* ---------------- provider ---------------- */
  class AskError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  /* Bring-your-own-key providers. Everything is called straight from the visitor's browser with their own key. */
  Ask.providers = {
    gemini: { label: 'Google Gemini (free tier)', kind: 'openai', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'], link: 'https://aistudio.google.com/apikey', hint: 'AIza…', free: true },
    groq: { label: 'Groq (free tier)', kind: 'openai', endpoint: 'https://api.groq.com/openai/v1/chat/completions', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'], link: 'https://console.groq.com/keys', hint: 'gsk_…', free: true },
    openrouter: { label: 'OpenRouter (free models)', kind: 'openai', endpoint: 'https://openrouter.ai/api/v1/chat/completions', models: ['openrouter/free', 'meta-llama/llama-3.3-70b-instruct:free'], link: 'https://openrouter.ai/keys', hint: 'sk-or-…', free: true },
    openai: { label: 'OpenAI', kind: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions', models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1'], link: 'https://platform.openai.com/api-keys', hint: 'sk-…' },
    anthropic: { label: 'Anthropic Claude', kind: 'anthropic', endpoint: 'https://api.anthropic.com/v1/messages', models: ['claude-haiku-5-5', 'claude-sonnet-5-5'], link: 'https://console.anthropic.com/settings/keys', hint: 'sk-ant-…' },
    mistral: { label: 'Mistral', kind: 'openai', endpoint: 'https://api.mistral.ai/v1/chat/completions', models: ['mistral-small-latest', 'mistral-large-latest'], link: 'https://console.mistral.ai/api-keys', hint: 'API key' },
    pollinations: { label: 'Pollinations', kind: 'openai', endpoint: 'https://gen.pollinations.ai/v1/chat/completions', models: ['openai'], link: 'https://enter.pollinations.ai/keys', hint: 'sk_…' },
    custom: { label: 'Custom / local (Ollama, LM Studio, …)', kind: 'openai', endpoint: '', models: [], custom: true, link: 'https://ollama.com', hint: 'API key (optional)' }
  };
  Ask.getProviderId = () => { const id = store.get(LS + 'provider'); return Ask.providers[id] ? id : 'gemini'; };
  Ask.setProviderId = (id) => store.set(LS + 'provider', Ask.providers[id] ? id : '');
  Ask.getProvider = () => Ask.providers[Ask.getProviderId()];
  Ask.getKey = () => store.get(LS + 'key-' + Ask.getProviderId()) || (Ask.getProviderId() === 'pollinations' ? Ask.config.publishableKey : '') || '';
  Ask.setKey = (k) => store.set(LS + 'key-' + Ask.getProviderId(), (k || '').trim());
  Ask.getModel = () => store.get(LS + 'model-' + Ask.getProviderId()) || Ask.getProvider().models[0] || '';
  Ask.setModel = (m) => store.set(LS + 'model-' + Ask.getProviderId(), (m || '').trim());
  Ask.getEndpoint = () => { const p = Ask.getProvider(); return p.custom ? store.get(LS + 'endpoint') : p.endpoint; };
  Ask.setEndpoint = (u) => store.set(LS + 'endpoint', (u || '').trim());
  // true when a question could be sent to an AI right now
  Ask.hasAI = () => { const p = Ask.getProvider(); return p.custom ? !!Ask.getEndpoint() && !!Ask.getModel() : !!Ask.getKey(); };
  Ask.friendlyError = (e) => {
    if (e && e.name === 'AbortError') return 'Stopped.';
    const s = e && e.status; let name = 'AI';
    try { name = Ask.getProvider().label.replace(/ \(.*\)$/, ''); } catch (err) { /* ignore */ }
    if (s === 401 || s === 403 && /key|auth|permission/i.test((e && e.message) || '')) return `${name} did not accept the key. Open AI settings and check it (and that it belongs to ${name}).`;
    if (s === 402 || s === 403) return `${name} says this key has no credit or access right now. Wait a while or try another provider in AI settings.`;
    if (s === 404) return `${name} does not know that model. Pick another model in AI settings.`;
    if (s === 429) return `${name} says too many requests. Please wait a few seconds and try again (free tiers are rate limited).`;
    if (s >= 500) return `${name} is having trouble. Please try again in a moment.`;
    if (e && e.network) return `Could not reach ${name} from the browser. Check your connection${Ask.getProvider().custom ? ', the address, and that the server allows web pages to call it (CORS)' : ''}.`;
    return `Could not get an answer from ${name}. Check your connection and settings, then try again.`;
  };
  Ask.callAI = async (messages, opts) => {
    opts = opts || {};
    const p = Ask.getProvider(), key = Ask.getKey(), url = Ask.getEndpoint(), model = opts.model || Ask.getModel();
    if (!Ask.hasAI()) throw new AskError(401, 'not configured');
    const doFetch = opts.fetch || fetch;
    const send = async (headers, body) => {
      let res;
      try { res = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal }); }
      catch (e) { if (e && e.name === 'AbortError') throw e; const er = new AskError(0, String(e && e.message)); er.network = true; throw er; }
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new AskError(res.status, t.slice(0, 300)); }
      return res.json();
    };
    if (p.kind === 'anthropic') {
      const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const body = { model, max_tokens: 3000, temperature: 0.2, system: sys, messages: messages.filter((m) => m.role !== 'system') };
      const data = await send({ 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body);
      return data && data.content && data.content.map((c) => c.text || '').join('');
    }
    const headers = { 'Content-Type': 'application/json' }; if (key) headers.Authorization = 'Bearer ' + key;
    const base = { model, messages, temperature: 0.2 };
    const go = async (withFormat) => {
      const data = await send(headers, withFormat ? Object.assign({ response_format: { type: 'json_object' } }, base) : base);
      return data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    };
    try { return await go(true); } catch (e) { if (e.status === 400 || e.status === 422) return go(false); throw e; }
  };

  Ask.userPrompt = (question, existingRows) => `Question: ${question}${existingRows && existingRows.length ? `\n\nRows already on the graph (do not repeat them unless asked): ${existingRows.slice(0, 12).join(' | ')}` : ''}`;
  Ask.repairPrompt = (errors) => `The calculator could not use these rows:\n${errors.map((e) => `- "${e.text}": ${e.err}`).join('\n')}\n\nReturn the full corrected JSON object (same format). Fix or remove only the broken rows.`;

  /* ---------------- tiny markdown renderer (escapes HTML first) ---------------- */
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  Ask.render = (md, pretty) => {
    const inline = (t) => esc(t).replace(/`([^`]+)`/g, (_, c) => `<code class="am">${pretty ? pretty(c.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')) : c}</code>`).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
    const out = []; let list = null;
    for (const line of String(md).split(/\n/)) {
      const ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(line), ul = /^\s*[-*•]\s+(.*)$/.exec(line);
      if (ol) { if (list !== 'ol') { if (list) out.push(`</${list}>`); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(ol[2])}</li>`); }
      else if (ul) { if (list !== 'ul') { if (list) out.push(`</${list}>`); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(ul[1])}</li>`); }
      else { if (list) { out.push(`</${list}>`); list = null; } if (line.trim()) out.push(`<p>${inline(line)}</p>`); }
    }
    if (list) out.push(`</${list}>`);
    return out.join('');
  };

  /* ---------------- UI ---------------- */
  Ask.init = (api) => {
    const $ = (s) => document.querySelector(s);
    const panel = $('#ask'), log = $('#askLog'), input = $('#askIn'), sendBtn = $('#askSend'), setBox = $('#askSettings');
    let busy = false, ctrl = null; const history = [];
    const scroll = () => { log.scrollTop = log.scrollHeight; };
    const bubble = (cls, html) => { const d = document.createElement('div'); d.className = 'ab ' + cls; d.innerHTML = html; log.appendChild(d); scroll(); return d; };
    const syncSettings = () => {
      const p = Ask.getProvider(), id = Ask.getProviderId(), k = Ask.getKey();
      $('#askProv').value = id; $('#askKeyIn').value = ''; $('#askKeyIn').placeholder = `Paste your API key (${p.hint})`;
      $('#askEndRow').hidden = !p.custom; $('#askEndpoint').value = Ask.getEndpoint();
      $('#askProvLink').innerHTML = p.custom ? 'Runs against any OpenAI-compatible address, e.g. a local Ollama or LM Studio server.' : `Get a key at <a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.link.replace(/^https:\/\//, ''))}</a>${p.free ? ' — free tier available' : ''}.`;
      $('#askKeyState').textContent = k ? `Key saved in this browser (${k.slice(0, 4)}…).` : (p.custom ? 'Key is optional for local servers.' : 'No key yet — the built-in solver still works.');
      $('#askModels').innerHTML = p.models.map((m) => `<option value="${esc(m)}">`).join(''); $('#askModel').value = Ask.getModel();
      $('#askSetBtn').classList.toggle('on', Ask.hasAI());
    };
    $('#askProv').innerHTML = Object.keys(Ask.providers).map((id) => `<option value="${id}">${esc(Ask.providers[id].label)}</option>`).join('');
    syncSettings();
    $('#btnAsk').onclick = () => { panel.hidden = !panel.hidden; $('#btnAsk').classList.toggle('on', !panel.hidden); if (!panel.hidden) { api.relayout(); setTimeout(() => input.focus(), 30); } else api.relayout(); };
    $('#askClose').onclick = () => { panel.hidden = true; $('#btnAsk').classList.remove('on'); api.relayout(); };
    $('#askSetBtn').onclick = () => { setBox.hidden = !setBox.hidden; };
    $('#askProv').onchange = (e) => { Ask.setProviderId(e.target.value); syncSettings(); };
    $('#askKeySave').onclick = () => { const v = $('#askKeyIn').value.trim(); if (v) { Ask.setKey(v); api.toast('Key saved in this browser'); } if (Ask.getProvider().custom) Ask.setEndpoint($('#askEndpoint').value); syncSettings(); };
    $('#askEndpoint').onchange = (e) => { Ask.setEndpoint(e.target.value); syncSettings(); };
    $('#askKeyClear').onclick = () => { Ask.setKey(''); syncSettings(); api.toast('Key removed'); };
    $('#askModel').onchange = (e) => { Ask.setModel(e.target.value); syncSettings(); };
    try { $('#askFresh').checked = localStorage.getItem('graphical-calculator-ask-fresh') === '1'; } catch (e) { /* ignore */ }
    $('#askFresh').onchange = (e) => { try { localStorage.setItem('graphical-calculator-ask-fresh', e.target.checked ? '1' : '0'); } catch (err) { /* ignore */ } };
    document.querySelectorAll('.ask-chip').forEach((c) => { c.onclick = () => { input.value = c.dataset.q; send(); }; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    sendBtn.onclick = () => { if (busy && ctrl) { ctrl.abort(); return; } send(); };
    $('#askClear').onclick = () => { log.innerHTML = ''; history.length = 0; };

    const setBusy = (b) => { busy = b; sendBtn.textContent = b ? 'Stop' : 'Graph it'; sendBtn.classList.toggle('stop', b); input.disabled = b; if (!b) input.focus(); };

    function present(plan, extra) {
      const res = api.apply(plan, { fresh: $('#askFresh').checked });
      const addedRows = res.added;
      if (plan.window) api.setRange(plan.window); else api.fit();
      let factsHtml = '';
      const facts = Ask.facts(api.fxPlots(res.ids), api.range ? api.range() : null);
      if (facts.points.length) api.addPoints(facts.points, res.folderId);
      if (facts.lines.length) factsHtml = `<div class="afacts"><b>Verified results</b> <span class="amuted">(computed by the calculator)</span>${Ask.render(facts.lines.map((l) => '- ' + l).join('\n'), api.pretty)}</div>`;
      const dropped = res.dropped.length ? `<div class="awarn">Skipped ${res.dropped.length} row${res.dropped.length > 1 ? 's' : ''} the calculator could not read: ${res.dropped.map((d) => `<code>${esc(d.text)}</code>`).join(', ')}</div>` : '';
      const d = bubble('bot', `<div class="asrc">${plan.source === 'rules' ? 'Built-in solver' : 'AI helper'} · added ${addedRows} row${addedRows === 1 ? '' : 's'} in a folder “${esc(plan.title)}” — edit any box to change the graph</div>${Ask.render(plan.explanation || '', api.pretty)}${factsHtml}${dropped}<div class="aact"><button class="chip" data-undo>Undo</button></div>${extra || ''}`);
      d.querySelector('[data-undo]').onclick = () => { api.rollback(res.snapshot); d.querySelector('.aact').innerHTML = '<span class="amuted">Undone.</span>'; };
      history.push({ role: 'assistant', content: JSON.stringify({ title: plan.title, rows: plan.rows.map((r) => ({ text: r.text })) }) });
    }

    async function send() {
      const q = input.value.trim(); if (!q || busy) return;
      input.value = ''; bubble('me', esc(q)); setBusy(true); ctrl = new AbortController();
      try {
        const rule = Ask.rules(q, global.ME);
        if (rule) { present(rule); return; }
        if (!Ask.hasAI()) {
          bubble('bot', `<p>I can draw many standard requests with no setup, but this one needs an AI.</p><p><b>Connect one you already have (1 minute):</b> open <b>AI settings</b> above, pick a provider — <b>Google Gemini</b> and <b>Groq</b> have free keys; OpenAI, Anthropic, Mistral, OpenRouter, or a local Ollama/LM Studio server also work — and paste your key. It stays in your browser only.</p><p class="amuted">Meanwhile try: “graph y = x^2 − 4x + 3”, “where do y = 2x + 1 and y = −x + 7 meet?”, “circle of radius 3 centred at (1, 2)”, or “a ball is thrown up at 20 m/s”.</p>`);
          return;
        }
        const status = bubble('bot', '<span class="amuted">Thinking…</span>');
        const messages = [{ role: 'system', content: Ask.SYSTEM_PROMPT }, ...history.slice(-4), { role: 'user', content: Ask.userPrompt(q, api.currentRows()) }];
        history.push({ role: 'user', content: q });
        let plan = null, lastReply = '';
        for (let attempt = 0; attempt < 3; attempt++) {
          status.innerHTML = `<span class="amuted">${attempt ? 'Checking and fixing the equations…' : 'Thinking…'}</span>`;
          lastReply = await Ask.callAI(messages, { signal: ctrl.signal });
          plan = Ask.parseReply(lastReply);
          if (!plan) { messages.push({ role: 'assistant', content: String(lastReply).slice(0, 1500) }, { role: 'user', content: 'That was not valid JSON. Reply with only the JSON object.' }); continue; }
          if (!plan.rows.length) break;
          const bad = api.check(plan.rows.map((r) => r.text));
          if (!bad.length) break;
          if (attempt < 2) { messages.push({ role: 'assistant', content: String(lastReply).slice(0, 2500) }, { role: 'user', content: Ask.repairPrompt(bad) }); plan.__retry = true; continue; }
        }
        status.remove();
        if (!plan) { bubble('bot', '<p>I could not turn that into a graph. Try rephrasing it, or give an equation.</p>'); return; }
        plan.source = 'ai';
        if (!plan.rows.length) { bubble('bot', `<div class="asrc">AI helper</div>${Ask.render(plan.explanation || 'There is nothing to draw for this question.', api.pretty)}`); return; }
        present(plan);
      } catch (e) {
        bubble('bot', `<p class="awarn">${esc(Ask.friendlyError(e))}</p>`);
      } finally { setBusy(false); ctrl = null; }
    }
    Ask._send = send;
  };

  global.Ask = Ask;
  if (typeof module !== 'undefined' && module.exports) module.exports = Ask;
})(typeof window !== 'undefined' ? window : globalThis);
