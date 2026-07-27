"""
Anvil server module to self-host the MiniCraft static build.

Setup
-----
1. Run `npm run build` in this project so the `dist/` folder exists.
2. Create a new Anvil app (blank template) and open a Server Module.
3. Paste this entire file into the Server Module.
4. Publish the app. Your game will be available at your Anvil app URL.

How it works
-----------
Anvil Server Modules run server-side Python. We use the @anvil.server.route
decorator to serve the built static files from the `dist/` directory, so the
game loads directly from your Anvil app URL just like any hosted website.

Notes
-----
- This serves the prebuilt frontend only. Game saves are stored in the
  browser via Supabase, which is already configured in the built app.
- To update the hosted game after changing code, rebuild (`npm run build`)
  and re-upload the contents of `dist/` to the Anvil app's Media library
  (or the server_files folder, depending on your setup).
"""

import os
import anvil.server

# Resolve the dist directory relative to this file.
# If you upload the dist/ contents into Anvil's server_files/static folder,
# point DIST_DIR at that folder instead.
HERE = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(HERE, "dist")

# Fallback for Anvil's server_files convention.
if not os.path.isdir(DIST_DIR):
    DIST_DIR = os.path.join(HERE, "server_files", "static")

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".map": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}


def _read_file(rel_path: str):
    """Return (bytes, content_type) for a file under dist, or None if missing."""
    safe_path = os.path.normpath(rel_path).lstrip("/\\")
    full = os.path.join(DIST_DIR, safe_path)
    # Prevent path traversal escaping the dist directory.
    if not os.path.abspath(full).startswith(os.path.abspath(DIST_DIR)):
        return None
    if not os.path.isfile(full):
        return None
    with open(full, "rb") as f:
        data = f.read()
    ext = os.path.splitext(rel_path)[1].lower()
    content_type = MIME_TYPES.get(ext, "application/octet-stream")
    return data, content_type


@anvil.server.route("/")
def serve_index(**kwargs):
    result = _read_file("index.html")
    if result is None:
        return anvil.server.HttpResponse(
            status=404,
            body="index.html not found. Run `npm run build` and upload the dist/ folder.",
            content_type="text/plain; charset=utf-8",
        )
    data, content_type = result
    return anvil.server.HttpResponse(
        status=200,
        body=data,
        content_type=content_type,
    )


@anvil.server.route("/assets/<path:path>")
def serve_assets(path, **kwargs):
    result = _read_file(os.path.join("assets", path))
    if result is None:
        return anvil.server.HttpResponse(
            status=404,
            body=f"Not found: /assets/{path}",
            content_type="text/plain; charset=utf-8",
        )
    data, content_type = result
    return anvil.server.HttpResponse(
        status=200,
        body=data,
        content_type=content_type,
    )


@anvil.server.route("/<path:path>")
def serve_static(path, **kwargs):
    # Try the exact path first (e.g. /vite.svg).
    result = _read_file(path)
    # Fall back to index.html for client-side routing (SPA fallback).
    if result is None:
        result = _read_file("index.html")
    if result is None:
        return anvil.server.HttpResponse(
            status=404,
            body=f"Not found: /{path}",
            content_type="text/plain; charset=utf-8",
        )
    data, content_type = result
    return anvil.server.HttpResponse(
        status=200,
        body=data,
        content_type=content_type,
    )
