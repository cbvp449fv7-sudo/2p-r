#!/usr/bin/env python3
"""
تجهيز صور المنتجات: قصّ إلى نسبة ٤:٥ + تحسين خفيف + حفظ مقاسين.

    python3 scripts/prepare-images.py صورة.jpg as-06-green-floral

ينتج داخل assets/images/products/ :
    as-06-green-floral.jpg      (1000 بكسل عرضًا)
    as-06-green-floral-sm.jpg   (500 بكسل عرضًا)

يتطلب:  pip install pillow
"""
import sys, os
from PIL import Image, ImageOps, ImageEnhance

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'images', 'products')

def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, slug = sys.argv[1], sys.argv[2]
    im = Image.open(src).convert('RGB')
    w, h = im.size
    tw = int(h * 0.8)                      # 4:5
    if tw <= w:
        x = (w - tw) // 2
        im = im.crop((x, 0, x + tw, h))
    else:
        th = int(w / 0.8)
        y = max(0, (h - th) // 2)
        im = im.crop((0, y, w, y + th))
    im = ImageOps.autocontrast(im, cutoff=(0.3, 0.2), preserve_tone=True)
    im = ImageEnhance.Color(im).enhance(1.04)
    im = ImageEnhance.Sharpness(im).enhance(1.15)
    os.makedirs(OUT, exist_ok=True)
    for width, suffix in ((1000, ''), (500, '-sm')):
        path = os.path.join(OUT, f'{slug}{suffix}.jpg')
        im.resize((width, int(width * 1.25)), Image.LANCZOS).save(
            path, quality=84, optimize=True, progressive=True)
        print('✓', path)

if __name__ == '__main__':
    main()
