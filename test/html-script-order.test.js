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

function section(title) {
  console.log(`\n── ${title} ──`);
}

const HTML_SCRIPT_MAP = {
  'index.html': [
    './js/storage.js',
    './js/task-queue.js',
    './js/history-manager.js',
    './js/state.js',
    './js/project-package.js',
    './js/candidate-detector.js',
    './js/candidate-manager.js',
    './js/calibration.js',
    './js/calibration-ui.js',
    './js/quality-report.js',
    './js/render.js',
    './js/image-viewer.js',
    './app.js',
  ],
  'review.html': [
    './js/storage.js',
    './js/review-state.js',
    './js/review-render.js',
    './review-app.js',
  ],
  'diff.html': [
    './js/storage.js',
    './js/project-package.js',
    './js/diff-compare.js',
    './js/diff-app.js',
  ],
  'calibration.html': [
    './js/storage.js',
    './js/state.js',
    './js/project-package.js',
    './js/calibration.js',
    './js/calibration-ui.js',
    './js/calibration-app.js',
  ],
};

function extractScriptSrcs(htmlContent) {
  const re = /<script\s+src=["']([^"']+)["']/g;
  const srcs = [];
  let m;
  while ((m = re.exec(htmlContent)) !== null) {
    srcs.push(m[1]);
  }
  return srcs;
}

section('HTML 文件存在性');

Object.keys(HTML_SCRIPT_MAP).forEach(function (htmlFile) {
  const fullPath = path.join(ROOT, htmlFile);
  assert(fs.existsSync(fullPath), `${htmlFile} 文件存在`);
});

section('script src 文件物理存在性');

Object.keys(HTML_SCRIPT_MAP).forEach(function (htmlFile) {
  const fullPath = path.join(ROOT, htmlFile);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');
  const srcs = extractScriptSrcs(content);

  srcs.forEach(function (src) {
    const resolved = path.resolve(path.dirname(fullPath), src);
    assert(fs.existsSync(resolved), `${htmlFile} → ${src} 文件存在`);
  });
});

section('script 加载顺序与预期一致');

Object.keys(HTML_SCRIPT_MAP).forEach(function (htmlFile) {
  const fullPath = path.join(ROOT, htmlFile);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');
  const actualSrcs = extractScriptSrcs(content);
  const expectedSrcs = HTML_SCRIPT_MAP[htmlFile];

  assert(
    actualSrcs.length === expectedSrcs.length,
    `${htmlFile}: script 数量一致 (实际=${actualSrcs.length}, 期望=${expectedSrcs.length})`
  );

  expectedSrcs.forEach(function (expected, i) {
    if (i < actualSrcs.length) {
      assert(
        actualSrcs[i] === expected,
        `${htmlFile}[${i}]: 实际="${actualSrcs[i]}", 期望="${expected}"`
      );
    }
  });
});

section('CSS 引用完整性');

['index.html', 'review.html', 'diff.html', 'calibration.html'].forEach(function (htmlFile) {
  const fullPath = path.join(ROOT, htmlFile);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');
  const cssMatch = content.match(/<link[^>]+href=["']([^"']+\.css)["']/);
  if (cssMatch) {
    const cssPath = path.resolve(path.dirname(fullPath), cssMatch[1]);
    assert(fs.existsSync(cssPath), `${htmlFile} → ${cssMatch[1]} CSS 文件存在`);
  } else {
    assert(false, `${htmlFile}: 未找到 CSS link 标签`);
  }
});

section('JS 模块全局导出验证（静态扫描）');

var JS_GLOBAL_EXPORTS = {
  'js/storage.js': ['VolumeStorage'],
  'js/state.js': ['VolumeState'],
  'js/project-package.js': ['ProjectPackage'],
  'js/calibration.js': ['Calibration'],
  'js/diff-compare.js': ['DiffCompare'],
  'js/task-queue.js': ['TaskQueue'],
  'js/history-manager.js': ['HistoryManager'],
  'js/candidate-detector.js': ['CandidateDetector'],
  'js/candidate-manager.js': ['CandidateManager'],
  'js/calibration-ui.js': ['CalibrationUI'],
  'js/quality-report.js': ['QualityReport'],
  'js/render.js': null,
  'js/image-viewer.js': null,
  'js/review-state.js': ['ReviewState'],
  'js/review-render.js': null,
  'js/diff-app.js': null,
  'js/calibration-app.js': null,
};

Object.keys(JS_GLOBAL_EXPORTS).forEach(function (jsFile) {
  const fullPath = path.join(ROOT, jsFile);
  if (!fs.existsSync(fullPath)) {
    assert(false, `${jsFile} 文件不存在`);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const expectedGlobals = JS_GLOBAL_EXPORTS[jsFile];
  if (expectedGlobals) {
    expectedGlobals.forEach(function (g) {
      assert(
        content.includes(`global.${g}`) || content.includes(`global["${g}"]`),
        `${jsFile}: 导出 global.${g}`
      );
    });
  }
  assert(
    content.indexOf('(function') === 0 || content.indexOf('(function') === 0,
    `${jsFile}: 以 IIFE 开头`
  );
});

console.log('\n' + '═'.repeat(50));
console.log(`  通过: ${passed}  失败: ${failed}  总计: ${passed + failed}`);
console.log('═'.repeat(50));

if (failures.length > 0) {
  console.log('\n失败列表:');
  failures.forEach(function (f, i) { console.log(`  ${i + 1}. ${f}`); });
}

process.exit(failed > 0 ? 1 : 0);
