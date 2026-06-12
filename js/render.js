(function (global) {
  const State = global.VolumeState;
  const { hexWithAlpha } = global.VolumeStorage;

  const Doms = {
    volumeId: null,
    volumeTitle: null,
    pagesEmpty: null,
    pagesList: null,
    pageImage: null,
    emptyState: null,
    markersLayer: null,
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
  };

  function initDoms() {
    Doms.volumeId = document.getElementById("volumeId");
    Doms.volumeTitle = document.getElementById("volumeTitle");
    Doms.pagesEmpty = document.getElementById("pagesEmpty");
    Doms.pagesList = document.getElementById("pagesList");
    Doms.pageImage = document.getElementById("pageImage");
    Doms.emptyState = document.getElementById("emptyState");
    Doms.markersLayer = document.getElementById("markers");
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

  function renderCanvas() {
    const page = State.currentPage;

    if (!page || !page.image) {
      Doms.pageImage.removeAttribute("src");
      Doms.pageImage.style.display = "none";
      Doms.emptyState.style.display = "grid";
      Doms.markersLayer.innerHTML = "";
      return;
    }

    if (Doms.pageImage.src !== page.image) {
      Doms.pageImage.src = page.image;
    }
    Doms.pageImage.style.display = "block";
    Doms.emptyState.style.display = "none";

    Doms.markersLayer.innerHTML = page.markers
      .map((m) => {
        const color = getColorForMarker(m);
        const fill = hexWithAlpha(color, 0.15);
        const typeInfo = State.findTypeById(m.typeId) || { name: m.type };
        const title = `${m.mode === "region" ? "[区域] " : ""}${typeInfo.name}${m.note ? "：" + m.note : ""}`;
        if (m.mode === "region") {
          return `
            <span class="region-marker"
                  data-type="${escapeHtml(typeInfo.name)}"
                  data-type-id="${m.typeId}"
                  data-marker="${m.id}"
                  title="${escapeHtml(title)}"
                  style="left:${m.x}%;top:${m.y}%;width:${m.width}%;height:${m.height}%;border-color:${color};background:${fill};">
              <span class="region-label" style="background:${color};">${escapeHtml(typeInfo.name)}</span>
            </span>
          `;
        }
        return `
          <span class="marker"
                data-type="${escapeHtml(typeInfo.name)}"
                data-type-id="${m.typeId}"
                data-marker="${m.id}"
                title="${escapeHtml(title)}"
                style="left:${m.x}%;top:${m.y}%;background:${color};"></span>
        `;
      })
      .join("");
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
        const dims = isRegion
          ? `<span class="region-dims">${marker.width}% × ${marker.height}%</span>`
          : "";
        return `
          <article class="record">
            <strong><span class="stat-dot" style="background:${typeInfo.color};"></span>${index + 1}. ${escapeHtml(typeInfo.name)}${modeTag}</strong>
            <p>${note}${dims}<br /><span style="font-size:12px;opacity:.6;">${escapeHtml(time)}</span></p>
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

  let pendingDeleteTypeId = null;

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

  function renderAll() {
    renderTypeInput();
    renderVolumeMeta();
    renderPagesList();
    renderCanvas();
    renderStats();
    renderMarkerList();
    renderPageNav();
    if (Doms.typeConfigModal && Doms.typeConfigModal.style.display !== "none") {
      renderTypeConfigList();
    }
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
  }

  const VolumeRender = {
    init() {
      initDoms();
      attachDelegates();
      renderAll();
    },
    refresh: renderAll,
    openTypeConfig,
    closeTypeConfig,
    getSelectedTypeId,
    Doms,
  };

  global.VolumeRender = VolumeRender;
})(window);
