<p align="center">
  <img src="icon.png" alt="Storyboard Suite" width="180">
</p>

# Storyboard Suite — pre-production nodes for ComfyUI

English · **[Русский](README.ru.md)**

A node pack for planning image generation workflows inside ComfyUI. Guild asset map by **@itsmyshnikov**.

| Node | Purpose |
|------|---------|
| **Text Table** | Prompt library: name, prompt, negative, weight |
| **Frame Grid** | Single frame + `width`/`height` (INT) for EmptyLatentImage |
| **Frame Grid (Batch)** | All frames as lists — batch in one Queue Prompt |
| **Sheet** | Contact sheet: IMAGE batch or `image_1..9` slots → labeled grid |
| **Cells** | Load images directly into cells → contact sheet (no generation) |

No GPU required — plain Python + JS, not image generation.

## Installation

1. Copy the `comfyui-storyboard-suite` folder into `ComfyUI/custom_nodes/`.
2. Restart ComfyUI.
3. Right-click → **Add Node → Storyboard**.

No dependencies (`requirements.txt` is empty).

## Usage

### Text Table

- UI table: Name / Prompt / Negative / Weight.
- Toolbar: **+ Add row**, **Duplicate**, **Delete**.
- Outputs → `CLIP Text Encode` (prompt + negative).

### Frame Grid

- Pick one frame (`select` by name or index).
- **`base_resolution`** — long edge (default 1024).
- **`width`** and **`height`** outputs (INT, multiples of 8) → `EmptyLatentImage`.
- **`all_prompts`** — all prompts joined with `\n---\n` (storyboard overview).
- Drag-sort reorders frames; `select` keeps binding by name.

### Frame Grid (Batch)

- Same frames, but outputs are **lists** (`OUTPUT_IS_LIST`).
- Wire to nodes that accept lists — one Queue runs every frame.

### Storyboard Sheet

- Input **`images`** (batch) **or** individual slots **`image_1` … `image_9`** — connect multiple Load Image nodes without Batch Images.
- **`labels`** — multiline, one line per frame.
- Builds a contact sheet → `SaveImage` / `PreviewImage`.

### Storyboard Cells

- Load images **directly in the node** (“+” button in each cell).
- **`sheet` output** → straight to **Preview Image** or **Save Image** (no Sheet in between).
- Queue → IMAGE sheet + in-node preview.
- Labels: **`label_font_size`**, **`label_bar_height`** (0 = auto), **`label_color`**, **`label_bg_color`** — Cyrillic via `assets/DejaVuSans.ttf`.

> **Do not wire Cells → Sheet.** Cells already outputs a finished sheet. Sheet is for images from the pipeline (VAEDecode, Load Image).

Aspect ratios: `21:9` … `9:21` (13 presets) in Frame Grid and Cells.

## Example workflows

`example_workflows/Storyboard Suite — prompt library + frame grid.json` — single frame + SD1.5.

`example_workflows/Storyboard Suite — contact sheet.json` — `FrameGridBatch` → sampler → `StoryboardSheet` → Save.

- `TextTable` → CLIP Text Encode (positive/negative)
- `FrameGrid.width/height` → EmptyLatentImage
- SD1.5 checkpoint → KSampler → SaveImage

Requires checkpoint `v1-5-pruned-emaonly.safetensors` (standard SD1.5).

## Publishing

See [PUBLISHING.md](PUBLISHING.md). Registry: `comfyui-storyboard-suite`, Publisher `smyshnikof`.

MIT. See [LICENSE](LICENSE).
