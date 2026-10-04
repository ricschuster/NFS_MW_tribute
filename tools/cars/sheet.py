"""Contact sheet of a Kestrel preview set: python3 tools/cars/sheet.py PREFIX [names...]"""
import sys
from PIL import Image
pre = sys.argv[1]; names = sys.argv[2:] or ['front34', 'side', 'rear34', 'chase']
ims = [Image.open(f'{pre}_{n}.png').resize((640, 360)) for n in names]
rows = (len(ims) + 1) // 2
c = Image.new('RGB', (1280, 360 * rows))
for i, im in enumerate(ims): c.paste(im, ((i % 2) * 640, (i // 2) * 360))
c.save(f'{pre}_sheet.png')
