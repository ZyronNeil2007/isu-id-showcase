import numpy as np
from scipy import ndimage as ndi
d=np.load('skin.npz'); V=d['V']; F=d['F']; N=d['N']
h=0.012; lo=V.min(0)-0.08; hi=V.max(0)+0.08; shp=np.ceil((hi-lo)/h).astype(int)+1; print(shp)
# surface samples: vertices, edge midpoints, centroids, plus barycentric grid
A,B,C=V[F[:,0]],V[F[:,1]],V[F[:,2]]
pts=[V,(A+B)/2,(B+C)/2,(C+A)/2,(A+B+C)/3]
for w in ((0.67,0.17,0.16),(0.17,0.67,0.16),(0.16,0.17,0.67)): pts.append(A*w[0]+B*w[1]+C*w[2])
P=np.vstack(pts); ij=np.floor((P-lo)/h).astype(int)
surf=np.zeros(shp,bool); surf[ij[:,0],ij[:,1],ij[:,2]]=True
surf=ndi.binary_dilation(surf,iterations=1)
# cap the open forearm end: lowest occupied y slice region
ymin=int(np.floor((V[:,1].min()-lo[1])/h))+2
for y in range(ymin-1,ymin+2):
    sl=surf[:,y,:]; surf[:,y,:]|=ndi.binary_fill_holes(sl)
empty=~surf
lab,nl=ndi.label(empty); outside=lab==lab[0,0,0]
inside=~outside&~surf   # interior voxels
inside|=surf&~ndi.binary_dilation(outside,iterations=1)  # keep shell as inside-ish
print('inside voxels',inside.sum())
edt=ndi.distance_transform_edt(inside)*h
def samp(Q):
    q=np.floor((Q-lo)/h).astype(int); q=np.clip(q,0,np.array(shp)-1); return edt[q[:,0],q[:,1],q[:,2]]
rm=np.zeros(len(V))
for r in np.arange(0.01,0.16,0.01): rm=np.maximum(rm,samp(V-N*r))
th=np.clip(2*rm,0.02,0.5); print(np.percentile(th,[5,25,50,75,95]).round(3))
np.save('th.npy',th)
