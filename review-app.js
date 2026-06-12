(function () {
  const State = window.ReviewState;
  const Render = window.ReviewRender;

  const backBtn = document.getElementById("backBtn");
  const importBtn = document.getElementById("importBtn");
  const importInput = document.getElementById("importInput");
  const exportBtn = document.getElementById("exportBtn");
  const resetBtn = document.getElementById("resetBtn");

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result);
      reader.readAsText(file);
    });
  }

  async function handleImport() {
    importInput.click();
  }

  async function handleFileSelected(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.name.endsWith(".json") && file.type !== "application/json") {
      alert("请选择JSON格式的数据文件。");
      importInput.value = "";
      return;
    }

    try {
      const text = await readFileAsText(file);
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        alert("JSON解析失败，请检查文件格式是否正确。");
        importInput.value = "";
        return;
      }

      const result = State.importData(data);
      if (!result.success) {
        alert("导入失败：" + result.error);
        importInput.value = "";
        return;
      }

      alert(
        `导入成功！\n\n共 ${State.allRecords.length} 条标记记录，分布在 ${State.pages.length} 个页面中。`
      );
    } catch (e) {
      console.error("读取文件失败", e);
      alert("读取文件失败：" + e.message);
    } finally {
      importInput.value = "";
    }
  }

  function sanitizeFilenamePart(str) {
    return (str || "")
      .replace(/[\\/:*?"<>|\s]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  }

  function handleExport() {
    if (!State.hasData) {
      alert("没有可导出的复核数据。");
      return;
    }

    const stats = State.stats;
    if (stats.pending > 0) {
      const confirmMsg = `还有 ${stats.pending} 条记录待复核，确认要导出吗？`;
      if (!confirm(confirmMsg)) return;
    }

    const payload = State.exportReviewed();
    if (!payload) {
      alert("导出失败。");
      return;
    }

    const volume = State.volume || {};
    const idPart = sanitizeFilenamePart(volume.id);
    const titlePart = sanitizeFilenamePart(volume.title);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const parts = ["archive-volume-review"];
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

  function handleReset() {
    if (!State.hasData) return;
    if (!confirm("确认重置所有复核状态？所有复核结果将被清空，此操作不可撤销。")) return;
    State.resetAllReviews();
  }

  function handleBack() {
    window.location.href = "./index.html";
  }

  function handleKeyboard(event) {
    if (event.target.matches("input, textarea, select")) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      State.prevRecord();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      State.nextRecord();
    } else if (event.key === "1" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      setCurrentStatus("passed");
    } else if (event.key === "2" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      setCurrentStatus("doubtful");
    } else if (event.key === "3" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      setCurrentStatus("rejected");
    }
  }

  function setCurrentStatus(status) {
    const record = State.currentRecord;
    if (!record) return;
    const comment = document.getElementById("reviewComment").value;
    State.setReviewStatus(record.id, status, comment);
  }

  function bindEvents() {
    backBtn.addEventListener("click", handleBack);
    importBtn.addEventListener("click", handleImport);
    importInput.addEventListener("change", handleFileSelected);
    exportBtn.addEventListener("click", handleExport);
    resetBtn.addEventListener("click", handleReset);

    document.addEventListener("keydown", handleKeyboard);

    State.subscribe(() => {
      Render.refresh();
    });

    const dropZone = document.body;
    ["dragenter", "dragover"].forEach((evt) => {
      dropZone.addEventListener(evt, (e) => {
        if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.stopPropagation();
        }
      });
    });
    dropZone.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith(".json") || file.type === "application/json")) {
          importInput.files = e.dataTransfer.files;
          handleFileSelected({ target: importInput });
        } else {
          alert("请拖入JSON格式的数据文件。");
        }
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
