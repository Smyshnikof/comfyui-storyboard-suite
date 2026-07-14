import {
  ASPECTS,
  attachPersistHooks,
  findWidget,
  getWidgetValue,
  hideWidget,
  markDirty,
  nextFrameId,
  parseFramesData,
  resizeNode,
  serializeFramesData,
  setWidgetValue,
} from "./shared.js";

function selectValueForFrame(frame, index) {
  return frame?.name || String(index);
}

export function setupFrameGrid(node) {
  if (node._storyboardFrameGridReady) return;
  node._storyboardFrameGridReady = true;

  const isBatch = node.comfyClass === "FrameGridBatch";
  const dataWidget = findWidget(node, "frames_data");
  const selectWidget = isBatch ? null : findWidget(node, "select");
  const columnsWidget = isBatch ? null : findWidget(node, "columns");
  hideWidget(dataWidget);

  resizeNode(node, 480, 420);

  const panel = document.createElement("div");
  panel.className = "storyboard-panel";

  const toolbar = document.createElement("div");
  toolbar.className = "storyboard-toolbar";

  const btnAdd = document.createElement("button");
  btnAdd.type = "button";
  btnAdd.className = "storyboard-btn storyboard-btn--accent";
  btnAdd.textContent = "+ Add frame";

  const btnDel = document.createElement("button");
  btnDel.type = "button";
  btnDel.className = "storyboard-btn storyboard-btn--danger";
  btnDel.textContent = "Delete";

  const aspectLabel = document.createElement("span");
  aspectLabel.style.cssText = "font-size:10px;color:#9090a0;margin-left:auto;align-self:center;";
  aspectLabel.textContent = "Aspect:";

  const aspectSelect = document.createElement("select");
  aspectSelect.className = "storyboard-aspect-select";
  for (const a of ASPECTS) {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    aspectSelect.appendChild(opt);
  }

  toolbar.append(btnAdd, btnDel, aspectLabel, aspectSelect);

  const gridWrap = document.createElement("div");
  gridWrap.className = "storyboard-grid-wrap";

  const grid = document.createElement("div");
  grid.className = "storyboard-grid";
  gridWrap.appendChild(grid);
  panel.append(toolbar, gridWrap);

  let frames = [];
  let selectedIndex = 0;
  let syncing = false;
  let dragIndex = null;

  function getColumns() {
    if (!columnsWidget) return 3;
    const v = parseInt(getWidgetValue(node, "columns", "3"), 10);
    return Math.min(6, Math.max(1, Number.isFinite(v) ? v : 3));
  }

  function getDefaultAspect() {
    return getWidgetValue(node, "default_aspect", "16:9") || "16:9";
  }

  function getSelectedIndex() {
    if (isBatch) return selectedIndex;
    const sel = String(getWidgetValue(node, "select", "0")).trim();
    if (/^-?\d+$/.test(sel)) {
      const idx = parseInt(sel, 10);
      if (frames.length) return ((idx % frames.length) + frames.length) % frames.length;
      return 0;
    }
    const lower = sel.toLowerCase();
    const byName = frames.findIndex(
      (f) => f.name.toLowerCase() === lower || f.id.toLowerCase() === lower
    );
    return byName >= 0 ? byName : 0;
  }

  function syncToWidget() {
    if (syncing) return;
    syncing = true;
    const json = serializeFramesData(frames);
    setWidgetValue(node, "frames_data", json);
    if (!isBatch && frames[selectedIndex] && selectWidget) {
      setWidgetValue(node, "select", selectValueForFrame(frames[selectedIndex], selectedIndex));
    }
    syncing = false;
    markDirty(node);
  }

  function render() {
    selectedIndex = getSelectedIndex();
    if (selectedIndex >= frames.length) selectedIndex = Math.max(0, frames.length - 1);

    const cols = getColumns();
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    grid.replaceChildren();

    if (!frames.length) {
      const empty = document.createElement("div");
      empty.className = "storyboard-empty";
      empty.textContent = "Нет кадров — нажмите «+ Add frame»";
      grid.appendChild(empty);
      return;
    }

    frames.forEach((frame, index) => {
      const card = document.createElement("div");
      card.className = "storyboard-frame-card";
      card.dataset.index = String(index);

      if (!isBatch && index === selectedIndex) {
        card.classList.add("storyboard-frame-card--selected");
      }

      const dragHandle = document.createElement("span");
      dragHandle.className = "storyboard-frame-drag";
      dragHandle.textContent = "⋮⋮";
      dragHandle.draggable = true;
      dragHandle.title = "Drag to reorder";

      const header = document.createElement("div");
      header.className = "storyboard-frame-header";

      const nameEl = document.createElement("input");
      nameEl.type = "text";
      nameEl.className = "storyboard-frame-name";
      nameEl.value = frame.name || frame.id;
      nameEl.placeholder = "Frame name";
      nameEl.addEventListener("input", () => {
        frame.name = nameEl.value;
        syncToWidget();
      });
      nameEl.addEventListener("click", (e) => e.stopPropagation());

      const badge = document.createElement("span");
      badge.className = "storyboard-aspect-badge";
      badge.textContent = frame.aspect || getDefaultAspect();

      header.append(nameEl, badge);

      const promptEl = document.createElement("textarea");
      promptEl.className = "storyboard-frame-prompt";
      promptEl.value = frame.prompt || "";
      promptEl.placeholder = "Prompt…";
      promptEl.rows = 2;
      promptEl.addEventListener("input", () => {
        frame.prompt = promptEl.value;
        syncToWidget();
      });
      promptEl.addEventListener("click", (e) => e.stopPropagation());

      card.append(dragHandle, header, promptEl);

      if (!isBatch) {
        card.addEventListener("click", (e) => {
          if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
          selectedIndex = index;
          setWidgetValue(node, "select", selectValueForFrame(frame, index));
          aspectSelect.value = frame.aspect || getDefaultAspect();
          render();
          markDirty(node);
        });
      }

      dragHandle.addEventListener("dragstart", (e) => {
        dragIndex = index;
        card.classList.add("storyboard-frame-card--dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        e.stopPropagation();
      });

      dragHandle.addEventListener("dragend", () => {
        dragIndex = null;
        card.classList.remove("storyboard-frame-card--dragging");
        grid.querySelectorAll(".storyboard-frame-card--drag-over").forEach((el) => {
          el.classList.remove("storyboard-frame-card--drag-over");
        });
      });

      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
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
        const [moved] = frames.splice(from, 1);
        frames.splice(to, 0, moved);
        selectedIndex = to;
        syncToWidget();
        render();
      });

      grid.appendChild(card);
    });

    if (frames[selectedIndex]) {
      aspectSelect.value = frames[selectedIndex].aspect || getDefaultAspect();
    }
  }

  function loadFromWidget() {
    if (syncing) return;
    syncing = true;
    frames = parseFramesData(getWidgetValue(node, "frames_data", "[]"), getDefaultAspect());
    syncing = false;
    render();
  }

  function applyPersistedData(raw) {
    frames = parseFramesData(raw, getDefaultAspect());
    setWidgetValue(node, "frames_data", serializeFramesData(frames));
    render();
  }

  btnAdd.addEventListener("click", () => {
    const id = nextFrameId();
    const n = frames.length + 1;
    frames.push({
      id,
      name: `shot-${n}`,
      prompt: "",
      aspect: getDefaultAspect(),
    });
    selectedIndex = frames.length - 1;
    syncToWidget();
    render();
  });

  btnDel.addEventListener("click", () => {
    if (!frames.length) return;
    frames.splice(selectedIndex, 1);
    selectedIndex = Math.min(selectedIndex, Math.max(0, frames.length - 1));
    syncToWidget();
    render();
  });

  aspectSelect.addEventListener("change", () => {
    if (!frames[selectedIndex]) return;
    frames[selectedIndex].aspect = aspectSelect.value;
    syncToWidget();
    render();
  });

  const domWidget = node.addDOMWidget("storyboard_grid_ui", "STORYBOARD_GRID", panel, {
    getValue() {
      return serializeFramesData(frames);
    },
    setValue(v) {
      frames = parseFramesData(v, getDefaultAspect());
      render();
    },
    serialize: false,
  });
  domWidget.computeSize = function (width) {
    return [width, 340];
  };

  attachPersistHooks(
    node,
    "storyboard_frames_data",
    () => serializeFramesData(frames),
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

  if (selectWidget) {
    const origSel = selectWidget.callback;
    selectWidget.callback = function (...args) {
      if (origSel) origSel.apply(this, args);
      render();
    };
  }

  if (columnsWidget) {
    const origCol = columnsWidget.callback;
    columnsWidget.callback = function (...args) {
      if (origCol) origCol.apply(this, args);
      render();
    };
  }

  const defaultAspectWidget = findWidget(node, "default_aspect");
  if (defaultAspectWidget) {
    const origAsp = defaultAspectWidget.callback;
    defaultAspectWidget.callback = function (...args) {
      if (origAsp) origAsp.apply(this, args);
      render();
    };
  }

  node.onStoryboardGridSync = () => {
    syncToWidget();
  };
}
