"""
Storyboard Suite — pre-production ноды для ComfyUI.
TextTable: библиотека промптов. FrameGrid: сетка кадров с aspect ratio.
StoryboardSheet: contact-sheet из батча IMAGE.
"""

import json
import math
import os
import uuid

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont

DEFAULT_TABLE_ROWS = [
    {
        "name": "portrait",
        "prompt": "cinematic close-up portrait, soft window light, 85mm",
        "negative": "blurry, low quality",
        "weight": 1.0,
    },
    {
        "name": "landscape",
        "prompt": "wide epic mountain landscape at sunrise, mist",
        "negative": "",
        "weight": 1.0,
    },
    {
        "name": "anime",
        "prompt": "anime style, vibrant colors, clean lineart, detailed",
        "negative": "photorealistic",
        "weight": 1.2,
    },
]

DEFAULT_FRAMES = [
    {
        "id": "frame-1",
        "name": "opening",
        "prompt": "wide establishing shot, city skyline at dawn",
        "aspect": "16:9",
    },
    {
        "id": "frame-2",
        "name": "hero",
        "prompt": "medium shot, protagonist walking through crowd",
        "aspect": "16:9",
    },
    {
        "id": "frame-3",
        "name": "detail",
        "prompt": "close-up on hands holding a letter",
        "aspect": "9:16",
    },
]

ASPECT_RATIOS = [
    "21:9", "16:9", "16:10", "3:2", "4:3", "5:4", "1:1",
    "4:5", "3:4", "2:3", "10:16", "9:16", "9:21",
]

FRAME_PROMPT_SEPARATOR = "\n---\n"

_PKG_DIR = os.path.dirname(os.path.abspath(__file__))
_BUNDLED_FONT = os.path.join(_PKG_DIR, "assets", "DejaVuSans.ttf")
_LABEL_FONT_CACHE = {}


def _default_table_json():
    return json.dumps(DEFAULT_TABLE_ROWS, ensure_ascii=False, indent=2)


def _default_frames_json():
    return json.dumps(DEFAULT_FRAMES, ensure_ascii=False, indent=2)


def _parse_weight(raw, default=1.0):
    if raw is None or str(raw).strip() == "":
        return float(default)
    try:
        return float(str(raw).strip())
    except ValueError:
        return float(default)


def _parse_aspect_ratio(aspect):
    text = str(aspect or "").strip()
    if ":" in text:
        left, right = text.split(":", 1)
        try:
            w_ratio = int(left.strip())
            h_ratio = int(right.strip())
            if w_ratio > 0 and h_ratio > 0:
                return w_ratio, h_ratio
        except ValueError:
            pass
    return 16, 9


