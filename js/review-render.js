(function (global) {
  const State = global.ReviewState;

  const Doms = {
    reviewVolumeId: null,
    reviewVolumeTitle: null,
    reviewTotalCount: null,
    reviewStats: null,
    statPending: null,
    statPassed: null,
    statDoubtful: null,
    statRejected: null,
    statProgress: null,
    reviewPagesEmpty: null,
    reviewPagesList: null,
    statusFilter: null,
    pageFilter: null,
    reviewDetailTitle: null,
    prevRecord: null,
    nextRecord: null,
    recordIndicator: null,
    reviewEmptyState: null,
    reviewDetailContent: null,
    detailIndex: null,
    detailPage: null,
    detailType: null,
    detailMode: null,
    detailCoords: null,
    detailSize: null,
    detailTime: null,
    detailNote: null,
    migrationInfoRow: null,
    detailMigration: null,
    reviewComment: null,
    currentReviewStatus: null,
    exportBtn: null,
    resetBtn: null,
  };

  function initDoms() {
    Doms.reviewVolumeId = document.getElementById("reviewVolumeId");
    Doms.reviewVolumeTitle = document.getElementById("reviewVolumeTitle");
    Doms.reviewTotalCount = document.getElementById("reviewTotalCount");
    Doms.reviewStats = document.getElementById("reviewStats");
    Doms.statPending = document.getElementById("statPending");
    Doms.statPassed = document.getElementById("statPassed");
    Doms.statDoubtful = document.getElementById("statDoubtful");
    Doms.statRejected = document.getElementById("statRejected");
    Doms.statProgress = document.getElementById("statProgress");
    Doms.reviewPagesEmpty = document.getElementById("reviewPagesEmpty");
    Doms.reviewPagesList = document.getElementById("reviewPagesList");
    Doms.statusFilter = document.getElementById("statusFilter");
    Doms.pageFilter = document.getElementById("pageFilter");
    Doms.reviewDetailTitle = document.getElementById("reviewDetailTitle");
    Doms.prevRecord = document.getElementById("prevRecord");
    Doms.nextRecord = document.getElementById("nextRecord");
    Doms.recordIndicator = document.getElementById("recordIndicator");
    Doms.reviewEmptyState = document.getElementById("reviewEmptyState");
    Doms.reviewDetailContent = document.getElementById("reviewDetailContent");
    Doms.detailIndex = document.getElementById("detailIndex");
    Doms.detailPage = document.getElementById("detailPage");
    Doms.detailType = document.getElementById("detailType");
    Doms.detailMode = document.getElementById("detailMode");
    Doms.detailCoords = document.getElementById("detailCoords");
    Doms.detailSize = document.getElementById("detailSize");
    Doms.detailTime = document.getElementById("detailTime");
    Doms.detailNote = document.getElementById("detailNote");
    Doms.migrationInfoRow = document.getElementById("migrationInfoRow");
    Doms.detailMigration = document.getElementById("detailMigration");
    Doms.reviewComment = document.getElementById("reviewComment");
    Doms.currentReviewStatus = document.getElementById("currentReviewStatus");
    Doms.exportBtn = document.getElementById("exportBtn");
    Doms.resetBtn = document.getElementById("resetBtn");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return "—";
    try {
      return new Date(isoStr).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return isoStr;
    }
  }

  function getStatusBadgeClass(status) {
    const map = {
      pending: "pending",
      passed: "passed",
      doubtful: "doubtful",
      rejected: "rejected",
    };
    return map[status] || "pending";
  }

  function renderVolumeMeta() {
    const volume = State.volume;
    if (volume) {
      Doms.reviewVolumeId.textContent = volume.id || "—";
      Doms.reviewVolumeTitle.textContent = volume.title || "—";
    } else {
      Doms.reviewVolumeId.textContent = "—";
      Doms.reviewVolumeTitle.textContent = "—";
    }
    Doms.reviewTotalCount.textContent = State.allRecords.length;
  }

  function renderStats() {
    const stats = State.stats;
    if (!State.hasData) {
      Doms.reviewStats.style.display = "none";
      return;
    }
    Doms.reviewStats.style.display = "flex";
    Doms.statPending.textContent = stats.pending;
    Doms.statPassed.textContent = stats.passed;
    Doms.statDoubtful.textContent = stats.doubtful;
    Doms.statRejected.textContent = stats.rejected;
    Doms.statProgress.textContent = stats.progress + "%";
  }

  function renderPageFilter() {
    const pages = State.pages;
    const currentFilter = State.filters.pageId;

    let options = '<option value="all">全部页面</option>';
    pages.forEach((page, idx) => {
      const name = page.name || page.fileName || `第 ${idx + 1} 页`;
      const count = page.markers.length;
      const selected = page.id === currentFilter ? "selected" : "";
      options += `<option value="${page.id}" ${selected}>${escapeHtml(name)} (${count}条)</option>`;
    });

    Doms.pageFilter.innerHTML = options;
  }

  function renderRecordsList() {
    const records = State.filteredRecords;
    const currentRecord = State.currentRecord;
    const currentId = currentRecord ? currentRecord.id : null;

    if (!State.hasData) {
      Doms.reviewPagesEmpty.style.display = "block";
      Doms.reviewPagesList.innerHTML = "";
      return;
    }

    if (records.length === 0) {
      Doms.reviewPagesEmpty.style.display = "block";
      Doms.reviewPagesEmpty.textContent = "没有符合筛选条件的记录。";
      Doms.reviewPagesList.innerHTML = "";
      return;
    }

    Doms.reviewPagesEmpty.style.display = "none";

    Doms.reviewPagesList.innerHTML = records
      .map((record, idx) => {
        const active = record.id === currentId ? " active" : "";
        const statusClass = getStatusBadgeClass(record.review.status);
        const statusLabel = State.STATUS_LABELS[record.review.status];
        const isRegion = record.mode === "region";
        const modeTag = isRegion
          ? '<span class="record-mode mode-region">区域</span>'
          : '<span class="record-mode mode-point">点</span>';
        const migrTag = record.migrated
          ? '<span class="record-mode mode-migrated">迁移</span>'
          : '';
        const coords = isRegion
          ? `${record.x}%, ${record.y}% (${record.width}% × ${record.height}%)`
          : `${record.x}%, ${record.y}%`;
        const note = record.note
          ? escapeHtml(record.note)
          : '<span style="opacity:.6;">无备注</span>';

        return `
          <article class="review-record-item${active}" data-marker="${record.id}">
            <div class="record-header">
              <span class="record-num">${idx + 1}</span>
              <span class="status-badge ${statusClass}">${statusLabel}</span>
            </div>
            <div class="record-body">
              <strong><span class="stat-dot" style="background:${escapeHtml(record.typeColor)};"></span>${escapeHtml(record.type)}${modeTag}${migrTag}</strong>
              <p class="record-page">${escapeHtml(record.pageName)}</p>
              <p class="record-coords">${coords}</p>
              <p class="record-note">${note}</p>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderDetail() {
    const record = State.currentRecord;
    const filtered = State.filteredRecords;
    const currentIdx = State.currentIndex;

    if (!record) {
      Doms.reviewEmptyState.style.display = "flex";
      Doms.reviewDetailContent.style.display = "none";
      Doms.recordIndicator.textContent = "0 / 0";
      Doms.prevRecord.disabled = true;
      Doms.nextRecord.disabled = true;
      if (Doms.migrationInfoRow) Doms.migrationInfoRow.style.display = "none";
      return;
    }

    Doms.reviewEmptyState.style.display = "none";
    Doms.reviewDetailContent.style.display = "block";

    const isRegion = record.mode === "region";
    const flatIdx = State.allRecords.findIndex((r) => r.id === record.id) + 1;

    Doms.detailIndex.textContent = `#${flatIdx}（筛选后第 ${currentIdx + 1} 条）`;
    Doms.detailPage.textContent = record.pageName;
    Doms.detailType.innerHTML = `<span class="stat-dot" style="background:${escapeHtml(record.typeColor)};"></span>${escapeHtml(record.type)}`;
    var modeLabel = isRegion ? "区域标注" : "点标记";
    if (record.migrated) modeLabel += "（跨页迁移）";
    Doms.detailMode.textContent = modeLabel;
    Doms.detailCoords.textContent = `X: ${record.x}%, Y: ${record.y}%`;
    Doms.detailSize.textContent = isRegion
      ? `宽度: ${record.width}%, 高度: ${record.height}%`
      : "—";
    Doms.detailTime.textContent = formatDateTime(record.createdAt);
    Doms.detailNote.textContent = record.note || "无";

    if (Doms.migrationInfoRow && Doms.detailMigration) {
      if (record.migrated) {
        Doms.migrationInfoRow.style.display = "flex";
        var parts = [];
        if (record.migratedFrom) {
          var srcPage = State.pages.find((p) => p.id === record.migratedFrom);
          var srcPageName = srcPage
            ? (srcPage.name || srcPage.fileName || srcPage.id)
            : record.migratedFrom;
          parts.push("来源页面：" + srcPageName);
        }
        if (record.sourceMarkerId) {
          parts.push("源标记ID：" + record.sourceMarkerId.slice(0, 8) + "…");
        }
        if (record.transformType) {
          parts.push("变换方式：" + (record.transformType === "homography" ? "单应性透视" : "仿射变换"));
        }
        if (record.positionAdjusted) {
          parts.push("已手动调整位置");
        }
        Doms.detailMigration.innerHTML = parts.length > 0
          ? parts.map((p) => escapeHtml(p)).join("<br />")
          : "通过跨页校准迁移生成";
      } else {
        Doms.migrationInfoRow.style.display = "none";
      }
    }

    if (Doms.reviewComment.value !== record.review.comment) {
      Doms.reviewComment.value = record.review.comment || "";
    }

    const statusClass = getStatusBadgeClass(record.review.status);
    const statusLabel = State.STATUS_LABELS[record.review.status];
    Doms.currentReviewStatus.className = `status-badge ${statusClass}`;
    Doms.currentReviewStatus.textContent = statusLabel;

    Doms.recordIndicator.textContent = `${currentIdx + 1} / ${filtered.length}`;
    Doms.prevRecord.disabled = filtered.length <= 1;
    Doms.nextRecord.disabled = filtered.length <= 1;

    document.querySelectorAll(".review-btn").forEach((btn) => {
      const btnStatus = btn.dataset.status;
      btn.classList.toggle("active", record.review.status === btnStatus);
    });
  }

  function renderActionButtons() {
    const hasData = State.hasData;
    Doms.exportBtn.disabled = !hasData;
    Doms.resetBtn.disabled = !hasData;
  }

  function renderAll() {
    renderVolumeMeta();
    renderStats();
    renderPageFilter();
    renderRecordsList();
    renderDetail();
    renderActionButtons();
  }

  function attachDelegates() {
    Doms.reviewPagesList.addEventListener("click", (event) => {
      const item = event.target.closest("[data-marker]");
      if (!item) return;
      State.selectRecordById(item.dataset.marker);
    });

    Doms.statusFilter.addEventListener("change", () => {
      State.setFilter("status", Doms.statusFilter.value);
    });

    Doms.pageFilter.addEventListener("change", () => {
      State.setFilter("pageId", Doms.pageFilter.value);
    });

    Doms.prevRecord.addEventListener("click", () => {
      State.prevRecord();
    });

    Doms.nextRecord.addEventListener("click", () => {
      State.nextRecord();
    });

    document.querySelectorAll(".review-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const record = State.currentRecord;
        if (!record) return;
        const status = btn.dataset.status;
        const comment = Doms.reviewComment.value;
        State.setReviewStatus(record.id, status, comment);
      });
    });

    Doms.reviewComment.addEventListener("input", () => {
      const record = State.currentRecord;
      if (!record) return;
      if (record.review.status !== "pending") {
        State.setReviewStatus(record.id, record.review.status, Doms.reviewComment.value);
      }
    });
  }

  const ReviewRender = {
    init() {
      initDoms();
      attachDelegates();
      renderAll();
    },
    refresh: renderAll,
    Doms,
  };

  global.ReviewRender = ReviewRender;
})(window);
