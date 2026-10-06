"""Public entry points for portrait piece editing and rendering."""

from piece_routes import register
from piece_render import render_project

# Shared services remain accessible to existing callers and diagnostics.
import effects
import segmentation
from piece_models import validate_settings

__all__ = ["register", "render_project", "validate_settings", "effects", "segmentation"]
