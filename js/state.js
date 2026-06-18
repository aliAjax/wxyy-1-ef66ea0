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

    hasData() {
      if (this._state.pages.length > 0) return true;
      if (this._state.volumeId || this._state.volumeTitle) return true;
      return false;
    },

    getImportPreview(packageData) {
      if (!packageData) return null;
      var summary = global.ProjectPackage.getPackageSummary(packageData);
      var restoreCheck = global.ProjectPackage.validateForRestore(packageData);
      var estimate = global.VolumeStorage.getRestoreEstimate(packageData);
      return {
        summary: summary,
        restoreCheck: restoreCheck,
        estimate: estimate,
        hasExistingData: this.hasData(),
        currentDataSummary: this.hasData() ? {
          pageCount: this._state.pages.length,
          totalMarkers: this.getTotalMarkers(),
          projectTitle: this._state.volumeTitle || "",
        } : null,
      };
    },

    preImportValidation(packageData) {
      var result = {
        canProceed: true,
        warnings: [],
        errors: [],
        quotaOk: true,
      };

      if (!packageData) {
        result.canProceed = false;
        result.errors.push("包数据为空");
        return result;
      }

      var preCheck = global.ProjectPackage.validateForRestore(packageData);
      if (!preCheck.canRestore) {
        result.canProceed = false;
        preCheck.issues.forEach(function (i) {
          result.errors.push(i.message || String(i));
        });
        return result;
      }

      if (preCheck.warnings && preCheck.warnings.length > 0) {
        result.warnings = result.warnings.concat(preCheck.warnings);
      }

      var estimatedSize = preCheck.estimatedStorageSize || 0;
      var preFlight = global.VolumeStorage.preFlightCheck(estimatedSize);
      if (!preFlight.canProceed) {
        result.quotaOk = false;
        result.canProceed = false;
        result.errors.push("存储空间不足，无法完成导入");
      }

      return result;
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

    restoreFromPackage(packageData) {
      var preCheck = global.ProjectPackage.validateForRestore(packageData);
      if (!preCheck.canRestore) {
        var preErrorMsg = preCheck.issues.map(function (i) {
          return i.message || String(i);
        }).join("；");
        return {
          success: false,
          error: new Error(preErrorMsg || "工作包验证未通过，无法恢复"),
          rolledBack: false,
          errorMessage: preErrorMsg || "工作包验证未通过",
          isQuotaError: false,
          preCheckFailed: true,
        };
      }

      var snapshotResult = global.VolumeStorage.createSnapshot();
      var backupSuccess = global.VolumeStorage.backup();

      var hasTaskQueue = !!global.TaskQueue;
      var taskSnapshotResult = hasTaskQueue ? global.TaskQueue.createSnapshot() : { success: false };
      var taskBackupSuccess = hasTaskQueue ? global.TaskQueue.backup() : false;

      var failedDuringTaskQueue = false;
      var taskQueueErrorDetail = null;

      try {
        var newState = global.VolumeStorage.restoreFromPackage(packageData);

        if (!newState || !Array.isArray(newState.pages) || newState.pages.length === 0) {
          throw new Error("恢复后的状态数据无效");
        }

        var integrityCheck = global.ProjectPackage.verifyRoundTripIntegrity(packageData, newState);
        if (!integrityCheck.valid) {
          console.warn("往返完整性校验发现问题:", integrityCheck.issues);
          if (integrityCheck.issues.some(function (i) { return i.indexOf("页面数量") !== -1 || i.indexOf("标记数量") !== -1; })) {
            throw new Error("数据完整性校验失败：" + integrityCheck.issues.join("；"));
          }
        }

        var saveSuccess = global.VolumeStorage.save(newState);
        if (!saveSuccess) {
          throw new Error("保存恢复后的数据失败，可能是浏览器存储空间不足");
        }

        this._state = newState;
        this._touchCurrentPage();
        refreshMarkerTypeNames(this._state);
        this._notify();

        var taskResult = { success: true, skipped: true, taskCount: 0, rebuilt: false };
        if (hasTaskQueue) {
          if (packageData.taskQueue && Array.isArray(packageData.taskQueue.tasks)) {
            taskResult = global.TaskQueue.replaceFromPackage(packageData.taskQueue, newState);
            taskResult.rebuilt = false;
          } else {
            taskResult = global.TaskQueue.rebuildFromPages(newState.pages, newState.damageTypes);
            taskResult.rebuilt = true;
          }
          if (!taskResult.success) {
            failedDuringTaskQueue = true;
            taskQueueErrorDetail = taskResult.error || null;
            throw new Error("任务队列恢复失败：" + (taskResult.error || "未知错误"));
          }
        }

        if (backupSuccess) {
          global.VolumeStorage.clearBackup();
        }
        global.VolumeStorage.clearSnapshot();
        if (hasTaskQueue) {
          if (taskBackupSuccess) {
            global.TaskQueue.clearBackup();
          }
          global.TaskQueue.clearSnapshot();
        }

        return {
          success: true,
          state: newState,
          pageCount: newState.pages.length,
          markerCount: newState.pages.reduce(function (acc, p) {
            return acc + (p.markers ? p.markers.length : 0);
          }, 0),
          taskCount: taskResult.taskCount,
          taskQueueRestored: !taskResult.skipped,
          taskQueueRebuilt: taskResult.rebuilt,
          warnings: (preCheck.warnings || []).concat(integrityCheck.warnings || []),
          projectTitle: newState.volumeTitle || "",
          snapshotMeta: snapshotResult.success ? snapshotResult.meta : null,
        };
      } catch (e) {
        console.error("恢复工作包失败，正在回滚", e);

        var rolledBack = false;
        var rollbackMethod = "none";

        if (snapshotResult.success) {
          rolledBack = global.VolumeStorage.restoreSnapshot();
          rollbackMethod = rolledBack ? "snapshot" : "none";
        }

        if (!rolledBack && backupSuccess) {
          var backupValid = global.VolumeStorage.verifyBackupIntegrity();
          if (backupValid.valid) {
            rolledBack = global.VolumeStorage.restoreBackup();
            rollbackMethod = rolledBack ? "backup" : "none";
          }
        }

        if (rolledBack) {
          this._state = global.VolumeStorage.load();
          this._notify();
        }

        global.VolumeStorage.clearSnapshot();

        var taskRolledBack = false;
        if (hasTaskQueue) {
          if (taskSnapshotResult.success) {
            taskRolledBack = global.TaskQueue.restoreSnapshot();
          }
          if (!taskRolledBack && taskBackupSuccess) {
            var taskBackupValid = global.TaskQueue.verifyBackupIntegrity();
            if (taskBackupValid.valid) {
              taskRolledBack = global.TaskQueue.restoreBackup();
            }
          }
          if (!taskRolledBack) {
            try { global.TaskQueue.reload(); } catch (reloadErr) {
              console.error("任务队列重新加载失败", reloadErr);
            }
          }
          global.TaskQueue.clearSnapshot();
        }

        var isQuotaError = e.name === "QuotaExceededError" ||
          (e.message && e.message.indexOf("quota") !== -1) ||
          (e.message && e.message.indexOf("存储空间") !== -1);

        return {
          success: false,
          error: e,
          rolledBack: rolledBack,
          rollbackMethod: rollbackMethod,
          taskRolledBack: taskRolledBack,
          failedDuringTaskQueue: failedDuringTaskQueue,
          taskQueueErrorDetail: taskQueueErrorDetail,
          errorMessage: e.message || String(e),
          isQuotaError: isQuotaError,
          backupWasCreated: backupSuccess,
          snapshotWasCreated: snapshotResult.success,
        };
      }
    },

    checkImportQuota(packageData) {
      var estimatedSize = global.ProjectPackage.estimatePackageStorageSize(packageData);
      var quotaInfo = global.ProjectPackage.checkStorageQuota(estimatedSize);
      return quotaInfo;
    },

    resetAll() {
      this._state = global.VolumeStorage.reset();
      this._notify();
    },

    setDamageTypes(types) {
      if (!Array.isArray(types)) return false;
      var validTypes = types.filter(function (t) {
        return t && t.id && t.name && t.color;
      });
      if (validTypes.length === 0) return false;
      this._state.damageTypes = JSON.parse(JSON.stringify(validTypes));
      refreshMarkerTypeNames(this._state);
      this._persist();
      this._notify();
      return true;
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
      const reviewCounts = { passed: 0, doubtful: 0, rejected: 0, pending: 0, total: 0 };
      if (!page || !Array.isArray(page.markers)) {
        return { byId: counts, byName: nameCounts, types, reviewCounts };
      }
      page.markers.forEach((m) => {
        if (m.typeId && counts[m.typeId] !== undefined) {
          counts[m.typeId] += 1;
          const t = this.findTypeById(m.typeId);
          if (t) nameCounts[t.name] += 1;
        }
        reviewCounts.total++;
        if (m.review && m.review.status) {
          if (reviewCounts[m.review.status] !== undefined) {
            reviewCounts[m.review.status]++;
          }
        } else {
          reviewCounts.pending++;
        }
      });
      return { byId: counts, byName: nameCounts, types, reviewCounts };
    },

    getTotalCounts() {
      const types = this._state.damageTypes;
      const counts = Object.fromEntries(types.map((t) => [t.id, 0]));
      const nameCounts = Object.fromEntries(types.map((t) => [t.name, 0]));
      const reviewCounts = { passed: 0, doubtful: 0, rejected: 0, pending: 0, total: 0 };
      this._state.pages.forEach((p) =>
        p.markers.forEach((m) => {
          if (m.typeId && counts[m.typeId] !== undefined) {
            counts[m.typeId] += 1;
            const t = this.findTypeById(m.typeId);
            if (t) nameCounts[t.name] += 1;
          }
          reviewCounts.total++;
          if (m.review && m.review.status) {
            if (reviewCounts[m.review.status] !== undefined) {
              reviewCounts[m.review.status]++;
            }
          } else {
            reviewCounts.pending++;
          }
        })
      );
      return { byId: counts, byName: nameCounts, types, reviewCounts };
    },

    getMarkerReviewStatus(markerId, pageId) {
      const page = pageId
        ? this._state.pages.find((p) => p.id === pageId)
        : this.currentPage;
      if (!page) return null;
      const marker = page.markers.find((m) => m.id === markerId);
      if (!marker || !marker.review) return null;
      return marker.review;
    },

    hasReviewData() {
      return this._state.pages.some((p) =>
        p.markers.some((m) => m.review && m.review.status && m.review.status !== "pending")
      );
    },

    getReviewStats() {
      const stats = { passed: 0, doubtful: 0, rejected: 0, pending: 0, total: 0, hasData: false };
      this._state.pages.forEach((p) => {
        p.markers.forEach((m) => {
          stats.total++;
          if (m.review && m.review.status) {
            if (stats[m.review.status] !== undefined) {
              stats[m.review.status]++;
              if (m.review.status !== "pending") stats.hasData = true;
            } else {
              stats.pending++;
            }
          } else {
            stats.pending++;
          }
        });
      });
      stats.progress = stats.total > 0 ? Math.round(((stats.total - stats.pending) / stats.total) * 100) : 0;
      return stats;
    },

    mergeReviewResults(packageData) {
      const result = {
        merged: 0,
        skipped: 0,
        unmatched: [],
        stats: { passed: 0, doubtful: 0, rejected: 0 },
      };

      if (!packageData || !packageData.pages) return result;

      const VALID_STATUSES = ["pending", "passed", "doubtful", "rejected"];

      const pageMap = new Map();
      this._state.pages.forEach((p) => pageMap.set(p.id, p));

      packageData.pages.forEach((pkgPage) => {
        if (!pkgPage.markers) return;

        const currentPage = pageMap.get(pkgPage.id);
        if (!currentPage) {
          pkgPage.markers.forEach((m) => {
            if (m.review && m.review.status && m.review.status !== "pending") {
              result.unmatched.push({
                markerId: m.id,
                pageId: pkgPage.id,
                pageName: pkgPage.name || pkgPage.fileName || pkgPage.id,
                reason: "页面不存在",
              });
              result.skipped++;
            }
          });
          return;
        }

        const markerMap = new Map();
        currentPage.markers.forEach((m) => markerMap.set(m.id, m));

        pkgPage.markers.forEach((pkgMarker) => {
          if (!pkgMarker.review || !pkgMarker.review.status || pkgMarker.review.status === "pending") {
            return;
          }

          if (VALID_STATUSES.indexOf(pkgMarker.review.status) === -1) {
            return;
          }

          const currentMarker = markerMap.get(pkgMarker.id);
          if (!currentMarker) {
            result.unmatched.push({
              markerId: pkgMarker.id,
              pageId: pkgPage.id,
              pageName: pkgPage.name || pkgPage.fileName || pkgPage.id,
              reason: "标记不存在",
            });
            result.skipped++;
            return;
          }

          currentMarker.review = {
            status: pkgMarker.review.status,
            comment: (pkgMarker.review.comment || "").trim(),
            reviewedAt: pkgMarker.review.reviewedAt || new Date().toISOString(),
          };

          result.merged++;
          if (result.stats[pkgMarker.review.status] !== undefined) {
            result.stats[pkgMarker.review.status]++;
          }
        });
      });

      if (result.merged > 0) {
        this._touchCurrentPage();
        this._persist();
        this._notify();
      }

      return result;
    },

    addMigratedMarker({ typeId, type, note, x, y, realX, realY, sourceMarkerId, migratedFrom, transformType, positionAdjusted }) {
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
        migrated: true,
        sourceMarkerId: sourceMarkerId || null,
        migratedFrom: migratedFrom || null,
        transformType: transformType || null,
        createdAt: new Date().toISOString(),
      };
      if (positionAdjusted) marker.positionAdjusted = true;
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

    addMigratedRegion({ typeId, type, note, x, y, width, height, realX, realY, realWidth, realHeight, sourceMarkerId, migratedFrom, transformType, positionAdjusted }) {
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
        migrated: true,
        sourceMarkerId: sourceMarkerId || null,
        migratedFrom: migratedFrom || null,
        transformType: transformType || null,
        createdAt: new Date().toISOString(),
      };
      if (positionAdjusted) marker.positionAdjusted = true;
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

    updateCandidateSummary(pageId, summary) {
      const page = pageId
        ? this._state.pages.find((p) => p.id === pageId)
        : this.currentPage;
      if (!page) return false;
      page.candidateSummary = {
        total: summary.total || 0,
        pending: summary.pending || 0,
        accepted: summary.accepted || 0,
        ignored: summary.ignored || 0,
        updatedAt: new Date().toISOString(),
      };
      this._persist();
      this._notify();
      return true;
    },

    clearCandidateSummary(pageId) {
      const page = pageId
        ? this._state.pages.find((p) => p.id === pageId)
        : this.currentPage;
      if (!page) return false;
      delete page.candidateSummary;
      this._persist();
      this._notify();
      return true;
    },

    getMigratedMarkerCount(pageId) {
      const page = pageId
        ? this._state.pages.find((p) => p.id === pageId)
        : this.currentPage;
      if (!page) return 0;
      return page.markers.filter((m) => m.migrated).length;
    },

    getTotalMarkers() {
      return this._state.pages.reduce((acc, p) => acc + p.markers.length, 0);
    },

    getPageProgress(pageId) {
      const page = pageId
        ? this._state.pages.find((p) => p.id === pageId)
        : this.currentPage;
      if (!page) return null;

      const markerCount = page.markers.length;
      const rawCandSummary = page.candidateSummary || null;
      const hasImage = Boolean(page.image);

      const candidateStats = rawCandSummary
        ? {
            total: rawCandSummary.total || 0,
            pending: rawCandSummary.pending || 0,
            accepted: rawCandSummary.accepted || 0,
            ignored: rawCandSummary.ignored || 0,
            processed: (rawCandSummary.accepted || 0) + (rawCandSummary.ignored || 0),
          }
        : null;

      let progressPercent = 0;
      if (candidateStats && candidateStats.total > 0) {
        progressPercent = Math.round((candidateStats.processed / candidateStats.total) * 100);
      }

      return {
        pageId: page.id,
        pageName: page.name || page.fileName || "",
        markerCount,
        hasImage,
        candidateStats,
        progressPercent,
        updatedAt: page.updatedAt || null,
      };
    },

    getAllPagesProgress() {
      return this._state.pages.map((p) => this.getPageProgress(p.id));
    },

    getCalibrationData() {
      if (!this._state.calibrationSessions) {
        this._state.calibrationSessions = [];
      }
      return this._state.calibrationSessions;
    },

    addCalibrationSession(session) {
      if (!session) return null;
      if (!this._state.calibrationSessions) {
        this._state.calibrationSessions = [];
      }
      this._state.calibrationSessions.push(session);
      this._persist();
      this._notify();
      return session;
    },

    removeCalibrationSession(sessionId) {
      if (!this._state.calibrationSessions) return false;
      const before = this._state.calibrationSessions.length;
      this._state.calibrationSessions = this._state.calibrationSessions.filter(
        (s) => s.id !== sessionId
      );
      if (this._state.calibrationSessions.length === before) return false;
      this._persist();
      this._notify();
      return true;
    },

    getMigratedMarkersSummary() {
      const summary = [];
      this._state.pages.forEach((p) => {
        const migrated = p.markers.filter((m) => m.migrated);
        if (migrated.length > 0) {
          summary.push({
            pageId: p.id,
            pageName: p.name || p.fileName || "",
            count: migrated.length,
            transformTypes: [...new Set(migrated.map((m) => m.transformType).filter(Boolean))],
            sourcePages: [...new Set(migrated.map((m) => m.migratedFrom).filter(Boolean))],
          });
        }
      });
      return summary;
    },

    getCalibrationSessionById(sessionId) {
      if (!this._state.calibrationSessions) return null;
      return this._state.calibrationSessions.find((s) => s.id === sessionId) || null;
    },

    updateCalibrationSession(sessionId, updates) {
      if (!this._state.calibrationSessions) return null;
      const session = this._state.calibrationSessions.find((s) => s.id === sessionId);
      if (!session) return null;
      Object.assign(session, updates);
      session.updatedAt = new Date().toISOString();
      this._persist();
      this._notify();
      return session;
    },

    clearAllCalibrationSessions() {
      if (!this._state.calibrationSessions) return 0;
      const count = this._state.calibrationSessions.length;
      this._state.calibrationSessions = [];
      this._persist();
      this._notify();
      return count;
    },

    getCalibrationSessionCount() {
      if (!this._state.calibrationSessions) return 0;
      return this._state.calibrationSessions.length;
    },

    getMigratedMarkersBySource(sourceMarkerId) {
      const results = [];
      this._state.pages.forEach((p) => {
        p.markers.forEach((m) => {
          if (m.sourceMarkerId === sourceMarkerId) {
            results.push({ pageId: p.id, marker: m });
          }
        });
      });
      return results;
    },

    isMarkerMigrated(markerId, pageId) {
      const page = pageId
        ? this._state.pages.find((p) => p.id === pageId)
        : this.currentPage;
      if (!page) return false;
      const marker = page.markers.find((m) => m.id === markerId);
      return marker ? Boolean(marker.migrated) : false;
    },

    getCalibrationPlans() {
      if (!this._state.calibrationPlans) {
        this._state.calibrationPlans = [];
      }
      return this._state.calibrationPlans;
    },

    getCalibrationPlanById(planId) {
      if (!this._state.calibrationPlans) return null;
      return this._state.calibrationPlans.find((p) => p.id === planId) || null;
    },

    addCalibrationPlan(planData) {
      if (!planData || !planData.name) return null;
      if (!this._state.calibrationPlans) {
        this._state.calibrationPlans = [];
      }
      const now = new Date().toISOString();
      const plan = {
        id: "plan-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12),
        name: String(planData.name).trim(),
        description: planData.description ? String(planData.description).trim() : "",
        sourcePageId: planData.sourcePageId || null,
        targetPageId: planData.targetPageId || null,
        sourcePageName: planData.sourcePageName || "",
        targetPageName: planData.targetPageName || "",
        sourcePoints: Array.isArray(planData.sourcePoints) ? planData.sourcePoints.slice() : [null, null, null, null],
        targetPoints: Array.isArray(planData.targetPoints) ? planData.targetPoints.slice() : [null, null, null, null],
        transform: planData.transform || null,
        transformType: planData.transformType || null,
        quality: planData.quality || null,
        residual: planData.residual || null,
        sourceMarkerCount: Number(planData.sourceMarkerCount) || 0,
        sourceMarkerTypeCounts: planData.sourceMarkerTypeCounts || {},
        useCount: 0,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this._state.calibrationPlans.unshift(plan);
      this._persist();
      this._notify();
      return plan;
    },

    updateCalibrationPlan(planId, updates) {
      if (!this._state.calibrationPlans) return null;
      const plan = this._state.calibrationPlans.find((p) => p.id === planId);
      if (!plan) return null;
      Object.assign(plan, updates);
      plan.updatedAt = new Date().toISOString();
      this._persist();
      this._notify();
      return plan;
    },

    removeCalibrationPlan(planId) {
      if (!this._state.calibrationPlans) return false;
      const before = this._state.calibrationPlans.length;
      this._state.calibrationPlans = this._state.calibrationPlans.filter(
        (p) => p.id !== planId
      );
      if (this._state.calibrationPlans.length === before) return false;
      this._persist();
      this._notify();
      return true;
    },

    recordPlanUsage(planId) {
      if (!this._state.calibrationPlans) return null;
      const plan = this._state.calibrationPlans.find((p) => p.id === planId);
      if (!plan) return null;
      plan.useCount = (plan.useCount || 0) + 1;
      plan.lastUsedAt = new Date().toISOString();
      this._persist();
      return plan;
    },

    getCalibrationPlanCount() {
      if (!this._state.calibrationPlans) return 0;
      return this._state.calibrationPlans.length;
    },

    getPlansForAdjacentPages(sourcePageId, targetPageId) {
      if (!this._state.calibrationPlans) return [];
      return this._state.calibrationPlans.filter((p) => {
        if (sourcePageId && p.sourcePageId === sourcePageId) return true;
        if (targetPageId && p.targetPageId === targetPageId) return true;
        if (!sourcePageId && !targetPageId) return true;
        return false;
      });
    },

    duplicateCalibrationPlan(planId, newName) {
      const plan = this.getCalibrationPlanById(planId);
      if (!plan) return null;
      const now = new Date().toISOString();
      const copy = {
        id: "plan-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12),
        name: newName ? String(newName).trim() : (plan.name + " (副本)"),
        description: plan.description || "",
        sourcePageId: null,
        targetPageId: null,
        sourcePageName: plan.sourcePageName || "",
        targetPageName: plan.targetPageName || "",
        sourcePoints: plan.sourcePoints ? plan.sourcePoints.slice() : [null, null, null, null],
        targetPoints: plan.targetPoints ? plan.targetPoints.slice() : [null, null, null, null],
        transform: plan.transform || null,
        transformType: plan.transformType || null,
        quality: plan.quality || null,
        residual: plan.residual || null,
        sourceMarkerCount: plan.sourceMarkerCount || 0,
        sourceMarkerTypeCounts: plan.sourceMarkerTypeCounts || {},
        useCount: 0,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      if (!this._state.calibrationPlans) {
        this._state.calibrationPlans = [];
      }
      this._state.calibrationPlans.unshift(copy);
      this._persist();
      this._notify();
      return copy;
    },
  };

  global.VolumeState = VolumeState;
})(window);
