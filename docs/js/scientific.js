/* ==========================================================
   Scientific calculator mode (full-screen overlay).
   Uses the same math engine; supports DEG/RAD, 2nd functions, ANS, memory,
   complex results, lists, history. Exposes window.Sci
   ========================================================== */
(function (global) {
  'use strict';

  const KEYS = [
    [['2nd', '2nd', 'fn'], ['DEG', 'deg', 'fn'], ['(', '(', 'fn'], [')', ')', 'fn'], ['%', '%', 'fn'], ['AC', 'ac', 'danger']],
    [['sin', 'sin(', 'fn', 'asin('], ['cos', 'cos(', 'fn', 'acos('], ['tan', 'tan(', 'fn', 'atan('], ['ln', 'ln(', 'fn', 'exp('], ['log', 'log(', 'fn', '10^('], ['⌫', 'del', 'danger']],
    [['x²', '^2', 'fn', '^3'], ['xʸ', '^(', 'fn', '^('], ['√', 'sqrt(', 'fn', 'cbrt('], ['1/x', '1/(', 'fn'], ['n!', '!', 'fn'], ['÷', '/', 'op']],
    [['7', '7'], ['8', '8'], ['9', '9'], ['EXP', '*10^', 'fn'], ['π', 'pi', 'fn'], ['×', '*', 'op']],
    [['4', '4'], ['5', '5'], ['6', '6'], ['e', 'e', 'fn'], ['ANS', 'ans', 'fn'], ['−', '-', 'op']],
    [['1', '1'], ['2', '2'], ['3', '3'], ['MC', 'mc', 'mem'], ['MR', 'mr', 'mem'], ['+', '+', 'op']],
    [['0', '0'], ['.', '.'], ['(−)', '-', 'fn'], ['M+', 'm+', 'mem'], ['M−', 'm-', 'mem'], ['=', 'eq', 'eq']],
  ];

  class Sci {
    constructor(root, ME) {
      this.root = root; this.ME = ME;
      this.deg = false; this.second = false; this.mem = 0; this.hasMem = false; this.ans = 0;
      this.hist = [];
      try { const d = JSON.parse(localStorage.getItem('graphical-calculator-sci') || 'null'); if (d) { this.hist = d.hist || []; this.mem = d.mem || 0; this.hasMem = !!d.hasMem; this.deg = !!d.deg; if (this.hist.length) this.ans = this.hist[this.hist.length - 1].val; } } catch (e) { /* ignore */ }
      this._build();
    }
    _save() { try { localStorage.setItem('graphical-calculator-sci', JSON.stringify({ hist: this.hist.slice(-60), mem: this.mem, hasMem: this.hasMem, deg: this.deg })); } catch (e) { /* ignore */ } }

    _build() {
      const r = this.root;
      r.innerHTML = `<div class="sci-card" role="dialog" aria-label="Scientific calculator">
        <div class="sci-head"><b>Scientific calculator</b><span class="sci-flags"><span id="sciM" hidden>M</span><span id="sciDeg"></span></span><button class="ib sci-x" aria-label="Close" title="Close">✕</button></div>
        <div class="sci-hist" id="sciHist" aria-live="polite"></div>
        <input class="sci-in" id="sciIn" placeholder="0" autocomplete="off" spellcheck="false" inputmode="none" aria-label="Expression">
        <div class="sci-prev" id="sciPrev"></div>
        <div class="sci-keys">${KEYS.map((row) => row.map((k) => `<button class="sk ${k[2] || ''}" data-k="${k[1]}"${k[3] ? ` data-alt="${k[3]}"` : ''}>${k[0]}</button>`).join('')).join('')}</div>
      </div>`;
      this.inp = r.querySelector('#sciIn'); this.prev = r.querySelector('#sciPrev'); this.histEl = r.querySelector('#sciHist');
      this.flagDeg = r.querySelector('#sciDeg'); this.flagM = r.querySelector('#sciM');
      r.querySelector('.sci-x').onclick = () => this.close();
      r.addEventListener('mousedown', (e) => { if (e.target.closest('.sk')) e.preventDefault(); });
      r.addEventListener('click', (e) => {
        const b = e.target.closest('.sk'); if (b) { this.key(b.dataset.k, b); return; }
        const h = e.target.closest('[data-use]'); if (h) { this.insert(h.dataset.use); }
        if (e.target === r) this.close();
      });
      this.inp.addEventListener('input', () => this.preview());
      this.inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.equals(); }
        else if (e.key === 'Escape') { if (this.inp.value) { this.inp.value = ''; this.preview(); } else this.close(); }
      });
      this.refresh();
    }

    open() { this.root.hidden = false; this.refresh(); setTimeout(() => this.inp.focus(), 30); }
    close() { this.root.hidden = true; if (this.onClose) this.onClose(); }
    refresh() {
      this.flagDeg.textContent = this.deg ? 'DEG' : 'RAD'; this.flagM.hidden = !this.hasMem;
      this.root.querySelectorAll('.sk[data-k="2nd"]').forEach((b) => b.classList.toggle('on', this.second));
      this.root.querySelectorAll('.sk[data-k="deg"]').forEach((b) => { b.textContent = this.deg ? 'DEG' : 'RAD'; });
      this.root.querySelectorAll('.sk[data-alt]').forEach((b) => {
        const alt = b.dataset.alt, base = b.dataset.base || (b.dataset.base = b.dataset.k), lbl0 = b.dataset.lbl || (b.dataset.lbl = b.textContent);
        b.dataset.k = this.second ? alt : base;
        b.textContent = this.second ? ({ 'asin(': 'sin⁻¹', 'acos(': 'cos⁻¹', 'atan(': 'tan⁻¹', 'exp(': 'eˣ', '10^(': '10ˣ', '^3': 'x³', 'cbrt(': '∛' }[alt] || lbl0) : lbl0;
      });
      this.histEl.innerHTML = this.hist.map((h) => `<div class="sh"><span class="se" data-use="${esc(h.expr)}">${esc(h.expr)}</span><span class="sr" data-use="${esc(h.text)}">= ${esc(h.text)}</span></div>`).join('');
      this.histEl.scrollTop = this.histEl.scrollHeight;
    }

    insert(text) {
      const i = this.inp; i.focus();
      i.setRangeText(text, i.selectionStart, i.selectionEnd, 'end');
      this.preview();
    }
    key(k, btn) {
      switch (k) {
        case '2nd': this.second = !this.second; this.refresh(); return;
        case 'deg': this.deg = !this.deg; this._save(); this.refresh(); this.preview(); return;
        case 'ac': this.inp.value = ''; this.preview(); this.inp.focus(); return;
        case 'del': { const i = this.inp; i.focus(); const s = i.selectionStart, e = i.selectionEnd; if (s !== e) i.setRangeText('', s, e, 'end'); else if (s > 0) i.setRangeText('', s - 1, s, 'end'); this.preview(); return; }
        case 'eq': this.equals(); return;
        case 'mc': this.mem = 0; this.hasMem = false; this._save(); this.refresh(); return;
        case 'mr': this.insert(this.fmtPlain(this.mem)); return;
        case 'm+': case 'm-': {
          const v = this.evalText(this.inp.value || String(this.ans), true);
          if (v !== null && typeof v === 'number') { this.mem += k === 'm+' ? v : -v; this.hasMem = true; this._save(); this.refresh(); }
          return;
        }
        default: this.insert(k);
          if (this.second && btn && btn.dataset.alt) { this.second = false; this.refresh(); }
      }
    }
    fmtPlain(v) { return String(parseFloat(v.toPrecision(12))); }

    show(v) {
      const ME = this.ME;
      if (Array.isArray(v)) return '[' + v.slice(0, 20).map((x) => this.show(x)).join(', ') + (v.length > 20 ? ', …' : '') + ']';
      if (v instanceof ME.Cx) {
        const tiny = (a, b) => Math.abs(a) < 1e-12 * Math.max(1, Math.abs(b));
        const re = tiny(v.re, v.im) ? 0 : v.re, im = tiny(v.im, v.re) ? 0 : v.im;
        if (!im) return ME.fmt(re, 10);
        const imS = Math.abs(im) === 1 ? '' : ME.fmt(Math.abs(im), 10);
        return (re ? ME.fmt(re, 10) + (im < 0 ? ' − ' : ' + ') : (im < 0 ? '−' : '')) + imS + 'i';
      }
      if (v instanceof ME.Pt) return `(${ME.fmt(v.x, 10)}, ${ME.fmt(v.y, 10)})`;
      if (typeof v === 'boolean') return String(v);
      if (typeof v === 'number') return Number.isNaN(v) ? 'undefined' : ME.fmt(v, 10);
      return 'undefined';
    }

    evalText(text, quiet) {
      const ME = this.ME;
      let t = String(text || '').trim();
      if (!t) return null;
      t = t.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
        .replace(/(\d+(?:\.\d+)?|\))\s*%/g, '($1/100)')
        .replace(/\bans\b/gi, `(${this.fmtPlain(this.ans)})`);
      // balance open parentheses so "sin(30" works
      const open = (t.match(/\(/g) || []).length - (t.match(/\)/g) || []).length;
      if (open > 0) t += ')'.repeat(open);
      try {
        const st = ME.parseStatement(t, []);
        if (st.ops.length || st.restrict.length) { if (!quiet) this.err = 'Enter an expression, not an equation'; return undefined; }
        const keep = Object.keys(ME.V);
        ME.R.deg = this.deg;
        const fn = ME.compile(ME.resolve(st.parts[0], new Set()), []);
        const v = fn();
        keep.length; // (V is shared with the graph; the calculator does not define variables)
        return v;
      } catch (e) { this.err = e.message || 'Error'; return undefined; }
    }
    preview() {
      this.err = '';
      const v = this.evalText(this.inp.value, true);
      this.prev.textContent = v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? '' : '= ' + this.show(v);
    }
    equals() {
      const text = this.inp.value.trim();
      if (!text) return;
      this.err = '';
      const v = this.evalText(text, false);
      if (v === undefined || v === null) { this.prev.textContent = this.err || 'Error'; return; }
      if (typeof v === 'number' && Number.isNaN(v)) { this.prev.textContent = 'undefined'; return; }
      const shown = this.show(v);
      this.hist.push({ expr: text, text: shown, val: typeof v === 'number' ? v : 0 });
      if (typeof v === 'number') this.ans = v;
      this._save(); this.inp.value = ''; this.prev.textContent = '';
      this.refresh();
    }
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  global.Sci = Sci;
})(window);
