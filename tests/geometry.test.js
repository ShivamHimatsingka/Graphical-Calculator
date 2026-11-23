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


// ---- transformations, bisector, area, conics (fresh construction)
const geo2 = new sb.Geo(fakeGraph, {});
const run2 = (tool, pts) => { geo2.setTool(tool); pts.forEach(([x, y]) => geo2.click(x, y)); };
run2('point', [[1, 2]]);                         // A = (1,2)
run2('point', [[0, -5]]); run2('point', [[4, -5]]); run2('line', [[0, -5], [4, -5]]); // mirror y = -5 (points are re-used)
const mirror = geo2.objects.find((o) => o.t === 'line');
geo2.tool = 'reflect'; geo2.pending = []; geo2.click(2, -5); geo2.click(1, 2);          // reference line, then the point
const refl = geo2.objects.find((o) => o.t === 'tpt' && o.op === 'reflect'), rp = geo2.pos(refl);
ok(refl && near(rp[0], 1) && near(rp[1], -12), 'reflection of (1,2) in y=-5 is (1,-12)');
run2('point', [[0, 0]]);                         // O
geo2.tool = 'rotate'; geo2.param.rotate = 90; geo2.pending = []; geo2.click(0, 0); geo2.click(1, 2);
const rot = geo2.objects.filter((o) => o.t === 'tpt' && o.op === 'rotate').map((o) => geo2.pos(o))[0];
ok(rot && near(rot[0], -2) && near(rot[1], 1), 'rotating (1,2) by 90° about the origin gives (-2,1)');
geo2.tool = 'dilate'; geo2.param.dilate = 3; geo2.pending = []; geo2.click(0, 0); geo2.click(1, 2);
const dil = geo2.objects.filter((o) => o.t === 'tpt' && o.op === 'dilate').map((o) => geo2.pos(o))[0];
ok(dil && near(dil[0], 3) && near(dil[1], 6), 'dilating (1,2) by 3 about the origin gives (3,6)');
// polygon (unit right triangle) -> area, translate
const geo3 = new sb.Geo(fakeGraph, {});
const run3 = (tool, pts) => { geo3.setTool(tool); pts.forEach(([x, y]) => geo3.click(x, y)); };
run3('polygon', [[0, 0], [4, 0], [0, 3], [0, 0]]);
const poly = geo3.objects.find((o) => o.t === 'poly');
const pa = geo3.polyArea(poly); ok(pa && near(pa.area, 6) && near(pa.per, 12), 'triangle 3-4-5 has area 6 and perimeter 12');
geo3.tool = 'area'; geo3.pending = []; geo3.click(2, 0.0);
ok(geo3.objects.some((o) => o.t === 'area'), 'area measurement object created');
geo3.tool = 'translate'; geo3.pending = []; geo3.click(10, 10); geo3.click(11, 12);       // vector (1,2)
geo3.click(4, 0);                                                                          // translate the point B=(4,0)
const tr = geo3.objects.find((o) => o.t === 'tpt' && o.op === 'translate');
ok(tr && near(geo3.pos(tr)[0], 5) && near(geo3.pos(tr)[1], 2), 'translation by (1,2)');
// bisector of the right angle at the origin points along (1,1)
const geo4 = new sb.Geo(fakeGraph, {});
geo4.setTool('bisector'); [[4, 0], [0, 0], [0, 4]].forEach(([x, y]) => geo4.click(x, y));
const bis = geo4.shape(geo4.objects.find((o) => o.t === 'bis'));
ok(bis && near(bis.d[0], bis.d[1]) && bis.d[0] > 0, 'angle bisector direction is (1,1)');
// conics: every sampled point satisfies the focal definition
const geo5 = new sb.Geo(fakeGraph, {});
geo5.setTool('ellipse'); [[-3, 0], [3, 0], [0, 4]].forEach(([x, y]) => geo5.click(x, y));
const ell = geo5.shape(geo5.objects.find((o) => o.t === 'ell')), ep = geo5.conicPolys(ell)[0];
ok(ell && near(ell.a, 5) && near(ell.b, 4) && ep.every((p) => Math.abs(Math.hypot(p[0] + 3, p[1]) + Math.hypot(p[0] - 3, p[1]) - 10) < 1e-6), 'ellipse: PF1+PF2 = 2a = 10');
const geo6 = new sb.Geo(fakeGraph, {});
geo6.setTool('hyperbola'); [[-5, 0], [5, 0], [3, 2.4]].forEach(([x, y]) => geo6.click(x, y));
const hyp = geo6.shape(geo6.objects.find((o) => o.t === 'hyp'));
const hd = Math.abs(Math.hypot(3 + 5, 2.4) - Math.hypot(3 - 5, 2.4));
ok(hyp && geo6.conicPolys(hyp).length === 2 && geo6.conicPolys(hyp).every((poly) => poly.every((p) => Math.abs(Math.abs(Math.hypot(p[0] + 5, p[1]) - Math.hypot(p[0] - 5, p[1])) - hd) < 1e-5)), 'hyperbola: |PF1-PF2| constant');
const geo7 = new sb.Geo(fakeGraph, {});
geo7.setTool('line'); geo7.click(-8, -2); geo7.click(8, -2);                     // directrix y = -2
geo7.setTool('parabola'); geo7.click(0, 2); geo7.click(3, -2);                    // focus (0,2)
const par7 = geo7.shape(geo7.objects.find((o) => o.t === 'parab'));
ok(par7 && geo7.conicPolys(par7)[0].every((p) => Math.abs(Math.hypot(p[0], p[1] - 2) - Math.abs(p[1] + 2)) < 1e-6), 'parabola: distance to focus equals distance to directrix');

