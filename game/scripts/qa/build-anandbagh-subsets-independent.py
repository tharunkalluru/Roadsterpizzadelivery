"""Independent finite-intersection LP input. Never imports primary solver code."""
import argparse
import hashlib
import itertools
import json
import math
from pathlib import Path
from shapely.geometry import Polygon
from shapely.strtree import STRtree

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
assert not a.output.exists()
repo = Path(__file__).resolve().parents[2]
held = {}

def load(path, expected=None):
    b = Path(path).read_bytes()
    digest = hashlib.sha256(b).hexdigest()
    assert expected is None or digest == expected
    held[str(path)] = digest
    return json.loads(b)

folder = Path('/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1')
model = load(folder/'model-be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7.json', 'be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7')
frozen = load(folder/'footprints-5697db58a197b3037e10c77e48cdb64dd16890b0cd5ad15a09ad1d119a95176a.json', '5697db58a197b3037e10c77e48cdb64dd16890b0cd5ad15a09ad1d119a95176a')
classification = load(repo/'docs/qa/evidence/reported-roads/anandbagh-fold-controls-independent-9413-20261103.json', '43c22f6f8fbb084e0f5a735bfb427ec1621f1deadcabdc3276221f9a03a3718f')
primary = load('/tmp/anandbagh-own-fold-necessary-subset-v3.json')
held[str(Path(__file__))] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
roads = {r['id']: r for r in model['roads']}
footprints = {r['id']: r for r in frozen['roads']}

def progress(vertices, coefficients, point):
    x, y, z = vertices
    ux, uz, vx, vz = y[0]-x[0], y[1]-x[1], z[0]-x[0], z[1]-x[1]
    determinant = ux*vz-uz*vx
    assert abs(determinant) > 1e-12
    u = ((point[0]-x[0])*vz-(point[1]-x[1])*vx)/determinant
    v = (ux*(point[1]-x[1])-uz*(point[0]-x[0]))/determinant
    return coefficients[0]*(1-u-v)+coefficients[1]*u+coefficients[2]*v

