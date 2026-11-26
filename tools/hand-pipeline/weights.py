import numpy as np, scipy.sparse as sp, base64, json
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree
V=np.fromfile('out_V.bin',np.float32).reshape(-1,3).astype(np.float64); F=np.fromfile('out_F.bin',np.int32).reshape(-1,3)
Jh=np.load('Jh.npy',allow_pickle=True).item(); Vf=np.load('Vh_full.npy'); Nf=np.load('Nh_full.npy')
names=['thumb','index','middle','ring','pinky']
nv=len(V); print('verts',nv)
# --- normals: nearest full-res vertex
kd=cKDTree(Vf); dd,ii=kd.query(V,k=14); wg=np.exp(-(dd/0.011)**2)+1e-6; Nn=(Nf[ii]*wg[:,:,None]).sum(1); Nn/=np.linalg.norm(Nn,axis=1,keepdims=True)
# --- geodesic ownership
e=np.vstack([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]); w=np.linalg.norm(V[e[:,0]]-V[e[:,1]],axis=1)
G=sp.coo_matrix((w,(e[:,0],e[:,1])),shape=(nv,nv)); G=G.maximum(G.T).tocsr()
tipv=[int(np.argmin(np.linalg.norm(V-Jh[n][0],axis=1))) for n in names]
D=np.stack([dijkstra(G,indices=t) for t in tipv]); own=np.argmin(D,axis=0)
# --- polylines (tip->...->base, extended beyond the base)
def poly(n):
    P=Jh[n].copy(); ext=P[3]+(P[3]-P[2])/np.linalg.norm(P[3]-P[2])*0.35
    return np.vstack([P,ext])
def proj(Pt,L):
    best=np.full(len(Pt),1e9); bs=np.zeros(len(Pt)); acc=0
    for a,b in zip(L[:-1],L[1:]):
        d=b-a; l=np.linalg.norm(d); t=np.clip(((Pt-a)@d)/(l*l),0,1); q=a+np.outer(t,d); dist=np.linalg.norm(Pt-q,axis=1)
        m=dist<best; best[m]=dist[m]; bs[m]=acc+t[m]*l; acc+=l
    return bs,best
sm=lambda x:(lambda t:t*t*(3-2*t))(np.clip(x,0,1))
NB=16
bid={'index':1,'middle':4,'ring':7,'pinky':10,'thumb':13}
RAD={'index':0.085,'middle':0.085,'ring':0.08,'pinky':0.07,'thumb':0.10}
seg={}
for n in names:
    L=poly(n); seg[n]=np.r_[0,np.cumsum(np.linalg.norm(np.diff(L,axis=0),axis=1))][:4]
Wt=np.zeros((nv,NB)); infl={}; parts={}
for n in names:
    s,dist=proj(V,poly(n)); s1,s2,s3=seg[n][1],seg[n][2],seg[n][3]; r=RAD[n]
    lat=1-sm((dist-r*1.05)/(r*0.95))                  # lateral falloff from the bone axis
    if n=='thumb':
        endf=1.0-0.0*s                                 # thumb tissue extends over the thenar: handled by the wider radius below
        lat=1-sm((dist-r*1.15)/(r*1.5))
        fadeb=1-0.55*sm((s-(s3+0.10))/0.28)           # towards the wrist the palm bone takes over
    else:
        fadeb=1-sm((s-(s3-0.05))/0.17)                 # fades into the palm across the knuckle
    I=lat*fadeb; infl[n]=I
    hd,hp=(0.065,0.07)
    bdist=1-sm((s-(s1-hd))/(2*hd)); bmid=sm((s-(s1-hd))/(2*hd))*(1-sm((s-(s2-hp))/(2*hp))); bprox=sm((s-(s2-hp))/(2*hp))
    parts[n]=(bdist,bmid,bprox)
tot=sum(infl.values()); scale=1.0/np.maximum(tot,1.0)
for n in names:
    I=infl[n]*scale; b=bid[n]; bdist,bmid,bprox=parts[n]
    Wt[:,b+2]+=I*bdist; Wt[:,b+1]+=I*bmid; Wt[:,b]+=I*bprox
Wt[:,0]=np.clip(1-Wt[:,1:].sum(1),0,1)
Wt=np.clip(Wt,0,None); Wt/=Wt.sum(1,keepdims=True)
# top-4
idx=np.argsort(-Wt,axis=1)[:,:4]; ww=np.take_along_axis(Wt,idx,1); ww/=ww.sum(1,keepdims=True)
print('mean influences',(Wt>0.02).sum(1).mean())
# --- ao and thickness (point-cloud based)
rng=np.random.default_rng(3)
def basis(n):
    a=np.where(np.abs(n[:,2:3])<0.9,np.array([[0,0,1.0]]),np.array([[1.0,0,0]])); t=np.cross(a,n); t/=np.linalg.norm(t,axis=1,keepdims=True); b=np.cross(n,t); return t,b
t,b=basis(Nn); ao=np.zeros(nv); K=10
dirs=[]
for k in range(K):
    u=rng.random(); v=rng.random(); r=np.sqrt(u); ph=2*np.pi*v; dirs.append((r*np.cos(ph),r*np.sin(ph),np.sqrt(1-u)))
kdv=cKDTree(V); occ=np.zeros(nv); cnt=0
for (x,y,z) in dirs:
    d=t*x+b*y+Nn*z
    for r in (0.03,0.07,0.13,0.22):
        q=V+Nn*0.004+d*r; dd,_=kdv.query(q); occ+=np.clip(1-dd/(r*0.9),0,1)*(0.5 if r>0.1 else 1.0); cnt+=1
ao=np.clip(1-occ/cnt*1.9,0,1)
# thickness: nearest surface point in the cone opposite to the normal
th=np.full(nv,0.3); _,nb=kdv.query(V,k=96,distance_upper_bound=0.3)
for k in range(1,96):
    j=nb[:,k]; ok=j<nv; jj=np.where(ok,j,0); dvec=V[jj]-V; dl=np.linalg.norm(dvec,axis=1)+1e-9
    c=(dvec*Nn).sum(1)/dl; m=ok&(c<-0.8)&(dl<th); th[m]=dl[m]
print('ao',ao.min().round(2),ao.mean().round(2),'th',np.percentile(th,[5,50,95]).round(3))
np.savez('skin.npz',V=V,F=F,N=Nn,idx=idx,ww=ww,ao=ao,th=th,own=own)
