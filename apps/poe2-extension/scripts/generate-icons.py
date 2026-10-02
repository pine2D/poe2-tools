"""生成原创几何「中」字图标。仅重绘时需要 Python 与 Pillow；构建直接复制 PNG。"""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parent.parent / 'public' / 'icons'
out.mkdir(parents=True, exist_ok=True)
scale = 4
image = Image.new('RGBA', (128 * scale, 128 * scale))
draw = ImageDraw.Draw(image)
def box(coords, color, radius=0):
    coords = tuple(value * scale for value in coords)
    if radius:
        draw.rounded_rectangle(coords, radius=radius * scale, fill=color)
    else:
        draw.rectangle(coords, fill=color)

box((4, 4, 123, 123), '#192330', 26)
box((26, 35, 101, 89), '#e4c78a', 5)
box((37, 46, 90, 78), '#192330')
box((58, 22, 69, 105), '#e4c78a')
for size in (16, 32, 48, 128):
    image.resize((size, size), Image.Resampling.LANCZOS).save(out / f'icon-{size}.png')
