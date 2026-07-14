import {
  attachPersistHooks,
  createSelectDropdown,
  findWidget,
  getWidgetValue,
  hideWidget,
  markDirty,
  parseTableData,
  refreshSelectDropdown,
  resizeNode,
  selectOptionValue,
  serializeTableData,
  setWidgetValue,
} from "./shared.js";

const COLS = [
  { key: "name", label: "Name", className: "col-name", tag: "input" },
  { key: "prompt", label: "Prompt", className: "col-prompt", tag: "textarea" },
  { key: "negative", label: "Negative", className: "col-negative", tag: "textarea" },
  { key: "weight", label: "Weight", className: "col-weight", tag: "input" },
];

export function setupTextTable(node) {
  if (node._storyboardTextTableReady) return;
  node._storyboardTextTableReady = true;

  const dataWidget = findWidget(node, "table_data");
  const selectWidget = findWidget(node, "select");
  hideWidget(dataWidget);
  hideWidget(selectWidget);

  resizeNode(node, 520, 380);

  const panel = document.createElement("div");
  panel.className = "storyboard-panel";

  const toolbar = document.createElement("div");
  toolbar.className = "storyboard-toolbar";

  const { wrap: selectWrap, dropdown: selectDropdown } = createSelectDropdown("Select");
  selectDropdown.addEventListener("change", () => {
    const val = selectDropdown.value;
    setWidgetValue(node, "select", val);
    const idx = rows.findIndex((row, i) => selectOptionValue(row, i) === val);
    if (idx >= 0) selectedIndex = idx;
    render();
    markDirty(node);
  });

  const btnAdd = document.createElement("button");
  btnAdd.type = "button";
  btnAdd.className = "storyboard-btn storyboard-btn--accent";
  btnAdd.textContent = "+ Add row";

  const btnDup = document.createElement("button");
  btnDup.type = "button";
  btnDup.className = "storyboard-btn";
  btnDup.textContent = "Duplicate";

  const btnDel = document.createElement("button");
  btnDel.type = "button";
  btnDel.className = "storyboard-btn storyboard-btn--danger";
  btnDel.textContent = "Delete";

  toolbar.append(selectWrap, btnAdd, btnDup, btnDel);

  const tableWrap = document.createElement("div");
  tableWrap.className = "storyboard-table-wrap";

  const table = document.createElement("table");
  table.className = "storyboard-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const col of COLS) {
    const th = document.createElement("th");
    th.className = col.className;
    th.textContent = col.label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  panel.append(toolbar, tableWrap);

  let rows = [];
  let selectedIndex = 0;
  let syncing = false;

  function getSelectedIndex() {
    const sel = String(getWidgetValue(node, "select", "0")).trim();
    if (/^-?\d+$/.test(sel)) {
      const idx = parseInt(sel, 10);
      if (rows.length) return ((idx % rows.length) + rows.length) % rows.length;
      return 0;
    }
    const lower = sel.toLowerCase();
    const byName = rows.findIndex((r) => r.name.toLowerCase() === lower);
    return byName >= 0 ? byName : 0;
  }

  function syncToWidget() {
    if (syncing) return;
    syncing = true;
    const json = serializeTableData(rows);
    setWidgetValue(node, "table_data", json);
    if (rows[selectedIndex]) {
      const row = rows[selectedIndex];
      const selVal = row.name || String(selectedIndex);
      setWidgetValue(node, "select", selVal);
    }
    syncing = false;
    markDirty(node);
  }

  function render() {
    selectedIndex = getSelectedIndex();
    if (selectedIndex >= rows.length) selectedIndex = Math.max(0, rows.length - 1);

    tbody.replaceChildren();

    if (!rows.length) {
      const empty = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = COLS.length;
      td.className = "storyboard-empty";
      td.textContent = "Нет строк — нажмите «+ Add row»";
      empty.appendChild(td);
      tbody.appendChild(empty);
      return;
    }

    rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      if (rowIndex === selectedIndex) tr.classList.add("storyboard-row--selected");

      tr.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        selectedIndex = rowIndex;
        setWidgetValue(node, "select", row.name || String(rowIndex));
        render();
        markDirty(node);
      });

      for (const col of COLS) {
        const td = document.createElement("td");
        td.className = col.className;
        const el = document.createElement(col.tag);
        el.value = String(row[col.key] ?? "");
        if (col.key === "weight") {
          el.type = "number";
          el.step = "0.1";
          el.min = "0";
        }
        el.addEventListener("input", () => {
          if (col.key === "weight") {
            row[col.key] = parseFloat(el.value) || 1.0;
          } else {
            row[col.key] = el.value;
          }
          syncToWidget();
        });
        el.addEventListener("click", (e) => e.stopPropagation());
        td.appendChild(el);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });

    refreshSelectDropdown(selectDropdown, rows, selectedIndex);
  }

  function loadFromWidget() {
    if (syncing) return;
    syncing = true;
    rows = parseTableData(getWidgetValue(node, "table_data", "[]"));
    syncing = false;
    render();
  }

  btnAdd.addEventListener("click", () => {
    const n = rows.length + 1;
    rows.push({
      name: `row-${n}`,
      prompt: "",
      negative: "",
      weight: 1.0,
    });
    selectedIndex = rows.length - 1;
    syncToWidget();
    render();
  });

  btnDup.addEventListener("click", () => {
    if (!rows.length) return;
    const src = rows[selectedIndex] ?? rows[0];
    rows.splice(selectedIndex + 1, 0, {
      name: `${src.name}-copy`,
      prompt: src.prompt,
      negative: src.negative,
      weight: src.weight,
    });
    selectedIndex += 1;
    syncToWidget();
    render();
  });

  btnDel.addEventListener("click", () => {
    if (!rows.length) return;
    rows.splice(selectedIndex, 1);
    selectedIndex = Math.min(selectedIndex, Math.max(0, rows.length - 1));
    syncToWidget();
    render();
  });

  const domWidget = node.addDOMWidget("storyboard_table_ui", "STORYBOARD_TABLE", panel, {
    getValue() {
      return serializeTableData(rows);
    },
    setValue(v) {
      rows = parseTableData(v);
      render();
    },
    serialize: false,
  });
  domWidget.computeSize = function (width) {
    return [width, 300];
  };

  function applyPersistedData(raw) {
    rows = parseTableData(raw);
    setWidgetValue(node, "table_data", serializeTableData(rows));
    render();
  }

  attachPersistHooks(
    node,
    "storyboard_table_data",
    () => serializeTableData(rows),
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

  node.onStoryboardTableSync = () => {
    syncToWidget();
  };
}
