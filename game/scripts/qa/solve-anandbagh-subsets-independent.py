"""Solve independent necessary inputs; ablations are diagnostic, never repairs."""
import argparse
import hashlib
import itertools
import json
import sys
from pathlib import Path
import numpy as np
import scipy
from scipy.optimize import linprog

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--input',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
a = p.parse_args()
assert not a.output.exists()
raw = a.input.read_bytes()
data = json.loads(raw)
results = []
for record in data['records']:
    n = len(record['heights'])
    c = np.zeros(n+1)
    c[-1] = 1.
    diagnostics = []
    for categories in [set(x) for k in range(4) for x in itertools.combinations(['own-fold','true-grade','smoothness'],k)]:
        rows = [r for r in record['rows'] if r['category'] == 'minimax' or r['category'] in categories]
        matrix = np.asarray([r['row'] for r in rows])
        right = np.asarray([r['bound'] for r in rows])
        solution = linprog(c,A_ub=matrix,b_ub=right,bounds=record['bounds'],method='highs')
        summary = {'categories':sorted(categories),'rows':len(rows),'success':bool(solution.success),'status':solution.status,'message':solution.message,
                   'minimalMaximumCorrection':float(solution.x[-1]) if solution.success else None,
                   'diagnosticOnly':len(categories)!=3}
        if solution.success:
            summary['maximumMatrixViolation'] = float(max(0.,np.max(matrix@solution.x-right)))
            summary['maximumActualCorrection'] = float(np.max(np.abs(solution.x[:n]-record['heights'])))
            assert summary['maximumMatrixViolation'] < 1e-7
            assert summary['maximumActualCorrection'] <= record['maximumBudget']+1e-8
            assert all(abs(solution.x[k]-record['heights'][k]) < 1e-12 for k in record['canonicalFrozenControls'])
            if len(categories)==3:
                summary['candidateHeightsNecessarySubsetOnly'] = [float(v) for v in solution.x[:n]]
        diagnostics.append(summary)
    full = next(d for d in diagnostics if not d['diagnosticOnly'])
    results.append({'road':record['road'],'fullNecessarySubset':full,'categoryDiagnostics':diagnostics,
                    'allRequiredPhysicalConstraintsRetainedInFullCase':True,'canonicalControlsUnchangedInEverySuccessfulDiagnostic':True,
                    'primarySuccessAgrees':full['success']==record['primaryExpectedSuccess'] if record['primaryExpectedSuccess'] is not None else None,'primaryEligibleDifference':record['primaryEligibleDifference'],'maximumBudget':record['maximumBudget'],'recoveryMetres':record['recoveryMetres']})
assert a.input.read_bytes()==raw
report = {'version':1,'scope':'Independent actual finite triangle intersection necessary LP replay. Category ablations explain contradiction only; their solutions are never repair/model outputs.',
          'releaseApproved':False,'pass':all(r['primarySuccessAgrees'] is not False for r in results),'input':{'path':str(a.input),'sha256':hashlib.sha256(raw).hexdigest()},
          'interpreter':sys.executable,'numpyVersion':np.__version__,'scipyVersion':scipy.__version__,'results':results,
          'policy':data.get('policy','Root-authorized maximum20cm replaces prior agent-design15cm for generated approaches only. Every endpoint/rail/floor stays fixed. No grade/co-elevation/smoothness/headroom waiver is authorized.'),
          'remaining':'No feasible full road profile means no actual Player/tyre/headroom acceptance can be claimed from this necessary subset.'}
with a.output.open('x') as f:
    json.dump(report,f,indent=2)
    f.write('\n')
print(json.dumps({'output':str(a.output),'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'pass':report['pass'],'summary':[{'road':r['road'],'fullSuccess':r['fullNecessarySubset']['success'],'minimalCorrection':r['fullNecessarySubset']['minimalMaximumCorrection'],'infeasibleCategories':[d['categories'] for d in r['categoryDiagnostics'] if not d['success']]} for r in results]}))
