/* 3D helper tests (section clipping, shadows, light direction). Run with:  node tests/graph3d.test.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const sb = { console, Math };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/js/graph3d.js'), 'utf8'), sb);
const { clipPoly, shadowPoint, lightDir } = sb.Graph3D.util;

let pass = 0; const fails = [];
const near = (a, b) => Math.abs(a - b) < 1e-9;
const ok = (c, m) => { if (c) pass++; else fails.push(m); };
const area2d = (P, i, j) => { let s = 0; for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; s += a[i] * b[j] - b[i] * a[j]; } return Math.abs(s) / 2; };

const square = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];
let c = clipPoly(square, 0, 0.25, false);                       // keep x <= 0.25
ok(c.poly.length === 4 && near(area2d(c.poly, 0, 1), 0.25), 'clipping a unit square at x=0.25 keeps a quarter of the area');
ok(c.seg && c.seg.every((p) => near(p[0], 0.25)), 'the cut segment lies on the section plane');
c = clipPoly(square, 0, 0.25, true);                            // keep x >= 0.25
ok(near(area2d(c.poly, 0, 1), 0.75), 'flipping keeps the other side (area 0.75)');
c = clipPoly(square, 0, 2, false); ok(c.poly.length === 4 && !c.seg, 'a polygon fully on the kept side is unchanged');
c = clipPoly(square, 0, -1, false); ok(c.poly.length === 0, 'a polygon fully on the removed side disappears');
c = clipPoly([[0, 0, 0], [2, 0, 0], [0, 0, 2]], 2, 1, false); ok(c.seg && near(c.seg[0][2], 1) && near(c.seg[1][2], 1), 'z-plane section of a triangle');

const up = lightDir(0, 90); ok(near(up[2], 1) && near(up[0], 0), 'overhead light points along +z');
const side = lightDir(90, 0); ok(near(side[1], 1) && near(side[2], 0), 'horizon light at azimuth 90° points along +y');
let sp = shadowPoint([0.3, -0.2, 0.5], [0, 0, 1]); ok(near(sp[0], 0.3) && near(sp[1], -0.2) && near(sp[2], -1), 'overhead light drops a vertical shadow');
sp = shadowPoint([0, 0, 0], [0.5, 0, 0.5]); ok(near(sp[0], -1) && near(sp[1], 0) && near(sp[2], -1), 'slanted light throws the shadow away from the light');

if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
console.log(`graph3d tests: ${pass} passed`);
