from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs("icons", exist_ok=True)

def make_icon(size, path):
    img = Image.new("RGB", (size, size), "#0f766e")
    draw = ImageDraw.Draw(img)
    # circulo de fondo claro
    margin = size * 0.12
    draw.ellipse([margin, margin, size - margin, size - margin], fill="#14b8a6")
    # emoji/texto simple: dibujar un "bote" estilizado
    text = "🥫"
    try:
        font = ImageFont.truetype("seguiemj.ttf", int(size * 0.5))
        draw.text((size / 2, size / 2), text, font=font, anchor="mm", embedded_color=True)
    except Exception:
        # fallback: letra M
        font = ImageFont.truetype("arialbd.ttf", int(size * 0.5))
        draw.text((size / 2, size / 2), "MD", font=font, anchor="mm", fill="white")
    img.save(path)

make_icon(192, "icons/icon-192.png")
make_icon(512, "icons/icon-512.png")
print("done")
