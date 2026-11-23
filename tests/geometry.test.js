/* Geometry construction logic tests. Run with:  node tests/geometry.test.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const sb = { console, Math, window: null };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/js/geometry.js'), 'utf8'), sb);

const fakeGraph = { X: (x) => x * 40, Y: (y) => -y * 40, view: { sx: 40, sy: 40 }, range: () => ({ xmin: -10, xmax: 10, ymin: -10, ymax: 10 }), requestDraw() {}, theme: { bg: '#fff', text: '#000' }, over: { style: {} } };
const geo = new sb.Geo(fakeGraph, {});
let pass = 0; const fails = [];
const near = (a, b) => Math.abs(a - b) < 1e-9;
const ok = (c, m) => { if (c) pass++; else fails.push(m); };
const run = (tool, pts) => { geo.setTool(tool); pts.forEach(([x, y]) => geo.click(x, y)); };

run('line', [[-4, 0], [4, 0]]);                 // A, B, line
run('circle', [[0, 0], [3, 0]]);                // C (centre), D on circle, circle
ok(geo.objects.length === 6, 'six objects after line + circle');
run('intersect', [[2, 0], [0, 3]]);             // click the line (away from points), then the circle's top
const ints = geo.objects.filter((o) => o.t === 'int').map((o) => geo.pos(o));
ok(ints.length === 2 && ints.some((p) => near(p[0], 3) && near(p[1], 0)) && ints.some((p) => near(p[0], -3) && near(p[1], 0)), 'line/circle intersection at (±3, 0)');
run('perp', [[1, 4], [2, 0]]);                  // new point then the line
const perp = geo.objects.find((o) => o.t === 'perp'), ps = geo.shape(perp);
ok(perp && near(ps.d[0], 0) && ps.d[1] !== 0 && near(ps.p[0], 1), 'perpendicular is vertical through (1,4)');
run('parallel', [[-1, -5], [2, 0]]);
const par = geo.objects.find((o) => o.t === 'par'), pp = geo.shape(par);
ok(par && near(pp.d[1], 0) && near(pp.p[1], -5), 'parallel is horizontal through (-1,-5)');
// dragging a free point updates dependants
const A = geo.objects.find((o) => o.name === 'A'); A.y = 4;
ok(!geo.shape(geo.objects.find((o) => o.t === 'line')).d.every((v) => v === 0), 'line follows moved point');
// delete cascades to dependants
const n0 = geo.objects.length; run('delete', [[-1, -5]]);
ok(geo.objects.length < n0 && !geo.objects.some((o) => o.t === 'par'), 'deleting a point removes the parallel built on it');
geo.undo(); ok(geo.objects.some((o) => o.t === 'par'), 'undo restores deleted objects');

if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log(`geometry tests: ${pass} passed`);
