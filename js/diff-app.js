(function () {
  const { DIFF_TYPES, compareMarkers, getStatistics, mergeMarkers, extractPageMarkers, extractPageImage, extractPageInfo, validatePackage } = window.DiffCompare;

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
    diffStats: null,
    statMatch: null,
    statOnlyA: null,
    statOnlyB: null,
    statType: null,
    statNote: null,
    statConsistency: null,
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
    diffResults: null,
    diffGroups: null,
    statistics: null,
    currentFilter: 'all',
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
    Doms.diffStats = document.getElementById('diffStats');
    Doms.statMatch = document.getElementById('statMatch');
    Doms.statOnlyA = document.getElementById('statOnlyA');
    Doms.statOnlyB = document.getElementById('statOnlyB');
    Doms.statType = document.getElementById('statType');
    Doms.statNote = document.getElementById('statNote');
    Doms.statConsistency = document.getElementById('statConsistency');
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
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        showToast('文件解析失败：JSON 格式无效', 'error');
        return;
      }

      const validation = validatePackage(data);
      if (!validation.valid) {
        showToast('文件格式无效：' + validation.error, 'error');
        return;
      }

      const pageInfo = extractPageInfo(data, state.pageIndex);
      const markerCount = extractPageMarkers(data, state.pageIndex).length;

      if (side === 'A') {
        state.dataA = data;
        state.fileA = file;
        updateFileInfo('A', file, pageInfo, markerCount);
        Doms.dropZoneA.style.display = 'none';
        Doms.dropZoneA.classList.add('has-file');
      } else {
        state.dataB = data;
        state.fileB = file;
        updateFileInfo('B', file, pageInfo, markerCount);
        Doms.dropZoneB.style.display = 'none';
        Doms.dropZoneB.classList.add('has-file');
      }

      updateCompareButton();
      showToast(`${side} 标注文件导入成功，共 ${markerCount} 条标记`, 'success');

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

  function updateFileInfo(side, file, pageInfo, markerCount) {
    const infoEl = side === 'A' ? Doms.fileInfoA : Doms.fileInfoB;
    const displayName = pageInfo ? (pageInfo.name || pageInfo.fileName) : '未知页面';
    infoEl.innerHTML = `
      <div class="file-info-row">
        <span class="file-info-icon">📄</span>
        <div class="file-info-text">
          <div class="file-info-name">${escapeHtmlSimple(file.name)}</div>
          <div class="file-info-meta">${formatFileSize(file.size)} · ${markerCount} 条标记</div>
          <div class="file-info-page">页面：${escapeHtmlSimple(displayName)}</div>
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

    const markersA = extractPageMarkers(state.dataA, state.pageIndex);
    const markersB = extractPageMarkers(state.dataB, state.pageIndex);

    const options = {
      threshold: parseFloat(Doms.thresholdInput.value),
      compareType: Doms.compareType.checked,
      compareNote: Doms.compareNote.checked,
    };

    state.diffResults = compareMarkers(markersA, markersB, options);
    state.diffGroups = window.DiffCompare.groupByType(state.diffResults);
    state.statistics = getStatistics(state.diffResults);

    renderStatistics();
    renderDiffMarkers();
    renderDiffList();

    Doms.diffStats.style.display = 'flex';
    Doms.mergeSettings.style.display = 'block';
    Doms.exportMergedBtn.disabled = false;

    showToast(`比对完成：${state.statistics.match} 匹配，${state.statistics.onlyA + state.statistics.onlyB} 独有，${state.statistics.typeMismatch + state.statistics.noteMismatch} 不一致`, 'info');
  }

  function clearComparison() {
    state.diffResults = null;
    state.diffGroups = null;
    state.statistics = null;

    Doms.diffStats.style.display = 'none';
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

    Doms.statMatch.textContent = state.statistics.match;
    Doms.statOnlyA.textContent = state.statistics.onlyA;
    Doms.statOnlyB.textContent = state.statistics.onlyB;
    Doms.statType.textContent = state.statistics.typeMismatch;
    Doms.statNote.textContent = state.statistics.noteMismatch;
    Doms.statConsistency.textContent = state.statistics.consistency + '%';

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
    if (!state.diffResults) return;

    const options = {
      prefer: Doms.mergePrefer.value,
      mergeStrategy: Doms.mergeStrategy.value === 'combine' ? 'combine' : 'conflict',
    };

    const merged = mergeMarkers(state.diffResults, options);

    const baseData = state.dataA || state.dataB;
    const exportData = {
      format: 'archive-volume-damage-merged',
      formatVersion: '1.0',
      exportedAt: new Date().toISOString(),
      mergedFrom: {
        fileA: state.fileA ? state.fileA.name : 'A',
        fileB: state.fileB ? state.fileB.name : 'B',
        mergeOptions: options,
        statistics: state.statistics,
      },
      volume: baseData.volume || {
        title: '合并标注结果',
      },
      pages: [
        {
          ...(baseData.pages && baseData.pages[state.pageIndex] ? baseData.pages[state.pageIndex] : {}),
          markers: merged.map(({ _mergeSource, _mergeIndex, _mergedNote, _conflict, _conflictData, ...rest }) => rest),
        },
      ],
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

    showToast(`合并结果已导出，共 ${merged.length} 条标记`, 'success');
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
    handleFileSelect: handleFileSelect
  };
})();
