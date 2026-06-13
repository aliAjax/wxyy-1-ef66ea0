(function (global) {
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 10;
  const SCALE_STEP = 1.1;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function ImageViewer(options) {
    this.viewport = options.viewport;
    this.stage = options.stage;
    this.content = options.content;
    this.image = options.image;
    this.markersLayer = options.markersLayer;
    this.dragOverlay = options.dragOverlay;

    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.imageLoaded = false;

    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.panStartOffsetX = 0;
    this.panStartOffsetY = 0;

    this.isRegionDrawing = false;

    this.listeners = {};

    this._init();
  }

  ImageViewer.prototype._init = function () {
    if (!this.viewport || !this.stage || !this.content || !this.image) return;

    this.viewport.style.overflow = "hidden";
    this.viewport.style.position = "relative";
    this.viewport.style.touchAction = "none";

    this.stage.style.position = "absolute";
    this.stage.style.top = "0";
    this.stage.style.left = "0";
    this.stage.style.transformOrigin = "0 0";
    this.stage.style.willChange = "transform";

    this.content.style.position = "relative";
    this.content.style.transformOrigin = "0 0";

    if (this.markersLayer) {
      this.markersLayer.style.position = "absolute";
      this.markersLayer.style.inset = "0";
      this.markersLayer.style.pointerEvents = "none";
    }

    if (this.dragOverlay) {
      this.dragOverlay.style.position = "absolute";
      this.dragOverlay.style.inset = "0";
      this.dragOverlay.style.pointerEvents = "none";
      this.dragOverlay.style.touchAction = "none";
    }

    this.image.addEventListener("load", () => this._onImageLoad());
    if (this.image.complete) {
      const dims = this._getImageDimensions();
      if (dims.width > 0) {
        this._onImageLoad();
      }
    }

    this._bindEvents();
  };

  ImageViewer.prototype._getImageDimensions = function () {
    let width = this.image.naturalWidth;
    let height = this.image.naturalHeight;

    const src = this.image.src || "";
    if (src.startsWith("data:image/svg+xml") && (width === 0 || height === 0)) {
      try {
        const parts = src.split(",");
        const header = parts[0];
        const data = parts.slice(1).join(",");
        let svgText;
        if (header.indexOf("base64") >= 0) {
          try {
            const cleanBase64 = data.replace(/\\s+/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
            svgText = atob(cleanBase64);
          } catch (e) {
            console.warn("atob failed, trying fallback:", e);
            const bytes = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) {
              bytes[i] = data.charCodeAt(i);
            }
            const binary = String.fromCharCode.apply(null, bytes);
            svgText = unescape(btoa(binary));
          }
        } else {
          svgText = decodeURIComponent(data);
        }
        if (svgText) {
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
          const svg = svgDoc.documentElement;
          const w = svg.getAttribute("width");
          const h = svg.getAttribute("height");
          if (w && h && !isNaN(parseFloat(w)) && !isNaN(parseFloat(h))) {
            width = parseFloat(w);
            height = parseFloat(h);
          }
        }
      } catch (e) {
        console.warn("Failed to parse SVG dimensions:", e);
      }
    }

    if (width === 0 || height === 0) {
      if (this.image.width > 0 && this.image.height > 0) {
        width = this.image.width;
        height = this.image.height;
      }
    }

    if (width === 0 || height === 0) {
      if (this.image.style.width && this.image.style.height) {
        width = parseFloat(this.image.style.width);
        height = parseFloat(this.image.style.height);
      }
    }

    return { width: Math.max(1, width), height: Math.max(1, height) };
  };

  ImageViewer.prototype._onImageLoad = function () {
    const dims = this._getImageDimensions();
    this.naturalWidth = dims.width;
    this.naturalHeight = dims.height;
    this.imageLoaded = this.naturalWidth > 0 && this.naturalHeight > 0;

    this.content.style.width = this.naturalWidth + "px";
    this.content.style.height = this.naturalHeight + "px";
    this.image.style.width = "100%";
    this.image.style.height = "100%";
    this.image.style.display = "block";
    this.image.style.pointerEvents = "none";
    this.image.style.userSelect = "none";

    this._emit("imageLoaded", {
      width: this.naturalWidth,
      height: this.naturalHeight,
    });
  };

  ImageViewer.prototype._bindEvents = function () {
    this.viewport.addEventListener("wheel", (e) => this._handleWheel(e), {
      passive: false,
    });

    this.viewport.addEventListener("mousedown", (e) => this._handleMouseDown(e));
    document.addEventListener("mousemove", (e) => this._handleMouseMove(e));
    document.addEventListener("mouseup", (e) => this._handleMouseUp(e));

    this.viewport.addEventListener("touchstart", (e) => this._handleTouchStart(e), {
      passive: false,
    });
    document.addEventListener("touchmove", (e) => this._handleTouchMove(e), {
      passive: false,
    });
    document.addEventListener("touchend", (e) => this._handleTouchEnd(e));
    document.addEventListener("touchcancel", (e) => this._handleTouchEnd(e));
  };

  ImageViewer.prototype._handleWheel = function (e) {
    if (!this.imageLoaded) return;
    e.preventDefault();

    const rect = this.viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY < 0 ? SCALE_STEP : 1 / SCALE_STEP;
    this.zoomAt(mouseX, mouseY, delta);
  };

  ImageViewer.prototype._handleMouseDown = function (e) {
    if (!this.imageLoaded) return;
    if (e.button !== 0) return;

    if (this.isRegionDrawing) return;

    if (e.target.closest("[data-marker]")) return;

    e.preventDefault();
    this.isPanning = true;
    this.panStartX = e.clientX;
    this.panStartY = e.clientY;
    this.panStartOffsetX = this.offsetX;
    this.panStartOffsetY = this.offsetY;
    this.viewport.style.cursor = "grabbing";
  };

  ImageViewer.prototype._handleMouseMove = function (e) {
    if (this.isPanning) {
      e.preventDefault();
      const dx = e.clientX - this.panStartX;
      const dy = e.clientY - this.panStartY;
      this.panTo(this.panStartOffsetX + dx, this.panStartOffsetY + dy);
    }
  };

  ImageViewer.prototype._handleMouseUp = function (e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.viewport.style.cursor = "";
    }
  };

  ImageViewer.prototype._handleTouchStart = function (e) {
    if (!this.imageLoaded) return;
    if (this.isRegionDrawing) return;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (touch.target.closest("[data-marker]")) return;

      e.preventDefault();
      this.isPanning = true;
      this.panStartX = touch.clientX;
      this.panStartY = touch.clientY;
      this.panStartOffsetX = this.offsetX;
      this.panStartOffsetY = this.offsetY;
    }
  };

  ImageViewer.prototype._handleTouchMove = function (e) {
    if (this.isPanning && e.touches.length === 1) {
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - this.panStartX;
      const dy = touch.clientY - this.panStartY;
      this.panTo(this.panStartOffsetX + dx, this.panStartOffsetY + dy);
    }
  };

  ImageViewer.prototype._handleTouchEnd = function (e) {
    if (this.isPanning) {
      this.isPanning = false;
    }
  };

  ImageViewer.prototype.zoomAt = function (viewportX, viewportY, factor) {
    if (!this.imageLoaded) return;

    const imageX = (viewportX - this.offsetX) / this.scale;
    const imageY = (viewportY - this.offsetY) / this.scale;

    const newScale = clamp(this.scale * factor, MIN_SCALE, MAX_SCALE);
    const actualFactor = newScale / this.scale;

    this.scale = newScale;
    this.offsetX = viewportX - imageX * this.scale;
    this.offsetY = viewportY - imageY * this.scale;

    this._applyTransform();
    this._emit("transformChanged", {
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    });
  };

  ImageViewer.prototype.zoomIn = function () {
    const rect = this.viewport.getBoundingClientRect();
    this.zoomAt(rect.width / 2, rect.height / 2, SCALE_STEP);
  };

  ImageViewer.prototype.zoomOut = function () {
    const rect = this.viewport.getBoundingClientRect();
    this.zoomAt(rect.width / 2, rect.height / 2, 1 / SCALE_STEP);
  };

  ImageViewer.prototype.panTo = function (x, y) {
    this.offsetX = x;
    this.offsetY = y;
    this._applyTransform();
    this._emit("transformChanged", {
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    });
  };

  ImageViewer.prototype.resetView = function () {
    this.fitToViewport();
  };

  ImageViewer.prototype.fitToViewport = function () {
    if (!this.imageLoaded) return;

    const rect = this.viewport.getBoundingClientRect();
    const viewportWidth = rect.width;
    const viewportHeight = rect.height;

    const scaleX = viewportWidth / this.naturalWidth;
    const scaleY = viewportHeight / this.naturalHeight;
    this.scale = Math.min(scaleX, scaleY, 1);

    const scaledWidth = this.naturalWidth * this.scale;
    const scaledHeight = this.naturalHeight * this.scale;
    this.offsetX = (viewportWidth - scaledWidth) / 2;
    this.offsetY = (viewportHeight - scaledHeight) / 2;

    this._applyTransform();
    this._emit("transformChanged", {
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    });
    this._emit("fitToViewport", { scale: this.scale });
  };

  ImageViewer.prototype.setActualSize = function () {
    if (!this.imageLoaded) return;

    const rect = this.viewport.getBoundingClientRect();
    this.scale = 1;
    this.offsetX = (rect.width - this.naturalWidth) / 2;
    this.offsetY = (rect.height - this.naturalHeight) / 2;

    this._applyTransform();
    this._emit("transformChanged", {
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    });
  };

  ImageViewer.prototype._applyTransform = function () {
    const transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
    this.stage.style.transform = transform;
  };

  ImageViewer.prototype.setRegionDrawingMode = function (enabled) {
    this.isRegionDrawing = enabled;
    if (this.dragOverlay) {
      this.dragOverlay.style.pointerEvents = enabled ? "auto" : "none";
      this.dragOverlay.style.cursor = enabled ? "crosshair" : "";
      this.dragOverlay.style.zIndex = enabled ? "20" : "5";
      if (enabled) {
        this.dragOverlay.classList.add("active");
      } else {
        this.dragOverlay.classList.remove("active");
      }
    }
  };

  ImageViewer.prototype.viewportToReal = function (viewportX, viewportY) {
    if (!this.imageLoaded) return { x: 0, y: 0 };
    const x = (viewportX - this.offsetX) / this.scale;
    const y = (viewportY - this.offsetY) / this.scale;
    return {
      x: clamp(x, 0, this.naturalWidth),
      y: clamp(y, 0, this.naturalHeight),
    };
  };

  ImageViewer.prototype.realToViewport = function (realX, realY) {
    if (!this.imageLoaded) return { x: 0, y: 0 };
    return {
      x: realX * this.scale + this.offsetX,
      y: realY * this.scale + this.offsetY,
    };
  };

  ImageViewer.prototype.viewportToPercent = function (viewportX, viewportY) {
    const real = this.viewportToReal(viewportX, viewportY);
    return this.realToPercent(real.x, real.y);
  };

  ImageViewer.prototype.percentToViewport = function (percentX, percentY) {
    const real = this.percentToReal(percentX, percentY);
    return this.realToViewport(real.x, real.y);
  };

  ImageViewer.prototype.realToPercent = function (realX, realY) {
    if (!this.imageLoaded || this.naturalWidth === 0 || this.naturalHeight === 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: Number(((realX / this.naturalWidth) * 100).toFixed(2)),
      y: Number(((realY / this.naturalHeight) * 100).toFixed(2)),
    };
  };

  ImageViewer.prototype.percentToReal = function (percentX, percentY) {
    if (!this.imageLoaded) return { x: 0, y: 0 };
    return {
      x: (percentX / 100) * this.naturalWidth,
      y: (percentY / 100) * this.naturalHeight,
    };
  };

  ImageViewer.prototype.getMarkerStageStyle = function (marker) {
    if (!this.imageLoaded) return {};

    let realX, realY, realW, realH;

    if (marker.realX !== undefined && marker.realY !== undefined) {
      realX = marker.realX;
      realY = marker.realY;
    } else {
      const real = this.percentToReal(marker.x, marker.y);
      realX = real.x;
      realY = real.y;
    }

    const viewport = this.realToViewport(realX, realY);

    if (marker.mode === "region") {
      if (marker.realWidth !== undefined && marker.realHeight !== undefined) {
        realW = marker.realWidth;
        realH = marker.realHeight;
      } else {
        realW = (marker.width / 100) * this.naturalWidth;
        realH = (marker.height / 100) * this.naturalHeight;
      }
      return {
        left: viewport.x + "px",
        top: viewport.y + "px",
        width: realW * this.scale + "px",
        height: realH * this.scale + "px",
      };
    }

    return {
      left: viewport.x + "px",
      top: viewport.y + "px",
    };
  };

  ImageViewer.prototype.getImageInfo = function () {
    return {
      naturalWidth: this.naturalWidth,
      naturalHeight: this.naturalHeight,
      loaded: this.imageLoaded,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    };
  };

  ImageViewer.prototype.exportRealCoords = function (marker) {
    if (!this.imageLoaded) return null;

    let realX, realY, realW, realH;

    if (marker.realX !== undefined && marker.realY !== undefined) {
      realX = marker.realX;
      realY = marker.realY;
    } else {
      const real = this.percentToReal(marker.x, marker.y);
      realX = real.x;
      realY = real.y;
    }

    const percent = this.realToPercent(realX, realY);

    const result = {
      id: marker.id,
      typeId: marker.typeId,
      type: marker.type,
      mode: marker.mode,
      note: marker.note || "",
      x: percent.x,
      y: percent.y,
      realX: Number(realX.toFixed(2)),
      realY: Number(realY.toFixed(2)),
      createdAt: marker.createdAt,
    };

    if (marker.mode === "region") {
      if (marker.realWidth !== undefined && marker.realHeight !== undefined) {
        realW = marker.realWidth;
        realH = marker.realHeight;
      } else {
        realW = (marker.width / 100) * this.naturalWidth;
        realH = (marker.height / 100) * this.naturalHeight;
      }
      result.width = Number(((realW / this.naturalWidth) * 100).toFixed(2));
      result.height = Number(((realH / this.naturalHeight) * 100).toFixed(2));
      result.realWidth = Number(realW.toFixed(2));
      result.realHeight = Number(realH.toFixed(2));
    }

    return result;
  };

  ImageViewer.prototype.on = function (event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => {
      this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
    };
  };

  ImageViewer.prototype._emit = function (event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error("ImageViewer event listener error", e);
        }
      });
    }
  };

  ImageViewer.prototype.destroy = function () {
    this.listeners = {};
  };

  global.ImageViewer = ImageViewer;
})(window);
