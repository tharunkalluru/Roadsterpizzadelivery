"""Is a camera point inside a building? python3 tools/camcheck.py x y z [x y z ...]"""
import json, sys
z = json.load(open('/home/claude/p2ph/game/public/zones/rtc/zone.json'))
def inside(x, zz, ring):
    c = False
    for i in range(len(ring)):
        ax, az = ring[i - 1]; bx, bz = ring[i]
        if (bz > zz) != (az > zz) and x < (ax - bx) * (zz - bz) / (az - bz) + bx: c = not c
    return c
a = list(map(float, sys.argv[1:]))
for i in range(0, len(a), 3):
    x, y, zz = a[i:i + 3]
    hit = [(b['name'], b['h']) for b in z['buildings'] if abs(b['ring'][0][0] - x) < 150 and abs(b['ring'][0][1] - zz) < 150 and inside(x, zz, b['ring'])]
    print((x, y, zz), 'INSIDE' if any(h > y for _, h in hit) else ('above roof' if hit else 'clear'), hit)
