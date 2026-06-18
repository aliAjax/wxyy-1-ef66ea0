(function (global) {
  var State = global.VolumeState;
  var Calibration = global.Calibration;

  var CALIB_KEY = "wxyy-1-calibration";
  var CALIB_HISTORY_KEY = "wxyy-1-calibration-history";

  var _pickingMode = false;
  var _pickingSide = null;
  var _pickingIndex = -1;
  var _calibrationData = null;
  var _calibrationHistory = [];
  var _currentStep = 0;

  var _listeners = new Set();

  function _notify() {
    _listeners.forEach(function (fn) {
      try { fn(_calibrationData); } catch (e) { console.error("校准UI监听回调异常", e); }
    });
  }

  function loadCalibration() {
    try {
      var raw = localStorage.getItem(CALIB_KEY);
      _calibrationData = raw ? JSON.parse(raw) : createDefaultCalibration();
    } catch (e) {
      _calibrationData = createDefaultCalibration();
    }
    try {
      var histRaw = localStorage.getItem(CALIB_HISTORY_KEY);
      _calibrationHistory = histRaw ? JSON.parse(histRaw) : [];
    } catch (e) {
      _calibrationHistory = [];
    }
  }

  function saveCalibration() {
    try {
      localStorage.setItem(CALIB_KEY, JSON.stringify(_calibrationData));
    } catch (e) {
      console.error("保存校准数据失败", e);
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(CALIB_HISTORY_KEY, JSON.stringify(_calibrationHistory));
    } catch (e) {
      console.error("保存校准历史失败", e);
    }
  }

  function createDefaultCalibration() {
    return {
      sourcePageId: null,
      targetPageId: null,
      sourcePoints: [null, null, null, null],
      targetPoints: [null, null, null, null],
      migrationCandidates: [],
      transform: null,
      transformType: null,
      quality: null,
      residual: null,
      validation: null
    };
  }

  function getCalibration() {
    return _calibrationData;
  }

  function getHistory() {
    return _calibrationHistory;
  }

  function resetCalibration() {
    _calibrationData = createDefaultCalibration();
    _currentStep = 0;
    saveCalibration();
    _notify();
  }

  function clearHistory() {
    _calibrationHistory = [];
    saveHistory();
    _notify();
  }

  function saveToHistory(label) {
    if (!_calibrationData) return;
    var entry = {
      id: crypto.randomUUID(),
      label: label || ("校准 " + (_calibrationHistory.length + 1)),
      sourcePageId: _calibrationData.sourcePageId,
      targetPageId: _calibrationData.targetPageId,
      sourcePoints: _calibrationData.sourcePoints.slice(),
      targetPoints: _calibrationData.targetPoints.slice(),
      transform: _calibrationData.transform,
      transformType: _calibrationData.transformType,
      quality: _calibrationData.quality,
      residual: _calibrationData.residual,
      migrationCandidateCount: (_calibrationData.migrationCandidates || []).length,
      createdAt: new Date().toISOString()
    };
    _calibrationHistory.unshift(entry);
    if (_calibrationHistory.length > 20) {
      _calibrationHistory = _calibrationHistory.slice(0, 20);
    }
    saveHistory();
    _notify();
    return entry;
  }

  function restoreFromHistory(historyId) {
    var entry = _calibrationHistory.find(function (h) { return h.id === historyId; });
    if (!entry) return false;
    _calibrationData = createDefaultCalibration();
    _calibrationData.sourcePageId = entry.sourcePageId;
    _calibrationData.targetPageId = entry.targetPageId;
    _calibrationData.sourcePoints = entry.sourcePoints.slice();
    _calibrationData.targetPoints = entry.targetPoints.slice();
    _calibrationData.transform = entry.transform;
    _calibrationData.transformType = entry.transformType;
    _calibrationData.quality = entry.quality;
    _calibrationData.residual = entry.residual;
    _currentStep = 3;
    saveCalibration();
    _notify();
    return true;
  }

  function deleteFromHistory(historyId) {
    var before = _calibrationHistory.length;
    _calibrationHistory = _calibrationHistory.filter(function (h) { return h.id !== historyId; });
    if (_calibrationHistory.length === before) return false;
    saveHistory();
    _notify();
    return true;
  }

  function getCurrentStep() {
    return _currentStep;
  }

  function setCurrentStep(step) {
    _currentStep = Math.max(0, Math.min(4, step));
  }

  function advanceStep() {
    if (_currentStep < 4) {
      _currentStep++;
    }
  }

  function startPicking(side, index) {
    if (side !== "source" && side !== "target") return;
    if (index < 0 || index > 3) return;
    _pickingMode = true;
    _pickingSide = side;
    _pickingIndex = index;
  }

  function stopPicking() {
    _pickingMode = false;
    _pickingSide = null;
    _pickingIndex = -1;
  }

  function isPicking() {
    return _pickingMode;
  }

  function getPickingInfo() {
    if (!_pickingMode) return null;
    return { side: _pickingSide, index: _pickingIndex };
  }

  function setCalibrationPoint(side, index, x, y) {
    if (!_calibrationData) return;
    if (side === "source") {
      _calibrationData.sourcePoints[index] = { x: x, y: y };
    } else if (side === "target") {
      _calibrationData.targetPoints[index] = { x: x, y: y };
    }
    saveCalibration();
    _notify();
  }

  function setSourcePage(pageId) {
    if (!_calibrationData) return;
    _calibrationData.sourcePageId = pageId;
    saveCalibration();
    _notify();
  }

  function setTargetPage(pageId) {
    if (!_calibrationData) return;
    _calibrationData.targetPageId = pageId;
    saveCalibration();
    _notify();
  }

  function allPointsSet() {
    if (!_calibrationData) return false;
    for (var i = 0; i < 4; i++) {
      if (!_calibrationData.sourcePoints[i] || !_calibrationData.targetPoints[i]) return false;
    }
    return true;
  }

  function getPointProgress() {
    if (!_calibrationData) return { source: 0, target: 0, total: 0 };
    var src = 0, dst = 0;
    for (var i = 0; i < 4; i++) {
      if (_calibrationData.sourcePoints[i]) src++;
      if (_calibrationData.targetPoints[i]) dst++;
    }
    return { source: src, target: dst, total: src + dst };
  }

  function computeAndGenerateCandidates() {
    if (!_calibrationData) return { success: false, error: "无校准数据" };
    if (!allPointsSet()) return { success: false, error: "请先在两张页面上各选取 4 个校准点" };
    if (!_calibrationData.sourcePageId || !_calibrationData.targetPageId) {
      return { success: false, error: "请先选择源页面和目标页面" };
    }

    var sourcePage = State.pages.find(function (p) { return p.id === _calibrationData.sourcePageId; });
    var targetPage = State.pages.find(function (p) { return p.id === _calibrationData.targetPageId; });
    if (!sourcePage) return { success: false, error: "源页面不存在" };
    if (!targetPage) return { success: false, error: "目标页面不存在" };
    if (sourcePage.markers.length === 0) return { success: false, error: "源页面没有标记可供迁移" };

    var validation = Calibration.validateCalibrationPoints(_calibrationData.sourcePoints, _calibrationData.targetPoints);
    var robustResidual = Calibration.computeRobustResidual(_calibrationData.sourcePoints, _calibrationData.targetPoints);
    var robustQuality = Calibration.computePenalizedQuality(robustResidual, validation);

    var result = Calibration.computeBestTransform(_calibrationData.sourcePoints, _calibrationData.targetPoints);
    if (!result) return { success: false, error: "坐标变换计算失败，请调整校准点位置避免共线" };

    var finalValidation = validation || result.validation;
    if (finalValidation && robustQuality.penalized && robustQuality.penalties && robustQuality.penalties.length > 0) {
      if (!finalValidation.issues) finalValidation.issues = [];
      robustQuality.penalties.forEach(function (p) {
        finalValidation.issues.push(p);
      });
    }
    if (!finalValidation.issues) finalValidation.issues = [];
    finalValidation.issues.push("质量评分基于距离一致性估计和校准点几何惩罚，避免四点拟合残差被低估");

    _calibrationData.transform = result.transform;
    _calibrationData.transformType = result.type;
    _calibrationData.quality = robustQuality || result.quality;
    _calibrationData.residual = robustResidual || result.residual;
    _calibrationData.rawQuality = result.quality;
    _calibrationData.rawResidual = result.residual;
    _calibrationData.qualityRobustEstimated = !!robustResidual;
    _calibrationData.validation = finalValidation;

    var candidates = Calibration.projectMarkers(result.transform, sourcePage.markers);
    if (candidates.length === 0) return { success: false, error: "所有标记投影后超出范围，无法生成候选" };

    candidates = candidates.filter(function (c) {
      return c.x >= -5 && c.x <= 105 && c.y >= -5 && c.y <= 105;
    });

    candidates.forEach(function (c) {
      c.sourcePageId = _calibrationData.sourcePageId;
      c.targetPageId = _calibrationData.targetPageId;
      c.transformType = result.type;
      if (result.fallback) c.transformFallback = true;
    });

    _calibrationData.migrationCandidates = candidates;
    _currentStep = 4;
    saveCalibration();
    _notify();

    var qualityInfo = robustQuality || result.quality || {};
    var qualityNote = qualityInfo.label ? "（变换质量：" + qualityInfo.label + "）" : "";

    return {
      success: true,
      count: candidates.length,
      quality: robustQuality || result.quality,
      residual: robustResidual || result.residual,
      rawQuality: result.quality,
      rawResidual: result.residual,
      qualityRobustEstimated: !!robustResidual,
      transformType: result.type,
      fallback: result.fallback || false,
      validation: finalValidation
    };
  }

  function getMigrationCandidates() {
    if (!_calibrationData) return [];
    return _calibrationData.migrationCandidates || [];
  }

  function getCandidatesByStatus(status) {
    return getMigrationCandidates().filter(function (c) { return c.status === status; });
  }

  function acceptCandidate(candidateId) {
    if (!_calibrationData) return false;
    var c = _calibrationData.migrationCandidates.find(function (c) { return c.id === candidateId; });
    if (!c || c.status !== "pending") return false;
    c.status = "accepted";
    saveCalibration();
    _notify();
    return true;
  }

  function rejectCandidate(candidateId) {
    if (!_calibrationData) return false;
    var c = _calibrationData.migrationCandidates.find(function (c) { return c.id === candidateId; });
    if (!c) return false;
    c.status = "rejected";
    saveCalibration();
    _notify();
    return true;
  }

  function deleteCandidate(candidateId) {
    if (!_calibrationData) return false;
    var before = _calibrationData.migrationCandidates.length;
    _calibrationData.migrationCandidates = _calibrationData.migrationCandidates.filter(function (c) {
      return c.id !== candidateId;
    });
    if (_calibrationData.migrationCandidates.length === before) return false;
    saveCalibration();
    _notify();
    return true;
  }

  function modifyCandidateType(candidateId, newTypeId) {
    if (!_calibrationData) return false;
    var c = _calibrationData.migrationCandidates.find(function (c) { return c.id === candidateId; });
    if (!c) return false;
    var typeInfo = State.findTypeById(newTypeId);
    if (!typeInfo) return false;
    c.typeId = newTypeId;
    c.type = typeInfo.name;
    saveCalibration();
    _notify();
    return true;
  }

  function modifyCandidateNote(candidateId, note) {
    if (!_calibrationData) return false;
    var c = _calibrationData.migrationCandidates.find(function (c) { return c.id === candidateId; });
    if (!c) return false;
    c.note = (note || "").trim();
    saveCalibration();
    _notify();
    return true;
  }

  function modifyCandidatePosition(candidateId, x, y) {
    if (!_calibrationData) return false;
    var c = _calibrationData.migrationCandidates.find(function (c) { return c.id === candidateId; });
    if (!c) return false;
    c.x = Number(Number(x).toFixed(2));
    c.y = Number(Number(y).toFixed(2));
    c.positionAdjusted = true;
    saveCalibration();
    _notify();
    return true;
  }

  function resetCandidate(candidateId) {
    if (!_calibrationData) return false;
    var c = _calibrationData.migrationCandidates.find(function (c) { return c.id === candidateId; });
    if (!c) return false;
    c.status = "pending";
    saveCalibration();
    _notify();
    return true;
  }

  function acceptAllPending() {
    if (!_calibrationData) return 0;
    var count = 0;
    _calibrationData.migrationCandidates.forEach(function (c) {
      if (c.status === "pending") {
        c.status = "accepted";
        count++;
      }
    });
    if (count > 0) {
      saveCalibration();
      _notify();
    }
    return count;
  }

  function rejectAllPending() {
    if (!_calibrationData) return 0;
    var count = 0;
    _calibrationData.migrationCandidates.forEach(function (c) {
      if (c.status === "pending") {
        c.status = "rejected";
        count++;
      }
    });
    if (count > 0) {
      saveCalibration();
      _notify();
    }
    return count;
  }

  function applyAccepted() {
    if (!_calibrationData) return { added: 0, errors: [] };
    var targetPage = State.pages.find(function (p) { return p.id === _calibrationData.targetPageId; });
    if (!targetPage) return { added: 0, errors: ["目标页面不存在"] };

    var accepted = _calibrationData.migrationCandidates.filter(function (c) {
      return c.status === "accepted";
    });
    if (accepted.length === 0) return { added: 0, errors: [] };

    var added = 0;
    var errors = [];

    var origPageId = State.currentPageId;
    State.switchPage(_calibrationData.targetPageId);

    accepted.forEach(function (c) {
      try {
        var markerData = {
          typeId: c.typeId,
          note: (c.note || "") + " [跨页迁移]",
          x: c.x,
          y: c.y
        };
        if (c.sourcePageId) markerData.migratedFrom = c.sourcePageId;
        if (c.sourceMarkerId) markerData.sourceMarkerId = c.sourceMarkerId;
        if (c.transformType) markerData.transformType = c.transformType;
        if (c.positionAdjusted) markerData.positionAdjusted = true;

        if (c.mode === "region" && c.width && c.height) {
          markerData.width = c.width;
          markerData.height = c.height;
          var result = State.addMigratedRegion(markerData);
          if (result) added++;
          else errors.push(c.id);
        } else {
          var result = State.addMigratedMarker(markerData);
          if (result) added++;
          else errors.push(c.id);
        }
      } catch (e) {
        errors.push(c.id);
      }
    });

    saveToHistory("迁移 " + added + " 条标记 → " + (targetPage.name || targetPage.fileName || "目标页"));

    if (added > 0) {
      var sessionData = getExportData();
      var session = {
        id: crypto.randomUUID(),
        label: "迁移 " + added + " 条标记 → " + (targetPage.name || targetPage.fileName || "目标页"),
        data: sessionData,
        migratedCount: added,
        sourcePageId: _calibrationData.sourcePageId,
        targetPageId: _calibrationData.targetPageId,
        createdAt: new Date().toISOString()
      };
      if (typeof State.addCalibrationSession === "function") {
        State.addCalibrationSession(session);
      }
    }

    _calibrationData.migrationCandidates = _calibrationData.migrationCandidates.filter(function (c) {
      return c.status !== "accepted";
    });
    saveCalibration();
    _notify();

    return { added: added, errors: errors };
  }

  function getStats() {
    if (!_calibrationData) return { pending: 0, accepted: 0, rejected: 0, total: 0 };
    var candidates = _calibrationData.migrationCandidates || [];
    var pending = 0, accepted = 0, rejected = 0;
    candidates.forEach(function (c) {
      if (c.status === "pending") pending++;
      else if (c.status === "accepted") accepted++;
      else if (c.status === "rejected") rejected++;
    });
    return { pending: pending, accepted: accepted, rejected: rejected, total: candidates.length };
  }

  function getQualityInfo() {
    if (!_calibrationData) return null;
    return {
      quality: _calibrationData.quality,
      residual: _calibrationData.residual,
      transformType: _calibrationData.transformType,
      validation: _calibrationData.validation
    };
  }

  function getExportData() {
    if (!_calibrationData) return null;
    return {
      sourcePageId: _calibrationData.sourcePageId,
      targetPageId: _calibrationData.targetPageId,
      sourcePoints: _calibrationData.sourcePoints ? _calibrationData.sourcePoints.slice() : [null, null, null, null],
      targetPoints: _calibrationData.targetPoints ? _calibrationData.targetPoints.slice() : [null, null, null, null],
      migrationCandidates: _calibrationData.migrationCandidates ? _calibrationData.migrationCandidates.map(function (c) {
        return Object.assign({}, c);
      }) : [],
      transform: _calibrationData.transform,
      transformType: _calibrationData.transformType,
      quality: _calibrationData.quality,
      residual: _calibrationData.residual,
      validation: _calibrationData.validation
    };
  }

  function restoreExportData(data) {
    if (!data) return false;
    _calibrationData = createDefaultCalibration();
    if (data.sourcePageId) _calibrationData.sourcePageId = data.sourcePageId;
    if (data.targetPageId) _calibrationData.targetPageId = data.targetPageId;
    if (data.sourcePoints) _calibrationData.sourcePoints = data.sourcePoints.slice();
    if (data.targetPoints) _calibrationData.targetPoints = data.targetPoints.slice();
    if (data.migrationCandidates && Array.isArray(data.migrationCandidates)) {
      _calibrationData.migrationCandidates = data.migrationCandidates.map(function (c) {
        return Object.assign({}, c);
      });
    }
    if (data.transform) _calibrationData.transform = data.transform;
    if (data.transformType) _calibrationData.transformType = data.transformType;
    if (data.quality) _calibrationData.quality = data.quality;
    if (data.residual) _calibrationData.residual = data.residual;
    if (data.validation) _calibrationData.validation = data.validation;
    saveCalibration();
    _notify();
    return true;
  }

  function getSessions() {
    try {
      var raw = localStorage.getItem("wxyy-1-calibration-sessions");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveSession(label) {
    if (!_calibrationData) return null;
    var sessions = getSessions();
    var entry = {
      id: crypto.randomUUID(),
      label: label || ("校准会话 " + (sessions.length + 1)),
      data: getExportData(),
      createdAt: new Date().toISOString()
    };
    sessions.unshift(entry);
    if (sessions.length > 10) sessions = sessions.slice(0, 10);
    try {
      localStorage.setItem("wxyy-1-calibration-sessions", JSON.stringify(sessions));
    } catch (e) {}
    return entry;
  }

  function restoreSession(sessionId) {
    var sessions = getSessions();
    var entry = sessions.find(function (s) { return s.id === sessionId; });
    if (!entry || !entry.data) return false;
    return restoreExportData(entry.data);
  }

  function deleteSession(sessionId) {
    var sessions = getSessions();
    var before = sessions.length;
    sessions = sessions.filter(function (s) { return s.id !== sessionId; });
    if (sessions.length === before) return false;
    try {
      localStorage.setItem("wxyy-1-calibration-sessions", JSON.stringify(sessions));
    } catch (e) {}
    return true;
  }

  function autoSuggestPages(pages, currentPageId) {
    var suggestion = Calibration.suggestAdjacentPages(pages, currentPageId);
    if (!suggestion) return;
    if (!_calibrationData.sourcePageId) {
      _calibrationData.sourcePageId = suggestion.sourcePageId;
    }
    if (!_calibrationData.targetPageId) {
      _calibrationData.targetPageId = suggestion.targetPageId;
    }
    saveCalibration();
    _notify();
  }

  function subscribe(fn) {
    if (typeof fn !== "function") return function () {};
    _listeners.add(fn);
    return function () { _listeners.delete(fn); };
  }

  function init() {
    loadCalibration();
  }

  function saveCalibrationPlan(name, description) {
    if (!_calibrationData) return { success: false, error: "无校准数据" };
    if (!allPointsSet()) return { success: false, error: "需先完成 4 对校准点" };
    if (!name || !String(name).trim()) return { success: false, error: "方案名称不能为空" };

    var sourcePage = State.pages.find(function (p) { return p.id === _calibrationData.sourcePageId; });
    var targetPage = State.pages.find(function (p) { return p.id === _calibrationData.targetPageId; });

    var sourceMarkerCount = sourcePage ? sourcePage.markers.length : 0;
    var sourceMarkerTypeCounts = {};
    if (sourcePage && sourcePage.markers) {
      sourcePage.markers.forEach(function (m) {
        var key = m.type || m.typeId || "未知类型";
        sourceMarkerTypeCounts[key] = (sourceMarkerTypeCounts[key] || 0) + 1;
      });
    }

    var robustResidual = Calibration.computeRobustResidual(_calibrationData.sourcePoints, _calibrationData.targetPoints);
    var validation = Calibration.validateCalibrationPoints(_calibrationData.sourcePoints, _calibrationData.targetPoints);
    var robustQuality = Calibration.computePenalizedQuality(robustResidual, validation);

    var planData = {
      name: name,
      description: description || "",
      sourcePageId: _calibrationData.sourcePageId,
      targetPageId: _calibrationData.targetPageId,
      sourcePageName: sourcePage ? (sourcePage.name || sourcePage.fileName || "") : "",
      targetPageName: targetPage ? (targetPage.name || targetPage.fileName || "") : "",
      sourcePoints: _calibrationData.sourcePoints,
      targetPoints: _calibrationData.targetPoints,
      transform: _calibrationData.transform,
      transformType: _calibrationData.transformType,
      quality: robustQuality || _calibrationData.quality,
      residual: robustResidual || _calibrationData.residual,
      rawQuality: _calibrationData.quality,
      rawResidual: _calibrationData.residual,
      qualityRobustEstimated: !!robustResidual,
      validation: validation,
      sourceMarkerCount: sourceMarkerCount,
      sourceMarkerTypeCounts: sourceMarkerTypeCounts,
    };

    var plan = State.addCalibrationPlan(planData);
    if (!plan) return { success: false, error: "保存方案失败" };
    return { success: true, plan: plan };
  }

  function getCalibrationPlans() {
    return State.getCalibrationPlans();
  }

  function deleteCalibrationPlan(planId) {
    return State.removeCalibrationPlan(planId);
  }

  function duplicateCalibrationPlan(planId, newName) {
    return State.duplicateCalibrationPlan(planId, newName);
  }

  function renameCalibrationPlan(planId, newName, newDescription) {
    if (!newName || !String(newName).trim()) return false;
    var updates = { name: String(newName).trim() };
    if (newDescription !== undefined) {
      updates.description = String(newDescription).trim();
    }
    return !!State.updateCalibrationPlan(planId, updates);
  }

  function previewPlanApplication(planId, sourcePageId, targetPageId) {
    var plan = State.getCalibrationPlanById(planId);
    if (!plan) return { success: false, error: "方案不存在" };

    var sourcePage = State.pages.find(function (p) { return p.id === sourcePageId; });
    var targetPage = State.pages.find(function (p) { return p.id === targetPageId; });

    if (!sourcePage) return { success: false, error: "源页面不存在" };
    if (!targetPage) return { success: false, error: "目标页面不存在" };
    if (!sourcePage.markers || sourcePage.markers.length === 0) {
      return { success: false, error: "源页面没有标记可供迁移" };
    }

    var validSrc = plan.sourcePoints.filter(function (p) { return p != null; }).length;
    var validDst = plan.targetPoints.filter(function (p) { return p != null; }).length;
    if (validSrc < 4 || validDst < 4) {
      return { success: false, error: "方案校准点不完整" };
    }

    var validation = Calibration.validateCalibrationPoints(plan.sourcePoints, plan.targetPoints);

    var robustResidual = Calibration.computeRobustResidual(plan.sourcePoints, plan.targetPoints);
    var robustQuality = Calibration.computePenalizedQuality(robustResidual, validation);

    var result = Calibration.computeBestTransform(plan.sourcePoints, plan.targetPoints);
    if (!result) return { success: false, error: "坐标变换计算失败" };

    var projectedMarkers = Calibration.projectMarkers(result.transform, sourcePage.markers);
    var inRangeMarkers = projectedMarkers.filter(function (c) {
      return c.x >= -5 && c.x <= 105 && c.y >= -5 && c.y <= 105;
    });

    var markerTypeCounts = {};
    inRangeMarkers.forEach(function (m) {
      var key = m.type || m.typeId || "未知类型";
      markerTypeCounts[key] = (markerTypeCounts[key] || 0) + 1;
    });

    var pointModeCount = inRangeMarkers.filter(function (m) { return m.mode !== "region"; }).length;
    var regionModeCount = inRangeMarkers.length - pointModeCount;

    var finalValidation = validation || result.validation;
    if (finalValidation && robustQuality.penalized && robustQuality.penalties && robustQuality.penalties.length > 0) {
      if (!finalValidation.issues) finalValidation.issues = [];
      robustQuality.penalties.forEach(function (p) {
        finalValidation.issues.push(p);
      });
    }
    if (!finalValidation.issues) finalValidation.issues = [];
    finalValidation.issues.push("质量评分基于距离一致性估计和校准点几何惩罚，避免四点拟合残差被低估");

    var displayResidual = robustResidual || result.residual;
    var displayQuality = robustQuality || result.quality;

    return {
      success: true,
      plan: plan,
      quality: displayQuality,
      residual: displayResidual,
      transformType: result.type,
      fallback: result.fallback || false,
      validation: finalValidation,
      rawResidual: result.residual,
      robustResidualUsed: !!robustResidual,
      totalProjected: projectedMarkers.length,
      inRangeCount: inRangeMarkers.length,
      outOfRangeCount: projectedMarkers.length - inRangeMarkers.length,
      pointModeCount: pointModeCount,
      regionModeCount: regionModeCount,
      markerTypeCounts: markerTypeCounts,
      sourcePage: { id: sourcePage.id, name: sourcePage.name || sourcePage.fileName || "", markerCount: sourcePage.markers.length },
      targetPage: { id: targetPage.id, name: targetPage.name || targetPage.fileName || "" },
    };
  }

  function loadCalibrationPlan(planId, sourcePageId, targetPageId) {
    var plan = State.getCalibrationPlanById(planId);
    if (!plan) return { success: false, error: "方案不存在" };

    _calibrationData = createDefaultCalibration();
    _calibrationData.sourcePageId = sourcePageId || plan.sourcePageId;
    _calibrationData.targetPageId = targetPageId || plan.targetPageId;
    _calibrationData.sourcePoints = plan.sourcePoints ? plan.sourcePoints.slice() : [null, null, null, null];
    _calibrationData.targetPoints = plan.targetPoints ? plan.targetPoints.slice() : [null, null, null, null];
    _currentStep = 2;
    saveCalibration();
    _notify();

    return {
      success: true,
      sourcePageId: _calibrationData.sourcePageId,
      targetPageId: _calibrationData.targetPageId,
    };
  }

  function applyCalibrationPlan(planId, options) {
    options = options || {};
    var sourcePageId = options.sourcePageId;
    var targetPageId = options.targetPageId;

    var loadResult = loadCalibrationPlan(planId, sourcePageId, targetPageId);
    if (!loadResult.success) return loadResult;

    var computeResult = computeAndGenerateCandidates();
    if (!computeResult.success) return computeResult;

    if (typeof State.recordPlanUsage === "function") {
      State.recordPlanUsage(planId);
    }

    return {
      success: true,
      count: computeResult.count,
      quality: computeResult.quality,
      residual: computeResult.residual,
      transformType: computeResult.transformType,
      fallback: computeResult.fallback || false,
      validation: computeResult.validation,
      planId: planId,
    };
  }

  function getPlanQualityBadgeClass(quality) {
    if (!quality || !quality.level) return "quality-bad";
    return "quality-" + quality.level;
  }

  var CalibrationUI = {
    init: init,
    getCalibration: getCalibration,
    resetCalibration: resetCalibration,
    startPicking: startPicking,
    stopPicking: stopPicking,
    isPicking: isPicking,
    getPickingInfo: getPickingInfo,
    setCalibrationPoint: setCalibrationPoint,
    setSourcePage: setSourcePage,
    setTargetPage: setTargetPage,
    allPointsSet: allPointsSet,
    getPointProgress: getPointProgress,
    computeAndGenerateCandidates: computeAndGenerateCandidates,
    getMigrationCandidates: getMigrationCandidates,
    getCandidatesByStatus: getCandidatesByStatus,
    acceptCandidate: acceptCandidate,
    rejectCandidate: rejectCandidate,
    deleteCandidate: deleteCandidate,
    modifyCandidateType: modifyCandidateType,
    modifyCandidateNote: modifyCandidateNote,
    modifyCandidatePosition: modifyCandidatePosition,
    resetCandidate: resetCandidate,
    acceptAllPending: acceptAllPending,
    rejectAllPending: rejectAllPending,
    applyAccepted: applyAccepted,
    getStats: getStats,
    getQualityInfo: getQualityInfo,
    getHistory: getHistory,
    saveToHistory: saveToHistory,
    clearHistory: clearHistory,
    restoreFromHistory: restoreFromHistory,
    deleteFromHistory: deleteFromHistory,
    getCurrentStep: getCurrentStep,
    setCurrentStep: setCurrentStep,
    advanceStep: advanceStep,
    subscribe: subscribe,
    getExportData: getExportData,
    restoreExportData: restoreExportData,
    getSessions: getSessions,
    saveSession: saveSession,
    restoreSession: restoreSession,
    deleteSession: deleteSession,
    autoSuggestPages: autoSuggestPages,
    saveCalibrationPlan: saveCalibrationPlan,
    getCalibrationPlans: getCalibrationPlans,
    deleteCalibrationPlan: deleteCalibrationPlan,
    duplicateCalibrationPlan: duplicateCalibrationPlan,
    renameCalibrationPlan: renameCalibrationPlan,
    previewPlanApplication: previewPlanApplication,
    loadCalibrationPlan: loadCalibrationPlan,
    applyCalibrationPlan: applyCalibrationPlan,
    getPlanQualityBadgeClass: getPlanQualityBadgeClass,
  };

  global.CalibrationUI = CalibrationUI;
})(window);
