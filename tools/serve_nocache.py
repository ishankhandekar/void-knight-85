#!/usr/bin/env python3
"""Static file server that disables caching.

The default `python3 -m http.server` sends no cache headers, which lets the
browser hold onto stale ES modules across reloads. This server sends explicit
no-store headers so every reload fetches fresh source — needed when iterating
on the game's JS modules during development.
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', PORT), NoCacheHandler) as httpd:
        print(f'Serving (no-cache) on http://localhost:{PORT}')
        httpd.serve_forever()
