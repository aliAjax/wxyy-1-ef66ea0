(function (global) {
  var State = global.VolumeState;
  var CalibrationUI = global.CalibrationUI;

  var Doms = {
    sourcePageSelect: null,
    targetPageSelect: null,
    sourceImage: null,
    targetImage: null,
    sourceCalibLayer: null,
    targetCalibLayer: null,
    sourceMarkersLayer: null,
    targetMarkersLayer: null,
    sourceMigrationLayer: null,
    targetMigrationLayer: null,
    generateBtn: null,
    resetBtn: null,
    calibResult: null,
    migrationSection: null,
    migrPending: null,
    migrAccepted: null,
    migrRejected: null,
    migrAcceptAllBtn: null,
    migrRejectAllBtn: null,
    migrApplyBtn: null,
    migrationList: null,
    toastContainer: null
  };

  var srcCoordEls = [];
  var dstCoordEls = [];

  function initDoms() {
    Doms.sourcePageSelect = document.getElementById("sourcePageSelect");
    Doms.targetPageSelect = document.getElementById("targetPageSelect");
    Doms.sourceImage = document.getElementById("sourceImage");
    Doms.targetImage = document.getElementById("targetImage");
    Doms.sourceCalibLayer = document.getElementById("sourceCalibLayer");
    Doms.targetCalibLayer = document.getElementById("targetCalibLayer");
    Doms.sourceMarkersLayer = document.getElementById("sourceMarkersLayer");
    Doms.targetMarkersLayer = document.getElementById("targetMarkersLayer");
    Doms.sourceMigrationLayer = document.getElementById("sourceMigrationLayer");
    Doms.targetMigrationLayer = document.getElementById("targetMigrationLayer");
    Doms.generateBtn = document.getElementById("calibGenerateBtn");
    Doms.resetBtn = document.getElementById("calibResetBtn");
    Doms.calibResult = document.getElementById("calibResult");
    Doms.migrationSection = document.getElementById("calibMigrationSection");
    Doms.migrPending = document.getElementById("migrPending");
    Doms.migrAccepted = document.getElementById("migrAccepted");
    Doms.migrRejected = document.getElementById("migrRejected");
    Doms.migrAcceptAllBtn = document.getElementById("migrAcceptAllBtn");
    Doms.migrRejectAllBtn = document.getElementById("migrRejectAllBtn");
    Doms.migrApplyBtn = document.getElementById("migrApplyBtn");
    Doms.migrationList = document.getElementById("migrationList");
    Doms.toastContainer = document.getElementById("toastContainer");

    for (var i = 0; i < 4; i++) {
      srcCoordEls.push(document.getElementById("calibSrc" + i));
      dstCoordEls.push(document.getElementById("calibDst" + i));
    }
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showToast(message, type, duration) {
    if (!Doms.toastContainer) return;
    type = type || "info";
    duration = duration || 3000;
    var toast = document.createElement("div");
    toast.className = "toast toast-" + type;
    toast.innerHTML = '<span class="toast-icon">' +
      (type === "success" ? "✓" : type === "error" ? "✕" : type === "warning" ? "⚠" : "ℹ") +
      "</span><span class=\"toast-message\">" + escapeHtml(message) + "</span>";
    Doms.toastContainer.appendChild(toast);
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

  function populatePageSelects() {
    var pages = State.pages;
    var calData = CalibrationUI.getCalibration();

    var sourceVal = calData.sourcePageId || "";
    var targetVal = calData.targetPageId || "";

    var options = '<option value="">-- 选择页面 --</option>';
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i];
      var name = p.name || p.fileName || ("第 " + (i + 1) + " 页");
      options += '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(name) + '</option>';
    }

    if (Doms.sourcePageSelect) {
      Doms.sourcePageSelect.innerHTML = options;
      Doms.sourcePageSelect.value = sourceVal;
    }
    if (Doms.targetPageSelect) {
      Doms.targetPageSelect.innerHTML = options;
      Doms.targetPageSelect.value = targetVal;
    }
  }

  function autoSuggestPages() {
    var calData = CalibrationUI.getCalibration();
    if (calData.sourcePageId && calData.targetPageId) return;

    var pages = State.pages;
    if (pages.length < 2) return;

    var currentIdx = State.currentIndex;
    var srcIdx = currentIdx > 0 ? currentIdx - 1 : pages.length - 1;
    var tgtIdx = currentIdx;

    if (!calData.sourcePageId) {
      CalibrationUI.setSourcePage(pages[srcIdx].id);
    }
    if (!calData.targetPageId) {
      CalibrationUI.setTargetPage(pages[tgtIdx].id);
    }
  }

  function loadSourceImage() {
    var calData = CalibrationUI.getCalibration();
    if (!Doms.sourceImage) return;
    if (!calData.sourcePageId) {
      Doms.sourceImage.removeAttribute("src");
      Doms.sourceImage.style.display = "none";
      return;
    }
    var page = State.pages.find(function (p) { return p.id === calData.sourcePageId; });
    if (page && page.image) {
      Doms.sourceImage.src = page.image;
      Doms.sourceImage.style.display = "block";
    } else {
      Doms.sourceImage.removeAttribute("src");
      Doms.sourceImage.style.display = "none";
    }
  }

  function loadTargetImage() {
    var calData = CalibrationUI.getCalibration();
    if (!Doms.targetImage) return;
    if (!calData.targetPageId) {
      Doms.targetImage.removeAttribute("src");
      Doms.targetImage.style.display = "none";
      return;
    }
    var page = State.pages.find(function (p) { return p.id === calData.targetPageId; });
    if (page && page.image) {
      Doms.targetImage.src = page.image;
      Doms.targetImage.style.display = "block";
    } else {
      Doms.targetImage.removeAttribute("src");
      Doms.targetImage.style.display = "none";
    }
  }

  function updateCoordDisplays() {
    var calData = CalibrationUI.getCalibration();
    if (!calData) return;

    for (var i = 0; i < 4; i++) {
      if (srcCoordEls[i]) {
        var sp = calData.sourcePoints[i];
        srcCoordEls[i].textContent = sp ? ("(" + sp.x.toFixed(2) + ", " + sp.y.toFixed(2) + ")") : "未选";
      }
      if (dstCoordEls[i]) {
        var tp = calData.targetPoints[i];
        dstCoordEls[i].textContent = tp ? ("(" + tp.x.toFixed(2) + ", " + tp.y.toFixed(2) + ")") : "未选";
      }
    }
  }

  function renderCalibPointsOnLayer(layer, points, side) {
    if (!layer) return;
    var html = "";
    var picking = CalibrationUI.getPickingInfo();

    for (var i = 0; i < points.length; i++) {
      var pt = points[i];
      if (!pt) continue;
      var highlight = (picking && picking.side === side && picking.index === i) ? " active" : "";
      var label = side === "source" ? "S" + (i + 1) : "T" + (i + 1);
      var cls = side === "source" ? "source" : "target";
      html += '<div class="calib-point ' + cls + highlight + '" data-calib-side="' + side + '" data-calib-index="' + i + '" style="left:' + pt.x + '%;top:' + pt.y + '%;">' +
        '<span class="calib-point-label">' + label + '</span></div>';
    }
    layer.innerHTML = html;
  }

  function renderCalibPoints() {
    var calData = CalibrationUI.getCalibration();
    if (!calData) {
      if (Doms.sourceCalibLayer) Doms.sourceCalibLayer.innerHTML = "";
      if (Doms.targetCalibLayer) Doms.targetCalibLayer.innerHTML = "";
      return;
    }
    renderCalibPointsOnLayer(Doms.sourceCalibLayer, calData.sourcePoints, "source");
    renderCalibPointsOnLayer(Doms.targetCalibLayer, calData.targetPoints, "target");
  }

  function getColorForMarker(marker) {
    if (marker && marker.typeId) {
      var t = State.findTypeById(marker.typeId);
      if (t) return t.color;
    }
    var byName = marker && marker.type ? State.findTypeByName(marker.type) : null;
    if (byName) return byName.color;
    var fallback = State.damageTypes && State.damageTypes[0];
    return fallback ? fallback.color : "#9d3f2f";
  }

  function renderMarkersOnLayer(layer, markers) {
    if (!layer) return;
    if (!markers || markers.length === 0) {
      layer.innerHTML = "";
      return;
    }
    var html = "";
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var color = getColorForMarker(m);
      var typeInfo = State.findTypeById(m.typeId) || { name: m.type || "未知" };
      var title = (m.mode === "region" ? "[区域] " : "") + typeInfo.name + (m.note ? "：" + m.note : "");
      var migrCls = m.migrated ? " migrated" : "";

      if (m.mode === "region" && m.width && m.height) {
        html += '<span class="region-marker' + migrCls + '" title="' + escapeHtml(title) + '" style="left:' + m.x + '%;top:' + m.y + '%;width:' + m.width + '%;height:' + m.height + '%;border-color:' + color + ';background:' + color + '22;">' +
          '<span class="region-label" style="background:' + color + ';">' + escapeHtml(typeInfo.name) + '</span></span>';
      } else {
        html += '<span class="marker' + migrCls + '" title="' + escapeHtml(title) + '" style="left:' + m.x + '%;top:' + m.y + '%;background:' + color + ';"></span>';
      }
    }
    layer.innerHTML = html;
  }

  function renderSourceMarkers() {
    var calData = CalibrationUI.getCalibration();
    if (!calData || !calData.sourcePageId) {
      if (Doms.sourceMarkersLayer) Doms.sourceMarkersLayer.innerHTML = "";
      return;
    }
    var page = State.pages.find(function (p) { return p.id === calData.sourcePageId; });
    renderMarkersOnLayer(Doms.sourceMarkersLayer, page ? page.markers : []);
  }

  function renderMigrationCandidatesOnTarget() {
    var layer = Doms.targetMigrationLayer;
    if (!layer) return;
    var candidates = CalibrationUI.getMigrationCandidates();
    if (!candidates || candidates.length === 0) {
      layer.innerHTML = "";
      return;
    }
    var html = "";
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var status = c.status || "pending";
      var typeInfo = State.findTypeById(c.typeId) || { name: c.type || "未知" };
      var label = "迁移:" + typeInfo.name;

      if (c.mode === "region" && c.width && c.height) {
        html += '<div class="migration-candidate ' + status + '" data-migration-id="' + c.id + '" style="left:' + c.x + '%;top:' + c.y + '%;width:' + c.width + '%;height:' + c.height + '%;">' +
          '<span class="migr-badge">' + escapeHtml(label) + '</span></div>';
      } else {
        html += '<div class="migration-candidate ' + status + ' point" data-migration-id="' + c.id + '" style="left:' + c.x + '%;top:' + c.y + '%;"></div>';
      }
    }
    layer.innerHTML = html;
  }

  function renderCalibResult() {
    if (!Doms.calibResult) return;
    var qualityInfo = CalibrationUI.getQualityInfo();
    if (!qualityInfo || !qualityInfo.quality) {
      Doms.calibResult.innerHTML = "";
      return;
    }

    var q = qualityInfo.quality;
    var r = qualityInfo.residual;
    var t = qualityInfo.transformType;
    var v = qualityInfo.validation;

    var qualityColor = q.level === "excellent" ? "#4caf50" : q.level === "good" ? "#8bc34a" : q.level === "acceptable" ? "#ff9800" : "#f44336";
    var typeLabel = t === "homography" ? "单应性变换" : "仿射变换";
    var fallbackNote = qualityInfo.quality && qualityInfo.quality.fallback ? " (回退)" : "";

    var html = '<div class="calib-result-summary">' +
      '<span class="calib-quality-badge" style="background:' + qualityColor + ';">' + escapeHtml(q.label) + '</span>' +
      '<span class="calib-transform-type">' + escapeHtml(typeLabel) + fallbackNote + '</span>' +
      "</div>";

    if (r) {
      html += '<div class="calib-result-details">' +
        "<div><strong>RMSE:</strong> " + r.rmse + "%</div>" +
        "<div><strong>最大误差:</strong> " + r.maxError + "%</div>" +
        "<div><strong>校准点数:</strong> " + (r.pointCount || 0) + "</div>" +
        "</div>";
    }

    if (v && v.issues && v.issues.length > 0) {
      html += '<div class="calib-result-warnings">';
      for (var i = 0; i < v.issues.length; i++) {
        html += "<div>⚠ " + escapeHtml(v.issues[i]) + "</div>";
      }
      html += "</div>";
    }

    Doms.calibResult.innerHTML = html;
  }

  function renderMigrationList() {
    if (!Doms.migrationList) return;
    var candidates = CalibrationUI.getMigrationCandidates();
    if (!candidates || candidates.length === 0) {
      Doms.migrationList.innerHTML = '<p style="color:var(--muted);text-align:center;padding:16px 8px;font-size:13px;">暂无迁移候选</p>';
      return;
    }

    var types = State.damageTypes;
    var html = "";

    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var status = c.status || "pending";
      var typeInfo = State.findTypeById(c.typeId) || { name: c.type || "未知" };
      var isRegion = c.mode === "region";

      var typeOptions = "";
      for (var j = 0; j < types.length; j++) {
        var selected = types[j].id === c.typeId ? " selected" : "";
        typeOptions += '<option value="' + escapeHtml(types[j].id) + '"' + selected + '>' + escapeHtml(types[j].name) + '</option>';
      }

      html += '<div class="migr-item ' + status + '" data-migration-id="' + c.id + '">' +
        '<div class="migr-item-info">' +
        '<span class="migr-item-name">' + escapeHtml(typeInfo.name) + '</span>' +
        (isRegion ? '<span class="migr-item-region">区域</span>' : '<span class="migr-item-point">点</span>') +
        '<span class="migr-item-coords">(' + c.x.toFixed(2) + ', ' + c.y.toFixed(2) + ')</span>' +
        "</div>" +
        '<div class="migr-item-type-select">' +
        '<select data-migr-type-for="' + c.id + '">' + typeOptions + '</select>' +
        "</div>" +
        '<div class="migr-item-actions">';

      if (status === "pending") {
        html += '<button class="migr-action-btn accept" data-action="accept" data-migr-id="' + c.id + '" title="接受">✓</button>' +
          '<button class="migr-action-btn reject" data-action="reject" data-migr-id="' + c.id + '" title="拒绝">✗</button>';
      } else if (status === "accepted") {
        html += '<button class="migr-action-btn reset" data-action="reset" data-migr-id="' + c.id + '" title="重置">↺</button>' +
          '<button class="migr-action-btn delete" data-action="delete" data-migr-id="' + c.id + '" title="删除">🗑</button>';
      } else if (status === "rejected") {
        html += '<button class="migr-action-btn reset" data-action="reset" data-migr-id="' + c.id + '" title="重置">↺</button>' +
          '<button class="migr-action-btn delete" data-action="delete" data-migr-id="' + c.id + '" title="删除">🗑</button>';
      }

      html += "</div></div>";
    }

    Doms.migrationList.innerHTML = html;
  }

  function updateMigrationStats() {
    var stats = CalibrationUI.getStats();
    if (Doms.migrPending) Doms.migrPending.textContent = stats.pending;
    if (Doms.migrAccepted) Doms.migrAccepted.textContent = stats.accepted;
    if (Doms.migrRejected) Doms.migrRejected.textContent = stats.rejected;

    if (Doms.migrationSection) {
      var candidates = CalibrationUI.getMigrationCandidates();
      Doms.migrationSection.style.display = (candidates && candidates.length > 0) ? "block" : "none";
    }

    if (Doms.migrApplyBtn) {
      Doms.migrApplyBtn.disabled = stats.accepted === 0;
    }
    if (Doms.migrAcceptAllBtn) {
      Doms.migrAcceptAllBtn.disabled = stats.pending === 0;
    }
    if (Doms.migrRejectAllBtn) {
      Doms.migrRejectAllBtn.disabled = stats.pending === 0;
    }
  }

  function updateStepIndicator() {
    var calData = CalibrationUI.getCalibration();
    if (!calData) return;
    var steps = document.querySelectorAll(".calib-step");
    if (!steps || steps.length === 0) return;

    var currentStep = 1;
    var pointProgress = CalibrationUI.getPointProgress();
    if (pointProgress.total >= 8) {
      currentStep = 2;
    }
    if (calData.transform && calData.migrationCandidates && calData.migrationCandidates.length > 0) {
      currentStep = 3;
    }

    steps.forEach(function (stepEl, index) {
      var stepNum = index + 1;
      stepEl.classList.remove("active", "done");
      if (stepNum < currentStep) {
        stepEl.classList.add("done");
      } else if (stepNum === currentStep) {
        stepEl.classList.add("active");
      }
    });
  }

  function refreshAll() {
    populatePageSelects();
    loadSourceImage();
    loadTargetImage();
    updateCoordDisplays();
    renderCalibPoints();
    renderSourceMarkers();
    renderMigrationCandidatesOnTarget();
    renderCalibResult();
    renderMigrationList();
    updateMigrationStats();
    updateStepIndicator();
  }

  function onSourcePageChange() {
    if (!Doms.sourcePageSelect) return;
    CalibrationUI.setSourcePage(Doms.sourcePageSelect.value);
    CalibrationUI.stopPicking();
  }

  function onTargetPageChange() {
    if (!Doms.targetPageSelect) return;
    CalibrationUI.setTargetPage(Doms.targetPageSelect.value);
    CalibrationUI.stopPicking();
  }

  function onPickButtonClick(e) {
    var btn = e.target.closest("[data-pick]");
    if (!btn) return;
    var parts = btn.dataset.pick.split("-");
    if (parts.length !== 2) return;
    var side = parts[0];
    var index = parseInt(parts[1], 10);
    if (isNaN(index) || index < 0 || index > 3) return;

    var picking = CalibrationUI.getPickingInfo();
    if (picking && picking.side === side && picking.index === index) {
      CalibrationUI.stopPicking();
    } else {
      CalibrationUI.startPicking(side, index);
    }
    renderCalibPoints();
    updatePickButtonStates();
  }

  function updatePickButtonStates() {
    var picking = CalibrationUI.getPickingInfo();
    var buttons = document.querySelectorAll("[data-pick]");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var parts = btn.dataset.pick.split("-");
      if (parts.length !== 2) continue;
      var isActive = picking && picking.side === parts[0] && picking.index === parseInt(parts[1], 10);
      if (isActive) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    }
  }

  function onImageClick(e) {
    var picking = CalibrationUI.getPickingInfo();
    if (!picking) return;

    var imageEl = null;

    if (picking.side === "source") {
      imageEl = Doms.sourceImage;
    } else {
      imageEl = Doms.targetImage;
    }

    if (!imageEl || !imageEl.src) return;

    var rect = imageEl.getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * 100;
    var y = ((e.clientY - rect.top) / rect.height) * 100;

    x = Math.max(0, Math.min(100, Number(x.toFixed(2))));
    y = Math.max(0, Math.min(100, Number(y.toFixed(2))));

    CalibrationUI.setCalibrationPoint(picking.side, picking.index, x, y);

    var nextIndex = -1;
    for (var i = picking.index + 1; i < 4; i++) {
      var calData = CalibrationUI.getCalibration();
      var pts = picking.side === "source" ? calData.sourcePoints : calData.targetPoints;
      if (!pts[i]) {
        nextIndex = i;
        break;
      }
    }

    if (nextIndex >= 0) {
      CalibrationUI.startPicking(picking.side, nextIndex);
    } else {
      CalibrationUI.stopPicking();
    }

    updateCoordDisplays();
    renderCalibPoints();
    updatePickButtonStates();
  }

  function onGenerate() {
    var result = CalibrationUI.computeAndGenerateCandidates();
    if (result.success) {
      showToast("变换计算成功，生成 " + result.count + " 个迁移候选" + (result.fallback ? "（已回退至仿射变换）" : ""), "success");
      renderCalibResult();
      renderMigrationList();
      updateMigrationStats();
      renderMigrationCandidatesOnTarget();
    } else {
      showToast(result.error || "计算变换失败", "error");
    }
  }

  function onReset() {
    if (CalibrationUI.getMigrationCandidates().length > 0) {
      if (!confirm("确认重置校准数据？当前迁移候选将被清除。")) return;
    }
    CalibrationUI.resetCalibration();
    autoSuggestPages();
    refreshAll();
    showToast("校准数据已重置", "info");
  }

  function onMigrationAction(e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.migrId;
    if (!id) return;

    var ok = false;
    if (action === "accept") {
      ok = CalibrationUI.acceptCandidate(id);
      if (ok) showToast("已接受候选", "success");
    } else if (action === "reject") {
      ok = CalibrationUI.rejectCandidate(id);
      if (ok) showToast("已拒绝候选", "info");
    } else if (action === "delete") {
      ok = CalibrationUI.deleteCandidate(id);
      if (ok) showToast("已删除候选", "info");
    } else if (action === "reset") {
      ok = CalibrationUI.resetCandidate(id);
      if (ok) showToast("已重置候选为待处理", "info");
    }

    if (ok) {
      renderMigrationList();
      updateMigrationStats();
      renderMigrationCandidatesOnTarget();
    }
  }

  function onMigrationTypeChange(e) {
    var select = e.target.closest("[data-migr-type-for]");
    if (!select) return;
    var id = select.dataset.migrTypeFor;
    var newTypeId = select.value;
    var ok = CalibrationUI.modifyCandidateType(id, newTypeId);
    if (ok) {
      renderMigrationList();
      renderMigrationCandidatesOnTarget();
    } else {
      showToast("修改类型失败", "error");
    }
  }

  function onAcceptAll() {
    var count = CalibrationUI.acceptAllPending();
    if (count > 0) {
      showToast("已接受全部 " + count + " 个待处理候选", "success");
    }
    renderMigrationList();
    updateMigrationStats();
    renderMigrationCandidatesOnTarget();
  }

  function onRejectAll() {
    var count = CalibrationUI.rejectAllPending();
    if (count > 0) {
      showToast("已拒绝全部 " + count + " 个待处理候选", "info");
    }
    renderMigrationList();
    updateMigrationStats();
    renderMigrationCandidatesOnTarget();
  }

  function onApplyAccepted() {
    var result = CalibrationUI.applyAccepted();
    if (result.added > 0) {
      showToast("已应用 " + result.added + " 个迁移标记到目标页面", "success");
    } else {
      showToast("没有可应用的已接受候选", "warning");
    }
    if (result.errors && result.errors.length > 0) {
      showToast(result.errors.length + " 个候选应用失败", "error");
    }
    renderMigrationList();
    updateMigrationStats();
    renderMigrationCandidatesOnTarget();
  }

  function bindEvents() {
    if (Doms.sourcePageSelect) {
      Doms.sourcePageSelect.addEventListener("change", onSourcePageChange);
    }
    if (Doms.targetPageSelect) {
      Doms.targetPageSelect.addEventListener("change", onTargetPageChange);
    }

    document.addEventListener("click", function (e) {
      onPickButtonClick(e);
    });

    if (Doms.sourceImage) {
      Doms.sourceImage.addEventListener("click", onImageClick);
    }
    if (Doms.targetImage) {
      Doms.targetImage.addEventListener("click", onImageClick);
    }

    if (Doms.generateBtn) {
      Doms.generateBtn.addEventListener("click", onGenerate);
    }
    if (Doms.resetBtn) {
      Doms.resetBtn.addEventListener("click", onReset);
    }

    if (Doms.migrationList) {
      Doms.migrationList.addEventListener("click", onMigrationAction);
      Doms.migrationList.addEventListener("change", onMigrationTypeChange);
    }

    if (Doms.migrAcceptAllBtn) {
      Doms.migrAcceptAllBtn.addEventListener("click", onAcceptAll);
    }
    if (Doms.migrRejectAllBtn) {
      Doms.migrRejectAllBtn.addEventListener("click", onRejectAll);
    }
    if (Doms.migrApplyBtn) {
      Doms.migrApplyBtn.addEventListener("click", onApplyAccepted);
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (CalibrationUI.isPicking()) {
          CalibrationUI.stopPicking();
          renderCalibPoints();
          updatePickButtonStates();
        }
      }
    });
  }

  function subscribeToState() {
    State.subscribe(function () {
      refreshAll();
    });

    CalibrationUI.subscribe(function () {
      refreshAll();
    });
  }

  function init() {
    State.init();
    CalibrationUI.init();
    initDoms();
    autoSuggestPages();
    bindEvents();
    subscribeToState();
    refreshAll();
    updatePickButtonStates();
  }

  global.CalibrationApp = {
    init: init,
    refresh: refreshAll
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
