(function (global) {
  const State = global.VolumeState;
  const { hexWithAlpha } = global.VolumeStorage;

  const Doms = {
    volumeId: null,
    volumeTitle: null,
    pagesEmpty: null,
    pagesList: null,
    pageImage: null,
    pageImageSimple: null,
    emptyState: null,
    emptyStateSimple: null,
    markersLayer: null,
    markersLayerSimple: null,
    candidateLayer: null,
    candidateLayerSimple: null,
    typeInput: null,
    stats: null,
    statsTotal: null,
    markerList: null,
    pageNav: null,
    pageIndicator: null,
    prevPage: null,
    nextPage: null,
    modeSwitch: null,
    dragOverlay: null,
    dragOverlaySimple: null,
    stage: null,
    viewerViewport: null,
    viewerStage: null,
    viewerContent: null,
    viewerToolbar: null,
    viewerModeBtn: null,
    zoomInBtn: null,
    zoomOutBtn: null,
    zoomIndicator: null,
    fitBtn: null,
    actualSizeBtn: null,
    resetBtn: null,
    imageInfoText: null,
    exportCoordsBtn: null,
    exitViewerBtn: null,
    typeConfigModal: null,
    closeConfigBtn: null,
    closeConfigFooterBtn: null,
    typeConfigList: null,
    newTypeName: null,
    newTypeColor: null,
    addTypeBtn: null,
    deleteTypeModal: null,
    closeDeleteTypeBtn: null,
    cancelDeleteTypeBtn: null,
    confirmDeleteTypeBtn: null,
    deleteTypeMsg: null,
    migrateTypeTarget: null,
    candidateSensitivity: null,
    sensitivityValue: null,
    detectEdgeDamage: null,
    maxCandidatesSelect: null,
    runDetectBtn: null,
    candPending: null,
    candAccepted: null,
    candIgnored: null,
    acceptAllBtn: null,
    ignoreAllBtn: null,
    applyAcceptedBtn: null,
    candidateList: null,
    candidateFilterTabs: null,
    candidateToggleBtn: null,
  };

  let viewerMode = false;
  let imageViewer = null;
  let pendingDeleteTypeId = null;

  function initDoms() {
    Doms.volumeId = document.getElementById("volumeId");
    Doms.volumeTitle = document.getElementById("volumeTitle");
    Doms.pagesEmpty = document.getElementById("pagesEmpty");
    Doms.pagesList = document.getElementById("pagesList");
    Doms.pageImage = document.getElementById("pageImage");
    Doms.pageImageSimple = document.getElementById("pageImageSimple");
    Doms.emptyState = document.getElementById("emptyState");
    Doms.emptyStateSimple = document.getElementById("emptyStateSimple");
    Doms.markersLayer = document.getElementById("markers");
    Doms.markersLayerSimple = document.getElementById("markersSimple");
    Doms.candidateLayer = document.getElementById("candidateLayer");
    Doms.candidateLayerSimple = document.getElementById("candidateLayerSimple");
    Doms.typeInput = document.getElementById("typeInput");
    Doms.stats = document.getElementById("stats");
    Doms.statsTotal = document.getElementById("statsTotal");
    Doms.markerList = document.getElementById("markerList");
    Doms.pageNav = document.getElementById("pageNav");
    Doms.pageIndicator = document.getElementById("pageIndicator");
    Doms.prevPage = document.getElementById("prevPage");
    Doms.nextPage = document.getElementById("nextPage");
    Doms.modeSwitch = document.getElementById("modeSwitch");
    Doms.dragOverlay = document.getElementById("dragOverlay");
    Doms.dragOverlaySimple = document.getElementById("dragOverlaySimple");
    Doms.stage = document.getElementById("stage");
    Doms.viewerViewport = document.getElementById("viewerViewport");
    Doms.viewerStage = document.getElementById("viewerStage");
    Doms.viewerContent = document.getElementById("viewerContent");
    Doms.viewerToolbar = document.getElementById("viewerToolbar");
    Doms.viewerModeBtn = document.getElementById("viewerModeBtn");
    Doms.zoomInBtn = document.getElementById("zoomInBtn");
    Doms.zoomOutBtn = document.getElementById("zoomOutBtn");
    Doms.zoomIndicator = document.getElementById("zoomIndicator");
    Doms.fitBtn = document.getElementById("fitBtn");
    Doms.actualSizeBtn = document.getElementById("actualSizeBtn");
    Doms.resetBtn = document.getElementById("resetBtn");
    Doms.imageInfoText = document.getElementById("imageInfoText");
    Doms.exportCoordsBtn = document.getElementById("exportCoordsBtn");
    Doms.exitViewerBtn = document.getElementById("exitViewerBtn");
    Doms.typeConfigModal = document.getElementById("typeConfigModal");
    Doms.closeConfigBtn = document.getElementById("closeConfigBtn");
    Doms.closeConfigFooterBtn = document.getElementById("closeConfigFooterBtn");
    Doms.typeConfigList = document.getElementById("typeConfigList");
    Doms.newTypeName = document.getElementById("newTypeName");
    Doms.newTypeColor = document.getElementById("newTypeColor");
    Doms.addTypeBtn = document.getElementById("addTypeBtn");
    Doms.deleteTypeModal = document.getElementById("deleteTypeModal");
    Doms.closeDeleteTypeBtn = document.getElementById("closeDeleteTypeBtn");
    Doms.cancelDeleteTypeBtn = document.getElementById("cancelDeleteTypeBtn");
    Doms.confirmDeleteTypeBtn = document.getElementById("confirmDeleteTypeBtn");
    Doms.deleteTypeMsg = document.getElementById("deleteTypeMsg");
    Doms.migrateTypeTarget = document.getElementById("migrateTypeTarget");
    Doms.candidateSensitivity = document.getElementById("candidateSensitivity");
    Doms.sensitivityValue = document.getElementById("sensitivityValue");
    Doms.detectEdgeDamage = document.getElementById("detectEdgeDamage");
    Doms.maxCandidatesSelect = document.getElementById("maxCandidatesSelect");
    Doms.runDetectBtn = document.getElementById("runDetectBtn");
    Doms.candPending = document.getElementById("candPending");
    Doms.candAccepted = document.getElementById("candAccepted");
    Doms.candIgnored = document.getElementById("candIgnored");
    Doms.acceptAllBtn = document.getElementById("acceptAllBtn");
    Doms.ignoreAllBtn = document.getElementById("ignoreAllBtn");
    Doms.applyAcceptedBtn = document.getElementById("applyAcceptedBtn");
    Doms.candidateList = document.getElementById("candidateList");
    Doms.candidateFilterTabs = document.getElementById("candidateFilterTabs");
    Doms.candidateToggleBtn = document.getElementById("candidateToggleBtn");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function getColorForMarker(marker) {
    if (marker && marker.typeId) {
      const t = State.findTypeById(marker.typeId);
      if (t) return t.color;
    }
    const byName = marker && marker.type
      ? State.findTypeByName(marker.type)
      : null;
    if (byName) return byName.color;
    const fallback = State.damageTypes && State.damageTypes[0];
    return fallback ? fallback.color : "#9d3f2f";
  }

  function initImageViewer() {
    if (imageViewer) return;
    if (!global.ImageViewer) return;

    imageViewer = new global.ImageViewer({
      viewport: Doms.viewerViewport,
      stage: Doms.viewerStage,
      content: Doms.viewerContent,
      image: Doms.pageImage,
      markersLayer: Doms.markersLayer,
      dragOverlay: Doms.dragOverlay,
    });

    imageViewer.on("imageLoaded", (info) => {
      updateImageInfo(info);
      renderMarkers();
    });

    imageViewer.on("transformChanged", (info) => {
      updateZoomIndicator(info.scale);
      renderMarkers();
    });

    imageViewer.on("fitToViewport", (info) => {
      updateZoomIndicator(info.scale);
    });
  }

  function updateZoomIndicator(scale) {
    if (Doms.zoomIndicator) {
      Doms.zoomIndicator.textContent = Math.round(scale * 100) + "%";
    }
  }

  function updateImageInfo(info) {
    if (Doms.imageInfoText && info && info.width && info.height) {
      Doms.imageInfoText.textContent = `图片尺寸：${info.width} × ${info.height} px`;
    }
  }

  function setViewerMode(enabled) {
    viewerMode = enabled;

    if (enabled) {
      initImageViewer();
      Doms.stage.style.display = "none";
      Doms.viewerViewport.style.display = "block";
      Doms.viewerToolbar.style.display = "flex";
      Doms.viewerModeBtn.textContent = "📄 普通模式";
      Doms.viewerModeBtn.classList.remove("primary");
      document.body.classList.add("viewer-mode");
      document.body.classList.remove("simple-mode");
    } else {
      Doms.stage.style.display = "block";
      Doms.viewerViewport.style.display = "none";
      Doms.viewerToolbar.style.display = "none";
      Doms.viewerModeBtn.textContent = "🔍 超大查看器";
      Doms.viewerModeBtn.classList.add("primary");
      document.body.classList.remove("viewer-mode");
      document.body.classList.add("simple-mode");
    }

    renderCanvas();

    if (enabled && imageViewer) {
      const modeSwitch = document.getElementById("modeSwitch");
      if (modeSwitch) {
        const activeBtn = modeSwitch.querySelector(".mode-btn.active");
        const mode = activeBtn ? activeBtn.dataset.mode : "point";
        imageViewer.setRegionDrawingMode(mode === "region");
      }
    }
  }

  function toggleViewerMode() {
    const page = State.currentPage;
    if (!page || !page.image) {
      alert("请先导入扫描页后再使用超大查看器模式。");
      return;
    }
    setViewerMode(!viewerMode);
  }

  function renderTypeInput() {
    if (!Doms.typeInput) return;
    const types = State.damageTypes;
    const prevValue = Doms.typeInput.value;
    Doms.typeInput.innerHTML = types
      .map((t) => {
        return `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`;
      })
      .join("");
    if (prevValue && types.some((t) => t.id === prevValue)) {
      Doms.typeInput.value = prevValue;
    } else if (types.length > 0) {
      Doms.typeInput.value = types[0].id;
    }
  }

  function getSelectedTypeId() {
    if (!Doms.typeInput) return null;
    const v = Doms.typeInput.value;
    if (v && State.isValidTypeId(v)) return v;
    const byName = State.findTypeByName(v);
    return byName ? byName.id : null;
  }

  function renderVolumeMeta() {
    const state = State.all;
    if (Doms.volumeId.value !== state.volumeId) {
      Doms.volumeId.value = state.volumeId || "";
    }
    if (Doms.volumeTitle.value !== state.volumeTitle) {
      Doms.volumeTitle.value = state.volumeTitle || "";
    }
  }

  function renderPagesList() {
    const pages = State.pages;
    const currentId = State.currentPageId;

    if (pages.length === 0) {
      Doms.pagesEmpty.style.display = "block";
      Doms.pagesList.innerHTML = "";
      return;
    }

    Doms.pagesEmpty.style.display = "none";
    Doms.pagesList.innerHTML = pages
      .map((page, index) => {
        const active = page.id === currentId ? " active" : "";
        const count = page.markers.length;
        const thumb = page.image
          ? `<img src="${escapeHtml(page.image)}" alt="" />`
          : `<span class="thumb-placeholder">${index + 1}</span>`;
        const displayName = page.name || page.fileName || `第 ${index + 1} 页`;
        return `
          <article class="page-item${active}" data-page="${page.id}">
            <div class="page-thumb">${thumb}</div>
            <div class="page-actions">
              <div class="page-info">
                <div class="page-num">第 ${index + 1} 页</div>
                <div class="page-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
              </div>
              <button class="page-remove" type="button" data-remove="${page.id}" title="移除本页">×</button>
            </div>
            <span class="page-count${count === 0 ? " zero" : ""}" title="损伤标记数">${count}</span>
          </article>
        `;
      })
      .join("");
  }

  function getActiveStageElements() {
    if (viewerMode) {
      return {
        image: Doms.pageImage,
        emptyState: Doms.emptyState,
        markersLayer: Doms.markersLayer,
        candidateLayer: Doms.candidateLayer,
        dragOverlay: Doms.dragOverlay,
      };
    }
    return {
      image: Doms.pageImageSimple,
      emptyState: Doms.emptyStateSimple,
      markersLayer: Doms.markersLayerSimple,
      candidateLayer: Doms.candidateLayerSimple,
      dragOverlay: Doms.dragOverlaySimple,
    };
  }

  function renderMarkerHtml(marker, style) {
    const color = getColorForMarker(marker);
    const fill = hexWithAlpha(color, 0.15);
    const typeInfo = State.findTypeById(marker.typeId) || { name: marker.type };
    const title = `${marker.mode === "region" ? "[区域] " : ""}${typeInfo.name}${marker.note ? "：" + marker.note : ""}`;

    let styleStr = "";
    for (const key in style) {
      styleStr += `${key}:${style[key]};`;
    }

    if (marker.mode === "region") {
      return `
        <span class="region-marker"
              data-type="${escapeHtml(typeInfo.name)}"
              data-type-id="${marker.typeId}"
              data-marker="${marker.id}"
              title="${escapeHtml(title)}"
              style="${styleStr}border-color:${color};background:${fill};">
          <span class="region-label" style="background:${color};">${escapeHtml(typeInfo.name)}</span>
        </span>
      `;
    }
    return `
      <span class="marker"
            data-type="${escapeHtml(typeInfo.name)}"
            data-type-id="${marker.typeId}"
            data-marker="${marker.id}"
            title="${escapeHtml(title)}"
            style="${styleStr}background:${color};"></span>
    `;
  }

  function renderMarkers() {
    const page = State.currentPage;
    const { markersLayer } = getActiveStageElements();

    if (!page || !page.image || !markersLayer) return;

    if (viewerMode && imageViewer && imageViewer.imageLoaded) {
      markersLayer.innerHTML = page.markers
        .map((m) => {
          const style = imageViewer.getMarkerStageStyle(m);
          return renderMarkerHtml(m, style);
        })
        .join("");
    } else {
      markersLayer.innerHTML = page.markers
        .map((m) => {
          if (m.mode === "region") {
            return renderMarkerHtml(m, {
              left: m.x + "%",
              top: m.y + "%",
              width: m.width + "%",
              height: m.height + "%",
            });
          }
          return renderMarkerHtml(m, {
            left: m.x + "%",
            top: m.y + "%",
          });
        })
        .join("");
    }
  }

  function renderCandidates() {
    const page = State.currentPage;
    const { candidateLayer } = getActiveStageElements();

    if (!page || !page.image || !candidateLayer) return;

    const candidates = window.CandidateManager
      ? window.CandidateManager.getCandidates()
      : [];
    const filter = window.CandidateManager
      ? window.CandidateManager.getFilter()
      : "all";

    const filteredCandidates =
      filter === "all"
        ? candidates
        : candidates.filter((c) => c.status === filter);

    if (filteredCandidates.length === 0) {
      candidateLayer.innerHTML = "";
      return;
    }

    if (viewerMode && imageViewer && imageViewer.imageLoaded) {
      candidateLayer.innerHTML = filteredCandidates
        .map((c) => {
          const style = imageViewer.getMarkerStageStyle({
            mode: c.mode || "point",
            x: c.x,
            y: c.y,
            width: c.width,
            height: c.height,
          });
          return renderCandidateHtml(c, style);
        })
        .join("");
    } else {
      candidateLayer.innerHTML = filteredCandidates
        .map((c) => {
          if (c.mode === "region") {
            return renderCandidateHtml(c, {
              left: c.x + "%",
              top: c.y + "%",
              width: c.width + "%",
              height: c.height + "%",
            });
          }
          return renderCandidateHtml(c, {
            left: c.x + "%",
            top: c.y + "%",
          });
        })
        .join("");
    }
  }

  function renderCandidateHtml(candidate, style) {
    const status = candidate.status || "pending";
    const isPoint = candidate.mode === "point";
    const styleStr = Object.keys(style)
      .map((k) => `${k}:${style[k]}`)
      .join(";");
    const label =
      candidate.type === "hole"
        ? "疑似孔"
        : candidate.type === "spot"
          ? "深色斑"
          : candidate.type === "edge"
            ? "边缘损"
            : "可疑";
    return `
      <div class="candidate-marker ${status} ${isPoint ? "point" : ""}"
           data-candidate-id="${candidate.id}"
           style="${styleStr}">
        ${!isPoint ? `<span class="cand-badge">${label}</span>` : ""}
      </div>
    `;
  }

  function renderCandidateList() {
    if (!Doms.candidateList) return;

    const candidates = window.CandidateManager
      ? window.CandidateManager.getCandidates()
      : [];
    const filter = window.CandidateManager
      ? window.CandidateManager.getFilter()
      : "all";

    const filteredCandidates =
      filter === "all"
        ? candidates
        : candidates.filter((c) => c.status === filter);

    if (candidates.length === 0) {
      Doms.candidateList.innerHTML =
        '<div class="candidate-empty">点击「开始检测」识别疑似虫蛀区域</div>';
      return;
    }

    if (filteredCandidates.length === 0) {
      const label =
        filter === "pending" ? "待处理" : filter === "accepted" ? "已接受" : "已忽略";
      Doms.candidateList.innerHTML = `<div class="candidate-empty">暂无${label}候选</div>`;
      return;
    }

    Doms.candidateList.innerHTML = filteredCandidates
      .map((c, i) => {
        const status = c.status || "pending";
        const typeLabel =
          c.type === "hole"
            ? "疑似破洞"
            : c.type === "spot"
              ? "深色斑点"
              : c.type === "edge"
                ? "边缘破损"
                : "可疑损伤";
        const conf = Math.round((c.confidence || 0.5) * 100) + "%";
        const sizeInfo = c.width
          ? `${Math.round(c.width * 10) / 10}% × ${Math.round(c.height * 10) / 10}%`
          : "点状";
        return `
          <div class="candidate-item ${status}" data-candidate-id="${c.id}">
            <span class="cand-item-indicator ${status}"></span>
            <div class="cand-item-body">
              <div class="cand-item-title">${i + 1}. ${typeLabel}</div>
              <div class="cand-item-meta">
                <span>置信度: <span class="cand-item-confidence">${conf}</span></span>
                <span>${sizeInfo}</span>
              </div>
            </div>
            <div class="cand-item-actions">
              ${status === "pending" ? `
                <button class="cand-action-btn accept" data-action="accept" title="接受">✓</button>
                <button class="cand-action-btn ignore" data-action="ignore" title="忽略">✗</button>
              ` : `
                <button class="cand-action-btn reset" data-action="reset" title="重置">↺</button>
              `}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function updateCandidateStats() {
    if (!Doms.candPending || !Doms.candAccepted || !Doms.candIgnored) return;

    const stats = window.CandidateManager
      ? window.CandidateManager.getStats()
      : { pending: 0, accepted: 0, ignored: 0 };

    Doms.candPending.textContent = stats.pending;
    Doms.candAccepted.textContent = stats.accepted;
    Doms.candIgnored.textContent = stats.ignored;
  }

  function renderCanvas() {
    const page = State.currentPage;
    const { image, emptyState, markersLayer } = getActiveStageElements();

    if (!page || !page.image) {
      if (image) {
        image.removeAttribute("src");
        image.style.display = "none";
      }
      if (emptyState) emptyState.style.display = "grid";
      if (markersLayer) markersLayer.innerHTML = "";
      return;
    }

    if (image.src !== page.image) {
      image.src = page.image;
    }
    image.style.display = "block";
    if (emptyState) emptyState.style.display = "none";

    if (viewerMode && imageViewer && !imageViewer.imageLoaded) {
      const dims = imageViewer._getImageDimensions();
      if (dims.width > 0 && dims.height > 0) {
        imageViewer._onImageLoad();
        imageViewer.fitToViewport();
      }
    }

    renderMarkers();
  }

  function renderStats() {
    const page = State.currentPage;
    const countsRes = State.getMarkerCounts(page);
    const { byId, types } = countsRes;
    const total = page ? page.markers.length : 0;

    const rows = types
      .map((t) => {
        const count = byId[t.id] || 0;
        return `<div class="stat"><span><span class="stat-dot" style="background:${t.color};"></span>${escapeHtml(t.name)}</span><strong>${count}</strong></div>`;
      })
      .join("");

    const totalRow =
      total > 0
        ? `<div class="stat total-row"><span>本页合计</span><strong>${total}</strong></div>`
        : "";

    Doms.stats.innerHTML = rows + totalRow;

    if (State.pages.length > 1) {
      const totalCounts = State.getTotalCounts();
      const allTotal = State.getTotalMarkers();
      const totalRows = totalCounts.types
        .map((t) => {
          const count = totalCounts.byId[t.id] || 0;
          return `<div class="stat"><span><span class="stat-dot" style="background:${t.color};"></span>${escapeHtml(t.name)}</span><strong>${count}</strong></div>`;
        })
        .join("");
      Doms.statsTotal.innerHTML = `
        <div class="stats-total-title">全卷合计</div>
        ${totalRows}
        <div class="stat total-row"><span>${State.pages.length} 页总计</span><strong>${allTotal}</strong></div>
      `;
    } else {
      Doms.statsTotal.innerHTML = "";
    }
  }

  function renderMarkerList() {
    const page = State.currentPage;
    if (!page || page.markers.length === 0) {
      Doms.markerList.innerHTML =
        '<p style="color:var(--muted);text-align:center;padding:24px 8px;font-size:13px;">本页暂无损伤记录。</p>';
      return;
    }

    Doms.markerList.innerHTML = page.markers
      .map((marker, index) => {
        const typeInfo = State.findTypeById(marker.typeId) || {
          name: marker.type,
          color: "#9d3f2f",
        };
        const note = marker.note
          ? escapeHtml(marker.note)
          : '<span style="opacity:.6;">未填写备注</span>';
        const time = new Date(marker.createdAt).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        const isRegion = marker.mode === "region";
        const modeTag = isRegion
          ? '<span class="record-mode mode-region">区域</span>'
          : '<span class="record-mode mode-point">点</span>';

        let dims = "";
        if (isRegion) {
          if (marker.realWidth !== undefined && marker.realHeight !== undefined) {
            dims = `<span class="region-dims">${marker.realWidth} × ${marker.realHeight} px</span>`;
          } else {
            dims = `<span class="region-dims">${marker.width}% × ${marker.height}%</span>`;
          }
        }

        let coords = "";
        if (marker.realX !== undefined && marker.realY !== undefined) {
          coords = `<br /><span style="font-family:'SF Mono',Monaco,Consolas,monospace;font-size:11px;">坐标：(${marker.realX}, ${marker.realY}) px</span>`;
        }

        return `
          <article class="record">
            <strong><span class="stat-dot" style="background:${typeInfo.color};"></span>${index + 1}. ${escapeHtml(typeInfo.name)}${modeTag}</strong>
            <p>${note}${dims}${coords}<br /><span style="font-size:12px;opacity:.6;">${escapeHtml(time)}</span></p>
            <button type="button" data-delete="${marker.id}">删除</button>
          </article>
        `;
      })
      .join("");
  }

  function renderPageNav() {
    const pages = State.pages;
    if (pages.length === 0) {
      Doms.pageNav.style.display = "none";
      return;
    }
    Doms.pageNav.style.display = "flex";
    const current = State.currentIndex + 1;
    Doms.pageIndicator.textContent = `第 ${current} / ${pages.length} 页`;
    Doms.prevPage.disabled = pages.length <= 1;
    Doms.nextPage.disabled = pages.length <= 1;
  }

  function renderTypeConfigList() {
    if (!Doms.typeConfigList) return;
    const types = State.damageTypes;
    const usedIds = State.getUsedTypeIds();
    const totalCounts = State.getTotalCounts();

    Doms.typeConfigList.innerHTML = types
      .map((t) => {
        const usedCount = usedIds.has(t.id) ? totalCounts.byId[t.id] || 0 : 0;
        const canDelete = types.length > 1;
        return `
          <div class="type-config-item" data-type-id="${t.id}">
            <div class="color-swatch" style="background:${t.color};" title="点击更换颜色">
              <input type="color" data-color-for="${t.id}" value="${t.color}" />
            </div>
            <input type="text" data-name-for="${t.id}" value="${escapeHtml(t.name)}" maxlength="20" placeholder="类型名称" />
            <span class="type-used${usedCount > 0 ? " has-count" : ""}">${usedCount} 条</span>
            <div class="type-actions">
              <button type="button" class="icon-btn danger" data-delete-type="${t.id}" title="删除此类型" ${canDelete ? "" : "disabled"}>🗑</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderMigrateTargetOptions(excludeTypeId) {
    if (!Doms.migrateTypeTarget) return;
    const types = State.damageTypes.filter((t) => t.id !== excludeTypeId);
    Doms.migrateTypeTarget.innerHTML = types
      .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
      .join("");
    if (types.length > 0) {
      Doms.migrateTypeTarget.value = types[0].id;
    }
  }

  function openTypeConfig() {
    if (!Doms.typeConfigModal) return;
    renderTypeConfigList();
    Doms.typeConfigModal.style.display = "flex";
  }

  function closeTypeConfig() {
    if (!Doms.typeConfigModal) return;
    Doms.typeConfigModal.style.display = "none";
    if (Doms.newTypeName) Doms.newTypeName.value = "";
  }

  function openDeleteConfirm(typeId) {
    const type = State.findTypeById(typeId);
    if (!type) return;
    const usedIds = State.getUsedTypeIds();
    const usedCount = usedIds.has(typeId)
      ? State.getTotalCounts().byId[typeId] || 0
      : 0;
    pendingDeleteTypeId = typeId;
    renderMigrateTargetOptions(typeId);
    Doms.deleteTypeMsg.textContent =
      usedCount > 0
        ? `即将删除类型「${type.name}」，它有 ${usedCount} 条现有标记。请选择要迁移到的目标类型：`
        : `即将删除类型「${type.name}」。它当前没有被使用，可直接删除：`;
    Doms.deleteTypeModal.style.display = "flex";
  }

  function closeDeleteConfirm() {
    pendingDeleteTypeId = null;
    Doms.deleteTypeModal.style.display = "none";
  }

  function isEditingTypeName() {
    return Boolean(
      Doms.typeConfigList &&
        Doms.typeConfigList.contains(document.activeElement) &&
        document.activeElement &&
        document.activeElement.dataset.nameFor
    );
  }

  function renderAll() {
    renderTypeInput();
    renderVolumeMeta();
    renderPagesList();
    renderCanvas();
    renderStats();
    renderMarkerList();
    renderCandidates();
    renderCandidateList();
    updateCandidateStats();
    renderPageNav();
    if (
      Doms.typeConfigModal &&
      Doms.typeConfigModal.style.display !== "none" &&
      !isEditingTypeName()
    ) {
      renderTypeConfigList();
    }
  }

  function exportRealCoords() {
    if (!viewerMode || !imageViewer || !imageViewer.imageLoaded) {
      alert("请先进入超大查看器模式并加载图片。");
      return;
    }

    const page = State.currentPage;
    if (!page) return;

    const imageInfo = imageViewer.getImageInfo();
    const markers = page.markers.map((m) => imageViewer.exportRealCoords(m)).filter(Boolean);

    const payload = {
      format: "archive-volume-damage-real-coords",
      formatVersion: "1.0",
      exportedAt: new Date().toISOString(),
      page: {
        id: page.id,
        name: page.name,
        fileName: page.fileName,
        imageWidth: imageInfo.naturalWidth,
        imageHeight: imageInfo.naturalHeight,
      },
      markers,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const namePart = (page.name || page.fileName || "coords").replace(/[\\/:*?"<>|\s]+/g, "_");
    link.download = `${namePart}_real_coords.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1500);
  }

  function attachDelegates() {
    Doms.pagesList.addEventListener("click", (event) => {
      const removeBtn = event.target.closest("[data-remove]");
      if (removeBtn) {
        event.stopPropagation();
        const pid = removeBtn.dataset.remove;
        if (
          confirm("确认从卷册中移除此页？该页的全部标记将一并删除，此操作不可撤销。")
        ) {
          State.removePage(pid);
        }
        return;
      }
      const pageItem = event.target.closest("[data-page]");
      if (!pageItem) return;
      State.switchPage(pageItem.dataset.page);
    });

    Doms.prevPage.addEventListener("click", () => State.switchPrev());
    Doms.nextPage.addEventListener("click", () => State.switchNext());

    Doms.volumeId.addEventListener("input", () => {
      State.setVolumeMeta({ volumeId: Doms.volumeId.value });
    });
    Doms.volumeTitle.addEventListener("input", () => {
      State.setVolumeMeta({ volumeTitle: Doms.volumeTitle.value });
    });

    Doms.markersLayer.addEventListener("click", (event) => {
      const markerEl = event.target.closest("[data-marker]");
      if (!markerEl) return;
      const id = markerEl.dataset.marker;
      if (confirm("删除此标记？")) State.removeMarker(id);
    });

    Doms.markersLayerSimple.addEventListener("click", (event) => {
      const markerEl = event.target.closest("[data-marker]");
      if (!markerEl) return;
      const id = markerEl.dataset.marker;
      if (confirm("删除此标记？")) State.removeMarker(id);
    });

    Doms.markerList.addEventListener("click", (event) => {
      const id = event.target.dataset.delete;
      if (!id) return;
      State.removeMarker(id);
    });

    Doms.typeConfigList.addEventListener("input", (event) => {
      const colorFor = event.target.dataset.colorFor;
      const nameFor = event.target.dataset.nameFor;
      if (colorFor) {
        State.setDamageTypeColor(colorFor, event.target.value);
      } else if (nameFor) {
        const ok = State.renameDamageType(nameFor, event.target.value);
        if (!ok) {
          const type = State.findTypeById(nameFor);
          if (type) event.target.value = type.name;
          if (event.target.value && event.target.value.trim()) {
            alert("类型名称重复或无效，请换一个名称。");
          }
        }
      }
    });

    Doms.typeConfigList.addEventListener("click", (event) => {
      const deleteBtn = event.target.closest("[data-delete-type]");
      if (!deleteBtn) return;
      const typeId = deleteBtn.dataset.deleteType;
      openDeleteConfirm(typeId);
    });

    Doms.closeConfigBtn.addEventListener("click", closeTypeConfig);
    Doms.closeConfigFooterBtn.addEventListener("click", closeTypeConfig);
    Doms.typeConfigModal.addEventListener("click", (e) => {
      if (e.target === Doms.typeConfigModal) closeTypeConfig();
    });

    Doms.addTypeBtn.addEventListener("click", () => {
      const name = Doms.newTypeName.value.trim();
      const color = Doms.newTypeColor.value;
      if (!name) {
        alert("请先输入新类型的名称。");
        Doms.newTypeName.focus();
        return;
      }
      const result = State.addDamageType({ name, color });
      if (!result) {
        alert("新增失败：类型名称可能已存在，请检查后重试。");
        return;
      }
      Doms.newTypeName.value = "";
    });

    Doms.closeDeleteTypeBtn.addEventListener("click", closeDeleteConfirm);
    Doms.cancelDeleteTypeBtn.addEventListener("click", closeDeleteConfirm);
    Doms.deleteTypeModal.addEventListener("click", (e) => {
      if (e.target === Doms.deleteTypeModal) closeDeleteConfirm();
    });
    Doms.confirmDeleteTypeBtn.addEventListener("click", () => {
      if (!pendingDeleteTypeId) return;
      const targetId = Doms.migrateTypeTarget.value;
      const ok = State.deleteDamageType(pendingDeleteTypeId, targetId);
      if (ok) {
        closeDeleteConfirm();
      } else {
        alert("删除失败，请确认类型存在且至少保留一种类型。");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (
          Doms.deleteTypeModal &&
          Doms.deleteTypeModal.style.display !== "none"
        ) {
          closeDeleteConfirm();
        } else if (
          Doms.typeConfigModal &&
          Doms.typeConfigModal.style.display !== "none"
        ) {
          closeTypeConfig();
        }
      }
    });

    if (Doms.viewerModeBtn) {
      Doms.viewerModeBtn.addEventListener("click", toggleViewerMode);
    }

    if (Doms.zoomInBtn) {
      Doms.zoomInBtn.addEventListener("click", () => {
        if (imageViewer) imageViewer.zoomIn();
      });
    }

    if (Doms.zoomOutBtn) {
      Doms.zoomOutBtn.addEventListener("click", () => {
        if (imageViewer) imageViewer.zoomOut();
      });
    }

    if (Doms.fitBtn) {
      Doms.fitBtn.addEventListener("click", () => {
        if (imageViewer) imageViewer.fitToViewport();
      });
    }

    if (Doms.actualSizeBtn) {
      Doms.actualSizeBtn.addEventListener("click", () => {
        if (imageViewer) imageViewer.setActualSize();
      });
    }

    if (Doms.resetBtn) {
      Doms.resetBtn.addEventListener("click", () => {
        if (imageViewer) imageViewer.resetView();
      });
    }

    if (Doms.exportCoordsBtn) {
      Doms.exportCoordsBtn.addEventListener("click", exportRealCoords);
    }

    if (Doms.exitViewerBtn) {
      Doms.exitViewerBtn.addEventListener("click", () => setViewerMode(false));
    }
  }

  const VolumeRender = {
    init() {
      initDoms();
      attachDelegates();
      setViewerMode(false);
      renderAll();
    },
    refresh: renderAll,
    openTypeConfig,
    closeTypeConfig,
    getSelectedTypeId,
    get viewerMode() {
      return viewerMode;
    },
    get imageViewer() {
      return imageViewer;
    },
    setViewerMode,
    toggleViewerMode,
    getActiveStageElements,
    exportRealCoords,
    renderMarkers,
    Doms,
  };

  global.VolumeRender = VolumeRender;
})(window);
