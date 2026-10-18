"""只读体检：把现有两张静态图的体积账算清楚（PNG vs WebP vs AVIF）。"""
import io
import os
from pathlib import Path

from PIL import Image, features

# 相对本脚本定位：<包根>/assets —— 换机器、换目录、别人克隆后都能直接跑。
ASSETS = str(Path(__file__).resolve().parents[1] / "assets")

print("webp support :", features.check("webp"))
print("webp_anim    :", features.check("webp_anim"))
try:
    print("avif support :", features.check("avif"))
except Exception as exc:  # pragma: no cover
    print("avif support : n/a", exc)
print()

for name in sorted(os.listdir(ASSETS)):
    if not name.lower().endswith((".png", ".webp")):
        continue
    path = os.path.join(ASSETS, name)
    raw = os.path.getsize(path)
    with Image.open(path) as im:
        im.load()
        mode, size = im.mode, im.size
        rows = []
        for label, kwargs in (
            ("webp q90", {"format": "WEBP", "quality": 90, "method": 6}),
            ("webp q80", {"format": "WEBP", "quality": 80, "method": 6}),
            ("webp lossless", {"format": "WEBP", "lossless": True, "method": 6}),
            ("avif q60", {"format": "AVIF", "quality": 60}),
            ("avif q45", {"format": "AVIF", "quality": 45}),
        ):
            buf = io.BytesIO()
            try:
                im.save(buf, **kwargs)
            except Exception as exc:
                rows.append((label, None, str(exc)[:60]))
                continue
            rows.append((label, buf.tell(), ""))
        src_label = "WebP" if name.lower().endswith(".webp") else "PNG"
        print(f"{name}  {mode} {size[0]}x{size[1]}  {src_label}={raw/1048576:.2f} MB（仓库内实物）")
        for label, out, err in rows:
            if out is None:
                print(f"    {label:<14} — 不可用：{err}")
            else:
                print(f"    {label:<14} {out/1048576:>6.2f} MB  ({out/raw*100:>5.1f}% of 实物)")
        # 顺带算一下「降到 1600 宽」的动图会是什么量级
        small = im.resize((1600, round(size[1] * 1600 / size[0])), Image.LANCZOS)
        buf = io.BytesIO()
        small.convert("RGB").save(buf, format="WEBP", quality=80, method=6)
        print(f"    1600px 宽 webp q80: {buf.tell()/1048576:.2f} MB（单帧）")
        print()
