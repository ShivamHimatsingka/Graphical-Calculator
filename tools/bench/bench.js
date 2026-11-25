// Compare local models on maths word problems, in the exact format the app uses.
// usage: node tools/bench/bench.js --url http://127.0.0.1:18080 --name MyModel [--thinking on|off] [--n 15]
// Start the model first, e.g.:  llama-server -m model.gguf --port 18080 -c 8192 -ngl 99
const fs = require('fs'), path = require('path'), vm = require('vm');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const url = (args.url || 'http://127.0.0.1:18080') + '/v1/chat/completions';
const thinking = args.thinking === 'on';
const sb = { console, Math, Float64Array }; sb.window = sb; vm.createContext(sb);
for (const f of ['mathengine.js', 'latex.js', 'ask.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../docs/js', f), 'utf8'), sb);
const { ME, Ask } = sb;
const problems = require('./problems.js').slice(0, +(args.n || 99));

// Turn one row ("y=...", "f(x)=...") into a JS function of x, or null.
function rowFn(text) {
  try {
    const st = ME.parseStatement(text, []);
    if (st.ops.length !== 1 || st.ops[0] !== '=') return null;
    const [L, R] = st.parts, pick = (e) => ME.compile(ME.resolve(e, new Set()), ['x']);
    if (L.t === 'var' && L.n === 'y') return pick(R);
    if (L.t === 'call' && L.args.length === 1 && L.args[0].t === 'var' && L.args[0].n === 'x') return pick(R);
    return null;
  } catch (e) { return null; }
}
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-3 * Math.max(1, Math.abs(b));

(async () => {
  const out = []; let t0all = Date.now();
  for (const p of problems) {
    const messages = [{ role: 'system', content: Ask.SYSTEM_PROMPT }, { role: 'user', content: Ask.userPrompt(p.q, []) }];
    const body = { model: 'local', messages, temperature: 0.2, max_tokens: thinking ? 6000 : 1800, response_format: { type: 'json_object' }, chat_template_kwargs: { enable_thinking: thinking } };
    const t0 = Date.now(); let reply = '', err = '', tokens = 0;
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json(); reply = (j.choices && j.choices[0].message.content) || ''; tokens = (j.usage && j.usage.completion_tokens) || 0;
      if (!reply) err = JSON.stringify(j).slice(0, 120);
    } catch (e) { err = String(e.message || e); }
    const secs = (Date.now() - t0) / 1000;
    const plan = reply ? Ask.parseReply(reply) : null;
    const rows = plan ? plan.rows.map((r) => r.text) : [];
    const fns = rows.map(rowFn).filter(Boolean);
    const match = p.expect.map((g) => fns.some((f) => p.xs.every((x) => { let v; try { v = f(x); } catch (e) { v = NaN; } return close(v, g(x)); })));
    const correct = p.all ? match.every(Boolean) : match.some(Boolean);
    const parsesOK = rows.length > 0 && rows.every((t) => { try { ME.parseStatement(t, []); return true; } catch (e) { return false; } });
    out.push({ q: p.q.slice(0, 60), json: !!plan, parsesOK, correct, secs, tokens, rows: rows.slice(0, 4), err });
    console.log(`${correct ? 'PASS' : 'FAIL'} json=${!!plan} rows=${parsesOK ? 'ok' : 'BAD'} ${secs.toFixed(1)}s ${tokens}tok  ${p.q.slice(0, 55)}  ->  ${rows.slice(0, 2).join(' | ')} ${err}`);
  }
  const n = out.length, s = (k) => out.filter((o) => o[k]).length;
  const summary = { model: args.name || 'model', thinking, problems: n, correct: s('correct'), jsonOK: s('json'), rowsParse: s('parsesOK'), avgSecs: +(out.reduce((a, o) => a + o.secs, 0) / n).toFixed(1), totalMin: +((Date.now() - t0all) / 60000).toFixed(1) };
  console.log('SUMMARY ' + JSON.stringify(summary));
  fs.writeFileSync(path.join(args.out || '/tmp', `bench-${(args.name || 'model').replace(/\W+/g, '_')}.json`), JSON.stringify({ summary, out }, null, 2));
})();
