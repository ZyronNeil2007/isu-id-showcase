import numpy as np, json
from scipy.optimize import minimize
RIG=json.load(open('rig.json')); names=RIG['names']; par=RIG['parent']; Wr=[np.array(a).reshape(4,4).T for a in RIG['rest']]
d=np.load('skin.npz'); V=d['V']; N=d['N']; idx=d['idx']; ww=d['ww']
n=len(names); NI={k:i for i,k in enumerate(names)}
Wi=[np.linalg.inv(m) for m in Wr]
L=[Wr[i] if par[i]<0 else Wi[par[i]]@Wr[i] for i in range(n)]
def rx(a): c,s=np.cos(a),np.sin(a); return np.array([[1,0,0],[0,c,-s],[0,s,c]])
def ry(a): c,s=np.cos(a),np.sin(a); return np.array([[c,0,s],[0,1,0],[-s,0,c]])
def rz(a): c,s=np.cos(a),np.sin(a); return np.array([[c,-s,0],[s,c,0],[0,0,1]])
def R4(e):
    m=np.eye(4); m[:3,:3]=rx(np.radians(e[0]))@ry(np.radians(e[1]))@rz(np.radians(e[2])); return m
def fk(pose):
    W=[]
    for i in range(n):
        l=L[i]@R4(pose.get(names[i],(0,0,0)))
        W.append(l if par[i]<0 else W[par[i]]@l)
    return W
# bone-local pad points
def bone_pad(b):
    wb=np.zeros(len(V))
    for k in range(4): wb+=np.where(idx[:,k]==b,ww[:,k],0)
    m=wb>0.85; P=V[m]; Nn=N[m]
    lp=(Wi[b]@np.c_[P,np.ones(len(P))].T).T[:,:3]; ln=Nn@Wi[b][:3,:3].T
    ln_=ln; L_=np.linalg.norm(Wr[b][:3,1]); 
    sel=(ln[:,2]>0.75)
    pp=lp[sel]; nn=ln[sel]
    print(names[b],'verts',m.sum(),'pad verts',sel.sum(),'local pad centre',pp.mean(0).round(3),'local n',(nn.mean(0)/np.linalg.norm(nn.mean(0))).round(2))
    return pp.mean(0), nn.mean(0)/np.linalg.norm(nn.mean(0))
pi,ni=bone_pad(NI['i3']); pt,nt=bone_pad(NI['t3'])
free=[('i1',0),('i2',0),('i3',0),('i1',2),('t1',0),('t1',1),('t1',2),('t2',0),('t2',2),('t3',0),('t3',1),('m1',0),('m2',0),('m3',0)]
lo=[-35,-45,-35,-15,-50,-50,-50,-35,-25,-35,-40,-15,-15,-15]; hi=[70,50,45,15,60,50,50,60,25,55,40,25,25,25]
def pose_from(x):
    p={}
    for (b,c),v in zip(free,x):
        e=list(p.get(b,(0,0,0))); e[c]=v; p[b]=tuple(e)
    return p
def pads(x):
    W=fk(pose_from(x)); 
    a=W[NI['i3']]@np.r_[pi,1]; na=W[NI['i3']][:3,:3]@ni
    b=W[NI['t3']]@np.r_[pt,1]; nb=W[NI['t3']][:3,:3]@nt
    return a[:3],na,b[:3],nb
def cost(x):
    a,na,b,nb=pads(x); dv=b-a; dist=np.linalg.norm(dv); u=dv/dist
    c=((dist-0.012)/0.008)**2
    c+=2*(1+na@nb)**2 + 1.5*(1-na@u)**2 + 1.5*(1+nb@u)**2
    mid=(a+b)/2
    c+=max(0,0.50-mid[2])**2*60+max(0,0.95-mid[1])**2*40+max(0,mid[1]-1.35)**2*40
    c+=0.04*np.sum((np.array(x)/50)**2)
    # keep fingertips away from the palm (no penetration): index/ thumb tips above the palm plane
    return c
best=None
rng=np.random.default_rng(1)
for t in range(14):
    x0=np.zeros(len(free)) if t==0 else rng.uniform(lo,hi)*0.4
    r=minimize(cost,x0,method='Powell',bounds=list(zip(lo,hi)),options={'maxiter':6000,'xtol':1e-2,'ftol':1e-7})
    if best is None or r.fun<best.fun: best=r
x=best.x; print('cost',best.fun)
for (b,c),v in zip(free,x): print(b,'xyz'[c],round(v,1))
a,na,b,nb=pads(x); print('pad i',a.round(3),'pad t',b.round(3),'dist',np.linalg.norm(b-a).round(4),'mid',((a+b)/2).round(3),'n.n',(na@nb).round(3),'axis',((b-a)/np.linalg.norm(b-a)).round(3))
np.save('pinch_x.npy',x)
