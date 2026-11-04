"""Independent minimum local comfort-curvature diagnostic; no profile activation."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import scipy
from scipy.optimize import linprog

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--input',type=Path,required=True)
p.add_argument('--primary',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
a=p.parse_args()
assert not a.output.exists()
raw,primary_raw=a.input.read_bytes(),a.primary.read_bytes()
data,primary=json.loads(raw),json.loads(primary_raw)
results=[]
for record in data['records']:
    n=len(record['heights'])
    rows=[]
    for r in record['rows']:
        if r['category']=='minimax':
            continue
        vector=np.asarray(r['row'],dtype=float)
        if r['category']=='smoothness':
            vector[-1]=-r['bound']/.00625
            bound=0.
        else:
            assert vector[-1]==0
            bound=r['bound']
        rows.append((vector,bound,r['category']))
    matrix=np.asarray([r[0]for r in rows]);right=np.asarray([r[1]for r in rows])
    bounds=record['bounds'][:n]+[[0.,1.]]
    objective=np.zeros(n+1);objective[-1]=1.
    first=linprog(objective,A_ub=matrix,b_ub=right,bounds=bounds,method='highs')
    assert first.success
    required=float(first.x[-1])
    # The secondary chooses minimum total deviation without a budget waiver.
    # Conditional local comfort authority is <=.015/m, globally still.00625.
    assert required<=.015+1e-10
    expanded=np.column_stack([matrix,np.zeros((len(rows),n))])
    rhs=list(right)
    extra=[]
    for i,h in enumerate(record['heights']):
        for sign in[1.,-1.]:
            row=np.zeros(2*n+1);row[i]=sign;row[n+1+i]=-1.
            extra.append(row);rhs.append(sign*h)
    secondary_matrix=np.vstack([expanded,np.asarray(extra)])
    secondary_rhs=np.asarray(rhs)
    secondary_bounds=record['bounds'][:n]+[[required,required+1e-10]]+[[0.,6.5]]*n
    objective2=np.zeros(2*n+1);objective2[n+1:]=1.
    second=linprog(objective2,A_ub=secondary_matrix,b_ub=secondary_rhs,bounds=secondary_bounds,method='highs')
    assert second.success
    candidate=second.x[:n];old=np.asarray(record['heights'])
    assert max(0.,float(np.max(secondary_matrix@second.x-secondary_rhs)))<1e-7
    assert np.min(candidate)>=-6.5-1e-9 and np.max(candidate)<=1e-9
    assert all(abs(candidate[i]-old[i])<1e-12 for i in record['canonicalFrozenControls'])
    changed=np.flatnonzero(abs(candidate-old)>1e-8)
    prior=next(r for r in primary['records']if r['road']==record['road'])
    delta=abs(required-prior['minimumRequiredGradeChangePerMetre'])
    assert delta<1e-8,'Independent minimum curvature differs'
    by_category={}
    for row,bound,category in rows:
        residual=float(row@second.x[:n+1]-bound)
        by_category[category]=max(by_category.get(category,0.),residual)
    results.append({'road':record['road'],'independentMinimumCurvaturePerMetre':required,'primaryMinimumCurvaturePerMetre':prior['minimumRequiredGradeChangePerMetre'],'minimumDifference':delta,
                    'secondaryL1ActualMaximumDelta':float(np.max(abs(candidate-old))),'secondaryL1TotalDelta':float(np.sum(abs(candidate-old))),
                    'changedControls':[int(i)for i in changed],'changedModelArcSupport':[record['arc'][int(changed[0])],record['arc'][int(changed[-1])]],
                    'allGeneratedControlsAvailable':len(record['eligibleControls']),'canonicalFrozenControls':record['canonicalFrozenControls'],
                    'candidateHeightsDiagnosticOnly':[float(y)for y in candidate],'maximumMatrixResidualByCategory':by_category,
                    'scope':'Independent literal finite own-overlap/true-grade solution at minimumlocal comfortcurvature; no cross-road headroom or actualbody/tyre acceptance.'})
assert a.input.read_bytes()==raw and a.primary.read_bytes()==primary_raw
report={'version':1,'pass':True,'releaseApproved':False,'input':{'path':str(a.input),'sha256':hashlib.sha256(raw).hexdigest()},'primaryDiagnostic':{'path':str(a.primary),'sha256':hashlib.sha256(primary_raw).hexdigest()},'numpyVersion':np.__version__,'scipyVersion':scipy.__version__,'results':results,
        'policyChange':'Root explicitly authorized minimal generated-recovery redistribution withinexisting[−6.5,0], then conditional≤.015/m local comfortcurvature forONLYthesetworoads. Prior15/20cm andglobal.00625infeasibility retained. Physicalgrade/co-elevation/headroom/body constraints are never waived.',
        'openGates':['Exact primary production candidate/source bindings and actualsupport length','Actual30/60Hz fullPlayer/body/tyres0..120km/h, historical comfortcomparison','Independent crossing/rail headroom and wholejoint feasibility/native driving']}
with a.output.open('x')as f:json.dump(report,f,indent=2);f.write('\n')
print(json.dumps({'output':str(a.output),'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'results':[{k:r[k]for k in['road','independentMinimumCurvaturePerMetre','secondaryL1ActualMaximumDelta','changedModelArcSupport','allGeneratedControlsAvailable']}for r in results]}))
