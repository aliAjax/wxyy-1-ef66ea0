(function () {
  const { DIFF_TYPES, compareMarkers, getStatistics, mergeMarkers, extractPageMarkers, extractPageImage, extractPageInfo, validatePackage, getPageCount, compareAllPages, getVolumeStatistics, mergeAllPages } = window.DiffCompare;

  const Doms = {
    backBtn: null,
    clearDiffBtn: null,
    exportMergedBtn: null,
    dropZoneA: null,
    dropZoneB: null,
    browseBtnA: null,
    browseBtnB: null,
    fileInputA: null,
    fileInputB: null,
    fileInfoA: null,
    fileInfoB: null,
    thresholdSlider: null,
    thresholdInput: null,
    compareType: null,
    compareNote: null,
    compareBtn: null,
    diffPageNav: null,
    pageNavSummary: null,
    pageNavList: null,
    diffStatsSection: null,
    statsScope: null,
    diffStatsPage: null,
    diffStatsVolume: null,
    statMatchPage: null,
    statOnlyAPage: null,
    statOnlyBPage: null,
    statTypePage: null,
    statNotePage: null,
    statConsistencyPage: null,
    statMatchVolume: null,
    statOnlyAVolume: null,
    statOnlyBVolume: null,
    statTypeVolume: null,
    statNoteVolume: null,
    statConsistencyVolume: null,
    showLayerA: null,
    showLayerB: null,
    showMatch: null,
    showDiff: null,
    diffCanvas: null,
    diffEmpty: null,
    diffImage: null,
    diffMarkersLayer: null,
    diffFilterTabs: null,
    diffList: null,
    mergeSettings: null,
    mergePrefer: null,
    mergeStrategy: null,
    toastContainer: null,
  };

  let state = {
    dataA: null,
    dataB: null,
    fileA: null,
    fileB: null,
    pageIndex: 0,
    pageCount: 0,
    allPageResults: null,
    volumeStatistics: null,
    currentPageResult: null,
    diffResults: null,
    diffGroups: null,
    statistics: null,
    currentFilter: 'all',
    statsScope: 'page',
    layerVisibility: {
      a: true,
      b: true,
      match: true,
      diff: true,
    },
  };

  function initDoms() {
    Doms.backBtn = document.getElementById('backBtn');
    Doms.clearDiffBtn = document.getElementById('clearDiffBtn');
    Doms.exportMergedBtn = document.getElementById('exportMergedBtn');
    Doms.dropZoneA = document.getElementById('dropZoneA');
    Doms.dropZoneB = document.getElementById('dropZoneB');
    Doms.browseBtnA = document.getElementById('browseBtnA');
    Doms.browseBtnB = document.getElementById('browseBtnB');
    Doms.fileInputA = document.getElementById('fileInputA');
    Doms.fileInputB = document.getElementById('fileInputB');
    Doms.fileInfoA = document.getElementById('fileInfoA');
    Doms.fileInfoB = document.getElementById('fileInfoB');
    Doms.thresholdSlider = document.getElementById('thresholdSlider');
    Doms.thresholdInput = document.getElementById('thresholdInput');
    Doms.compareType = document.getElementById('compareType');
    Doms.compareNote = document.getElementById('compareNote');
    Doms.compareBtn = document.getElementById('compareBtn');
    Doms.diffPageNav = document.getElementById('diffPageNav');
    Doms.pageNavSummary = document.getElementById('pageNavSummary');
    Doms.pageNavList = document.getElementById('pageNavList');
    Doms.diffStatsSection = document.getElementById('diffStatsSection');
    Doms.statsScope = document.getElementById('statsScope');
    Doms.diffStatsPage = document.getElementById('diffStatsPage');
    Doms.diffStatsVolume = document.getElementById('diffStatsVolume');
    Doms.statMatchPage = document.getElementById('statMatchPage');
    Doms.statOnlyAPage = document.getElementById('statOnlyAPage');
    Doms.statOnlyBPage = document.getElementById('statOnlyBPage');
    Doms.statTypePage = document.getElementById('statTypePage');
    Doms.statNotePage = document.getElementById('statNotePage');
    Doms.statConsistencyPage = document.getElementById('statConsistencyPage');
    Doms.statMatchVolume = document.getElementById('statMatchVolume');
    Doms.statOnlyAVolume = document.getElementById('statOnlyAVolume');
    Doms.statOnlyBVolume = document.getElementById('statOnlyBVolume');
    Doms.statTypeVolume = document.getElementById('statTypeVolume');
    Doms.statNoteVolume = document.getElementById('statNoteVolume');
    Doms.statConsistencyVolume = document.getElementById('statConsistencyVolume');
    Doms.showLayerA = document.getElementById('showLayerA');
    Doms.showLayerB = document.getElementById('showLayerB');
    Doms.showMatch = document.getElementById('showMatch');
    Doms.showDiff = document.getElementById('showDiff');
    Doms.diffCanvas = document.getElementById('diffCanvas');
    Doms.diffEmpty = document.getElementById('diffEmpty');
    Doms.diffImage = document.getElementById('diffImage');
    Doms.diffMarkersLayer = document.getElementById('diffMarkersLayer');
    Doms.diffFilterTabs = document.getElementById('diffFilterTabs');
    Doms.diffList = document.getElementById('diffList');
    Doms.mergeSettings = document.getElementById('mergeSettings');
    Doms.mergePrefer = document.getElementById('mergePrefer');
    Doms.mergeStrategy = document.getElementById('mergeStrategy');
    Doms.toastContainer = document.getElementById('toastContainer');
  }

  function showToast(message, type, duration) {
    if (!Doms.toastContainer) return;
    type = type || 'info';
    duration = duration || 3000;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<span class="toast-icon">' +
      (type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ') +
      '</span><span class="toast-message">' + escapeHtmlSimple(message) + '</span>';
    Doms.toastContainer.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add('toast-visible');
    });
    setTimeout(function () {
      toast.classList.remove('toast-visible');
      toast.classList.add('toast-exit');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, duration);
  }

  function escapeHtmlSimple(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result);
      reader.readAsText(file);
    });
  }

  async function handleFileSelect(file, side) {
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      showToast('请导入 .json 格式的标注文件', 'error');
      return;
    }

    try {
      const text = await readFileAsText(file);
      let rawData;
      try {
        rawData = JSON.parse(text);
      } catch (e) {
        showToast('文件解析失败：JSON 格式无效', 'error');
        return;
      }

      const fmt = window.ProjectPackage ? window.ProjectPackage.detectFormat(rawData) : null;
      if (!fmt) {
        const validation = validatePackage(rawData);
        if (!validation.valid) {
          showToast('文件格式无效：' + validation.error, 'error');
          return;
        }
      }

      let data;
      try {
        if (window.ProjectPackage && fmt) {
          data = window.ProjectPackage.migrateCurrentVersion(rawData);
        } else {
          data = rawData;
        }
      } catch (e) {
        console.warn('格式迁移失败，使用原始数据：', e);
        data = rawData;
      }

      const pageCount = getPageCount(data);
      const totalMarkers = data.pages ? data.pages.reduce((acc, p) => acc + (p.markers ? p.markers.length : 0), 0) : 0;

      if (side === 'A') {
        state.dataA = data;
        state.fileA = file;
        updateFileInfo('A', file, pageCount, totalMarkers);
        Doms.dropZoneA.style.display = 'none';
        Doms.dropZoneA.classList.add('has-file');
      } else {
        state.dataB = data;
        state.fileB = file;
        updateFileInfo('B', file, pageCount, totalMarkers);
        Doms.dropZoneB.style.display = 'none';
        Doms.dropZoneB.classList.add('has-file');
      }

      updatePageCount();
      updateCompareButton();
      showToast(`${side} 标注文件导入成功，共 ${pageCount} 页、${totalMarkers} 条标记`, 'success');

      if (state.dataA && state.dataB) {
        const imageA = extractPageImage(state.dataA, state.pageIndex);
        const imageB = extractPageImage(state.dataB, state.pageIndex);
        if (imageA && !imageB) {
          Doms.diffImage.src = imageA;
          Doms.diffImage.style.display = 'block';
          Doms.diffEmpty.style.display = 'none';
        } else if (imageB) {
          Doms.diffImage.src = imageB;
          Doms.diffImage.style.display = 'block';
          Doms.diffEmpty.style.display = 'none';
        }
      }
    } catch (e) {
      console.error('文件读取失败', e);
      showToast('文件读取失败：' + e.message, 'error');
    }
  }

  function updatePageCount() {
    const countA = state.dataA ? getPageCount(state.dataA) : 0;
    const countB = state.dataB ? getPageCount(state.dataB) : 0;
    state.pageCount = Math.max(countA, countB);
  }

  function updateFileInfo(side, file, pageCount, totalMarkers) {
    const infoEl = side === 'A' ? Doms.fileInfoA : Doms.fileInfoB;
    infoEl.innerHTML = `
      <div class="file-info-row">
        <span class="file-info-icon">📄</span>
        <div class="file-info-text">
          <div class="file-info-name">${escapeHtmlSimple(file.name)}</div>
          <div class="file-info-meta">${formatFileSize(file.size)} · ${pageCount} 页 · ${totalMarkers} 条标记</div>
        </div>
        <button type="button" class="file-remove-btn" data-remove="${side}" title="移除文件">×</button>
      </div>
    `;
    infoEl.style.display = 'block';
  }

  function removeFile(side) {
    if (side === 'A') {
      state.dataA = null;
      state.fileA = null;
      Doms.dropZoneA.style.display = 'block';
      Doms.dropZoneA.classList.remove('has-file', 'drag-over');
      Doms.fileInfoA.style.display = 'none';
      Doms.fileInputA.value = '';
    } else {
      state.dataB = null;
      state.fileB = null;
      Doms.dropZoneB.style.display = 'block';
      Doms.dropZoneB.classList.remove('has-file', 'drag-over');
      Doms.fileInfoB.style.display = 'none';
      Doms.fileInputB.value = '';
    }
    updateCompareButton();
    clearComparison();
  }

  function updateCompareButton() {
    Doms.compareBtn.disabled = !(state.dataA && state.dataB);
  }

  function performComparison() {
    if (!state.dataA || !state.dataB) return;

    const options = {
      threshold: parseFloat(Doms.thresholdInput.value),
      compareType: Doms.compareType.checked,
      compareNote: Doms.compareNote.checked,
    };

    state.allPageResults = compareAllPages(state.dataA, state.dataB, options);
    state.volumeStatistics = getVolumeStatistics(state.allPageResults);
    state.pageIndex = 0;

    loadPageData(0);

    renderPageNav();
    Doms.diffPageNav.style.display = 'block';
    Doms.diffStatsSection.style.display = 'block';
    Doms.mergeSettings.style.display = 'block';
    Doms.exportMergedBtn.disabled = false;

    const vs = state.volumeStatistics;
    showToast(`全卷比对完成：共 ${vs.pageCount} 页，${vs.match} 匹配，${vs.onlyA + vs.onlyB} 独有，${vs.typeMismatch + vs.noteMismatch} 不一致，一致率 ${vs.consistency}%`, 'info');
  }

  function loadPageData(pageIndex) {
    if (!state.allPageResults || pageIndex < 0 || pageIndex >= state.allPageResults.length) return;

    state.pageIndex = pageIndex;
    state.currentPageResult = state.allPageResults[pageIndex];
    state.diffResults = state.currentPageResult.diffResults;
    state.diffGroups = window.DiffCompare.groupByType(state.diffResults);
    state.statistics = state.currentPageResult.statistics;

    const pageResult = state.currentPageResult;
    const imageA = pageResult.imageA;
    const imageB = pageResult.imageB;

    if (imageA || imageB) {
      Doms.diffImage.src = imageB || imageA;
      Doms.diffImage.style.display = 'block';
      Doms.diffEmpty.style.display = 'none';
    } else {
      Doms.diffImage.removeAttribute('src');
      Doms.diffImage.style.display = 'none';
      Doms.diffEmpty.style.display = 'flex';
    }

    renderStatistics();
    renderDiffMarkers();
    renderDiffList();
    updatePageNavActive();
  }

  function switchPage(pageIndex) {
    if (pageIndex < 0 || pageIndex >= state.pageCount) return;
    loadPageData(pageIndex);
  }

  function renderPageNav() {
    if (!state.allPageResults || state.allPageResults.length === 0) {
      Doms.pageNavList.innerHTML = '';
      Doms.pageNavSummary.textContent = '共 0 页';
      return;
    }

    Doms.pageNavSummary.textContent = `共 ${state.allPageResults.length} 页`;

    let html = '';
    state.allPageResults.forEach((pr, idx) => {
      const stats = pr.statistics || {};
      const hasDiff = (stats.onlyA || 0) + (stats.onlyB || 0) + (stats.typeMismatch || 0) + (stats.noteMismatch || 0) > 0;
      const existsClass = !pr.existsA || !pr.existsB ? ' missing' : '';
      const diffClass = hasDiff ? ' has-diff' : ' all-match';

      html += `
        <button type="button" class="page-nav-item${existsClass}${diffClass}${idx === state.pageIndex ? ' active' : ''}"
                data-page-index="${idx}">
          <span class="page-nav-item-num">${idx + 1}</span>
          <span class="page-nav-item-name">${escapeHtmlSimple(pr.pageName)}</span>
          <span class="page-nav-item-stats">
            <span class="stat-match" title="匹配">${stats.match || 0}</span>
            <span class="stat-diff" title="差异">${(stats.onlyA || 0) + (stats.onlyB || 0) + (stats.typeMismatch || 0) + (stats.noteMismatch || 0)}</span>
          </span>
        </button>
      `;
    });

    Doms.pageNavList.innerHTML = html;
  }

  function updatePageNavActive() {
    const items = Doms.pageNavList.querySelectorAll('.page-nav-item');
    items.forEach((item, idx) => {
      item.classList.toggle('active', idx === state.pageIndex);
    });
  }

  function toggleStatsScope(scope) {
    if (scope !== 'page' && scope !== 'volume') return;

    state.statsScope = scope;
    Doms.statsScope.textContent = scope === 'page' ? '当前页统计' : '全卷汇总统计';

    const toggleBtns = Doms.diffStatsSection.querySelectorAll('.stats-toggle-btn');
    toggleBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.scope === scope);
    });

    Doms.diffStatsPage.style.display = scope === 'page' ? 'flex' : 'none';
    Doms.diffStatsVolume.style.display = scope === 'volume' ? 'flex' : 'none';

    if (scope === 'volume' && state.volumeStatistics) {
      renderVolumeStatistics();
    }
  }

  function clearComparison() {
    state.allPageResults = null;
    state.volumeStatistics = null;
    state.currentPageResult = null;
    state.diffResults = null;
    state.diffGroups = null;
    state.statistics = null;
    state.pageIndex = 0;

    Doms.diffPageNav.style.display = 'none';
    Doms.diffStatsSection.style.display = 'none';
    Doms.diffMarkersLayer.innerHTML = '';
    Doms.diffList.innerHTML = '<p style="color:var(--muted);text-align:center;padding:24px 8px;font-size:13px;">请导入两份标注后开始比对</p>';
    Doms.mergeSettings.style.display = 'none';
    Doms.exportMergedBtn.disabled = true;

    if (!state.dataA && !state.dataB) {
      Doms.diffImage.removeAttribute('src');
      Doms.diffImage.style.display = 'none';
      Doms.diffEmpty.style.display = 'flex';
    }
  }

  function renderStatistics() {
    if (!state.statistics) return;

    Doms.statMatchPage.textContent = state.statistics.match;
    Doms.statOnlyAPage.textContent = state.statistics.onlyA;
    Doms.statOnlyBPage.textContent = state.statistics.onlyB;
    Doms.statTypePage.textContent = state.statistics.typeMismatch;
    Doms.statNotePage.textContent = state.statistics.noteMismatch;
    Doms.statConsistencyPage.textContent = state.statistics.consistency + '%';

    const tabs = Doms.diffFilterTabs.querySelectorAll('.filter-tab');
    tabs.forEach((tab) => {
      const filter = tab.dataset.filter;
      let count = 0;
      if (filter === 'all') count = state.statistics.total;
      else if (filter === 'match') count = state.statistics.match;
      else if (filter === 'only_a') count = state.statistics.onlyA;
      else if (filter === 'only_b') count = state.statistics.onlyB;
      else if (filter === 'type_mismatch') count = state.statistics.typeMismatch;
      else if (filter === 'note_mismatch') count = state.statistics.noteMismatch;
      tab.innerHTML = `${tab.textContent.split(' ')[0]} <span class="tab-count">${count}</span>`;
    });
  }

  function renderVolumeStatistics() {
    if (!state.volumeStatistics) return;

    const vs = state.volumeStatistics;
    Doms.statMatchVolume.textContent = vs.match;
    Doms.statOnlyAVolume.textContent = vs.onlyA;
    Doms.statOnlyBVolume.textContent = vs.onlyB;
    Doms.statTypeVolume.textContent = vs.typeMismatch;
    Doms.statNoteVolume.textContent = vs.noteMismatch;
    Doms.statConsistencyVolume.textContent = vs.consistency + '%';
  }

  function renderDiffMarkers() {
    if (!state.diffResults) return;

    const showLayerA = state.layerVisibility.a;
    const showLayerB = state.layerVisibility.b;
    const showMatch = state.layerVisibility.match;
    const showDiff = state.layerVisibility.diff;

    let html = '';

    state.diffResults.forEach((result, index) => {
      const isMatch = result.type === DIFF_TYPES.MATCH;
      const isDiff = result.type !== DIFF_TYPES.MATCH;

      if (isMatch && !showMatch) return;
      if (isDiff && !showDiff) return;

      if (result.markerA && showLayerA) {
        html += renderMarkerElement(result.markerA, 'A', result.type, index);
      }
      if (result.markerB && showLayerB) {
        html += renderMarkerElement(result.markerB, 'B', result.type, index);
      }

      const hasBothMarkers = result.markerA && result.markerB;
      if (hasBothMarkers && ((isMatch && showMatch) || (isDiff && showDiff))) {
        html += renderMatchConnection(result.markerA, result.markerB, index);
      }
    });

    Doms.diffMarkersLayer.innerHTML = html;
  }

  function renderMarkerElement(marker, source, diffType, index) {
    const color = getDiffColor(source, diffType);
    const center = window.DiffCompare.getMarkerCenter(marker);
    const isRegion = marker.mode === 'region';

    let style = '';
    if (isRegion && marker.width && marker.height) {
      style = `left:${marker.x}%;top:${marker.y}%;width:${marker.width}%;height:${marker.height}%;`;
    } else {
      style = `left:${center.x}%;top:${center.y}%;`;
    }

    const sourceLabel = source === 'A' ? 'A' : 'B';
    const typeLabel = marker.type || '未知类型';
    const title = `[${sourceLabel}] ${typeLabel}${marker.note ? '：' + marker.note : ''}`;

    if (isRegion) {
      return `
        <span class="diff-marker diff-region diff-${source} diff-type-${diffType}"
              data-source="${source}"
              data-diff-type="${diffType}"
              data-index="${index}"
              title="${escapeHtmlSimple(title)}"
              style="${style}border-color:${color};background:${color}22;">
          <span class="diff-marker-label" style="background:${color};">${sourceLabel} · ${escapeHtmlSimple(typeLabel)}</span>
        </span>
      `;
    }

    return `
      <span class="diff-marker diff-point diff-${source} diff-type-${diffType}"
            data-source="${source}"
            data-diff-type="${diffType}"
            data-index="${index}"
            title="${escapeHtmlSimple(title)}"
            style="${style}background:${color};border-color:${color};">
        <span class="diff-marker-badge">${sourceLabel}</span>
      </span>
    `;
  }

  function renderMatchConnection(m1, m2, index) {
    const c1 = window.DiffCompare.getMarkerCenter(m1);
    const c2 = window.DiffCompare.getMarkerCenter(m2);

    const left = Math.min(c1.x, c2.x);
    const top = Math.min(c1.y, c2.y);
    const width = Math.abs(c2.x - c1.x);
    const height = Math.abs(c2.y - c1.y);

    if (width < 0.1 && height < 0.1) return '';

    return `
      <svg class="diff-connection" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;"
           data-index="${index}">
        <line x1="${c1.x < c2.x ? 0 : 100}%" y1="${c1.y < c2.y ? 0 : 100}%"
              x2="${c2.x > c1.x ? 100 : 0}%" y2="${c2.y > c1.y ? 100 : 0}%"
              stroke="#4caf50" stroke-width="2" stroke-dasharray="4,4" opacity="0.6"/>
      </svg>
    `;
  }

  function getDiffColor(source, diffType) {
    if (diffType === DIFF_TYPES.MATCH) return '#4caf50';
    if (diffType === DIFF_TYPES.TYPE_MISMATCH) return '#ff9800';
    if (diffType === DIFF_TYPES.NOTE_MISMATCH) return '#2196f3';
    if (source === 'A') return '#f44336';
    if (source === 'B') return '#9c27b0';
    return '#757575';
  }

  function getDiffTypeLabel(type) {
    const labels = {
      [DIFF_TYPES.MATCH]: '匹配',
      [DIFF_TYPES.ONLY_A]: '仅 A 有',
      [DIFF_TYPES.ONLY_B]: '仅 B 有',
      [DIFF_TYPES.TYPE_MISMATCH]: '类型不一致',
      [DIFF_TYPES.NOTE_MISMATCH]: '备注不一致',
    };
    return labels[type] || type;
  }

  function renderDiffList() {
    if (!state.diffResults) return;

    let filtered = state.diffResults;
    if (state.currentFilter !== 'all') {
      filtered = state.diffResults.filter((r) => r.type === state.currentFilter);
    }

    if (filtered.length === 0) {
      Doms.diffList.innerHTML = '<p style="color:var(--muted);text-align:center;padding:24px 8px;font-size:13px;">当前筛选条件下无记录</p>';
      return;
    }

    Doms.diffList.innerHTML = filtered.map((result, idx) => {
      const marker = result.markerA || result.markerB;
      const source = result.markerA && result.markerB ? 'both' : (result.markerA ? 'A' : 'B');
      const color = getDiffColor(source, result.type);
      const center = marker ? window.DiffCompare.getMarkerCenter(marker) : null;

      let mismatchHtml = '';
      if (result.mismatches && result.mismatches.length > 0) {
        mismatchHtml = '<div class="diff-mismatches">';
        result.mismatches.forEach((m) => {
          mismatchHtml += `
            <div class="mismatch-row">
              <span class="mismatch-field">${m.field === 'type' ? '类型' : '备注'}</span>
              <span class="mismatch-value mismatch-a">A: ${escapeHtmlSimple(m.valueA || '(空)')}</span>
              <span class="mismatch-arrow">→</span>
              <span class="mismatch-value mismatch-b">B: ${escapeHtmlSimple(m.valueB || '(空)')}</span>
            </div>
          `;
        });
        mismatchHtml += '</div>';
      }

      const distanceText = result.distance !== null
        ? `<span class="diff-distance">距离 ${result.distance.toFixed(2)}%</span>`
        : '';

      return `
        <article class="diff-item diff-item-${result.type}"
                 data-index="${state.diffResults.indexOf(result)}"
                 data-diff-type="${result.type}">
          <div class="diff-item-header">
            <span class="diff-type-badge" style="background:${color};">${getDiffTypeLabel(result.type)}</span>
            ${distanceText}
          </div>
          <div class="diff-item-body">
            <div class="diff-markers-compare">
              ${result.markerA ? renderMiniMarker(result.markerA, 'A') : ''}
              ${result.markerB ? renderMiniMarker(result.markerB, 'B') : ''}
            </div>
            ${mismatchHtml}
            ${center ? `<div class="diff-coords">坐标：(${center.x.toFixed(2)}, ${center.y.toFixed(2)})</div>` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  function renderMiniMarker(marker, source) {
    const type = marker.type || '未知类型';
    const note = marker.note || '<span style="opacity:.6;">无备注</span>';
    const isRegion = marker.mode === 'region';
    const modeTag = isRegion
      ? '<span class="record-mode mode-region">区域</span>'
      : '<span class="record-mode mode-point">点</span>';

    return `
      <div class="mini-marker mini-marker-${source}">
        <div class="mini-marker-header">
          <span class="mini-source-badge">${source}</span>
          <strong>${escapeHtmlSimple(type)}</strong>
          ${modeTag}
        </div>
        <div class="mini-marker-note">${note}</div>
      </div>
    `;
  }

  function exportMerged() {
    if (!state.allPageResults) return;

    const options = {
      prefer: Doms.mergePrefer.value,
      mergeStrategy: Doms.mergeStrategy.value === 'combine' ? 'combine' : 'conflict',
    };

    const mergedPages = mergeAllPages(state.allPageResults, options);
    const baseData = state.dataA || state.dataB;

    let totalMarkers = 0;
    mergedPages.forEach((mp) => {
      totalMarkers += mp.markers.length;
    });

    if (window.ProjectPackage) {
      try {
        const baseState = window.ProjectPackage.packageToState(baseData);

        if (baseState.pages && Array.isArray(baseState.pages)) {
          mergedPages.forEach((mp) => {
            const pageIdx = mp.pageIndex;
            if (baseState.pages[pageIdx]) {
              baseState.pages[pageIdx].markers = mp.markers.map(({
                _mergeSource, _mergeIndex, _mergedNote, _conflict, _conflictData,
                _center, _type, _note, ...rest
              }) => rest);
              baseState.pages[pageIdx].updatedAt = new Date().toISOString();
            }
          });
        }

        baseState.updatedAt = new Date().toISOString();

        if (baseData.format === window.ProjectPackage.PACKAGE_FORMAT
          && baseData.project
          && baseData.project.title) {
          baseState.volumeTitle = baseData.project.title + '（合并）';
        } else if (baseData.volume && baseData.volume.title) {
          baseState.volumeTitle = baseData.volume.title + '（合并）';
        } else {
          baseState.volumeTitle = (baseState.volumeTitle || '合并结果') + '（合并）';
        }

        const exportOptions = { includeImages: true };
        const pkg = window.ProjectPackage.exportPackage(baseState, exportOptions);
        pkg._mergedFrom = {
          fileA: state.fileA ? state.fileA.name : 'A',
          fileB: state.fileB ? state.fileB.name : 'B',
          mergeOptions: options,
          pageCount: mergedPages.length,
          totalMarkers: totalMarkers,
          volumeStatistics: state.volumeStatistics,
          pageStatistics: state.allPageResults.map(pr => ({
            pageIndex: pr.pageIndex,
            pageName: pr.pageName,
            statistics: pr.statistics,
          })),
          mergedAt: new Date().toISOString(),
        };
        delete pkg._checksum;
        pkg._checksum = window.ProjectPackage.computeChecksum(pkg);

        window.ProjectPackage.downloadPackage(pkg);
        showToast(`合并结果已导出，共 ${mergedPages.length} 页、${totalMarkers} 条标记`, 'success');
        return;
      } catch (e) {
        console.warn('标准导出流程失败，回退至基础导出：', e);
      }
    }

    const exportPages = mergedPages.map((mp) => {
      const basePage = baseData.pages && baseData.pages[mp.pageIndex]
        ? baseData.pages[mp.pageIndex]
        : {};
      return {
        ...basePage,
        markers: mp.markers.map(({
          _mergeSource, _mergeIndex, _mergedNote, _conflict, _conflictData,
          _center, _type, _note, ...rest
        }) => rest),
        updatedAt: new Date().toISOString(),
      };
    });

    const exportData = {
      format: 'archive-volume-damage',
      formatVersion: '1.1',
      exportedAt: new Date().toISOString(),
      _mergedFrom: {
        fileA: state.fileA ? state.fileA.name : 'A',
        fileB: state.fileB ? state.fileB.name : 'B',
        mergeOptions: options,
        pageCount: mergedPages.length,
        totalMarkers: totalMarkers,
        volumeStatistics: state.volumeStatistics,
        pageStatistics: state.allPageResults.map(pr => ({
          pageIndex: pr.pageIndex,
          pageName: pr.pageName,
          statistics: pr.statistics,
        })),
        mergedAt: new Date().toISOString(),
      },
      volume: {
        ...(baseData.volume || {}),
        title: (baseData.volume && baseData.volume.title
          ? baseData.volume.title
          : (baseData.project && baseData.project.title
            ? baseData.project.title
            : '合并标注结果')) + '（合并）',
        updatedAt: new Date().toISOString(),
      },
      pages: exportPages,
      damageTypes: baseData.damageTypes || [],
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `merged_annotations_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1500);

    showToast(`合并结果已导出，共 ${mergedPages.length} 页、${totalMarkers} 条标记`, 'success');
  }

  function setupDropZone(dropZone, fileInput, browseBtn, side) {
    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        handleFileSelect(fileInput.files[0], side);
      }
    });

    dropZone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0], side);
      }
    });
  }

  function bindEvents() {
    Doms.backBtn.addEventListener('click', () => {
      window.location.href = './index.html';
    });

    Doms.clearDiffBtn.addEventListener('click', () => {
      if (!state.dataA && !state.dataB) {
        showToast('当前没有可清空的比对数据', 'warning');
        return;
      }
      if (confirm('确认清空所有比对数据？')) {
        removeFile('A');
        removeFile('B');
        clearComparison();
        showToast('已清空比对数据', 'info');
      }
    });

    Doms.exportMergedBtn.addEventListener('click', exportMerged);

    setupDropZone(Doms.dropZoneA, Doms.fileInputA, Doms.browseBtnA, 'A');
    setupDropZone(Doms.dropZoneB, Doms.fileInputB, Doms.browseBtnB, 'B');

    document.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-remove]');
      if (removeBtn) {
        e.stopPropagation();
        removeFile(removeBtn.dataset.remove);
      }

      const pageNavItem = e.target.closest('.page-nav-item');
      if (pageNavItem) {
        e.stopPropagation();
        const pageIndex = parseInt(pageNavItem.dataset.pageIndex);
        switchPage(pageIndex);
      }

      const statsToggleBtn = e.target.closest('.stats-toggle-btn');
      if (statsToggleBtn) {
        e.stopPropagation();
        const scope = statsToggleBtn.dataset.scope;
        toggleStatsScope(scope);
      }
    });

    Doms.thresholdSlider.addEventListener('input', () => {
      Doms.thresholdInput.value = Doms.thresholdSlider.value;
    });

    Doms.thresholdInput.addEventListener('input', () => {
      let val = parseFloat(Doms.thresholdInput.value);
      if (isNaN(val)) val = 3.0;
      val = Math.max(0.5, Math.min(10, val));
      Doms.thresholdSlider.value = val;
      Doms.thresholdInput.value = val;
    });

    Doms.compareBtn.addEventListener('click', performComparison);

    Doms.showLayerA.addEventListener('change', () => {
      state.layerVisibility.a = Doms.showLayerA.checked;
      renderDiffMarkers();
    });

    Doms.showLayerB.addEventListener('change', () => {
      state.layerVisibility.b = Doms.showLayerB.checked;
      renderDiffMarkers();
    });

    Doms.showMatch.addEventListener('change', () => {
      state.layerVisibility.match = Doms.showMatch.checked;
      renderDiffMarkers();
    });

    Doms.showDiff.addEventListener('change', () => {
      state.layerVisibility.diff = Doms.showDiff.checked;
      renderDiffMarkers();
    });

    Doms.diffFilterTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.filter-tab');
      if (!tab) return;
      const filter = tab.dataset.filter;
      state.currentFilter = filter;

      Doms.diffFilterTabs.querySelectorAll('.filter-tab').forEach((t) => {
        t.classList.toggle('active', t === tab);
      });

      renderDiffList();
    });

    Doms.diffList.addEventListener('click', (e) => {
      const item = e.target.closest('.diff-item');
      if (!item) return;
      const index = parseInt(item.dataset.index);
      highlightMarker(index);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        clearHighlight();
      }

      if (e.target.matches('input, textarea, select')) return;

      if (state.allPageResults && state.allPageResults.length > 0) {
        if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          if (state.pageIndex > 0) {
            switchPage(state.pageIndex - 1);
          }
        } else if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          if (state.pageIndex < state.pageCount - 1) {
            switchPage(state.pageIndex + 1);
          }
        }
      }
    });
  }

  function highlightMarker(index) {
    const markers = Doms.diffMarkersLayer.querySelectorAll(`[data-index="${index}"]`);
    markers.forEach((m) => {
      m.classList.add('highlighted');
    });

    if (markers.length > 0) {
      markers[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setTimeout(clearHighlight, 3000);
  }

  function clearHighlight() {
    const highlighted = Doms.diffMarkersLayer.querySelectorAll('.highlighted');
    highlighted.forEach((m) => {
      m.classList.remove('highlighted');
    });
  }

  function bootstrap() {
    initDoms();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  window.DiffApp = {
    state: state,
    performComparison: performComparison,
    renderDiffMarkers: renderDiffMarkers,
    renderDiffList: renderDiffList,
    exportMerged: exportMerged,
    handleFileSelect: handleFileSelect,
    switchPage: switchPage,
    toggleStatsScope: toggleStatsScope,
  };
})();
