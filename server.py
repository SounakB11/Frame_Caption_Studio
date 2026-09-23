"""Local-only caption studio. Uploaded media is processed in a temporary file."""
from __future__ import annotations

import json
import math
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).parent
WEB = ROOT / "web"
MAX_UPLOAD = 800 * 1024 * 1024
ALLOWED = {".mp4", ".mov", ".m4v", ".mp3", ".m4a", ".wav", ".webm"}
MIME = {".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml"}


def transcribe(path: Path, size: str) -> dict:
    from faster_whisper import WhisperModel

    model = WhisperModel(size, device="cpu", compute_type="int8")
    segments, info = model.transcribe(str(path), beam_size=5, vad_filter=True)
    captions = []
    for segment in segments:
        content = segment.text.strip()
        if content and math.isfinite(segment.start) and math.isfinite(segment.end) and segment.end > segment.start:
            captions.append({"start": round(segment.start, 3), "end": round(segment.end, 3), "text": content})
    return {"segments": captions, "language": info.language, "duration": info.duration}


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, payload: dict) -> None:
        content = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        name = "index.html" if path == "/" else path.lstrip("/")
        candidate = (WEB / name).resolve()
        if WEB.resolve() not in candidate.parents or not candidate.is_file():
            self.send_error(404)
            return
        content = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(candidate.suffix, "application/octet-stream") + "; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/transcribe":
            self.send_json(404, {"error": "Endpoint not found."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if not 0 < length <= MAX_UPLOAD:
            self.send_json(413, {"error": "Choose a media file up to 800 MB."})
            return
        suffix = Path(self.headers.get("X-File-Name", "recording.mp4")).suffix.lower()
        if suffix not in ALLOWED:
            self.send_json(415, {"error": "Supported formats: MP4, MOV, M4V, MP3, M4A, WAV, and WebM."})
            return
        size = self.headers.get("X-Model-Size", "base")
        if size not in {"tiny", "base", "small"}:
            self.send_json(400, {"error": "Choose tiny, base, or small model."})
            return
        with tempfile.TemporaryDirectory(prefix="framecaption-") as folder:
            temp = Path(folder) / ("recording" + suffix)
            try:
                with temp.open("wb") as output:
                    remaining = length
                    while remaining:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        if not chunk:
                            raise ValueError("Upload was interrupted.")
                        output.write(chunk)
                        remaining -= len(chunk)
                result = transcribe(temp, size)
            except ImportError:
                self.send_json(503, {"error": "Transcription dependency missing. Run pip install -r requirements.txt, then restart."})
                return
            except Exception as exc:
                self.send_json(422, {"error": f"Could not transcribe the file: {exc}"})
                return
        self.send_json(200, result)


if __name__ == "__main__":
    print("Frame Caption Studio is available at http://127.0.0.1:8766", flush=True)
    print("Media stays on this computer. First use downloads the selected transcription model.")
    ThreadingHTTPServer(("127.0.0.1", 8766), Handler).serve_forever()
