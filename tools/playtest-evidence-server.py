"""Local-only screenshot receiver for browser tools without a file-save API.

Run from the repository root. Submit screenshot bytes through the displayed
browser form; never use it for account credentials or private user screenshots.
"""
import argparse
import base64
import html
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import re
import secrets
from urllib.parse import parse_qs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4191)
    args = parser.parse_args()
    origin = f'http://127.0.0.1:{args.port}'
    nonce = '/' + secrets.token_urlsafe(24)
    folder = Path(__file__).resolve().parents[1] / 'docs/playtests/evidence'
    folder.mkdir(parents=True, exist_ok=True)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def page(self, body, status=200):
            self.send_response(status)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(('<!doctype html><meta charset="utf-8"><title>Playtest evidence</title>' + body).encode())

        def do_GET(self):
            if self.path != nonce:
                return self.page('Not found', 404)
            self.page('<h1>Save game screenshot evidence</h1><p>Local game screenshots only.</p>'
                      '<form method="post"><label>Evidence name <input name="name" required></label>'
                      '<label>Image bytes <input type="password" name="image" required autocomplete="off"></label>'
                      '<button type="submit">Save evidence</button></form>')

        def do_POST(self):
            if self.path != nonce or self.headers.get('Origin') != origin:
                return self.page('Request not accepted', 403)
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 8 * 1024 * 1024:
                    raise ValueError()
                fields = parse_qs(self.rfile.read(size).decode(), strict_parsing=True)
                name = fields['name'][0]
                if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', name):
                    raise ValueError()
                raw = base64.b64decode(fields['image'][0], validate=True)
                suffix = '.jpg' if raw.startswith(b'\xff\xd8\xff') else '.png' if raw.startswith(b'\x89PNG\r\n\x1a\n') else None
                if suffix is None or len(raw) > 5 * 1024 * 1024:
                    raise ValueError()
                path = folder / (name + '-' + secrets.token_hex(3) + suffix)
                with path.open('xb') as output:
                    output.write(raw)
            except (ValueError, KeyError, UnicodeError):
                return self.page('Invalid screenshot or name', 400)
            self.page('<h1>Evidence saved</h1><p>' + html.escape(str(path)) + '</p>')
            print('Saved ' + str(path), flush=True)

    print('Evidence upload form: ' + origin + nonce, flush=True)
    HTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
