(function (global) {
  var TASK_STORAGE_KEY = "wxyy-1-task-queue";
  var TASK_MIGRATION_KEY = "wxyy-1-task-queue-migrated";
  var TASK_BACKUP_KEY = TASK_STORAGE_KEY + "--backup";
  var TASK_BACKUP_TS_KEY = TASK_STORAGE_KEY + "--backup-ts";
  var TASK_SNAPSHOT_KEY = TASK_STORAGE_KEY + "--snapshot";
  var TASK_SNAPSHOT_META_KEY = TASK_STORAGE_KEY + "--snapshot-meta";

  var PRIORITY_LEVELS = ["high", "normal", "low"];
  var PRIORITY_VALUES = PRIORITY_LEVELS;
  var STATUS_VALUES = ["pending", "in_progress", "completed"];

  var DEFAULT_TASK_STATE = {
    tasks: [],
    activeTaskId: null,
    createdAt: null,
    updatedAt: null,
  };

  function readRaw() {
    try {
      var raw = localStorage.getItem(TASK_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn("读取任务队列存储失败", e);
      return null;
    }
  }

  function writeRaw(data) {
    try {
      localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error("写入任务队列存储失败", e);
      if (e.name === "QuotaExceededError" || (e.message && e.message.includes("quota"))) {
        alert("本地存储容量已满，请清理旧数据或导出后清空。");
      }
      return false;
    }
  }

  function taskBackup() {
    try {
      var current = localStorage.getItem(TASK_STORAGE_KEY);
      if (!current) return false;
      localStorage.setItem(TASK_BACKUP_KEY, current);
      localStorage.setItem(TASK_BACKUP_TS_KEY, new Date().toISOString());
      return true;
    } catch (e) {
      console.error("备份任务队列失败", e);
      return false;
    }
  }

  function taskRestoreBackup() {
    try {
      var bk = localStorage.getItem(TASK_BACKUP_KEY);
      if (!bk) return false;
      localStorage.setItem(TASK_STORAGE_KEY, bk);
      localStorage.removeItem(TASK_BACKUP_KEY);
      localStorage.removeItem(TASK_BACKUP_TS_KEY);
      return true;
    } catch (e) {
      console.error("恢复任务队列备份失败", e);
      return false;
    }
  }

  function taskClearBackup() {
    try {
      localStorage.removeItem(TASK_BACKUP_KEY);
      localStorage.removeItem(TASK_BACKUP_TS_KEY);
    } catch (e) {}
  }

  function taskVerifyBackupIntegrity() {
    try {
      var bk = localStorage.getItem(TASK_BACKUP_KEY);
      if (!bk) return { valid: false, reason: "no_backup" };
      var parsed = JSON.parse(bk);
      if (!parsed || typeof parsed !== "object") return { valid: false, reason: "invalid_json" };
      if (!Array.isArray(parsed.tasks)) return { valid: false, reason: "missing_tasks" };
      return { valid: true, taskCount: parsed.tasks.length };
    } catch (e) {
      return { valid: false, reason: "parse_error", error: e.message };
    }
  }

  function taskCreateSnapshot() {
    try {
      var current = localStorage.getItem(TASK_STORAGE_KEY);
      if (!current) return { success: false, reason: "no_data" };
      var parsed = JSON.parse(current);
      if (!parsed) return { success: false, reason: "invalid_data" };
      var meta = {
        timestamp: new Date().toISOString(),
        taskCount: Array.isArray(parsed.tasks) ? parsed.tasks.length : 0,
      };
      localStorage.setItem(TASK_SNAPSHOT_KEY, current);
      localStorage.setItem(TASK_SNAPSHOT_META_KEY, JSON.stringify(meta));
      return { success: true, meta: meta };
    } catch (e) {
      console.error("创建任务队列快照失败", e);
      return { success: false, reason: "storage_error", error: e.message };
    }
  }

  function taskRestoreSnapshot() {
    try {
      var snapshot = localStorage.getItem(TASK_SNAPSHOT_KEY);
      if (!snapshot) return false;
      localStorage.setItem(TASK_STORAGE_KEY, snapshot);
      return true;
    } catch (e) {
      console.error("恢复任务队列快照失败", e);
      return false;
    }
  }

  function taskClearSnapshot() {
    try {
      localStorage.removeItem(TASK_SNAPSHOT_KEY);
      localStorage.removeItem(TASK_SNAPSHOT_META_KEY);
    } catch (e) {}
  }

  function taskGetSnapshotMeta() {
    try {
      var meta = localStorage.getItem(TASK_SNAPSHOT_META_KEY);
      return meta ? JSON.parse(meta) : null;
    } catch (e) {
      return null;
    }
  }

  function normalizeTask(raw) {
    if (!raw || typeof raw !== "object" || !raw.id) return null;
    var task = {
      id: raw.id,
      pageName: raw.pageName || "",
      priority: PRIORITY_VALUES.includes(raw.priority) ? raw.priority : "normal",
      status: STATUS_VALUES.includes(raw.status) ? raw.status : "pending",
      pageId: raw.pageId || null,
      image: raw.image || "",
      damageTypes: Array.isArray(raw.damageTypes) ? raw.damageTypes : [],
      markers: Array.isArray(raw.markers) ? raw.markers : [],
      reviewNotes: raw.reviewNotes || "",
      completedAt: raw.completedAt || null,
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
    if (raw.candidateSummary && typeof raw.candidateSummary === "object") {
      task.candidateSummary = {
        total: raw.candidateSummary.total || 0,
        pending: raw.candidateSummary.pending || 0,
        accepted: raw.candidateSummary.accepted || 0,
        ignored: raw.candidateSummary.ignored || 0,
        updatedAt: raw.candidateSummary.updatedAt || new Date().toISOString(),
      };
    }
    return task;
  }

  function normalizeTaskState(raw) {
    if (!raw || typeof raw !== "object") {
      return JSON.parse(JSON.stringify(DEFAULT_TASK_STATE));
    }
    var state = Object.assign(JSON.parse(JSON.stringify(DEFAULT_TASK_STATE)), raw);
    state.tasks = Array.isArray(state.tasks)
      ? state.tasks.map(normalizeTask).filter(Boolean)
      : [];
    if (state.activeTaskId && !state.tasks.some(function (t) { return t.id === state.activeTaskId; })) {
      state.activeTaskId = null;
    }
    return state;
  }

  var listeners = new Set();

  var TaskQueue = {
    _state: null,

    PRIORITY_LEVELS: PRIORITY_LEVELS,
    STATUS_VALUES: STATUS_VALUES,

    init: function () {
      this._state = normalizeTaskState(readRaw());
      this._migrateFromVolumeData();
    },

    get all() {
      return this._state;
    },

    get tasks() {
      return this._state.tasks;
    },

    get activeTaskId() {
      return this._state.activeTaskId;
    },

    get activeTask() {
      if (!this._state.activeTaskId) return null;
      return this._state.tasks.find(function (t) { return t.id === this._state.activeTaskId; }.bind(this)) || null;
    },

    get counts() {
      var pending = 0, inProgress = 0, completed = 0;
      this._state.tasks.forEach(function (t) {
        if (t.status === "pending") pending++;
        else if (t.status === "in_progress") inProgress++;
        else if (t.status === "completed") completed++;
      });
      return { pending: pending, inProgress: inProgress, completed: completed, total: this._state.tasks.length };
    },

    _persist: function () {
      this._state.updatedAt = new Date().toISOString();
      return writeRaw(this._state);
    },

    _notify: function () {
      listeners.forEach(function (fn) {
        try { fn(this._state); } catch (e) { console.error("TaskQueue监听回调异常", e); }
      }.bind(this));
    },

    subscribe: function (fn) {
      if (typeof fn !== "function") return function () {};
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    },

    createTask: function (opts) {
      opts = opts || {};
      var taskData = {
        id: crypto.randomUUID(),
        pageName: opts.pageName || "",
        priority: opts.priority || "normal",
        status: "pending",
        pageId: opts.pageId || null,
        image: opts.image || "",
        damageTypes: opts.damageTypes || [],
        markers: opts.markers || [],
        reviewNotes: opts.reviewNotes || "",
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (opts.candidateSummary && typeof opts.candidateSummary === "object") {
        taskData.candidateSummary = opts.candidateSummary;
      }
      var task = normalizeTask(taskData);
      if (!task) return null;
      this._state.tasks.push(task);
      if (!this._state.activeTaskId) {
        this._state.activeTaskId = task.id;
      }
      this._persist();
      this._notify();
      return task;
    },

    createTaskFromPage: function (page, volumeState) {
      if (!page) return null;
      var damageTypes = [];
      if (volumeState && volumeState.damageTypes) {
        damageTypes = JSON.parse(JSON.stringify(volumeState.damageTypes));
      }
      var taskOpts = {
        pageName: page.name || page.fileName || "",
        pageId: page.id,
        image: page.image || "",
        damageTypes: damageTypes,
        markers: page.markers ? JSON.parse(JSON.stringify(page.markers)) : [],
      };
      if (page.candidateSummary && typeof page.candidateSummary === "object") {
        taskOpts.candidateSummary = JSON.parse(JSON.stringify(page.candidateSummary));
      }
      return this.createTask(taskOpts);
    },

    updateTask: function (taskId, updates) {
      var task = this._state.tasks.find(function (t) { return t.id === taskId; });
      if (!task) return null;
      var allowed = ["pageName", "priority", "status", "reviewNotes", "image", "markers", "damageTypes", "candidateSummary"];
      allowed.forEach(function (key) {
        if (updates[key] !== undefined) {
          if (key === "candidateSummary") {
            if (updates[key] && typeof updates[key] === "object") {
              task[key] = JSON.parse(JSON.stringify(updates[key]));
            } else if (!updates[key]) {
              delete task[key];
            }
          } else {
            task[key] = updates[key];
          }
        }
      });
      if (updates.status === "completed" && task.status === "completed" && !task.completedAt) {
        task.completedAt = new Date().toISOString();
      }
      if (updates.status === "completed") {
        task.completedAt = new Date().toISOString();
      } else if (updates.status && updates.status !== "completed") {
        task.completedAt = null;
      }
      task.updatedAt = new Date().toISOString();
      this._persist();
      this._notify();
      return task;
    },

    completeTask: function (taskId) {
      return this.updateTask(taskId, { status: "completed" });
    },

    reopenTask: function (taskId) {
      return this.updateTask(taskId, { status: "in_progress" });
    },

    startTask: function (taskId) {
      return this.updateTask(taskId, { status: "in_progress" });
    },

    removeTask: function (taskId) {
      var idx = this._state.tasks.findIndex(function (t) { return t.id === taskId; });
      if (idx === -1) return false;
      this._state.tasks.splice(idx, 1);
      if (this._state.activeTaskId === taskId) {
        this._state.activeTaskId = this._state.tasks.length > 0 ? this._state.tasks[0].id : null;
      }
      this._persist();
      this._notify();
      return true;
    },

    removeTasksByPageId: function (pageId) {
      if (!pageId) return 0;
      var removed = 0;
      var activeMatched = false;
      for (var i = this._state.tasks.length - 1; i >= 0; i--) {
        if (this._state.tasks[i].pageId === pageId) {
          if (this._state.activeTaskId === this._state.tasks[i].id) {
            activeMatched = true;
          }
          this._state.tasks.splice(i, 1);
          removed++;
        }
      }
      if (removed > 0) {
        if (activeMatched) {
          this._state.activeTaskId = this._state.tasks.length > 0 ? this._state.tasks[0].id : null;
        }
        this._persist();
        this._notify();
      }
      return removed;
    },

    setActive: function (taskId) {
      var task = this._state.tasks.find(function (t) { return t.id === taskId; });
      if (!task) return false;
      if (this._state.activeTaskId === taskId) return false;
      this._state.activeTaskId = taskId;
      if (task.status === "pending") {
        task.status = "in_progress";
        task.updatedAt = new Date().toISOString();
      }
      this._persist();
      this._notify();
      return true;
    },

    advanceToNext: function () {
      var sorted = this.getSortedTasks();
      var currentIdx = -1;
      if (this._state.activeTaskId) {
        currentIdx = sorted.findIndex(function (t) { return t.id === this._state.activeTaskId; }.bind(this));
      }
      for (var i = currentIdx + 1; i < sorted.length; i++) {
        if (sorted[i].status !== "completed") {
          return this.setActive(sorted[i].id);
        }
      }
      for (var j = 0; j < (currentIdx >= 0 ? currentIdx : sorted.length); j++) {
        if (sorted[j].status !== "completed") {
          return this.setActive(sorted[j].id);
        }
      }
      return false;
    },

    syncFromPage: function (pageId, pageData) {
      var task = this._state.tasks.find(function (t) { return t.pageId === pageId; });
      if (!task) return null;
      if (pageData.image !== undefined) task.image = pageData.image;
      if (pageData.markers !== undefined) task.markers = JSON.parse(JSON.stringify(pageData.markers));
      if (pageData.damageTypes !== undefined) {
        task.damageTypes = JSON.parse(JSON.stringify(pageData.damageTypes));
      }
      if (pageData.candidateSummary !== undefined) {
        if (pageData.candidateSummary) {
          task.candidateSummary = JSON.parse(JSON.stringify(pageData.candidateSummary));
        } else {
          delete task.candidateSummary;
        }
      }
      task.updatedAt = new Date().toISOString();
      this._persist();
      this._notify();
      return task;
    },

    syncDamageTypesFromState: function (volumeState) {
      var activeTask = this.activeTask;
      if (!activeTask || !volumeState || !volumeState.damageTypes) return false;
      activeTask.damageTypes = JSON.parse(JSON.stringify(volumeState.damageTypes));
      activeTask.updatedAt = new Date().toISOString();
      this._persist();
      this._notify();
      return true;
    },

    restoreDamageTypesToState: function (taskId, volumeState) {
      var task = this._state.tasks.find(function (t) { return t.id === taskId; });
      if (!task || !volumeState || !volumeState.setDamageTypes) return false;
      if (!task.damageTypes || task.damageTypes.length === 0) return false;
      return volumeState.setDamageTypes(task.damageTypes);
    },

    syncToPage: function (taskId, volumeState) {
      var task = this._state.tasks.find(function (t) { return t.id === taskId; });
      if (!task || !task.pageId) return false;
      if (!volumeState) return false;
      var page = volumeState.pages.find(function (p) { return p.id === task.pageId; });
      if (!page) return false;
      if (task.markers) {
        page.markers = JSON.parse(JSON.stringify(task.markers));
      }
      if (task.candidateSummary) {
        page.candidateSummary = JSON.parse(JSON.stringify(task.candidateSummary));
      } else if (page.candidateSummary) {
        delete page.candidateSummary;
      }
      page.updatedAt = new Date().toISOString();
      return true;
    },

    getSortedTasks: function (filter, search) {
      var tasks = this._state.tasks.slice();
      if (filter && filter !== "all") {
        tasks = tasks.filter(function (t) { return t.status === filter; });
      }
      if (search && search.trim()) {
        var q = search.trim().toLowerCase();
        tasks = tasks.filter(function (t) {
          return (t.pageName && t.pageName.toLowerCase().includes(q)) ||
                 (t.reviewNotes && t.reviewNotes.toLowerCase().includes(q)) ||
                 (t.id && t.id.toLowerCase().includes(q));
        });
      }
      var priorityOrder = { high: 0, normal: 1, low: 2 };
      var statusOrder = { in_progress: 0, pending: 1, completed: 2 };
      tasks.sort(function (a, b) {
        var sa = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 1;
        var sb = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 1;
        if (sa !== sb) return sa - sb;
        var pa = priorityOrder[a.priority] !== undefined ? priorityOrder[a.priority] : 1;
        var pb = priorityOrder[b.priority] !== undefined ? priorityOrder[b.priority] : 1;
        if (pa !== pb) return pa - pb;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      return tasks;
    },

    exportTasks: function (taskIds, includeImages) {
      var self = this;
      var tasks = taskIds && taskIds.length > 0
        ? this._state.tasks.filter(function (t) { return taskIds.includes(t.id); })
        : this._state.tasks.slice();
      var exported = tasks.map(function (t) {
        var copy = Object.assign({}, t);
        if (!includeImages) {
          copy.image = "";
          copy.imageIncluded = false;
        } else {
          copy.imageIncluded = Boolean(t.image);
        }
        return copy;
      });
      return {
        format: "archive-task-queue",
        formatVersion: "1.0",
        exportedAt: new Date().toISOString(),
        taskCount: exported.length,
        tasks: exported,
      };
    },

    importTasks: function (data) {
      if (!data || !Array.isArray(data.tasks)) {
        return { success: false, error: "无效的任务队列数据" };
      }
      var self = this;
      var existingIds = new Set(this._state.tasks.map(function (t) { return t.id; }));
      var added = 0;
      data.tasks.forEach(function (raw) {
        var task = normalizeTask(raw);
        if (task && !existingIds.has(task.id)) {
          self._state.tasks.push(task);
          existingIds.add(task.id);
          added++;
        }
      });
      if (!this._state.activeTaskId && this._state.tasks.length > 0) {
        this._state.activeTaskId = this._state.tasks[0].id;
      }
      this._persist();
      this._notify();
      return { success: true, added: added, skipped: data.tasks.length - added };
    },

    exportForPackage: function () {
      var tasks = this._state.tasks.map(function (t) {
        var copy = Object.assign({}, t);
        copy.image = "";
        copy.imageIncluded = false;
        return copy;
      });
      return {
        format: "archive-task-queue",
        formatVersion: "1.0",
        exportedAt: new Date().toISOString(),
        taskCount: tasks.length,
        activeTaskId: this._state.activeTaskId || null,
        createdAt: this._state.createdAt || null,
        updatedAt: this._state.updatedAt || null,
        tasks: tasks,
      };
    },

    replaceFromPackage: function (taskQueueData, restoredState) {
      if (!taskQueueData || !Array.isArray(taskQueueData.tasks)) {
        return { success: false, error: "无效的任务队列数据" };
      }
      var self = this;
      var damageTypes = (restoredState && Array.isArray(restoredState.damageTypes) && restoredState.damageTypes.length > 0)
        ? JSON.parse(JSON.stringify(restoredState.damageTypes))
        : [];
      var pageMap = {};
      if (restoredState && Array.isArray(restoredState.pages)) {
        restoredState.pages.forEach(function (p) { pageMap[p.id] = p; });
      }

      var normalized = taskQueueData.tasks.map(function (raw) {
        var task = normalizeTask(raw);
        if (!task) return null;
        if (damageTypes.length > 0) {
          task.damageTypes = JSON.parse(JSON.stringify(damageTypes));
        }
        if ((!task.image || task.image === "") && task.pageId && pageMap[task.pageId]) {
          task.image = pageMap[task.pageId].image || "";
        }
        return task;
      }).filter(Boolean);

      var now = new Date().toISOString();
      this._state = {
        tasks: normalized,
        activeTaskId: null,
        createdAt: taskQueueData.createdAt || now,
        updatedAt: now,
      };
      if (taskQueueData.activeTaskId && normalized.some(function (t) { return t.id === taskQueueData.activeTaskId; })) {
        this._state.activeTaskId = taskQueueData.activeTaskId;
      } else if (normalized.length > 0) {
        this._state.activeTaskId = normalized[0].id;
      }
      var persisted = this._persist();
      if (!persisted) {
        return { success: false, error: "任务队列写入存储失败，浏览器存储空间可能已满", taskCount: normalized.length };
      }
      this._notify();
      return { success: true, taskCount: normalized.length };
    },

    rebuildFromPages: function (pages, damageTypes) {
      var self = this;
      var dt = (Array.isArray(damageTypes) && damageTypes.length > 0)
        ? JSON.parse(JSON.stringify(damageTypes))
        : [];
      var tasks = (pages || []).map(function (page) {
        return normalizeTask({
          id: crypto.randomUUID(),
          pageName: page.name || page.fileName || "",
          priority: "normal",
          status: (page.markers && page.markers.length > 0) ? "in_progress" : "pending",
          pageId: page.id,
          image: page.image || "",
          damageTypes: dt,
          markers: page.markers ? JSON.parse(JSON.stringify(page.markers)) : [],
          reviewNotes: "",
          completedAt: null,
          createdAt: page.createdAt || new Date().toISOString(),
          updatedAt: page.updatedAt || new Date().toISOString(),
        });
      }).filter(Boolean);

      var now = new Date().toISOString();
      this._state = {
        tasks: tasks,
        activeTaskId: tasks.length > 0 ? tasks[0].id : null,
        createdAt: now,
        updatedAt: now,
      };
      var persisted = this._persist();
      if (!persisted) {
        return { success: false, error: "任务队列写入存储失败，浏览器存储空间可能已满", taskCount: tasks.length };
      }
      this._notify();
      return { success: true, taskCount: tasks.length };
    },

    reload: function () {
      this._state = normalizeTaskState(readRaw());
      this._notify();
    },

    backup: taskBackup,
    restoreBackup: function () {
      var ok = taskRestoreBackup();
      if (ok) {
        this._state = normalizeTaskState(readRaw());
        this._notify();
      }
      return ok;
    },
    clearBackup: taskClearBackup,
    verifyBackupIntegrity: taskVerifyBackupIntegrity,
    createSnapshot: taskCreateSnapshot,
    restoreSnapshot: function () {
      var ok = taskRestoreSnapshot();
      if (ok) {
        this._state = normalizeTaskState(readRaw());
        this._notify();
      }
      return ok;
    },
    clearSnapshot: taskClearSnapshot,
    getSnapshotMeta: taskGetSnapshotMeta,

    clearCompleted: function () {
      var before = this._state.tasks.length;
      this._state.tasks = this._state.tasks.filter(function (t) { return t.status !== "completed"; });
      if (this._state.activeTaskId && !this._state.tasks.some(function (t) { return t.id === this._state.activeTaskId; }.bind(this))) {
        this._state.activeTaskId = this._state.tasks.length > 0 ? this._state.tasks[0].id : null;
      }
      this._persist();
      this._notify();
      return before - this._state.tasks.length;
    },

    clearAll: function () {
      this._state = JSON.parse(JSON.stringify(DEFAULT_TASK_STATE));
      this._state.createdAt = new Date().toISOString();
      this._state.updatedAt = new Date().toISOString();
      this._persist();
      this._notify();
    },

    _migrateFromVolumeData: function () {
      var migrated = false;
      try {
        migrated = localStorage.getItem(TASK_MIGRATION_KEY) === "1";
      } catch (e) {}

      if (migrated) return;

      try {
        var volumeState = global.VolumeStorage ? global.VolumeStorage.load() : null;
        if (!volumeState || !Array.isArray(volumeState.pages) || volumeState.pages.length === 0) {
          try { localStorage.setItem(TASK_MIGRATION_KEY, "1"); } catch (e) {}
          return;
        }

        var existingPageIds = new Set(this._state.tasks.map(function (t) { return t.pageId; }).filter(Boolean));
        var addedCount = 0;

        volumeState.pages.forEach(function (page) {
          if (existingPageIds.has(page.id)) return;
          var task = normalizeTask({
            id: crypto.randomUUID(),
            pageName: page.name || page.fileName || "",
            priority: "normal",
            status: page.markers && page.markers.length > 0 ? "in_progress" : "pending",
            pageId: page.id,
            image: page.image || "",
            damageTypes: volumeState.damageTypes ? JSON.parse(JSON.stringify(volumeState.damageTypes)) : [],
            markers: page.markers ? JSON.parse(JSON.stringify(page.markers)) : [],
            reviewNotes: "",
            completedAt: null,
            createdAt: page.createdAt || new Date().toISOString(),
            updatedAt: page.updatedAt || new Date().toISOString(),
          });
          if (task) {
            this._state.tasks.push(task);
            addedCount++;
          }
        }.bind(this));

        if (addedCount > 0) {
          if (!this._state.activeTaskId && this._state.tasks.length > 0) {
            this._state.activeTaskId = this._state.tasks[0].id;
          }
          this._persist();
          this._notify();
        }

        try { localStorage.setItem(TASK_MIGRATION_KEY, "1"); } catch (e) {}
      } catch (e) {
        console.error("任务队列迁移失败", e);
      }
    },
  };

  var self = TaskQueue;
  global.TaskQueue = TaskQueue;
})(window);
