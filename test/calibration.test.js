#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

global.window = global;
if (!global.crypto) global.crypto = {};
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = function () { return crypto.randomUUID(); };
}

var calibSrc = fs.readFileSync(path.join(ROOT, 'js', 'calibration.js'), 'utf8');
eval(calibSrc);

var C = global.Calibration;

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.error(`  ✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    failures.push(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    console.error(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertApprox(actual, expected, eps, message) {
  var ok = Math.abs(actual - expected) < eps;
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`${message} — expected ~${expected}, got ${actual}`);
    console.error(`  ✗ ${message} — expected ~${expected}, got ${actual}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

section('solveHomography: 恒等变换');

(function () {
  var pts = [
    { x: 10, y: 20 },
    { x: 80, y: 20 },
    { x: 80, y: 90 },
    { x: 10, y: 90 },
  ];
  var H = C.solveHomography(pts, pts);
  assert(H !== null, '恒等变换 H 非空');
  assertEqual(H.type, 'homography', '类型 = homography');

  for (var i = 0; i < 4; i++) {
    var p = C.projectPoint(H, pts[i].x, pts[i].y);
    assertApprox(p.x, pts[i].x, 0.01, `恒等变换 x[${i}]`);
    assertApprox(p.y, pts[i].y, 0.01, `恒等变换 y[${i}]`);
  }
})();

section('solveHomography: 平移变换');

(function () {
  var src = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  var dx = 10, dy = 20;
  var dst = src.map(function (p) { return { x: p.x + dx, y: p.y + dy }; });
  var H = C.solveHomography(src, dst);
  assert(H !== null, '平移变换 H 非空');

  for (var i = 0; i < 4; i++) {
    var p = C.projectPoint(H, src[i].x, src[i].y);
    assertApprox(p.x, dst[i].x, 0.1, `平移变换 x[${i}]`);
    assertApprox(p.y, dst[i].y, 0.1, `平移变换 y[${i}]`);
  }
})();

section('solveHomography: 缩放变换');

(function () {
  var src = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 50 },
    { x: 0, y: 50 },
  ];
  var scale = 2.0;
  var dst = src.map(function (p) { return { x: p.x * scale, y: p.y * scale }; });
  var H = C.solveHomography(src, dst);
  assert(H !== null, '缩放变换 H 非空');

  var midPoint = C.projectPoint(H, 25, 25);
  assertApprox(midPoint.x, 50, 0.5, '缩放中间点 x');
  assertApprox(midPoint.y, 50, 0.5, '缩放中间点 y');
})();

section('solveHomography: 退化输入返回 null');

(function () {
  var collinear = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
  ];
  var H = C.solveHomography(collinear, collinear);
  assertEqual(H, null, '共线点返回 null');
})();

section('solveAffine: 平移变换');

(function () {
  var src = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ];
  var dx = 5, dy = 10;
  var dst = src.map(function (p) { return { x: p.x + dx, y: p.y + dy }; });
  var H = C.solveAffine(src, dst);
  assert(H !== null, '仿射平移变换 H 非空');
  assertEqual(H.type, 'affine', '类型 = affine');

  for (var i = 0; i < 3; i++) {
    var p = C.projectPoint(H, src[i].x, src[i].y);
    assertApprox(p.x, dst[i].x, 0.1, `仿射平移 x[${i}]`);
    assertApprox(p.y, dst[i].y, 0.1, `仿射平移 y[${i}]`);
  }
})();

section('solveAffine: 旋转+缩放');

