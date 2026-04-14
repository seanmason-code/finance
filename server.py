#!/usr/bin/env python3
"""Simple dev server with Claude API proxy to avoid CORS issues."""

import json
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress noisy access logs
        pass

    def do_OPTIONS(self):
        self.send_cors()

    def do_POST(self):
        if self.path == '/api/claude':
            self.proxy_claude()
        else:
            self.send_error(404)

    def proxy_claude(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        api_key = self.headers.get('X-Api-Key', '')

        req = urllib.request.Request(
            'https://api.anthropic.com/v1/messages',
            data=body,
            headers={
                'Content-Type': 'application/json',
                'x-api-key': api_key,
                'anthropic-version': '2023-06-01',
            },
            method='POST'
        )

        try:
            with urllib.request.urlopen(req) as resp:
                data = resp.read()
                self.send_cors(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_cors(e.code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(data)

    def send_cors(self, code=200):
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key')


if __name__ == '__main__':
    port = 8090
    print(f'Finance app running at http://localhost:{port}')
    HTTPServer(('', port), Handler).serve_forever()