records = []
for classified in classification['records']:
    ident = classified['road']
    road, f = roads[ident], footprints[ident]
    n = len(road['pts'])
    heights = road['elev']
    arc = [0.]
    for x, y in zip(road['pts'], road['pts'][1:]):
        arc.append(arc[-1]+math.dist(x, y))
    triangles, shapes = [], []
    for i in range(n-1):
        for vertices, weights in [([f['R'][i], f['R'][i+1], f['L'][i+1]], [0.,1.,1.]), ([f['R'][i],f['L'][i+1],f['L'][i]], [0.,1.,0.])]:
            shape = Polygon(vertices)
            if shape.area <= 1e-12:
                continue
            triangles.append({'segment': i, 'vertices': vertices, 'weights': weights})
            shapes.append(shape)
    tree = STRtree(shapes)
    own_rows, ranges, fragments, remote = [], [], [], []
    for ti, (first, shape) in enumerate(zip(triangles, shapes)):
        for tj in tree.query(shape, predicate='intersects'):
            tj = int(tj)
            if tj <= ti:
                continue
            second = triangles[tj]
            intersection = shape.intersection(shapes[tj])
            if intersection.area < 1e-6:
                continue
            assert intersection.geom_type == 'Polygon'
            points = list(intersection.exterior.coords)[:-1]
            i, j = first['segment'], second['segment']
            if j < i:
                i, j, first, second = j, i, second, first
            values = []
            for point in points:
                u = progress(first['vertices'], first['weights'], point)
                v = progress(second['vertices'], second['weights'], point)
                values.append(abs((arc[i]*(1-u)+arc[i+1]*u)-(arc[j]*(1-v)+arc[j+1]*v)))
            width = max(math.dist(f['L'][k], f['R'][k]) for k in [i,i+1,j,j+1])
            if i != j and max(values) > width+2.+1e-7:
                remote.append({'segments':[i,j], 'area':intersection.area, 'maximumArcSeparation':max(values)})
                continue
            maximum_gap = 0.
            for point in points + [tuple(sum(p[k] for p in points)/len(points) for k in [0,1])]:
                u = progress(first['vertices'], first['weights'], point)
                v = progress(second['vertices'], second['weights'], point)
                row = [0.]*(n+1)
                row[i] += 1-u
                row[i+1] += u
                row[j] -= 1-v
                row[j+1] -= v
                gap = sum(w*h for w,h in zip(row,heights))
                maximum_gap = max(maximum_gap, abs(gap))
                own_rows.append({'row':row, 'bound':.008, 'category':'own-fold', 'segments':[i,j], 'point':point})
            if maximum_gap > .008:
                ranges.append([arc[i],arc[j+1]])
            fragments.append({'segments':[i,j], 'area':intersection.area, 'maximumInputGap':maximum_gap, 'maximumArcSeparation':max(values)})
    grade_rows, bad_grade = [], []
    for i in range(n-1):
        def perpendicular(point, a, b):
            return abs((a[0]-point[0])*(b[1]-point[1])-(a[1]-point[1])*(b[0]-point[0]))/(math.dist(a,b) or 1.)
        run = min(perpendicular(f['R'][i],f['R'][i+1],f['L'][i+1]),perpendicular(f['L'][i+1],f['R'][i],f['L'][i]))
        limit = min(.1*(arc[i+1]-arc[i]),.0995*run)
        row = [0.]*(n+1)
        row[i],row[i+1] = -1.,1.
        grade_rows.append({'row':row,'bound':limit,'category':'true-grade','segment':i,'perpendicularRun':run})
        if abs(heights[i+1]-heights[i]) > .0995*run+1e-9:
            bad_grade.append([arc[i],arc[i+1]])
    ranges += bad_grade
    recovery,budget = 24.,.20
    frozen_controls = {c['index'] for c in classified['controls'] if c['immutableFacilityControl']}
    eligible = [i for i,s in enumerate(arc) if i not in frozen_controls and any(lo-recovery <= s <= hi+recovery for lo,hi in ranges)]
    bounds = [[h,h] if i not in eligible else [max(min(heights),h-budget),min(0.,h+budget)] for i,h in enumerate(heights)] + [[0.,budget]]
    rows = []
    for positive in own_rows+grade_rows:
        rows.extend([positive,{**positive,'row':[-w for w in positive['row']]}])
    for i in range(1,n-1):
        if all(k not in eligible for k in [i-1,i,i+1]):
            continue
        before,after = arc[i]-arc[i-1],arc[i+1]-arc[i]
        row = [0.]*(n+1)
        row[i-1],row[i],row[i+1] = 1/before,-1/before-1/after,1/after
        rows.extend([{'row':row,'bound':.00625*(before+after)/2,'category':'smoothness','control':i},{'row':[-x for x in row],'bound':.00625*(before+after)/2,'category':'smoothness','control':i}])
    for i,h in enumerate(heights):
        for sign in [1.,-1.]:
            row = [0.]*(n+1)
            row[i],row[n] = sign,-1.
            rows.append({'row':row,'bound':sign*h,'category':'minimax','control':i})
    primary_road = next(r for r in primary['records'] if r['road'] == ident)
    primary_eligible = {c['index'] for c in primary_road['controls'] if c['subsetEligible']}
    records.append({'road':ident,'heights':heights,'arc':arc,'bounds':bounds,'rows':rows,'fragments':fragments,'remoteIntersectionsNotCoupled':remote,'eligibleControls':eligible,'canonicalFrozenControls':sorted(frozen_controls),'maximumBudget':budget,'recoveryMetres':recovery,'localGradeRanges':bad_grade,'primaryEligibleDifference':{'independentOnly':sorted(set(eligible)-primary_eligible),'primaryOnly':sorted(primary_eligible-set(eligible))},'primaryExpectedSuccess':primary_road['subsetSuccess']})
for path,digest in held.items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest
report = {'version':1,'scope':'Independent actual-Shapely-overlap necessary LP inputs only, no primary functions imported and no runtime/model changes','releaseApproved':False,'records':records,'beforeAfterUnchangedInputs':held}
with a.output.open('x') as f:
    json.dump(report,f)
    f.write('\n')
print(json.dumps({'output':str(a.output),'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'summary':[{'road':r['road'],'rows':len(r['rows']),'fragments':len(r['fragments']),'eligible':len(r['eligibleControls']),'remote':len(r['remoteIntersectionsNotCoupled']),'primaryDifference':r['primaryEligibleDifference']} for r in records]}))
