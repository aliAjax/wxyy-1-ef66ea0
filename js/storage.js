(function (global) {
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
    damageTypes: structuredClone(DEFAULT_DAMAGE_TYPES),
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
    return structuredClone(DEFAULT_DAMAGE_TYPES);
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
    return base;
  }

  function normalizePage(raw, damageTypes) {
    if (!raw || typeof raw !== "object" || !raw.id) return null;
    return {
      id: raw.id,
      name: raw.name || "",
      fileName: raw.fileName || "",
      image: raw.image || "",
      markers: Array.isArray(raw.markers)
        ? raw.markers.map((m) => normalizeMarker(m, damageTypes)).filter(Boolean)
        : [],
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") {
      return structuredClone(DEFAULT_STATE);
    }

    const damageTypes = ensureDamageTypes(raw);
    const state = Object.assign(structuredClone(DEFAULT_STATE), raw);
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
      structuredClone(DEFAULT_DAMAGE_TYPES)
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

  const VolumeStorage = {
    KEY: STORAGE_KEY,
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
      const fresh = Object.assign(structuredClone(DEFAULT_STATE), {
        createdAt: now,
        updatedAt: now,
        damageTypes: structuredClone(DEFAULT_DAMAGE_TYPES),
      });
      writeRaw(fresh);
      return fresh;
    },

    export(state) {
      const damageTypes = state.damageTypes || structuredClone(DEFAULT_DAMAGE_TYPES);
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

      return result;
    },

    createPage: createPageFromImage,
  };

  global.VolumeStorage = VolumeStorage;
})(window);
