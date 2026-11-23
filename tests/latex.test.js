/* LaTeX <-> text converter tests. Run with:  node tests/latex.test.js */
const LX = require('../docs/js/latex.js');

const toText = [
  ['x^{2}+\\frac{1}{2}', 'x^2+(1/2)'], ['\\sqrt{x+1}', 'sqrt(x+1)'], ['\\sin\\left(x\\right)', 'sin(x)'], ['\\left|x\\right|', '|x|'],
  ['r=3\\cos\\left(4\\theta\\right)\\left\\{0\\le\\theta\\le2\\pi\\right\\}', 'r=3cos(4theta){0<=theta<=2pi}'],
  ['\\log_{2}\\left(8\\right)', 'log_2(8)'], ['x_{1}', 'x_1'], ['y_1\\sim mx_1+b', 'y_1~mx_1+b'],
  ['\\operatorname{sum}\\left(n,1,10,n^2\\right)', 'sum(n,1,10,n^2)'], ['\\sum_{n=1}^{10}n^2', 'sum(n,1,10,n^2)'],
  ['\\int_{0}^{1}x^2dx', 'int(0,1,x^2)'], ['f^{\\prime}\\left(x\\right)', "f'(x)"], ['\\lbrack 1\\ldots 5\\rbrack', '[1...5]'],
  ['x^{-1}', 'x^(-1)'], ['\\sqrt[3]{x}', 'cbrt(x)'], ['2\\cdot 3', '2*3'], ['\\frac{x^{2}}{x+1}', '((x^2)/(x+1))'],
  ['a_{12}', 'a_12'], ['\\sin^{2}\\left(x\\right)', 'sin^2(x)'], ['e^{i\\pi}', 'e^(ipi)'], ['x\\le 3', 'x<=3'],
];
const roundTrip = [
  'y=x^2', 'y=sqrt(x+1)', 'r=3cos(4theta){0<=theta<=2pi}', 'y_1~m*x_1+b', 'L=[1...10]', 'y=log_2(x)', 'y=asin(x)', 'f(x)=x^3-3x',
  "y=f'(x)", 'y=abs(x)+x^(1/3)', 'int(0,1,x^2)', '(sin(3t),sin(2t)){0<=t<=2pi}', 'y={x<0:-x,x^2}', 'a_1=3', 'y=x^(-2)',
];

let bad = 0;
for (const [tex, want] of toText) { const got = LX.latexToText(tex); if (got !== want) { bad++; console.error(`latexToText(${tex}) = ${got}, expected ${want}`); } }
for (const t of roundTrip) { const back = LX.latexToText(LX.textToLatex(t)); if (back !== t) { bad++; console.error(`round trip ${t} -> ${LX.textToLatex(t)} -> ${back}`); } }
if (bad) { console.error(`${bad} latex test(s) failed`); process.exit(1); }
console.log(`latex tests: ${toText.length + roundTrip.length} passed`);
