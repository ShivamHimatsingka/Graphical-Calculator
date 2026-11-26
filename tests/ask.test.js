/* Ask (AI helper) pure-logic tests: rule engine, reply parsing, verified facts, renderer. Run: node tests/ask.test.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const sb = { console, Math, Float64Array };
sb.window = sb; vm.createContext(sb);
for (const f of ['mathengine.js', 'latex.js', 'ask.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/js', f), 'utf8'), sb);
const { ME, Ask } = sb;
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };
const parses = (rows) => rows.every((r) => { try { ME.parseStatement(r.text, []); return true; } catch (e) { return false; } });

// ---- rule engine
const R = (q) => Ask.rules(q, ME);
let p = R('graph y = x^2 - 4x + 3'); ok(p && p.rows.length === 1 && p.rows[0].text === 'y = x^2 - 4x + 3', 'graph one equation');
p = R('Where do y = 2x + 1 and y = -x + 7 meet?'); ok(p && p.rows.length === 2 && parses(p.rows), 'two equations that meet');
p = R('plot y = sin(x) and y = cos(x) on the same axes'); ok(p && p.rows.length === 2, 'two trig curves, trailing words ignored');
p = R('draw a circle of radius 3 centered at (1, 2)'); ok(p && p.rows[0].text === '(x-1)^2+(y-2)^2=9', 'circle with centre');
p = R('circle with radius 5'); ok(p && p.rows[0].text === 'x^2+y^2=25', 'circle at the origin');
p = R('find the line through (1, 2) and (3, 8)'); ok(p && p.rows[0].text === 'y=3x-1', 'line through two points');
p = R('line through (2,1) and (2,5)'); ok(p && p.rows[0].text === 'x=2', 'vertical line');
p = R('parabola with vertex (1, -4) passing through (3, 0)'); ok(p && p.rows[0].text === 'y=(x-1)^2-4', 'parabola from vertex and point');
p = R('sine wave with amplitude 3 and period 4'); ok(p && /^y=3sin\(2pi\/4 x\)$/.test(p.rows[0].text), 'sine wave');
p = R('derivative of x^3 - 3x'); ok(p && p.rows.length === 3 && p.rows[2].text === "y=f'(x)", 'derivative rows');
p = R('tangent to y = x^2 at x = 3'); ok(p && p.rows.some((r) => /^y=6\(x-3\)\+9$/.test(r.text)), 'tangent line value');
p = R('A ball is thrown up at 20 m/s from a height of 2 m'); ok(p && p.rows[0].text === 'y=-4.9x^2+20x+2{x>=0}', 'projectile');
p = R('A plan costs a $15 fixed fee plus $4 per hour'); ok(p && p.rows[0].text === 'y=15+4x{x>=0}', 'fixed plus per-unit cost');
p = R('a population doubles every 3 years starting at 50'); ok(p && p.rows[0].text === 'y=50*2^(x/3){x>=0}', 'doubling');
p = R('a car loses 15% of its value each year, starting at 20000'); ok(p && /^y=20000\*0\.85\^x/.test(p.rows[0].text), 'percent decay');
ok(R('what is the capital of France') === null, 'unrelated text goes to the AI');
ok(R('x marks the spot where the treasure is hidden') === null, 'English text is not mistaken for maths');
ok(R('explain why the sky is blue') === null, 'non-maths question');
for (const q of ['graph y = x^2', 'derivative of sin(x)', 'circle of radius 2']) { const pl = R(q); ok(pl && pl.explanation.length > 40 && parses(pl.rows), 'plan has explanation and valid rows: ' + q); }

// ---- reply parsing
let r = Ask.parseReply('```json\n{"title":"Quad","explanation":"Step **1**","rows":[{"text":"y=x^2"},"y=2x",{"text":"  "}],"window":{"xmin":-5,"xmax":5,"ymin":-2,"ymax":10}}\n```');
ok(r && r.rows.length === 2 && r.rows[1].text === 'y=2x' && r.window && r.window.ymax === 10, 'parses fenced JSON, strings and objects, drops blanks');
r = Ask.parseReply('Sure! {"title":"T","explanation":"e","rows":[{"text":"y=\\\\frac{1}{x}"}]}'); ok(r && r.rows[0].text === 'y=(1/x)', 'LaTeX in a row is converted');
ok(Ask.parseReply('not json at all') === null && Ask.parseReply('{broken') === null, 'rejects invalid JSON');
r = Ask.parseReply('{"rows":[],"window":{"xmin":5,"xmax":1,"ymin":0,"ymax":1}}'); ok(r && r.window === null, 'ignores a bad window');
r = Ask.parseReply(JSON.stringify({ rows: Array.from({ length: 40 }, (_, i) => ({ text: 'y=' + i + 'x' })) })); ok(r.rows.length === 14, 'caps the number of rows');

// ---- verified facts
const fx = (f, label) => ({ f, label });
let f = Ask.facts([fx((x) => 2 * x + 1, 'y=2x+1'), fx((x) => -x + 7, 'y=-x+7')]);
ok(f.points.some((q) => q.kind === 'int' && Math.abs(q.x - 2) < 1e-6 && Math.abs(q.y - 5) < 1e-6) && f.lines.some((l) => /meet at \(2, 5\)/.test(l)), 'intersection (2,5)');
f = Ask.facts([fx((x) => x * x - 4 * x + 3, 'y=x^2-4x+3')]);
ok(f.points.some((q) => q.kind === 'min' && Math.abs(q.x - 2) < 1e-5 && Math.abs(q.y + 1) < 1e-6) && f.points.filter((q) => q.kind === 'zero').map((q) => Math.round(q.x)).sort().join() === '1,3', 'vertex (2,-1) and zeros 1, 3');
f = Ask.facts([fx((x) => 1 / x, 'y=1/x')]); ok(!f.points.some((q) => q.kind === 'max' || q.kind === 'min'), 'no fake extremum at an asymptote');
f = Ask.facts([fx((x) => x + 1, 'a'), fx((x) => x + 3, 'b')]); ok(f.lines.some((l) => /do not cross/.test(l)), 'parallel lines do not cross');

// ---- renderer escapes HTML
const html = Ask.render('Hello <script>alert(1)</script> **bold** `x^2`\n1. one\n2. two\n- bullet');
ok(!/<script/i.test(html) && /<b>bold<\/b>/.test(html) && /<ol>/.test(html) && /<ul>/.test(html) && /class="am"/.test(html), 'markdown renderer escapes HTML and formats');

// ---- provider error messages
ok(/key/i.test(Ask.friendlyError({ status: 401 })) && /wait/i.test(Ask.friendlyError({ status: 429 })) && /credit/i.test(Ask.friendlyError({ status: 402 })), 'friendly error messages');
f = Ask.facts([fx((x) => x ** 3, 'f'), fx((x) => x ** 3, 'y=f(x)')]); ok(f.points.length <= 2 && !f.lines.some((l) => /meet at/.test(l)), 'identical curves are not reported as intersecting');

// ---- providers (mock fetch)
(async () => {
  const P = Ask.providers; ok(['gemini', 'groq', 'openrouter', 'openai', 'anthropic', 'mistral', 'pollinations', 'custom'].every((k) => P[k]), 'provider registry');
  const mk = (resp, cap) => async (u, o) => { cap.url = u; cap.opts = o; cap.body = JSON.parse(o.body); return resp; };
  const okRes = (j) => ({ ok: true, status: 200, json: async () => j, text: async () => '' });
  // OpenAI-style (default provider gemini; no key -> error)
  let threw = false; try { await Ask.callAI([{ role: 'user', content: 'x' }], { fetch: async () => okRes({}) }); } catch (e) { threw = e.status === 401; } ok(threw, 'callAI without key throws 401');
  const store = {}; sb.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  Ask.setProviderId('groq'); Ask.setKey('gsk_abc'); ok(Ask.hasAI() && Ask.getProviderId() === 'groq', 'groq configured');
  let cap = {}; let out = await Ask.callAI([{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }], { fetch: mk(okRes({ choices: [{ message: { content: '{"a":1}' } }] }), cap) });
  ok(out === '{"a":1}' && /groq/.test(cap.url) && cap.opts.headers.Authorization === 'Bearer gsk_abc' && cap.body.response_format, 'openai-style call');
  // 400 on response_format -> retry without
  let n = 0; out = await Ask.callAI([{ role: 'user', content: 'U' }], { fetch: async (u, o) => { n++; const b = JSON.parse(o.body); return b.response_format ? { ok: false, status: 400, text: async () => 'bad' } : okRes({ choices: [{ message: { content: 'ok2' } }] }); } });
  ok(out === 'ok2' && n === 2, 'retries without response_format on 400');
  // Anthropic
  Ask.setProviderId('anthropic'); Ask.setKey('sk-ant-1'); cap = {};
  out = await Ask.callAI([{ role: 'system', content: 'SYS' }, { role: 'user', content: 'U' }], { fetch: mk(okRes({ content: [{ type: 'text', text: 'claude says' }] }), cap) });
  ok(out === 'claude says' && cap.body.system === 'SYS' && cap.body.messages.length === 1 && cap.body.max_tokens > 0 && cap.opts.headers['x-api-key'] === 'sk-ant-1' && cap.opts.headers['anthropic-dangerous-direct-browser-access'] === 'true', 'anthropic call shape');
  // custom needs endpoint + model, key optional
  Ask.setProviderId('custom'); ok(!Ask.hasAI(), 'custom not configured'); Ask.setEndpoint('http://localhost:11434/v1/chat/completions'); Ask.setModel('llama3'); ok(Ask.hasAI(), 'custom configured without key');
  cap = {}; await Ask.callAI([{ role: 'user', content: 'U' }], { fetch: mk(okRes({ choices: [{ message: { content: 'x' } }] }), cap) }); ok(cap.url.startsWith('http://localhost:11434') && !cap.opts.headers.Authorization, 'custom call without auth header');
  // errors
  let e1; try { await Ask.callAI([{ role: 'user', content: 'U' }], { fetch: async () => { throw new TypeError('Failed to fetch'); } }); } catch (e) { e1 = e; }
  ok(e1 && e1.network && /Could not reach/.test(Ask.friendlyError(e1)), 'network error is friendly');
  Ask.setProviderId('gemini'); ok(/Google Gemini/.test(Ask.friendlyError({ status: 401 })) && /model/i.test(Ask.friendlyError({ status: 404 })), 'errors name the provider');
  // on-device provider (Mac app only)
  const st2 = {}; sb.localStorage = { getItem: (k) => (k in st2 ? st2[k] : null), setItem: (k, v) => { st2[k] = String(v); }, removeItem: (k) => { delete st2[k]; } };
  ok(Ask.getProviderId() === 'gemini', 'default provider is gemini outside the Mac app');
  sb.__native = 'macos'; sb.__nativeModel = {}; Ask.native = { ready: true, state: 'ready', name: 'Qwen' };
  ok(Ask.activeId() === 'local' && Ask.hasAI(), 'Mac app defaults to the on-device model once installed');
  Ask.native = { ready: false, state: 'none' }; ok(Ask.activeId() === 'local' && !Ask.hasAI(), 'Mac app still defaults to the on-device model (never silently to a cloud one) when it is not installed');
  Ask.setProviderId('local'); ok(Ask.getProviderId() === 'local' && !Ask.hasAI(), 'chosen local provider without model is not usable');
  ok(/Choose offline model/.test(Ask.friendlyError({ status: 503, message: 'The offline AI model is not installed.' })), 'local 503 explains how to install');
  let cap2 = {}; Ask.native = { ready: true }; sb.__nativeFetch = async (u, o) => { cap2.url = u; cap2.body = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{}' } }] }), text: async () => '' }; };
  await Ask.callAI([{ role: 'user', content: 'U' }]); ok(/local\.model/.test(cap2.url) && cap2.body.max_tokens > 0 && cap2.body.model === 'local' && cap2.body.chat_template_kwargs.enable_thinking === false, 'local call goes through the native bridge with thinking off');
  // a stale cloud choice without a key must not beat the on-device model in the Mac app
  sb.__native = 'macos'; sb.__nativeModel = {}; for (const k of Object.keys(st2)) delete st2[k];
  Ask.setProviderId('gemini'); ok(Ask.getProviderId() === 'gemini' && Ask.activeId() === 'local', 'a cloud choice without a key is selected but the on-device model stays active');
  Ask.setKey('AIza-test'); ok(Ask.activeId() === 'gemini', 'a cloud provider with a saved key becomes active');
  delete sb.__native; delete sb.__nativeModel; delete sb.__nativeFetch;
  console.log(`ask provider tests done: ${pass} passed`); if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
})();

r = Ask.parseReply('<think>let me think {not json}</think>\n{"title":"T","explanation":"e","rows":[{"text":"y=x"}]}'); ok(r && r.rows.length === 1 && r.title === 'T', 'reply parsing ignores <think> blocks');
f = Ask.facts([fx((x) => 2 * x + 1, 'y=a*x+1'), fx((x) => -x + 7, 'y=-x+7')]); ok(f.lines.every((l) => !/\*\*/.test(l)), 'labels containing * cannot break bold markup');

