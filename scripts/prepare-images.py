#!/usr/bin/env python3
"""
تجهيز صور المنتجات: قصّ إلى نسبة ٤:٥ + تحسين خفيف + حفظ كل المقاسات والصيغ.

    python3 scripts/prepare-images.py صورة.jpg as-06-green-floral

ينتج داخل assets/images/products/ ستة ملفات:
    as-06-green-floral.jpg      as-06-green-floral-sm.jpg
    as-06-green-floral.webp     as-06-green-floral-sm.webp
    as-06-green-floral.avif     as-06-green-floral-sm.avif

الموقع يحتاجها كلها — البناء يرفض المتابعة إذا نقص أحدها.

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

    # قصّ إلى ٤:٥ من الجوانب حتى تبقى القطعة كاملة
    w, h = im.size
    tw = int(h * 0.8)
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
    made = []
    for width, suffix in ((1000, ''), (500, '-sm')):
        r = im.resize((width, int(width * 1.25)), Image.LANCZOS)
        base = os.path.join(OUT, slug + suffix)
        r.save(base + '.jpg', quality=84, optimize=True, progressive=True)
        r.save(base + '.webp', 'WEBP', quality=80, method=6)
        r.save(base + '.avif', 'AVIF', quality=62)
        made += [base + e for e in ('.jpg', '.webp', '.avif')]

    for f in made:
        print('✓', os.path.relpath(f), f'{os.path.getsize(f)/1024:.0f}KB')
    print('\nالآن أضيفي التصميم في data/products.js ثم شغّلي:  npm run build')


if __name__ == '__main__':
    main()
