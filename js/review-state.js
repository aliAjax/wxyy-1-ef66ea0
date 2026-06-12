(function (global) {
  const REVIEW_STATUSES = ["pending", "passed", "doubtful", "rejected"];
  const STATUS_LABELS = {
    pending: "待复核",
    passed: "已通过",
    doubtful: "存疑",
    rejected: "已退回",
  };

  const listeners = new Set();

  const DEFAULT_STATE = {
    sourceData: null,
    volume: null,
    pages: [],
    flatRecords: [],
    currentRecordIndex: -1,
    filters: {
      status: "all",
      pageId: "all",
    },
    importedAt: null,
  };

  function initializeReviews(pages) {
    return pages.map((page) => ({
      ...page,
      markers: page.markers.map((marker) => ({
        ...marker,
        review: {
          status: "pending",
          comment: "",
          reviewedAt: null,
        },
      })),
    }));
  }

  function buildFlatRecords(pages) {
    const records = [];
    pages.forEach((page, pageIdx) => {
      page.markers.forEach((marker, markerIdx) => {
        records.push({
          id: marker.id,
          pageId: page.id,
          pageIndex: pageIdx,
          pageName: page.name || page.fileName || `第 ${pageIdx + 1} 页`,
          markerIndex: markerIdx,
          marker,
          type: marker.type,
          mode: marker.mode,
          x: marker.x,
          y: marker.y,
          width: marker.width,
          height: marker.height,
          note: marker.note,
          createdAt: marker.createdAt,
          review: marker.review,
        });
      });
    });
    return records;
  }

  function validateImportData(data) {
    if (!data || typeof data !== "object") {
      return { valid: false, error: "数据格式错误" };
    }
    if (!data.format || data.format !== "archive-volume-damage") {
      return { valid: false, error: "不是有效的古籍损伤标记数据文件" };
    }
    if (!data.pages || !Array.isArray(data.pages)) {
      return { valid: false, error: "数据中没有页面信息" };
    }
    const hasMarkers = data.pages.some((p) => p.markers && p.markers.length > 0);
    if (!hasMarkers) {
      return { valid: false, error: "数据中没有任何损伤标记" };
    }
    return { valid: true };
  }

  const ReviewState = {
    _state: structuredClone(DEFAULT_STATE),

    STATUSES: REVIEW_STATUSES,
    STATUS_LABELS: STATUS_LABELS,

    init() {
      this._state = structuredClone(DEFAULT_STATE);
    },

    get hasData() {
      return this._state.sourceData !== null;
    },

    get volume() {
      return this._state.volume;
    },

    get pages() {
      return this._state.pages;
    },

    get allRecords() {
      return this._state.flatRecords;
    },

    get filteredRecords() {
      const { status, pageId } = this._state.filters;
      return this._state.flatRecords.filter((r) => {
        if (status !== "all" && r.review.status !== status) return false;
        if (pageId !== "all" && r.pageId !== pageId) return false;
        return true;
      });
    },

    get currentRecord() {
      const filtered = this.filteredRecords;
      if (this._state.currentRecordIndex < 0 || this._state.currentRecordIndex >= filtered.length) {
        return null;
      }
      return filtered[this._state.currentRecordIndex];
    },

    get currentIndex() {
      return this._state.currentRecordIndex;
    },

    get filters() {
      return { ...this._state.filters };
    },

    get stats() {
      const counts = {
        pending: 0,
        passed: 0,
        doubtful: 0,
        rejected: 0,
        total: this._state.flatRecords.length,
      };
      this._state.flatRecords.forEach((r) => {
        if (counts[r.review.status] !== undefined) {
          counts[r.review.status] += 1;
        }
      });
      const reviewed = counts.total - counts.pending;
      counts.progress = counts.total > 0 ? Math.round((reviewed / counts.total) * 100) : 0;
      return counts;
    },

    _notify() {
      listeners.forEach((fn) => {
        try {
          fn(this._state);
        } catch (e) {
          console.error("复核状态监听回调异常", e);
        }
      });
    },

    subscribe(fn) {
      if (typeof fn !== "function") return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    importData(rawData) {
      const validation = validateImportData(rawData);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      try {
        const pages = initializeReviews(rawData.pages);
        this._state.sourceData = structuredClone(rawData);
        this._state.volume = rawData.volume ? structuredClone(rawData.volume) : null;
        this._state.pages = pages;
        this._state.flatRecords = buildFlatRecords(pages);
        this._state.currentRecordIndex = this._state.flatRecords.length > 0 ? 0 : -1;
        this._state.importedAt = new Date().toISOString();
        this._notify();
        return { success: true };
      } catch (e) {
        console.error("导入数据失败", e);
        return { success: false, error: "数据解析失败：" + e.message };
      }
    },

    setFilter(type, value) {
      if (type === "status" && (value === "all" || REVIEW_STATUSES.includes(value))) {
        this._state.filters.status = value;
      } else if (type === "pageId") {
        this._state.filters.pageId = value;
      } else {
        return false;
      }
      this._state.currentRecordIndex = this.filteredRecords.length > 0 ? 0 : -1;
      this._notify();
      return true;
    },

    selectRecord(index) {
      const filtered = this.filteredRecords;
      if (index < 0 || index >= filtered.length) return false;
      this._state.currentRecordIndex = index;
      this._notify();
      return true;
    },

    selectRecordById(markerId) {
      const filtered = this.filteredRecords;
      const index = filtered.findIndex((r) => r.id === markerId);
      if (index === -1) return false;
      this._state.currentRecordIndex = index;
      this._notify();
      return true;
    },

    nextRecord() {
      const filtered = this.filteredRecords;
      if (filtered.length === 0) return false;
      const next = (this._state.currentRecordIndex + 1) % filtered.length;
      this._state.currentRecordIndex = next;
      this._notify();
      return true;
    },

    prevRecord() {
      const filtered = this.filteredRecords;
      if (filtered.length === 0) return false;
      const prev = (this._state.currentRecordIndex - 1 + filtered.length) % filtered.length;
      this._state.currentRecordIndex = prev;
      this._notify();
      return true;
    },

    setReviewStatus(markerId, status, comment) {
      if (!REVIEW_STATUSES.includes(status) || status === "pending") return false;

      const record = this._state.flatRecords.find((r) => r.id === markerId);
      if (!record) return false;

      record.review.status = status;
      record.review.comment = (comment || "").trim();
      record.review.reviewedAt = new Date().toISOString();

      const page = this._state.pages.find((p) => p.id === record.pageId);
      if (page) {
        const marker = page.markers.find((m) => m.id === markerId);
        if (marker) {
          marker.review = { ...record.review };
        }
      }

      this._notify();
      return true;
    },

    resetReview(markerId) {
      const record = this._state.flatRecords.find((r) => r.id === markerId);
      if (!record) return false;

      record.review.status = "pending";
      record.review.comment = "";
      record.review.reviewedAt = null;

      const page = this._state.pages.find((p) => p.id === record.pageId);
      if (page) {
        const marker = page.markers.find((m) => m.id === markerId);
        if (marker) {
          marker.review = { ...record.review };
        }
      }

      this._notify();
      return true;
    },

    resetAllReviews() {
      if (!this.hasData) return false;

      this._state.flatRecords.forEach((record) => {
        record.review.status = "pending";
        record.review.comment = "";
        record.review.reviewedAt = null;
      });

      this._state.pages.forEach((page) => {
        page.markers.forEach((marker) => {
          marker.review = {
            status: "pending",
            comment: "",
            reviewedAt: null,
          };
        });
      });

      this._notify();
      return true;
    },

    exportReviewed() {
      if (!this.hasData) return null;

      const source = this._state.sourceData;
      const pages = this._state.pages.map((p) => ({
        id: p.id,
        name: p.name,
        fileName: p.fileName,
        imageIncluded:
          typeof p.imageIncluded === "boolean" ? p.imageIncluded : Boolean(p.image),
        markers: p.markers.map((m) => ({
          id: m.id,
          type: m.type,
          mode: m.mode,
          note: m.note,
          x: m.x,
          y: m.y,
          ...(m.mode === "region" ? { width: m.width, height: m.height } : {}),
          createdAt: m.createdAt,
          review: {
            status: m.review.status,
            comment: m.review.comment,
            reviewedAt: m.review.reviewedAt,
          },
        })),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));

      const reviewStats = this.stats;

      return {
        format: "archive-volume-damage",
        formatVersion: "1.2",
        exportedAt: new Date().toISOString(),
        reviewedAt: new Date().toISOString(),
        volume: source.volume
          ? {
              ...source.volume,
              reviewStats: {
                total: reviewStats.total,
                passed: reviewStats.passed,
                doubtful: reviewStats.doubtful,
                rejected: reviewStats.rejected,
                pending: reviewStats.pending,
                progress: reviewStats.progress,
              },
            }
          : null,
        pages,
      };
    },
  };

  global.ReviewState = ReviewState;
})(window);
