(function (global) {
  const { MODES, DEFAULT_DAMAGE_TYPES } = global.VolumeStorage;

  const listeners = new Set();

  function refreshMarkerTypeNames(state) {
    const typeMap = Object.fromEntries(
      state.damageTypes.map((t) => [t.id, t.name])
    );
    state.pages.forEach((p) => {
      p.markers.forEach((m) => {
        if (m.typeId && typeMap[m.typeId]) {
          m.type = typeMap[m.typeId];
        }
      });
    });
  }

  function usedTypeIds(state) {
    const ids = new Set();
    state.pages.forEach((p) => {
      p.markers.forEach((m) => {
        if (m.typeId) ids.add(m.typeId);
      });
    });
    return ids;
  }

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

    get damageTypes() {
      return this._state.damageTypes;
    },

    get TYPES() {
      return this._state.damageTypes.map((t) => t.name);
    },

    findTypeById(typeId) {
      return this._state.damageTypes.find((t) => t.id === typeId) || null;
    },

    findTypeByName(name) {
      return this._state.damageTypes.find((t) => t.name === name) || null;
    },

    isValidTypeId(typeId) {
      return this._state.damageTypes.some((t) => t.id === typeId);
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

    addMarker({ typeId, type, note, x, y, realX, realY }) {
      const page = this.currentPage;
      if (!page) return null;
      let resolvedTypeId;
      if (typeId && this.isValidTypeId(typeId)) {
        resolvedTypeId = typeId;
      } else if (type) {
        const byName = this.findTypeByName(type);
        if (byName) resolvedTypeId = byName.id;
      }
      if (!resolvedTypeId) return null;
      const typeInfo = this.findTypeById(resolvedTypeId);
      const marker = {
        id: crypto.randomUUID(),
        mode: "point",
        typeId: resolvedTypeId,
        type: typeInfo.name,
        note: (note || "").trim(),
        x: Number(Number(x).toFixed(2)),
        y: Number(Number(y).toFixed(2)),
        createdAt: new Date().toISOString(),
      };
      if (realX !== undefined && realY !== undefined) {
        marker.realX = Number(Number(realX).toFixed(2));
        marker.realY = Number(Number(realY).toFixed(2));
      }
      page.markers.push(marker);
      page.updatedAt = marker.createdAt;
      this._persist();
      this._notify();
      return marker;
    },

    addRegion({ typeId, type, note, x, y, width, height, realX, realY, realWidth, realHeight }) {
      const page = this.currentPage;
      if (!page) return null;
      let resolvedTypeId;
      if (typeId && this.isValidTypeId(typeId)) {
        resolvedTypeId = typeId;
      } else if (type) {
        const byName = this.findTypeByName(type);
        if (byName) resolvedTypeId = byName.id;
      }
      if (!resolvedTypeId) return null;
      const typeInfo = this.findTypeById(resolvedTypeId);
      const marker = {
        id: crypto.randomUUID(),
        mode: "region",
        typeId: resolvedTypeId,
        type: typeInfo.name,
        note: (note || "").trim(),
        x: Number(Number(x).toFixed(2)),
        y: Number(Number(y).toFixed(2)),
        width: Number(Number(width || 0).toFixed(2)),
        height: Number(Number(height || 0).toFixed(2)),
        createdAt: new Date().toISOString(),
      };
      if (realX !== undefined && realY !== undefined) {
        marker.realX = Number(Number(realX).toFixed(2));
        marker.realY = Number(Number(realY).toFixed(2));
      }
      if (realWidth !== undefined && realHeight !== undefined) {
        marker.realWidth = Number(Number(realWidth).toFixed(2));
        marker.realHeight = Number(Number(realHeight).toFixed(2));
      }
      if (marker.width < 1 || marker.height < 1) return null;
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

    addDamageType({ name, color }) {
      if (!name || !name.trim()) return null;
      const normalizedName = name.trim();
      if (!color) return null;
      if (this._state.damageTypes.some((t) => t.name === normalizedName)) {
        return null;
      }
      const type = {
        id: "type-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12),
        name: normalizedName,
        color,
      };
      this._state.damageTypes.push(type);
      this._persist();
      this._notify();
      return type;
    },

    renameDamageType(typeId, newName) {
      if (!newName || !newName.trim()) return false;
      const normalizedName = newName.trim();
      const existing = this._state.damageTypes.find((t) => t.id === typeId);
      if (!existing) return false;
      if (
        this._state.damageTypes.some(
          (t) => t.id !== typeId && t.name === normalizedName
        )
      ) {
        return false;
      }
      existing.name = normalizedName;
      refreshMarkerTypeNames(this._state);
      this._persist();
      this._notify();
      return true;
    },

    setDamageTypeColor(typeId, color) {
      if (!color) return false;
      const existing = this._state.damageTypes.find((t) => t.id === typeId);
      if (!existing) return false;
      existing.color = color;
      this._persist();
      this._notify();
      return true;
    },

    deleteDamageType(typeId, targetTypeId) {
      const existingIdx = this._state.damageTypes.findIndex(
        (t) => t.id === typeId
      );
      if (existingIdx === -1) return false;
      if (this._state.damageTypes.length <= 1) return false;
      let resolvedTarget = targetTypeId;
      if (!resolvedTarget || !this.isValidTypeId(resolvedTarget) || resolvedTarget === typeId) {
        resolvedTarget = this._state.damageTypes.find((t) => t.id !== typeId).id;
      }
      const targetType = this.findTypeById(resolvedTarget);
      this._state.pages.forEach((p) => {
        p.markers.forEach((m) => {
          if (m.typeId === typeId) {
            m.typeId = resolvedTarget;
            m.type = targetType ? targetType.name : m.type;
          }
        });
      });
      this._state.damageTypes.splice(existingIdx, 1);
      this._persist();
      this._notify();
      return true;
    },

    getUsedTypeIds() {
      return usedTypeIds(this._state);
    },

    getMarkerCounts(page) {
      const types = this._state.damageTypes;
      const counts = Object.fromEntries(types.map((t) => [t.id, 0]));
      const nameCounts = Object.fromEntries(types.map((t) => [t.name, 0]));
      if (!page || !Array.isArray(page.markers)) {
        return { byId: counts, byName: nameCounts, types };
      }
      page.markers.forEach((m) => {
        if (m.typeId && counts[m.typeId] !== undefined) {
          counts[m.typeId] += 1;
          const t = this.findTypeById(m.typeId);
          if (t) nameCounts[t.name] += 1;
        }
      });
      return { byId: counts, byName: nameCounts, types };
    },

    getTotalCounts() {
      const types = this._state.damageTypes;
      const counts = Object.fromEntries(types.map((t) => [t.id, 0]));
      const nameCounts = Object.fromEntries(types.map((t) => [t.name, 0]));
      this._state.pages.forEach((p) =>
        p.markers.forEach((m) => {
          if (m.typeId && counts[m.typeId] !== undefined) {
            counts[m.typeId] += 1;
            const t = this.findTypeById(m.typeId);
            if (t) nameCounts[t.name] += 1;
          }
        })
      );
      return { byId: counts, byName: nameCounts, types };
    },

    getTotalMarkers() {
      return this._state.pages.reduce((acc, p) => acc + p.markers.length, 0);
    },
  };

  global.VolumeState = VolumeState;
})(window);
