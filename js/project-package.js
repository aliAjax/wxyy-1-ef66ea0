(function (global) {
  var PACKAGE_FORMAT = "archive-project-package";
  var PACKAGE_VERSION = "5.0";
  var MIN_SUPPORTED_VERSION = "1.0";
  var PACKAGE_SIZE_WARNING_THRESHOLD = 2 * 1024 * 1024;
  var MAX_PACKAGE_SIZE = 10 * 1024 * 1024;

  var LEGACY_FORMAT_VOLUME = "archive-volume-damage";
  var LEGACY_FORMAT_PAGE = "archive-page-damage";

  var ERROR_CODES = {
    INVALID_JSON: "INVALID_JSON",
    UNKNOWN_FORMAT: "UNKNOWN_FORMAT",
    VERSION_TOO_NEW: "VERSION_TOO_NEW",
    VERSION_TOO_OLD: "VERSION_TOO_OLD",
    MISSING_FIELDS: "MISSING_FIELDS",
    PAGE_CORRUPT: "PAGE_CORRUPT",
    NO_PAGES: "NO_PAGES",
    DAMAGE_TYPES_INVALID: "DAMAGE_TYPES_INVALID",
    MIGRATION_FAILED: "MIGRATION_FAILED",
    RESTORE_FAILED: "RESTORE_FAILED",
    IMAGE_DATA_INVALID: "IMAGE_DATA_INVALID",
    STORAGE_QUOTA_EXCEEDED: "STORAGE_QUOTA_EXCEEDED",
    VALIDATION_ERROR: "VALIDATION_ERROR",
    CHECKSUM_MISMATCH: "CHECKSUM_MISMATCH",
    QUOTA_INSUFFICIENT: "QUOTA_INSUFFICIENT",
    PACKAGE_TOO_LARGE: "PACKAGE_TOO_LARGE",
    STATE_VERIFY_FAILED: "STATE_VERIFY_FAILED",
    BACKUP_CORRUPT: "BACKUP_CORRUPT",
    ROLLBACK_FAILED: "ROLLBACK_FAILED",
  };

  var ERROR_RESOLUTIONS = {
    INVALID_JSON: "请确认文件未损坏且为正确的 JSON 格式。如果文件是从其他应用导出的，请检查格式是否兼容。",
    UNKNOWN_FORMAT: "支持的格式：项目工作包 (v2.x/v3.x/v4.x)、旧版卷册数据 (v1.x)、旧版单页标记 (v1.x)。",
    VERSION_TOO_NEW: "请更新应用至最新版本后再尝试导入此工作包。",
    VERSION_TOO_OLD: "此工作包版本过旧，已不再支持导入。建议使用最新版本重新导出。",
    MISSING_FIELDS: "工作包缺少必要字段，文件可能不完整或在传输中损坏。请重新导出。",
    PAGE_CORRUPT: "工作包中的页面数据损坏，请检查文件完整性。",
    NO_PAGES: "工作包中没有任何页面数据，无法导入。",
    DAMAGE_TYPES_INVALID: "损伤类型配置缺失或无效，请检查文件是否正确。",
    MIGRATION_FAILED: "旧版格式迁移失败，请确认文件格式正确。如需帮助，请保留原文件备用。",
    RESTORE_FAILED: "数据恢复过程中出错，当前工作数据未被修改。",
    IMAGE_DATA_INVALID: "图片数据格式无效，可能是导出时数据损坏。不含图片的标记数据仍可正常导入。",
    STORAGE_QUOTA_EXCEEDED: "浏览器本地存储空间不足。建议先导出备份当前数据，再清空后导入。",
    VALIDATION_ERROR: "数据验证失败，工作包可能已损坏。",
    CHECKSUM_MISMATCH: "数据完整性校验失败，文件可能在传输或编辑过程中被损坏。",
    QUOTA_INSUFFICIENT: "浏览器本地存储空间不足以容纳导入的数据。建议先导出备份，再清空当前数据后导入。",
    PACKAGE_TOO_LARGE: "工作包文件过大，可能超出浏览器存储限制。建议分批导出或减少图片数据。",
    STATE_VERIFY_FAILED: "恢复后的状态验证失败，数据可能不完整。已自动回滚到导入前状态。",
    BACKUP_CORRUPT: "备份数据损坏，无法回滚。请检查当前数据完整性。",
    ROLLBACK_FAILED: "回滚失败，请手动检查数据完整性。建议立即导出当前数据进行备份。",
  };

  function PackageError(code, message, detail) {
    var err = new Error(message || code);
    err.code = code;
    err.detail = detail || null;
    err.isPackageError = true;
    err.resolution = ERROR_RESOLUTIONS[code] || null;
    return err;
  }

  function compareVersions(v1, v2) {
    var p1 = String(v1).split(".").map(function (n) { return parseInt(n, 10) || 0; });
    var p2 = String(v2).split(".").map(function (n) { return parseInt(n, 10) || 0; });
    for (var i = 0; i < Math.max(p1.length, p2.length); i++) {
      var a = p1[i] || 0;
      var b = p2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  function isValidDataUrl(str) {
    if (!str || typeof str !== "string") return false;
    return str.indexOf("data:image/") === 0 || str.indexOf("http://") === 0 || str.indexOf("https://") === 0;
  }

  function computeChecksum(data) {
    var str;
    if (typeof data === "string") {
      str = data;
    } else {
      var clone = Object.assign({}, data);
      delete clone._checksum;
      delete clone._meta;
      delete clone._migratedFrom;
      delete clone._originalFormatVersion;
      delete clone._migrationNotes;
      delete clone._migrationSteps;
      str = JSON.stringify(clone);
    }
    var h1 = 0xdeadbeef;
    var h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return "mxh:" + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  function estimateStateSize(state) {
    if (!state) return 0;
    try {
      return new Blob([JSON.stringify(state)]).size;
    } catch (e) {
      return JSON.stringify(state).length * 2;
    }
  }

  function estimatePackageStorageSize(packageData) {
    if (!packageData) return 0;
    var state = packageToState(packageData);
    return estimateStateSize(state);
  }

  function estimateExportSize(state, options) {
    options = options || {};
    var pkg = exportPackage(state, options);
    try {
      return new Blob([JSON.stringify(pkg)]).size;
    } catch (e) {
      return JSON.stringify(pkg).length * 2;
    }
  }

  function checkStorageQuota(estimatedSize) {
    var currentUsage = 0;
    try {
      for (var key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          currentUsage += (localStorage[key].length + key.length) * 2;
        }
      }
    } catch (e) {}

    var STORAGE_KEY = global.VolumeStorage ? global.VolumeStorage.KEY : "wxyy-1-archive-volume";
    var currentDataUsage = 0;
    try {
      var existing = localStorage.getItem(STORAGE_KEY);
      if (existing) currentDataUsage = existing.length * 2;
    } catch (e) {}

    var typicalLimit = 5 * 1024 * 1024;
    var availableAfterImport = typicalLimit - currentUsage - estimatedSize + currentDataUsage;

    return {
      estimatedSize: estimatedSize,
      currentUsage: currentUsage,
      currentDataUsage: currentDataUsage,
      typicalLimit: typicalLimit,
      availableAfterImport: availableAfterImport,
      canFit: availableAfterImport > 0,
      warningLevel: availableAfterImport < 512 * 1024 ? "critical" : availableAfterImport < 1024 * 1024 ? "warning" : "ok",
    };
  }

  function exportPackage(state, options) {
    options = options || {};
    var now = new Date().toISOString();
    var damageTypes = state.damageTypes || [];
    var typeMap = Object.fromEntries(damageTypes.map(function (t) { return [t.id, t]; }));

    var includeImages = options.includeImages !== false;

    var pages = state.pages.map(function (p) {
      var hasImage = Boolean(p.image);
      var pageData = {
        id: p.id,
        name: p.name || "",
        fileName: p.fileName || "",
        image: includeImages ? (p.image || "") : "",
        imageIncluded: includeImages && hasImage,
        imageRef: (!includeImages && hasImage) ? (p.fileName || p.name || "") : (hasImage ? "" : (p.fileName || p.name || "")),
        imageWidth: p.imageWidth || null,
        imageHeight: p.imageHeight || null,
        markers: p.markers.map(function (m) {
          return normalizeMarkerForExport(m, damageTypes);
        }).filter(Boolean),
        createdAt: p.createdAt || now,
        updatedAt: p.updatedAt || now,
      };
      return pageData;
    });

    var totalMarkers = pages.reduce(function (acc, p) { return acc + p.markers.length; }, 0);

    var typeCounts = Object.fromEntries(damageTypes.map(function (t) { return [t.name, 0]; }));
    pages.forEach(function (p) {
      p.markers.forEach(function (m) {
        var t = typeMap[m.typeId];
        var name = t ? t.name : m.type;
        if (typeCounts[name] === undefined) typeCounts[name] = 0;
        typeCounts[name] += 1;
      });
    });

    var hasRealCoords = pages.some(function (p) {
      return p.markers.some(function (m) { return m.realX !== undefined; });
    });

    var hasMigratedMarkers = pages.some(function (p) {
      return p.markers.some(function (m) { return m.migrated; });
    });

    var calibrationSessions = [];
    if (typeof CalibrationUI !== "undefined" && CalibrationUI.getExportData) {
      var exportData = CalibrationUI.getExportData();
      if (exportData && (exportData.sourcePoints.some(function (p) { return p !== null; }) || exportData.targetPoints.some(function (p) { return p !== null; }))) {
        calibrationSessions.push({
          id: "current-" + now.replace(/[:.]/g, "-"),
          label: "导出时校准数据",
          data: exportData,
          createdAt: now
        });
      }
    }
    if (state.calibrationSessions && Array.isArray(state.calibrationSessions)) {
      state.calibrationSessions.forEach(function (s) {
        if (!calibrationSessions.some(function (cs) { return cs.id === s.id; })) {
          calibrationSessions.push(s);
        }
      });
    }

    var calibrationPlans = [];
    if (state.calibrationPlans && Array.isArray(state.calibrationPlans)) {
      calibrationPlans = state.calibrationPlans.filter(function (p) {
        return p && p.id && p.name && Array.isArray(p.sourcePoints) && Array.isArray(p.targetPoints);
      }).map(function (p) {
        return {
          id: p.id,
          name: p.name,
          description: p.description || "",
          sourcePageId: p.sourcePageId || null,
          targetPageId: p.targetPageId || null,
          sourcePageName: p.sourcePageName || "",
          targetPageName: p.targetPageName || "",
          sourcePoints: Array.isArray(p.sourcePoints) ? p.sourcePoints.slice() : [null, null, null, null],
          targetPoints: Array.isArray(p.targetPoints) ? p.targetPoints.slice() : [null, null, null, null],
          transform: p.transform || null,
          transformType: p.transformType || null,
          quality: p.quality || null,
          residual: p.residual || null,
          sourceMarkerCount: Number(p.sourceMarkerCount) || 0,
          sourceMarkerTypeCounts: p.sourceMarkerTypeCounts || {},
          useCount: Number(p.useCount) || 0,
          lastUsedAt: p.lastUsedAt || null,
          createdAt: p.createdAt || now,
          updatedAt: p.updatedAt || now,
        };
      });
    }

    var hasImages = pages.some(function (p) { return p.image && p.image.length > 0; });

    var imageRefCount = pages.filter(function (p) { return !p.imageIncluded && p.imageRef; }).length;

    var imageSizes = pages.map(function (p) {
      return {
        id: p.id,
        imageSize: p.image ? Math.round((p.image.length * 3) / 4 / 1024) : 0,
      };
    });

    var totalImageSizeKB = imageSizes.reduce(function (acc, s) { return acc + s.imageSize; }, 0);

    var taskQueueData = null;
    if (global.TaskQueue && typeof global.TaskQueue.exportForPackage === "function") {
      try {
        taskQueueData = global.TaskQueue.exportForPackage();
        if (!taskQueueData || !Array.isArray(taskQueueData.tasks)) {
          taskQueueData = null;
        }
      } catch (e) {
        console.warn("导出任务队列数据失败", e);
        taskQueueData = null;
      }
    }

    var result = {
      format: PACKAGE_FORMAT,
      formatVersion: PACKAGE_VERSION,
      exportedAt: now,
      packageName: state.volumeTitle || state.volumeId || "未命名项目",
      project: {
        id: state.volumeId || "",
        title: state.volumeTitle || "",
        createdAt: state.createdAt || now,
        updatedAt: state.updatedAt || now,
      },
      damageTypes: damageTypes,
      summary: {
        pageCount: pages.length,
        totalMarkers: totalMarkers,
        typeCounts: typeCounts,
        hasImages: hasImages,
        hasRealCoords: hasRealCoords,
        hasMigratedMarkers: hasMigratedMarkers,
        hasCalibrationSessions: calibrationSessions.length > 0,
        calibrationSessionCount: calibrationSessions.length,
        hasCalibrationPlans: calibrationPlans.length > 0,
        calibrationPlanCount: calibrationPlans.length,
        imageRefCount: imageRefCount,
        totalImageSizeKB: totalImageSizeKB,
        hasTaskQueue: !!taskQueueData,
        taskCount: taskQueueData ? taskQueueData.taskCount : 0,
      },
      pages: pages,
      calibrationSessions: calibrationSessions,
      calibrationPlans: calibrationPlans,
      _meta: {
        exportedBy: "wxyy-archive-tool",
        exportOptions: {
          includeImages: includeImages,
        },
      },
    };

    if (taskQueueData) {
      result.taskQueue = taskQueueData;
    }

    if (hasRealCoords) {
      result.coordSystem = "dual";
      result.coordNote = "同时包含百分比坐标(x,y)和真实像素坐标(realX,realY)";
    }

    result._checksum = computeChecksum(result);

    return result;
  }

  function getExportSummary(state, options) {
    options = options || {};
    var includeImages = options.includeImages !== false;
    var pages = state.pages || [];
    var totalMarkers = pages.reduce(function (a, p) { return a + (p.markers ? p.markers.length : 0); }, 0);
    var hasImages = includeImages && pages.some(function (p) { return p.image && p.image.length > 0; });
    var imageRefCount = !includeImages ? pages.filter(function (p) { return p.image && (p.fileName || p.name); }).length : 0;

    var totalImageSizeKB = 0;
    if (includeImages) {
      pages.forEach(function (p) {
        if (p.image) totalImageSizeKB += Math.round((p.image.length * 3) / 4 / 1024);
      });
    }

    var estimatedFileSizeKB = 0;
    try {
      var pkg = exportPackage(state, options);
      estimatedFileSizeKB = Math.round(new Blob([JSON.stringify(pkg)]).size / 1024);
    } catch (e) {
      estimatedFileSizeKB = Math.round(totalImageSizeKB + totalMarkers * 0.2 + pages.length * 0.5);
    }

    return {
      pageCount: pages.length,
      totalMarkers: totalMarkers,
      damageTypeCount: (state.damageTypes || []).length,
      hasImages: hasImages,
      imageRefCount: imageRefCount,
      includeImages: includeImages,
      totalImageSizeKB: totalImageSizeKB,
      estimatedFileSizeKB: estimatedFileSizeKB,
      projectName: state.volumeTitle || state.volumeId || "未命名项目",
    };
  }

  var REVIEW_STATUSES = ["pending", "passed", "doubtful", "rejected"];
  var STATUS_LABELS = {
    pending: "待复核",
    passed: "已通过",
    doubtful: "存疑",
    rejected: "已退回",
  };

  function normalizeMarkerForExport(m, damageTypes) {
    if (!m || typeof m.id !== "string") return null;
    var mode = m.mode === "region" ? "region" : "point";
    var resolvedTypeId = m.typeId;
    if (!resolvedTypeId || !damageTypes.some(function (t) { return t.id === resolvedTypeId; })) {
      var byName = damageTypes.find(function (t) { return t.name === m.type; });
      resolvedTypeId = byName ? byName.id : (damageTypes[0] ? damageTypes[0].id : null);
    }
    if (!resolvedTypeId) return null;
    var typeInfo = damageTypes.find(function (t) { return t.id === resolvedTypeId; }) || { name: m.type || "" };

    var base = {
      id: m.id,
      typeId: resolvedTypeId,
      type: typeInfo.name,
      mode: mode,
      note: (m.note || "").trim(),
      x: Number(Number(m.x).toFixed(2)),
      y: Number(Number(m.y).toFixed(2)),
      createdAt: m.createdAt || new Date().toISOString(),
    };

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
    if (m.review && m.review.status && REVIEW_STATUSES.indexOf(m.review.status) !== -1) {
      base.review = {
        status: m.review.status,
        comment: (m.review.comment || "").trim(),
        reviewedAt: m.review.reviewedAt || null,
      };
    }
    return base;
  }

  function parseJsonString(jsonStr) {
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      throw PackageError(ERROR_CODES.INVALID_JSON, "文件内容不是有效的 JSON 格式", e.message);
    }
  }

  function detectFormat(data) {
    if (!data || typeof data !== "object") return null;
    if (data.format === PACKAGE_FORMAT) return PACKAGE_FORMAT;
    if (data.format === LEGACY_FORMAT_VOLUME) return LEGACY_FORMAT_VOLUME;
    if (data.format === LEGACY_FORMAT_PAGE) return LEGACY_FORMAT_PAGE;
    if (data.pages && Array.isArray(data.pages) && (data.volume || data.damageTypes)) return LEGACY_FORMAT_VOLUME;
    if (data.markers && Array.isArray(data.markers) && !data.pages) return LEGACY_FORMAT_PAGE;
    if (data.pageId || (data.id && data.markers && !data.pages)) return LEGACY_FORMAT_PAGE;
    if (Array.isArray(data) && data.length > 0 && data[0].id && data[0].markers) return LEGACY_FORMAT_VOLUME;
    return null;
  }

  function validatePackage(data) {
    if (!data || typeof data !== "object") {
      throw PackageError(ERROR_CODES.MISSING_FIELDS, "包数据为空或格式不正确");
    }

    if (data.format !== PACKAGE_FORMAT) {
      throw PackageError(ERROR_CODES.UNKNOWN_FORMAT, "不是有效的项目工作包格式");
    }

    if (!data.formatVersion) {
      throw PackageError(ERROR_CODES.MISSING_FIELDS, "缺少 formatVersion 字段");
    }

    var versionCompare = compareVersions(data.formatVersion, MIN_SUPPORTED_VERSION);
    if (versionCompare < 0) {
      throw PackageError(
        ERROR_CODES.VERSION_TOO_OLD,
        "工作包版本过旧，无法导入",
        "当前支持的最低版本：" + MIN_SUPPORTED_VERSION + "，文件版本：" + data.formatVersion
      );
    }

    if (compareVersions(data.formatVersion, PACKAGE_VERSION) > 0) {
      throw PackageError(
        ERROR_CODES.VERSION_TOO_NEW,
        "工作包版本高于当前应用版本，无法导入",
        "请更新应用至最新版本后再尝试导入。当前版本：" + PACKAGE_VERSION + "，文件版本：" + data.formatVersion
      );
    }

    if (!Array.isArray(data.pages)) {
      throw PackageError(ERROR_CODES.MISSING_FIELDS, "缺少 pages 字段或格式不正确");
    }

    if (data.pages.length === 0) {
      throw PackageError(ERROR_CODES.NO_PAGES, "工作包中没有任何页面数据");
    }

    if (!Array.isArray(data.damageTypes) || data.damageTypes.length === 0) {
      throw PackageError(ERROR_CODES.DAMAGE_TYPES_INVALID, "损伤类型配置缺失或无效");
    }

    data.damageTypes.forEach(function (t, i) {
      if (!t.id || !t.name || !t.color) {
        throw PackageError(ERROR_CODES.DAMAGE_TYPES_INVALID, "第 " + (i + 1) + " 个损伤类型配置不完整（缺少 id/name/color）");
      }
    });

    var pageIds = new Set();
    data.pages.forEach(function (p, i) {
      if (!p.id) {
        throw PackageError(ERROR_CODES.PAGE_CORRUPT, "第 " + (i + 1) + " 个页面缺少 id 字段");
      }
      if (pageIds.has(p.id)) {
        throw PackageError(ERROR_CODES.PAGE_CORRUPT, "第 " + (i + 1) + " 个页面 ID 重复：" + p.id);
      }
      pageIds.add(p.id);
      if (!Array.isArray(p.markers)) {
        throw PackageError(ERROR_CODES.PAGE_CORRUPT, "页面「" + (p.name || p.id) + "」的 markers 字段无效");
      }
      if (p.image && !isValidDataUrl(p.image)) {
        throw PackageError(ERROR_CODES.IMAGE_DATA_INVALID, "页面「" + (p.name || p.id) + "」的图片数据格式无效");
      }
    });

    if (data._checksum) {
      var currentChecksum = computeChecksum(data);
      if (currentChecksum !== data._checksum) {
        throw PackageError(
          ERROR_CODES.CHECKSUM_MISMATCH,
          "数据完整性校验失败",
          "文件可能在传输或编辑过程中被修改。期望校验值：" + data._checksum + "，实际：" + currentChecksum
        );
      }
    }

    return true;
  }

  function migrateFromLegacyVolume(data) {
    var DEFAULT_DAMAGE_TYPES = global.VolumeStorage.DEFAULT_DAMAGE_TYPES;
    var damageTypes = (Array.isArray(data.damageTypes) && data.damageTypes.length > 0)
      ? data.damageTypes
      : structuredClone(DEFAULT_DAMAGE_TYPES);

    var pages = (data.pages || []).map(function (p) {
      return {
        id: p.id || crypto.randomUUID(),
        name: p.name || "",
        fileName: p.fileName || "",
        image: p.image || "",
        imageWidth: p.imageWidth || null,
        imageHeight: p.imageHeight || null,
        markers: Array.isArray(p.markers)
          ? p.markers.map(function (m) { return normalizeMarkerForExport(m, damageTypes); }).filter(Boolean)
          : [],
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: p.updatedAt || new Date().toISOString(),
      };
    });

    var totalMarkers = pages.reduce(function (a, p) { return a + p.markers.length; }, 0);

    return {
      format: PACKAGE_FORMAT,
      formatVersion: PACKAGE_VERSION,
      exportedAt: new Date().toISOString(),
      packageName: (data.volume && data.volume.title) || (data.volume && data.volume.id) || "",
      project: {
        id: (data.volume && data.volume.id) || "",
        title: (data.volume && data.volume.title) || "",
        createdAt: (data.volume && data.volume.createdAt) || new Date().toISOString(),
        updatedAt: (data.volume && data.volume.updatedAt) || new Date().toISOString(),
      },
      damageTypes: damageTypes,
      summary: {
        pageCount: pages.length,
        totalMarkers: totalMarkers,
        typeCounts: (data.volume && data.volume.typeCounts) || {},
        hasImages: pages.some(function (p) { return p.image && p.image.length > 0; }),
        hasRealCoords: pages.some(function (p) {
          return p.markers.some(function (m) { return m.realX !== undefined; });
        }),
      },
      pages: pages,
      _migratedFrom: LEGACY_FORMAT_VOLUME,
      _originalFormatVersion: data.formatVersion || "unknown",
      _migrationSteps: [
        "识别旧版卷册格式 archive-volume-damage",
        "提取卷册元数据至 project 字段",
        "标准化损伤类型配置",
        "标准化所有页面与标记数据",
        "迁移至格式 v" + PACKAGE_VERSION,
      ],
    };
  }

  function migrateFromLegacyPage(data) {
    var DEFAULT_DAMAGE_TYPES = global.VolumeStorage.DEFAULT_DAMAGE_TYPES;
    var migrationNotes = [];
    var migrationSteps = [
      "识别旧版单页标记格式 archive-page-damage",
    ];

    var damageTypes;
    if (Array.isArray(data.damageTypes) && data.damageTypes.length > 0) {
      damageTypes = data.damageTypes.map(function (t) {
        return {
          id: t.id || "type-" + (t.name || "").replace(/[^a-z0-9]/gi, "").toLowerCase(),
          name: t.name || "",
          color: t.color || "#9d3f2f",
        };
      }).filter(function (t) { return t.id && t.name; });
      migrationNotes.push("使用文件中自带的损伤类型配置");
      migrationSteps.push("提取文件中的损伤类型配置（" + damageTypes.length + " 种）");
    }

    if (!damageTypes || damageTypes.length === 0) {
      damageTypes = structuredClone(DEFAULT_DAMAGE_TYPES);
      migrationNotes.push("使用默认损伤类型配置（虫蛀点、破洞、霉斑、缺角）");
      migrationSteps.push("使用默认损伤类型配置");
    }

    var markers = Array.isArray(data.markers)
      ? data.markers.map(function (m) { return normalizeMarkerForExport(m, damageTypes); }).filter(Boolean)
      : [];

    migrationSteps.push("标准化 " + markers.length + " 条标记数据");

    var typeCounts = Object.fromEntries(damageTypes.map(function (t) { return [t.name, 0]; }));
    markers.forEach(function (m) {
      var t = damageTypes.find(function (dt) { return dt.id === m.typeId; });
      var name = t ? t.name : m.type;
      if (typeCounts[name] === undefined) typeCounts[name] = 0;
      typeCounts[name] += 1;
    });

    var pageId = data.id || data.pageId || crypto.randomUUID();
    var pageName = data.name || data.pageName || "";

    var page = {
      id: pageId,
      name: pageName,
      fileName: data.fileName || "",
      image: data.image || "",
      imageWidth: data.imageWidth || null,
      imageHeight: data.imageHeight || null,
      markers: markers,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    };

    var hasImages = !!page.image && page.image.length > 0;
    var hasRealCoords = markers.some(function (m) { return m.realX !== undefined; });
    var totalImageSizeKB = hasImages ? Math.round((page.image.length * 3) / 4 / 1024) : 0;

    if (!hasImages) {
      migrationNotes.push("文件中不包含图片数据，导入后需要重新导入图片");
      migrationSteps.push("标记：无图片数据");
    } else {
      migrationSteps.push("包含图片数据（约 " + Math.round(totalImageSizeKB) + " KB）");
    }

    migrationSteps.push("迁移至格式 v" + PACKAGE_VERSION);

    return {
      format: PACKAGE_FORMAT,
      formatVersion: PACKAGE_VERSION,
      exportedAt: new Date().toISOString(),
      packageName: data.packageName || data.pageName || data.name || "导入的单页数据",
      project: {
        id: data.volumeId || "",
        title: data.volumeTitle || data.pageName || data.name || "导入的单页数据",
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
      },
      damageTypes: damageTypes,
      summary: {
        pageCount: 1,
        totalMarkers: markers.length,
        typeCounts: typeCounts,
        hasImages: hasImages,
        hasRealCoords: hasRealCoords,
        totalImageSizeKB: totalImageSizeKB,
      },
      pages: [page],
      _migratedFrom: LEGACY_FORMAT_PAGE,
      _originalFormatVersion: data.formatVersion || "unknown",
      _migrationNotes: migrationNotes,
      _migrationSteps: migrationSteps,
    };
  }

  function migrateV1ToV2(data) {
    var result = structuredClone(data);
    result.formatVersion = "2.0";
    result.project = {
      id: (data.volume && data.volume.id) || "",
      title: (data.volume && data.volume.title) || "",
      createdAt: (data.volume && data.volume.createdAt) || data.exportedAt || new Date().toISOString(),
      updatedAt: (data.volume && data.volume.updatedAt) || data.exportedAt || new Date().toISOString(),
    };
    result.summary = {
      pageCount: data.pages ? data.pages.length : 0,
      totalMarkers: data.volume && data.volume.totalMarkers !== undefined
        ? data.volume.totalMarkers
        : (data.pages || []).reduce(function (a, p) { return a + (p.markers ? p.markers.length : 0); }, 0),
      typeCounts: (data.volume && data.volume.typeCounts) || {},
      hasImages: (data.pages || []).some(function (p) { return p.image && p.image.length > 0; }),
      hasRealCoords: (data.pages || []).some(function (p) {
          return (p.markers || []).some(function (m) { return m.realX !== undefined; });
        }),
    };
    if (data.volume) delete result.volume;
    result._migratedFrom = "v1-upgrade";
    result._originalFormatVersion = data.formatVersion || "1.0";
    result._migrationSteps = [
      "从 v1.x 格式升级至 v2.0",
      "提取 volume 元数据至 project 字段",
      "生成 summary 统计信息",
    ];
    return result;
  }

  function migrateV2ToV3(data) {
    var result = structuredClone(data);
    result.formatVersion = "3.0";

    if (!result.project) {
      result.project = {
        id: (data.volume && data.volume.id) || "",
        title: (data.volume && data.volume.title) || data.packageName || "",
        createdAt: (data.volume && data.volume.createdAt) || data.exportedAt || new Date().toISOString(),
        updatedAt: (data.volume && data.volume.updatedAt) || data.exportedAt || new Date().toISOString(),
      };
    }

    if (!result.packageName) {
      result.packageName = (result.project && result.project.title) || "";
    }

    if (!result.summary) {
      var pages = result.pages || [];
      result.summary = {
        pageCount: pages.length,
        totalMarkers: pages.reduce(function (a, p) { return a + (p.markers ? p.markers.length : 0); }, 0),
        typeCounts: (data.volume && data.volume.typeCounts) || {},
        hasImages: pages.some(function (p) { return p.image && p.image.length > 0; }),
        hasRealCoords: pages.some(function (p) {
          return (p.markers || []).some(function (m) { return m.realX !== undefined; });
        }),
        imageRefCount: pages.filter(function (p) { return !p.imageIncluded && (p.fileName || p.name); }).length,
        totalImageSizeKB: 0,
      };
    } else if (result.summary.imageRefCount === undefined) {
      result.summary.imageRefCount = (result.pages || []).filter(function (p) {
        return !p.imageIncluded && (p.fileName || p.name);
      }).length;
    }

    if (data.volume) delete result.volume;

    (result.pages || []).forEach(function (p) {
      if (p.imageRef === undefined && !p.imageIncluded) {
        p.imageRef = p.fileName || p.name || "";
      }
    });

    result._migratedFrom = result._migratedFrom || "v2-upgrade";
    result._originalFormatVersion = result._originalFormatVersion || data.formatVersion || "2.0";
    result._migrationSteps = result._migrationSteps || [
      "从 v2.x 格式升级至 v3.0",
      "补充 project 元数据",
      "补充 imageRef 图片引用字段",
      "补充 summary 统计信息",
    ];
    return result;
  }

  function migrateV3ToV4(data) {
    var result = structuredClone(data);
    result.formatVersion = PACKAGE_VERSION;

    if (!result.packageName) {
      result.packageName = (result.project && result.project.title) || "";
    }

    if (result.project) {
      if (!result.project.createdAt) {
        result.project.createdAt = result.exportedAt || new Date().toISOString();
      }
      if (!result.project.updatedAt) {
        result.project.updatedAt = result.exportedAt || new Date().toISOString();
      }
    }

    if (!result.summary) {
      var pages = result.pages || [];
      var totalM = pages.reduce(function (a, p) { return a + (p.markers ? p.markers.length : 0); }, 0);
      var totalImgKB = 0;
      pages.forEach(function (p) {
        if (p.image) totalImgKB += Math.round((p.image.length * 3) / 4 / 1024);
      });
      result.summary = {
        pageCount: pages.length,
        totalMarkers: totalM,
        typeCounts: {},
        hasImages: pages.some(function (p) { return p.image && p.image.length > 0; }),
        hasRealCoords: pages.some(function (p) {
          return (p.markers || []).some(function (m) { return m.realX !== undefined; });
        }),
        imageRefCount: pages.filter(function (p) { return !p.imageIncluded && (p.fileName || p.name || p.imageRef); }).length,
        totalImageSizeKB: totalImgKB,
      };
    } else {
      if (result.summary.totalImageSizeKB === undefined) {
        var kb = 0;
        (result.pages || []).forEach(function (p) {
          if (p.image) kb += Math.round((p.image.length * 3) / 4 / 1024);
        });
        result.summary.totalImageSizeKB = kb;
      }
      if (result.summary.imageRefCount === undefined) {
        result.summary.imageRefCount = (result.pages || []).filter(function (p) {
          return !p.imageIncluded && (p.fileName || p.name || p.imageRef);
        }).length;
      }
    }

    (result.pages || []).forEach(function (p) {
      if (p.imageIncluded === undefined) {
        p.imageIncluded = Boolean(p.image && p.image.length > 0);
      }
      if (!p.imageRef && !p.imageIncluded && p.image === undefined) {
        p.imageRef = p.fileName || p.name || "";
      }
      if (!p.createdAt) {
        p.createdAt = result.exportedAt || new Date().toISOString();
      }
      if (!p.updatedAt) {
        p.updatedAt = result.exportedAt || new Date().toISOString();
      }
      if (p.markers && Array.isArray(p.markers)) {
        p.markers.forEach(function (m) {
          if (!m.createdAt) {
            m.createdAt = p.createdAt || result.exportedAt || new Date().toISOString();
          }
        });
      }
    });

    if (!result._meta) {
      result._meta = {
        exportedBy: "wxyy-archive-tool",
        exportOptions: {
          includeImages: true,
        },
      };
    }

    delete result._checksum;
    result._checksum = computeChecksum(result);

    result._migratedFrom = result._migratedFrom || "v3-upgrade";
    result._originalFormatVersion = result._originalFormatVersion || data.formatVersion || "3.x";
    result._migrationSteps = result._migrationSteps || [
      "从 v3.x 格式升级至 v" + PACKAGE_VERSION,
      "补充 project 元数据完整性",
      "补充 summary 统计字段",
      "补充页面与标记时间戳",
      "重新计算数据校验值",
    ];

    return result;
  }

  function migrateCurrentVersion(data) {
    var fmt = detectFormat(data);

    if (fmt === PACKAGE_FORMAT) {
      var v = data.formatVersion || "1.0";
      var steps = [];
      var result = data;

      if (compareVersions(v, "2.0") < 0) {
        result = migrateV1ToV2(result);
        steps.push("v1.x → v2.0");
      }
      if (compareVersions(result.formatVersion, "3.0") < 0) {
        result = migrateV2ToV3(result);
        steps.push("v2.x → v3.0");
      }
      if (compareVersions(result.formatVersion, PACKAGE_VERSION) < 0) {
        result = migrateV3ToV4(result);
        steps.push("v3.x → v" + PACKAGE_VERSION);
      }

      if (steps.length > 0) {
        if (!result._migrationSteps) {
          result._migrationSteps = steps;
        }
      }

      return result;
    }

    if (fmt === LEGACY_FORMAT_VOLUME) {
      try {
        return migrateFromLegacyVolume(data);
      } catch (e) {
        throw PackageError(ERROR_CODES.MIGRATION_FAILED, "从卷册格式迁移失败", e.message);
      }
    }

    if (fmt === LEGACY_FORMAT_PAGE) {
      try {
        return migrateFromLegacyPage(data);
      } catch (e) {
        throw PackageError(ERROR_CODES.MIGRATION_FAILED, "从单页格式迁移失败", e.message);
      }
    }

    throw PackageError(ERROR_CODES.UNKNOWN_FORMAT, "无法识别的文件格式，请确认文件是否正确");
  }

  function importPackage(jsonStr) {
    if (!jsonStr || typeof jsonStr !== "string") {
      throw PackageError(ERROR_CODES.INVALID_JSON, "文件内容为空");
    }

    var data;
    try {
      data = parseJsonString(jsonStr);
    } catch (e) {
      throw PackageError(
        ERROR_CODES.INVALID_JSON,
        "文件内容不是有效的 JSON 格式",
        "请确认文件未损坏且为正确的 JSON 格式。错误详情：" + (e.message || String(e))
      );
    }

    var fmt = detectFormat(data);
    if (!fmt) {
      var hint = "支持的格式：\n";
      hint += "• archive-project-package (v2.x/v3.x/v4.x) - 当前项目工作包格式\n";
      hint += "• archive-volume-damage (v1.x) - 旧版卷册数据格式\n";
      hint += "• archive-page-damage (v1.x) - 旧版单页标记格式";
      throw PackageError(
        ERROR_CODES.UNKNOWN_FORMAT,
        "无法识别的文件格式",
        hint
      );
    }

    var migrated;
    try {
      migrated = migrateCurrentVersion(data);
    } catch (e) {
      if (e.isPackageError) {
        throw e;
      }
      throw PackageError(
        ERROR_CODES.MIGRATION_FAILED,
        "数据迁移失败",
        "原始格式：" + fmt + "，错误：" + (e.message || String(e))
      );
    }

    try {
      validatePackage(migrated);
    } catch (e) {
      if (e.isPackageError) {
        throw e;
      }
      throw PackageError(
        ERROR_CODES.VALIDATION_ERROR,
        "数据验证失败",
        e.message || String(e)
      );
    }

    return {
      packageData: migrated,
      wasMigrated: !!migrated._migratedFrom,
      migratedFrom: migrated._migratedFrom || null,
      originalFormatVersion: migrated._originalFormatVersion || null,
      migrationNotes: migrated._migrationNotes || [],
      migrationSteps: migrated._migrationSteps || [],
    };
  }

  function packageToState(packageData) {
    var now = new Date().toISOString();
    var proj = packageData.project || {};

    var calibrationPlans = [];
    if (packageData.calibrationPlans && Array.isArray(packageData.calibrationPlans)) {
      calibrationPlans = packageData.calibrationPlans.filter(function (p) {
        return p && p.id && p.name && Array.isArray(p.sourcePoints) && Array.isArray(p.targetPoints);
      }).map(function (p) {
        return {
          id: p.id,
          name: p.name,
          description: p.description || "",
          sourcePageId: p.sourcePageId || null,
          targetPageId: p.targetPageId || null,
          sourcePageName: p.sourcePageName || "",
          targetPageName: p.targetPageName || "",
          sourcePoints: Array.isArray(p.sourcePoints) ? p.sourcePoints.slice() : [null, null, null, null],
          targetPoints: Array.isArray(p.targetPoints) ? p.targetPoints.slice() : [null, null, null, null],
          transform: p.transform || null,
          transformType: p.transformType || null,
          quality: p.quality || null,
          residual: p.residual || null,
          sourceMarkerCount: Number(p.sourceMarkerCount) || 0,
          sourceMarkerTypeCounts: p.sourceMarkerTypeCounts || {},
          useCount: Number(p.useCount) || 0,
          lastUsedAt: p.lastUsedAt || null,
          createdAt: p.createdAt || now,
          updatedAt: p.updatedAt || now,
        };
      });
    }

    return {
      volumeId: proj.id || "",
      volumeTitle: proj.title || "",
      pages: packageData.pages.map(function (p) {
        return {
          id: p.id,
          name: p.name || "",
          fileName: p.fileName || "",
          image: p.image || "",
          imageWidth: p.imageWidth !== undefined && p.imageWidth !== null ? Number(p.imageWidth) || undefined : undefined,
          imageHeight: p.imageHeight !== undefined && p.imageHeight !== null ? Number(p.imageHeight) || undefined : undefined,
          markers: Array.isArray(p.markers) ? p.markers.map(function (m) {
            if (m.review && m.review.status && REVIEW_STATUSES.indexOf(m.review.status) !== -1) {
              m.review = {
                status: m.review.status,
                comment: (m.review.comment || "").trim(),
                reviewedAt: m.review.reviewedAt || null,
              };
            }
            return m;
          }) : [],
          createdAt: p.createdAt || now,
          updatedAt: p.updatedAt || now,
        };
      }),
      currentPageId: packageData.pages.length > 0 ? packageData.pages[0].id : null,
      createdAt: proj.createdAt || now,
      updatedAt: now,
      damageTypes: packageData.damageTypes,
      calibrationSessions: packageData.calibrationSessions || [],
      calibrationPlans: calibrationPlans,
    };
  }

  function analyzeReviewMatches(packageData, currentState) {
    var result = {
      hasReviewData: false,
      totalInPackage: 0,
      totalWillBeApplied: 0,
      totalCannotApply: 0,
      toApply: [],
      cannotApply: [],
      stats: {
        passed: 0,
        doubtful: 0,
        rejected: 0,
        pending: 0,
      },
    };

    if (!packageData || !packageData.pages) return result;

    var packagePageIds = new Set(packageData.pages.map(function (p) { return p.id; }));
    var packageMarkerIds = new Set();
    packageData.pages.forEach(function (p) {
      if (p.markers) {
        p.markers.forEach(function (m) { packageMarkerIds.add(m.id); });
      }
    });

    var currentPageIds = new Set();
    var currentMarkerIds = new Set();
    if (currentState && currentState.pages) {
      currentState.pages.forEach(function (p) {
        currentPageIds.add(p.id);
        if (p.markers) {
          p.markers.forEach(function (m) { currentMarkerIds.add(m.id); });
        }
      });
    }

    packageData.pages.forEach(function (p) {
      if (!p.markers) return;
      p.markers.forEach(function (m) {
        if (!m.review || m.review.status === "pending" || !m.review.status) return;

        result.hasReviewData = true;
        result.totalInPackage++;

        if (m.review.status === "passed") result.stats.passed++;
        else if (m.review.status === "doubtful") result.stats.doubtful++;
        else if (m.review.status === "rejected") result.stats.rejected++;
        else if (m.review.status === "pending") result.stats.pending++;

        var markerInPackage = packageMarkerIds.has(m.id);
        var pageInPackage = packagePageIds.has(p.id);
        var markerValid = m.id && pageInPackage && markerInPackage;

        var hasConflict = false;
        var conflictReason = "";

        if (!m.id) {
          hasConflict = true;
          conflictReason = "标记ID缺失";
        } else if (!p.id) {
          hasConflict = true;
          conflictReason = "页面ID缺失";
        } else if (!pageInPackage) {
          hasConflict = true;
          conflictReason = "页面不存在于包中";
        } else if (!markerInPackage) {
          hasConflict = true;
          conflictReason = "标记不存在于包中";
        }

        if (currentState && currentState.pages && !hasConflict) {
          var pageInCurrent = currentPageIds.has(p.id);
          var markerInCurrent = currentMarkerIds.has(m.id);
          if (!pageInCurrent) {
            hasConflict = true;
            conflictReason = "页面不存在于当前项目";
          } else if (!markerInCurrent) {
            hasConflict = true;
            conflictReason = "标记不存在于当前项目";
          }
        }

        var entry = {
          markerId: m.id,
          pageId: p.id,
          pageName: p.name || p.fileName || p.id,
          markerType: m.type || "",
          status: m.review.status,
          statusLabel: STATUS_LABELS[m.review.status],
          comment: m.review.comment || "",
        };

        if (hasConflict) {
          entry.reason = conflictReason;
          result.cannotApply.push(entry);
          result.totalCannotApply++;
        } else {
          result.toApply.push(entry);
          result.totalWillBeApplied++;
        }
      });
    });

    return result;
  }

  function verifyRoundTripIntegrity(packageData, restoredState) {
    var issues = [];
    var warnings = [];

    if (!packageData || !restoredState) {
      return { valid: false, issues: ["包数据或恢复状态为空"], warnings: [] };
    }

    var pkgPages = packageData.pages || [];
    var statePages = restoredState.pages || [];

    if (pkgPages.length !== statePages.length) {
      issues.push("页面数量不匹配：包中 " + pkgPages.length + " 页，恢复后 " + statePages.length + " 页");
    }

    var pkgMarkerCount = pkgPages.reduce(function (a, p) { return a + (Array.isArray(p.markers) ? p.markers.length : 0); }, 0);
    var stateMarkerCount = statePages.reduce(function (a, p) { return a + (Array.isArray(p.markers) ? p.markers.length : 0); }, 0);
    if (pkgMarkerCount !== stateMarkerCount) {
      issues.push("标记数量不匹配：包中 " + pkgMarkerCount + " 条，恢复后 " + stateMarkerCount + " 条");
    }

    var pkgDamageTypes = packageData.damageTypes || [];
    var stateDamageTypes = restoredState.damageTypes || [];
    if (pkgDamageTypes.length !== stateDamageTypes.length) {
      issues.push("损伤类型数量不匹配：包中 " + pkgDamageTypes.length + " 种，恢复后 " + stateDamageTypes.length + " 种");
    }

    var pkgPageIds = new Set(pkgPages.map(function (p) { return p.id; }));
    var statePageIds = new Set(statePages.map(function (p) { return p.id; }));
    pkgPageIds.forEach(function (id) {
      if (!statePageIds.has(id)) {
        issues.push("页面 " + id + " 在包中存在但恢复后缺失");
      }
    });

    var proj = packageData.project || {};
    if (proj.title && restoredState.volumeTitle !== proj.title) {
      warnings.push("项目名称不匹配：包中「" + proj.title + "」，恢复后「" + restoredState.volumeTitle + "」");
    }

    var pagesWithMissingImages = statePages.filter(function (p) { return !p.image || p.image.length === 0; });
    if (pagesWithMissingImages.length > 0) {
      warnings.push(pagesWithMissingImages.length + " 个页面缺少图片数据");
    }

    return {
      valid: issues.length === 0,
      issues: issues,
      warnings: warnings,
    };
  }

  function getPackageSummary(packageData) {
    var proj = packageData.project || {};
    var sum = packageData.summary || {};

    var totalMarkers = sum.totalMarkers !== undefined
      ? sum.totalMarkers
      : (packageData.pages || []).reduce(function (a, p) { return a + (Array.isArray(p.markers) ? p.markers.length : 0); }, 0);

    var hasImages = sum.hasImages !== undefined
      ? sum.hasImages
      : (packageData.pages || []).some(function (p) { return p.image && p.image.length > 0; });

    var hasRealCoords = sum.hasRealCoords !== undefined
      ? sum.hasRealCoords
      : (packageData.pages || []).some(function (p) {
          return (p.markers || []).some(function (m) { return m.realX !== undefined; });
        });

    var totalImageSizeKB = sum.totalImageSizeKB !== undefined
      ? sum.totalImageSizeKB
      : 0;

    var typeCounts = sum.typeCounts || {};

    var imageRefCount = sum.imageRefCount !== undefined
      ? sum.imageRefCount
      : (packageData.pages || []).filter(function (p) { return !p.imageIncluded && (p.imageRef || p.fileName || p.name); }).length;

    var migrationNotes = packageData._migrationNotes || [];
    var migrationSteps = packageData._migrationSteps || [];

    var hasTaskQueue = !!(packageData.taskQueue && Array.isArray(packageData.taskQueue.tasks));
    var taskCount = hasTaskQueue ? packageData.taskQueue.tasks.length : 0;

    var reviewStats = {
      hasReviewData: false,
      totalReviewed: 0,
      passed: 0,
      doubtful: 0,
      rejected: 0,
      pending: 0,
    };
    (packageData.pages || []).forEach(function (p) {
      if (!p.markers) return;
      p.markers.forEach(function (m) {
        if (m.review && m.review.status && m.review.status !== "pending") {
          reviewStats.hasReviewData = true;
          reviewStats.totalReviewed++;
          if (m.review.status === "passed") reviewStats.passed++;
          else if (m.review.status === "doubtful") reviewStats.doubtful++;
          else if (m.review.status === "rejected") reviewStats.rejected++;
        }
      });
    });

    return {
      packageName: packageData.packageName || proj.title || proj.id || "未命名项目",
      pageCount: packageData.pages ? packageData.pages.length : 0,
      totalMarkers: totalMarkers,
      damageTypeCount: packageData.damageTypes ? packageData.damageTypes.length : 0,
      hasImages: hasImages,
      hasRealCoords: hasRealCoords,
      imageRefCount: imageRefCount,
      totalImageSizeKB: totalImageSizeKB,
      typeCounts: typeCounts,
      exportedAt: packageData.exportedAt || null,
      formatVersion: packageData.formatVersion || "unknown",
      wasMigrated: !!packageData._migratedFrom,
      migratedFrom: packageData._migratedFrom || null,
      originalFormatVersion: packageData._originalFormatVersion || null,
      migrationNotes: migrationNotes,
      migrationSteps: migrationSteps,
      projectId: proj.id || "",
      projectTitle: proj.title || "",
      hasTaskQueue: hasTaskQueue,
      taskCount: taskCount,
      reviewStats: reviewStats,
    };
  }

  function getTaskQueuePreview(packageData) {
    var result = {
      hasTaskQueue: false,
      taskCount: 0,
      statusCounts: { pending: 0, in_progress: 0, completed: 0 },
      linkedTaskCount: 0,
      orphanTaskCount: 0,
      standaloneTaskCount: 0,
      localTaskCount: 0,
      conflicts: [],
    };

    var tq = packageData && packageData.taskQueue;
    if (!tq || !Array.isArray(tq.tasks)) {
      return result;
    }

    result.hasTaskQueue = true;

    var pageIds = new Set();
    (packageData.pages || []).forEach(function (p) {
      if (p && p.id) pageIds.add(p.id);
    });

    var localTaskCount = 0;
    if (global.TaskQueue && Array.isArray(global.TaskQueue.tasks)) {
      localTaskCount = global.TaskQueue.tasks.length;
    }
    result.localTaskCount = localTaskCount;

    tq.tasks.forEach(function (t) {
      if (!t || !t.id) return;
      result.taskCount++;
      var st = t.status || "pending";
      if (result.statusCounts[st] !== undefined) result.statusCounts[st]++;
      if (!t.pageId) {
        result.standaloneTaskCount++;
      } else if (pageIds.has(t.pageId)) {
        result.linkedTaskCount++;
      } else {
        result.orphanTaskCount++;
      }
    });

    if (result.orphanTaskCount > 0) {
      result.conflicts.push({
        code: "ORPHAN_TASK_PAGES",
        level: "warning",
        message: result.orphanTaskCount + " 个任务关联的页面不在工作包中，导入后将作为独立任务保留（无关联页面）。",
      });
    }
    if (result.standaloneTaskCount > 0) {
      result.conflicts.push({
        code: "STANDALONE_TASKS",
        level: "info",
        message: result.standaloneTaskCount + " 个任务未关联页面，导入后将作为独立任务保留。",
      });
    }
    if (localTaskCount > 0) {
      result.conflicts.push({
        code: "LOCAL_TASKS_REPLACE",
        level: "info",
        message: "当前本地任务队列有 " + localTaskCount + " 个任务，导入后将替换为工作包中的任务队列。",
      });
    }

    return result;
  }

  function sanitizeFilenamePart(str) {
    return (str || "")
      .replace(/[\\/:*?"<>|\s]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  }

  function downloadPackage(packageObj) {
    var idPart = sanitizeFilenamePart(packageObj.project && packageObj.project.id);
    var titlePart = sanitizeFilenamePart(packageObj.packageName);
    var stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    var parts = ["project-package"];
    if (idPart) parts.push(idPart);
    if (titlePart) parts.push(titlePart);
    parts.push(stamp);

    var blob = new Blob([JSON.stringify(packageObj, null, 2)], {
      type: "application/json",
    });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = parts.join("_") + ".json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1500);
  }

  function getQuickInfo(jsonStr) {
    if (!jsonStr || typeof jsonStr !== "string") {
      return { valid: false, error: "文件内容为空" };
    }
    var fileSize = 0;
    try {
      fileSize = new Blob([jsonStr]).size;
    } catch (e) {
      fileSize = jsonStr.length * 2;
    }
    if (fileSize > MAX_PACKAGE_SIZE) {
      return {
        valid: false,
        error: "文件过大（超过 " + Math.round(MAX_PACKAGE_SIZE / 1024 / 1024) + " MB），可能超出浏览器处理能力",
        fileSize: fileSize,
        errorCode: ERROR_CODES.PACKAGE_TOO_LARGE,
      };
    }
    var data;
    try {
      data = JSON.parse(jsonStr);
    } catch (e) {
      return { valid: false, error: "文件不是有效的 JSON 格式", fileSize: fileSize, errorCode: ERROR_CODES.INVALID_JSON };
    }
    var fmt = detectFormat(data);
    if (!fmt) {
      if (Array.isArray(data) && data.length > 0 && data[0].markers) {
        fmt = LEGACY_FORMAT_PAGE;
      } else {
        return {
          valid: false,
          error: "无法识别的文件格式",
          fileSize: fileSize,
          errorCode: ERROR_CODES.UNKNOWN_FORMAT,
        };
      }
    }
    var info = {
      valid: true,
      format: fmt,
      fileSize: fileSize,
      sizeWarning: fileSize > PACKAGE_SIZE_WARNING_THRESHOLD,
      isCurrentFormat: fmt === PACKAGE_FORMAT,
      isLegacyFormat: fmt === LEGACY_FORMAT_VOLUME || fmt === LEGACY_FORMAT_PAGE,
    };
    if (fmt === PACKAGE_FORMAT) {
      info.formatVersion = data.formatVersion || "unknown";
      info.packageName = data.packageName || (data.project && data.project.title) || "未命名项目";
      info.pageCount = data.pages ? data.pages.length : 0;
      info.hasImages = data.pages ? data.pages.some(function (p) { return p.image && p.image.length > 0; }) : false;
      info.hasDamageTypes = Array.isArray(data.damageTypes) && data.damageTypes.length > 0;
      info.exportedAt = data.exportedAt || null;
      info.projectTitle = data.project ? data.project.title : "";
      info.projectId = data.project ? data.project.id : "";
      info.integrityVerified = false;
      if (data._checksum) {
        var currentChecksum = computeChecksum(data);
        info.integrityVerified = currentChecksum === data._checksum;
      }
    } else if (fmt === LEGACY_FORMAT_VOLUME) {
      info.formatVersion = data.formatVersion || "1.x";
      info.packageName = (data.volume && data.volume.title) || "旧版卷册数据";
      info.pageCount = data.pages ? data.pages.length : 0;
      info.hasImages = data.pages ? data.pages.some(function (p) { return p.image && p.image.length > 0; }) : false;
      info.hasDamageTypes = Array.isArray(data.damageTypes) && data.damageTypes.length > 0;
      info.exportedAt = data.exportedAt || null;
    } else if (fmt === LEGACY_FORMAT_PAGE) {
      info.formatVersion = "1.x";
      info.packageName = data.pageName || data.name || "旧版单页数据";
      info.pageCount = 1;
      info.hasImages = !!(data.image && data.image.length > 0);
      info.hasDamageTypes = Array.isArray(data.damageTypes) && data.damageTypes.length > 0;
      info.exportedAt = data.exportedAt || data.createdAt || null;
    }
    return info;
  }

  function validateForRestore(packageData) {
    var issues = [];
    var warnings = [];
    if (!packageData || typeof packageData !== "object") {
      return { canRestore: false, issues: ["包数据为空"], warnings: [] };
    }
    try {
      validatePackage(packageData);
    } catch (e) {
      if (e.isPackageError) {
        issues.push({ code: e.code, message: e.message, detail: e.detail });
      } else {
        issues.push({ code: ERROR_CODES.VALIDATION_ERROR, message: e.message || "验证失败" });
      }
    }
    if (issues.length > 0) {
      return { canRestore: false, issues: issues, warnings: warnings };
    }
    var pages = packageData.pages || [];
    var pagesWithoutImages = pages.filter(function (p) { return !p.image || p.image.length === 0; });
    if (pagesWithoutImages.length > 0) {
      warnings.push({
        code: "MISSING_IMAGES",
        message: pagesWithoutImages.length + " 个页面不包含图片数据，导入后需要重新导入图片",
        pageIds: pagesWithoutImages.map(function (p) { return p.id; }),
      });
    }
    var pagesWithInvalidMarkers = pages.filter(function (p) {
      return p.markers.some(function (m) { return !m.typeId && !m.type; });
    });
    if (pagesWithInvalidMarkers.length > 0) {
      warnings.push({
        code: "MARKERS_WITHOUT_TYPE",
        message: pagesWithInvalidMarkers.length + " 个页面存在无类型的标记，这些标记可能无法正确显示",
      });
    }
    var estimatedStorageSize = estimatePackageStorageSize(packageData);
    var quotaInfo = checkStorageQuota(estimatedStorageSize);
    if (quotaInfo.warningLevel !== "ok") {
      warnings.push({
        code: quotaInfo.warningLevel === "critical" ? "QUOTA_CRITICAL" : "QUOTA_WARNING",
        message: quotaInfo.warningLevel === "critical"
          ? "存储空间严重不足，导入后可能仅剩 " + formatBytes(Math.max(0, quotaInfo.availableAfterImport))
          : "存储空间紧张，导入后预计剩余 " + formatBytes(Math.max(0, quotaInfo.availableAfterImport)),
        quotaInfo: quotaInfo,
      });
    }
    return { canRestore: true, issues: [], warnings: warnings, estimatedStorageSize: estimatedStorageSize, quotaInfo: quotaInfo };
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  global.ProjectPackage = {
    PACKAGE_FORMAT: PACKAGE_FORMAT,
    PACKAGE_VERSION: PACKAGE_VERSION,
    MIN_SUPPORTED_VERSION: MIN_SUPPORTED_VERSION,
    PACKAGE_SIZE_WARNING_THRESHOLD: PACKAGE_SIZE_WARNING_THRESHOLD,
    MAX_PACKAGE_SIZE: MAX_PACKAGE_SIZE,
    ERROR_CODES: ERROR_CODES,
    ERROR_RESOLUTIONS: ERROR_RESOLUTIONS,
    REVIEW_STATUSES: REVIEW_STATUSES,
    REVIEW_STATUS_LABELS: STATUS_LABELS,
    PackageError: PackageError,
    exportPackage: exportPackage,
    getExportSummary: getExportSummary,
    importPackage: importPackage,
    validatePackage: validatePackage,
    validateForRestore: validateForRestore,
    migrateCurrentVersion: migrateCurrentVersion,
    packageToState: packageToState,
    getPackageSummary: getPackageSummary,
    getTaskQueuePreview: getTaskQueuePreview,
    getQuickInfo: getQuickInfo,
    downloadPackage: downloadPackage,
    detectFormat: detectFormat,
    compareVersions: compareVersions,
    computeChecksum: computeChecksum,
    estimateExportSize: estimateExportSize,
    estimatePackageStorageSize: estimatePackageStorageSize,
    checkStorageQuota: checkStorageQuota,
    formatBytes: formatBytes,
    verifyRoundTripIntegrity: verifyRoundTripIntegrity,
    analyzeReviewMatches: analyzeReviewMatches,
  };
})(window);
