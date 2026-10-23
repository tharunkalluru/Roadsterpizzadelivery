"""City-wide picture of automated shop placement: each 200 m cell coloured by how many confident boards it has."""
import json, math, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap, BoundaryNorm
P = json.load(open('build/placements.json'))
s, w, n, e = 17.20, 78.20, 17.62, 78.70
cell = 0.0018
H = int((n - s) / cell) + 1; W = int((e - w) / cell) + 1
g = np.zeros((H, W))
for p in P:
    if p.get('status') != 'placed' or p.get('flags'): continue
    if p['place_conf'] < 0.5: continue
    g[int((p['lat'] - s) / cell), int((p['lon'] - w) / cell)] += 1
cmap = ListedColormap(['#17132B', '#5a2a3a', '#E8413A', '#FFB627', '#22B573'])
norm = BoundaryNorm([0, 0.5, 2.5, 8.5, 25.5, 1e9], cmap.N)
fig, ax = plt.subplots(figsize=(12, 10.5), dpi=110)
ax.imshow(g, origin='lower', cmap=cmap, norm=norm, extent=[w, e, s, n], interpolation='nearest')
ax.set_aspect(1 / math.cos(math.radians(17.4)))
ax.add_patch(plt.Rectangle((78.478, 17.388), 0.030, 0.028, fill=False, ec='#45E3D3', lw=1.5))
ax.text(78.478, 17.418, 'RTC X Roads hero zone', color='#45E3D3', fontsize=9)
ax.set_xticks([]); ax.set_yticks([]); ax.set_facecolor('#17132B')
for lab, c in [('0', '#17132B'), ('1-2', '#5a2a3a'), ('3-8', '#E8413A'), ('9-25', '#FFB627'), ('26+', '#22B573')]: ax.plot([], [], 's', color=c, label=lab + ' confident boards / 200 m cell')
ax.legend(loc='lower left', fontsize=8, facecolor='#221C3D', labelcolor='#F6EEDC', edgecolor='#3A3160')
plt.tight_layout(); plt.savefig('build/city_board_density.png', facecolor='#17132B'); print('ok', int(g.sum()))
