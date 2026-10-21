import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import db


def serve(statuses):
    """Lokaler Server, der der Reihe nach die angegebenen Statuscodes liefert."""
    calls = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
            status = statuses[min(len(calls), len(statuses) - 1)]
            calls.append(status)
            body = json.dumps([{"id": 7}]).encode()
            self.send_response(status)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, calls


def test_retries_bad_gateway(monkeypatch):
    monkeypatch.setattr(db, "RETRY", db.RETRY.new(backoff_factor=0))
    server, calls = serve([502, 503, 201])
    try:
        sb = db.Supabase(f"http://127.0.0.1:{server.server_port}", "sb_secret_x")
        assert sb.insert("sync_runs", {"trigger": "schedule"}) == {"id": 7}
        assert calls == [502, 503, 201]
    finally:
        server.shutdown()


def test_gives_up_after_four_retries(monkeypatch):
    monkeypatch.setattr(db, "RETRY", db.RETRY.new(backoff_factor=0))
    server, calls = serve([502])
    try:
        sb = db.Supabase(f"http://127.0.0.1:{server.server_port}", "sb_secret_x")
        try:
            sb.insert("sync_runs", {"trigger": "schedule"})
            raise AssertionError("HTTPError erwartet")
        except db.requests.HTTPError:
            pass
        assert len(calls) == 5
    finally:
        server.shutdown()
