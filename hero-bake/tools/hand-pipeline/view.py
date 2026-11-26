import numpy as np, subprocess, sys
from PIL import Image, ImageDraw
def view(Vf,Ff,out,center,right,up,hw=1.6,size=900,marks=None,labels=None,grid=0.0):
    right=np.array(right,float); up=np.array(up,float); right/=np.linalg.norm(right); up-=right*np.dot(up,right); up/=np.linalg.norm(up); fwd=np.cross(right,up)  # camera looks along -fwd? choose so +fwd is away: screen right x up = toward viewer; fwd=-(r x u)
    fwd=-np.cross(right,up)
    args=['./rast',Vf,Ff,out+'.ppm',str(size)]+[str(x) for x in center]+[str(x) for x in right]+[str(x) for x in up]+[str(x) for x in fwd]+[str(hw)]
    subprocess.run(args,check=True)
    im=Image.open(out+'.ppm').convert('RGB'); d=ImageDraw.Draw(im)
    def prj(p):
        p=np.array(p)-np.array(center); return (np.dot(p,right)/hw*size*0.5+size*0.5, size*0.5-np.dot(p,up)/hw*size*0.5)
    if grid:
        g=grid; lo=-hw; 
        k=-int(hw/g)-1
        for i in range(-int(hw/g)-1,int(hw/g)+2):
            xs=size*0.5+i*g/hw*size*0.5
            d.line([(xs,0),(xs,size)],fill=(120,160,220) if i%5 else (40,80,200),width=1)
            d.line([(0,xs),(size,xs)],fill=(120,160,220) if i%5 else (40,80,200),width=1)
    if marks is not None:
        for i,p in enumerate(marks):
            x,y=prj(p); d.ellipse([x-4,y-4,x+4,y+4],outline=(255,0,0),width=2)
            if labels: d.text((x+6,y-6),labels[i],fill=(200,0,0))
    im.save(out+'.png')
if __name__=='__main__':
    V=np.load('dV.npy'); c=V.mean(0)
    view('out_V.bin','out_F.bin','a_front',c,[1,0,0],[0,1,0],hw=2.2)
