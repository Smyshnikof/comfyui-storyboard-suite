import { app } from "../../../scripts/app.js";
import { api } from "/scripts/api.js";
import {
  ACCENT,
  applyNodeStyle,
  STORYBOARD_NODES,
} from "./shared.js";
import { setupFrameGrid } from "./frame_grid_widget.js";
import { setupStoryboardCells } from "./cells_widget.js";
import { setupTextTable } from "./text_table_widget.js";

const LOG = "[StoryboardSuite]";

function injectStyles() {
  if (document.getElementById("storyboard-suite-css")) return;
  const link = document.createElement("link");
  link.id = "storyboard-suite-css";
  link.rel = "stylesheet";
  link.href = new URL("../storyboard.css", import.meta.url).href;
  document.head.appendChild(link);
}

function setupNode(node, className) {
  applyNodeStyle(node);
  if (className === "TextTable") {
    setupTextTable(node);
  } else if (className === "FrameGrid" || className === "FrameGridBatch") {
    setupFrameGrid(node);
  } else if (className === "StoryboardCells") {
    setupStoryboardCells(node);
  }
}

function drawBadge(node, ctx) {
  const titleH = (window.LiteGraph?.NODE_TITLE_HEIGHT) || 20;
  ctx.save();
  ctx.fillStyle = ACCENT;
  ctx.font = "600 10px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText("Storyboard", node.size[0] - 8, -titleH / 2);
  ctx.restore();
}

function patchNodeType(nodeType, className) {
  const origOnNodeCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    const result = origOnNodeCreated?.apply(this, arguments);
    setupNode(this, className);
    return result;
  };

  const origOnDrawForeground = nodeType.prototype.onDrawForeground;
  nodeType.prototype.onDrawForeground = function (ctx) {
    if (origOnDrawForeground) origOnDrawForeground.call(this, ctx);
    if (!this.flags?.collapsed) drawBadge(this, ctx);
  };
}

function onGraphNode(node) {
  if (!node || !STORYBOARD_NODES.has(node.comfyClass)) return;
  applyNodeStyle(node);
  setupNode(node, node.comfyClass);
  node.onStoryboardTableSync?.();
  node.onStoryboardGridSync?.();
  node.onStoryboardCellsSync?.();
}

injectStyles();
console.log(`${LOG} Расширение загружено`);

function syncAllStoryboardNodes() {
  const nodes = app.graph?._nodes ?? [];
  for (const node of nodes) {
    node.onStoryboardCellsSync?.();
    node.onStoryboardTableSync?.();
    node.onStoryboardGridSync?.();
  }
}

api.addEventListener("prompt", () => {
  syncAllStoryboardNodes();
});

app.registerExtension({
  name: "ComfyUI.StoryboardSuite",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    const className = nodeData.name;
    if (!STORYBOARD_NODES.has(className)) return;
    patchNodeType(nodeType, className);
  },

  nodeCreated(node) {
    onGraphNode(node);
  },

  loadedGraphNode(node) {
    onGraphNode(node);
    requestAnimationFrame(() => onGraphNode(node));
  },
});
