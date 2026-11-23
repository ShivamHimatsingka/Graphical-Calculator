/* Math-engine regression tests. Run with:  node tests/engine.test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { console, Math, Float64Array };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/js/mathengine.js'), 'utf8'), sandbox);
const ME = sandbox.ME;

let pass = 0;
const fails = [];
function value(src) {
  for (const k of Object.keys(ME.V)) delete ME.V[k];
  ME.LISTVARS.clear();
  const st = ME.parseStatement(src, []);
  const ast = ME.resolve(st.parts[0], new Set());
  return ME.compile(ast, [])();
}
const near = (a, b) => (typeof a === 'number' ? Math.abs(a - b) <= 1e-6 * (1 + Math.abs(b)) : false);
function check(src, expected) {
  let got;
  try { got = value(src); } catch (e) { got = 'ERR ' + e.message; }
  const ok = Array.isArray(expected)
    ? Array.isArray(got) && got.length === expected.length && got.every((v, i) => near(v, expected[i]))
    : near(got, expected);
  if (ok) pass++; else fails.push(`${src}  expected ${JSON.stringify(expected)}  got ${JSON.stringify(got)}`);
}

// arithmetic & precedence
check('2+3*4', 14); check('2^3^2', 512); check('-2^2', -4); check('2(3+1)', 8); check('(2)(3)', 6);
check('10^-2', 0.01); check('1e3', 1000); check('5!', 120); check('|-3|', 3); check('(-8)^(1/3)', -2);
// functions
check('sin(pi/2)', 1); check('sin^2(0.5)+cos^2(0.5)', 1); check('sqrt(16)', 4); check('√16', 4);
check('ln(e)', 1); check('log(100)', 2); check('log_2(8)', 3); check('log2(8)', 3); check('atan2(1,1)', Math.PI / 4);
check('floor(2.7)', 2); check('ceil(2.1)', 3); check('mod(7,3)', 1); check('sign(-4)', -1); check('cbrt(27)', 3);
check('nCr(5,2)', 10); check('nPr(5,2)', 20); check('gcd(12,18)', 6); check('lcm(4,6)', 12); check('hypot(3,4)', 5);
check('30°', Math.PI / 6); check('tau', 2 * Math.PI); check('arcsin(1)', Math.PI / 2);
check('{1<2:5,7}', 5); check('{1>2:5,7}', 7);
check('sum(n,1,10,n^2)', 385); check('prod(n,1,5,n)', 120); check('int(0,pi,sin(x))', 2); check('nderiv(x^2,3)', 6);
// lists & statistics
check('[1...5]', [1, 2, 3, 4, 5]); check('[2,4...10]', [2, 4, 6, 8, 10]); check('[1,2,3]^2', [1, 4, 9]);
check('2[1,2,3]'.replace('2[', '2*['), [2, 4, 6]); check('[10,20,30][2]', 20); check('[1...10][[1...10]>7]', [8, 9, 10]);
check('[5,3,9,1][2...3]', [3, 9]); check('sort([5,3,9,1])', [1, 3, 5, 9]); check('unique([3,1,3,2])', [1, 2, 3]);
check('join([1,2],[3])', [1, 2, 3]); check('total([1...10])', 55); check('mean([1...10])', 5.5);
check('median([1,9,3])', 3); check('stdev([2,4,4,4,5,5,7,9])', Math.sqrt(32 / 7)); check('stdevp([2,4,4,4,5,5,7,9])', 2);
check('count([1...7])', 7); check('max([1...7])', 7); check('min(3,2)', 2); check('quartile([1...5],1)', 2);
check('corr([1,2,3],[2,4,6])', 1); check('sin([0])', [0]);
// distributions
check('normcdf(1.96)', 0.9750021048517795); check('normpdf(0)', 1 / Math.sqrt(2 * Math.PI)); check('invnorm(0.975)', 1.959963984540054);
check('binompdf(10,0.5,5)', 252 / 1024); check('binomcdf(2,0.5,1)', 0.75); check('poissonpdf(3,2)', 4.5 * Math.exp(-3));
check('expcdf(1)', 1 - Math.exp(-1)); check('unifcdf(0.25)', 0.25);
check('count(random(5))', 5); check('count(shuffle([1...6]))', 6); check('total(shuffle([1...6]))', 21);

// complex numbers
function cx(src, re, im) {
  let got; try { got = value(src); } catch (e) { got = 'ERR ' + e.message; }
  const c = typeof got === 'number' ? { re: got, im: 0 } : got;
  if (c && near(c.re, re) && Math.abs(c.im - im) < 1e-9) pass++; else fails.push(`${src}  expected ${re}+${im}i  got ${JSON.stringify(got)}`);
}
cx('i^2', -1, 0); cx('3+4i', 3, 4); cx('(3+4i)(1-2i)', 11, -2); cx('(1+i)^2', 0, 2); cx('1/i', 0, -1); cx('conj(3+4i)', 3, -4);
cx('e^(i pi)', -1, 0); cx('sin(i)', 0, Math.sinh(1)); cx('sum(n,1,4,i^n)', 0, 0); cx('sum(i,1,4,i)', 10, 0);
check('abs(3+4i)', 5); check('real(3+4i)', 3); check('imag(3+4i)', 4); check('arg(i)', Math.PI / 2);

// list comprehension
check('[n^2 for n=[1...5]]', [1, 4, 9, 16, 25]); check('total([2k for k=[1,2,3]])', 12); check('[a+1 for a=[1...3]][2]', 3);
// statistics plot markers
{
  const h = value('histogram([1,2,2,3],1)'), b = value('boxplot([1,2,3,4,5])');
  if (h && h.__plot === 'hist' && h.data.length === 4 && h.w === 1 && b && b.__plot === 'box') pass++; else fails.push('histogram/boxplot markers');
}
// complex-valued function parameters (used for domain colouring)
function cxFn(src, re, im, arg) {
  for (const k of Object.keys(ME.V)) delete ME.V[k];
  const st = ME.parseStatement(src, []);
  const out = ME.compile(ME.resolve(st.parts[0], new Set()), ['z'], { complex: ['z'] })(arg);
  const c = typeof out === 'number' ? { re: out, im: 0 } : out;
  if (c && near(c.re, re) && Math.abs(c.im - im) < 1e-9) pass++; else fails.push(`${src} @ ${JSON.stringify(arg)} expected ${re}+${im}i got ${JSON.stringify(out)}`);
}
cxFn('z^2-1', -2, 0, new ME.Cx(0, 1)); cxFn('1/(z^2+1)', 0.2, 0, new ME.Cx(2, 0)); cxFn('conj(z)', 1, -2, new ME.Cx(1, 2)); cxFn('z*i', -2, 1, new ME.Cx(1, 2));

// parser errors
for (const bad of ['2+', '(1', 'sin(', '1 $ 2']) {
  try { ME.parseStatement(bad, []); fails.push(`"${bad}" should not parse`); } catch (e) { pass++; }
}

if (fails.length) { console.error(`${fails.length} FAILED:\n` + fails.join('\n')); process.exit(1); }
console.log(`engine tests: ${pass} passed`);
