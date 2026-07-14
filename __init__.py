"""Storyboard Suite — pre-production ноды для ComfyUI."""

from .nodes import (
    FrameGrid,
    FrameGridBatch,
    StoryboardCells,
    StoryboardSheet,
    TextTable,
    NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS,
)

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
    "TextTable",
    "FrameGrid",
    "FrameGridBatch",
    "StoryboardSheet",
    "StoryboardCells",
]

WEB_DIRECTORY = "./web"
