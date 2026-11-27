import asyncio, sys, json
from playwright.async_api import async_playwright
# usage: shots.py W H out_prefix spec...   spec = section:p  (e.g. reveal:0.3)
W,H,pre=int(sys.argv[1]),int(sys.argv[2]),sys.argv[3]; specs=sys.argv[4:]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-gl=angle'])
        pg=await b.new_page(viewport={'width':W,'height':H},device_scale_factor=1)
        pg.on('pageerror',lambda e:print('PAGEERR',e)); pg.on('console',lambda m:print('c:',m.text[:600]) if m.type in('error','warning') else None)
        await pg.goto('file:///home/claude/isu/dist/index.html?test=1')
        try: await pg.wait_for_function('window.__isu && window.__isu.last',timeout=120000)
        except Exception as e: print('boot timeout',e); await pg.screenshot(path=pre+'_boot.png'); await b.close(); return
        await pg.wait_for_timeout(500)
        for sp in specs:
            k,v=sp.split(':'); v=float(v)
            y=await pg.evaluate('''([k,v])=>{const S=__isu.sections,vh=innerHeight;let y;
              if(k=='frontback'||k=='final') y=S[k].top+v*(S[k].h-vh); else if(k=='details') y=S[k].top+v*(S[k].h-vh); else y=S[k].top+v*S[k].h; return y}''',[k,v])
            await pg.evaluate('([y])=>{window.scrollTo(0,y)}',[y]); await pg.wait_for_timeout(120)
            await pg.evaluate('([y])=>__isu.run(y,1.0)',[y]); await pg.evaluate('([y])=>__isu.run(y,3.0)',[y]); await pg.wait_for_timeout(int(__import__("os").environ.get("WAIT","900")))
            await pg.screenshot(path=f'{pre}_{k}_{v:.3f}.png')
            print('shot',k,v,round(y))
        await b.close()
asyncio.run(main())
