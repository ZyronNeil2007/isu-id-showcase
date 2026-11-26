import numpy as np
V=np.load('dV.npy').astype(np.float64); D=np.load('D5.npy'); tipi=np.load('tipidx.npy')
names=['thumb','index','middle','ring','pinky']
own=np.argmin(D,axis=0); dm=D.min(0)
def track(i, nsteps, step=0.04, rad=0.11, slab=0.03, lim=1.3):
    m=np.where((own==i)&(dm<lim))[0]; P=V[m]
    # initial: ring centroids near the tip
    t0=V[tipi[i]]
    near=P[D[i][m]<0.35]; c0=near.mean(0)
    # direction: towards centroid of d in 0.5..0.8
    far=P[(D[i][m]>0.5)&(D[i][m]<0.8)]; dirv=far.mean(0)-t0; dirv/=np.linalg.norm(dirv)
    pts=[c0 if False else None]
    # start at slice 0.05 from tip along dirv
    cur=t0+dirv*0.05; pts=[]; 
    for k in range(nsteps):
        dd=P-cur; ax=dd@dirv; rr=np.linalg.norm(dd-np.outer(ax,dirv),axis=1)
        sel=(np.abs(ax)<slab)&(rr<rad)
        if sel.sum()<10: break
        c=P[sel].mean(0)
        # re-centre once
        dd=P-c; ax=dd@dirv; rr=np.linalg.norm(dd-np.outer(ax,dirv),axis=1); sel=(np.abs(ax)<slab)&(rr<rad)
        c=P[sel].mean(0); 
        if pts:
            nd=c-pts[-1]; nd/=np.linalg.norm(nd); dirv=0.6*dirv+0.4*nd; dirv/=np.linalg.norm(dirv)
        pts.append(c); cur=c+dirv*step
    return np.array(pts)
if __name__=='__main__':
    out={}
    for i,n in enumerate(names):
        p=track(i,40); out[n]=p
        L=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
        print(n,len(p),'len',L[-1].round(3)); print(np.c_[L,p][::3].round(3))
    np.save('cl.npy',out,allow_pickle=True)
