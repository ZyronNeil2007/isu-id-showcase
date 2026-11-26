import asyncio, sys, json, base64, time, os
from playwright.async_api import async_playwright
# usage: bake.py W H outdir p0 p1 ...   (renders reveal progress values to PNG; viewport W x H, dpr 1, hq textures)
W,H,out=int(sys.argv[1]),int(sys.argv[2]),sys.argv[3]; ps=[float(x) for x in sys.argv[4:]]
os.makedirs(out,exist_ok=True)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-gl=angle'])
        pg=await b.new_page(viewport={'width':W,'height':H},device_scale_factor=1)
        pg.on('pageerror',lambda e:print('PAGEERR',e)); pg.on('console',lambda m:print('c:',m.text[:300]) if m.type=='error' else None)
        await pg.goto('file:///home/claude/isu-bake/dist/index.html?test=1&hq=1')
        await pg.wait_for_function('window.__isu && window.__isu.last',timeout=300000)
        sh=os.environ.get('SHIFT')
        if sh: await pg.evaluate(f'window.__shift=[{sh}]')
        for pv in ps:
            t0=time.time()
            d=await pg.evaluate('''([pv])=>{const S=__isu.sections.reveal;const y=S.top+Math.min(pv,0.9995)*S.h;
              __isu.run(y,1.0); __isu.run(y,1.0); return document.getElementById('gl').toDataURL('image/png')}''',[pv])
            open(f'{out}/p_{pv:.4f}.png','wb').write(base64.b64decode(d.split(',')[1]))
            print('p',pv,round(time.time()-t0,1),'s',flush=True)
        await b.close()
asyncio.run(main())
