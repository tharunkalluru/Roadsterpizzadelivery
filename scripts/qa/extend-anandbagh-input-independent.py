"""Rebound only source-classified generated controls; physical rows stay exact."""
import argparse
import hashlib
import json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--input',type=Path,required=True)
p.add_argument('--classification',type=Path,required=True)
p.add_argument('--recovery',type=float,required=True)
p.add_argument('--maximum-correction',type=float,required=True)
p.add_argument('--output',type=Path,required=True)
a = p.parse_args()
assert not a.output.exists() and 0 <= a.recovery <= 250 and 0 < a.maximum_correction <= 6.5
raw, source = a.input.read_bytes(), a.classification.read_bytes()
assert hashlib.sha256(raw).hexdigest() == '5e81e3a43d75b265a6c4b855818d65ce54adac5614422f02401321e328ccc8e7'
assert hashlib.sha256(source).hexdigest() == '43c22f6f8fbb084e0f5a735bfb427ec1621f1deadcabdc3276221f9a03a3718f'
data, classification = json.loads(raw), json.loads(source)
for record in data['records']:
    classified = next(r for r in classification['records'] if r['road'] == record['road'])
    assert classified['rawSourceProfile'] is None and not classified['currentProfileIsSurveyed']
    n, arc, heights = len(record['heights']),record['arc'],record['heights']
    ranges = [list(r) for r in record['localGradeRanges']]
    for fragment in record['fragments']:
        if fragment['maximumInputGap'] > .008:
            i,j = fragment['segments']
            ranges.append([arc[i],arc[j+1]])
    fixed = {c['index'] for c in classified['controls'] if c['immutableFacilityControl']}
    assert fixed == set(record['canonicalFrozenControls'])
    eligible = [i for i,s in enumerate(arc) if i not in fixed and any(lo-a.recovery <= s <= hi+a.recovery for lo,hi in ranges)]
    record['bounds'] = [[h,h] if i not in eligible else [max(min(heights),h-a.maximum_correction),min(max(heights),h+a.maximum_correction)] for i,h in enumerate(heights)] + [[0.,a.maximum_correction]]
    record['rows'] = [r for r in record['rows'] if r['category'] != 'smoothness']
    for i in range(1,n-1):
        if not any(k in eligible for k in [i-1,i,i+1]):
            continue
        before,after = arc[i]-arc[i-1],arc[i+1]-arc[i]
        row = [0.]*(n+1)
        row[i-1],row[i],row[i+1] = 1/before,-1/before-1/after,1/after
        record['rows'].extend([{'row':row,'bound':.00625*(before+after)/2,'category':'smoothness','control':i},{'row':[-x for x in row],'bound':.00625*(before+after)/2,'category':'smoothness','control':i}])
    record['eligibleControls'] = eligible
    record['recoveryMetres'] = a.recovery
    record['maximumBudget'] = a.maximum_correction
    record['priorPrimaryExpectedSuccess'] = record.pop('primaryExpectedSuccess')
    record['primaryExpectedSuccess'] = None
    record['primaryEligibleDifference'] = {'note':'New Root-authorized diagnostic support/bounds, no primary feasibility result assumed'}
data['parent'] = {'path':str(a.input),'sha256':hashlib.sha256(raw).hexdigest()}
data['classification'] = {'path':str(a.classification),'sha256':hashlib.sha256(source).hexdigest()}
data['policy'] = 'Root explicitly authorizes minimum-delta/support-length research only for raw-null generated recoveries within their existing[−6.5,0] envelope; all10 endpoints/rail/floor controls remain exact, sourceXYZ/physical co-elevation/grade/smoothness unchanged. No profile is activated.'
assert a.input.read_bytes() == raw and a.classification.read_bytes() == source
with a.output.open('x') as f:
    json.dump(data,f)
    f.write('\n')
print(json.dumps({'output':str(a.output),'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'recovery':a.recovery,'maximumBudget':a.maximum_correction,'eligible':{r['road']:len(r['eligibleControls']) for r in data['records']}}))
