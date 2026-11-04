"""Compare exact solver closure against independent iterative propagation."""
import ast,collections,random,json,pathlib,hashlib,argparse
parser=argparse.ArgumentParser();parser.add_argument('--repo',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[2]);parser.add_argument('--report',type=pathlib.Path);args=parser.parse_args()
p=args.repo/'scripts/solve-road-profiles.py';tree=ast.parse(p.read_text());f=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='physical_window_closure');ns={'collections':collections};exec(compile(ast.Module(body=[f],type_ignores=[]),str(p),'exec'),ns)
fn=ns['physical_window_closure'];cap=.008
# Reference applies the pre-existing point-level rule until no interval changes.
def reference(edges,windows,primary,grow,arcs):
 ranges={r:[s[:] for s in w['ranges']]for r,w in windows.items()}
 def active(r,s):return r in primary or any(a-1e-6<=s<=b+1e-6 for a,b in ranges.get(r,[]))
 changed=True;passes=0
 while changed:
  changed=False;passes+=1
  assert passes<10000
  for a,i,u,b,j,v,p,off,tol in edges:
   if off or tol!=cap:continue
   sa=arcs[a][i]*(1-u)+arcs[a][i+1]*u;sb=arcs[b][j]*(1-v)+arcs[b][j+1]*v
   for r,s,o,t in[(a,sa,b,sb),(b,sb,a,sa)]:
    if r not in grow or not active(o,t):continue
    span=[max(0,s-2),min(arcs[r][-1],s+2)];old=ranges.setdefault(r,[])
    if not any(x<=span[0]+1e-9 and span[1]<=y+1e-9 for x,y in old):old.append(span);changed=True
  for r,spans in ranges.items():
   merged=[]
   for a,b in sorted(spans):
    if merged and a<=merged[-1][1]+1e-6:merged[-1][1]=max(merged[-1][1],b)
    else:merged.append([a,b])
   ranges[r]=merged
 return ranges

def edge(a,s,b,t,off=0,tol=cap):return(a,0,s/100,b,0,t/100,(0,0),off,tol)
cases=[];arcs={r:[0,100]for r in['A','B','P']}
cases.append(([edge('A',s,'B',s)for s in range(101)],{'A':{'ranges':[[0,2]]}},set(),{'A','B'}))
cases.append(([edge('A',0,'P',0),edge('P',1,'P',99),edge('P',100,'B',100)],{'P':{'ranges':[[0,2]]}},set(),{'A','B'}))
cases.append(([edge('A',0,'B',0),edge('A',10,'B',10),edge('A',20,'B',20,off=.01)],{'A':{'ranges':[[0,2]]}},set(),{'A','B'}))
random.seed(8713)
for n in range(1000):
 roads=['A','B','P'];edges=[edge(random.choice(roads),random.randrange(0,101),random.choice(roads),random.randrange(0,101))for _ in range(100)]
 grow=set(random.sample(roads,random.randrange(1,4)));remaining=sorted(set(roads)-grow);primary=set(random.sample(remaining,random.randrange(len(remaining)+1)));windows={'A':{'ranges':[[0,2]]}}
 cases.append((edges,windows,primary,grow))
for k,(edges,windows,primary,grow)in enumerate(cases):
 actual,_=fn(edges,windows,primary,grow,arcs,cap);a={r:w['ranges']for r,w in actual.items()};expected=reference(edges,windows,primary,grow,arcs)
 assert a==expected,(k,a,expected)
out={'tests':len(cases),'success':True,'scope':'Exact closure compared with independent iterative point propagation; protected-gap, disconnected, offset negatives and 1000 deterministic randomized graphs.','solverSHA256':hashlib.sha256(p.read_bytes()).hexdigest()}
if args.report:args.report.write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))
