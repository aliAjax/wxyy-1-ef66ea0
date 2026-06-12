(function () {
  const { createPage, export: buildExport } = window.VolumeStorage;
  const State = window.VolumeState;
  const Render = window.VolumeRender;

  const imageInput = document.getElementById("imageInput");
  const typeInput = document.getElementById("typeInput");
  const noteInput = document.getElementById("noteInput");
  const stage = document.getElementById("stage");
  const exportBtn = document.getElementById("exportBtn");
  const clearBtn = document.getElementById("clearBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length === 0) return;

    const sortBy = (a, b) => {
      const na = (a.name || "").toLowerCase();
      const nb = (b.name || "").toLowerCase();
      return na.localeCompare(nb, "zh-Hans-CN", { numeric: true });
    };
    files.sort(sortBy);

    const newPages = [];
    for (const file of files) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const page = createPage({
          dataUrl,
          fileName: file.name,
        });
        newPages.push(page);
      } catch (e) {
        console.error("读取文件失败", file.name, e);
      }
    }

    const added = State.addPages(newPages);
    if (added > 0) {
      Render.refresh();
      const last = newPages[newPages.length - 1];
      if (last && files.length === 1) {
        State.switchPage(last.id);
      }
    }
    imageInput.value = "";
  }

  function computeRelativeCoords(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, Number(x.toFixed(2)))),
      y: Math.max(0, Math.min(100, Number(y.toFixed(2)))),
    };
  }

  function handleStageClick(event) {
    if (event.target.closest("button, [data-marker]")) return;
    const page = State.currentPage;
    if (!page || !page.image) return;

    const { x, y } = computeRelativeCoords(event.clientX, event.clientY);
    const marker = State.addMarker({
      type: typeInput.value,
      note: noteInput.value,
      x,
      y,
    });
    if (marker) {
      noteInput.value = "";
    }
  }

  function sanitizeFilenamePart(str) {
    return (str || "")
      .replace(/[\\/:*?"<>|\s]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  }

  function handleExport() {
    if (!State.hasPages) {
      alert("卷册中暂无任何页面，无法导出。");
      return;
    }
    const payload = buildExport(State.all);

    const idPart = sanitizeFilenamePart(payload.volume.id);
    const titlePart = sanitizeFilenamePart(payload.volume.title);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const parts = ["archive-volume"];
    if (idPart) parts.push(idPart);
    if (titlePart) parts.push(titlePart);
    parts.push(stamp);

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${parts.join("_")}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1500);
  }

  function handleClearCurrent() {
    const page = State.currentPage;
    if (!page) {
      alert("当前没有页面可清空。");
      return;
    }
    if (!confirm("清空当前扫描页和全部标记？此操作不可撤销。")) return;
    State.clearCurrentPage();
  }

  function handleClearAll() {
    if (!State.hasPages) {
      alert("当前没有卷册数据。");
      return;
    }
    const total = State.getTotalMarkers();
    const pageCount = State.pages.length;
    const msg =
      `确认清空全部卷册数据？\n\n` +
      `共 ${pageCount} 页扫描页、${total} 条损伤标记将被永久删除，此操作不可撤销。`;
    if (!confirm(msg)) return;
    State.resetAll();
  }

  function handleKeyboard(event) {
    if (event.target.matches("input, textarea, select")) return;
    if (event.key === "ArrowLeft" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      State.switchPrev();
    } else if (event.key === "ArrowRight" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      State.switchNext();
    } else if ((event.key === "Delete" || event.key === "Backspace") && State.currentPage && State.currentPage.markers.length > 0) {
      if (confirm("清空当前页全部标记？")) {
        event.preventDefault();
        State.clearCurrentMarkers();
      }
    }
  }

  function bindEvents() {
    imageInput.addEventListener("change", () => {
      handleFiles(imageInput.files);
    });

    stage.addEventListener("click", handleStageClick);

    exportBtn.addEventListener("click", handleExport);
    clearBtn.addEventListener("click", handleClearCurrent);
    clearAllBtn.addEventListener("click", handleClearAll);

    document.addEventListener("keydown", handleKeyboard);

    State.subscribe(() => Render.refresh());

    const dropZone = document.body;
    ;['dragenter', 'dragover'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
        }
      });
    });
    dropZone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        handleFiles(e.dataTransfer.files);
      }
    });
  }

  function bootstrap() {
    State.init();
    Render.init();
    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
