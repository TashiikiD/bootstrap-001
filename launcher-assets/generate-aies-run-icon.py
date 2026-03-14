from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
PNG_PATH = ROOT / "aies-run-launcher.png"
ICO_PATH = ROOT / "aies-run-launcher.ico"
SIZE = 1024


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("C:/Windows/Fonts/calibrib.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def vertical_gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        for x in range(size):
            pixels[x, y] = (*color, 255)
    return image


def draw_icon() -> Image.Image:
    base = vertical_gradient(SIZE, (8, 12, 28), (2, 5, 14))

    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((120, 120, SIZE - 120, SIZE - 120), outline=(32, 220, 255, 160), width=32)
    glow_draw.ellipse((180, 180, SIZE - 180, SIZE - 180), outline=(152, 92, 255, 110), width=16)
    glow = glow.filter(ImageFilter.GaussianBlur(12))
    base.alpha_composite(glow)

    draw = ImageDraw.Draw(base)
    cyan = (38, 224, 255, 255)
    magenta = (185, 92, 255, 255)
    panel_bg = (12, 18, 36, 230)
    panel_edge = (98, 188, 255, 255)
    text_main = (238, 247, 255, 255)
    text_dim = (145, 190, 255, 255)

    panel = (240, 300, SIZE - 240, SIZE - 250)
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((panel[0] + 10, panel[1] + 18, panel[2] + 10, panel[3] + 18), radius=54, fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    base.alpha_composite(shadow)

    draw.rounded_rectangle(panel, radius=54, fill=panel_bg, outline=panel_edge, width=6)
    draw.rounded_rectangle((panel[0], panel[1], panel[2], panel[1] + 74), radius=54, fill=(16, 28, 54, 250))
    for index, color in enumerate(((255, 96, 92, 255), (255, 196, 84, 255), (38, 224, 129, 255))):
        x = panel[0] + 42 + index * 36
        draw.ellipse((x, panel[1] + 26, x + 18, panel[1] + 44), fill=color)

    draw.arc((92, 92, SIZE - 92, SIZE - 92), start=210, end=18, fill=cyan, width=20)
    draw.polygon([(SIZE - 128, 188), (SIZE - 82, 168), (SIZE - 102, 214)], fill=cyan)

    big_font = load_font(250)
    small_font = load_font(92)
    tag_font = load_font(54)

    draw.text((325, 392), "A>", font=big_font, fill=text_main)
    draw.text((332, 636), "RUN", font=small_font, fill=magenta)
    draw.text((328, 735), "PI · WT · WEB", font=tag_font, fill=text_dim)

    line_y = 823
    draw.line((320, line_y, SIZE - 320, line_y), fill=(60, 170, 255, 200), width=6)
    draw.line((320, line_y + 24, SIZE - 410, line_y + 24), fill=(160, 100, 255, 160), width=4)
    return base


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    image = draw_icon()
    image.save(PNG_PATH)
    image.save(ICO_PATH, sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print(f"Wrote {PNG_PATH}")
    print(f"Wrote {ICO_PATH}")


if __name__ == "__main__":
    main()
