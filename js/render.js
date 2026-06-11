(function (global) {
  const { TYPES } = global.VolumeStorage;
  const State = global.VolumeState;

  const Doms = {
    volumeId: null,
    volumeTitle: null,
    pagesEmpty: null,
    pagesList: null,
    pageImage: null,
    emptyState: null,
    markersLayer: null,
    stats: null,
    statsTotal: null,
    markerList: null,
    pageNav: null,
    pageIndicator: null,
    prevPage: null,
    nextPage: null,
  };

  function initDoms() {
    Doms.volumeId = document.getElementById("volumeId");
    Doms.volumeTitle = document.getElementById("volumeTitle");
    Doms.pagesEmpty = document.getElementById("pagesEmpty");
    Doms.pagesList = document.getElementById("pagesList");
    Doms.pageImage = document.getElementById("pageImage");
    Doms.emptyState = document.getElementById("emptyState");
    Doms.markersLayer = document.getElementById("markers");
    Doms.stats = document.getElementById("stats");
    Doms.statsTotal = document.getElementById("statsTotal");
    Doms.markerList = document.getElementById("markerList");
    Doms.pageNav = document.getElementById("pageNav");
    Doms.pageIndicator = document.getElementById("pageIndicator");
    Doms.prevPage = document.getElementById("prevPage");
    Doms.nextPage = document.getElementById("nextPage");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
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
        const displayName =
          page.name || page.fileName || `第 ${index + 1} 页`;
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
            ${
              count > 0
                ? `<span class="page-count" title="损伤标记数">${count}</span>`
                : ""
            }
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
        const title = `${m.type}${m.note ? "：" + m.note : ""}`;
        return `
          <span class="marker"
                data-type="${escapeHtml(m.type)}"
                data-marker="${m.id}"
                title="${escapeHtml(title)}"
                style="left:${m.x}%;top:${m.y}%"></span>
        `;
      })
      .join("");
  }

  function renderStats() {
    const page = State.currentPage;
    const counts = State.getMarkerCounts(page);
    const total = page ? page.markers.length : 0;

    const rows = TYPES.map(
      (t) =>
        `<div class="stat"><span>${t}</span><strong>${counts[t]}</strong></div>`
    ).join("");

    const totalRow =
      total > 0
        ? `<div class="stat total-row"><span>本页合计</span><strong>${total}</strong></div>`
        : "";

    Doms.stats.innerHTML = rows + totalRow;

    if (State.pages.length > 1) {
      const totalCounts = State.getTotalCounts();
      const allTotal = State.getTotalMarkers();
      const totalRows = TYPES.map(
        (t) =>
          `<div class="stat"><span>${t}</span><strong>${totalCounts[t]}</strong></div>`
      ).join("");
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
        const note = marker.note
          ? escapeHtml(marker.note)
          : '<span style="opacity:.6;">未填写备注</span>';
        const time = new Date(marker.createdAt).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `
          <article class="record">
            <strong>${index + 1}. ${escapeHtml(marker.type)}</strong>
            <p>${note}<br /><span style="font-size:12px;opacity:.6;">${escapeHtml(time)}</span></p>
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

  function renderAll() {
    renderVolumeMeta();
    renderPagesList();
    renderCanvas();
    renderStats();
    renderMarkerList();
    renderPageNav();
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
  }

  const VolumeRender = {
    init() {
      initDoms();
      attachDelegates();
      renderAll();
    },
    refresh: renderAll,
    Doms,
  };

  global.VolumeRender = VolumeRender;
})(window);
