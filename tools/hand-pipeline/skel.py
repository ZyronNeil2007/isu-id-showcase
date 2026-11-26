import numpy as np
cl=np.load('cl.npy',allow_pickle=True).item(); V=np.load('dV.npy').astype(np.float64); tipi=np.load('tipidx.npy')
names=['thumb','index','middle','ring','pinky']
def arcl(p): return np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
T={'index':1.05,'middle':1.15,'ring':1.07,'pinky':0.83}
rat={'index':(0.205,0.495),'middle':(0.195,0.494),'ring':(0.197,0.494),'pinky':(0.22,0.51)}
lim={'index':0.95,'middle':0.85,'ring':0.62,'pinky':0.62,'thumb':1.0}   # reliable track length
J={}
for i,n in enumerate(names):
    p=np.vstack([V[tipi[i]],cl[n]]); s=arcl(p); k=s<=lim[n]; p=p[k]; s=s[k]
    # smooth
    q=p.copy()
    for j in range(1,len(p)-1): q[j]=0.25*p[j-1]+0.5*p[j]+0.25*p[j+1]
    p=q
    def at(x):
        return np.array([np.interp(x,s,p[:,j]) for j in range(3)])
    # tangent of the last reliable stretch
    s1=s[-1]; t=(at(s1)-at(max(s1-0.25,0))); t/=np.linalg.norm(t)
    def ev(x): return at(x) if x<=s1 else at(s1)+(x-s1)*t
    ss=[0,0.30,0.62,1.19] if n=='thumb' else [0,rat[n][0]*T[n],rat[n][1]*T[n],T[n]]
    J[n]=np.array([ev(x) for x in ss])
    print(n,'lim',s1.round(2)); print(J[n].round(3))
np.save('J.npy',J,allow_pickle=True)
import sys; sys.path.insert(0,'.')
from view import view
allp=np.vstack([J[n] for n in names]); lab=[n[0]+str(k) for n in names for k in range(4)]
c=np.array([-1.7,-1.6,2.5])
view('out_V.bin','out_F.bin','f_dors',c,[1,0,0],[0,1,0],hw=0.9,marks=allp,labels=lab,grid=0.1)
view('out_V.bin','out_F.bin','f_side',c,[0,0,-1],[0,1,0],hw=0.9,marks=allp,labels=lab,grid=0.1)
