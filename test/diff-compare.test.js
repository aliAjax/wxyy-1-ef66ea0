#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

global.window = global;
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'diff-compare.js'), 'utf8');
eval(src);

const DC = global.DiffCompare;

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
  const ok = actual === expected;
  if (!ok) {
    failed++;
    failures.push(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    console.error(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    passed++;
  }
}

function assertApprox(actual, expected, eps, message) {
  const ok = Math.abs(actual - expected) < eps;
  if (!ok) {
    failed++;
    failures.push(`${message} — expected ~${expected}, got ${actual}`);
    console.error(`  ✗ ${message} — expected ~${expected}, got ${actual}`);
  } else {
    passed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ──────────────────────────────────────────
section('getMarkerCenter: 点标记 vs 区域标注');

(function () {
  const point = { x: 10, y: 20, mode: 'point' };
  const c1 = DC.getMarkerCenter(point);
  assertEqual(c1.x, 10, 'point marker center x = marker.x');
  assertEqual(c1.y, 20, 'point marker center y = marker.y');

  const region = { x: 10, y: 20, width: 6, height: 8, mode: 'region' };
  const c2 = DC.getMarkerCenter(region);
  assertEqual(c2.x, 13, 'region center x = x + width/2');
  assertEqual(c2.y, 24, 'region center y = y + height/2');

  const regionNoSize = { x: 10, y: 20, mode: 'region' };
  const c3 = DC.getMarkerCenter(regionNoSize);
  assertEqual(c3.x, 10, 'region without width/height falls back to x,y');
  assertEqual(c3.y, 20, 'region without width/height falls back to x,y');
})();

// ──────────────────────────────────────────
section('calculateDistance');

(function () {
  const m1 = { x: 0, y: 0, mode: 'point' };
  const m2 = { x: 3, y: 4, mode: 'point' };
  assertApprox(DC.calculateDistance(m1, m2), 5, 0.001, 'distance (0,0)→(3,4) = 5');

  const r1 = { x: 0, y: 0, width: 2, height: 2, mode: 'region' };
  const r2 = { x: 5, y: 5, width: 2, height: 2, mode: 'region' };
  assertApprox(DC.calculateDistance(r1, r2), Math.sqrt(50), 0.001, 'region distance centers (1,1)→(6,6) = √50');

  const same = { x: 10, y: 10, mode: 'point' };
  assertApprox(DC.calculateDistance(same, same), 0, 0.001, 'same point distance = 0');
})();

// ──────────────────────────────────────────
section('compareMarkers: 阈值边界');

(function () {
  const a = [{ x: 0, y: 0, type: 't1', mode: 'point', note: '' }];

  const bJustInside = [{ x: 2.99, y: 0, type: 't1', mode: 'point', note: '' }];
  const r1 = DC.compareMarkers(a, bJustInside, { threshold: 3.0 });
  assertEqual(r1.length, 1, 'just inside threshold → matched');
  assertEqual(r1[0].type, 'match', 'just inside threshold → type=match');

  const bExactly3 = [{ x: 3.0, y: 0, type: 't1', mode: 'point', note: '' }];
  const r2 = DC.compareMarkers(a, bExactly3, { threshold: 3.0 });
  assertEqual(r2[0].type, 'only_a', 'exactly at threshold (>=) → not matched, only_a');
  assertEqual(r2[1].type, 'only_b', 'exactly at threshold → only_b');

  const bFar = [{ x: 10, y: 10, type: 't1', mode: 'point', note: '' }];
  const r3 = DC.compareMarkers(a, bFar, { threshold: 3.0 });
  assertEqual(r3[0].type, 'only_a', 'far away → only_a');
  assertEqual(r3[1].type, 'only_b', 'far away → only_b');

  const r4 = DC.compareMarkers(a, bFar, { threshold: 15.0 });
  assertEqual(r4[0].type, 'match', 'large threshold → matched');
})();

// ──────────────────────────────────────────
section('compareMarkers: 类型不一致');

(function () {
  const a = [{ x: 10, y: 10, type: '虫蛀点', mode: 'point', note: 'same' }];
  const b = [{ x: 10, y: 10, type: '霉斑', mode: 'point', note: 'same' }];
  const r = DC.compareMarkers(a, b);
  assertEqual(r.length, 1, 'type mismatch count');
  assertEqual(r[0].type, 'type_mismatch', 'type mismatch detected');
  assertEqual(r[0].mismatches.length, 1, 'one mismatch field');
  assertEqual(r[0].mismatches[0].field, 'type', 'mismatch field is type');
  assertEqual(r[0].mismatches[0].valueA, '虫蛀点', 'mismatch valueA');
  assertEqual(r[0].mismatches[0].valueB, '霉斑', 'mismatch valueB');
})();

// ──────────────────────────────────────────
section('compareMarkers: 备注不一致');

(function () {
  const a = [{ x: 10, y: 10, type: '虫蛀点', mode: 'point', note: '备注A' }];
  const b = [{ x: 10, y: 10, type: '虫蛀点', mode: 'point', note: '备注B' }];
  const r = DC.compareMarkers(a, b);
  assertEqual(r[0].type, 'note_mismatch', 'note mismatch detected');
  assertEqual(r[0].mismatches[0].field, 'note', 'mismatch field is note');
  assertEqual(r[0].mismatches[0].valueA, '备注A', 'note valueA');
  assertEqual(r[0].mismatches[0].valueB, '备注B', 'note valueB');

  const aEmpty = [{ x: 10, y: 10, type: 't1', mode: 'point', note: '' }];
  const bHasNote = [{ x: 10, y: 10, type: 't1', mode: 'point', note: '有备注' }];
  const r2 = DC.compareMarkers(aEmpty, bHasNote);
  assertEqual(r2[0].type, 'note_mismatch', 'empty vs non-empty note → note_mismatch');

  const sameNote = [{ x: 10, y: 10, type: 't1', mode: 'point', note: '  相同  ' }];
  const sameNoteB = [{ x: 10, y: 10, type: 't1', mode: 'point', note: '相同' }];
  const r3 = DC.compareMarkers(sameNote, sameNoteB);
  assertEqual(r3[0].type, 'match', 'note trimming: "  相同  " vs "相同" → match');
})();

// ──────────────────────────────────────────
section('compareMarkers: 类型+备注同时不一致，类型优先');

(function () {
  const a = [{ x: 10, y: 10, type: '虫蛀点', mode: 'point', note: '备注A' }];
  const b = [{ x: 10, y: 10, type: '霉斑', mode: 'point', note: '备注B' }];
  const r = DC.compareMarkers(a, b);
  assertEqual(r[0].type, 'type_mismatch', 'type+note mismatch → type_mismatch (type priority)');
  assertEqual(r[0].mismatches.length, 2, 'both type and note recorded as mismatches');
})();

// ──────────────────────────────────────────
section('compareMarkers: 仅A存在');

(function () {
  const a = [{ x: 99, y: 99, type: 't1', mode: 'point', note: '' }];
  const b = [];
  const r = DC.compareMarkers(a, b);
  assertEqual(r.length, 1, 'only A count');
  assertEqual(r[0].type, 'only_a', 'only_a detected');
  assertEqual(r[0].markerA !== null, true, 'markerA present');
  assertEqual(r[0].markerB, null, 'markerB is null');
})();

// ──────────────────────────────────────────
section('compareMarkers: 仅B存在');

(function () {
  const a = [];
  const b = [{ x: 50, y: 50, type: 't1', mode: 'point', note: '' }];
  const r = DC.compareMarkers(a, b);
  assertEqual(r.length, 1, 'only B count');
  assertEqual(r[0].type, 'only_b', 'only_b detected');
  assertEqual(r[0].markerA, null, 'markerA is null');
  assertEqual(r[0].markerB !== null, true, 'markerB present');
})();

// ──────────────────────────────────────────
section('compareMarkers: 贪心最近匹配不交叉');

(function () {
  const a = [
    { x: 0, y: 0, type: 't1', mode: 'point', note: '' },
    { x: 10, y: 10, type: 't1', mode: 'point', note: '' },
  ];
  const b = [
    { x: 0.5, y: 0, type: 't1', mode: 'point', note: '' },
    { x: 10.5, y: 10, type: 't1', mode: 'point', note: '' },
  ];
  const r = DC.compareMarkers(a, b, { threshold: 3 });
  assertEqual(r.length, 2, 'greedy matching count');
  assertEqual(r[0].type, 'match', 'first pair matched');
  assertEqual(r[1].type, 'match', 'second pair matched');
})();

// ──────────────────────────────────────────
section('compareMarkers: compareType/compareNote 开关');

(function () {
  const a = [{ x: 10, y: 10, type: '虫蛀点', mode: 'point', note: 'A' }];
  const b = [{ x: 10, y: 10, type: '霉斑', mode: 'point', note: 'B' }];

  const r1 = DC.compareMarkers(a, b, { compareType: false, compareNote: false });
  assertEqual(r1[0].type, 'match', 'both checks off → match');

  const r2 = DC.compareMarkers(a, b, { compareType: true, compareNote: false });
  assertEqual(r2[0].type, 'type_mismatch', 'only type check → type_mismatch');
  assertEqual(r2[0].mismatches.length, 1, 'only one mismatch field');

  const r3 = DC.compareMarkers(a, b, { compareType: false, compareNote: true });
  assertEqual(r3[0].type, 'note_mismatch', 'only note check → note_mismatch');
})();

// ──────────────────────────────────────────
section('getStatistics');

(function () {
  const a = [
    { x: 0, y: 0, type: 't1', mode: 'point', note: '' },
    { x: 10, y: 10, type: 't1', mode: 'point', note: 'A' },
    { x: 20, y: 20, type: 't1', mode: 'point', note: '' },
  ];
  const b = [
    { x: 0, y: 0, type: 't1', mode: 'point', note: '' },
    { x: 10, y: 10, type: 't2', mode: 'point', note: 'B' },
    { x: 99, y: 99, type: 't1', mode: 'point', note: '' },
  ];
  const r = DC.compareMarkers(a, b, { threshold: 3 });
  const s = DC.getStatistics(r);
  assertEqual(s.total, 4, 'statistics total = 3 A + 1 only B');
  assertEqual(s.aTotal, 3, 'aTotal = 3');
  assertEqual(s.bTotal, 3, 'bTotal = markers with markerB');
  assert(s.match >= 0, 'match count valid');
  assert(s.consistency >= 0 && s.consistency <= 100, 'consistency in [0,100]');
})();

// ──────────────────────────────────────────
section('groupByType');

(function () {
  const a = [
    { x: 0, y: 0, type: 't1', mode: 'point', note: '' },
    { x: 10, y: 10, type: 't1', mode: 'point', note: 'A' },
  ];
  const b = [
    { x: 0, y: 0, type: 't1', mode: 'point', note: '' },
    { x: 10, y: 10, type: 't1', mode: 'point', note: 'B' },
  ];
  const r = DC.compareMarkers(a, b, { threshold: 3 });
  const g = DC.groupByType(r);
  assert(Array.isArray(g.match), 'group.match is array');
  assert(Array.isArray(g.only_a), 'group.only_a is array');
  assert(Array.isArray(g.only_b), 'group.only_b is array');
  assert(Array.isArray(g.type_mismatch), 'group.type_mismatch is array');
  assert(Array.isArray(g.note_mismatch), 'group.note_mismatch is array');
  const total = g.match.length + g.only_a.length + g.only_b.length
    + g.type_mismatch.length + g.note_mismatch.length;
  assertEqual(total, r.length, 'grouped total = result total');
})();

// ──────────────────────────────────────────
section('mergeMarkers: combine 策略 (prefer a)');

(function () {
  const results = [
    { type: 'match', markerA: { x: 0, y: 0, type: 't1', note: 'ok', mode: 'point', _note: 'ok' }, markerB: { x: 0, y: 0, type: 't1', note: 'ok', mode: 'point', _note: 'ok' }, distance: 0, mismatches: [] },
    { type: 'only_a', markerA: { x: 50, y: 50, type: 't1', note: 'onlyA', mode: 'point', _note: 'onlyA' }, markerB: null, distance: null, mismatches: [] },
    { type: 'only_b', markerA: null, markerB: { x: 60, y: 60, type: 't2', note: 'onlyB', mode: 'point', _note: 'onlyB' }, distance: null, mismatches: [] },
    { type: 'note_mismatch', markerA: { x: 10, y: 10, type: 't1', note: 'A_note', mode: 'point', _note: 'A_note' }, markerB: { x: 10, y: 10, type: 't1', note: 'B_note', mode: 'point', _note: 'B_note' }, distance: 0, mismatches: [{ field: 'note' }] },
    { type: 'type_mismatch', markerA: { x: 20, y: 20, type: 't1', note: 'same', mode: 'point', _note: 'same' }, markerB: { x: 20, y: 20, type: 't2', note: 'same', mode: 'point', _note: 'same' }, distance: 0, mismatches: [{ field: 'type' }] },
  ];
  const merged = DC.mergeMarkers(results, { prefer: 'a', mergeStrategy: 'combine' });
  assertEqual(merged.length, 5, 'combine: merged count = results count');

  const matchItem = merged.find(m => m._mergeSource === 'match');
  assertEqual(matchItem.note, 'ok', 'combine match: takes prefer a note');

  const onlyAItem = merged.find(m => m._mergeSource === 'only_a');
  assertEqual(onlyAItem.note, 'onlyA', 'combine only_a: preserves A note');

  const onlyBItem = merged.find(m => m._mergeSource === 'only_b');
  assertEqual(onlyBItem.note, 'onlyB', 'combine only_b: preserves B note');

  const noteMerged = merged.find(m => m._mergeSource === 'merged');
  assertEqual(noteMerged.note, 'A_note | B_note', 'combine note_mismatch: concat notes');
  assertEqual(noteMerged._mergedNote, true, 'combine note_mismatch: _mergedNote flag');

  const typeMerged = merged.find(m => m._mergeSource === 'merged' && m._mergeIndex === 4);
  assert(typeMerged !== undefined, 'combine type_mismatch: also merged');
})();

// ──────────────────────────────────────────
section('mergeMarkers: prefer b + combine');

(function () {
  const results = [
    { type: 'note_mismatch', markerA: { x: 10, y: 10, type: 't1', note: 'A_note', mode: 'point', _note: 'A_note' }, markerB: { x: 10, y: 10, type: 't1', note: 'B_note', mode: 'point', _note: 'B_note' }, distance: 0, mismatches: [{ field: 'note' }] },
  ];
  const merged = DC.mergeMarkers(results, { prefer: 'b', mergeStrategy: 'combine' });
  assertEqual(merged[0].note, 'B_note | A_note', 'combine prefer b: B note first');
})();

// ──────────────────────────────────────────
section('mergeMarkers: strategy a');

(function () {
  const results = [
    { type: 'note_mismatch', markerA: { x: 10, y: 10, type: 't1', note: 'A', mode: 'point' }, markerB: { x: 10, y: 10, type: 't1', note: 'B', mode: 'point' }, distance: 0, mismatches: [{ field: 'note' }] },
    { type: 'type_mismatch', markerA: { x: 20, y: 20, type: 't1', note: '', mode: 'point' }, markerB: { x: 20, y: 20, type: 't2', note: '', mode: 'point' }, distance: 0, mismatches: [{ field: 'type' }] },
  ];
  const merged = DC.mergeMarkers(results, { mergeStrategy: 'a' });
  assertEqual(merged[0]._mergeSource, 'from_a', 'strategy a: from_a source');
  assertEqual(merged[0].note, 'A', 'strategy a: takes A note');
  assertEqual(merged[1]._mergeSource, 'from_a', 'strategy a: type mismatch also from_a');
})();

// ──────────────────────────────────────────
section('mergeMarkers: strategy b');

(function () {
  const results = [
    { type: 'type_mismatch', markerA: { x: 10, y: 10, type: 't1', note: 'A', mode: 'point' }, markerB: { x: 10, y: 10, type: 't2', note: 'B', mode: 'point' }, distance: 0, mismatches: [{ field: 'type' }] },
  ];
  const merged = DC.mergeMarkers(results, { mergeStrategy: 'b' });
  assertEqual(merged[0]._mergeSource, 'from_b', 'strategy b: from_b source');
  assertEqual(merged[0].note, 'B', 'strategy b: takes B note');
})();

// ──────────────────────────────────────────
section('mergeMarkers: conflict 策略');

(function () {
  const results = [
    { type: 'type_mismatch', markerA: { x: 10, y: 10, type: 't1', note: 'A', mode: 'point' }, markerB: { x: 10, y: 10, type: 't2', note: 'B', mode: 'point' }, distance: 0, mismatches: [{ field: 'type' }] },
  ];
  const merged = DC.mergeMarkers(results, { mergeStrategy: 'conflict' });
  assertEqual(merged[0]._mergeSource, 'conflict', 'conflict strategy: source = conflict');
  assertEqual(merged[0]._conflict, true, 'conflict strategy: _conflict flag');
  assert(merged[0]._conflictData !== undefined, 'conflict strategy: _conflictData present');
})();

// ──────────────────────────────────────────
section('mergeMarkers: 清理内部属性');

(function () {
  const results = [
    { type: 'match', markerA: { x: 0, y: 0, type: 't1', note: 'ok', mode: 'point' }, markerB: { x: 0, y: 0, type: 't1', note: 'ok', mode: 'point' }, distance: 0, mismatches: [] },
  ];
  const merged = DC.mergeMarkers(results);
  assertEqual(merged[0]._center, undefined, 'internal _center removed');
  assertEqual(merged[0]._type, undefined, 'internal _type removed');
  assertEqual(merged[0]._note, undefined, 'internal _note removed');
})();

// ──────────────────────────────────────────
section('使用 test-annotator-a/b.json 样例数据');

(function () {
  const dataA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test-annotator-a.json'), 'utf8'));
  const dataB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test-annotator-b.json'), 'utf8'));

  const markersA = DC.extractPageMarkers(dataA, 0);
  const markersB = DC.extractPageMarkers(dataB, 0);
  assertEqual(markersA.length, 7, 'annotator A has 7 markers');
  assertEqual(markersB.length, 7, 'annotator B has 7 markers');

  const results = DC.compareMarkers(markersA, markersB, { threshold: 3.0 });
  assertEqual(results.length, 8, 'total results: 7 A + 1 only_B (marker-b-005 unmatched)');

  const groups = DC.groupByType(results);
  assert(groups.match.length >= 3, `match count >= 3 (got ${groups.match.length})`);
  assert(groups.only_a.length >= 1, `only_a count >= 1 (got ${groups.only_a.length})`);
  assert(groups.only_b.length >= 1, `only_b count >= 1 (got ${groups.only_b.length})`);
  assert(groups.type_mismatch.length >= 1, `type_mismatch count >= 1 (got ${groups.type_mismatch.length})`);
  assert(groups.note_mismatch.length >= 1, `note_mismatch count >= 1 (got ${groups.note_mismatch.length})`);

  const stats = DC.getStatistics(results);
  assert(stats.consistency >= 0 && stats.consistency <= 100, `consistency ${stats.consistency}% in [0,100]`);
  assertEqual(stats.aTotal, 7, 'stats aTotal = 7');
  assert(stats.bTotal > 0, 'stats bTotal > 0');

  const merged = DC.mergeMarkers(results, { prefer: 'a', mergeStrategy: 'combine' });
  assertEqual(merged.length, results.length, 'merged count = results count');

  const noteMergedItems = merged.filter(m => m._mergedNote);
  assert(noteMergedItems.length > 0, 'note-mismatch items merged with concatenated notes');

  const typeMismatchResult = results.find(r => r.type === 'type_mismatch');
  assert(typeMismatchResult !== undefined, 'found type_mismatch in sample data (marker-a-006 vs marker-b-006)');
  assertEqual(typeMismatchResult.mismatches[0].valueA, '虫蛀点', 'type mismatch valueA = 虫蛀点');
  assertEqual(typeMismatchResult.mismatches[0].valueB, '霉斑', 'type mismatch valueB = 霉斑');

  const noteMismatchResult = results.find(r => r.type === 'note_mismatch');
  assert(noteMismatchResult !== undefined, 'found note_mismatch in sample data (marker-a-007 vs marker-b-007)');
  assert(noteMismatchResult.mismatches[0].valueA === '备注A版本', 'note mismatch valueA');
  assert(noteMismatchResult.mismatches[0].valueB === '备注B版本，有不同描述', 'note mismatch valueB');
})();

// ──────────────────────────────────────────
section('区域标注中心点匹配');

(function () {
  const a = [
    { x: 20, y: 55, width: 8, height: 12, type: '破洞', mode: 'region', note: '' },
  ];
  const b = [
    { x: 20, y: 55, width: 8, height: 12, type: '破洞', mode: 'region', note: '' },
  ];
  const r = DC.compareMarkers(a, b, { threshold: 3 });
  assertEqual(r[0].type, 'match', 'identical regions → match');

  const bShifted = [
    { x: 21, y: 56, width: 8, height: 12, type: '破洞', mode: 'region', note: '' },
  ];
  const r2 = DC.compareMarkers(a, bShifted, { threshold: 3 });
  assertEqual(r2[0].type, 'match', 'shifted regions still within threshold');

  const bFarShifted = [
    { x: 25, y: 60, width: 8, height: 12, type: '破洞', mode: 'region', note: '' },
  ];
  const r3 = DC.compareMarkers(a, bFarShifted, { threshold: 3 });
  assertEqual(r3[0].type, 'only_a', 'far shifted region → only_a');
})();

// ──────────────────────────────────────────
section('点标记 vs 区域标注混合匹配');

(function () {
  const a = [
    { x: 24, y: 61, type: 't1', mode: 'point', note: '' },
  ];
  const b = [
    { x: 20, y: 55, width: 8, height: 12, type: 't1', mode: 'region', note: '' },
  ];
  const r = DC.compareMarkers(a, b, { threshold: 3 });
  assertEqual(r[0].type, 'match', 'point (24,61) matches region center (24,61)');

  const aFarPoint = [
    { x: 50, y: 50, type: 't1', mode: 'point', note: '' },
  ];
  const r2 = DC.compareMarkers(aFarPoint, b, { threshold: 3 });
  assertEqual(r2[0].type, 'only_a', 'far point vs region → only_a');
})();

// ──────────────────────────────────────────
section('空数组边界');

(function () {
  const r1 = DC.compareMarkers([], []);
  assertEqual(r1.length, 0, 'empty vs empty → 0 results');

  const s = DC.getStatistics([]);
  assertEqual(s.total, 0, 'empty statistics total = 0');
  assertEqual(s.consistency, 0, 'empty statistics consistency = 0');

  const g = DC.groupByType([]);
  assertEqual(g.match.length, 0, 'empty group match = 0');

  const m = DC.mergeMarkers([]);
  assertEqual(m.length, 0, 'empty merge = 0');
})();

// ──────────────────────────────────────────
section('validatePackage');

(function () {
  assertEqual(DC.validatePackage(null).valid, false, 'null → invalid');
  assertEqual(DC.validatePackage({}).valid, false, 'no pages → invalid');
  assertEqual(DC.validatePackage({ pages: [] }).valid, false, 'empty pages → invalid');
  assertEqual(DC.validatePackage({ pages: [{}] }).valid, true, 'valid package');
})();

// ──────────────────────────────────────────
console.log('\n' + '═'.repeat(50));
console.log(`  通过: ${passed}  失败: ${failed}  总计: ${passed + failed}`);
console.log('═'.repeat(50));

if (failures.length > 0) {
  console.log('\n失败列表:');
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}

process.exit(failed > 0 ? 1 : 0);
