const storageKey = "wxyy-1-archive-damage";
const state = JSON.parse(localStorage.getItem(storageKey) || '{"image":"","markers":[]}');

const imageInput = document.querySelector("#imageInput");
const typeInput = document.querySelector("#typeInput");
const noteInput = document.querySelector("#noteInput");
const pageImage = document.querySelector("#pageImage");
const stage = document.querySelector("#stage");
const markersLayer = document.querySelector("#markers");
const markerList = document.querySelector("#markerList");
const stats = document.querySelector("#stats");
const emptyState = document.querySelector("#emptyState");

const types = ["虫蛀点", "破洞", "霉斑", "缺角"];

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function render() {
  if (state.image) {
    pageImage.src = state.image;
    pageImage.style.display = "block";
    emptyState.style.display = "none";
  } else {
    pageImage.removeAttribute("src");
    pageImage.style.display = "none";
    emptyState.style.display = "grid";
  }

  markersLayer.innerHTML = state.markers.map((marker) => `
    <span class="marker" data-type="${marker.type}" title="${marker.type}: ${marker.note || "无备注"}" style="left:${marker.x}%;top:${marker.y}%"></span>
  `).join("");

  const counts = Object.fromEntries(types.map((type) => [type, 0]));
  state.markers.forEach((marker) => counts[marker.type] += 1);
  stats.innerHTML = types.map((type) => `
    <div class="stat"><span>${type}</span><strong>${counts[type]}</strong></div>
  `).join("");

  markerList.innerHTML = state.markers.length
    ? state.markers.map((marker, index) => `
      <article class="record">
        <strong>${index + 1}. ${marker.type}</strong>
        <p>${marker.note || "未填写备注"}</p>
        <button type="button" data-delete="${marker.id}">删除</button>
      </article>
    `).join("")
    : '<p class="empty-copy">还没有损伤标记。</p>';
}

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.image = reader.result;
    state.markers = [];
    save();
    render();
  });
  reader.readAsDataURL(file);
});

stage.addEventListener("click", (event) => {
  if (!state.image || event.target.closest("button")) return;
  const rect = stage.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  state.markers.push({
    id: crypto.randomUUID(),
    type: typeInput.value,
    note: noteInput.value.trim(),
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    createdAt: new Date().toISOString()
  });
  noteInput.value = "";
  save();
  render();
});

markerList.addEventListener("click", (event) => {
  const id = event.target.dataset.delete;
  if (!id) return;
  state.markers = state.markers.filter((marker) => marker.id !== id);
  save();
  render();
});

document.querySelector("#exportBtn").addEventListener("click", () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    imageIncluded: Boolean(state.image),
    markers: state.markers
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "archive-page-damage.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

document.querySelector("#clearBtn").addEventListener("click", () => {
  if (!confirm("清空当前扫描页和全部标记？")) return;
  state.image = "";
  state.markers = [];
  save();
  render();
});

render();
