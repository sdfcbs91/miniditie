"""本地预览：固定服务项目根目录，并禁用缓存以便修改后刷新立即生效。"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
from urllib.parse import urlsplit


class PreviewHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # 预览首页直接进入广佛地图；/index.html 仍保留原始主菜单。
        url = urlsplit(self.path)
        if url.path == '/' and (not url.query or url.query == 'preview=world'):
            self.send_response(302)
            self.send_header('Location', '/?preview=guangfo')
            self.end_headers()
            return
        # 开发预览始终返回最新文件，不让旧的条件请求得到 304。
        for header in ('If-Modified-Since', 'If-None-Match'):
            if header in self.headers:
                del self.headers[header]
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(PreviewHandler, directory=str(root))
    with ThreadingHTTPServer(('0.0.0.0', port), handler) as server:
        print(f'Previewing {root} on port {port}', flush=True)
        server.serve_forever()
