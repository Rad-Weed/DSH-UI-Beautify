"""实测：一段「缓慢推近」的循环做成动态 WebP 大概多大（决定体积预算用）。"""
import io
import os
from pathlib import Path

from PIL import Image

# 相对本脚本定位：<包根>/assets —— 换机器、换目录、别人克隆后都能直接跑。
ASSETS = str(Path(__file__).resolve().parents[1] / "assets")


def ken_burns_frames(path, width, frames, zoom=1.08):
    with Image.open(path) as src:
        src.load()
        base = src.convert("RGB")
        height = round(base.height * width / base.width)
        base = base.resize((width, height), Image.LANCZOS)
        out = []
        for i in range(frames):
            t = i / (frames - 1)
            # 轻微推近 + 一点点平移：最"便宜"的全屏呼吸感
            scale = 1 + (zoom - 1) * t
            w, h = round(width * scale), round(height * scale)
            frame = base.resize((w, h), Image.LANCZOS)
            left = round((w - width) * (0.5 + 0.4 * (t - 0.5)))
            top = round((h - height) * (0.5 - 0.3 * (t - 0.5)))
            out.append(frame.crop((left, top, left + width, top + height)))
        return out, out[0].size


def asset_path(stem):
    """按"文件主干名"找图：优先仓库内的 WebP（v0.7.0 起），也兼容旧的 PNG。"""
    for ext in (".webp", ".png"):
        candidate = os.path.join(ASSETS, stem + ext)
        if os.path.exists(candidate):
            return candidate
    return None


for stem, width, frames, fps in (
    ("deepseek-bw-nowater", 1600, 12, 12),
    ("deepseek-bw-nowater", 2560, 12, 12),
    ("deepseek-4k", 2560, 12, 12),
):
    path = asset_path(stem)
    if not path:
        print("missing asset:", stem, "(在", ASSETS, "里找 .webp/.png)")
        continue
    name = os.path.basename(path)
    frames_img, size = ken_burns_frames(path, width, frames)
    for quality in (70, 80, 90):
        buf = io.BytesIO()
        frames_img[0].save(
            buf,
            format="WEBP",
            save_all=True,
            append_images=frames_img[1:],
            duration=round(1000 / fps),
            loop=0,
            quality=quality,
            method=6,
        )
        print(f"{name} {size[0]}x{size[1]}  {frames}帧@{fps}fps  q{quality}: {buf.tell()/1048576:.2f} MB")
    # 关键：动画里的「同一区域」是否真的在动（体积主要取决于帧间差异）
    diff = 0
    a, b = frames_img[0].tobytes(), frames_img[-1].tobytes()
    diff = sum(1 for x, y in zip(a[:2_000_000], b[:2_000_000]) if x != y)
    print(f"    首末帧像素差异: {diff/2_000_000*100:.1f}%")
    print()
