(function (global) {
  const { TYPES } = global.VolumeStorage;

  const listeners = new Set();

  const VolumeState = {
    _state: null,

    init() {
      this._state = global.VolumeStorage.load();
      this._touchCurrentPage();
    },

    get all() {
      return this._state;
    },

    get pages() {
      return this._state.pages;
    },

    get currentPageId() {
      return this._state.currentPageId;
    },

    get currentPage() {
      return (
        this._state.pages.find((p) => p.id === this._state.currentPageId) ||
        null
      );
    },

    get currentIndex() {
      return this._state.pages.findIndex(
        (p) => p.id === this._state.currentPageId
      );
    },

    get hasPages() {
      return this._state.pages.length > 0;
    },

    _touchCurrentPage() {
      const page = this.currentPage;
      if (page) page.updatedAt = new Date().toISOString();
    },

    _persist() {
      global.VolumeStorage.save(this._state);
    },

    _notify() {
      listeners.forEach((fn) => {
        try {
          fn(this._state);
        } catch (e) {
          console.error("状态监听回调异常", e);
        }
      });
    },

    subscribe(fn) {
      if (typeof fn !== "function") return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    setVolumeMeta({ volumeId, volumeTitle }) {
      if (volumeId !== undefined) this._state.volumeId = String(volumeId);
      if (volumeTitle !== undefined)
        this._state.volumeTitle = String(volumeTitle);
      this._persist();
      this._notify();
    },

    addPages(newPages) {
      if (!Array.isArray(newPages) || newPages.length === 0) return 0;
      const existingIds = new Set(this._state.pages.map((p) => p.id));
      const toAdd = newPages.filter((p) => p && !existingIds.has(p.id));
      if (toAdd.length === 0) return 0;
      this._state.pages.push(...toAdd);
      if (!this._state.currentPageId) {
        this._state.currentPageId = toAdd[0].id;
      }
      this._persist();
      this._notify();
      return toAdd.length;
    },

    switchPage(pageId) {
      if (!pageId) return false;
      const exists = this._state.pages.some((p) => p.id === pageId);
      if (!exists) return false;
      if (this._state.currentPageId === pageId) return false;
      this._state.currentPageId = pageId;
      this._touchCurrentPage();
      this._persist();
      this._notify();
      return true;
    },

    switchToIndex(index) {
      if (!this.hasPages) return false;
      const len = this._state.pages.length;
      const wrapped = ((index % len) + len) % len;
      return this.switchPage(this._state.pages[wrapped].id);
    },

    switchNext() {
      if (!this.hasPages) return false;
      const idx = this.currentIndex;
      if (idx === -1) return this.switchToIndex(0);
      return this.switchToIndex(idx + 1);
    },

    switchPrev() {
      if (!this.hasPages) return false;
      const idx = this.currentIndex;
      if (idx === -1) return this.switchToIndex(0);
      return this.switchToIndex(idx - 1);
    },

    removePage(pageId) {
      const idx = this._state.pages.findIndex((p) => p.id === pageId);
      if (idx === -1) return false;
      const removed = this._state.pages.splice(idx, 1)[0];
      if (this._state.currentPageId === pageId) {
        if (this._state.pages.length > 0) {
          const fallbackIdx = Math.min(idx, this._state.pages.length - 1);
          this._state.currentPageId = this._state.pages[fallbackIdx].id;
        } else {
          this._state.currentPageId = null;
        }
      }
      this._touchCurrentPage();
      this._persist();
      this._notify();
      return removed;
    },

    addMarker({ type, note, x, y }) {
      const page = this.currentPage;
      if (!page) return null;
      if (!TYPES.includes(type)) return null;
      const marker = {
        id: crypto.randomUUID(),
        type,
        note: (note || "").trim(),
        x: Number(Number(x).toFixed(2)),
        y: Number(Number(y).toFixed(2)),
        createdAt: new Date().toISOString(),
      };
      page.markers.push(marker);
      page.updatedAt = marker.createdAt;
      this._persist();
      this._notify();
      return marker;
    },

    removeMarker(markerId) {
      const page = this.currentPage;
      if (!page) return false;
      const before = page.markers.length;
      page.markers = page.markers.filter((m) => m.id !== markerId);
      if (page.markers.length === before) return false;
      page.updatedAt = new Date().toISOString();
      this._persist();
      this._notify();
      return true;
    },

    clearCurrentMarkers() {
      const page = this.currentPage;
      if (!page) return false;
      if (page.markers.length === 0) return false;
      page.markers = [];
      page.updatedAt = new Date().toISOString();
      this._persist();
      this._notify();
      return true;
    },

    clearCurrentPage() {
      const page = this.currentPage;
      if (!page) return false;
      page.image = "";
      page.markers = [];
      page.updatedAt = new Date().toISOString();
      this._persist();
      this._notify();
      return true;
    },

    resetAll() {
      this._state = global.VolumeStorage.reset();
      this._notify();
    },

    getMarkerCounts(page) {
      const counts = Object.fromEntries(TYPES.map((t) => [t, 0]));
      if (!page || !Array.isArray(page.markers)) return counts;
      page.markers.forEach((m) => {
        if (counts[m.type] !== undefined) counts[m.type] += 1;
      });
      return counts;
    },

    getTotalCounts() {
      const counts = Object.fromEntries(TYPES.map((t) => [t, 0]));
      this._state.pages.forEach((p) =>
        p.markers.forEach((m) => {
          if (counts[m.type] !== undefined) counts[m.type] += 1;
        })
      );
      return counts;
    },

    getTotalMarkers() {
      return this._state.pages.reduce((acc, p) => acc + p.markers.length, 0);
    },
  };

  global.VolumeState = VolumeState;
})(window);
