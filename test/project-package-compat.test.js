#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

global.window = global;
if (typeof global.structuredClone !== 'function') {
  global.structuredClone = function (v) { return JSON.parse(JSON.stringify(v)); };
}
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = function () { return crypto.randomUUID(); };
}

var storageContent = fs.readFileSync(path.join(ROOT, 'js', 'storage.js'), 'utf8');
eval(storageContent);

global.localStorage = {
  _data: {},
  getItem: function (k) { return this._data[k] || null; },
  setItem: function (k, v) { this._data[k] = String(v); },
  removeItem: function (k) { delete this._data[k]; },
  hasOwnProperty: function (k) { return this._data.hasOwnProperty(k); },
};

var ppContent = fs.readFileSync(path.join(ROOT, 'js', 'project-package.js'), 'utf8');
eval(ppContent);

var PP = global.ProjectPackage;

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

function assertThrows(fn, message) {
  try {
    fn();
    failed++;
    failures.push(`${message} — expected to throw`);
    console.error(`  ✗ ${message} — expected to throw`);
  } catch (e) {
    passed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

section('detectFormat: 识别旧版卷册格式');

(function () {
  var legacyVolume = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-sample.json'), 'utf8'));
  var fmt = PP.detectFormat(legacyVolume);
  assert(fmt === 'archive-volume-damage', `test-sample.json 检测为旧版卷册格式, got ${fmt}`);

  var legacyA = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-annotator-a.json'), 'utf8'));
  var fmtA = PP.detectFormat(legacyA);
  assert(fmtA === 'archive-volume-damage', `test-annotator-a.json 检测为旧版卷册格式, got ${fmtA}`);
})();

section('detectFormat: 识别新版项目工作包格式');

(function () {
  var newPkg = {
    format: 'archive-project-package',
    formatVersion: '5.0',
    pages: [{ id: 'p1', markers: [] }],
    damageTypes: [{ id: 't1', name: '虫蛀点', color: '#fff' }],
  };
  var fmt = PP.detectFormat(newPkg);
  assertEqual(fmt, 'archive-project-package', '新版工作包格式正确识别');
})();

section('detectFormat: 边界情况');

(function () {
  assertEqual(PP.detectFormat(null), null, 'null → null');
  assertEqual(PP.detectFormat({}), null, '空对象 → null');
  assertEqual(PP.detectFormat({ format: 'unknown' }), null, '未知格式 → null');

  var singlePage = { markers: [], id: 'p1', pageId: 'p1' };
  var fmt = PP.detectFormat(singlePage);
  assert(fmt === 'archive-page-damage', `旧版单页格式识别, got ${fmt}`);

  var pageArray = [{ id: 'p1', markers: [] }];
  var fmtArr = PP.detectFormat(pageArray);
  assert(fmtArr === 'archive-volume-damage', `数组格式旧版卷册识别, got ${fmtArr}`);
})();

section('compareVersions: 版本比较');

(function () {
  assertEqual(PP.compareVersions('1.0', '1.0'), 0, '1.0 == 1.0');
  assertEqual(PP.compareVersions('2.0', '1.0'), 1, '2.0 > 1.0');
  assertEqual(PP.compareVersions('1.0', '2.0'), -1, '1.0 < 2.0');
  assertEqual(PP.compareVersions('1.10', '1.9'), 1, '1.10 > 1.9');
  assertEqual(PP.compareVersions('2.1', '2.0.1'), 1, '2.1 > 2.0.1');
  assertEqual(PP.compareVersions('5.0', '4.9'), 1, '5.0 > 4.9');
})();

section('validatePackage: 新版工作包验证');

(function () {
  var validPkg = {
    format: 'archive-project-package',
    formatVersion: '5.0',
    pages: [{ id: 'p1', markers: [] }],
    damageTypes: [{ id: 't1', name: '虫蛀点', color: '#fff' }],
  };
  var result = PP.validatePackage(validPkg);
  assertEqual(result, true, '合法工作包验证通过');

  assertThrows(function () {
    PP.validatePackage(null);
  }, 'null 数据验证失败');

  assertThrows(function () {
    PP.validatePackage({ format: 'archive-project-package', formatVersion: '5.0' });
  }, '无 pages 字段验证失败');

  assertThrows(function () {
    PP.validatePackage({ format: 'archive-project-package', formatVersion: '5.0', pages: [] });
  }, '空 pages 验证失败');

  assertThrows(function () {
    PP.validatePackage({ format: 'archive-project-package', formatVersion: '5.0', pages: [{ id: 'p1', markers: [] }] });
  }, '无 damageTypes 验证失败');

  assertThrows(function () {
    PP.validatePackage({ format: 'archive-project-package', formatVersion: '0.1', pages: [{ id: 'p1', markers: [] }], damageTypes: [{ id: 't1', name: '虫蛀点', color: '#fff' }] });
  }, '版本过低验证失败');

  assertThrows(function () {
    PP.validatePackage({ format: 'archive-project-package', formatVersion: '99.0', pages: [{ id: 'p1', markers: [] }], damageTypes: [{ id: 't1', name: '虫蛀点', color: '#fff' }] });
  }, '版本过高验证失败');
})();

section('旧版卷册格式 (v1.x) 迁移兼容');

(function () {
  var legacyData = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-sample.json'), 'utf8'));
  assert(PP.detectFormat(legacyData) === 'archive-volume-damage', 'test-sample 是旧版卷册格式');

  assertEqual(legacyData.formatVersion, '1.1', 'test-sample formatVersion = 1.1');

  assert(legacyData.volume && legacyData.volume.id === 'TEST-001', '旧版卷册包含 volume.id');
  assert(legacyData.volume && legacyData.volume.title === '测试古籍·卷一', '旧版卷册包含 volume.title');
  assert(Array.isArray(legacyData.pages), '旧版卷册包含 pages 数组');
  assertEqual(legacyData.pages.length, 2, '旧版卷册有 2 页');
})();

section('标注员 A/B 样例格式兼容');

(function () {
  var dataA = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-annotator-a.json'), 'utf8'));
  var dataB = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-annotator-b.json'), 'utf8'));

  assertEqual(dataA.format, 'archive-volume-damage', 'annotator-a 是旧版卷册格式');
  assertEqual(dataB.format, 'archive-volume-damage', 'annotator-b 是旧版卷册格式');

  assert(Array.isArray(dataA.damageTypes) && dataA.damageTypes.length === 4, 'annotator-a 包含 4 种损伤类型');
  assert(Array.isArray(dataB.damageTypes) && dataB.damageTypes.length === 4, 'annotator-b 包含 4 种损伤类型');

  assertEqual(dataA.pages[0].markers.length, 7, 'annotator-a 第1页 7 个标记');
  assertEqual(dataB.pages[0].markers.length, 7, 'annotator-b 第1页 7 个标记');

  var typeIds = dataA.damageTypes.map(function (t) { return t.id; });
  assert(typeIds.includes('type-1'), 'damageTypes 包含 type-1');
  assert(typeIds.includes('type-2'), 'damageTypes 包含 type-2');
  assert(typeIds.includes('type-3'), 'damageTypes 包含 type-3');
  assert(typeIds.includes('type-4'), 'damageTypes 包含 type-4');

  dataA.pages[0].markers.forEach(function (m) {
    assert(!!m.typeId, `marker ${m.id} 有 typeId`);
    assert(!!m.type, `marker ${m.id} 有 type`);
  });
})();

section('多页标注员样例格式兼容');

(function () {
  var dataAMulti = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-annotator-a-multipage.json'), 'utf8'));
  var dataBMulti = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-annotator-b-multipage.json'), 'utf8'));

  assert(dataAMulti.pages.length >= 2, 'annotator-a-multipage 页数 >= 2');
  assert(dataBMulti.pages.length >= 2, 'annotator-b-multipage 页数 >= 2');

  dataAMulti.pages.forEach(function (p, i) {
    assert(!!p.id, `annotator-a-multipage pages[${i}] 有 id`);
    assert(Array.isArray(p.markers), `annotator-a-multipage pages[${i}] markers 是数组`);
  });

  dataBMulti.pages.forEach(function (p, i) {
    assert(!!p.id, `annotator-b-multipage pages[${i}] 有 id`);
    assert(Array.isArray(p.markers), `annotator-b-multipage pages[${i}] markers 是数组`);
  });
})();

section('不等页数样例兼容');

(function () {
  var dataA3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-a-3pages.json'), 'utf8'));
  var dataB2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-b-2pages.json'), 'utf8'));

  assertEqual(dataA3.pages.length, 3, 'test-a-3pages 有 3 页');
  assertEqual(dataB2.pages.length, 2, 'test-b-2pages 有 2 页');

  assert(dataA3.volume.id === 'TEST-UNEQUAL-A', 'test-a-3pages volume.id = TEST-UNEQUAL-A');
  assert(dataB2.volume.id === 'TEST-UNEQUAL-B', 'test-b-2pages volume.id = TEST-UNEQUAL-B');
})();

section('VolumeStorage.restoreFromPackage: 旧版数据恢复');

(function () {
  var legacyData = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-annotator-a.json'), 'utf8'));

  try {
    var state = global.VolumeStorage.restoreFromPackage(legacyData);
    assert(!!state, 'restoreFromPackage 返回有效状态');
    assertEqual(state.volumeId, 'TEST-001', '恢复后 volumeId = TEST-001');
    assertEqual(state.volumeTitle, '测试古籍·卷一（标注员A）', '恢复后 volumeTitle');
    assert(Array.isArray(state.pages), '恢复后 pages 是数组');
    assert(state.pages.length > 0, '恢复后 pages 非空');
    assert(Array.isArray(state.damageTypes) && state.damageTypes.length > 0, '恢复后 damageTypes 非空');

    state.pages.forEach(function (p) {
      assert(!!p.id, `恢复后 page ${p.id} 有 id`);
      assert(Array.isArray(p.markers), `恢复后 page ${p.id} markers 是数组`);
      p.markers.forEach(function (m) {
        assert(!!m.typeId, `恢复后 marker ${m.id} 有 typeId`);
        assert(typeof m.x === 'number', `恢复后 marker ${m.id} x 是数字`);
        assert(typeof m.y === 'number', `恢复后 marker ${m.id} y 是数字`);
      });
    });
  } catch (e) {
    assert(false, 'restoreFromPackage 旧版数据恢复: ' + e.message);
  }
})();

section('VolumeStorage.export → 恢复 → 再导出 往返兼容');

(function () {
  var legacyData = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-annotator-a.json'), 'utf8'));

  var state = global.VolumeStorage.restoreFromPackage(legacyData);
  assert(!!state, '第一次恢复成功');

  var exported = global.VolumeStorage.export(state);
  assertEqual(exported.format, 'archive-volume-damage', '导出格式 = archive-volume-damage');
  assert(exported.formatVersion === '2.1' || exported.formatVersion, '导出有 formatVersion');
  assert(Array.isArray(exported.pages), '导出 pages 是数组');
  assertEqual(exported.pages.length, legacyData.pages.length, '导出页数 = 原始页数');

  var totalOriginal = legacyData.pages.reduce(function (a, p) { return a + p.markers.length; }, 0);
  var totalExported = exported.pages.reduce(function (a, p) { return a + p.markers.length; }, 0);
  assertEqual(totalExported, totalOriginal, `导出标记数 = 原始标记数 (${totalOriginal})`);

  assert(Array.isArray(exported.damageTypes) && exported.damageTypes.length > 0, '导出包含 damageTypes');
})();

section('DiffCompare.validatePackage 回归');

(function () {
  global.window = global;
  var dcSrc = fs.readFileSync(path.join(ROOT, 'js', 'diff-compare.js'), 'utf8');
  eval(dcSrc);
  var DC = global.DiffCompare;

  assertEqual(DC.validatePackage(null).valid, false, 'null → invalid');
  assertEqual(DC.validatePackage({}).valid, false, 'no pages → invalid');
  assertEqual(DC.validatePackage({ pages: [] }).valid, false, 'empty pages → invalid');
  assertEqual(DC.validatePackage({ pages: [{}] }).valid, true, 'valid package');

  var legacyData = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-sample.json'), 'utf8'));
  assertEqual(DC.validatePackage(legacyData).valid, true, 'test-sample.json 通过 validatePackage');
})();

console.log('\n' + '═'.repeat(50));
console.log(`  通过: ${passed}  失败: ${failed}  总计: ${passed + failed}`);
console.log('═'.repeat(50));

if (failures.length > 0) {
  console.log('\n失败列表:');
  failures.forEach(function (f, i) { console.log(`  ${i + 1}. ${f}`); });
}

process.exit(failed > 0 ? 1 : 0);
