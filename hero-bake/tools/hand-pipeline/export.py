import numpy as np, base64, json
d=np.load('skin2.npz'); V=d['V']; F=d['F']; N=d['N']; idx=d['idx']; ww=d['ww']; ao=d['ao']; th=np.load('th2.npy')
Jh=np.load('Jh.npy',allow_pickle=True).item()
nv=len(V)
bmin=V.min(0)-1e-4; bmax=V.max(0)+1e-4
p16=np.round(((V-bmin)/(bmax-bmin)*2-1)*32767).astype(np.int16)
n8=np.round(np.clip(N,-1,1)*127).astype(np.int8)
ao8=np.round(np.clip(ao,0,1)*255).astype(np.uint8); th8=np.round(np.clip(th/0.5,0,1)*255).astype(np.uint8)
j8=idx.astype(np.uint8)
w8=np.round(ww*255).astype(np.int32); w8[:,0]+=255-w8.sum(1); w8=np.clip(w8,0,255).astype(np.uint8)
b64=lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
# reorder vertices? (keep order) ; indices u32
HAND=dict(nv=nv,bmin=[float(x) for x in bmin],bmax=[float(x) for x in bmax],pos=b64(p16),nor=b64(n8),ao=b64(ao8),th=b64(th8),j=b64(j8),w=b64(w8),idx=b64(F.astype(np.uint32)),u32=True)
# ---- rig
names=['palm']; parent=[-1]; rest=[np.eye(4)]; lens=[0.0]
Xh=np.array([1.0,0,0])
def frame(o,y,xref):
    y=y/np.linalg.norm(y); x=xref-(xref@y)*y; x/=np.linalg.norm(x); z=np.cross(x,y)
    M=np.eye(4); M[:3,0]=x; M[:3,1]=y; M[:3,2]=z; M[:3,3]=o; return M
fn={'index':'i','middle':'m','ring':'r','pinky':'p','thumb':'t'}
for n in ['index','middle','ring','pinky','thumb']:
    P=Jh[n]   # tip, DIP/IP, PIP/MCP, MCP/CMC
    chain=[P[3],P[2],P[1],P[0]]   # base ... tip
    if n=='thumb':
        a=P[2]-P[3]; b=P[0]-P[2]; xr=np.cross(a,b); xr/=np.linalg.norm(xr)
    else: xr=Xh
    for k in range(3):
        o=chain[k]; nxt=chain[k+1]
        names.append(fn[n]+str(k+1)); parent.append(0 if k==0 else len(names)-2)
        rest.append(frame(o,nxt-o,xr)); lens.append(float(np.linalg.norm(nxt-o)))
RIG=dict(names=names,parent=parent,rest=[[float(x) for x in M.T.reshape(-1)] for M in rest],len=lens)
for i,nm in enumerate(names): print(i,nm,parent[i],np.round(rest[i][:3,3],3),round(lens[i],3),np.round(rest[i][:3,0],2))
json.dump(RIG,open('rig.json','w'))
js=lambda o: json.dumps(o,separators=(',',':'))
src="// Generated from the supplied Hand.obj (mirrored to a right hand, forearm straightened and cropped, 75k vertices). Do not edit.\n"
src+="export const HAND = "+js(HAND)+" as const;\nexport const RIG = "+js(RIG)+" as const;\n"
open('/home/claude/isu-bake/src/scene/hand.generated.ts','w').write(src)
print('written',len(src)/1e6,'MB')
