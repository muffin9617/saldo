"""Local, read-only brand review; no credentials or send endpoints are exposed."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

root = Path(__file__).resolve().parent.parent
files = {
    '/': ('emails/preview.html', 'text/html; charset=utf-8'),
    '/brand': ('emails/brand-preview.html', 'text/html; charset=utf-8'),
    '/preview.css': ('emails/preview.css', 'text/css'),
    '/preview.js': ('emails/preview.js', 'text/javascript'),
    '/templates.js': ('supabase/functions/saldo-notifications/email-templates.js', 'text/javascript'),
    '/auth-templates.mjs': ('emails/auth-templates.mjs', 'text/javascript'),
    '/supabase/functions/saldo-notifications/email-templates.js': ('supabase/functions/saldo-notifications/email-templates.js', 'text/javascript'),
    '/brand.png': ('dist/email-logo.png', 'image/png'),
    '/brand-180.png': ('dist/apple-touch-icon.png', 'image/png'),
    '/brand-32.png': ('dist/favicon-32.png', 'image/png'),
    '/brand-maskable.png': ('dist/icon-maskable-512.png', 'image/png'),
}

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        entry = files.get(urlsplit(self.path).path)
        if not entry:
            self.send_error(404)
            return
        path, mime = entry
        data = (root / path).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', len(data))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; frame-src 'self' about:; connect-src 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(data)

ThreadingHTTPServer(('127.0.0.1', 4176), Handler).serve_forever()
