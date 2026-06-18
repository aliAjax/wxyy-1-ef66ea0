(function (global) {
  const HISTORY_STORAGE_KEY = "wxyy-1-history-stack";
  const HISTORY_META_KEY = "wxyy-1-history-meta";
  const DEFAULT_MAX_HISTORY = 30;
  const SOFT_QUOTA_RATIO = 0.35;

  const ACTION_LABELS = {
    "import-pages": "导入页面",
    "add-marker": "添加点标记",
    "add-region": "添加区域标注",
    "delete-page": "删除页面",
    "config-damage-types": "配置损伤类型",
    "accept-candidates": "接受候选标记",
    "apply-migration": "应用跨页迁移",
    "import-workpackage": "导入工作包",
    "update-marker": "修改标记",
    "delete-marker": "删除标记",
    "batch-update-markers": "批量修改标记",
    "batch-delete-markers": "批量删除标记",
    "clear-page-markers": "清空本页标记",
    "unknown": "未知操作",
  };

  const listeners = new Set();

  function cloneState(obj) {
    if (global.structuredClone) {
      try {
        return global.structuredClone(obj);
      } catch (e) {}
    }
    return JSON.parse(JSON.stringify(obj));
  }

  function estimateSize(obj) {
    try {
      return new Blob([JSON.stringify(obj)]).size;
    } catch (e) {
      return JSON.stringify(obj).length * 2;
    }
  }

  function getTotalLocalStorageUsage() {
    var total = 0;
    try {
      for (var key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          total += (localStorage[key].length + key.length) * 2;
        }
      }
    } catch (e) {}
    return total;
  }

  function stripImagesFromState(state) {
    if (!state || !state.volumeState || !Array.isArray(state.volumeState.pages)) {
      return state;
    }
    var stripped = cloneState(state);
    stripped.volumeState.pages.forEach(function (p) {
      if (p.image) {
        p._hadImage = true;
        p.image = "";
      }
    });
    if (stripped.taskQueueState && Array.isArray(stripped.taskQueueState.tasks)) {
      stripped.taskQueueState.tasks.forEach(function (t) {
        if (t.image) {
          t._hadImage = true;
          t.image = "";
        }
      });
    }
    return stripped;
  }

  function hasImagesInState(state) {
    if (!state) return false;
    if (state.volumeState && Array.isArray(state.volumeState.pages)) {
      for (var i = 0; i < state.volumeState.pages.length; i++) {
        if (state.volumeState.pages[i].image) return true;
      }
    }
    if (state.taskQueueState && Array.isArray(state.taskQueueState.tasks)) {
      for (var j = 0; j < state.taskQueueState.tasks.length; j++) {
        if (state.taskQueueState.tasks[j].image) return true;
      }
    }
    return false;
  }

  function readRawHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : { undoStack: [], redoStack: [], pointer: -1 };
    } catch (e) {
      console.warn("读取历史记录失败", e);
      return { undoStack: [], redoStack: [], pointer: -1 };
    }
  }

  function writeRawHistory(data) {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error("写入历史记录失败", e);
      return false;
    }
  }

  function readMeta() {
    try {
      var raw = localStorage.getItem(HISTORY_META_KEY);
      return raw ? JSON.parse(raw) : { degraded: false, lastAction: null, imagesStripped: [] };
    } catch (e) {
      return { degraded: false, lastAction: null, imagesStripped: [] };
    }
  }

  function writeMeta(meta) {
    try {
      localStorage.setItem(HISTORY_META_KEY, JSON.stringify(meta));
    } catch (e) {}
  }

  var HistoryManager = {
    _undoStack: [],
    _redoStack: [],
    _maxHistory: DEFAULT_MAX_HISTORY,
    _degraded: false,
    _imagesStrippedIds: [],
    _suppressRecording: false,
    _lastAction: null,

    init: function () {
      var loaded = readRawHistory();
      this._undoStack = Array.isArray(loaded.undoStack) ? loaded.undoStack : [];
      this._redoStack = Array.isArray(loaded.redoStack) ? loaded.redoStack : [];
      var meta = readMeta();
      this._degraded = !!meta.degraded;
      this._imagesStrippedIds = Array.isArray(meta.imagesStripped) ? meta.imagesStripped : [];
      this._lastAction = meta.lastAction || null;
    },

    _notify: function () {
      var self = this;
      listeners.forEach(function (fn) {
        try {
          fn({
            canUndo: self.canUndo(),
            canRedo: self.canRedo(),
            undoCount: self._undoStack.length,
            redoCount: self._redoStack.length,
            lastAction: self._lastAction,
            degraded: self._degraded,
          });
        } catch (e) {
          console.error("历史记录监听回调异常", e);
        }
      });
    },

    subscribe: function (fn) {
      if (typeof fn !== "function") return function () {};
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    },

    _captureFullState: function () {
      var volumeState = global.VolumeState ? cloneState(global.VolumeState.all) : null;
      var taskQueueState = global.TaskQueue ? cloneState(global.TaskQueue.all) : null;
      var candidateState = null;
      if (global.CandidateManager) {
        candidateState = {
          candidates: cloneState(global.CandidateManager.candidates),
          pageId: global.CandidateManager.pageId || null,
          filter: global.CandidateManager.getFilter ? global.CandidateManager.getFilter() : "all",
          sensitivity: global.CandidateManager.sensitivity,
          detectEdge: global.CandidateManager.detectEdge,
          maxCandidates: global.CandidateManager.maxCandidates,
        };
      }
      var calibrationState = null;
      if (global.CalibrationUI) {
        try {
          calibrationState = cloneState(global.CalibrationUI.getCalibration());
        } catch (e) {
          calibrationState = null;
        }
      }
      var candidatesVisible = typeof global._candidatesVisible !== "undefined"
        ? global._candidatesVisible
        : (typeof candidatesVisible !== "undefined" ? candidatesVisible : true);

      return {
        volumeState: volumeState,
        taskQueueState: taskQueueState,
        candidateState: candidateState,
        calibrationState: calibrationState,
        candidatesVisible: candidatesVisible,
        capturedAt: new Date().toISOString(),
      };
    },

    _persist: function () {
      var data = {
        undoStack: this._undoStack,
        redoStack: this._redoStack,
      };
      var ok = writeRawHistory(data);
      if (!ok) {
        if (!this._degraded) {
          this._degraded = true;
          console.warn("历史记录持久化失败，降级为内存模式");
        }
      }
      writeMeta({
        degraded: this._degraded,
        lastAction: this._lastAction,
        imagesStripped: this._imagesStrippedIds,
      });
    },

    _trySaveWithFallback: function () {
      var self = this;
      var data = {
        undoStack: this._undoStack,
        redoStack: this._redoStack,
      };

      if (writeRawHistory(data)) {
        return true;
      }

      var trimmed = 0;
      while (this._undoStack.length > 5) {
        var removed = this._undoStack.shift();
        if (removed && removed.id) {
          var idx = this._imagesStrippedIds.indexOf(removed.id);
          if (idx !== -1) this._imagesStrippedIds.splice(idx, 1);
        }
        trimmed++;
        data = { undoStack: this._undoStack, redoStack: this._redoStack };
        if (writeRawHistory(data)) {
          console.warn("历史记录空间不足，已裁剪 " + trimmed + " 条旧记录");
          this._persist();
          return true;
        }
      }

      var imagesStripped = 0;
      for (var i = 0; i < this._undoStack.length; i++) {
        var entry = this._undoStack[i];
        if (entry && entry.before && hasImagesInState(entry.before)) {
          entry.before = stripImagesFromState(entry.before);
          entry.imagesStripped = true;
          if (entry.id && this._imagesStrippedIds.indexOf(entry.id) === -1) {
            this._imagesStrippedIds.push(entry.id);
          }
          if (entry.after && hasImagesInState(entry.after)) {
            entry.after = stripImagesFromState(entry.after);
          }
          imagesStripped++;
          data = { undoStack: this._undoStack, redoStack: this._redoStack };
          if (writeRawHistory(data)) {
            console.warn("历史记录空间不足，已剥离 " + imagesStripped + " 条记录中的图片数据");
            this._degraded = true;
            this._persist();
            return true;
          }
        }
      }

      for (var j = 0; j < this._redoStack.length; j++) {
        var redoEntry = this._redoStack[j];
        if (redoEntry && redoEntry.before && hasImagesInState(redoEntry.before)) {
          redoEntry.before = stripImagesFromState(redoEntry.before);
          redoEntry.imagesStripped = true;
          if (redoEntry.after && hasImagesInState(redoEntry.after)) {
            redoEntry.after = stripImagesFromState(redoEntry.after);
          }
        }
      }

      this._redoStack = [];
      data = { undoStack: this._undoStack, redoStack: this._redoStack };
      if (writeRawHistory(data)) {
        this._degraded = true;
        this._persist();
        return true;
      }

      this._degraded = true;
      this._persist();
      return false;
    },

    recordAction: function (actionType, customLabel) {
      if (this._suppressRecording) return null;

      var before = this._captureFullState();
      var label = customLabel || ACTION_LABELS[actionType] || ACTION_LABELS["unknown"];

      var entry = {
        id: "hist-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16),
        action: actionType || "unknown",
        label: label,
        before: before,
        after: null,
        timestamp: new Date().toISOString(),
        imagesStripped: false,
      };

      this._redoStack = [];
      this._undoStack.push(entry);

      while (this._undoStack.length > this._maxHistory) {
        var removed = this._undoStack.shift();
        if (removed && removed.id) {
          var idx = this._imagesStrippedIds.indexOf(removed.id);
          if (idx !== -1) this._imagesStrippedIds.splice(idx, 1);
        }
      }

      this._lastAction = { id: entry.id, action: actionType, label: label };
      this._trySaveWithFallback();
      this._notify();
      return entry.id;
    },

    commitAction: function (entryId) {
      if (!entryId) return false;
      var entry = this._undoStack.find(function (e) { return e.id === entryId; });
      if (!entry) return false;
      entry.after = this._captureFullState();
      this._trySaveWithFallback();
      this._notify();
      return true;
    },

    _restoreState: function (stateSnapshot) {
      if (!stateSnapshot) return false;
      this._suppressRecording = true;
      try {
        if (stateSnapshot.volumeState && global.VolumeState) {
          global.VolumeStorage.save(stateSnapshot.volumeState);
          global.VolumeState._state = global.VolumeStorage.load();
          global.VolumeState._notify();
        }

        if (stateSnapshot.taskQueueState && global.TaskQueue) {
          try {
            localStorage.setItem("wxyy-1-task-queue", JSON.stringify(stateSnapshot.taskQueueState));
          } catch (e) {}
          try {
            var raw2 = localStorage.getItem("wxyy-1-task-queue");
            if (raw2) {
              global.TaskQueue._state = JSON.parse(raw2);
            } else {
              global.TaskQueue._state = JSON.parse(JSON.stringify(DEFAULT_TASK_STATE_FALLBACK));
            }
          } catch (e) {
            global.TaskQueue._state = JSON.parse(JSON.stringify(DEFAULT_TASK_STATE_FALLBACK));
          }
          global.TaskQueue._notify();
        }

        if (stateSnapshot.candidateState && global.CandidateManager) {
          var cs = stateSnapshot.candidateState;
          if (cs.candidates) {
            global.CandidateManager.setCandidates(cs.candidates);
          }
          if (cs.filter) {
            global.CandidateManager.setFilter(cs.filter);
          }
          if (cs.sensitivity !== undefined) {
            global.CandidateManager.setSensitivity(cs.sensitivity);
          }
          if (cs.detectEdge !== undefined) {
            global.CandidateManager.setDetectEdge(cs.detectEdge);
          }
          if (cs.maxCandidates !== undefined) {
            global.CandidateManager.setMaxCandidates(cs.maxCandidates);
          }
        }

        if (stateSnapshot.calibrationState && global.CalibrationUI) {
          global.CalibrationUI.restoreExportData(stateSnapshot.calibrationState);
        }

        if (stateSnapshot.candidatesVisible !== undefined && global.VolumeRender) {
          global._candidatesVisible = stateSnapshot.candidatesVisible;
          if (typeof candidatesVisible !== "undefined") {
            candidatesVisible = stateSnapshot.candidatesVisible;
          }
          global.VolumeRender.refresh();
        } else if (stateSnapshot.candidatesVisible !== undefined) {
          global._candidatesVisible = stateSnapshot.candidatesVisible;
          if (typeof candidatesVisible !== "undefined") {
            candidatesVisible = stateSnapshot.candidatesVisible;
          }
        }

        if (global.VolumeRender) {
          global.VolumeRender.refresh();
        }

        return true;
      } catch (e) {
        console.error("恢复状态失败", e);
        return false;
      } finally {
        this._suppressRecording = false;
      }
    },

    undo: function () {
      if (!this.canUndo()) return null;
      var entry = this._undoStack.pop();
      if (!entry) return null;

      if (!entry.after) {
        entry.after = this._captureFullState();
      }

      var restored = this._restoreState(entry.before);
      if (!restored) {
        this._undoStack.push(entry);
        return null;
      }

      this._redoStack.push(entry);
      this._lastAction = null;
      this._trySaveWithFallback();
      this._notify();
      return entry;
    },

    redo: function () {
      if (!this.canRedo()) return null;
      var entry = this._redoStack.pop();
      if (!entry || !entry.after) return null;

      var restored = this._restoreState(entry.after);
      if (!restored) {
        this._redoStack.push(entry);
        return null;
      }

      this._undoStack.push(entry);
      this._lastAction = { id: entry.id, action: entry.action, label: entry.label };
      this._trySaveWithFallback();
      this._notify();
      return entry;
    },

    canUndo: function () {
      return this._undoStack.length > 0;
    },

    canRedo: function () {
      return this._redoStack.length > 0 && this._redoStack.some(function (e) { return e && e.after; });
    },

    getUndoLabel: function () {
      if (this._undoStack.length === 0) return null;
      var entry = this._undoStack[this._undoStack.length - 1];
      return entry ? entry.label : null;
    },

    getRedoLabel: function () {
      var validRedo = this._redoStack.filter(function (e) { return e && e.after; });
      if (validRedo.length === 0) return null;
      return validRedo[validRedo.length - 1].label;
    },

    getHistory: function () {
      return this._undoStack.map(function (e) {
        return {
          id: e.id,
          action: e.action,
          label: e.label,
          timestamp: e.timestamp,
          imagesStripped: e.imagesStripped,
        };
      });
    },

    clear: function () {
      this._undoStack = [];
      this._redoStack = [];
      this._imagesStrippedIds = [];
      this._lastAction = null;
      this._persist();
      this._notify();
    },

    setMaxHistory: function (n) {
      this._maxHistory = Math.max(5, Math.min(100, Number(n) || DEFAULT_MAX_HISTORY));
      while (this._undoStack.length > this._maxHistory) {
        this._undoStack.shift();
      }
      this._persist();
      this._notify();
    },

    getStats: function () {
      return {
        undoCount: this._undoStack.length,
        redoCount: this._redoStack.length,
        maxHistory: this._maxHistory,
        degraded: this._degraded,
        imagesStrippedCount: this._imagesStrippedIds.length,
        estimatedSizeKB: Math.round(estimateSize({
          undoStack: this._undoStack,
          redoStack: this._redoStack,
        }) / 1024),
      };
    },

    isDegraded: function () {
      return this._degraded;
    },

    isActionImagesStripped: function (entryId) {
      return this._imagesStrippedIds.indexOf(entryId) !== -1;
    },
  };

  var DEFAULT_TASK_STATE_FALLBACK = {
    tasks: [],
    activeTaskId: null,
    createdAt: null,
    updatedAt: null,
  };

  global.HistoryManager = HistoryManager;
  global.HistoryManager.ACTION_LABELS = ACTION_LABELS;
})(window);