def _aspect_to_size(aspect, base_resolution, align=8):
    """Длинная сторона = base_resolution, короткая пропорционально; округление вниз до align."""
    base = max(int(base_resolution), align)
    w_ratio, h_ratio = _parse_aspect_ratio(aspect)
    if w_ratio >= h_ratio:
        width = base
        height = int(base * h_ratio / w_ratio)
    else:
        height = base
        width = int(base * w_ratio / h_ratio)
    width = max((width // align) * align, align)
    height = max((height // align) * align, align)
    return width, height


def _parse_table_data(raw):
    text = (raw or "").strip()
    if not text:
        return []

    if text.startswith("["):
        try:
            data = json.loads(text)
            if isinstance(data, list):
                rows = []
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    rows.append({
                        "name": str(item.get("name", "")).strip(),
                        "prompt": str(item.get("prompt", "")).strip(),
                        "negative": str(item.get("negative", "")).strip(),
                        "weight": _parse_weight(item.get("weight", 1.0)),
                    })
                return [r for r in rows if r["name"] or r["prompt"]]
        except json.JSONDecodeError:
            pass

    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) >= 4:
            name, prompt, negative, weight = parts[0], parts[1], parts[2], parts[3]
        elif len(parts) == 3:
            name, prompt, negative = parts
            weight = "1.0"
        elif len(parts) == 2:
            name, prompt = parts
            negative, weight = "", "1.0"
        else:
            name, prompt, negative, weight = "", line, "", "1.0"
        rows.append({
            "name": name,
            "prompt": prompt,
            "negative": negative,
            "weight": _parse_weight(weight),
        })
    return rows


def _select_row(rows, select):
    if not rows:
        return None
    sel = (select or "").strip()
    if sel.lstrip("-").isdigit():
        idx = int(sel) % len(rows)
        return rows[idx]
    for row in rows:
        if row["name"].lower() == sel.lower():
            return row
    return rows[0]


def _parse_frames_data(raw, default_aspect="16:9"):
    text = (raw or "").strip()
    if not text:
        return []

    if text.startswith("["):
        try:
            data = json.loads(text)
            if isinstance(data, list):
                frames = []
                for i, item in enumerate(data):
                    if not isinstance(item, dict):
                        continue
                    frame_id = str(item.get("id", f"frame-{i + 1}")).strip() or f"frame-{i + 1}"
                    frames.append({
                        "id": frame_id,
                        "name": str(item.get("name", "")).strip() or frame_id,
                        "prompt": str(item.get("prompt", "")).strip(),
                        "aspect": str(item.get("aspect", default_aspect)).strip() or default_aspect,
                    })
                return [f for f in frames if f["name"] or f["prompt"]]
        except json.JSONDecodeError:
            pass

    frames = []
    for i, line in enumerate(text.splitlines()):
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) >= 3:
            name, prompt, aspect = parts[0], parts[1], parts[2]
        elif len(parts) == 2:
            name, prompt = parts
            aspect = default_aspect
        else:
            name, prompt, aspect = f"frame-{i + 1}", line, default_aspect
        frame_id = f"frame-{i + 1}"
        frames.append({
            "id": frame_id,
            "name": name or frame_id,
            "prompt": prompt,
            "aspect": aspect or default_aspect,
        })
    return frames


def _select_frame(frames, select):
    if not frames:
        return None, 0
    sel = (select or "").strip()
    if sel.lstrip("-").isdigit():
        idx = int(sel) % len(frames)
        return frames[idx], idx
    for i, frame in enumerate(frames):
        if frame["name"].lower() == sel.lower() or frame["id"].lower() == sel.lower():
            return frame, i
    return frames[0], 0


def _all_prompts_string(frames):
    if not frames:
        return ""
    return FRAME_PROMPT_SEPARATOR.join(f["prompt"] for f in frames if f["prompt"])


def _hex_to_rgb(hex_color, default=(14, 14, 18)):
    text = str(hex_color or "").strip()
    if not text.startswith("#") or len(text) < 7:
        return default
    try:
        return tuple(int(text[i : i + 2], 16) for i in (1, 3, 5))
    except ValueError:
        return default


def _label_font_candidates():
    paths = []
    if os.path.isfile(_BUNDLED_FONT):
        paths.append(_BUNDLED_FONT)
    if os.name == "nt":
        win = os.environ.get("WINDIR", r"C:\Windows")
        paths.extend([
            os.path.join(win, "Fonts", "segoeui.ttf"),
            os.path.join(win, "Fonts", "arial.ttf"),
            os.path.join(win, "Fonts", "calibri.ttf"),
        ])
    paths.extend([
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ])
    return paths


def _get_label_font(size=18):
    size = max(10, min(48, int(size)))
    if size in _LABEL_FONT_CACHE:
        return _LABEL_FONT_CACHE[size]
    for path in _label_font_candidates():
        if not os.path.isfile(path):
            continue
        try:
            font = ImageFont.truetype(path, size)
            _LABEL_FONT_CACHE[size] = font
            return font
        except OSError:
            continue
    font = ImageFont.load_default()
    _LABEL_FONT_CACHE[size] = font
    return font


def _text_width(font, text):
    try:
        return font.getlength(text)
    except AttributeError:
        bbox = font.getbbox(text)
        return bbox[2] - bbox[0]


def _fit_label_text(text, font, max_width):
    text = str(text or "")
    if not text:
        return ""
    if _text_width(font, text) <= max_width:
        return text
    ellipsis = "…"
    while len(text) > 1 and _text_width(font, text + ellipsis) > max_width:
        text = text[:-1]
    return text + ellipsis if text else ellipsis


def _sheet_label_inputs():
    return {
        "label_font_size": ("INT", {"default": 18, "min": 10, "max": 48}),
        "label_bar_height": ("INT", {"default": 0, "min": 0, "max": 96}),
        "label_color": ("STRING", {"default": "#e8e8f0"}),
        "label_bg_color": ("STRING", {"default": "#1a1a22"}),
    }


def _parse_labels(labels_raw, count):
    lines = [line.strip() for line in str(labels_raw or "").splitlines()]
    return [lines[i] if i < len(lines) else "" for i in range(count)]


def _tensor_to_pil_list(images):
    if images is None:
        return []
    if images.ndim == 3:
        images = images.unsqueeze(0)
    if images.shape[0] == 0:
        return []
    arr = (images.clamp(0, 1).detach().cpu().numpy() * 255).astype(np.uint8)
    return [Image.fromarray(arr[i], mode="RGB") for i in range(arr.shape[0])]


def _pil_to_tensor(img):
    arr = np.array(img.convert("RGB"), dtype=np.float32) / 255.0
    return torch.from_numpy(arr)[None, ...]


def _fit_letterbox(img, cell_w, cell_h, bg):
    iw, ih = img.size
    scale = min(cell_w / max(iw, 1), cell_h / max(ih, 1))
    nw = max(1, int(iw * scale))
    nh = max(1, int(ih * scale))
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (cell_w, cell_h), bg)
    canvas.paste(resized, ((cell_w - nw) // 2, (cell_h - nh) // 2))
    return canvas


def _build_contact_sheet(
    pil_images,
    labels,
    columns,
    cell_gap,
    bg_color,
    show_labels,
    label_font_size=18,
    label_bar_height=0,
    label_color="#e8e8f0",
    label_bg_color="#1a1a22",
):
    bg = _hex_to_rgb(bg_color)
    if not pil_images:
        return Image.new("RGB", (64, 64), bg)

    cell_w = max(img.width for img in pil_images)
    cell_h = max(img.height for img in pil_images)
    font = _get_label_font(label_font_size)
    label_h = 0
    if show_labels:
        label_h = int(label_bar_height) if int(label_bar_height) > 0 else int(label_font_size) + 12
    label_fill = _hex_to_rgb(label_color, (232, 232, 240))
    label_bg = _hex_to_rgb(label_bg_color, (26, 26, 34))
    gap = max(0, int(cell_gap))
    cols = max(1, min(int(columns), 8))
    n = len(pil_images)
    rows = math.ceil(n / cols)
    cell_total_h = cell_h + label_h

    fitted = []
    for i, img in enumerate(pil_images):
        cell = _fit_letterbox(img, cell_w, cell_h, bg)
        if show_labels:
            bar = Image.new("RGB", (cell_w, label_h), label_bg)
            draw = ImageDraw.Draw(bar)
            pad_x = 8
            text = _fit_label_text(labels[i], font, max(cell_w - pad_x * 2, 8))
            bbox = font.getbbox(text) if text else (0, 0, 0, 0)
            text_h = bbox[3] - bbox[1]
            text_y = max(2, (label_h - text_h) // 2 - bbox[1])
            draw.text((pad_x, text_y), text, fill=label_fill, font=font)
            combined = Image.new("RGB", (cell_w, cell_total_h), bg)
            combined.paste(cell, (0, 0))
            combined.paste(bar, (0, cell_h))
            fitted.append(combined)
        else:
            fitted.append(cell)

    sheet_w = cols * cell_w + (cols + 1) * gap
    sheet_h = rows * cell_total_h + (rows + 1) * gap
    sheet = Image.new("RGB", (max(sheet_w, 64), max(sheet_h, 64)), bg)

    for idx, cell_img in enumerate(fitted):
        r, c = divmod(idx, cols)
        x = gap + c * (cell_w + gap)
        y = gap + r * (cell_total_h + gap)
        sheet.paste(cell_img, (x, y))

    return sheet


def _save_sheet_preview(tensor):
    try:
        import folder_paths  # type: ignore
    except ImportError:
        return None

    pil = Image.fromarray(
        (tensor[0].clamp(0, 1).cpu().numpy() * 255).astype(np.uint8),
        mode="RGB",
    )
    subfolder = "storyboard_suite"
    filename = f"sheet_{uuid.uuid4().hex[:10]}.png"
    output_dir = os.path.join(folder_paths.get_output_directory(), subfolder)
    os.makedirs(output_dir, exist_ok=True)
    pil.save(os.path.join(output_dir, filename), compress_level=4)
    return {"filename": filename, "subfolder": subfolder, "type": "output"}


def _parse_cells_data(raw):
    text = (raw or "").strip()
    if not text:
        return []
    try:
        data = json.loads(text)
        if not isinstance(data, list):
            return []
        cells = []
        for item in data:
            if not isinstance(item, dict):
                continue
            filename = str(item.get("filename", "")).strip()
            if not filename:
                continue
            cells.append({
                "filename": filename,
                "subfolder": str(item.get("subfolder", "")).strip(),
                "type": str(item.get("type", "input")).strip() or "input",
                "label": str(item.get("label", "")).strip(),
            })
        return cells
    except json.JSONDecodeError:
        return []


def _load_cell_image(cell):
    filename = cell.get("filename")
    if not filename:
        return None
    try:
        import folder_paths  # type: ignore
    except ImportError:
        return None

    subfolder = cell.get("subfolder") or ""
    img_type = cell.get("type") or "input"
    if subfolder:
        annotated = f"{subfolder}/{filename} [{img_type}]"
    else:
        annotated = f"{filename} [{img_type}]"

    paths_to_try = []
    try:
        paths_to_try.append(folder_paths.get_annotated_filepath(annotated))
    except Exception:
        pass
    try:
        full = folder_paths.get_full_path(img_type, filename)
        if full:
            paths_to_try.append(full)
    except Exception:
        pass
    try:
        base = folder_paths.get_input_directory()
        if subfolder:
            paths_to_try.append(os.path.join(base, subfolder, filename))
        paths_to_try.append(os.path.join(base, filename))
    except Exception:
        pass

    for path in paths_to_try:
        if path and os.path.isfile(path):
            try:
                with Image.open(path) as img:
                    return img.convert("RGB")
            except Exception:
                continue

    print(f"[StoryboardSuite] не удалось загрузить ячейку: {annotated}")
    return None


def _collect_sheet_images(images=None, **image_slots):
    pil_images = []
    if images is not None:
        pil_images.extend(_tensor_to_pil_list(images))
    for i in range(1, 10):
        slot = image_slots.get(f"image_{i}")
        if slot is not None:
            pil_images.extend(_tensor_to_pil_list(slot))
    return pil_images


class TextTable:
    """Библиотека промптов: name, prompt, negative, weight."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "table_data": ("STRING", {
                    "multiline": True,
                    "default": _default_table_json(),
                }),
                "select": ("STRING", {"default": "portrait"}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "FLOAT")
    RETURN_NAMES = ("prompt", "negative", "name", "weight")
    FUNCTION = "run"
    CATEGORY = "Storyboard"

    def run(self, table_data, select):
        rows = _parse_table_data(table_data)
        row = _select_row(rows, select)
        if not row:
            return ("", "", "", 1.0)
        return (row["prompt"], row["negative"], row["name"], row["weight"])


class FrameGrid:
    """Сетка кадров: выбор одного кадра + width/height для EmptyLatentImage."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "frames_data": ("STRING", {
                    "multiline": True,
                    "default": _default_frames_json(),
                }),
                "select": ("STRING", {"default": "0"}),
                "base_resolution": ("INT", {
                    "default": 1024,
                    "min": 512,
                    "max": 2048,
                    "step": 64,
                }),
                "columns": ("INT", {"default": 3, "min": 1, "max": 6}),
                "default_aspect": (ASPECT_RATIOS, {"default": "16:9"}),
            },
        }

    RETURN_TYPES = (
        "STRING", "STRING", "STRING", "INT", "INT", "INT", "INT", "STRING",
    )
    RETURN_NAMES = (
        "prompt", "name", "aspect_ratio", "frame_index", "frame_count",
        "width", "height", "all_prompts",
    )
    FUNCTION = "run"
    CATEGORY = "Storyboard"

    def run(self, frames_data, select, base_resolution, columns, default_aspect):
        frames = _parse_frames_data(frames_data, default_aspect)
        frame, index = _select_frame(frames, select)
        all_prompts = _all_prompts_string(frames)
        if not frame:
            w, h = _aspect_to_size(default_aspect, base_resolution)
            return ("", "", default_aspect, 0, 0, w, h, all_prompts)
        width, height = _aspect_to_size(frame["aspect"], base_resolution)
        return (
            frame["prompt"],
            frame["name"],
            frame["aspect"],
            index,
            len(frames),
            width,
            height,
            all_prompts,
        )


