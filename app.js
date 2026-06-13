(function () {
  const { createPage, export: buildExport } = window.VolumeStorage;
  const State = window.VolumeState;
  const Render = window.VolumeRender;

  const imageInput = document.getElementById("imageInput");
  const noteInput = document.getElementById("noteInput");
  const configBtn = document.getElementById("configBtn");
  const reviewBtn = document.getElementById("reviewBtn");
  const exportBtn = document.getElementById("exportBtn");
  const clearBtn = document.getElementById("clearBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const modeSwitch = document.getElementById("modeSwitch");

  let currentMode = "point";
  let dragState = null;

  function getActiveElements() {
    return Render.getActiveStageElements();
  }

  function setMode(mode) {
    if (mode !== "point" && mode !== "region") return;
    currentMode = mode;
    const btns = modeSwitch.querySelectorAll(".mode-btn");
    btns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });

    const { dragOverlay } = getActiveElements();
    if (Render.viewerMode && Render.imageViewer) {
      Render.imageViewer.setRegionDrawingMode(mode === "region");
    } else {
      if (mode === "region") {
        dragOverlay.classList.add("active");
      } else {
        dragOverlay.classList.remove("active");
        cancelDrag();
      }
    }
  }

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
      setTimeout(() => {
        if (Render.viewerMode && Render.imageViewer) {
          Render.imageViewer.fitToViewport();
        }
      }, 100);
    }
    imageInput.value = "";
  }

  function computeCoords(clientX, clientY) {
    if (Render.viewerMode && Render.imageViewer && Render.imageViewer.imageLoaded) {
      const viewportEl = Render.Doms.viewerViewport;
      const viewportRect = viewportEl.getBoundingClientRect();
      const viewportX = clientX - viewportRect.left;
      const viewportY = clientY - viewportRect.top;
      const real = Render.imageViewer.viewportToReal(viewportX, viewportY);
      const percent = Render.imageViewer.realToPercent(real.x, real.y);
      return {
        x: percent.x,
        y: percent.y,
        realX: Number(real.x.toFixed(2)),
        realY: Number(real.y.toFixed(2)),
      };
    }

    const { dragOverlay } = getActiveElements();
    const rect = dragOverlay.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, Number(x.toFixed(2)))),
      y: Math.max(0, Math.min(100, Number(y.toFixed(2)))),
    };
  }

  function handleStageClick(event) {
    if (currentMode !== "point") return;
    if (event.target.closest("button, [data-marker]")) return;

    const page = State.currentPage;
    if (!page || !page.image) return;

    if (Render.viewerMode && Render.imageViewer && Render.imageViewer.checkAndClearPanClick()) {
      return;
    }

    const coords = computeCoords(event.clientX, event.clientY);
    const selectedTypeId = Render.getSelectedTypeId();

    const markerData = {
      typeId: selectedTypeId,
      note: noteInput.value,
      x: coords.x,
      y: coords.y,
    };

    if (coords.realX !== undefined) {
      markerData.realX = coords.realX;
      markerData.realY = coords.realY;
    }

    const marker = State.addMarker(markerData);
    if (marker) {
      noteInput.value = "";
    }
  }

  function startDrag(clientX, clientY) {
    if (currentMode !== "region") return;
    const page = State.currentPage;
    if (!page || !page.image) return;

    const { dragOverlay } = getActiveElements();
    const el = document.createElement("div");
    el.className = "drag-rect";
    dragOverlay.appendChild(el);

    dragState = {
      el,
      clientStartX: clientX,
      clientStartY: clientY,
    };

    if (Render.viewerMode && Render.imageViewer && Render.imageViewer.imageLoaded) {
      const viewportEl = Render.Doms.viewerViewport;
      const viewportRect = viewportEl.getBoundingClientRect();
      const startViewportX = clientX - viewportRect.left;
      const startViewportY = clientY - viewportRect.top;
      const real = Render.imageViewer.viewportToReal(startViewportX, startViewportY);
      dragState.startRealX = real.x;
      dragState.startRealY = real.y;
      el.style.position = "absolute";
      el.style.pointerEvents = "none";
    } else {
      const rect = dragOverlay.getBoundingClientRect();
      const startX = ((clientX - rect.left) / rect.width) * 100;
      const startY = ((clientY - rect.top) / rect.height) * 100;
      dragState.startX = startX;
      dragState.startY = startY;
      dragState.rect = rect;
    }

    document.body.classList.add("dragging-region");
  }

  function moveDrag(clientX, clientY) {
    if (!dragState) return;

    if (Render.viewerMode && Render.imageViewer && Render.imageViewer.imageLoaded) {
      const viewportEl = Render.Doms.viewerViewport;
      const viewportRect = viewportEl.getBoundingClientRect();
      const curViewportX = clientX - viewportRect.left;
      const curViewportY = clientY - viewportRect.top;
      const curReal = Render.imageViewer.viewportToReal(curViewportX, curViewportY);

      const leftReal = Math.min(dragState.startRealX, curReal.x);
      const topReal = Math.min(dragState.startRealY, curReal.y);
      const rightReal = Math.max(dragState.startRealX, curReal.x);
      const bottomReal = Math.max(dragState.startRealY, curReal.y);
      const widthReal = rightReal - leftReal;
      const heightReal = bottomReal - topReal;

      dragState.el.style.left = leftReal + "px";
      dragState.el.style.top = topReal + "px";
      dragState.el.style.width = widthReal + "px";
      dragState.el.style.height = heightReal + "px";

      dragState.resultRealX = leftReal;
      dragState.resultRealY = topReal;
      dragState.resultRealW = widthReal;
      dragState.resultRealH = heightReal;

      const percent = Render.imageViewer.realToPercent(leftReal, topReal);
      dragState.resultX = percent.x;
      dragState.resultY = percent.y;
      dragState.resultW = Number(((widthReal / Render.imageViewer.naturalWidth) * 100).toFixed(2));
      dragState.resultH = Number(((heightReal / Render.imageViewer.naturalHeight) * 100).toFixed(2));
    } else {
      const { dragOverlay } = getActiveElements();
      const rect = dragOverlay.getBoundingClientRect();
      const curX = ((clientX - rect.left) / rect.width) * 100;
      const curY = ((clientY - rect.top) / rect.height) * 100;
      const left = Math.max(0, Math.min(dragState.startX, curX));
      const top = Math.max(0, Math.min(dragState.startY, curY));
      const right = Math.min(100, Math.max(dragState.startX, curX));
      const bottom = Math.min(100, Math.max(dragState.startY, curY));

      dragState.el.style.left = left + "%";
      dragState.el.style.top = top + "%";
      dragState.el.style.width = (right - left) + "%";
      dragState.el.style.height = (bottom - top) + "%";

      dragState.resultX = left;
      dragState.resultY = top;
      dragState.resultW = right - left;
      dragState.resultH = bottom - top;
    }
  }

  function endDrag() {
    if (!dragState) return;

    const hasReal = dragState.resultRealX !== undefined &&
                    dragState.resultRealY !== undefined &&
                    dragState.resultRealW !== undefined &&
                    dragState.resultRealH !== undefined;

    const el = dragState.el;
    if (el && el.parentNode) el.remove();

    let savedX = 0, savedY = 0, savedW = 0, savedH = 0;
    let savedRealX, savedRealY, savedRealW, savedRealH;

    if (dragState.resultX !== undefined) savedX = dragState.resultX;
    if (dragState.resultY !== undefined) savedY = dragState.resultY;
    if (dragState.resultW !== undefined) savedW = dragState.resultW;
    if (dragState.resultH !== undefined) savedH = dragState.resultH;
    if (hasReal) {
      savedRealX = dragState.resultRealX;
      savedRealY = dragState.resultRealY;
      savedRealW = dragState.resultRealW;
      savedRealH = dragState.resultRealH;
    }

    dragState = null;
    document.body.classList.remove("dragging-region");

    if (savedW < 1 || savedH < 1) return;

    const selectedTypeId = Render.getSelectedTypeId();

    const markerData = {
      typeId: selectedTypeId,
      note: noteInput.value,
      x: Number(savedX.toFixed(2)),
      y: Number(savedY.toFixed(2)),
      width: Number(savedW.toFixed(2)),
      height: Number(savedH.toFixed(2)),
    };

    if (hasReal) {
      markerData.realX = Number(savedRealX.toFixed(2));
      markerData.realY = Number(savedRealY.toFixed(2));
      markerData.realWidth = Number(savedRealW.toFixed(2));
      markerData.realHeight = Number(savedRealH.toFixed(2));
    }

    const marker = State.addRegion(markerData);
    if (marker) {
      noteInput.value = "";
    }
  }

  function cancelDrag() {
    if (!dragState) return;
    dragState.el.remove();
    dragState = null;
    document.body.classList.remove("dragging-region");
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

    if (Render.viewerMode && Render.imageViewer && Render.imageViewer.imageLoaded) {
      const page = State.currentPage;
      if (page && page.markers.length > 0) {
        const imageInfo = Render.imageViewer.getImageInfo();
        payload.viewerInfo = {
          imageWidth: imageInfo.naturalWidth,
          imageHeight: imageInfo.naturalHeight,
          currentPageId: page.id,
        };
        if (payload.pages) {
          const pageData = payload.pages.find((p) => p.id === page.id);
          if (pageData) {
            pageData.imageWidth = imageInfo.naturalWidth;
            pageData.imageHeight = imageInfo.naturalHeight;
            pageData.markers = page.markers
              .map((m) => Render.imageViewer.exportRealCoords(m))
              .filter(Boolean);
          }
        }
      }
    }

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

  function handleGoReview() {
    window.location.href = "./review.html";
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
    if (event.key === "Escape") {
      if (dragState) {
        event.preventDefault();
        cancelDrag();
        return;
      }
    }
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

    if (Render.viewerMode) {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        if (Render.imageViewer) Render.imageViewer.zoomIn();
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        if (Render.imageViewer) Render.imageViewer.zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        if (Render.imageViewer) Render.imageViewer.fitToViewport();
      }
    }
  }

  function bindEvents() {
    imageInput.addEventListener("change", () => {
      handleFiles(imageInput.files);
    });

    configBtn.addEventListener("click", () => {
      Render.openTypeConfig();
    });

    const { viewerViewport } = Render.Doms;
    const { stage } = Render.Doms;

    if (viewerViewport) {
      viewerViewport.addEventListener("click", handleStageClick);
    }
    if (stage) {
      stage.addEventListener("click", handleStageClick);
    }

    modeSwitch.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-mode]");
      if (!btn) return;
      setMode(btn.dataset.mode);
    });

    function bindDragEvents(dragOverlay) {
      if (!dragOverlay) return;
      dragOverlay.addEventListener("mousedown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        startDrag(event.clientX, event.clientY);
      });

      dragOverlay.addEventListener("touchstart", (event) => {
        if (event.touches.length !== 1) return;
        event.preventDefault();
        const touch = event.touches[0];
        startDrag(touch.clientX, touch.clientY);
      }, { passive: false });
    }

    bindDragEvents(Render.Doms.dragOverlay);
    bindDragEvents(Render.Doms.dragOverlaySimple);

    document.addEventListener("mousemove", (event) => {
      if (dragState) {
        event.preventDefault();
        moveDrag(event.clientX, event.clientY);
      }
    });

    document.addEventListener("mouseup", () => {
      if (dragState) endDrag();
    });

    document.addEventListener("touchmove", (event) => {
      if (!dragState) return;
      event.preventDefault();
      const touch = event.touches[0];
      moveDrag(touch.clientX, touch.clientY);
    }, { passive: false });

    document.addEventListener("touchend", () => {
      if (dragState) endDrag();
    });

    document.addEventListener("touchcancel", () => {
      cancelDrag();
    });

    reviewBtn.addEventListener("click", handleGoReview);
    exportBtn.addEventListener("click", handleExport);
    clearBtn.addEventListener("click", handleClearCurrent);
    clearAllBtn.addEventListener("click", handleClearAll);

    document.addEventListener("keydown", handleKeyboard);

    State.subscribe(() => {
      cancelDrag();
      Render.refresh();
    });

    State.subscribe((state) => {
      setTimeout(() => {
        if (Render.viewerMode && Render.imageViewer && Render.imageViewer.imageLoaded) {
          Render.imageViewer.fitToViewport();
        }
      }, 50);
    });

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
    setMode("point");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