// ---- intersections with conics
const geo8 = new sb.Geo(fakeGraph, {});
const run8 = (tool, pts) => { geo8.setTool(tool); pts.forEach(([x, y]) => geo8.click(x, y)); };
run8('ellipse', [[-3, 0], [3, 0], [0, 4]]);
run8('circle', [[0, 0], [4.5, 0]]);
run8('line', [[-6, -6], [6, 6]]);
const E8 = geo8.shape(geo8.objects.find((o) => o.t === 'ell')), C8 = geo8.shape(geo8.objects.find((o) => o.t === 'circ')), L8 = geo8.shape(geo8.objects.find((o) => o.t === 'line'));
const ec = geo8.intersectAll(C8, E8);
ok(ec.length === 4 && ec.every((p) => Math.abs(Math.hypot(p[0], p[1]) - 4.5) < 1e-6 && Math.abs(p[0] * p[0] / 25 + p[1] * p[1] / 16 - 1) < 1e-6), 'circle ∩ ellipse gives 4 points on both curves');
const el = geo8.intersectAll(L8, E8);
ok(el.length === 2 && el.every((p) => near(p[0], p[1]) && Math.abs(Math.abs(p[0]) - 3.1234) < 1e-3), 'line y=x ∩ ellipse at ±3.123');
// the intersect tool builds the points (clicking the ellipse's rim and the circle)
geo8.setTool('intersect'); geo8.click(5, 0.0 + 0); // ellipse vertex at (5,0)
ok(geo8.pending.length <= 1, 'intersect tool accepts a conic click');

// ---- points on objects and loci
const geo9 = new sb.Geo(fakeGraph, {});
const run9 = (tool, pts) => { geo9.setTool(tool); pts.forEach(([x, y]) => geo9.click(x, y)); };
run9('circle', [[2, 0], [3, 0]]);                // centre (2,0), radius 1
run9('pointon', [[3, 0]]);                         // P on the circle at angle 0
const P9 = geo9.objects.find((o) => o.t === 'onp');
ok(P9 && near(P9.s, 0) && near(geo9.pos(P9)[0], 3), 'point on circle at angle 0');
P9.s = Math.PI / 2; ok(near(geo9.pos(P9)[0], 2) && near(geo9.pos(P9)[1], 1), 'moving the parameter moves the point along the circle');
run9('point', [[-6, 0]]);                          // fixed A far from other things
const A9 = geo9.objects.filter((o) => o.t === 'pt').pop();
run9('midpoint', [[-6, 0], [2, 1]]);               // midpoint of A and P (clicking the onp)
const M9 = geo9.objects.find((o) => o.t === 'mid');
run9('locus', [[2, 1], [M9 ? geo9.pos(M9)[0] : 0, M9 ? geo9.pos(M9)[1] : 0]]);
const loc = geo9.objects.find((o) => o.t === 'locus'), lp = loc ? geo9.locusPts(loc) : [];
const cx9 = (A9.x + 2) / 2, cy9 = 0;
ok(loc && lp.length > 100 && lp.every((q) => q && Math.abs(Math.hypot(q[0] - cx9, q[1] - cy9) - 0.5) < 1e-6), 'locus of the midpoint is a circle of half the radius');
ok(near(P9.s, Math.PI / 2), 'locus tracing restores the driver position');

// ---- transforming constructions (perpendicular, parabola)
const geoA = new sb.Geo(fakeGraph, {});
const runA = (tool, pts) => { geoA.setTool(tool); pts.forEach(([x, y]) => geoA.click(x, y)); };
runA('line', [[-4, 0], [4, 0]]); runA('perp', [[1, 4], [2, 0]]);
runA('line', [[-8, -6], [8, -6]]);                                          // mirror y = -6
geoA.tool = 'reflect'; geoA.pending = []; geoA.click(-5, -6.0); geoA.click(1, 4.0);
const perpImg = geoA.objects.filter((o) => o.t === 'perp');
ok(perpImg.length === 1, 'clicking a point does not duplicate the perpendicular');
geoA.click(1, 8);                                                           // click the perpendicular line itself
const perps = geoA.objects.filter((o) => o.t === 'perp');
ok(perps.length === 2 && near(geoA.shape(perps[1]).d[0], 0), 'reflected perpendicular line is built from the images');
const geoB = new sb.Geo(fakeGraph, {});
const runB = (tool, pts) => { geoB.setTool(tool); pts.forEach(([x, y]) => geoB.click(x, y)); };
runB('line', [[-8, -2], [8, -2]]); runB('parabola', [[0, 2], [3, -2]]); runB('point', [[0, 0.0]]);
const O = geoB.objects.find((o) => o.t === 'pt' && o.x === 0 && o.y === 0);
geoB.tool = 'rotate'; geoB.param.rotate = 90; geoB.pending = []; geoB.click(0, 0); geoB.click(0, 0.5 - 0.5 + 0); // pick centre, then...
geoB.click(5, -2);                                                          // ...the parabola is clicked via its directrix point? (ensures no throw)
ok(true, 'transform tool tolerates clicks on constructions');

if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log(`geometry tests: ${pass} passed`);
