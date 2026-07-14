import { api } from "/scripts/api.js";
import {
  ASPECTS,
  aspectToCssRatio,
  attachPersistHooks,
  cellImageUrl,
  findWidget,
  getWidgetValue,
  hideWidget,
  markDirty,
  parseCellsData,
  resizeNode,
  serializeCellsData,
  setWidgetValue,
} from "./shared.js";

function emptyCell(aspect = "16:9") {
  return { filename: "", subfolder: "", type: "input", label: "", aspect };
}

export function setupStoryboardCells(node) {
  if (node._storyboardCellsReady) return;
  node._storyboardCellsReady = true;

  const dataWidget = findWidget(node, "cells_data");
  hideWidget(dataWidget);
  resizeNode(node, 520, 480);

  const panel = document.createElement("div");
  panel.className = "storyboard-panel";

  const toolbar = document.createElement("div");
  toolbar.className = "storyboard-toolbar";

  const btnAdd = document.createElement("button");
  btnAdd.type = "button";
  btnAdd.className = "storyboard-btn storyboard-btn--accent";
  btnAdd.textContent = "+ Add cell";

  const btnClear = document.createElement("button");
  btnClear.type = "button";
  btnClear.className = "storyboard-btn storyboard-btn--danger";
  btnClear.textContent = "Clear";

  const ratioLabel = document.createElement("span");
  ratioLabel.style.cssText = "font-size:10px;color:#9090a0;margin-left:auto;align-self:center;";
  ratioLabel.textContent = "Ratio:";

  const ratioSelect = document.createElement("select");
  ratioSelect.className = "storyboard-aspect-select";
  for (const a of ASPECTS) {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    ratioSelect.appendChild(opt);
  }
  ratioSelect.value = "16:9";

  toolbar.append(btnAdd, btnClear, ratioLabel, ratioSelect);

  const gridWrap = document.createElement("div");
  gridWrap.className = "storyboard-grid-wrap";

  const grid = document.createElement("div");
  grid.className = "storyboard-grid storyboard-cells-grid";
  gridWrap.appendChild(grid);
  panel.append(toolbar, gridWrap);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";
  panel.appendChild(fileInput);

  let cells = [];
  let syncing = false;
  let dragIndex = null;
  let uploadTargetIndex = null;

  function getColumns() {
    const v = parseInt(getWidgetValue(node, "columns", "3"), 10);
    return Math.min(8, Math.max(1, Number.isFinite(v) ? v : 3));
  }

  function syncToWidget() {
    if (syncing) return;
    syncing = true;
    setWidgetValue(node, "cells_data", serializeCellsData(cells.filter((c) => c.filename)));
    syncing = false;
    markDirty(node);
  }

  async function uploadImage(file) {
    const body = new FormData();
    body.append("image", file);
    body.append("type", "input");
    body.append("subfolder", "");
    const resp = await api.fetchApi("/upload/image", { method: "POST", body });
    if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
    return resp.json();
  }

  function ensureTrailingEmpty() {
    if (!cells.length || cells[cells.length - 1].filename) {
      cells.push(emptyCell(ratioSelect.value));
    }
  }

  function render() {
    const cols = getColumns();
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    grid.replaceChildren();

    if (!cells.length) {
      const empty = document.createElement("div");
      empty.className = "storyboard-empty";
      empty.textContent = "Нажмите «+ Add cell» или загрузите картинку";
      grid.appendChild(empty);
      return;
    }

    cells.forEach((cell, index) => {
      const card = document.createElement("div");
      card.className = "storyboard-cell-card";
      card.draggable = Boolean(cell.filename);
      card.dataset.index = String(index);
      card.style.aspectRatio = aspectToCssRatio(cell.aspect || ratioSelect.value);

      if (cell.filename) {
        const img = document.createElement("img");
        img.className = "storyboard-cell-preview";
        img.src = cellImageUrl(cell);
        img.alt = cell.label || cell.filename;
        img.draggable = false;
        card.appendChild(img);

        const del = document.createElement("button");
        del.type = "button";
        del.className = "storyboard-cell-remove";
        del.textContent = "×";
        del.title = "Удалить";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          cells.splice(index, 1);
          if (!cells.length) cells.push(emptyCell(ratioSelect.value));
          syncToWidget();
          render();
        });
        card.appendChild(del);

        const labelInput = document.createElement("input");
        labelInput.className = "storyboard-cell-label";
        labelInput.placeholder = "Подпись";
        labelInput.value = cell.label || "";
        labelInput.addEventListener("input", () => {
          cell.label = labelInput.value;
          syncToWidget();
        });
        labelInput.addEventListener("click", (e) => e.stopPropagation());
        card.appendChild(labelInput);

        card.addEventListener("dragstart", (e) => {
          dragIndex = index;
          card.classList.add("storyboard-frame-card--dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(index));
        });
        card.addEventListener("dragend", () => {
          dragIndex = null;
          card.classList.remove("storyboard-frame-card--dragging");
        });
        card.addEventListener("dragover", (e) => {
          e.preventDefault();
          card.classList.add("storyboard-frame-card--drag-over");
        });
        card.addEventListener("dragleave", () => {
          card.classList.remove("storyboard-frame-card--drag-over");
        });
        card.addEventListener("drop", (e) => {
          e.preventDefault();
          card.classList.remove("storyboard-frame-card--drag-over");
          const from = dragIndex ?? parseInt(e.dataTransfer.getData("text/plain"), 10);
          const to = index;
          if (!Number.isFinite(from) || from === to) return;
          const [moved] = cells.splice(from, 1);
          cells.splice(to, 0, moved);
          syncToWidget();
          render();
        });
      } else {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "storyboard-cell-add";
        addBtn.textContent = "+";
        addBtn.title = "Загрузить картинку";
        addBtn.addEventListener("click", () => {
          uploadTargetIndex = index;
          fileInput.click();
        });
        card.appendChild(addBtn);
      }

      grid.appendChild(card);
    });
  }

  function loadFromWidget() {
    if (syncing) return;
    syncing = true;
    cells = parseCellsData(getWidgetValue(node, "cells_data", "[]"));
    if (!cells.length) cells.push(emptyCell(ratioSelect.value));
    ensureTrailingEmpty();
    syncing = false;
    render();
  }

  function applyPersistedData(raw) {
    cells = parseCellsData(raw);
    if (!cells.length) cells.push(emptyCell(ratioSelect.value));
    ensureTrailingEmpty();
    setWidgetValue(node, "cells_data", serializeCellsData(cells.filter((c) => c.filename)));
    render();
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file || uploadTargetIndex == null) return;
    try {
      const data = await uploadImage(file);
      const idx = uploadTargetIndex;
      cells[idx] = {
        filename: data.name,
        subfolder: data.subfolder || "",
        type: data.type || "input",
        label: cells[idx]?.label || "",
        aspect: ratioSelect.value,
      };
      ensureTrailingEmpty();
      syncToWidget();
      render();
    } catch (err) {
      console.error("[StoryboardSuite] upload failed:", err);
    }
    uploadTargetIndex = null;
  });

  btnAdd.addEventListener("click", () => {
    cells.push(emptyCell(ratioSelect.value));
    syncToWidget();
    render();
  });

  btnClear.addEventListener("click", () => {
    cells = [emptyCell(ratioSelect.value)];
    syncToWidget();
    render();
  });

  ratioSelect.addEventListener("change", () => {
    for (const cell of cells) {
      if (!cell.filename) cell.aspect = ratioSelect.value;
    }
    render();
  });

  const domWidget = node.addDOMWidget("storyboard_cells_ui", "STORYBOARD_CELLS", panel, {
    getValue() {
      return serializeCellsData(cells.filter((c) => c.filename));
    },
    setValue(v) {
      cells = parseCellsData(v);
      if (!cells.length) cells.push(emptyCell(ratioSelect.value));
      ensureTrailingEmpty();
      render();
    },
    serialize: false,
  });
  domWidget.computeSize = function (width) {
    return [width, 380];
  };

  attachPersistHooks(
    node,
    "storyboard_cells_data",
    () => serializeCellsData(cells.filter((c) => c.filename)),
    applyPersistedData
  );

  loadFromWidget();

  if (dataWidget) {
    const orig = dataWidget.callback;
    dataWidget.callback = function (...args) {
      if (orig) orig.apply(this, args);
      loadFromWidget();
    };
  }

  const columnsWidget = findWidget(node, "columns");
  if (columnsWidget) {
    const origCol = columnsWidget.callback;
    columnsWidget.callback = function (...args) {
      if (origCol) origCol.apply(this, args);
      render();
    };
  }

  node.onStoryboardCellsSync = () => {
    syncToWidget();
  };
}
