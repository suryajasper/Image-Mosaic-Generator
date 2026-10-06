"""Loopback-only application entry point. Photos never leave this computer."""

from urllib.parse import urlparse
from flask import Flask, abort, jsonify, request, send_from_directory
import pieces
import background
from PIL import Image
from storage import ROOT, DATA, CACHE, HEIC, db, initialize_database
from file_identity import signature, identity
from conversions import converted_path
from photo_service import photo, open_photo
from portrait_service import foreground_portrait
from matching import match_tiles
import conversions
import library_routes
import portrait_routes
import mosaic_routes

initialize_database()
app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024


@app.before_request
def local_only():
    if request.remote_addr not in {"127.0.0.1", "::1"} or urlparse(
        "http://" + request.host
    ).hostname not in {"127.0.0.1", "localhost", "::1"}:
        abort(403)
    origin = request.headers.get("Origin")
    if origin and urlparse(origin).hostname not in {"localhost", "127.0.0.1", "::1"}:
        abort(403)
    if request.headers.get("Sec-Fetch-Site") == "cross-site":
        abort(403)


@app.after_request
def private_response(response):
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.errorhandler(OSError)
def file_error(error):
    return jsonify(
        error="A local file could not be read or saved. Check the folder and file permissions."
    ), 400


@app.errorhandler(ValueError)
def invalid(error):
    return jsonify(error=str(error)), 400


@app.errorhandler(404)
def missing(error):
    return jsonify(
        error="Photo or file not found. Check that the local folder is still available."
    ), 404


@app.get("/")
@app.get("/<path:path>")
def frontend(path="index.html"):
    return send_from_directory(ROOT / "dist", path)


app.register_blueprint(library_routes.bp)
app.register_blueprint(portrait_routes.bp)
app.register_blueprint(mosaic_routes.bp)
pieces.register(app, db, DATA, open_photo, signature, foreground_portrait)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8814, debug=False, threaded=True)

__all__ = [
    "app",
    "db",
    "photo",
    "open_photo",
    "converted_path",
    "signature",
    "identity",
    "CACHE",
    "HEIC",
    "Image",
    "pieces",
    "background",
    "conversions",
    "match_tiles",
]
