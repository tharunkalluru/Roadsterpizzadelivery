import argparse
import hashlib
import html
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--qualified', required=True)
parser.add_argument('--emitted', required=True)
parser.add_argument('--directory', required=True)
args = parser.parse_args()
qualified_path, emitted_path = Path(args.qualified), Path(args.emitted)
qualified_bytes, emitted_bytes = qualified_path.read_bytes(), emitted_path.read_bytes()
qualified, emitted = json.loads(qualified_bytes), json.loads(emitted_bytes)
assert qualified['input']['sha256'] == hashlib.sha256(emitted_bytes).hexdigest()
directory = Path(args.directory)
directory.mkdir(parents=True, exist_ok=False)
palette = ['#2675c8', '#e98927', '#9063d0', '#128d73', '#cf486b', '#765842']
files = []
for result in qualified['results']:
    if result['commonWidthComponent'] is not None:
        continue
    query = next(q for q in emitted['queries'] if q['node'] == result['node'])
    cx, cz = query['center']
    view = [cx - 18, cz - 18, 36, 36]
    roads = [a['id'] for a in query['arms']]
    colors = dict(zip(roads, palette))
    tags = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view[0]} {view[1]} 36 36" width="900" height="900">',
            f'<rect x="{view[0]}" y="{view[1]}" width="36" height="36" fill="#fbfaf6"/>',
            f'<text x="{cx-17}" y="{cz-16.7}" font-family="monospace" font-size=".8">{html.escape(result["node"])} / XZ ONLY / original Y retained</text>']
    for triangle in query['triangles']:
        points = ' '.join(f'{p[0]},{p[2]}' for p in triangle['points'])
        tags.append(f'<polygon points="{points}" fill="{colors.get(triangle["road"], "#777")}" fill-opacity=".25" stroke="{colors.get(triangle["road"], "#777")}" stroke-width=".025"/>')
    geometry = result['widthCenterRegionXZ']
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry.get('coordinates', [])
    for polygon in polygons:
        path = ' '.join('M' + ' L'.join(f'{p[0]},{p[1]}' for p in ring) + ' Z' for ring in polygon)
        tags.append(f'<path d="{path}" fill="#18b86a" fill-opacity=".22" stroke="#098644" stroke-width=".055" fill-rule="evenodd"/>')
    for arm in query['arms']:
        px, pz = arm['port']; ex, ez = arm['point']
        tags.append(f'<circle cx="{ex}" cy="{ez}" r=".12" fill="#111"/>')
        tags.append(f'<circle cx="{px}" cy="{pz}" r="1.1" fill="none" stroke="{colors[arm["id"]]}" stroke-width=".09"/>')
        tags.append(f'<text x="{px+.25}" y="{pz-.25}" font-family="monospace" font-size=".55" fill="#111">{html.escape(arm["id"])}</text>')
    for witness in result['widthBottleneckWitnesses'][:1]:
        (ax, az), (bx, bz) = witness['boundaryPoints']
        tags.append(f'<path d="M{ax},{az} L{bx},{bz}" stroke="#d31322" stroke-width=".18" stroke-dasharray=".3 .15"/>')
    interval = result['widthBottleneckIntervals']
    value = f'{interval["passingDiskWidthLowerBound"]:.4f}m' if interval else 'unresolved'
    tags.append(f'<text x="{cx-17}" y="{cz+15.8}" font-family="monospace" font-size=".65">Approx. disk-width bottleneck: {value}; required width 2.2m</text>')
    tags.append(f'<text x="{cx-17}" y="{cz+17}" font-family="monospace" font-size=".6">Green: width-center region. Full body, obstacles, height and headroom OPEN.</text></svg>')
    path = directory / (query['node'] + '.svg')
    with path.open('x') as handle:
        handle.write('\n'.join(tags))
    files.append({'node': query['node'], 'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
receipt = {'scope': 'Diagram of actual emitted Float32 XZ triangles; not a rendered gameplay screenshot or3D acceptance.',
           'qualifiedSHA256': hashlib.sha256(qualified_bytes).hexdigest(), 'emittedSHA256': hashlib.sha256(emitted_bytes).hexdigest(), 'files': files}
with (directory / 'receipt.json').open('x') as handle:
    json.dump(receipt, handle, indent=2)
    handle.write('\n')
print(json.dumps({'directory': str(directory), 'witnesses': len(files), 'receiptSHA256': hashlib.sha256((directory / 'receipt.json').read_bytes()).hexdigest()}))
