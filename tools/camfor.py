"""Find a street-level camera that looks at a target point from the nearest road: python3 tools/camfor.py x z [back] [height]"""
import json, math, sys
z = json.load(open('/home/claude/p2ph/game/public/zones/rtc/zone.json'))
tx, tz = float(sys.argv[1]), float(sys.argv[2]); back = float(sys.argv[3]) if len(sys.argv) > 3 else 30; hy = float(sys.argv[4]) if len(sys.argv) > 4 else 3.2
best = None
for e in z['roads']:
    if e.get('elev'): continue
    p = e['pts']
    for (ax, az), (bx, bz) in zip(p, p[1:]):
        dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz or 1
        t = max(0, min(1, ((tx - ax) * dx + (tz - az) * dz) / L2)); px, pz = ax + dx * t, az + dz * t
        d = math.hypot(tx - px, tz - pz)
        if best is None or d < best[0]: best = (d, px, pz, dx / math.sqrt(L2), dz / math.sqrt(L2), e.get('name'), e.get('w'))
d, px, pz, ux, uz, name, w = best
# step back along the road (pick the direction that keeps the target in front-left)
cx, cz = px - ux * back, pz - uz * back
print(f'road {name} w={w} dist={d:.1f}')
print(f'cam={cx:.1f},{hy},{cz:.1f},{tx:.1f},{5},{tz:.1f}&player={px - ux * (back - 9):.1f},{pz - uz * (back - 9):.1f},{math.atan2(ux, uz):.2f}')
