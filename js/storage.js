(function (global) {
  const STORAGE_KEY = "wxyy-1-archive-volume";
  const TYPES = ["虫蛀点", "破洞", "霉斑", "缺角"];

  const DEFAULT_STATE = {
    volumeId: "",
    volumeTitle: "",
    pages: [],
    currentPageId: null,
    createdAt: null,
    updatedAt: null,
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

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") {
      return structuredClone(DEFAULT_STATE);
    }

    const state = Object.assign(structuredClone(DEFAULT_STATE), raw);
    state.pages = Array.isArray(state.pages)
      ? state.pages.map(normalizePage).filter(Boolean)
      : [];

    if (!state.currentPageId && state.pages.length > 0) {
      state.currentPageId = state.pages[0].id;
    }

    if (state.pages.length > 0 && !state.pages.find((p) => p.id === state.currentPageId)) {
      state.currentPageId = state.pages[0].id;
    }

    return state;
  }

  function normalizePage(raw) {
    if (!raw || typeof raw !== "object" || !raw.id) return null;
    return {
      id: raw.id,
      name: raw.name || "",
      fileName: raw.fileName || "",
      image: raw.image || "",
      markers: Array.isArray(raw.markers)
        ? raw.markers.filter((m) => m && typeof m.id === "string")
        : [],
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
  }

  function createPageFromImage({ dataUrl, fileName }) {
    return normalizePage({
      id: crypto.randomUUID(),
      name: fileName ? fileName.replace(/\.[^.]+$/, "") : "",
      fileName: fileName || "",
      image: dataUrl,
      markers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const VolumeStorage = {
    KEY: STORAGE_KEY,
    TYPES,

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
      });
      writeRaw(fresh);
      return fresh;
    },

    export(state) {
      const pages = state.pages.map((p) => ({
        id: p.id,
        name: p.name,
        fileName: p.fileName,
        imageIncluded: Boolean(p.image),
        markers: p.markers,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));

      const totalMarkers = pages.reduce(
        (acc, p) => acc + p.markers.length,
        0
      );

      const typeCounts = Object.fromEntries(TYPES.map((t) => [t, 0]));
      pages.forEach((p) =>
        p.markers.forEach((m) => {
          if (typeCounts[m.type] !== undefined) typeCounts[m.type] += 1;
        })
      );

      return {
        format: "archive-volume-damage",
        formatVersion: "1.0",
        exportedAt: new Date().toISOString(),
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
    },

    createPage: createPageFromImage,
  };

  global.VolumeStorage = VolumeStorage;
})(window);
