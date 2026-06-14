(function (global) {
  var TASK_STORAGE_KEY = "wxyy-1-task-queue";
  var TASK_MIGRATION_KEY = "wxyy-1-task-queue-migrated";

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

  function normalizeTask(raw) {
    if (!raw || typeof raw !== "object" || !raw.id) return null;
    return {
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
  }

  function normalizeTaskState(raw) {
    if (!raw || typeof raw !== "object") {
      return structuredClone(DEFAULT_TASK_STATE);
    }
    var state = Object.assign(structuredClone(DEFAULT_TASK_STATE), raw);
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
      writeRaw(this._state);
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
      var task = normalizeTask({
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
      });
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
        damageTypes = structuredClone(volumeState.damageTypes);
      }
      return this.createTask({
        pageName: page.name || page.fileName || "",
        pageId: page.id,
        image: page.image || "",
        damageTypes: damageTypes,
        markers: page.markers ? structuredClone(page.markers) : [],
      });
    },

    updateTask: function (taskId, updates) {
      var task = this._state.tasks.find(function (t) { return t.id === taskId; });
      if (!task) return null;
      var allowed = ["pageName", "priority", "status", "reviewNotes", "image", "markers", "damageTypes"];
      allowed.forEach(function (key) {
        if (updates[key] !== undefined) {
          task[key] = updates[key];
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
      if (pageData.markers !== undefined) task.markers = structuredClone(pageData.markers);
      task.updatedAt = new Date().toISOString();
      this._persist();
      this._notify();
      return task;
    },

    syncToPage: function (taskId, volumeState) {
      var task = this._state.tasks.find(function (t) { return t.id === taskId; });
      if (!task || !task.pageId) return false;
      if (!volumeState) return false;
      var page = volumeState.pages.find(function (p) { return p.id === task.pageId; });
      if (!page) return false;
      if (task.markers) {
        page.markers = structuredClone(task.markers);
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
      this._state = structuredClone(DEFAULT_TASK_STATE);
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
            damageTypes: volumeState.damageTypes ? structuredClone(volumeState.damageTypes) : [],
            markers: page.markers ? structuredClone(page.markers) : [],
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
