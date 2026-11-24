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

if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log(`ask tests: ${pass} passed`);
