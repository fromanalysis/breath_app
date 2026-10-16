"""Builds the single-file page twice: one for the artifact (no html/head wrapper) and one for GitHub Pages."""
from pathlib import Path

root = Path(__file__).parent
engine = (root / "src/engine.js").read_text()
app = (root / "src/app.js").read_text()
body = (root / "src/body.html").read_text()
assert "</script" not in engine and "</script" not in app
page = body.replace("/*ENGINE*/", engine).replace("/*APP*/", app)

(root / "dist").mkdir(exist_ok=True)
(root / "dist/artifact.html").write_text(page)

head_meta = (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<meta name="description" content="A breathing pacer that plays chords with your breath.">\n'
    '<link rel="manifest" href="manifest.webmanifest">\n'
    '<link rel="icon" href="icon.svg" type="image/svg+xml">\n'
    '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box}body{margin:0}[hidden]{display:none!important}</style>\n'
)
# Everything before the first <div> belongs in <head>.
split = page.index('<div id="app">')
site = head_meta + page[:split] + "</head>\n<body>\n" + page[split:] + "</body>\n</html>\n"
(root / "index.html").write_text(site)
print("artifact.html", len(page), "bytes; site/index.html", len(site), "bytes")
