/** Storyboard Suite — общие утилиты */

export const ACCENT = "#6b4fd8";
export const TITLE_BG = "#2a2248";
export const BODY_BG = "#121218";

export const STORYBOARD_NODES = new Set([
  "TextTable",
  "FrameGrid",
  "FrameGridBatch",
  "StoryboardSheet",
  "StoryboardCells",
]);

export const ASPECTS = [
  "21:9", "16:9", "16:10", "3:2", "4:3", "5:4", "1:1",
  "4:5", "3:4", "2:3", "10:16", "9:16", "9:21",
];

export function applyNodeStyle(node) {
  node.color = TITLE_BG;
  node.bgcolor = BODY_BG;
}

export function findWidget(node, name) {
  return node.widgets?.find((w) => w.name === name);
}

export function hideWidget(widget) {
  if (!widget) return;
  widget.hidden = true;
  const orig = widget.computeSize?.bind(widget);
  widget.computeSize = function (width) {
    if (orig) {
      const size = orig(width);
      return [size[0], 0];
    }
    return [0, -4];
  };
}

/** Имя для select: name или индекс (как в Python _select_row/_select_frame). */
export function selectOptionValue(item, index) {
  const name = String(item?.name ?? "").trim();
  return name || String(index);
}

export function createSelectDropdown(label = "Select") {
  const wrap = document.createElement("div");
  wrap.className = "storyboard-select-wrap";

  const labelEl = document.createElement("span");
  labelEl.className = "storyboard-select-label";
  labelEl.textContent = label;

  const dropdown = document.createElement("select");
  dropdown.className = "storyboard-row-select";

  wrap.append(labelEl, dropdown);
  return { wrap, dropdown };
}

export function refreshSelectDropdown(dropdown, items, selectedIndex, getValue = selectOptionValue) {
  dropdown.replaceChildren();
  if (!items.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "—";
    dropdown.appendChild(opt);
    dropdown.disabled = true;
    return;
  }

  dropdown.disabled = false;
  items.forEach((item, index) => {
    const value = getValue(item, index);
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = String(item?.name ?? "").trim() || `#${index + 1}`;
    dropdown.appendChild(opt);
  });

  const idx = Math.min(Math.max(0, selectedIndex), items.length - 1);
  dropdown.value = getValue(items[idx], idx);
}

/** Резервная сериализация в node.properties — на случай если скрытый виджет не сохранится. */
export function attachPersistHooks(node, storageKey, getData, applyData) {
  const origOnSerialize = node.onSerialize;
  node.onSerialize = function (o) {
    if (origOnSerialize) origOnSerialize.call(this, o);
    o[storageKey] = getData();
  };

  const origOnConfigure = node.onConfigure;
  node.onConfigure = function (o) {
    if (origOnConfigure) origOnConfigure.call(this, o);
    if (o[storageKey] != null) {
      applyData(o[storageKey]);
    }
  };
}

export function setWidgetValue(node, name, value) {
  const w = findWidget(node, name);
  if (!w) return;
  w.value = value;
}

export function getWidgetValue(node, name, fallback = "") {
  const w = findWidget(node, name);
  return w ? w.value : fallback;
}

export function resizeNode(node, width, minHeight) {
  if (node.size[0] < width) node.size[0] = width;
  if (node.size[1] < minHeight) node.size[1] = minHeight;
  node.setDirtyCanvas?.(true, true);
}

export function markDirty(node) {
  if (node.graph?.setDirtyCanvas) node.graph.setDirtyCanvas(true, true);
  node.setDirtyCanvas?.(true, true);
}

export function parseWeight(raw, fallback = 1.0) {
  const n = parseFloat(String(raw ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

export function parseTableData(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return [];

  if (text.startsWith("[")) {
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            name: String(item.name ?? "").trim(),
            prompt: String(item.prompt ?? "").trim(),
            negative: String(item.negative ?? "").trim(),
            weight: parseWeight(item.weight, 1.0),
          }))
          .filter((r) => r.name || r.prompt);
      }
    } catch {
      /* fallback to lines */
    }
  }

  const rows = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split("|").map((p) => p.trim());
    let name = "";
    let prompt = "";
    let negative = "";
    let weight = 1.0;
    if (parts.length >= 4) {
      [name, prompt, negative] = parts;
      weight = parseWeight(parts[3]);
    } else if (parts.length === 3) {
      [name, prompt, negative] = parts;
    } else if (parts.length === 2) {
      [name, prompt] = parts;
    } else {
      prompt = t;
    }
    rows.push({ name, prompt, negative, weight });
  }
  return rows;
}

export function serializeTableData(rows) {
  return JSON.stringify(rows, null, 2);
}

export function parseFramesData(raw, defaultAspect = "16:9") {
  const text = String(raw ?? "").trim();
  if (!text) return [];

  if (text.startsWith("[")) {
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data
          .filter((item) => item && typeof item === "object")
          .map((item, i) => {
            const id = String(item.id ?? `frame-${i + 1}`).trim() || `frame-${i + 1}`;
            return {
              id,
              name: String(item.name ?? "").trim() || id,
              prompt: String(item.prompt ?? "").trim(),
              aspect: String(item.aspect ?? defaultAspect).trim() || defaultAspect,
            };
          })
          .filter((f) => f.name || f.prompt);
      }
    } catch {
      /* fallback */
    }
  }

  const frames = [];
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const parts = t.split("|").map((p) => p.trim());
    let name = "";
    let prompt = "";
    let aspect = defaultAspect;
    if (parts.length >= 3) {
      [name, prompt, aspect] = parts;
    } else if (parts.length === 2) {
      [name, prompt] = parts;
    } else {
      name = `frame-${i + 1}`;
      prompt = t;
    }
    const id = `frame-${i + 1}`;
    frames.push({
      id,
      name: name || id,
      prompt,
      aspect: aspect || defaultAspect,
    });
  });
  return frames;
}

export function serializeFramesData(frames) {
  return JSON.stringify(frames, null, 2);
}

export function nextFrameId() {
  return `frame-${Date.now()}`;
}

export function parseCellsData(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    return data
      .filter((item) => item && typeof item === "object" && item.filename)
      .map((item) => ({
        filename: String(item.filename ?? "").trim(),
        subfolder: String(item.subfolder ?? "").trim(),
        type: String(item.type ?? "input").trim() || "input",
        label: String(item.label ?? "").trim(),
        aspect: String(item.aspect ?? "16:9").trim() || "16:9",
      }))
      .filter((c) => c.filename);
  } catch {
    return [];
  }
}

export function serializeCellsData(cells) {
  return JSON.stringify(cells, null, 2);
}

export function aspectToCssRatio(aspect) {
  const parts = String(aspect || "16:9").split(":");
  if (parts.length === 2) {
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (w > 0 && h > 0) return `${w} / ${h}`;
  }
  return "16 / 9";
}

export function cellImageUrl(cell) {
  const params = new URLSearchParams({
    filename: cell.filename,
    subfolder: cell.subfolder || "",
    type: cell.type || "input",
  });
  return `/view?${params.toString()}`;
}