class FrameGridBatch:
    """Все кадры сториборда списком — для батч-итерации в одном Queue Prompt."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "frames_data": ("STRING", {
                    "multiline": True,
                    "default": _default_frames_json(),
                }),
                "base_resolution": ("INT", {
                    "default": 1024,
                    "min": 512,
                    "max": 2048,
                    "step": 64,
                }),
                "default_aspect": (ASPECT_RATIOS, {"default": "16:9"}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "INT", "INT", "INT")
    RETURN_NAMES = ("prompt", "name", "aspect_ratio", "width", "height", "frame_count")
    OUTPUT_IS_LIST = (True, True, True, True, True, False)
    FUNCTION = "run"
    CATEGORY = "Storyboard"

    def run(self, frames_data, base_resolution, default_aspect):
        frames = _parse_frames_data(frames_data, default_aspect)
        if not frames:
            w, h = _aspect_to_size(default_aspect, base_resolution)
            return ([], [], [], [], [], 0)

        prompts = []
        names = []
        aspects = []
        widths = []
        heights = []
        for frame in frames:
            w, h = _aspect_to_size(frame["aspect"], base_resolution)
            prompts.append(frame["prompt"])
            names.append(frame["name"])
            aspects.append(frame["aspect"])
            widths.append(w)
            heights.append(h)

        return (prompts, names, aspects, widths, heights, len(frames))


class StoryboardSheet:
    """Contact-sheet: батч IMAGE или слоты image_1..9 → один лист-сетка с подписями."""

    @classmethod
    def INPUT_TYPES(cls):
        optional = {
            "images": ("IMAGE",),
            "labels": ("STRING", {"multiline": True, "default": ""}),
        }
        for i in range(1, 10):
            optional[f"image_{i}"] = ("IMAGE",)
        return {
            "required": {
                "columns": ("INT", {"default": 3, "min": 1, "max": 8}),
                "cell_gap": ("INT", {"default": 8, "min": 0, "max": 64}),
                "bg_color": ("STRING", {"default": "#0e0e12"}),
                "show_labels": ("BOOLEAN", {"default": True}),
                **_sheet_label_inputs(),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("sheet",)
    FUNCTION = "run"
    CATEGORY = "Storyboard"
    OUTPUT_NODE = True

    def run(
        self,
        columns,
        cell_gap,
        bg_color,
        show_labels,
        label_font_size,
        label_bar_height,
        label_color,
        label_bg_color,
        images=None,
        labels="",
        image_1=None,
        image_2=None,
        image_3=None,
        image_4=None,
        image_5=None,
        image_6=None,
        image_7=None,
        image_8=None,
        image_9=None,
    ):
        pil_images = _collect_sheet_images(
            images,
            image_1=image_1, image_2=image_2, image_3=image_3,
            image_4=image_4, image_5=image_5, image_6=image_6,
            image_7=image_7, image_8=image_8, image_9=image_9,
        )
        label_list = _parse_labels(labels, len(pil_images))
        sheet = _build_contact_sheet(
            pil_images, label_list, columns, cell_gap, bg_color, show_labels,
            label_font_size, label_bar_height, label_color, label_bg_color,
        )
        tensor = _pil_to_tensor(sheet)
        preview = _save_sheet_preview(tensor)
        ui = {"images": [preview]} if preview else {}
        return {"ui": ui, "result": (tensor,)}


class StoryboardCells:
    """Ячейки с загрузкой картинок → contact-sheet (без генерации в ноде)."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "cells_data": ("STRING", {
                    "multiline": True,
                    "default": "[]",
                }),
                "columns": ("INT", {"default": 3, "min": 1, "max": 8}),
                "cell_gap": ("INT", {"default": 8, "min": 0, "max": 64}),
                "bg_color": ("STRING", {"default": "#0e0e12"}),
                "show_labels": ("BOOLEAN", {"default": True}),
                **_sheet_label_inputs(),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("sheet",)
    FUNCTION = "run"
    CATEGORY = "Storyboard"
    OUTPUT_NODE = True

    def run(
        self,
        cells_data,
        columns,
        cell_gap,
        bg_color,
        show_labels,
        label_font_size,
        label_bar_height,
        label_color,
        label_bg_color,
    ):
        cells = _parse_cells_data(cells_data)
        if not cells:
            print("[StoryboardSuite] StoryboardCells: cells_data пуст — загрузи картинки в ячейки и нажми Queue")
        pil_images = []
        labels = []
        for cell in cells:
            img = _load_cell_image(cell)
            if img is None:
                continue
            pil_images.append(img)
            labels.append(cell.get("label", ""))

        if cells and not pil_images:
            print(
                f"[StoryboardSuite] StoryboardCells: {len(cells)} ячеек в JSON, "
                "но файлы не найдены в input/"
            )

        sheet = _build_contact_sheet(
            pil_images, labels, columns, cell_gap, bg_color, show_labels,
            label_font_size, label_bar_height, label_color, label_bg_color,
        )
        tensor = _pil_to_tensor(sheet)
        preview = _save_sheet_preview(tensor)
        ui = {"images": [preview]} if preview else {}
        return {"ui": ui, "result": (tensor,)}


NODE_CLASS_MAPPINGS = {
    "TextTable": TextTable,
    "FrameGrid": FrameGrid,
    "FrameGridBatch": FrameGridBatch,
    "StoryboardSheet": StoryboardSheet,
    "StoryboardCells": StoryboardCells,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TextTable": "Storyboard · Text Table",
    "FrameGrid": "Storyboard · Frame Grid",
    "FrameGridBatch": "Storyboard · Frame Grid (Batch)",
    "StoryboardSheet": "Storyboard · Sheet",
    "StoryboardCells": "Storyboard · Cells",
}
