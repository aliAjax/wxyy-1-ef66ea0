#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

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

function section(title) {
  console.log(`\n── ${title} ──`);
}

const SAMPLE_JSON_FILES = [
  'test-sample.json',
  'test-annotator-a.json',
  'test-annotator-b.json',
  'test-annotator-a-multipage.json',
  'test-annotator-b-multipage.json',
  'test-a-3pages.json',
  'test-b-2pages.json',
];

section('样例 JSON 文件合法解析');

const parsedData = {};

SAMPLE_JSON_FILES.forEach(function (fileName) {
  const fullPath = path.join(ROOT, fileName);
  assert(fs.existsSync(fullPath), `${fileName} 文件存在`);
  try {
    const raw = fs.readFileSync(fullPath, 'utf8');
    const data = JSON.parse(raw);
    parsedData[fileName] = data;
    passed++;
  } catch (e) {
    failed++;
    failures.push(`${fileName} JSON 解析失败: ${e.message}`);
    console.error(`  ✗ ${fileName} JSON 解析失败: ${e.message}`);
  }
});

section('旧版卷册格式 (archive-volume-damage) 基本结构');

SAMPLE_JSON_FILES.forEach(function (fileName) {
  const data = parsedData[fileName];
  if (!data) return;

  assertEqual(data.format, 'archive-volume-damage', `${fileName}: format = archive-volume-damage`);
  assert(!!data.formatVersion, `${fileName}: formatVersion 存在`);
  assert(!!data.volume, `${fileName}: volume 字段存在`);
  assert(Array.isArray(data.pages), `${fileName}: pages 是数组`);
  assert(data.pages.length > 0, `${fileName}: pages 非空`);
});

section('页面与标记结构完整性');

SAMPLE_JSON_FILES.forEach(function (fileName) {
  const data = parsedData[fileName];
  if (!data || !data.pages) return;

  data.pages.forEach(function (page, pi) {
    assert(!!page.id, `${fileName} pages[${pi}]: id 存在`);
    assert(Array.isArray(page.markers), `${fileName} pages[${pi}]: markers 是数组`);

    page.markers.forEach(function (marker, mi) {
      assert(typeof marker.x === 'number', `${fileName} pages[${pi}].markers[${mi}]: x 是数字`);
      assert(typeof marker.y === 'number', `${fileName} pages[${pi}].markers[${mi}]: y 是数字`);
      assert(typeof marker.type === 'string' && marker.type.length > 0,
        `${fileName} pages[${pi}].markers[${mi}]: type 非空字符串`);
      assert(marker.mode === 'point' || marker.mode === 'region',
        `${fileName} pages[${pi}].markers[${mi}]: mode 是 point 或 region`);

      if (marker.mode === 'region') {
        assert(typeof marker.width === 'number' && marker.width > 0,
          `${fileName} pages[${pi}].markers[${mi}]: region mode 下 width > 0`);
        assert(typeof marker.height === 'number' && marker.height > 0,
          `${fileName} pages[${pi}].markers[${mi}]: region mode 下 height > 0`);
      }
    });
  });
});

section('标注员 A/B 单页样例标记数回归');

(function () {
  const dataA = parsedData['test-annotator-a.json'];
  const dataB = parsedData['test-annotator-b.json'];
  if (!dataA || !dataB) return;

  assertEqual(dataA.pages[0].markers.length, 7, 'annotator-a 第1页标记数 = 7');
  assertEqual(dataB.pages[0].markers.length, 7, 'annotator-b 第1页标记数 = 7');
})();

section('多页样例页面数回归');

(function () {
  const dataA = parsedData['test-annotator-a-multipage.json'];
  const dataB = parsedData['test-annotator-b-multipage.json'];
  const dataA3 = parsedData['test-a-3pages.json'];
  const dataB2 = parsedData['test-b-2pages.json'];

  if (dataA) assert(dataA.pages.length >= 2, 'annotator-a-multipage 页数 >= 2');
  if (dataB) assert(dataB.pages.length >= 2, 'annotator-b-multipage 页数 >= 2');
  if (dataA3) assertEqual(dataA3.pages.length, 3, 'test-a-3pages 页数 = 3');
  if (dataB2) assertEqual(dataB2.pages.length, 2, 'test-b-2pages 页数 = 2');
})();

section('损伤类型配置回归');

(function () {
  const dataA = parsedData['test-annotator-a.json'];
  if (!dataA || !dataA.damageTypes) return;

  assertEqual(dataA.damageTypes.length, 4, 'annotator-a damageTypes 数量 = 4');
  const typeNames = dataA.damageTypes.map(function (t) { return t.name; });
  assert(typeNames.includes('虫蛀点'), '包含 虫蛀点 类型');
  assert(typeNames.includes('破洞'), '包含 破洞 类型');
  assert(typeNames.includes('霉斑'), '包含 霉斑 类型');
  assert(typeNames.includes('缺角'), '包含 缺角 类型');

  dataA.damageTypes.forEach(function (t, i) {
    assert(!!t.id, `damageTypes[${i}].id 存在`);
    assert(!!t.name, `damageTypes[${i}].name 存在`);
    assert(!!t.color, `damageTypes[${i}].color 存在`);
  });
})();

section('test-sample.json 旧版格式兼容（无 damageTypes）');

(function () {
  const data = parsedData['test-sample.json'];
  if (!data) return;

  assertEqual(data.format, 'archive-volume-damage', 'test-sample 格式 = archive-volume-damage');
  assertEqual(data.pages.length, 2, 'test-sample 页数 = 2');
  assertEqual(data.pages[0].markers.length, 3, 'test-sample 第1页标记数 = 3');
  assertEqual(data.pages[1].markers.length, 2, 'test-sample 第2页标记数 = 2');
})();

console.log('\n' + '═'.repeat(50));
console.log(`  通过: ${passed}  失败: ${failed}  总计: ${passed + failed}`);
console.log('═'.repeat(50));

if (failures.length > 0) {
  console.log('\n失败列表:');
  failures.forEach(function (f, i) { console.log(`  ${i + 1}. ${f}`); });
}

process.exit(failed > 0 ? 1 : 0);
