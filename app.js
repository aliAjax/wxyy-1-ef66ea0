(function () {
  const { createPage } = window.VolumeStorage;
  const State = window.VolumeState;
  const Render = window.VolumeRender;
  const Package = window.ProjectPackage;
  const CandidateDetector = window.CandidateDetector;
  const CandidateManager = window.CandidateManager;
  const CalibrationUI = window.CalibrationUI;
  const TaskQueue = window.TaskQueue;

  const imageInput = document.getElementById("imageInput");
  const noteInput = document.getElementById("noteInput");
  const configBtn = document.getElementById("configBtn");
  const reviewBtn = document.getElementById("reviewBtn");
  const diffBtn = document.getElementById("diffBtn");
  const taskQueueBtn = document.getElementById("taskQueueBtn");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFileInput = document.getElementById("importFileInput");
  const clearBtn = document.getElementById("clearBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const modeSwitch = document.getElementById("modeSwitch");

  const candidateSensitivity = document.getElementById("candidateSensitivity");
  const sensitivityValue = document.getElementById("sensitivityValue");
  const detectEdgeDamage = document.getElementById("detectEdgeDamage");
  const maxCandidatesSelect = document.getElementById("maxCandidatesSelect");
  const runDetectBtn = document.getElementById("runDetectBtn");
  const acceptAllBtn = document.getElementById("acceptAllBtn");
  const ignoreAllBtn = document.getElementById("ignoreAllBtn");
  const applyAcceptedBtn = document.getElementById("applyAcceptedBtn");
  const candidateList = document.getElementById("candidateList");
  const candidateFilterTabs = document.getElementById("candidateFilterTabs");
  const confidenceThreshold = document.getElementById("confidenceThreshold");
  const confidenceThresholdValue = document.getElementById("confidenceThresholdValue");
  const acceptByConfidenceBtn = document.getElementById("acceptByConfidenceBtn");

  const calibrationBtn = document.getElementById("calibrationBtn");
  const calibrationModal = document.getElementById("calibrationModal");
  const closeCalibrationBtn = document.getElementById("closeCalibrationBtn");
  const closeCalibrationFooterBtn = document.getElementById("closeCalibrationFooterBtn");
  const calibSourcePage = document.getElementById("calibSourcePage");
  const calibTargetPage = document.getElementById("calibTargetPage");
  const calibGenerateBtn = document.getElementById("calibGenerateBtn");
  const calibResetBtn = document.getElementById("calibResetBtn");
  const calibResult = document.getElementById("calibResult");
  const calibMigrationSection = document.getElementById("calibMigrationSection");
  const migrationList = document.getElementById("migrationList");
  const migrPending = document.getElementById("migrPending");
  const migrAccepted = document.getElementById("migrAccepted");
  const migrRejected = document.getElementById("migrRejected");
  const migrAcceptAllBtn = document.getElementById("migrAcceptAllBtn");
  const migrRejectAllBtn = document.getElementById("migrRejectAllBtn");
  const migrApplyBtn = document.getElementById("migrApplyBtn");

  const importModal = document.getElementById("importModal");
  const importError = document.getElementById("importError");
  const importWarning = document.getElementById("importWarning");
  const importQuotaWarning = document.getElementById("importQuotaWarning");
  const importCurrentDataWarning = document.getElementById("importCurrentDataWarning");
  const importFileInfo = document.getElementById("importFileInfo");
  const importIntegrity = document.getElementById("importIntegrity");
  const importSummary = document.getElementById("importSummary");
  const importTaskQueuePreview = document.getElementById("importTaskQueuePreview");
  const importMigrationDetail = document.getElementById("importMigrationDetail");
  const importRestoreWarnings = document.getElementById("importRestoreWarnings");
  const importLoading = document.getElementById("importLoading");
  const importSuccess = document.getElementById("importSuccess");
  const importSuccessInfo = document.getElementById("importSuccessInfo");
  const importSafetyNote = document.getElementById("importSafetyNote");
  const importDropZone = document.getElementById("importDropZone");
  const importDropZoneBrowse = document.getElementById("importDropZoneBrowse");
  const closeImportBtn = document.getElementById("closeImportBtn");
  const cancelImportBtn = document.getElementById("cancelImportBtn");
  const confirmImportBtn = document.getElementById("confirmImportBtn");

  const exportModal = document.getElementById("exportModal");
  const exportSummary = document.getElementById("exportSummary");
  const exportIncludeImages = document.getElementById("exportIncludeImages");
  const exportImageSizeHint = document.getElementById("exportImageSizeHint");
  const exportOptionNote = document.getElementById("exportOptionNote");
  const exportSizeEstimate = document.getElementById("exportSizeEstimate");
  const closeExportBtn = document.getElementById("closeExportBtn");
  const cancelExportBtn = document.getElementById("cancelExportBtn");
  const confirmExportBtn = document.getElementById("confirmExportBtn");

  let currentMode = "point";
  let dragState = null;
  let pendingImportData = null;
  let candidatesVisible = true;
  let lastPageId = null;

  var toastContainer = document.getElementById("toastContainer");

  function showToast(message, type, duration) {
    if (!toastContainer) return;
    type = type || "info";
    duration = duration || 3000;
    var toast = document.createElement("div");
    toast.className = "toast toast-" + type;
    toast.innerHTML = '<span class="toast-icon">' +
      (type === "success" ? "✓" : type === "error" ? "✕" : type === "warning" ? "⚠" : "ℹ") +
      '</span><span class="toast-message">' + escapeHtmlSimple(message) + '</span>';
    toastContainer.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add("toast-visible");
    });
    setTimeout(function () {
      toast.classList.remove("toast-visible");
      toast.classList.add("toast-exit");
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, duration);
  }

  function getActiveElements() {
    return Render.getActiveStageElements();
  }

  function setMode(mode) {
    if (mode !== "point" && mode !== "region") return;
    currentMode = mode;
    const btns = modeSwitch.querySelectorAll(".mode-btn");
    btns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });

    const { dragOverlay } = getActiveElements();
    if (Render.viewerMode && Render.imageViewer) {
      Render.imageViewer.setRegionDrawingMode(mode === "region");
    } else {
      if (mode === "region") {
        dragOverlay.classList.add("active");
      } else {
        dragOverlay.classList.remove("active");
        cancelDrag();
      }
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length === 0) return;

    const sortBy = (a, b) => {
      const na = (a.name || "").toLowerCase();
      const nb = (b.name || "").toLowerCase();
      return na.localeCompare(nb, "zh-Hans-CN", { numeric: true });
    };
    files.sort(sortBy);

    const newPages = [];
    for (const file of files) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const page = createPage({
          dataUrl,
          fileName: file.name,
        });
        newPages.push(page);
      } catch (e) {
        console.error("读取文件失败", file.name, e);
      }
    }

    const added = State.addPages(newPages);
    if (added > 0) {
      if (TaskQueue) {
        newPages.forEach(function (p) {
          TaskQueue.createTaskFromPage(p, State);
        });
      }
      Render.refresh();
      const last = newPages[newPages.length - 1];
      if (last && files.length === 1) {
        State.switchPage(last.id);
      }
      setTimeout(() => {
        if (Render.viewerMode && Render.imageViewer) {
          Render.imageViewer.fitToViewport();
        }
      }, 100);
    }
    imageInput.value = "";
  }

  function computeCoords(clientX, clientY) {
    if (Render.viewerMode && Render.imageViewer && Render.imageViewer.imageLoaded) {
      const viewportEl = Render.Doms.viewerViewport;
      const viewportRect = viewportEl.getBoundingClientRect();
      const viewportX = clientX - viewportRect.left;
      const viewportY = clientY - viewportRect.top;
      const real = Render.imageViewer.viewportToReal(viewportX, viewportY);
      const percent = Render.imageViewer.realToPercent(real.x, real.y);
      return {
        x: percent.x,
        y: percent.y,
        realX: Number(real.x.toFixed(2)),
        realY: Number(real.y.toFixed(2)),
      };
    }

    const { dragOverlay } = getActiveElements();
    const rect = dragOverlay.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, Number(x.toFixed(2)))),
      y: Math.max(0, Math.min(100, Number(y.toFixed(2)))),
    };
  }

  function handleStageClick(event) {
    if (CalibrationUI && CalibrationUI.isPicking()) {
      event.stopPropagation();
      var picking = CalibrationUI.getPickingInfo();
      var calData = CalibrationUI.getCalibration();
      var page = State.currentPage;
      if (!page || !page.image) return;

      var needSwitch = (picking.side === "source" && calData.sourcePageId && calData.sourcePageId !== page.id)
        || (picking.side === "target" && calData.targetPageId && calData.targetPageId !== page.id);

      var coords = computeCoords(event.clientX, event.clientY);
      CalibrationUI.setCalibrationPoint(picking.side, picking.index, coords.x, coords.y);
      CalibrationUI.stopPicking();
      document.body.classList.remove("calibration-picking");
      updateCalibrationPointDisplay();
      Render.refresh();
      showToast("已设置校准点 " + (picking.side === "source" ? "S" : "T") + (picking.index + 1), "success");
      return;
    }

    if (currentMode !== "point") return;
    if (event.target.closest("button, [data-marker]")) return;

    const currentPage = State.currentPage;
    if (!currentPage || !currentPage.image) return;

    if (Render.viewerMode && Render.imageViewer && Render.imageViewer.checkAndClearPanClick()) {
      return;
    }

    const clickCoords = computeCoords(event.clientX, event.clientY);
    const selectedTypeId = Render.getSelectedTypeId();

    const markerData = {
      typeId: selectedTypeId,
      note: noteInput.value,
      x: clickCoords.x,
      y: clickCoords.y,
    };

    if (clickCoords.realX !== undefined) {
      markerData.realX = clickCoords.realX;
      markerData.realY = clickCoords.realY;
    }

    const marker = State.addMarker(markerData);
    if (marker) {
      noteInput.value = "";
    }
  }

  function startDrag(clientX, clientY) {
    if (currentMode !== "region") return;
    const page = State.currentPage;
    if (!page || !page.image) return;

    const { dragOverlay } = getActiveElements();
    const el = document.createElement("div");
    el.className = "drag-rect";
    dragOverlay.appendChild(el);

    dragState = {
      el,
      clientStartX: clientX,
      clientStartY: clientY,
    };

    if (Render.viewerMode && Render.imageViewer && Render.imageViewer.imageLoaded) {
      const viewportEl = Render.Doms.viewerViewport;
      const viewportRect = viewportEl.getBoundingClientRect();
      const startViewportX = clientX - viewportRect.left;
      const startViewportY = clientY - viewportRect.top;
      const real = Render.imageViewer.viewportToReal(startViewportX, startViewportY);
      dragState.startRealX = real.x;
      dragState.startRealY = real.y;
      el.style.position = "absolute";
      el.style.pointerEvents = "none";
    } else {
      const rect = dragOverlay.getBoundingClientRect();
      const startX = ((clientX - rect.left) / rect.width) * 100;
      const startY = ((clientY - rect.top) / rect.height) * 100;
      dragState.startX = startX;
      dragState.startY = startY;
      dragState.rect = rect;
    }

    document.body.classList.add("dragging-region");
  }

  function moveDrag(clientX, clientY) {
    if (!dragState) return;

    if (Render.viewerMode && Render.imageViewer && Render.imageViewer.imageLoaded) {
      const viewportEl = Render.Doms.viewerViewport;
      const viewportRect = viewportEl.getBoundingClientRect();
      const curViewportX = clientX - viewportRect.left;
      const curViewportY = clientY - viewportRect.top;
      const curReal = Render.imageViewer.viewportToReal(curViewportX, curViewportY);

      const leftReal = Math.min(dragState.startRealX, curReal.x);
      const topReal = Math.min(dragState.startRealY, curReal.y);
      const rightReal = Math.max(dragState.startRealX, curReal.x);
      const bottomReal = Math.max(dragState.startRealY, curReal.y);
      const widthReal = rightReal - leftReal;
      const heightReal = bottomReal - topReal;

      dragState.el.style.left = leftReal + "px";
      dragState.el.style.top = topReal + "px";
      dragState.el.style.width = widthReal + "px";
      dragState.el.style.height = heightReal + "px";

      dragState.resultRealX = leftReal;
      dragState.resultRealY = topReal;
      dragState.resultRealW = widthReal;
      dragState.resultRealH = heightReal;

      const percent = Render.imageViewer.realToPercent(leftReal, topReal);
      dragState.resultX = percent.x;
      dragState.resultY = percent.y;
      dragState.resultW = Number(((widthReal / Render.imageViewer.naturalWidth) * 100).toFixed(2));
      dragState.resultH = Number(((heightReal / Render.imageViewer.naturalHeight) * 100).toFixed(2));
    } else {
      const { dragOverlay } = getActiveElements();
      const rect = dragOverlay.getBoundingClientRect();
      const curX = ((clientX - rect.left) / rect.width) * 100;
      const curY = ((clientY - rect.top) / rect.height) * 100;
      const left = Math.max(0, Math.min(dragState.startX, curX));
      const top = Math.max(0, Math.min(dragState.startY, curY));
      const right = Math.min(100, Math.max(dragState.startX, curX));
      const bottom = Math.min(100, Math.max(dragState.startY, curY));

      dragState.el.style.left = left + "%";
      dragState.el.style.top = top + "%";
      dragState.el.style.width = (right - left) + "%";
      dragState.el.style.height = (bottom - top) + "%";

      dragState.resultX = left;
      dragState.resultY = top;
      dragState.resultW = right - left;
      dragState.resultH = bottom - top;
    }
  }

  function endDrag() {
    if (!dragState) return;

    const hasReal = dragState.resultRealX !== undefined &&
                    dragState.resultRealY !== undefined &&
                    dragState.resultRealW !== undefined &&
                    dragState.resultRealH !== undefined;

    const el = dragState.el;
    if (el && el.parentNode) el.remove();

    let savedX = 0, savedY = 0, savedW = 0, savedH = 0;
    let savedRealX, savedRealY, savedRealW, savedRealH;

    if (dragState.resultX !== undefined) savedX = dragState.resultX;
    if (dragState.resultY !== undefined) savedY = dragState.resultY;
    if (dragState.resultW !== undefined) savedW = dragState.resultW;
    if (dragState.resultH !== undefined) savedH = dragState.resultH;
    if (hasReal) {
      savedRealX = dragState.resultRealX;
      savedRealY = dragState.resultRealY;
      savedRealW = dragState.resultRealW;
      savedRealH = dragState.resultRealH;
    }

    dragState = null;
    document.body.classList.remove("dragging-region");

    if (savedW < 1 || savedH < 1) return;

    const selectedTypeId = Render.getSelectedTypeId();

    const markerData = {
      typeId: selectedTypeId,
      note: noteInput.value,
      x: Number(savedX.toFixed(2)),
      y: Number(savedY.toFixed(2)),
      width: Number(savedW.toFixed(2)),
      height: Number(savedH.toFixed(2)),
    };

    if (hasReal) {
      markerData.realX = Number(savedRealX.toFixed(2));
      markerData.realY = Number(savedRealY.toFixed(2));
      markerData.realWidth = Number(savedRealW.toFixed(2));
      markerData.realHeight = Number(savedRealH.toFixed(2));
    }

    const marker = State.addRegion(markerData);
    if (marker) {
      noteInput.value = "";
    }
  }

  function cancelDrag() {
    if (!dragState) return;
    dragState.el.remove();
    dragState = null;
    document.body.classList.remove("dragging-region");
  }

  function sanitizeFilenamePart(str) {
    return (str || "")
      .replace(/[\\/:*?"<>|\s]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function updateExportSummary() {
    var includeImages = exportIncludeImages.checked;
    var options = { includeImages: includeImages };
    var summary = Package.getExportSummary(State.all, options);
    var taskCount = (TaskQueue && TaskQueue.tasks) ? TaskQueue.tasks.length : 0;

    exportSummary.innerHTML =
      '<div class="export-summary-row"><span>项目名称</span><strong>' + escapeHtmlSimple(summary.projectName) + '</strong></div>' +
      '<div class="export-summary-row"><span>页面数</span><strong>' + summary.pageCount + ' 页</strong></div>' +
      '<div class="export-summary-row"><span>标记总数</span><strong class="accent">' + summary.totalMarkers + ' 条</strong></div>' +
      '<div class="export-summary-row"><span>损伤类型</span><strong>' + summary.damageTypeCount + ' 种</strong></div>' +
      '<div class="export-summary-row"><span>任务队列</span><strong>' + taskCount + ' 个任务（一并导出）</strong></div>' +
      '<div class="export-summary-row"><span>格式版本</span><strong>v' + Package.PACKAGE_VERSION + '</strong></div>';

    if (includeImages && summary.hasImages) {
      exportImageSizeHint.textContent = "（约 " + formatFileSize(summary.totalImageSizeKB * 1024) + "）";
      exportImageSizeHint.style.display = "inline";
    } else {
      exportImageSizeHint.textContent = "";
      exportImageSizeHint.style.display = "none";
    }

    exportOptionNote.style.display = includeImages ? "none" : "block";

    exportSizeEstimate.innerHTML =
      '<span class="export-size-label">预估文件大小</span>' +
      '<span class="export-size-value' + (summary.estimatedFileSizeKB > 10240 ? " large" : "") + '">' + formatFileSize(summary.estimatedFileSizeKB * 1024) + '</span>';
  }

  function openExportModal() {
    if (!State.hasPages) {
      showToast("卷册中暂无任何页面，无法导出", "warning");
      return;
    }
    exportIncludeImages.checked = true;
    updateExportSummary();
    exportModal.style.display = "flex";
  }

  function closeExportModal() {
    exportModal.style.display = "none";
  }

  function performExport() {
    var includeImages = exportIncludeImages.checked;
    var state = State.all;
    var packageObj = Package.exportPackage(state, { includeImages: includeImages });

    if (Render.viewerMode && Render.imageViewer && Render.imageViewer.imageLoaded) {
      var imageInfo = Render.imageViewer.getImageInfo();
      var currentPageId = State.currentPage && State.currentPage.id;
      if (currentPageId && packageObj.pages) {
        var currentPageData = packageObj.pages.find(function (p) { return p.id === currentPageId; });
        var currentStatePage = state.pages.find(function (p) { return p.id === currentPageId; });
        if (currentPageData && currentStatePage && currentStatePage.image) {
          currentPageData.imageWidth = imageInfo.naturalWidth;
          currentPageData.imageHeight = imageInfo.naturalHeight;
          if (currentStatePage.markers && currentStatePage.markers.length > 0) {
            currentPageData.markers = currentStatePage.markers
              .map(function (m) { return Render.imageViewer.exportRealCoords(m); })
              .filter(Boolean);
          }
        }
      }
    }

    packageObj._checksum = Package.computeChecksum(packageObj);
    Package.downloadPackage(packageObj);
    closeExportModal();
    showToast("项目工作包已导出（v" + Package.PACKAGE_VERSION + "）", "success");
  }

  function handleExport() {
    openExportModal();
  }

  function hideAllImportStates() {
    importError.style.display = "none";
    importWarning.style.display = "none";
    importQuotaWarning.style.display = "none";
    importCurrentDataWarning.style.display = "none";
    importFileInfo.style.display = "none";
    importIntegrity.style.display = "none";
    importSummary.style.display = "none";
    importTaskQueuePreview.style.display = "none";
    importMigrationDetail.style.display = "none";
    importRestoreWarnings.style.display = "none";
    importLoading.style.display = "none";
    importSuccess.style.display = "none";
    importSafetyNote.style.display = "none";
    confirmImportBtn.style.display = "none";
  }

  function showImportError(title, detail, errorCode, resolution) {
    var html = '<span class="import-error-title">⚠ ' + escapeHtmlSimple(title) + '</span>';
    if (detail) {
      html += '<div class="import-error-detail">' + escapeHtmlSimple(detail) + '</div>';
    }
    if (errorCode) {
      html += '<div class="import-error-code">错误码：' + escapeHtmlSimple(errorCode) + '</div>';
    }
    if (resolution) {
      html += '<div class="import-error-resolution">💡 ' + escapeHtmlSimple(resolution) + '</div>';
    }
    importError.innerHTML = html;
    importError.style.display = "block";
    importError.classList.add("import-error-shake");
    setTimeout(function () {
      importError.classList.remove("import-error-shake");
    }, 500);
    importDropZone.style.display = "block";
    importDropZone.classList.remove("has-file");
  }

  function showImportWarning(title, message) {
    importWarning.innerHTML =
      '<span class="import-warning-title">⚡ ' + escapeHtmlSimple(title) + '</span>' +
      (message ? '<div>' + escapeHtmlSimple(message) + '</div>' : '');
    importWarning.style.display = "block";
  }

  function showImportCurrentDataWarning(currentDataSummary) {
    if (!currentDataSummary) return;
    var html =
      '<div class="import-current-data-warning-title">⚠ 当前存在工作数据</div>' +
      '<div>当前项目：' + escapeHtmlSimple(currentDataSummary.projectTitle || "未命名") + '，共 ' +
      currentDataSummary.pageCount + ' 页、' + currentDataSummary.totalMarkers + ' 条标记。</div>' +
      '<div class="import-current-data-warning-detail">导入工作包将替换当前所有数据。导入前会自动创建快照和备份，如失败将自动回滚。</div>';
    importCurrentDataWarning.innerHTML = html;
    importCurrentDataWarning.style.display = "block";
  }

  function showImportQuotaWarning(quotaInfo) {
    var levelClass = quotaInfo.warningLevel === "critical" ? " critical" : "";
    var levelText = quotaInfo.warningLevel === "critical" ? "严重不足" : "空间紧张";
    importQuotaWarning.innerHTML =
      '<span class="import-quota-warning-title">存储空间' + escapeHtmlSimple(levelText) + '</span>' +
      '<div>导入后预估需要 ' + formatFileSize(quotaInfo.estimatedSize) + ' 存储空间。</div>' +
      '<div>当前已用 ' + formatFileSize(quotaInfo.currentUsage) + '，导入后剩余约 ' + formatFileSize(Math.max(0, quotaInfo.availableAfterImport)) + '。</div>' +
      '<div class="import-quota-hint">建议：先导出备份当前数据，再清空后导入。如数据不含图片，存储压力会大幅降低。</div>';
    importQuotaWarning.className = "import-quota-warning" + levelClass;
    importQuotaWarning.style.display = "block";
  }

  function showImportFileInfo(file, quickInfo) {
    var sizeStr = formatFileSize(file.size);
    importFileInfo.innerHTML =
      '<span class="import-file-info-icon">📄</span>' +
      '<span class="import-file-info-name">' + escapeHtmlSimple(file.name) + '</span>' +
      '<span class="import-file-info-size">' + sizeStr + '</span>';
    importFileInfo.style.display = "flex";
  }

  function showImportIntegrity(quickInfo) {
    if (quickInfo.integrityVerified) {
      importIntegrity.className = "import-integrity verified";
      importIntegrity.innerHTML = "✓ 完整性校验通过";
    } else if (quickInfo.isLegacyFormat) {
      importIntegrity.className = "import-integrity unverified";
      importIntegrity.innerHTML = "ℹ 旧版格式（无校验信息）";
    } else {
      importIntegrity.className = "import-integrity unverified";
      importIntegrity.innerHTML = "ℹ 未包含校验信息";
    }
    importIntegrity.style.display = "inline-flex";
  }

  function showImportSummary(summary, packageData) {
    const timeStr = summary.exportedAt
      ? new Date(summary.exportedAt).toLocaleString("zh-CN")
      : "未知";

    const rows = [
      ["项目名称", summary.packageName],
      ["页面数", summary.pageCount + " 页"],
      ["标记总数", summary.totalMarkers + " 条"],
      ["损伤类型", summary.damageTypeCount + " 种"],
      ["包含图片", summary.hasImages ? "是" : "否（仅标记数据）"],
      ["导出时间", timeStr],
      ["格式版本", summary.formatVersion],
    ];

    var typeListHtml = "";
    if (packageData && packageData.damageTypes) {
      var typeCounts = summary.typeCounts || {};
      typeListHtml = '<div class="import-summary-type-list">';
      packageData.damageTypes.forEach(function (t) {
        var count = typeCounts[t.name] || 0;
        typeListHtml +=
          '<div class="import-summary-type-item">' +
            '<span class="import-summary-type-dot" style="background:' + t.color + ';"></span>' +
            '<span class="import-summary-type-name">' + escapeHtmlSimple(t.name) + '</span>' +
            '<span class="import-summary-type-count">' + count + ' 条</span>' +
          '</div>';
      });
      typeListHtml += '</div>';
    }

    var versionBadge = summary.wasMigrated
      ? '<span class="import-summary-title-badge">已迁移</span>'
      : '<span class="import-summary-title-badge">v' + escapeHtmlSimple(summary.formatVersion) + '</span>';

    importSummary.innerHTML =
      '<div class="import-summary-title">工作包内容预览 ' + versionBadge + '</div>' +
      rows.map(function (r) {
        return '<div class="import-summary-row">' +
          '<span class="import-summary-label">' + escapeHtmlSimple(r[0]) + '</span>' +
          '<span class="import-summary-value' + (r[0] === "标记总数" ? " accent" : "") + '">' + escapeHtmlSimple(r[1]) + '</span>' +
        '</div>';
      }).join("") +
      typeListHtml +
      (summary.wasMigrated
        ? '<div class="import-summary-note">此文件由旧格式（' + escapeHtmlSimple(summary.migratedFrom || "未知") + ' v' + escapeHtmlSimple(summary.originalFormatVersion || "?") + '）自动迁移而来，数据结构已适配当前版本。</div>'
        : "") +
      '<div class="import-summary-note">导入将替换当前所有工作数据，请确认已备份现有数据。</div>';

    importSummary.style.display = "block";
  }

  function showImportTaskQueuePreview(preview) {
    if (!preview) {
      importTaskQueuePreview.style.display = "none";
      return;
    }

    if (!preview.hasTaskQueue) {
      importTaskQueuePreview.innerHTML =
        '<div class="tq-preview-title">📋 离线审校任务队列</div>' +
        '<div class="tq-preview-body">' +
          '<div class="tq-preview-row"><span>任务数据</span><strong>工作包不含任务队列数据（旧版工作包）</strong></div>' +
          '<div class="tq-preview-note">导入后将根据卷册页面自动生成待标注任务，复核备注与优先级不会保留。</div>' +
        '</div>';
      importTaskQueuePreview.classList.remove("has-conflict");
      importTaskQueuePreview.style.display = "block";
      return;
    }

    var statusParts = [];
    statusParts.push("待标注 " + preview.statusCounts.pending);
    statusParts.push("标注中 " + preview.statusCounts.in_progress);
    statusParts.push("已完成 " + preview.statusCounts.completed);

    var conflictsHtml = "";
    if (preview.conflicts && preview.conflicts.length > 0) {
      conflictsHtml = '<div class="tq-preview-conflicts">';
      preview.conflicts.forEach(function (c) {
        var icon = c.level === "warning" ? "⚠" : "ℹ";
        conflictsHtml +=
          '<div class="tq-preview-conflict-item ' + (c.level || "info") + '">' +
            '<span class="tq-preview-conflict-icon">' + icon + '</span>' +
            '<span>' + escapeHtmlSimple(c.message) + '</span>' +
          '</div>';
      });
      conflictsHtml += '</div>';
    }

    importTaskQueuePreview.innerHTML =
      '<div class="tq-preview-title">📋 离线审校任务队列</div>' +
      '<div class="tq-preview-body">' +
        '<div class="tq-preview-row"><span>即将恢复任务</span><strong class="accent">' + preview.taskCount + ' 个</strong></div>' +
        '<div class="tq-preview-row"><span>关联页面任务</span><strong>' + preview.linkedTaskCount + ' 个</strong></div>' +
        '<div class="tq-preview-row"><span>任务状态</span><strong>' + escapeHtmlSimple(statusParts.join(" · ")) + '</strong></div>' +
      '</div>' +
      conflictsHtml;

    importTaskQueuePreview.classList.toggle(
      "has-conflict",
      preview.conflicts.some(function (c) { return c.level === "warning"; })
    );
    importTaskQueuePreview.style.display = "block";
  }

  function showImportMigrationDetail(result) {
    if (!result.wasMigrated) return;
    var steps = [];
    var originalFormat = result.migratedFrom || "旧版格式";
    var originalVersion = result.originalFormatVersion || "未知";

    steps.push({ label: "原始格式：" + originalFormat + " v" + originalVersion });

    if (result.migrationSteps && result.migrationSteps.length > 0) {
      result.migrationSteps.forEach(function (s) {
        steps.push({ label: s });
      });
    } else {
      steps.push({ label: "↓ 自动迁移" });
      steps.push({ label: "当前格式：" + Package.PACKAGE_FORMAT + " v" + Package.PACKAGE_VERSION });
    }

    var html =
      '<div class="import-migration-detail-title">🔄 版本迁移路径</div>' +
      steps.map(function (s) {
        return '<div class="import-migration-step">' +
          '<span class="import-migration-step-label">' + escapeHtmlSimple(s.label) + '</span>' +
        '</div>';
      }).join("");

    if (result.migrationNotes && result.migrationNotes.length > 0) {
      html += '<div class="import-migration-notes">';
      result.migrationNotes.forEach(function (note) {
        html += '• ' + escapeHtmlSimple(note) + '<br/>';
      });
      html += '</div>';
    }

    importMigrationDetail.innerHTML = html;
    importMigrationDetail.style.display = "block";
  }

  function showImportRestoreWarnings(warnings) {
    if (!warnings || warnings.length === 0) return;
    var html = "";
    warnings.forEach(function (w) {
      var icon = w.code === "MISSING_IMAGES" ? "🖼" :
        w.code === "QUOTA_CRITICAL" ? "🔴" :
        w.code === "QUOTA_WARNING" ? "🟡" : "⚠";
      html +=
        '<div class="import-restore-warning-item">' +
          '<span class="import-restore-warning-icon">' + icon + '</span>' +
          '<span class="import-restore-warning-text">' + escapeHtmlSimple(w.message) + '</span>' +
        '</div>';
    });
    importRestoreWarnings.innerHTML = html;
    importRestoreWarnings.style.display = "block";
  }

  function escapeHtmlSimple(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function openImportModal() {
    hideAllImportStates();
    importDropZone.style.display = "block";
    importDropZone.classList.remove("has-file", "drag-over");
    importModal.style.display = "flex";
    pendingImportData = null;
    if (State.hasData()) {
      importSafetyNote.style.display = "flex";
      importSafetyNote.innerHTML =
        '<span class="import-safety-icon">🛡</span>' +
        '<span>导入前将自动创建快照和备份，失败时将自动回滚</span>';
    }
  }

  function closeImportModal() {
    importModal.style.display = "none";
    pendingImportData = null;
    importFileInput.value = "";
  }

  function handleImportFile(file) {
    if (!file) return;

    hideAllImportStates();
    importDropZone.style.display = "none";
    importLoading.style.display = "flex";

    const reader = new FileReader();
    reader.onerror = function () {
      importLoading.style.display = "none";
      showImportError("文件读取失败", "无法读取选中的文件，请检查文件是否损坏。");
    };
    reader.onload = function () {
      importLoading.style.display = "none";

      var quickInfo = Package.getQuickInfo(reader.result);
      showImportFileInfo(file, quickInfo);

      if (!quickInfo.valid) {
        var resolution = quickInfo.errorCode ? Package.ERROR_RESOLUTIONS[quickInfo.errorCode] : null;
        showImportError(
          "文件格式无法识别",
          quickInfo.error,
          quickInfo.errorCode,
          resolution
        );
        return;
      }

      if (quickInfo.sizeWarning) {
        showImportWarning(
          "文件较大",
          "此工作包文件约 " + formatFileSize(quickInfo.fileSize) + "，解析可能需要一些时间，请耐心等待。"
        );
      }

      try {
        var result = Package.importPackage(reader.result);
        pendingImportData = result.packageData;

        showImportIntegrity(quickInfo);

        var summary = Package.getPackageSummary(result.packageData);

        if (result.wasMigrated) {
          showImportWarning(
            "旧格式自动迁移",
            "检测到文件格式为 " + (result.migratedFrom || "旧版") + "，已自动迁移为当前项目工作包格式。原始版本：" + (result.originalFormatVersion || "未知")
          );
          showImportMigrationDetail(result);
        }

        if (State.hasData()) {
          showImportCurrentDataWarning({
            projectTitle: State.all.volumeTitle,
            pageCount: State.pages.length,
            totalMarkers: State.getTotalMarkers(),
          });
          importSafetyNote.style.display = "flex";
          importSafetyNote.innerHTML =
            '<span class="import-safety-icon">🛡</span>' +
            '<span>导入前将自动创建快照和备份，失败时将自动回滚</span>';
        }

        showImportSummary(summary, result.packageData);

        var taskPreview = Package.getTaskQueuePreview(result.packageData);
        showImportTaskQueuePreview(taskPreview);

        var restoreCheck = Package.validateForRestore(result.packageData);
        if (restoreCheck.warnings && restoreCheck.warnings.length > 0) {
          showImportRestoreWarnings(restoreCheck.warnings);
        }

        var quotaInfo = State.checkImportQuota(result.packageData);
        if (quotaInfo.warningLevel !== "ok") {
          showImportQuotaWarning(quotaInfo);
        }

        confirmImportBtn.style.display = "inline-flex";
      } catch (e) {
        if (e.isPackageError) {
          showImportError(e.message, e.detail, e.code, e.resolution);
        } else {
          showImportError("导入失败", e.message || "未知错误");
        }
      }
    };
    reader.readAsText(file);
  }

  function handleConfirmImport() {
    if (!pendingImportData) {
      showImportError("导入失败", "没有可导入的数据，请重新选择文件。");
      return;
    }

    var preValidation = State.preImportValidation(pendingImportData);
    if (!preValidation.canProceed) {
      var errorMsg = preValidation.errors.join("；");
      var errorCode = preValidation.quotaOk ? Package.ERROR_CODES.VALIDATION_ERROR : Package.ERROR_CODES.STORAGE_QUOTA_EXCEEDED;
      var resolution = preValidation.quotaOk ? null : Package.ERROR_RESOLUTIONS.STORAGE_QUOTA_EXCEEDED;
      showImportError("导入前验证失败", errorMsg, errorCode, resolution);
      pendingImportData = null;
      return;
    }

    var result = State.restoreFromPackage(pendingImportData);

    if (result.success) {
      hideAllImportStates();
      importSuccess.style.display = "flex";
      if (importSuccessInfo) {
        var taskInfoText = result.taskQueueRestored
          ? "、" + (result.taskCount || 0) + " 个任务" + (result.taskQueueRebuilt ? "（自动生成）" : "")
          : "";
        importSuccessInfo.textContent =
          "已恢复 " + result.pageCount + " 页、" + result.markerCount + " 条标记" +
          taskInfoText +
          (result.projectTitle ? "（" + result.projectTitle + "）" : "");
      }
      confirmImportBtn.style.display = "none";
      cancelImportBtn.textContent = "完成";

      if (result.warnings && result.warnings.length > 0) {
        showImportRestoreWarnings(result.warnings);
      }

      showToast(
        "项目工作包导入成功，已恢复 " + result.pageCount + " 页" +
        (result.taskQueueRestored ? "、" + (result.taskCount || 0) + " 个任务" : "") + "数据",
        "success"
      );

      if (CalibrationUI && pendingImportData && pendingImportData.calibrationSessions && pendingImportData.calibrationSessions.length > 0) {
        var latestSession = pendingImportData.calibrationSessions[0];
        if (latestSession && latestSession.data) {
          CalibrationUI.restoreExportData(latestSession.data);
        }
      }

      setTimeout(function () {
        if (Render.viewerMode && Render.imageViewer) {
          Render.imageViewer.fitToViewport();
        }
      }, 100);

      setTimeout(function () {
        closeImportModal();
      }, 2500);
    } else {
      var rollbackMsg;
      if (result.rolledBack) {
        rollbackMsg = "已自动回滚到导入前的状态（通过" + (result.rollbackMethod === "snapshot" ? "快照" : "备份") + "）";
        if (result.taskRolledBack) {
          rollbackMsg += "，卷册与任务队列均未被修改。";
        } else {
          rollbackMsg += "，卷册数据未被修改。";
        }
      } else if (result.backupWasCreated || result.snapshotWasCreated) {
        rollbackMsg = "快照/备份已创建但回滚未完成，请检查数据完整性。";
      } else {
        rollbackMsg = "当前数据未被修改。";
      }

      if (result.failedDuringTaskQueue) {
        rollbackMsg = "任务队列写入失败，" + rollbackMsg;
      }

      var resolution = result.isQuotaError
        ? Package.ERROR_RESOLUTIONS.STORAGE_QUOTA_EXCEEDED
        : result.preCheckFailed
          ? "请确认工作包文件格式正确且数据完整。"
          : result.failedDuringTaskQueue
            ? "可尝试先导出当前任务队列备份后清空，或清理浏览器存储后重试。"
            : Package.ERROR_RESOLUTIONS.RESTORE_FAILED;

      showImportError(
        "导入失败，" + rollbackMsg,
        result.errorMessage,
        result.isQuotaError ? Package.ERROR_CODES.STORAGE_QUOTA_EXCEEDED : Package.ERROR_CODES.RESTORE_FAILED,
        resolution
      );
      showToast("导入失败，数据已回滚", "error", 4000);
      pendingImportData = null;
    }
  }

  function handleClearCurrent() {
    const page = State.currentPage;
    if (!page) {
      showToast("当前没有页面可清空", "warning");
      return;
    }
    if (!confirm("清空当前扫描页和全部标记？此操作不可撤销。")) return;
    State.clearCurrentPage();
  }

  function handleGoReview() {
    window.location.href = "./review.html";
  }

  function handleGoDiff() {
    window.location.href = "./diff.html";
  }

  function handleClearAll() {
    if (!State.hasPages) {
      showToast("当前没有卷册数据", "warning");
      return;
    }
    const total = State.getTotalMarkers();
    const pageCount = State.pages.length;
    const msg =
      `确认清空全部卷册数据？\n\n` +
      `共 ${pageCount} 页扫描页、${total} 条损伤标记将被永久删除，此操作不可撤销。`;
    if (!confirm(msg)) return;
    State.resetAll();
  }

  function handleKeyboard(event) {
    if (event.key === "Escape") {
      if (CalibrationUI && CalibrationUI.isPicking()) {
        CalibrationUI.stopPicking();
        document.body.classList.remove("calibration-picking");
        Render.refresh();
        return;
      }
      if (dragState) {
        event.preventDefault();
        cancelDrag();
        return;
      }
      if (importModal && importModal.style.display !== "none") {
        closeImportModal();
        return;
      }
      if (calibrationModal && calibrationModal.style.display !== "none") {
        closeCalibrationModal();
        return;
      }
    }
    if (event.target.matches("input, textarea, select")) return;
    if (event.key === "ArrowLeft" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      State.switchPrev();
    } else if (event.key === "ArrowRight" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      State.switchNext();
    } else if ((event.key === "Delete" || event.key === "Backspace") && State.currentPage && State.currentPage.markers.length > 0) {
      if (confirm("清空当前页全部标记？")) {
        event.preventDefault();
        State.clearCurrentMarkers();
      }
    }

    if (Render.viewerMode) {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        if (Render.imageViewer) Render.imageViewer.zoomIn();
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        if (Render.imageViewer) Render.imageViewer.zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        if (Render.imageViewer) Render.imageViewer.fitToViewport();
      }
    }
  }

  function updateSensitivityDisplay() {
    if (candidateSensitivity && sensitivityValue) {
      sensitivityValue.textContent = candidateSensitivity.value;
    }
  }

  function updateConfidenceThresholdDisplay() {
    if (confidenceThreshold && confidenceThresholdValue) {
      confidenceThresholdValue.textContent = confidenceThreshold.value + "%";
    }
  }

  async function runCandidateDetection() {
    const page = State.currentPage;
    if (!page || !page.image) {
      showToast("请先上传扫描页图片", "warning");
      return;
    }

    if (!CandidateDetector || !CandidateManager) {
      showToast("候选检测模块未加载", "error");
      return;
    }

    const sensitivity = candidateSensitivity
      ? parseInt(candidateSensitivity.value, 10)
      : 50;
    const detectEdge = detectEdgeDamage ? detectEdgeDamage.checked : true;
    const maxCandidates = maxCandidatesSelect
      ? parseInt(maxCandidatesSelect.value, 10)
      : 50;

    const options = {
      sensitivity: sensitivity,
      detectEdgeDamage: detectEdge,
      maxCandidates: maxCandidates,
    };

    runDetectBtn.disabled = true;
    runDetectBtn.textContent = "检测中...";

    try {
      const result = await CandidateDetector.detectCandidates(
        page.image,
        options
      );

      if (result.warning) {
        showToast(result.warning, "warning");
      }

      CandidateManager.setCandidates(result.candidates || []);

      const count = (result.candidates || []).length;
      if (count > 0) {
        syncCandidateSummaryToState();
        showToast(`检测完成，发现 ${count} 个疑似区域`, "success");
      } else {
        showToast("检测完成，未发现疑似虫蛀区域", "info");
      }

      Render.refresh();
    } catch (e) {
      console.error("候选检测失败", e);
      showToast("检测失败：" + (e.message || "未知错误"), "error");
    } finally {
      runDetectBtn.disabled = false;
      runDetectBtn.textContent = "开始检测";
    }
  }

  function acceptAllPendingCandidates() {
    if (!CandidateManager) return;
    const count = CandidateManager.acceptAllPending();
    if (count > 0) {
      syncCandidateSummaryToState();
      showToast(`已接受 ${count} 个候选`, "success");
      Render.refresh();
    } else {
      showToast("没有待处理的候选", "info");
    }
  }

  function ignoreAllPendingCandidates() {
    if (!CandidateManager) return;
    const count = CandidateManager.ignoreAllPending();
    if (count > 0) {
      syncCandidateSummaryToState();
      showToast(`已忽略 ${count} 个候选`, "info");
      Render.refresh();
    } else {
      showToast("没有待处理的候选", "info");
    }
  }

  function acceptByConfidenceCandidates() {
    if (!CandidateManager) return;

    const thresholdPercent = confidenceThreshold
      ? parseInt(confidenceThreshold.value, 10)
      : 70;
    const minConfidence = thresholdPercent / 100;

    const count = CandidateManager.acceptByConfidence(minConfidence);
    if (count > 0) {
      syncCandidateSummaryToState();
      showToast(`已接受 ${count} 个置信度 ≥ ${thresholdPercent}% 的候选`, "success");
      Render.refresh();
    } else {
      showToast(`没有置信度 ≥ ${thresholdPercent}% 的待处理候选`, "info");
    }
  }

  function applyAcceptedCandidates() {
    if (!CandidateManager) return;

    const page = State.currentPage;
    if (!page) {
      showToast("没有当前页面", "warning");
      return;
    }

    const acceptedMarkers = CandidateManager.getAcceptedMarkers();
    if (acceptedMarkers.length === 0) {
      showToast("没有已接受的候选可应用", "warning");
      return;
    }

    const selectedTypeId = Render.getSelectedTypeId();

    let addedCount = 0;
    for (const markerData of acceptedMarkers) {
      const finalMarker = {
        ...markerData,
        typeId: selectedTypeId || markerData.typeId,
      };
      const result =
        finalMarker.mode === "region"
          ? State.addRegion(finalMarker)
          : State.addMarker(finalMarker);
      if (result) addedCount++;
    }

    if (addedCount > 0) {
      syncCandidateSummaryToState();
      CandidateManager.clearAccepted();
      Render.refresh();
    } else {
      showToast("未能添加任何损伤记录", "warning");
    }
  }

  function handleCandidateAction(candidateId, action) {
    if (!CandidateManager) return;

    switch (action) {
      case "accept":
        CandidateManager.acceptCandidate(candidateId);
        break;
      case "ignore":
        CandidateManager.ignoreCandidate(candidateId);
        break;
      case "reset":
        CandidateManager.resetCandidate(candidateId);
        break;
    }

    syncCandidateSummaryToState();
    Render.refresh();
  }

  function setCandidateFilter(filter) {
    if (!CandidateManager) return;
    CandidateManager.setFilter(filter);

    if (candidateFilterTabs) {
      const tabs = candidateFilterTabs.querySelectorAll(".cand-filter-tab");
      tabs.forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.filter === filter);
      });
    }

    Render.refresh();
  }

  function handleCandidateListClick(e) {
    const actionBtn = e.target.closest("[data-action]");
    if (actionBtn) {
      e.stopPropagation();
      const item = e.target.closest("[data-candidate-id]");
      if (item) {
        const candidateId = item.dataset.candidateId;
        const action = actionBtn.dataset.action;
        handleCandidateAction(candidateId, action);
      }
      return;
    }

    const item = e.target.closest("[data-candidate-id]");
    if (item) {
      const candidateId = item.dataset.candidateId;
      highlightCandidate(candidateId);
    }
  }

  function highlightCandidate(candidateId) {
    const { candidateLayer } = Render.getActiveStageElements();
    if (!candidateLayer) return;

    const marker = candidateLayer.querySelector(
      `[data-candidate-id="${candidateId}"]`
    );
    if (marker) {
      marker.style.transform = "scale(1.1)";
      marker.style.zIndex = "30";
      setTimeout(() => {
        marker.style.transform = "";
        marker.style.zIndex = "";
      }, 600);
    }
  }

  function syncCandidateSummaryToState(pageId, options) {
    if (!CandidateManager) return;
    options = options || {};
    var page = pageId
      ? State.pages.find(function (p) { return p.id === pageId; })
      : State.currentPage;
    if (!page) return;
    var stats = CandidateManager.getStats();
    if (stats.total > 0) {
      State.updateCandidateSummary(page.id, stats);
    } else if (!options.preserveExisting) {
      State.clearCandidateSummary(page.id);
    }
  }

  function handlePageChange() {
    if (!CandidateManager) return;
    const currentPageId = State.currentPage ? State.currentPage.id : null;
    if (currentPageId !== lastPageId) {
      if (lastPageId) {
        syncCandidateSummaryToState(lastPageId, { preserveExisting: true });
      }
      lastPageId = currentPageId;
      CandidateManager.clearCandidates();
      Render.refresh();
    }
  }

  function toggleCandidates() {
    candidatesVisible = !candidatesVisible;
    const { candidateLayer } = Render.getActiveStageElements();
    const candidateLayerSimple = document.getElementById("candidateLayerSimple");
    const candidateLayerViewer = document.getElementById("candidateLayer");

    if (candidateLayerViewer) {
      candidateLayerViewer.style.display = candidatesVisible ? "block" : "none";
    }
    if (candidateLayerSimple) {
      candidateLayerSimple.style.display = candidatesVisible ? "block" : "none";
    }

    if (candidateToggleBtn) {
      candidateToggleBtn.textContent = candidatesVisible ? "👁" : "👁‍🗨";
      candidateToggleBtn.title = candidatesVisible ? "隐藏候选标记" : "显示候选标记";
    }
  }

  function openCalibrationModal() {
    if (!CalibrationUI) {
      showToast("校准模块未加载", "error");
      return;
    }
    if (State.pages.length < 2) {
      showToast("至少需要 2 个页面才能使用跨页校准", "warning");
      return;
    }
    populateCalibPageSelects();
    updateCalibrationPointDisplay();
    updateMigrationUI();
    calibrationModal.style.display = "flex";
  }

  function closeCalibrationModal() {
    if (CalibrationUI) CalibrationUI.stopPicking();
    document.body.classList.remove("calibration-picking");
    calibrationModal.style.display = "none";
  }

  function populateCalibPageSelects() {
    var pages = State.pages;
    var calData = CalibrationUI.getCalibration();
    var options = pages.map(function (p, i) {
      var name = p.name || p.fileName || ("第 " + (i + 1) + " 页");
      var count = p.markers ? p.markers.length : 0;
      return '<option value="' + p.id + '">' + escapeHtmlSimple(name) + ' (' + count + ' 条标记)</option>';
    }).join("");

    calibSourcePage.innerHTML = options;
    calibTargetPage.innerHTML = options;

    var currentPageId = State.currentPageId;
    var prevPageId = null;
    var currentIndex = State.currentIndex;
    if (currentIndex > 0) {
      prevPageId = State.pages[currentIndex - 1].id;
    }

    var finalSourceId = calData.sourcePageId || prevPageId || (pages.length > 0 ? pages[0].id : "");
    if (finalSourceId && finalSourceId !== calData.sourcePageId) {
      CalibrationUI.setSourcePage(finalSourceId);
    }
    if (finalSourceId) {
      calibSourcePage.value = finalSourceId;
    }

    var finalTargetId = calData.targetPageId;
    if (!finalTargetId) {
      finalTargetId = currentPageId || (pages.length > 0 ? pages[0].id : "");
      if (finalTargetId) {
        CalibrationUI.setTargetPage(finalTargetId);
      }
    }
    if (finalTargetId) {
      calibTargetPage.value = finalTargetId;
    }
  }

  function updateCalibrationPointDisplay() {
    if (!CalibrationUI) return;
    var calData = CalibrationUI.getCalibration();
    for (var i = 0; i < 4; i++) {
      var srcEl = document.getElementById("calibSrc" + i);
      var dstEl = document.getElementById("calibDst" + i);
      if (srcEl) {
        srcEl.textContent = calData.sourcePoints[i]
          ? "(" + calData.sourcePoints[i].x + ", " + calData.sourcePoints[i].y + ")"
          : "未选取";
      }
      if (dstEl) {
        dstEl.textContent = calData.targetPoints[i]
          ? "(" + calData.targetPoints[i].x + ", " + calData.targetPoints[i].y + ")"
          : "未选取";
      }
    }
  }

  function handleCalibPick(side, index) {
    if (!CalibrationUI) return;
    CalibrationUI.startPicking(side, index);
    document.body.classList.add("calibration-picking");

    var calData = CalibrationUI.getCalibration();
    var targetPageId = null;
    if (side === "source" && calData.sourcePageId) {
      targetPageId = calData.sourcePageId;
    } else if (side === "target" && calData.targetPageId) {
      targetPageId = calData.targetPageId;
    }

    if (targetPageId && targetPageId !== State.currentPageId) {
      State.switchPage(targetPageId);
    }

    showToast("请在页面上点击选取校准点 " + (side === "source" ? "S" : "T") + (index + 1), "info");
  }

  function handleCalibGenerate() {
    if (!CalibrationUI) return;
    var result = CalibrationUI.computeAndGenerateCandidates();
    if (result.success) {
      calibResult.textContent = "变换计算成功！生成了 " + result.count + " 个迁移候选标记，请逐条确认。";
      calibResult.className = "calib-result success";
      calibResult.style.display = "block";
      calibMigrationSection.style.display = "block";
      updateMigrationUI();
      Render.refresh();
      showToast("已生成 " + result.count + " 个迁移候选", "success");
    } else {
      calibResult.textContent = result.error;
      calibResult.className = "calib-result error";
      calibResult.style.display = "block";
      showToast(result.error, "error");
    }
  }

  function handleCalibReset() {
    if (!CalibrationUI) return;
    if (!confirm("确认重置所有校准点和迁移候选？")) return;
    CalibrationUI.resetCalibration();
    calibResult.style.display = "none";
    calibMigrationSection.style.display = "none";
    updateCalibrationPointDisplay();
    Render.refresh();
    showToast("校准数据已重置", "info");
  }

  function updateMigrationUI() {
    if (!CalibrationUI) return;
    var stats = CalibrationUI.getStats();
    if (migrPending) migrPending.textContent = stats.pending;
    if (migrAccepted) migrAccepted.textContent = stats.accepted;
    if (migrRejected) migrRejected.textContent = stats.rejected;

    if (stats.total > 0) {
      calibMigrationSection.style.display = "block";
    }

    renderMigrationList();
  }

  function renderMigrationList() {
    if (!CalibrationUI || !migrationList) return;
    var candidates = CalibrationUI.getMigrationCandidates();
    if (candidates.length === 0) {
      migrationList.innerHTML = '<div class="candidate-empty">暂无迁移候选</div>';
      return;
    }

    var damageTypes = State.damageTypes;
    migrationList.innerHTML = candidates.map(function (c) {
      var status = c.status || "pending";
      var typeInfo = State.findTypeById(c.typeId) || { name: c.type || "未知" };
      var isRegion = c.mode === "region";
      var coords = "(" + c.x + ", " + c.y + ")";
      var sizeInfo = isRegion ? " " + c.width + "%×" + c.height + "%" : "";

      var typeOptions = damageTypes.map(function (t) {
        return '<option value="' + t.id + '"' + (t.id === c.typeId ? ' selected' : '') + '>' + escapeHtmlSimple(t.name) + '</option>';
      }).join("");

      var actions = "";
      if (status === "pending") {
        actions = '<button class="migr-action-btn accept" data-migr-action="accept" data-migr-id="' + c.id + '" title="接受">✓</button>' +
          '<button class="migr-action-btn reject" data-migr-action="reject" data-migr-id="' + c.id + '" title="拒绝">✗</button>' +
          '<button class="migr-action-btn delete" data-migr-action="delete" data-migr-id="' + c.id + '" title="删除">🗑</button>';
      } else if (status === "accepted") {
        actions = '<button class="migr-action-btn reset" data-migr-action="reset" data-migr-id="' + c.id + '" title="重置">↺</button>' +
          '<button class="migr-action-btn delete" data-migr-action="delete" data-migr-id="' + c.id + '" title="删除">🗑</button>';
      } else {
        actions = '<button class="migr-action-btn reset" data-migr-action="reset" data-migr-id="' + c.id + '" title="重置">↺</button>' +
          '<button class="migr-action-btn delete" data-migr-action="delete" data-migr-id="' + c.id + '" title="删除">🗑</button>';
      }

      return '<div class="migration-item ' + status + '" data-migration-id="' + c.id + '">' +
        '<span class="migr-item-indicator ' + status + '"></span>' +
        '<div class="migr-item-body">' +
          '<div class="migr-item-title">' + (isRegion ? "[区域] " : "") + escapeHtmlSimple(typeInfo.name) + sizeInfo + '</div>' +
          '<div class="migr-item-coords">' + coords + '</div>' +
        '</div>' +
        '<select class="migr-item-type-select" data-migr-type-id="' + c.id + '">' + typeOptions + '</select>' +
        '<div class="migr-item-actions">' + actions + '</div>' +
      '</div>';
    }).join("");
  }

  function handleMigrationAction(candidateId, action) {
    if (!CalibrationUI) return;
    switch (action) {
      case "accept":
        CalibrationUI.acceptCandidate(candidateId);
        break;
      case "reject":
        CalibrationUI.rejectCandidate(candidateId);
        break;
      case "delete":
        CalibrationUI.deleteCandidate(candidateId);
        break;
      case "reset":
        CalibrationUI.resetCandidate(candidateId);
        break;
    }
    updateMigrationUI();
    Render.refresh();
  }

  function handleMigrAcceptAll() {
    if (!CalibrationUI) return;
    var count = CalibrationUI.acceptAllPending();
    if (count > 0) {
      showToast("已接受 " + count + " 个候选", "success");
    } else {
      showToast("没有待确认的候选", "info");
    }
    updateMigrationUI();
    Render.refresh();
  }

  function handleMigrRejectAll() {
    if (!CalibrationUI) return;
    var count = CalibrationUI.rejectAllPending();
    if (count > 0) {
      showToast("已拒绝 " + count + " 个候选", "info");
    } else {
      showToast("没有待确认的候选", "info");
    }
    updateMigrationUI();
    Render.refresh();
  }

  function handleMigrApply() {
    if (!CalibrationUI) return;
    var result = CalibrationUI.applyAccepted();
    if (result.added > 0) {
      showToast("已应用 " + result.added + " 条迁移标记到目标页面", "success");
      updateMigrationUI();
      Render.refresh();
    } else {
      showToast("没有已接受的候选可应用", "warning");
    }
  }

  var taskQueueModal = document.getElementById("taskQueueModal");
  var taskCreateModal = document.getElementById("taskCreateModal");
  var closeTaskQueueBtn = document.getElementById("closeTaskQueueBtn");
  var closeTaskQueueFooterBtn = document.getElementById("closeTaskQueueFooterBtn");
  var tqSearch = document.getElementById("tqSearch");
  var tqFilter = document.getElementById("tqFilter");
  var tqCreateBtn = document.getElementById("tqCreateBtn");
  var tqList = document.getElementById("tqList");
  var tqListEmpty = document.getElementById("tqListEmpty");
  var tqExportAllBtn = document.getElementById("tqExportAllBtn");
  var tqClearDoneBtn = document.getElementById("tqClearDoneBtn");
  var closeTaskCreateBtn = document.getElementById("closeTaskCreateBtn");
  var cancelTaskCreateBtn = document.getElementById("cancelTaskCreateBtn");
  var confirmTaskCreateBtn = document.getElementById("confirmTaskCreateBtn");
  var taskPageName = document.getElementById("taskPageName");
  var taskPriority = document.getElementById("taskPriority");
  var taskLinkPage = document.getElementById("taskLinkPage");
  var taskImageInput = document.getElementById("taskImageInput");

  var taskEditModal = document.getElementById("taskEditModal");
  var closeTaskEditBtn = document.getElementById("closeTaskEditBtn");
  var cancelTaskEditBtn = document.getElementById("cancelTaskEditBtn");
  var confirmTaskEditBtn = document.getElementById("confirmTaskEditBtn");
  var editTaskPageName = document.getElementById("editTaskPageName");
  var editTaskPriority = document.getElementById("editTaskPriority");
  var editTaskReviewNotes = document.getElementById("editTaskReviewNotes");
  var currentEditingTaskId = null;
  var currentEditPriority = "normal";

  var taskExportModal = document.getElementById("taskExportModal");
  var closeTaskExportBtn = document.getElementById("closeTaskExportBtn");
  var cancelTaskExportBtn = document.getElementById("cancelTaskExportBtn");
  var confirmTaskExportBtn = document.getElementById("confirmTaskExportBtn");
  var exportPending = document.getElementById("exportPending");
  var exportInProgress = document.getElementById("exportInProgress");
  var exportCompleted = document.getElementById("exportCompleted");
  var tqExportIncludeImages = document.getElementById("tqExportIncludeImages");
  var tqExportSummary = document.getElementById("tqExportSummary");
  var tqExportImageHint = document.getElementById("tqExportImageHint");
  var tqExportSizeEstimate = document.getElementById("tqExportSizeEstimate");
  var currentTaskIndicator = document.getElementById("currentTaskIndicator");
  var suppressTaskSync = false;

  function openTaskQueueModal() {
    renderTaskQueueList();
    updateTaskQueueStats();
    taskQueueModal.style.display = "flex";
  }

  function closeTaskQueueModal() {
    taskQueueModal.style.display = "none";
  }

  function openTaskCreateModal() {
    taskPageName.value = "";
    taskPriority.value = "normal";
    taskImageInput.value = "";
    renderTaskLinkPageOptions();
    taskCreateModal.style.display = "flex";
  }

  function closeTaskCreateModal() {
    taskCreateModal.style.display = "none";
  }

  function renderTaskLinkPageOptions() {
    var pages = State.pages;
    var options = '<option value="">不关联</option>';
    pages.forEach(function (p, i) {
      var name = p.name || p.fileName || "第 " + (i + 1) + " 页";
      options += '<option value="' + p.id + '">' + escapeHtmlSimple(name) + '</option>';
    });
    taskLinkPage.innerHTML = options;
  }

  function updateTaskQueueStats() {
    var counts = TaskQueue.counts;
    var tqPending = document.getElementById("tqPending");
    var tqInProgress = document.getElementById("tqInProgress");
    var tqCompleted = document.getElementById("tqCompleted");
    if (tqPending) tqPending.textContent = counts.pending;
    if (tqInProgress) tqInProgress.textContent = counts.inProgress;
    if (tqCompleted) tqCompleted.textContent = counts.completed;
  }

  function renderTaskQueueList() {
    var filter = tqFilter ? tqFilter.value : "all";
    var search = tqSearch ? tqSearch.value : "";
    var tasks = TaskQueue.getSortedTasks(filter, search);
    var activeId = TaskQueue.activeTaskId;

    if (tasks.length === 0) {
      tqListEmpty.style.display = "block";
      tqList.innerHTML = "";
      return;
    }

    tqListEmpty.style.display = "none";
    tqList.innerHTML = tasks.map(function (task) {
      var isActive = task.id === activeId ? " active" : "";
      var isCompleted = task.status === "completed" ? " completed" : "";
      var priorityClass = task.priority || "normal";
      var statusLabel = task.status === "pending" ? "待标注"
        : task.status === "in_progress" ? "标注中"
        : "已完成";
      var markerCount = task.markers ? task.markers.length : 0;
      var timeStr = "";
      if (task.completedAt) {
        timeStr = "完成于 " + new Date(task.completedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      } else if (task.updatedAt) {
        timeStr = "更新于 " + new Date(task.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      }

      var actionBtns = "";
      actionBtns += '<button class="tq-action-btn edit" data-tq-action="edit" data-tq-id="' + task.id + '" title="编辑任务">✎</button>';
      if (task.status === "completed") {
        actionBtns += '<button class="tq-action-btn reopen" data-tq-action="reopen" data-tq-id="' + task.id + '" title="重新开始">↺</button>';
      } else {
        actionBtns += '<button class="tq-action-btn goto" data-tq-action="goto" data-tq-id="' + task.id + '" title="跳转到此任务">→</button>';
        actionBtns += '<button class="tq-action-btn complete" data-tq-action="complete" data-tq-id="' + task.id + '" title="标记完成">✓</button>';
      }
      actionBtns += '<button class="tq-action-btn delete" data-tq-action="delete" data-tq-id="' + task.id + '" title="删除任务">🗑</button>';

      var reviewNotesHtml = "";
      if (task.reviewNotes && task.reviewNotes.trim()) {
        reviewNotesHtml = '<div class="tq-item-notes" title="' + escapeHtmlSimple(task.reviewNotes) + '">📝 ' + escapeHtmlSimple(task.reviewNotes.substring(0, 50)) + (task.reviewNotes.length > 50 ? "…" : "") + '</div>';
      }

      return '<div class="tq-item' + isActive + isCompleted + '" data-tq-task="' + task.id + '">' +
        '<div class="tq-item-priority ' + priorityClass + '"></div>' +
        '<div class="tq-item-body">' +
          '<div class="tq-item-name">' + escapeHtmlSimple(task.pageName || "未命名页面") + '</div>' +
          '<div class="tq-item-meta">' +
            '<span class="tq-item-status ' + task.status + '">' + statusLabel + '</span>' +
            '<span>' + markerCount + ' 条标记</span>' +
            '<span>' + timeStr + '</span>' +
          '</div>' +
          reviewNotesHtml +
        '</div>' +
        '<div class="tq-item-actions">' + actionBtns + '</div>' +
      '</div>';
    }).join("");
  }

  function restoreTaskDamageTypes(taskId) {
    suppressTaskSync = true;
    try {
      if (!TaskQueue.restoreDamageTypesToState(taskId, State)) {
        var task = TaskQueue.tasks.find(function (t) { return t.id === taskId; });
        if (task && (!task.damageTypes || task.damageTypes.length === 0)) {
          TaskQueue.updateTask(taskId, { damageTypes: JSON.parse(JSON.stringify(State.damageTypes)) });
        }
      }
    } finally {
      suppressTaskSync = false;
    }
  }

  function handleTaskAction(taskId, action) {
    if (!taskId) return;
    switch (action) {
      case "goto":
        var task = TaskQueue.tasks.find(function (t) { return t.id === taskId; });
        if (!task) return;
        TaskQueue.setActive(taskId);
        restoreTaskDamageTypes(taskId);
        if (task.pageId) {
          TaskQueue.syncToPage(taskId, State);
          State.switchPage(task.pageId);
        }
        renderTaskQueueList();
        updateTaskQueueStats();
        updateCurrentTaskIndicator();
        showToast("已切换到任务：" + (task ? task.pageName : ""), "info");
        break;
      case "complete":
        TaskQueue.completeTask(taskId);
        renderTaskQueueList();
        updateTaskQueueStats();
        showToast("任务已标记完成", "success");
        var advanced = TaskQueue.advanceToNext();
        if (advanced) {
          var nextTask = TaskQueue.activeTask;
          if (nextTask) {
            restoreTaskDamageTypes(nextTask.id);
            if (nextTask.pageId) {
              TaskQueue.syncToPage(nextTask.id, State);
              State.switchPage(nextTask.pageId);
            }
          }
          showToast("自动进入下一任务：" + (nextTask ? nextTask.pageName : ""), "info");
        }
        renderTaskQueueList();
        updateCurrentTaskIndicator();
        break;
      case "reopen":
        TaskQueue.reopenTask(taskId);
        renderTaskQueueList();
        updateTaskQueueStats();
        updateCurrentTaskIndicator();
        showToast("任务已重新开始", "info");
        break;
      case "delete":
        if (!confirm("确认删除此任务？")) return;
        TaskQueue.removeTask(taskId);
        renderTaskQueueList();
        updateTaskQueueStats();
        updateCurrentTaskIndicator();
        showToast("任务已删除", "info");
        break;
      case "edit":
        openTaskEditModal(taskId);
        break;
    }
  }

  function handleConfirmTaskCreate() {
    var pageNameVal = taskPageName.value.trim();
    var priorityVal = taskPriority.value;
    var linkPageId = taskLinkPage.value;
    var imageFile = taskImageInput.files && taskImageInput.files[0];

    if (!pageNameVal && !linkPageId) {
      alert("请输入页面名称或关联已有页面。");
      return;
    }

    var currentTypes = State.damageTypes ? JSON.parse(JSON.stringify(State.damageTypes)) : [];

    if (linkPageId) {
      var page = State.pages.find(function (p) { return p.id === linkPageId; });
      if (page) {
        var task = TaskQueue.createTask({
          pageName: pageNameVal || page.name || page.fileName || "",
          priority: priorityVal,
          pageId: page.id,
          image: page.image || "",
          damageTypes: currentTypes,
          markers: page.markers ? JSON.parse(JSON.stringify(page.markers)) : [],
        });
        if (task) {
          if (TaskQueue.activeTaskId === task.id) {
            restoreTaskDamageTypes(task.id);
          }
          showToast("已从页面创建任务：" + (pageNameVal || task.pageName), "success");
        }
      }
    } else if (imageFile) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var task = TaskQueue.createTask({
          pageName: pageNameVal,
          priority: priorityVal,
          image: e.target.result,
          damageTypes: currentTypes,
          markers: [],
        });
        if (task) {
          var newPage = createPage({ dataUrl: e.target.result, fileName: pageNameVal + ".jpg" });
          State.addPages([newPage]);
          TaskQueue.updateTask(task.id, { pageId: newPage.id });
          restoreTaskDamageTypes(task.id);
          State.switchPage(newPage.id);
          renderTaskQueueList();
          updateTaskQueueStats();
          updateCurrentTaskIndicator();
          showToast("已创建任务并导入图片：" + pageNameVal, "success");
        }
      };
      reader.readAsDataURL(imageFile);
    } else {
      var task = TaskQueue.createTask({
        pageName: pageNameVal,
        priority: priorityVal,
        damageTypes: currentTypes,
        markers: [],
      });
      if (task) {
        if (TaskQueue.activeTaskId === task.id) {
          restoreTaskDamageTypes(task.id);
        }
        showToast("已创建任务：" + pageNameVal, "success");
      }
    }

    closeTaskCreateModal();
    renderTaskQueueList();
    updateTaskQueueStats();
    updateCurrentTaskIndicator();
  }

  function handleTaskExportAll() {
    openTaskExportModal();
  }

  function handleTaskClearDone() {
    var count = TaskQueue.clearCompleted();
    if (count > 0) {
      showToast("已清除 " + count + " 个已完成任务", "success");
      renderTaskQueueList();
      updateTaskQueueStats();
      updateCurrentTaskIndicator();
    } else {
      showToast("没有已完成的任务", "info");
    }
  }

  function openTaskEditModal(taskId) {
    var task = TaskQueue.tasks.find(function (t) { return t.id === taskId; });
    if (!task) return;

    currentEditingTaskId = taskId;
    currentEditPriority = task.priority;
    editTaskPageName.value = task.pageName || "";
    editTaskReviewNotes.value = task.reviewNotes || "";

    var priorityOptions = editTaskPriority.querySelectorAll(".tq-priority-option");
    priorityOptions.forEach(function (opt) {
      opt.classList.toggle("active", opt.dataset.priority === task.priority);
    });

    taskEditModal.style.display = "flex";
  }

  function closeTaskEditModal() {
    taskEditModal.style.display = "none";
    currentEditingTaskId = null;
  }

  function handleTaskEditPriority(priority) {
    currentEditPriority = priority;
    var priorityOptions = editTaskPriority.querySelectorAll(".tq-priority-option");
    priorityOptions.forEach(function (opt) {
      opt.classList.toggle("active", opt.dataset.priority === priority);
    });
  }

  function handleConfirmTaskEdit() {
    if (!currentEditingTaskId) return;

    var pageNameVal = editTaskPageName.value.trim();
    var reviewNotesVal = editTaskReviewNotes.value.trim();

    if (!pageNameVal) {
      alert("请输入页面名称。");
      return;
    }

    TaskQueue.updateTask(currentEditingTaskId, {
      pageName: pageNameVal,
      priority: currentEditPriority,
      reviewNotes: reviewNotesVal,
    });

    showToast("任务已更新", "success");
    closeTaskEditModal();
    renderTaskQueueList();
    updateTaskQueueStats();
    updateCurrentTaskIndicator();
  }

  function openTaskExportModal() {
    updateTaskExportSummary();
    taskExportModal.style.display = "flex";
  }

  function closeTaskExportModal() {
    taskExportModal.style.display = "none";
  }

  function updateTaskExportSummary() {
    var counts = TaskQueue.counts;
    var includeImages = tqExportIncludeImages.checked;

    var pendingChecked = exportPending.checked;
    var inProgressChecked = exportInProgress.checked;
    var completedChecked = exportCompleted.checked;

    var exportCount = 0;
    if (pendingChecked) exportCount += counts.pending;
    if (inProgressChecked) exportCount += counts.inProgress;
    if (completedChecked) exportCount += counts.completed;

    var totalImageSizeKB = 0;
    if (includeImages) {
      TaskQueue.tasks.forEach(function (t) {
        var statusMatch =
          (t.status === "pending" && pendingChecked) ||
          (t.status === "in_progress" && inProgressChecked) ||
          (t.status === "completed" && completedChecked);
        if (statusMatch && t.image) {
          totalImageSizeKB += Math.round((t.image.length * 3) / 4 / 1024);
        }
      });
    }

    tqExportSummary.innerHTML =
      '<div class="tq-export-summary-row"><span>待标注</span><strong>' + counts.pending + ' 个</strong></div>' +
      '<div class="tq-export-summary-row"><span>标注中</span><strong>' + counts.inProgress + ' 个</strong></div>' +
      '<div class="tq-export-summary-row"><span>已完成</span><strong>' + counts.completed + ' 个</strong></div>' +
      '<div class="tq-export-summary-row"><span>将导出</span><strong class="accent">' + exportCount + ' 个任务</strong></div>';

    if (includeImages && totalImageSizeKB > 0) {
      tqExportImageHint.textContent = "（约 " + formatFileSize(totalImageSizeKB * 1024) + "）";
      tqExportImageHint.style.display = "inline";
    } else {
      tqExportImageHint.textContent = "";
      tqExportImageHint.style.display = "none";
    }

    var estimatedSizeKB = exportCount * 2 + totalImageSizeKB;
    tqExportSizeEstimate.innerHTML =
      '<span class="export-size-label">预估文件大小</span>' +
      '<span class="export-size-value' + (estimatedSizeKB > 10240 ? " large" : "") + '">' + formatFileSize(estimatedSizeKB * 1024) + '</span>';
  }

  function handleTaskExportWithOptions() {
    var statuses = [];
    if (exportPending.checked) statuses.push("pending");
    if (exportInProgress.checked) statuses.push("in_progress");
    if (exportCompleted.checked) statuses.push("completed");

    if (statuses.length === 0) {
      showToast("请至少选择一种状态的任务进行导出", "warning");
      return;
    }

    var includeImages = tqExportIncludeImages.checked;
    var taskIds = TaskQueue.tasks
      .filter(function (t) { return statuses.includes(t.status); })
      .map(function (t) { return t.id; });

    if (taskIds.length === 0) {
      showToast("没有符合条件的任务可导出", "warning");
      return;
    }

    var data = TaskQueue.exportTasks(taskIds, includeImages);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "task_queue_export_" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1500);

    showToast("已导出 " + taskIds.length + " 个任务", "success");
    closeTaskExportModal();
  }

  function syncCurrentPageToTaskQueue() {
    var page = State.currentPage;
    if (!page) return;
    var pageData = {
      image: page.image,
      markers: page.markers,
      damageTypes: State.damageTypes,
      candidateSummary: page.candidateSummary || null,
    };
    TaskQueue.syncFromPage(page.id, pageData);
  }

  function syncDamageTypesToActiveTask() {
    TaskQueue.syncDamageTypesFromState(State);
  }

  function updateCurrentTaskIndicator() {
    if (!currentTaskIndicator) return;
    var activeTask = TaskQueue.activeTask;
    if (activeTask) {
      var statusText = activeTask.status === "pending" ? "待标注"
        : activeTask.status === "in_progress" ? "标注中"
        : "已完成";
      var priorityText = activeTask.priority === "high" ? "高优"
        : activeTask.priority === "low" ? "低优"
        : "";
      var displayText = priorityText ? priorityText + " · " : "";
      displayText += statusText + " · " + (activeTask.pageName || "未命名");
      currentTaskIndicator.textContent = displayText;
      currentTaskIndicator.style.display = "inline-flex";
    } else {
      currentTaskIndicator.style.display = "none";
    }
  }

  function bindEvents() {
    imageInput.addEventListener("change", () => {
      handleFiles(imageInput.files);
    });

    configBtn.addEventListener("click", () => {
      Render.openTypeConfig();
    });

    const { viewerViewport } = Render.Doms;
    const { stage } = Render.Doms;

    if (viewerViewport) {
      viewerViewport.addEventListener("click", handleStageClick);
    }
    if (stage) {
      stage.addEventListener("click", handleStageClick);
    }

    modeSwitch.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-mode]");
      if (!btn) return;
      setMode(btn.dataset.mode);
    });

    function bindDragEvents(dragOverlay) {
      if (!dragOverlay) return;
      dragOverlay.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        startDrag(event.clientX, event.clientY);
      });

      dragOverlay.addEventListener("touchstart", (event) => {
        if (event.touches.length !== 1) return;
        event.preventDefault();
        const touch = event.touches[0];
        startDrag(touch.clientX, touch.clientY);
      }, { passive: false });
    }

    bindDragEvents(Render.Doms.dragOverlay);
    bindDragEvents(Render.Doms.dragOverlaySimple);

    document.addEventListener("mousemove", (event) => {
      if (dragState) {
        event.preventDefault();
        moveDrag(event.clientX, event.clientY);
      }
    });

    document.addEventListener("mouseup", () => {
      if (dragState) endDrag();
    });

    document.addEventListener("touchmove", (event) => {
      if (!dragState) return;
      event.preventDefault();
      const touch = event.touches[0];
      moveDrag(touch.clientX, touch.clientY);
    }, { passive: false });

    document.addEventListener("touchend", () => {
      if (dragState) endDrag();
    });

    document.addEventListener("touchcancel", () => {
      cancelDrag();
    });

    reviewBtn.addEventListener("click", handleGoReview);
    diffBtn.addEventListener("click", handleGoDiff);
    exportBtn.addEventListener("click", handleExport);
    importBtn.addEventListener("click", function () {
      openImportModal();
    });
    importFileInput.addEventListener("change", function () {
      if (importFileInput.files && importFileInput.files.length > 0) {
        handleImportFile(importFileInput.files[0]);
      }
    });
    importDropZoneBrowse.addEventListener("click", function (e) {
      e.stopPropagation();
      importFileInput.click();
    });
    importDropZone.addEventListener("click", function () {
      importFileInput.click();
    });
    importDropZone.addEventListener("dragenter", function (e) {
      e.preventDefault();
      e.stopPropagation();
      importDropZone.classList.add("drag-over");
    });
    importDropZone.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.stopPropagation();
    });
    importDropZone.addEventListener("dragleave", function (e) {
      e.preventDefault();
      e.stopPropagation();
      importDropZone.classList.remove("drag-over");
    });
    importDropZone.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      importDropZone.classList.remove("drag-over");
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        var file = files[0];
        if (file.name && file.name.endsWith(".json")) {
          importDropZone.classList.add("has-file");
          handleImportFile(file);
        } else {
          showImportError("不支持的文件类型", "请拖入 .json 格式的工作包文件。");
        }
      }
    });
    closeImportBtn.addEventListener("click", closeImportModal);
    cancelImportBtn.addEventListener("click", closeImportModal);
    confirmImportBtn.addEventListener("click", handleConfirmImport);
    importModal.addEventListener("click", function (e) {
      if (e.target === importModal) closeImportModal();
    });
    clearBtn.addEventListener("click", handleClearCurrent);
    clearAllBtn.addEventListener("click", handleClearAll);

    document.addEventListener("keydown", handleKeyboard);

    State.subscribe(() => {
      cancelDrag();
      Render.refresh();
    });

    State.subscribe((state) => {
      setTimeout(() => {
        if (Render.viewerMode && Render.imageViewer && Render.imageViewer.imageLoaded) {
          Render.imageViewer.fitToViewport();
        }
      }, 50);
    });

    const dropZone = document.body;
    ;['dragenter', 'dragover'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
        }
      });
    });
    dropZone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        var droppedFiles = Array.from(e.dataTransfer.files);
        var jsonFiles = droppedFiles.filter(function (f) {
          return f.name && f.name.endsWith('.json');
        });
        var imageFiles = droppedFiles.filter(function (f) {
          return f.type.startsWith('image/');
        });
        if (jsonFiles.length > 0 && imageFiles.length === 0) {
          openImportModal();
          handleImportFile(jsonFiles[0]);
        } else {
          handleFiles(e.dataTransfer.files);
        }
      }
    });

    exportIncludeImages.addEventListener("change", updateExportSummary);

    if (candidateSensitivity) {
      candidateSensitivity.addEventListener("input", updateSensitivityDisplay);
    }

    if (confidenceThreshold) {
      confidenceThreshold.addEventListener("input", updateConfidenceThresholdDisplay);
    }

    if (runDetectBtn) {
      runDetectBtn.addEventListener("click", runCandidateDetection);
    }

    if (acceptAllBtn) {
      acceptAllBtn.addEventListener("click", acceptAllPendingCandidates);
    }

    if (ignoreAllBtn) {
      ignoreAllBtn.addEventListener("click", ignoreAllPendingCandidates);
    }

    if (acceptByConfidenceBtn) {
      acceptByConfidenceBtn.addEventListener("click", acceptByConfidenceCandidates);
    }

    if (applyAcceptedBtn) {
      applyAcceptedBtn.addEventListener("click", applyAcceptedCandidates);
    }

    if (candidateList) {
      candidateList.addEventListener("click", handleCandidateListClick);
    }

    if (candidateFilterTabs) {
      candidateFilterTabs.addEventListener("click", (e) => {
        const tab = e.target.closest("[data-filter]");
        if (tab) {
          setCandidateFilter(tab.dataset.filter);
        }
      });
    }

    const candidateToggleBtn = document.getElementById("candidateToggleBtn");
    if (candidateToggleBtn) {
      candidateToggleBtn.addEventListener("click", toggleCandidates);
    }

    if (calibrationBtn) {
      calibrationBtn.addEventListener("click", openCalibrationModal);
    }
    if (closeCalibrationBtn) {
      closeCalibrationBtn.addEventListener("click", closeCalibrationModal);
    }
    if (closeCalibrationFooterBtn) {
      closeCalibrationFooterBtn.addEventListener("click", closeCalibrationModal);
    }
    if (calibrationModal) {
      calibrationModal.addEventListener("click", function (e) {
        if (e.target === calibrationModal) closeCalibrationModal();
      });
    }
    if (calibSourcePage) {
      calibSourcePage.addEventListener("change", function () {
        if (CalibrationUI) CalibrationUI.setSourcePage(calibSourcePage.value);
      });
    }
    if (calibTargetPage) {
      calibTargetPage.addEventListener("change", function () {
        if (CalibrationUI) CalibrationUI.setTargetPage(calibTargetPage.value);
      });
    }

    document.querySelectorAll(".calib-pick-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var parts = btn.dataset.pick.split("-");
        if (parts.length === 2) {
          handleCalibPick(parts[0], parseInt(parts[1], 10));
        }
      });
    });

    if (calibGenerateBtn) {
      calibGenerateBtn.addEventListener("click", handleCalibGenerate);
    }
    if (calibResetBtn) {
      calibResetBtn.addEventListener("click", handleCalibReset);
    }
    if (migrAcceptAllBtn) {
      migrAcceptAllBtn.addEventListener("click", handleMigrAcceptAll);
    }
    if (migrRejectAllBtn) {
      migrRejectAllBtn.addEventListener("click", handleMigrRejectAll);
    }
    if (migrApplyBtn) {
      migrApplyBtn.addEventListener("click", handleMigrApply);
    }
    if (migrationList) {
      migrationList.addEventListener("click", function (e) {
        var actionBtn = e.target.closest("[data-migr-action]");
        if (actionBtn) {
          e.stopPropagation();
          var id = actionBtn.dataset.migrId;
          var action = actionBtn.dataset.migrAction;
          handleMigrationAction(id, action);
        }
      });
      migrationList.addEventListener("change", function (e) {
        var select = e.target.closest("[data-migr-type-id]");
        if (select && CalibrationUI) {
          CalibrationUI.modifyCandidateType(select.dataset.migrTypeId, select.value);
          updateMigrationUI();
          Render.refresh();
        }
      });
    }

    State.subscribe(() => {
      handlePageChange();
    });

    if (taskQueueBtn) {
      taskQueueBtn.addEventListener("click", openTaskQueueModal);
    }
    if (closeTaskQueueBtn) {
      closeTaskQueueBtn.addEventListener("click", closeTaskQueueModal);
    }
    if (closeTaskQueueFooterBtn) {
      closeTaskQueueFooterBtn.addEventListener("click", closeTaskQueueModal);
    }
    if (taskQueueModal) {
      taskQueueModal.addEventListener("click", function (e) {
        if (e.target === taskQueueModal) closeTaskQueueModal();
      });
    }
    if (tqSearch) {
      tqSearch.addEventListener("input", renderTaskQueueList);
    }
    if (tqFilter) {
      tqFilter.addEventListener("change", renderTaskQueueList);
    }
    if (tqCreateBtn) {
      tqCreateBtn.addEventListener("click", openTaskCreateModal);
    }
    if (tqList) {
      tqList.addEventListener("click", function (e) {
        var actionBtn = e.target.closest("[data-tq-action]");
        if (actionBtn) {
          e.stopPropagation();
          handleTaskAction(actionBtn.dataset.tqId, actionBtn.dataset.tqAction);
          return;
        }
        var item = e.target.closest("[data-tq-task]");
        if (item) {
          handleTaskAction(item.dataset.tqTask, "goto");
        }
      });
    }
    if (tqExportAllBtn) {
      tqExportAllBtn.addEventListener("click", handleTaskExportAll);
    }
    if (tqClearDoneBtn) {
      tqClearDoneBtn.addEventListener("click", handleTaskClearDone);
    }
    if (closeTaskCreateBtn) {
      closeTaskCreateBtn.addEventListener("click", closeTaskCreateModal);
    }
    if (cancelTaskCreateBtn) {
      cancelTaskCreateBtn.addEventListener("click", closeTaskCreateModal);
    }
    if (confirmTaskCreateBtn) {
      confirmTaskCreateBtn.addEventListener("click", handleConfirmTaskCreate);
    }
    if (taskCreateModal) {
      taskCreateModal.addEventListener("click", function (e) {
        if (e.target === taskCreateModal) closeTaskCreateModal();
      });
    }

    if (closeTaskEditBtn) {
      closeTaskEditBtn.addEventListener("click", closeTaskEditModal);
    }
    if (cancelTaskEditBtn) {
      cancelTaskEditBtn.addEventListener("click", closeTaskEditModal);
    }
    if (confirmTaskEditBtn) {
      confirmTaskEditBtn.addEventListener("click", handleConfirmTaskEdit);
    }
    if (taskEditModal) {
      taskEditModal.addEventListener("click", function (e) {
        if (e.target === taskEditModal) closeTaskEditModal();
      });
    }
    if (editTaskPriority) {
      editTaskPriority.addEventListener("click", function (e) {
        var option = e.target.closest("[data-priority]");
        if (option) {
          handleTaskEditPriority(option.dataset.priority);
        }
      });
    }

    if (closeTaskExportBtn) {
      closeTaskExportBtn.addEventListener("click", closeTaskExportModal);
    }
    if (cancelTaskExportBtn) {
      cancelTaskExportBtn.addEventListener("click", closeTaskExportModal);
    }
    if (confirmTaskExportBtn) {
      confirmTaskExportBtn.addEventListener("click", handleTaskExportWithOptions);
    }
    if (taskExportModal) {
      taskExportModal.addEventListener("click", function (e) {
        if (e.target === taskExportModal) closeTaskExportModal();
      });
    }
    if (exportPending) {
      exportPending.addEventListener("change", updateTaskExportSummary);
    }
    if (exportInProgress) {
      exportInProgress.addEventListener("change", updateTaskExportSummary);
    }
    if (exportCompleted) {
      exportCompleted.addEventListener("change", updateTaskExportSummary);
    }
    if (tqExportIncludeImages) {
      tqExportIncludeImages.addEventListener("change", updateTaskExportSummary);
    }

    State.subscribe(function () {
      if (suppressTaskSync) return;
      syncCurrentPageToTaskQueue();
      syncDamageTypesToActiveTask();
    });
  }

  function bootstrap() {
    State.init();
    if (TaskQueue) {
      TaskQueue.init();
      TaskQueue.subscribe(function () {
        updateCurrentTaskIndicator();
        Render.refresh();
      });
      var activeTask = TaskQueue.activeTask;
      if (activeTask) {
        restoreTaskDamageTypes(activeTask.id);
      }
    }
    Render.init();
    if (CandidateManager) {
      CandidateManager.init();
      CandidateManager.subscribe(function () {
        if (State.currentPage) {
          var stats = CandidateManager.getStats();
          if (stats.total > 0) {
            State.updateCandidateSummary(State.currentPage.id, stats);
          }
        }
        Render.refresh();
      });
    }
    if (CalibrationUI) {
      CalibrationUI.init();
    }
    bindEvents();
    setMode("point");
    updateSensitivityDisplay();
    updateConfidenceThresholdDisplay();
    updateCurrentTaskIndicator();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
