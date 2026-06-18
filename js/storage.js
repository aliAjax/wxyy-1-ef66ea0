(function (global) {
  if (typeof global.structuredClone !== "function") {
    global.structuredClone = function (value) {
      return JSON.parse(JSON.stringify(value));
    };
  }

  const cloneValue = global.structuredClone;
  const STORAGE_KEY = "wxyy-1-archive-volume";
  const MODES = ["point", "region"];

  const DEFAULT_DAMAGE_TYPES = [
    { id: "type-bug", name: "虫蛀点", color: "#9d3f2f" },
    { id: "type-hole", name: "破洞", color: "#2f2b27" },
    { id: "type-mold", name: "霉斑", color: "#647d52" },
    { id: "type-corner", name: "缺角", color: "#b27830" },
  ];

  const DEFAULT_LEGACY_TYPE_MAP = {
    "虫蛀点": "type-bug",
    "破洞": "type-hole",
    "霉斑": "type-mold",
    "缺角": "type-corner",
  };

  const DEFAULT_STATE = {
    volumeId: "",
    volumeTitle: "",
    pages: [],
    currentPageId: null,
    createdAt: null,
    updatedAt: null,
    damageTypes: cloneValue(DEFAULT_DAMAGE_TYPES),
  };

  function readRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn("读取本地存储失败，返回默认状态", e);
      return null;
    }
  }

  function writeRaw(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error("写入本地存储失败", e);
      if (e.name === "QuotaExceededError" || e.message.includes("quota")) {
        alert("本地存储容量已满，请清理旧数据或导出后清空。");
      }
      return false;
    }
  }

  function ensureDamageTypes(raw) {
    if (
      raw &&
      Array.isArray(raw.damageTypes) &&
      raw.damageTypes.length > 0 &&
      raw.damageTypes.every((t) => t && t.id && t.name && t.color)
    ) {
      return raw.damageTypes;
    }
    return cloneValue(DEFAULT_DAMAGE_TYPES);
  }

  function lookupTypeId(legacyTypeName, damageTypes) {
    if (!legacyTypeName) return damageTypes[0].id;
    const directMatch = damageTypes.find((t) => t.name === legacyTypeName);
    if (directMatch) return directMatch.id;
    const legacyId = DEFAULT_LEGACY_TYPE_MAP[legacyTypeName];
    if (legacyId) {
      const byLegacyId = damageTypes.find((t) => t.id === legacyId);
      if (byLegacyId) return byLegacyId.id;
    }
    return null;
  }

  function normalizeMarker(m, damageTypes) {
    if (!m || typeof m.id !== "string") return null;
    const mode = m.mode === "region" ? "region" : "point";
    let resolvedTypeId;
    if (m.typeId && damageTypes.some((t) => t.id === m.typeId)) {
      resolvedTypeId = m.typeId;
    } else {
      const lookup = lookupTypeId(m.type, damageTypes);
      if (lookup) {
        resolvedTypeId = lookup;
      } else {
        resolvedTypeId = damageTypes[0].id;
      }
    }
    const resolvedType =
      damageTypes.find((t) => t.id === resolvedTypeId) || damageTypes[0];
    const base = {
      id: m.id,
      typeId: resolvedTypeId,
      type: resolvedType.name,
      mode,
      note: (m.note || "").trim(),
      x: Number(Number(m.x).toFixed(2)),
      y: Number(Number(m.y).toFixed(2)),
      createdAt: m.createdAt || new Date().toISOString(),
    };
    if (m.migrated) {
      base.migrated = true;
      if (m.sourceMarkerId) base.sourceMarkerId = m.sourceMarkerId;
      if (m.migratedFrom) base.migratedFrom = m.migratedFrom;
    }
    if (m.transformType) {
      base.transformType = m.transformType;
    }
    if (m.positionAdjusted) {
      base.positionAdjusted = true;
    }
    if (m.realX !== undefined && m.realY !== undefined) {
      base.realX = Number(Number(m.realX).toFixed(2));
      base.realY = Number(Number(m.realY).toFixed(2));
    }
    if (mode === "region") {
      base.width = Number(Number(m.width || 0).toFixed(2));
      base.height = Number(Number(m.height || 0).toFixed(2));
      if (m.realWidth !== undefined && m.realHeight !== undefined) {
        base.realWidth = Number(Number(m.realWidth).toFixed(2));
        base.realHeight = Number(Number(m.realHeight).toFixed(2));
      }
    }
    const VALID_REVIEW_STATUSES = ["pending", "passed", "doubtful", "rejected"];
    if (m.review && m.review.status && VALID_REVIEW_STATUSES.indexOf(m.review.status) !== -1) {
      base.review = {
        status: m.review.status,
        comment: (m.review.comment || "").trim(),
        reviewedAt: m.review.reviewedAt || null,
      };
    }
    return base;
  }

  function normalizePage(raw, damageTypes) {
    if (!raw || typeof raw !== "object" || !raw.id) return null;
    var page = {
      id: raw.id,
      name: raw.name || "",
      fileName: raw.fileName || "",
      image: raw.image || "",
      imageWidth: raw.imageWidth !== undefined ? Number(raw.imageWidth) || null : null,
      imageHeight: raw.imageHeight !== undefined ? Number(raw.imageHeight) || null : null,
      markers: Array.isArray(raw.markers)
        ? raw.markers.map((m) => normalizeMarker(m, damageTypes)).filter(Boolean)
        : [],
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
    if (raw.candidateSummary && typeof raw.candidateSummary === "object") {
      page.candidateSummary = {
        total: raw.candidateSummary.total || 0,
        pending: raw.candidateSummary.pending || 0,
        accepted: raw.candidateSummary.accepted || 0,
        ignored: raw.candidateSummary.ignored || 0,
        updatedAt: raw.candidateSummary.updatedAt || new Date().toISOString(),
      };
    }
    return page;
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") {
      return cloneValue(DEFAULT_STATE);
    }

    const damageTypes = ensureDamageTypes(raw);
    const state = Object.assign(cloneValue(DEFAULT_STATE), raw);
    state.damageTypes = damageTypes;
    state.pages = Array.isArray(state.pages)
      ? state.pages.map((p) => normalizePage(p, damageTypes)).filter(Boolean)
      : [];

    if (!state.currentPageId && state.pages.length > 0) {
      state.currentPageId = state.pages[0].id;
    }

    if (
      state.pages.length > 0 &&
      !state.pages.find((p) => p.id === state.currentPageId)
    ) {
      state.currentPageId = state.pages[0].id;
    }

    if (raw.calibrationSessions && Array.isArray(raw.calibrationSessions)) {
      state.calibrationSessions = raw.calibrationSessions.filter(function (s) {
        return s && s.id && s.data;
      });
    } else {
      state.calibrationSessions = [];
    }

    return state;
  }

  function createPageFromImage({ dataUrl, fileName }) {
    return normalizePage(
      {
        id: crypto.randomUUID(),
        name: fileName ? fileName.replace(/\.[^.]+$/, "") : "",
        fileName: fileName || "",
        image: dataUrl,
        markers: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      cloneValue(DEFAULT_DAMAGE_TYPES)
    );
  }

  function hexWithAlpha(hex, alpha) {
    const h = hex.replace("#", "");
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    const r = parseInt(full.substring(0, 2), 16);
    const g = parseInt(full.substring(2, 4), 16);
    const b = parseInt(full.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const BACKUP_KEY = STORAGE_KEY + "--backup";
  const BACKUP_TIMESTAMP_KEY = STORAGE_KEY + "--backup-ts";
  const SNAPSHOT_KEY = STORAGE_KEY + "--snapshot";
  const SNAPSHOT_META_KEY = STORAGE_KEY + "--snapshot-meta";

  function backup() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) {
        localStorage.setItem(BACKUP_KEY, current);
        localStorage.setItem(BACKUP_TIMESTAMP_KEY, new Date().toISOString());
        return true;
      }
      return false;
    } catch (e) {
      console.error("备份当前数据失败", e);
      return false;
    }
  }

  function restoreBackup() {
    try {
      const bk = localStorage.getItem(BACKUP_KEY);
      if (!bk) return false;
      localStorage.setItem(STORAGE_KEY, bk);
      localStorage.removeItem(BACKUP_KEY);
      localStorage.removeItem(BACKUP_TIMESTAMP_KEY);
      return true;
    } catch (e) {
      console.error("恢复备份失败", e);
      return false;
    }
  }

  function clearBackup() {
    try {
      localStorage.removeItem(BACKUP_KEY);
      localStorage.removeItem(BACKUP_TIMESTAMP_KEY);
    } catch (e) {}
  }

  function getBackupTimestamp() {
    try {
      return localStorage.getItem(BACKUP_TIMESTAMP_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function verifyBackupIntegrity() {
    try {
      var bk = localStorage.getItem(BACKUP_KEY);
      if (!bk) return { valid: false, reason: "no_backup" };
      var parsed = JSON.parse(bk);
      if (!parsed || typeof parsed !== "object") return { valid: false, reason: "invalid_json" };
      if (!Array.isArray(parsed.pages)) return { valid: false, reason: "missing_pages" };
      return { valid: true, pageCount: parsed.pages.length };
    } catch (e) {
      return { valid: false, reason: "parse_error", error: e.message };
    }
  }

  function createSnapshot() {
    try {
      var current = localStorage.getItem(STORAGE_KEY);
      if (!current) return { success: false, reason: "no_data" };
      var parsed = JSON.parse(current);
      if (!parsed) return { success: false, reason: "invalid_data" };
      var meta = {
        timestamp: new Date().toISOString(),
        pageCount: Array.isArray(parsed.pages) ? parsed.pages.length : 0,
        totalMarkers: Array.isArray(parsed.pages)
          ? parsed.pages.reduce(function (a, p) { return a + (Array.isArray(p.markers) ? p.markers.length : 0); }, 0)
          : 0,
        volumeTitle: parsed.volumeTitle || "",
        volumeId: parsed.volumeId || "",
      };
      localStorage.setItem(SNAPSHOT_KEY, current);
      localStorage.setItem(SNAPSHOT_META_KEY, JSON.stringify(meta));
      return { success: true, meta: meta };
    } catch (e) {
      console.error("创建快照失败", e);
      return { success: false, reason: "storage_error", error: e.message };
    }
  }

  function restoreSnapshot() {
    try {
      var snapshot = localStorage.getItem(SNAPSHOT_KEY);
      if (!snapshot) return false;
      localStorage.setItem(STORAGE_KEY, snapshot);
      return true;
    } catch (e) {
      console.error("恢复快照失败", e);
      return false;
    }
  }

  function clearSnapshot() {
    try {
      localStorage.removeItem(SNAPSHOT_KEY);
      localStorage.removeItem(SNAPSHOT_META_KEY);
    } catch (e) {}
  }

  function getSnapshotMeta() {
    try {
      var meta = localStorage.getItem(SNAPSHOT_META_KEY);
      return meta ? JSON.parse(meta) : null;
    } catch (e) {
      return null;
    }
  }

  function preFlightCheck(estimatedSize) {
    var currentData = localStorage.getItem(STORAGE_KEY);
    var currentDataSize = currentData ? currentData.length * 2 : 0;
    var totalUsage = 0;
    try {
      for (var key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          totalUsage += (localStorage[key].length + key.length) * 2;
        }
      }
    } catch (e) {}
    var typicalLimit = 5 * 1024 * 1024;
    var availableAfterImport = typicalLimit - totalUsage - estimatedSize + currentDataSize;
    return {
      canProceed: availableAfterImport > 256 * 1024,
      currentDataSize: currentDataSize,
      totalUsage: totalUsage,
      estimatedNewSize: estimatedSize,
      availableAfterImport: availableAfterImport,
    };
  }

  function estimateCurrentDataSize() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      return data ? data.length * 2 : 0;
    } catch (e) {
      return 0;
    }
  }

  function getStorageUsage() {
    var totalUsage = 0;
    try {
      for (var key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          totalUsage += (localStorage[key].length + key.length) * 2;
        }
      }
    } catch (e) {}
    return totalUsage;
  }

  function hasExistingData() {
    try {
      var raw = readRaw();
      if (!raw) return false;
      if (raw.pages && Array.isArray(raw.pages) && raw.pages.length > 0) return true;
      if (raw.volumeId || raw.volumeTitle) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function getRestoreEstimate(packageData) {
    if (!packageData || typeof packageData !== "object") return null;
    var pages = packageData.pages || [];
    var totalMarkers = pages.reduce(function (a, p) {
      return a + (Array.isArray(p.markers) ? p.markers.length : 0);
    }, 0);
    var pagesWithImages = pages.filter(function (p) { return p.image && p.image.length > 0; }).length;
    var pagesWithoutImages = pages.length - pagesWithImages;
    var estimatedStorageKB = 0;
    try {
      var state = restoreFromPackage(packageData);
      estimatedStorageKB = Math.round(new Blob([JSON.stringify(state)]).size / 1024);
    } catch (e) {
      pagesWithImages.forEach(function (p) {
        if (p.image) estimatedStorageKB += Math.round((p.image.length * 3) / 4 / 1024);
      });
      estimatedStorageKB += Math.round(totalMarkers * 0.2 + pages.length * 0.5);
    }
    return {
      pageCount: pages.length,
      totalMarkers: totalMarkers,
      pagesWithImages: pagesWithImages,
      pagesWithoutImages: pagesWithoutImages,
      damageTypeCount: Array.isArray(packageData.damageTypes) ? packageData.damageTypes.length : 0,
      estimatedStorageKB: estimatedStorageKB,
      projectTitle: packageData.project ? packageData.project.title : "",
      projectId: packageData.project ? packageData.project.id : "",
    };
  }

  function restoreFromPackage(packageData) {
    if (!packageData || typeof packageData !== "object") {
      throw new Error("无效的工作包数据");
    }

    if (!Array.isArray(packageData.pages) || packageData.pages.length === 0) {
      throw new Error("工作包中没有页面数据");
    }

    if (!Array.isArray(packageData.damageTypes) || packageData.damageTypes.length === 0) {
      throw new Error("工作包中损伤类型配置无效");
    }

    var now = new Date().toISOString();
    var projectId = "";
    var projectTitle = "";
    var projectCreatedAt = now;

    if (packageData.project && typeof packageData.project === "object") {
      projectId = packageData.project.id || "";
      projectTitle = packageData.project.title || "";
      projectCreatedAt = packageData.project.createdAt || now;
    } else if (packageData.volume && typeof packageData.volume === "object") {
      projectId = packageData.volume.id || "";
      projectTitle = packageData.volume.title || "";
      projectCreatedAt = packageData.volume.createdAt || now;
    }

    var normalizedPages = packageData.pages.map(function (p) {
      return normalizePage(p, packageData.damageTypes);
    }).filter(Boolean);

    if (normalizedPages.length === 0) {
      throw new Error("工作包中没有有效的页面数据");
    }

    var state = normalizeState({
      volumeId: projectId,
      volumeTitle: projectTitle,
      pages: normalizedPages,
      currentPageId: normalizedPages[0].id,
      createdAt: projectCreatedAt,
      updatedAt: now,
      damageTypes: packageData.damageTypes,
    });

    return state;
  }

  const VolumeStorage = {
    KEY: STORAGE_KEY,
    BACKUP_KEY: BACKUP_KEY,
    DEFAULT_DAMAGE_TYPES,
    MODES,

    get TYPES() {
      const raw = readRaw();
      const dts = ensureDamageTypes(raw);
      return dts.map((t) => t.name);
    },

    hexWithAlpha,

    load() {
      return normalizeState(readRaw());
    },

    save(state) {
      const now = new Date().toISOString();
      const toSave = Object.assign({}, state, { updatedAt: now });
      if (!toSave.createdAt) toSave.createdAt = now;
      return writeRaw(toSave);
    },

    reset() {
      const now = new Date().toISOString();
      const fresh = Object.assign(cloneValue(DEFAULT_STATE), {
        createdAt: now,
        updatedAt: now,
        damageTypes: cloneValue(DEFAULT_DAMAGE_TYPES),
      });
      writeRaw(fresh);
      return fresh;
    },

    backup,
    restoreBackup,
    clearBackup,
    getBackupTimestamp,
    verifyBackupIntegrity,
    createSnapshot,
    restoreSnapshot,
    clearSnapshot,
    getSnapshotMeta,
    preFlightCheck,
    estimateCurrentDataSize,
    getStorageUsage,
    hasExistingData,
    getRestoreEstimate,
    restoreFromPackage,

    export(state) {
      const damageTypes = state.damageTypes || cloneValue(DEFAULT_DAMAGE_TYPES);
      const typeMap = Object.fromEntries(damageTypes.map((t) => [t.id, t]));

      const pages = state.pages.map((p) => {
        const pageData = {
          id: p.id,
          name: p.name,
          fileName: p.fileName,
          imageIncluded: Boolean(p.image),
          markers: p.markers
            .map((m) => normalizeMarker(m, damageTypes))
            .filter(Boolean),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
        if (p.imageWidth !== undefined && p.imageHeight !== undefined) {
          pageData.imageWidth = p.imageWidth;
          pageData.imageHeight = p.imageHeight;
        }
        if (p.candidateSummary && typeof p.candidateSummary === "object") {
          pageData.candidateSummary = {
            total: p.candidateSummary.total || 0,
            pending: p.candidateSummary.pending || 0,
            accepted: p.candidateSummary.accepted || 0,
            ignored: p.candidateSummary.ignored || 0,
            updatedAt: p.candidateSummary.updatedAt || p.updatedAt,
          };
        }
        return pageData;
      });

      const totalMarkers = pages.reduce(
        (acc, p) => acc + p.markers.length,
        0
      );

      const typeCounts = Object.fromEntries(
        damageTypes.map((t) => [t.name, 0])
      );
      pages.forEach((p) =>
        p.markers.forEach((m) => {
          const t = typeMap[m.typeId];
          const name = t ? t.name : m.type;
          if (typeCounts[name] === undefined) typeCounts[name] = 0;
          typeCounts[name] += 1;
        })
      );

      const hasRealCoords = pages.some((p) =>
        p.markers.some((m) => m.realX !== undefined)
      );

      const hasMigratedMarkers = pages.some((p) =>
        p.markers.some((m) => m.migrated)
      );

      const result = {
        format: "archive-volume-damage",
        formatVersion: "2.1",
        exportedAt: new Date().toISOString(),
        damageTypes,
        volume: {
          id: state.volumeId,
          title: state.volumeTitle,
          createdAt: state.createdAt,
          updatedAt: state.updatedAt,
          pageCount: pages.length,
          totalMarkers,
          typeCounts,
        },
        pages,
      };

      if (hasRealCoords) {
        result.coordSystem = "dual";
        result.coordNote = "同时包含百分比坐标(x,y)和真实像素坐标(realX,realY)";
      }

      if (hasMigratedMarkers) {
        result.hasMigratedMarkers = true;
        result.migrationNote = "部分标记通过跨页校准迁移而来，包含migrated/sourceMarkerId/migratedFrom字段";
      }

      return result;
    },

    createPage: createPageFromImage,
  };

  global.VolumeStorage = VolumeStorage;
})(window);
