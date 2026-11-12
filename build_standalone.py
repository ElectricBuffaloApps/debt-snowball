#!/usr/bin/env python3
"""Build the standalone Debt Snowball web app from the master page.

Master:  debt-snowball.html  (also what gets published to claude.ai)
Output:  docs/  (index.html, manifest, icons, service worker, version.json, .nojekyll). GitHub Pages serves main /docs.
         Anything else found in docs/ after the build is removed.

Run:  python3 Finance/debt-snowball/build_standalone.py
Never edit docs/ by hand: change the master, then run this again.
"""
import hashlib
import json
import shutil
import struct
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
MASTER = HERE / "debt-snowball.html"
OUT = HERE / "docs"
# Everything a build writes into OUT; anything else found there afterwards is removed.
WRITTEN = {"index.html", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png",
           "manifest.webmanifest", "version.json", "sw.js", ".nojekyll"}

NAVY = (0x0F, 0x2A, 0x3F)
ICE = (0x8F, 0xD0, 0xF7)
BG = "#ECF1F4"


# ---------- icons: three growing snowballs on navy, drawn without any libraries ----------
def png_bytes(w, h, rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rows)
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def icon(size, safe=0.62):
    # circles bottom-aligned, sizes 6 / 9 / 14 like the page's brand mark, fitted inside the safe zone
    units = [6, 9, 14]
    gap = 3
    total = sum(units) + gap * 2
    scale = size * safe / total
    base_y = size / 2 + max(units) * scale / 2
    x = (size - total * scale) / 2
    circles = []
    for u in units:
        r = u * scale / 2
        circles.append((x + r, base_y - r, r))
        x += (u + gap) * scale
    ss = 4  # supersampling for smooth edges
    rows = []
    for py in range(size):
        row = []
        for px in range(size):
            hit = 0
            for sy in range(ss):
                for sx in range(ss):
                    fx = px + (sx + 0.5) / ss
                    fy = py + (sy + 0.5) / ss
                    for cx, cy, r in circles:
                        if (fx - cx) ** 2 + (fy - cy) ** 2 <= r * r:
                            hit += 1
                            break
            a = hit / (ss * ss)
            row.extend(round(NAVY[i] + (ICE[i] - NAVY[i]) * a) for i in range(3))
        rows.append(row)
    return png_bytes(size, size, rows)


# ---------- page ----------
RESET = ("<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);"
         "padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,-apple-system,sans-serif}"
         "img{max-width:100%}[hidden]{display:none!important}</style>")

SW_REGISTER = ("<script>if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){"
               "addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){});});}</script>")


# Tells an open app that a newer build is live. iPhone home-screen apps are resumed, not reloaded,
# so without this the page on screen stays the old one. The reload goes to a new URL to get past
# GitHub Pages' ten-minute cache.
UPDATE_CHECK = """<script>(function(){
var BUILD='__BUILD__',shown=false;
function check(){
  if(shown||location.protocol==='file:')return;
  fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(function(r){return r.json();}).then(function(v){
    if(shown||!v||!v.build||v.build===BUILD)return;
    shown=true;
    var b=document.createElement('button');
    b.type='button';b.className='btn primary';b.id='updateReady';b.textContent='New version ready. Tap to update';
    b.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:9;box-shadow:var(--shadow)';
    b.addEventListener('click',function(){location.replace('./?v='+encodeURIComponent(v.build));});
    document.body.appendChild(b);
  }).catch(function(){});
}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')check();});
addEventListener('pageshow',check);
})();</script>"""


def build():
    src = MASTER.read_text(encoding="utf-8")
    split = src.index('<div class="wrap">')
    head_part, body_part = src[:split].strip(), src[split:].strip()
    page = (
        '<!doctype html>\n<html lang="en-GB">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="theme-color" content="#0F2A3F">\n'
        '<meta name="description" content="Plan and track paying off your debts: snowball or avalanche, 0% deadlines and transfer savings. Your numbers stay on your device.">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-title" content="Snowball">\n'
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
        '<link rel="manifest" href="manifest.webmanifest">\n'
        '<link rel="apple-touch-icon" href="apple-touch-icon.png">\n'
        '<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">\n'
        + RESET + "\n" + head_part + "\n</head>\n<body>\n" + body_part + "\n" + SW_REGISTER + "\n__UPDATE_CHECK__\n</body>\n</html>\n"
    )
    # the build id is worked out before it is written into the page, so the page can carry its own id
    version = hashlib.sha1(page.encode("utf-8")).hexdigest()[:10]
    page = page.replace("__UPDATE_CHECK__", UPDATE_CHECK.replace("__BUILD__", version))

    OUT.mkdir(exist_ok=True)
    (OUT / "index.html").write_text(page, encoding="utf-8")

    for name, size, safe in [("apple-touch-icon.png", 180, 0.62), ("icon-192.png", 192, 0.62),
                             ("icon-512.png", 512, 0.62), ("icon-maskable-512.png", 512, 0.5)]:
        (OUT / name).write_bytes(icon(size, safe))

    manifest = {
        "name": "Debt Snowball",
        "short_name": "Snowball",
        "description": "Plan and track paying off your debts.",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "background_color": BG,
        "theme_color": "#0F2A3F",
        "icons": [
            {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    (OUT / "manifest.webmanifest").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    # network first, so updates show straight away; the cache is only for opening it offline
    (OUT / "version.json").write_text(json.dumps({"build": version}), encoding="utf-8")
    files = ["./", "index.html", "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png"]
    sw = f"""var CACHE = 'debt-snowball-{version}';
var FILES = {json.dumps(files)};
self.addEventListener('install', function(e){{
  e.waitUntil(caches.open(CACHE).then(function(c){{ return c.addAll(FILES); }}));
  self.skipWaiting();
}});
self.addEventListener('activate', function(e){{
  e.waitUntil(caches.keys().then(function(keys){{
    return Promise.all(keys.filter(function(k){{ return k !== CACHE; }}).map(function(k){{ return caches.delete(k); }}));
  }}).then(function(){{ return self.clients.claim(); }}));
}});
self.addEventListener('fetch', function(e){{
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request.url, {{cache: 'no-store'}}).then(function(res){{
    var copy = res.clone();
    caches.open(CACHE).then(function(c){{ c.put(e.request, copy); }});
    return res;
  }}).catch(function(){{
    return caches.match(e.request).then(function(m){{ return m || caches.match('index.html'); }});
  }}));
}});
"""
    (OUT / "sw.js").write_text(sw, encoding="utf-8")
    # Pages must serve the files as they are and never run Jekyll; not part of the build id
    (OUT / ".nojekyll").write_text("", encoding="utf-8")
    removed = remove_strays(OUT, WRITTEN)
    print(f"Built {OUT} (version {version}): " + ", ".join(sorted(p.name for p in OUT.iterdir())))
    if removed:
        print("Removed files this run did not write: " + ", ".join(removed))


def remove_strays(folder, keep):
    """Delete anything in the output folder this run did not write (an iCloud "name 2.ext" copy,
    a file from an older build), so it can never be committed. The folder itself is kept and
    cleared in place, never deleted and renamed (iCloud)."""
    removed = []
    for path in sorted(folder.iterdir()):
        if path.name in keep:
            continue
        if path.is_dir() and not path.is_symlink():
            shutil.rmtree(path)
        else:
            path.unlink()
        removed.append(path.name)
    return removed


if __name__ == "__main__":
    build()
