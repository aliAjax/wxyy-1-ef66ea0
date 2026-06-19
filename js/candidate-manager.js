(function (global) {
  const { detectCandidates, DEFAULT_SENSITIVITY } = global.CandidateDetector;

  const CANDIDATE_STATUS = {
    PENDING: "pending",
    ACCEPTED: "accepted",
    IGNORED: "ignored",
  };

  const VALID_STATUSES = Object.values(CANDIDATE_STATUS);
  const VALID_FILTERS = ["all", ...VALID_STATUSES];

  const listeners = new Set();

  let state = {
    candidates: [],
    sensitivity: DEFAULT_SENSITIVITY,
    detectEdge: true,
    maxCandidates: 200,
    isDetecting: false,
    lastDetectResult: null,
    pageId: null,
    filter: "all",
  };

  // ============================================================
  // 第一层：状态计算层（CandidateStatus）
  // 纯函数：只做基于输入的计算，不修改任何共享状态
  // ============================================================
  const CandidateStatus = {
    isValidStatus(s) {
      return VALID_STATUSES.indexOf(s) !== -1;
    },

    isValidFilter(f) {
      return VALID_FILTERS.indexOf(f) !== -1;
    },

    normalizeConfidence(conf) {
      const n = Number(conf);
      return isNaN(n) ? 0.5 : Math.max(0, Math.min(1, n));
    },

    computeStats(candidates) {
      const list = candidates || [];
      return {
        total: list.length,
        pending: list.filter((c) => c.status === CANDIDATE_STATUS.PENDING).length,
        accepted: list.filter((c) => c.status === CANDIDATE_STATUS.ACCEPTED).length,
        ignored: list.filter((c) => c.status === CANDIDATE_STATUS.IGNORED).length,
      };
    },

    filterByFilter(candidates, filter) {
      const list = candidates || [];
      const f = VALID_FILTERS.indexOf(filter) !== -1 ? filter : "all";
      return f === "all" ? list.slice() : list.filter((c) => c.status === f);
    },

    filterByStatus(candidates, status) {
      const list = candidates || [];
      if (!CandidateStatus.isValidStatus(status)) return [];
      return list.filter((c) => c.status === status);
    },

    filterByConfidence(candidates, minConfidence) {
      const list = candidates || [];
      const threshold = Math.max(0, Math.min(1, Number(minConfidence) || 0));
      return list.filter((c) => {
        const conf = CandidateStatus.normalizeConfidence(c.confidence);
        return conf >= threshold;
      });
    },

    getPending(candidates) {
      return CandidateStatus.filterByStatus(candidates, CANDIDATE_STATUS.PENDING);
    },

    getAccepted(candidates) {
      return CandidateStatus.filterByStatus(candidates, CANDIDATE_STATUS.ACCEPTED);
    },

    isRegionCandidate(candidate) {
      if (!candidate) return false;
      if (candidate.mode === "region") return true;
      const w = Number(candidate.width) || 0;
      const h = Number(candidate.height) || 0;
      return w > 0.5 || h > 0.5;
    },

    getTypeLabel(type) {
      const labels = {
        hole: "疑似破洞",
        spot: "深色斑点",
        irregular: "不规则损伤",
        edge: "边缘破损",
      };
      return labels[type] || "未知";
    },

    candidateToMarkerData(candidate, typeId, typeName) {
      if (!candidate) return null;

      const isRegion = CandidateStatus.isRegionCandidate(candidate);
      const conf = CandidateStatus.normalizeConfidence(candidate.confidence);
      const typeLabel = CandidateStatus.getTypeLabel(candidate.type);
      const confPercent = Math.round(conf * 100);

      const marker = {
        mode: isRegion ? "region" : "point",
        typeId: typeId || null,
        type: typeName || "虫蛀点",
        note: candidate.acceptNote ||
          `自动检测：${typeLabel}（置信度 ${confPercent}%）`,
        x: candidate.x,
        y: candidate.y,
        _candidateId: candidate.id,
        _candidateType: candidate.type,
        _candidateConfidence: conf,
      };

      if (isRegion) {
        marker.width = candidate.width;
        marker.height = candidate.height;
      }

      if (candidate.realX !== undefined) {
        marker.realX = candidate.realX;
        marker.realY = candidate.realY;
        if (candidate.realWidth !== undefined) {
          marker.realWidth = candidate.realWidth;
          marker.realHeight = candidate.realHeight;
        }
      }

      return marker;
    },

    buildMarkerDatas(acceptedCandidates, typeId, typeName) {
      return (acceptedCandidates || [])
        .map((c) => CandidateStatus.candidateToMarkerData(c, typeId, typeName))
        .filter(Boolean);
    },
  };

  // ============================================================
  // 第二层：持久化层（Persistence）
  // 统一处理与 VolumeState 的交互
  // ============================================================
  const Persistence = {
    _getPage() {
      if (!global.VolumeState) return null;
      return global.VolumeState.currentPage;
    },

    syncSummary(pageId, candidates) {
      if (!global.VolumeState) return;
      const stats = CandidateStatus.computeStats(candidates);
      const page = pageId
        ? global.VolumeState.pages.find((p) => p.id === pageId)
        : global.VolumeState.currentPage;
      if (!page) return;
      if (stats.total > 0) {
        global.VolumeState.updateCandidateSummary(page.id, stats);
      } else {
        global.VolumeState.clearCandidateSummary(page.id);
      }
    },

    addMarker(markerData) {
      if (!global.VolumeState || !markerData) return null;
      if (markerData.mode === "region") {
        return global.VolumeState.addRegion(markerData);
      }
      return global.VolumeState.addMarker(markerData);
    },

    recordHistoryAction(actionName) {
      if (!actionName) return;
      if (global.HistoryManager && typeof global.HistoryManager.recordAction === "function") {
        try {
          global.HistoryManager.recordAction(actionName);
        } catch (e) {}
      }
    },
  };

  // ============================================================
  // 第三层：操作层（Operations）
  // 每个操作封装完整流程：校验 → 执行 → 记录历史 → 同步 → 返回结果
  // 统一返回格式：{ changed: bool, count: number, ...extra }
  // ============================================================
  const Operations = {
    _applyStatusToIds(ids, newStatus, extraPropsFn) {
      if (!Array.isArray(ids) || ids.length === 0) return { changed: false, count: 0 };
      if (!CandidateStatus.isValidStatus(newStatus)) return { changed: false, count: 0 };

      let count = 0;
      const now = new Date().toISOString();
      ids.forEach((id) => {
        const c = state.candidates.find((x) => x.id === id);
        if (!c) return;
        if (newStatus === CANDIDATE_STATUS.ACCEPTED) {
          if (c.status === CANDIDATE_STATUS.ACCEPTED) return;
          c.status = CANDIDATE_STATUS.ACCEPTED;
          c.acceptedAt = now;
          if (typeof extraPropsFn === "function") {
            Object.assign(c, extraPropsFn(c));
          }
        } else if (newStatus === CANDIDATE_STATUS.IGNORED) {
          if (c.status === CANDIDATE_STATUS.IGNORED) return;
          c.status = CANDIDATE_STATUS.IGNORED;
          c.ignoredAt = now;
        } else if (newStatus === CANDIDATE_STATUS.PENDING) {
          delete c.acceptNote;
          delete c.acceptedAt;
          delete c.ignoredAt;
          c.status = CANDIDATE_STATUS.PENDING;
        }
        count++;
      });
      return { changed: count > 0, count };
    },

    _normalizeRaw(rawList) {
      if (!Array.isArray(rawList)) return [];
      return rawList.map((raw) => ({
        ...raw,
        status: CandidateStatus.isValidStatus(raw.status) ? raw.status : CANDIDATE_STATUS.PENDING,
        confidence: CandidateStatus.normalizeConfidence(raw.confidence),
      }));
    },

    setFromDetection(rawCandidates, detectResult) {
      state.candidates = Operations._normalizeRaw(rawCandidates);
      state.lastDetectResult = detectResult || {
        candidates: state.candidates.slice(),
      };
      Persistence.syncSummary(null, state.candidates);
      return { changed: true, count: state.candidates.length };
    },

    setCandidatesExplicit(rawCandidates) {
      state.candidates = Operations._normalizeRaw(rawCandidates);
      state.lastDetectResult = { candidates: state.candidates.slice() };
      return { changed: true, count: state.candidates.length };
    },

    acceptOne(id, opts) {
      const result = Operations._applyStatusToIds([id], CANDIDATE_STATUS.ACCEPTED, () => {
        if (opts && opts.note) return { acceptNote: opts.note };
        return {};
      });
      if (result.changed) {
        Persistence.recordHistoryAction("accept-candidates");
        Persistence.syncSummary(null, state.candidates);
      }
      return result;
    },

    ignoreOne(id) {
      const result = Operations._applyStatusToIds([id], CANDIDATE_STATUS.IGNORED);
      if (result.changed) {
        Persistence.syncSummary(null, state.candidates);
      }
      return result;
    },

    resetOne(id) {
      const result = Operations._applyStatusToIds([id], CANDIDATE_STATUS.PENDING);
      if (result.changed) {
        Persistence.syncSummary(null, state.candidates);
      }
      return result;
    },

    acceptAllPending() {
      const pending = CandidateStatus.getPending(state.candidates);
      const ids = pending.map((c) => c.id);
      const result = Operations._applyStatusToIds(ids, CANDIDATE_STATUS.ACCEPTED);
      if (result.changed) {
        Persistence.recordHistoryAction("accept-candidates");
        Persistence.syncSummary(null, state.candidates);
      }
      return result;
    },

    ignoreAllPending() {
      const pending = CandidateStatus.getPending(state.candidates);
      const ids = pending.map((c) => c.id);
      const result = Operations._applyStatusToIds(ids, CANDIDATE_STATUS.IGNORED);
      if (result.changed) {
        Persistence.syncSummary(null, state.candidates);
      }
      return result;
    },

    acceptByConfidence(threshold0to1) {
      const threshold = Math.max(0, Math.min(1, Number(threshold0to1) || 0));
      const candidatesToAccept = CandidateStatus.filterByConfidence(
        CandidateStatus.getPending(state.candidates),
        threshold
      );
      const ids = candidatesToAccept.map((c) => c.id);
      const result = Operations._applyStatusToIds(ids, CANDIDATE_STATUS.ACCEPTED);
      if (result.changed) {
        Persistence.recordHistoryAction("accept-candidates");
        Persistence.syncSummary(null, state.candidates);
      }
      return result;
    },

    applyAccepted(selectedTypeId, selectedTypeName) {
      const accepted = CandidateStatus.getAccepted(state.candidates);
      const markerDatas = CandidateStatus.buildMarkerDatas(accepted, selectedTypeId, selectedTypeName);
      if (markerDatas.length === 0) {
        return { changed: false, count: 0, added: 0, applied: [] };
      }

      Persistence.recordHistoryAction("accept-candidates");

      let added = 0;
      const applied = [];
      for (const markerData of markerDatas) {
        const finalMarker = {
          ...markerData,
          typeId: selectedTypeId || markerData.typeId,
        };
        const result = Persistence.addMarker(finalMarker);
        if (result) {
          added++;
          applied.push({
            markerId: result.id,
            candidateId: markerData._candidateId,
          });
        }
      }

      const changed = added > 0;
      if (changed) {
        const appliedCandidateIds = new Set(applied.map((a) => a.candidateId));
        state.candidates = state.candidates.filter(
          (c) => !appliedCandidateIds.has(c.id)
        );
        Persistence.syncSummary(null, state.candidates);
      }
      return { changed, count: accepted.length, added, applied };
    },
  };

  // ============================================================
  // 内部辅助
  // ============================================================
  function _notify() {
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (e) {
        console.error("候选管理器监听回调异常", e);
      }
    });
  }

  function _wrappedNotify(fnName, opResult) {
    if (opResult && opResult.changed) {
      _notify();
    }
    return opResult;
  }

  // ============================================================
  // 订阅机制
  // ============================================================
  function subscribe(fn) {
    if (typeof fn !== "function") return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // ============================================================
  // 设置类方法（设置参数，不修改候选本身）
  // ============================================================
  function setPage(pageId) {
    if (state.pageId === pageId) return;
    state.pageId = pageId;
    state.candidates = [];
    state.lastDetectResult = null;
    _notify();
  }

  function setSensitivity(value) {
    state.sensitivity = Math.max(1, Math.min(100, Number(value) || DEFAULT_SENSITIVITY));
    _notify();
  }

  function setDetectEdge(enabled) {
    state.detectEdge = Boolean(enabled);
    _notify();
  }

  function setMaxCandidates(value) {
    state.maxCandidates = Math.max(10, Math.min(500, Number(value) || 200));
    _notify();
  }

  function setFilter(filter) {
    if (VALID_FILTERS.includes(filter)) {
      state.filter = filter;
      _notify();
    }
  }

  // ============================================================
  // 检测入口
  // ============================================================
  async function runDetection(imageSrc) {
    if (!imageSrc) {
      state.candidates = [];
      state.lastDetectResult = null;
      state.isDetecting = false;
      _notify();
      return { success: false, error: "没有图片源" };
    }

    state.isDetecting = true;
    _notify();

    try {
      const result = await detectCandidates(imageSrc, {
        sensitivity: state.sensitivity,
        maxCandidates: state.maxCandidates,
        detectEdge: state.detectEdge,
      });

      state.isDetecting = false;
      const opResult = Operations.setFromDetection(result.candidates || [], result);
      _notify();

      return {
        success: true,
        count: opResult.count,
        warning: result.warning || null,
      };
    } catch (e) {
      console.error("候选检测失败", e);
      state.isDetecting = false;
      state.candidates = [];
      state.lastDetectResult = null;
      _notify();
      return { success: false, error: e.message || "检测失败" };
    }
  }

  // ============================================================
  // 操作类公开方法（委托给 Operations 层）
  // ============================================================
  function getCandidates() {
    return state.candidates.slice();
  }

  function getCandidatesByStatus(status) {
    return CandidateStatus.filterByStatus(state.candidates, status);
  }

  function getCandidateById(id) {
    return state.candidates.find((c) => c.id === id) || null;
  }

  function acceptCandidate(id, options) {
    const result = _wrappedNotify("acceptCandidate",
      Operations.acceptOne(id, options || {})
    );
    return result.count > 0 ? getCandidateById(id) : null;
  }

  function ignoreCandidate(id) {
    const result = _wrappedNotify("ignoreCandidate",
      Operations.ignoreOne(id)
    );
    return result.count > 0;
  }

  function resetCandidate(id) {
    const result = _wrappedNotify("resetCandidate",
      Operations.resetOne(id)
    );
    return result.count > 0;
  }

  function acceptAllPending() {
    const result = _wrappedNotify("acceptAllPending",
      Operations.acceptAllPending()
    );
    return result.count;
  }

  function ignoreAllPending() {
    const result = _wrappedNotify("ignoreAllPending",
      Operations.ignoreAllPending()
    );
    return result.count;
  }

  function acceptByConfidence(minConfidence) {
    const result = _wrappedNotify("acceptByConfidence",
      Operations.acceptByConfidence(minConfidence)
    );
    return result.count;
  }

  function applyAcceptedToMarkers(selectedTypeId, selectedTypeName) {
    const result = _wrappedNotify("applyAcceptedToMarkers",
      Operations.applyAccepted(selectedTypeId, selectedTypeName)
    );
    return result;
  }

  function clearCandidates() {
    state.candidates = [];
    state.lastDetectResult = null;
    _notify();
  }

  function clearAccepted() {
    const before = state.candidates.length;
    state.candidates = state.candidates.filter(
      (c) => c.status !== CANDIDATE_STATUS.ACCEPTED
    );
    const changed = state.candidates.length !== before;
    if (changed) {
      Persistence.syncSummary(null, state.candidates);
      _notify();
    }
    return before - state.candidates.length;
  }

  function setCandidates(candidates) {
    const result = _wrappedNotify("setCandidates",
      Operations.setCandidatesExplicit(candidates || [])
    );
    return result;
  }

  function getStats() {
    const stats = CandidateStatus.computeStats(state.candidates);
    return {
      ...stats,
      isDetecting: state.isDetecting,
      sensitivity: state.sensitivity,
    };
  }

  function getFilteredCandidates() {
    return CandidateStatus.filterByFilter(state.candidates, state.filter);
  }

  // ============================================================
  // 兼容旧API（候选转标记）
  // ============================================================
  function candidateToMarker(candidate, typeId, typeName) {
    return CandidateStatus.candidateToMarkerData(candidate, typeId, typeName);
  }

  function getAcceptedMarkers(typeId, typeName) {
    const accepted = CandidateStatus.getAccepted(state.candidates);
    return CandidateStatus.buildMarkerDatas(accepted, typeId, typeName);
  }

  function getTypeLabel(type) {
    return CandidateStatus.getTypeLabel(type);
  }

  // ============================================================
  // 初始化 / 序列化
  // ============================================================
  function init() {
    state.filter = "all";
    state.candidates = [];
    state.isDetecting = false;
    state.lastDetectResult = null;
  }

  function getFilter() {
    return state.filter;
  }

  function restoreState(savedState) {
    if (!savedState || typeof savedState !== "object") return false;
    if (savedState.candidates !== undefined) {
      state.candidates = Operations._normalizeRaw(savedState.candidates);
    }
    if (savedState.pageId !== undefined) {
      state.pageId = savedState.pageId;
    }
    if (savedState.filter !== undefined && VALID_FILTERS.includes(savedState.filter)) {
      state.filter = savedState.filter;
    }
    if (savedState.sensitivity !== undefined) {
      state.sensitivity = Math.max(1, Math.min(100, Number(savedState.sensitivity) || DEFAULT_SENSITIVITY));
    }
    if (savedState.detectEdge !== undefined) {
      state.detectEdge = Boolean(savedState.detectEdge);
    }
    if (savedState.maxCandidates !== undefined) {
      state.maxCandidates = Math.max(10, Math.min(500, Number(savedState.maxCandidates) || 200));
    }
    if (savedState.lastDetectResult !== undefined) {
      state.lastDetectResult = savedState.lastDetectResult;
    }
    _notify();
    return true;
  }

  // ============================================================
  // 导出
  // ============================================================
  const CandidateManager = {
    CANDIDATE_STATUS,
    VALID_STATUSES: VALID_STATUSES.slice(),
    VALID_FILTERS: VALID_FILTERS.slice(),

    // 三层分离的内部API（便于未来扩展）
    CandidateStatus,
    Operations,
    Persistence,

    subscribe,
    init,
    setPage,
    setSensitivity,
    setDetectEdge,
    setMaxCandidates,
    runDetection,
    setCandidates,
    getCandidates,
    getCandidatesByStatus,
    getCandidateById,
    acceptCandidate,
    ignoreCandidate,
    resetCandidate,
    acceptAllPending,
    ignoreAllPending,
    acceptByConfidence,
    clearCandidates,
    clearAccepted,
    candidateToMarker,
    getAcceptedMarkers,
    getStats,
    getFilteredCandidates,
    getTypeLabel,
    setFilter,
    getFilter,
    restoreState,

    // 新的高层操作API
    applyAcceptedToMarkers,

    get sensitivity() {
      return state.sensitivity;
    },
    get detectEdge() {
      return state.detectEdge;
    },
    get maxCandidates() {
      return state.maxCandidates;
    },
    get isDetecting() {
      return state.isDetecting;
    },
    get candidates() {
      return state.candidates.slice();
    },
    get lastDetectResult() {
      return state.lastDetectResult;
    },
    get pageId() {
      return state.pageId;
    },
  };

  global.CandidateManager = CandidateManager;
})(window);