(function () {
  var src = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  var angle = Math.PI / 6;
  var cos = Math.cos(angle);
  var sin = Math.sin(angle);
  var s = 2.0;
  var dst = src.map(function (p) {
    return {
      x: s * (p.x * cos - p.y * sin),
      y: s * (p.x * sin + p.y * cos),
    };
  });
  var H = C.solveAffine(src, dst);
  assert(H !== null, '旋转缩放 H 非空');

  var testPt = C.projectPoint(H, 0.5, 0.5);
  var expectedX = s * (0.5 * cos - 0.5 * sin);
  var expectedY = s * (0.5 * sin + 0.5 * cos);
  assertApprox(testPt.x, expectedX, 0.01, '旋转缩放测试点 x');
  assertApprox(testPt.y, expectedY, 0.01, '旋转缩放测试点 y');
})();

section('projectPoint: null 变换');

(function () {
  var p = C.projectPoint(null, 10, 20);
  assertEqual(p, null, 'null 变换返回 null');
})();

section('projectMarker: 点标记投影');

(function () {
  var src = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  var dst = src.map(function (p) { return { x: p.x + 10, y: p.y + 20 }; });
  var H = C.solveHomography(src, dst);

  var marker = {
    id: 'm1',
    x: 50,
    y: 50,
    type: '虫蛀点',
    typeId: 'type-1',
    mode: 'point',
    note: 'test',
  };
  var projected = C.projectMarker(H, marker);
  assert(projected !== null, '点标记投影非空');
  assertApprox(projected.x, 60, 0.5, '投影后 x ≈ 60');
  assertApprox(projected.y, 70, 0.5, '投影后 y ≈ 70');
  assertEqual(projected.migrated, true, '投影标记 migrated = true');
  assertEqual(projected.sourceMarkerId, 'm1', '源标记 ID 保留');
})();

section('projectMarker: 区域标注投影');

(function () {
  var src = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  var dst = src.map(function (p) { return { x: p.x, y: p.y }; });
  var H = C.solveHomography(src, dst);

  var region = {
    id: 'r1',
    x: 20,
    y: 30,
    width: 10,
    height: 15,
    type: '破洞',
    typeId: 'type-2',
    mode: 'region',
    note: '',
  };
  var projected = C.projectMarker(H, region);
  assert(projected !== null, '区域标注投影非空');
  assert(projected.width > 0, '投影后 width > 0');
  assert(projected.height > 0, '投影后 height > 0');
  assertEqual(projected.mode, 'region', '投影后 mode = region');
})();

section('projectMarkers: 批量投影');

(function () {
  var src = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  var H = C.solveHomography(src, src);

  var markers = [
    { id: 'm1', x: 10, y: 10, type: 't1', typeId: 't1', mode: 'point', note: '' },
    { id: 'm2', x: 50, y: 50, type: 't2', typeId: 't2', mode: 'point', note: '' },
  ];
  var results = C.projectMarkers(H, markers);
  assertEqual(results.length, 2, '批量投影返回 2 个结果');

  assertEqual(C.projectMarkers(null, markers).length, 0, 'null 变换返回空');
  assertEqual(C.projectMarkers(H, null).length, 0, 'null 标记数组返回空');
})();

section('computeResidualError: 零误差');

(function () {
  var src = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  var H = C.solveHomography(src, src);
  var residual = C.computeResidualError(H, src, src);
  assert(residual !== null, '残差非空');
  assertApprox(residual.rmse, 0, 0.01, '恒等变换 RMSE ≈ 0');
  assertApprox(residual.maxError, 0, 0.01, '恒等变换最大误差 ≈ 0');
})();

section('computeResidualError: null 输入');

(function () {
  assertEqual(C.computeResidualError(null, [], []), null, 'null 变换返回 null');
})();

section('computeQualityScore: 质量评分');