{ const c = Ask.cleanExplanation('1. Let \\( x \\) be width.\\n2. Area is $A = x(50-x)$ and x \\neq 0.\\nThe end');
  ok(c.indexOf('\n2. Area') > 0 && c.indexOf('\nThe end') > 0, 'escaped newlines become real newlines'); ok(!/\\\(/.test(c) && /`x`/.test(c), 'LaTeX delimiters become inline code'); ok(/\\neq|≠/.test(c), 'LaTeX commands starting with n are not broken'); }

ok(Ask.isProse('x = 0 to 50') && Ask.isProse('x=0to50') && Ask.isProse('y = the area') && !Ask.isProse('y=x^2{0<=x<=50}') && !Ask.isProse('y = sin(x) + 2') && !Ask.isProse('(25,625)') && !Ask.isProse('y=sqrt(x)'), 'prose rows are detected, maths is not');
ok(Ask.proseErrors([{ text: 'x = 0 to 50' }, { text: 'y=x' }]).length === 1, 'prose rows are reported for repair');

f = Ask.facts([fx((x) => 2000 / x + 2 * Math.PI * x * x, 'y=2000/x+2*pi*x^2')]);
ok(f.points.filter((q) => q.kind === 'max').length === 0 && f.points.some((q) => q.kind === 'min' && Math.abs(q.x - 5.4193) < 1e-3 && Math.abs(q.y - 553.58) < 0.01) && f.points.every((q) => Math.abs(q.y) < 1e6), 'a pole is never reported as a maximum (surface-area-of-a-can case)');
ok(Ask.isHalfPlane('x > 0') && Ask.isHalfPlane('y>=-3') && !Ask.isHalfPlane('1<x<3') && !Ask.isHalfPlane('y>x^2') && Ask.proseErrors([{ text: 'x>0' }]).length === 1, 'lone half-plane inequalities are rejected, regions are kept');

{ const can = [fx((x) => 2000 / x + 2 * Math.PI * x * x, 'can')]; const pts = Ask.facts(can, { lo: -50, hi: 50 }).points; const w = Ask.frame(can, pts);
  ok(w.xmin < 5.4193 && w.xmax > 5.4193 && w.ymin < 553 && w.ymax > 553 && w.ymax < 5e4, 'frame shows the minimum of the can curve without being blown up by the pole');
  const w2 = Ask.frame([fx((x) => 1 / x, 'inv')], []); ok(w2.xmax - w2.xmin === 20 && w2.ymax - w2.ymin < 1e5, 'frame stays sane for 1/x with no points');
  const w3 = Ask.frame([], [{ x: 25, y: 625 }, { x: 0, y: 0 }, { x: 50, y: 0 }]); ok(w3.xmin < 0 && w3.xmax > 50 && w3.ymax > 625, 'frame includes every labelled point'); }

{ const c = Ask.cleanExplanation('Substitute h: $ y = 2\\pi x \\left(\\frac{1000}{\\pi x^2}\\right) + 2\\pi x^2 = \\frac{2000}{x} + 2\\pi x^2 $. Also \\pi r^2 h and \\times.');
  ok(!/\\|\$/.test(c), 'long $...$ maths and leftover LaTeX commands are fully converted: ' + c); ok(/π/.test(c), 'pi becomes the pi symbol'); }

{ const field = Ask.facts([fx((x) => (120 * x - x * x) / 2, 'field')], { lo: -250, hi: 250 });
  ok(field.points.some((q) => q.kind === 'max' && Math.abs(q.x - 60) < 1e-3 && Math.abs(q.y - 1800) < 1e-3) && field.points.some((q) => q.kind === 'zero' && Math.abs(q.x - 120) < 1e-3), 'features out to x=120 are found (fence problem)'); }

if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log(`ask tests: ${pass} passed`);
