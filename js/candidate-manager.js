(function (global) {
  const { detectCandidates, DEFAULT_SENSITIVITY } = global.CandidateDetector;

  const CANDIDATE_STATUS = {
    PENDING: "pending",
    ACCEPTED: "accepted",
    IGNORED: "ignored",
  };

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

  function _notify() {
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (e) {
        console.error("候选管理器监听回调异常", e);
      }
    });
  }

  function subscribe(fn) {
    if (typeof fn !== "function") return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

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

      state.candidates = result.candidates.map((c) => {
        const conf = Number(c.confidence);
        return {
          ...c,
          status: CANDIDATE_STATUS.PENDING,
          confidence: isNaN(conf) ? 0.5 : Math.max(0, Math.min(1, conf)),
        };
      });
      state.lastDetectResult = result;
      state.isDetecting = false;
      _notify();

      return {
        success: true,
        count: state.candidates.length,
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

  function getCandidates() {
    return state.candidates.slice();
  }

  function getCandidatesByStatus(status) {
    return state.candidates.filter((c) => c.status === status);
  }

  function getCandidateById(id) {
    return state.candidates.find((c) => c.id === id) || null;
  }

  function acceptCandidate(id, options) {
    const candidate = state.candidates.find((c) => c.id === id);
    if (!candidate) return null;

    candidate.status = CANDIDATE_STATUS.ACCEPTED;
    if (options?.note) {
      candidate.acceptNote = options.note;
    }
    candidate.acceptedAt = new Date().toISOString();

    _notify();
    return candidate;
  }

  function ignoreCandidate(id) {
    const candidate = state.candidates.find((c) => c.id === id);
    if (!candidate) return false;

    candidate.status = CANDIDATE_STATUS.IGNORED;
    candidate.ignoredAt = new Date().toISOString();

    _notify();
    return true;
  }

  function resetCandidate(id) {
    const candidate = state.candidates.find((c) => c.id === id);
    if (!candidate) return false;

    candidate.status = CANDIDATE_STATUS.PENDING;
    delete candidate.acceptNote;
    delete candidate.acceptedAt;
    delete candidate.ignoredAt;

    _notify();
    return true;
  }

  function acceptAllPending() {
    let count = 0;
    state.candidates.forEach((c) => {
      if (c.status === CANDIDATE_STATUS.PENDING) {
        c.status = CANDIDATE_STATUS.ACCEPTED;
        c.acceptedAt = new Date().toISOString();
        count++;
      }
    });
    _notify();
    return count;
  }

  function ignoreAllPending() {
    let count = 0;
    state.candidates.forEach((c) => {
      if (c.status === CANDIDATE_STATUS.PENDING) {
        c.status = CANDIDATE_STATUS.IGNORED;
        c.ignoredAt = new Date().toISOString();
        count++;
      }
    });
    _notify();
    return count;
  }

  function acceptByConfidence(minConfidence) {
    const threshold = Math.max(0, Math.min(1, Number(minConfidence) || 0));
    let count = 0;
    state.candidates.forEach((c) => {
      const conf = Number(c.confidence);
      const validConf = isNaN(conf) ? 0 : conf;
      if (c.status === CANDIDATE_STATUS.PENDING && validConf >= threshold) {
        c.status = CANDIDATE_STATUS.ACCEPTED;
        c.acceptedAt = new Date().toISOString();
        count++;
      }
    });
    _notify();
    return count;
  }

  function clearCandidates() {
    state.candidates = [];
    state.lastDetectResult = null;
    _notify();
  }

  function candidateToMarker(candidate, typeId, typeName) {
    if (!candidate) return null;

    const isRegion = candidate.width > 0.5 || candidate.height > 0.5;

    const marker = {
      mode: isRegion ? "region" : "point",
      typeId: typeId || null,
      type: typeName || "虫蛀点",
      note: candidate.acceptNote || `自动检测：${getTypeLabel(candidate.type)}（置信度 ${Math.round(candidate.confidence * 100)}%）`,
      x: candidate.x,
      y: candidate.y,
      _candidateId: candidate.id,
      _candidateType: candidate.type,
      _candidateConfidence: candidate.confidence,
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
  }

  function getTypeLabel(type) {
    const labels = {
      hole: "疑似破洞",
      spot: "深色斑点",
      irregular: "不规则损伤",
      edge: "边缘破损",
    };
    return labels[type] || "未知";
  }

  function getAcceptedMarkers(typeId, typeName) {
    const accepted = getCandidatesByStatus(CANDIDATE_STATUS.ACCEPTED);
    return accepted
      .map((c) => candidateToMarker(c, typeId, typeName))
      .filter(Boolean);
  }

  function getStats() {
    const total = state.candidates.length;
    const pending = state.candidates.filter(
      (c) => c.status === CANDIDATE_STATUS.PENDING
    ).length;
    const accepted = state.candidates.filter(
      (c) => c.status === CANDIDATE_STATUS.ACCEPTED
    ).length;
    const ignored = state.candidates.filter(
      (c) => c.status === CANDIDATE_STATUS.IGNORED
    ).length;

    return {
      total,
      pending,
      accepted,
      ignored,
      isDetecting: state.isDetecting,
      sensitivity: state.sensitivity,
    };
  }

  function init() {
    state.filter = "all";
    state.candidates = [];
    state.isDetecting = false;
    state.lastDetectResult = null;
  }

  function setFilter(filter) {
    if (["all", "pending", "accepted", "ignored"].includes(filter)) {
      state.filter = filter;
      _notify();
    }
  }

  function getFilter() {
    return state.filter;
  }

  function clearAccepted() {
    state.candidates = state.candidates.filter(
      (c) => c.status !== CANDIDATE_STATUS.ACCEPTED
    );
    _notify();
  }

  function setCandidates(candidates) {
    state.candidates = (candidates || []).map((c) => {
      const conf = Number(c.confidence);
      return {
        ...c,
        status: c.status || CANDIDATE_STATUS.PENDING,
        confidence: isNaN(conf) ? 0.5 : Math.max(0, Math.min(1, conf)),
      };
    });
    state.lastDetectResult = { candidates: state.candidates.slice() };
    _notify();
  }

  const CandidateManager = {
    CANDIDATE_STATUS,
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
    getTypeLabel,
    setFilter,
    getFilter,

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
  };

  global.CandidateManager = CandidateManager;
})(window);
