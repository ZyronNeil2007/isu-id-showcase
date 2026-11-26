import numpy as np, subprocess
V=np.load('V.npy').astype(np.float64); F=np.load('F.npy'); N=np.load('N.npy').astype(np.float64)
dV=np.load('dV.npy').astype(np.float64); tipi=np.load('tipidx.npy'); cl=np.load('cl.npy',allow_pickle=True).item()
names=['thumb','index','middle','ring','pinky']
tips={n:dV[tipi[i]] for i,n in enumerate(names)}
def arcl(p): return np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
# --- MCP row (world): from dorsal knuckle apexes, centre = apex pulled 0.10 towards the palm
MCP={'index':np.array([-2.00,-1.58,2.68]),'middle':np.array([-1.80,-1.57,2.74]),'ring':np.array([-1.62,-1.60,2.80]),'pinky':np.array([-1.40,-1.58,2.77])}
lim={'index':0.94,'middle':0.81,'ring':0.61,'pinky':0.61,'thumb':0.99}
rat={'index':(0.205,0.495),'middle':(0.195,0.494),'ring':(0.197,0.494),'pinky':(0.22,0.51)}
trk={}
for n in names:
    p=np.vstack([tips[n],cl[n]]); s=arcl(p); k=s<=lim[n]; p=p[k]; s=s[k]
    q=p.copy()
    for j in range(1,len(p)-1): q[j]=0.25*p[j-1]+0.5*p[j]+0.25*p[j+1]
    trk[n]=(s,q)
def at(n,x):
    s,p=trk[n]; return np.array([np.interp(x,s,p[:,j]) for j in range(3)])
J={}
for n in names[1:]:
    T=0.9
    for it in range(12):
        sp=rat[n][1]*T; PIP=at(n,sp); T=sp+np.linalg.norm(MCP[n]-PIP)
    sd=rat[n][0]*T; sp=rat[n][1]*T
    J[n]=np.array([tips[n],at(n,sd),at(n,sp),MCP[n]]); print(n,'T',round(T,3))
# thumb
mcpT=at('thumb',0.62); ipT=at('thumb',0.30)
Mbar=np.mean([MCP[n] for n in names[1:]],axis=0)
c_w=np.array([-1.19,-0.61,1.84]); a_w=np.array([0.41,0.36,-0.81]); a_w/=np.linalg.norm(a_w)
for u in np.arange(0,0.8,0.01):
    W=c_w-u*a_w
    if np.linalg.norm(Mbar-W)<=1.10: break
print('W',W.round(3),'u',u)
Yh=(Mbar-W); Yh/=np.linalg.norm(Yh)
Xp=MCP['pinky']-MCP['index']; Zh=np.cross(Yh,Xp); Zh/=np.linalg.norm(Zh)
if Zh@np.array([0,0,-1])<0: Zh=-Zh
Yh=Yh-(Yh@Zh)*Zh; Yh/=np.linalg.norm(Yh)
Xh=np.cross(Yh,Zh)
print('Yh',Yh.round(3),'Zh',Zh.round(3),'Xh(pre-mirror)',Xh.round(3))
# thumb CMC: towards the wrist on the thumb side
side=-Xh   # thumb side in world (mirror)
cmc=mcpT+0.42*(lambda v:v/np.linalg.norm(v))((W+0.22*side+0.10*Yh)-mcpT)
J['thumb']=np.array([tips['thumb'],ipT,mcpT,cmc])
S=0.9
# arm straightening
target=-Yh
k=np.cross(a_w,target); sn=np.linalg.norm(k); k/=sn; th_full=np.arctan2(sn,a_w@target)
print('straighten angle deg',np.degrees(th_full))
def rotk(P,ang):   # rotate rows of P about axis k (Rodrigues) by per-row angle
    c=np.cos(ang)[:,None]; s=np.sin(ang)[:,None]
    return P*c+np.cross(k,P)*s+np.outer(P@k,k)*(1-c)
def smooth(x): x=np.clip(x,0,1); return x*x*(3-2*x)
def deform(P,Nn=None):
    t=(P-W)@a_w; ang=th_full*smooth(t/0.9)
    Q=rotk(P-W,ang)+W
    Nr=rotk(Nn,ang) if Nn is not None else None
    return Q,Nr
def tohand(P):
    d=P-W; return S*np.stack([-(d@Xh),d@Yh,d@Zh],1)
def tohandn(Nn): return np.stack([-(Nn@Xh),Nn@Yh,Nn@Zh],1)
Q,Nr=deform(V,N); Vh=tohand(Q); Nh=tohandn(Nr)
Jh={n:tohand(deform(J[n])[0]) for n in names}
print('bbox',Vh.min(0).round(2),Vh.max(0).round(2))
for n in names: print(n); print(Jh[n].round(3))
# crop: keep faces whose vertices are all above y=-1.1
keep=(Vh[:,1]>-1.1); fk=keep[F].all(1); F2=F[fk]
used=np.unique(F2); remap=-np.ones(len(Vh),int); remap[used]=np.arange(len(used))
Vc=Vh[used]; Nc=Nh[used]; Fc=remap[F2]
Fc=Fc[:,[0,2,1]]    # mirror flips winding
print('cropped',Vc.shape,Fc.shape)
np.save('Vh_full.npy',Vc); np.save('Nh_full.npy',Nc); np.save('Fh_full.npy',Fc); np.save('Jh.npy',Jh,allow_pickle=True)
Vc.astype(np.float32).tofile('V.bin'); Fc.astype(np.int32).tofile('F.bin')
