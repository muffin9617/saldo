"""Isolated prototype: serves only allowlisted files, no API/proxy/write routes."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
root=Path(__file__).resolve().parent
files={'/':(root/'index.html','text/html'),'/index.html':(root/'index.html','text/html'),'/prototype.mjs':(root/'app.mjs','text/javascript'),'/model.mjs':(root/'model.mjs','text/javascript'),'/fixtures.mjs':(root/'fixtures.mjs','text/javascript'),'/prototype.css':(root/'style.css','text/css')}
for name,mime in [('saldo.css','text/css'),('gestures.js','text/javascript'),('navigation.js','text/javascript'),('icon.svg','image/svg+xml')]:files['/'+name]=(root.parent/'dist'/name,mime)
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        entry=files.get(urlsplit(self.path).path)
        if not entry:self.send_error(404);return
        path,mime=entry;data=path.read_bytes()
        self.send_response(200);self.send_header('Content-Type',mime+'; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'");self.end_headers();self.wfile.write(data)
ThreadingHTTPServer(('127.0.0.1',4177),Handler).serve_forever()
