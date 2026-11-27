"""Separate the fused fingers: faces that bridge two fingers are assigned to one of them, shared vertices are duplicated per finger,
and every finger vertex is skinned only to its own finger + the palm. Result: skin2.npz (same fields as skin.npz)."""
import numpy as np
d=np.load('skin.npz'); V=d['V']; F=d['F']; N=d['N']; idx=d['idx']; ww=d['ww']; ao=d['ao']; th=np.load('th.npy')
nv=len(V)
def grp(b): return 0 if b==0 else (b-1)//3+1     # 0 palm, 1 index, 2 middle, 3 ring, 4 pinky, 5 thumb
G=np.vectorize(grp)(idx)                           # (nv,4) group of each influence
gw=np.zeros((nv,6)); 
for k in range(4): np.add.at(gw,(np.arange(nv),G[:,k]),ww[:,k])
dom=np.argmax(gw,1); print('verts per group',np.bincount(dom,minlength=6))
# a vertex that is mostly palm but carries a lot of one finger is a finger vertex near the base: classify by the strongest *finger* if its share > 0.35
fing=np.argmax(gw[:,1:],1)+1; share=gw[np.arange(nv),fing]
lab=np.where((dom==0)&(share<0.35),0,np.where(dom==0,fing,dom))
# face labels
fl=np.zeros(len(F),int)
for i,(a,b,c) in enumerate(F):
    L=[lab[a],lab[b],lab[c]]; f=[x for x in L if x>0]
    fl[i]=0 if not f else max(set(f),key=f.count)
bridge=sum(1 for i,(a,b,c) in enumerate(F) if len({x for x in (lab[a],lab[b],lab[c]) if x>0})>1)
print('faces',len(F),'bridging faces',bridge)
# duplicate vertices per (vertex,label) when a vertex is used by faces of >=2 different finger labels
from collections import defaultdict
use=defaultdict(set)
for i,f in enumerate(F):
    for v in f:
        if fl[i]>0: use[v].add(fl[i])
newid={}; V2=[];N2=[];I2=[];W2=[];A2=[];T2=[];L2=[]
def emit(v,l):
    key=(v,l)
    if key in newid: return newid[key]
    i=len(V2); newid[key]=i
    V2.append(V[v]);N2.append(N[v]);A2.append(ao[v]);T2.append(th[v]);L2.append(l)
    # purify weights: keep palm + own finger bones only
    if l==0: I2.append(idx[v]);W2.append(ww[v]);return i
    w=np.zeros(16); 
    for k in range(4):
        b=idx[v][k]; g=grp(b)
        if g==0 or g==l: w[b]+=ww[v][k]
    if w.sum()<1e-6: w[3*(l-1)+3 if l<5 else 15]=1.0
    w/=w.sum(); o=np.argsort(-w)[:4]; ws=w[o]/w[o].sum(); I2.append(o);W2.append(ws)
    return i
F2=[]
for i,f in enumerate(F):
    l=fl[i]; F2.append([emit(v,l if (len(use[v])>1 or lab[v]==l) else (lab[v] if lab[v]==l else l)) if False else emit(v,l if len(use[v])>1 else (next(iter(use[v])) if use[v] else 0)) for v in f])
V2=np.array(V2);N2=np.array(N2);I2=np.array(I2).astype(idx.dtype);W2=np.array(W2);A2=np.array(A2);T2=np.array(T2)
print('new verts',len(V2),'from',nv)
np.savez('skin2.npz',V=V2,F=np.array(F2,np.int64),N=N2,idx=I2,ww=W2,ao=A2,th=T2,own=np.array(L2))
np.save('th2.npy',T2)
