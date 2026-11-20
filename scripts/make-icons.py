# Generates the original NIRMTRIX launcher icons (glowing neon-green N in a ring on black). Output: android-native/res
from PIL import Image, ImageDraw, ImageFilter
import os
G = (57, 255, 20); OUT = 'android-native/res'
def art(size, ring, bg=None):
    k = 4; S = size * k; c = S / 2; r = S * ring / 2; w = max(3, int(S * 0.03))
    g = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(g)
    d.ellipse([c - r, c - r, c + r, c + r], outline=G + (255,), width=w)
    nx, ny = r * 0.40, r * 0.46
    d.line([(c - nx, c + ny), (c - nx, c - ny), (c + nx, c + ny), (c + nx, c - ny)], fill=G + (255,), width=int(w * 2.2), joint='curve')
    im = Image.new('RGBA', (S, S), bg or (0, 0, 0, 0)); im = Image.alpha_composite(im, g.filter(ImageFilter.GaussianBlur(S * 0.018))); im = Image.alpha_composite(im, g)
    return im.resize((size, size), Image.LANCZOS)
dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for n, f in dens.items():
    d = f'{OUT}/mipmap-{n}'; os.makedirs(d, exist_ok=True)
    art(int(108 * f), 0.56).save(f'{d}/ic_launcher_foreground.png')                  # adaptive: art stays inside the 66dp safe zone
    sq = art(int(48 * f), 0.80, (0, 0, 0, 255)); sq.save(f'{d}/ic_launcher.png')
    m = Image.new('L', sq.size, 0); ImageDraw.Draw(m).ellipse([0, 0, sq.size[0] - 1, sq.size[1] - 1], fill=255); rd = sq.copy(); rd.putalpha(m); rd.save(f'{d}/ic_launcher_round.png')
os.makedirs(f'{OUT}/values', exist_ok=True)
open(f'{OUT}/values/ic_launcher_background.xml', 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_background">#000000</color>\n</resources>\n')
print('icons written')