(function () {
  var excellent = C.computeQualityScore({ rmse: 0.5 });
  assertEqual(excellent.level, 'excellent', 'RMSE 0.5 → excellent');

  var good = C.computeQualityScore({ rmse: 2.0 });
  assertEqual(good.level, 'good', 'RMSE 2.0 → good');

  var acceptable = C.computeQualityScore({ rmse: 5.0 });
  assertEqual(acceptable.level, 'acceptable', 'RMSE 5.0 → acceptable');

  var poor = C.computeQualityScore({ rmse: 7.0 });
  assertEqual(poor.level, 'poor', 'RMSE 7.0 → poor');

  var bad = C.computeQualityScore({ rmse: 15.0 });
  assertEqual(bad.level, 'bad', 'RMSE 15.0 → bad');

  var invalid = C.computeQualityScore(null);
  assertEqual(invalid.level, 'invalid', 'null → invalid');
})();

section('validateCalibrationPoints: 合法点集');

(function () {
  var src = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  var result = C.validateCalibrationPoints(src, src);
  assertEqual(result.valid, true, '分散点集验证通过');
  assert(result.srcArea > 0, '源页面面积 > 0');
})();

section('validateCalibrationPoints: 不足 4 对');

(function () {
  var three = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
  var result = C.validateCalibrationPoints(three, three);
  assertEqual(result.valid, false, '3 对点验证失败');
  assert(result.reason.indexOf('4') !== -1, '提示需要 4 对');
})();

section('validateCalibrationPoints: 共线检测');

(function () {
  var collinear = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 1 },
  ];
  var result = C.validateCalibrationPoints(collinear, collinear);
  assert(result.issues && result.issues.length > 0, '共线点产生 issues');
})();

section('suggestAdjacentPages: 建议相邻页面');

(function () {
  var pages = [
    { id: 'p1', name: '第1页', markers: [{ id: 'm1' }] },
    { id: 'p2', name: '第2页', markers: [] },
    { id: 'p3', name: '第3页', markers: [] },
  ];
  var result = C.suggestAdjacentPages(pages, 'p2');
  assert(result !== null, '返回非空');
  assert(result.sourcePageId === 'p1' || result.sourcePageId === 'p3', '源页面是相邻页');

  var first = C.suggestAdjacentPages(pages, 'p1');
  assert(first !== null, '第1页有建议');
  assertEqual(first.sourcePageId, 'p2', '第1页的源页面是第2页');
})();

section('computeTransform: 4 对校准点');

(function () {
  var src = [
    { x: 10, y: 20 },
    { x: 80, y: 20 },
    { x: 80, y: 90 },
    { x: 10, y: 90 },
  ];
  var H = C.computeTransform(src, src);
  assert(H !== null, 'computeTransform 返回非空');
  assertEqual(H.type, 'homography', 'computeTransform 返回 homography');

  assertEqual(C.computeTransform(null, src), null, 'null src → null');
  assertEqual(C.computeTransform(src, null), null, 'null dst → null');

  var threeSrc = src.slice(0, 3);
  assertEqual(C.computeTransform(threeSrc, src), null, '3 对点 → null');
})();

section('computeBestTransform: 优质变换');

(function () {
  var src = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  var result = C.computeBestTransform(src, src);
  assert(result !== null, 'computeBestTransform 返回非空');
  assert(result.transform !== null, '变换矩阵非空');
  assert(result.quality !== null, '质量评估非空');
  assert(result.residual !== null, '残差非空');
  assert(result.residual.rmse < 1, 'RMSE < 1');
})();

section('computeTransformSummary: 摘要文本');

(function () {
  var src = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  var result = C.computeBestTransform(src, src);
  var summary = C.computeTransformSummary(result);
  assert(typeof summary === 'string', '摘要为字符串');
  assert(summary.indexOf('单应性变换') !== -1 || summary.indexOf('仿射变换') !== -1, '摘要包含变换类型');
})();

console.log('\n' + '═'.repeat(50));
console.log(`  通过: ${passed}  失败: ${failed}  总计: ${passed + failed}`);
console.log('═'.repeat(50));

if (failures.length > 0) {
  console.log('\n失败列表:');
  failures.forEach(function (f, i) { console.log(`  ${i + 1}. ${f}`); });
}

process.exit(failed > 0 ? 1 : 0);
