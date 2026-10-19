#!/usr/bin/env python3
import http.server, socketserver, os
ROOT = os.path.join(os.path.dirname(__file__), ".preview-root")
os.chdir(ROOT)
PORT = 8095
with socketserver.TCPServer(("0.0.0.0", PORT), http.server.SimpleHTTPRequestHandler) as httpd:
    print(f"photo preview http://0.0.0.0:{PORT}/photo/", flush=True)
    httpd.serve_forever()
