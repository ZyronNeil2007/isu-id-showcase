import asyncio, sys
from playwright.async_api import async_playwright
URL='file:///home/claude/isu/dist/index.html'
ARGS=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-gl=angle']
async def new(b,**kw):
    ctx=await b.new_context(viewport={'width':1280,'height':800},**kw); pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_TUNNEL' not in m.text else None)
    return ctx,pg,errs
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS)
        # 1. normal: request counts, forward/back scrubbing
        ctx,pg,errs=await new(b); reqs=[]
        pg.on('request',lambda r:reqs.append(r.url) if 'frame_' in r.url else None)
        await pg.goto(URL); await pg.wait_for_function("document.documentElement.classList.contains('ready')",timeout=60000)
        await pg.wait_for_timeout(300)
        print('frames requested at load:',len(reqs),'of 60; gl built:',await pg.evaluate('!!__isu.gfx'))
        await pg.wait_for_timeout(3000); print('after 3s idle:',len(reqs))
        H=await pg.evaluate("__isu.sections.reveal.h")
        seqs=[]
        for f in [0.1,0.2,0.3,0.4,0.5]:
            await pg.evaluate(f'scrollTo(0,{f*H})'); await pg.wait_for_timeout(600); seqs.append(await pg.evaluate('__isu.seq.frame'))
        print('down:',seqs)
        back=[]
        for f in [0.4,0.3,0.2,0.1,0.0]:
            await pg.evaluate(f'scrollTo(0,{f*H})'); await pg.wait_for_timeout(600); back.append(await pg.evaluate('__isu.seq.frame'))
        print('up  :',back, 'gl-on:',await pg.evaluate("document.documentElement.classList.contains('gl-on')"))
        # go past hero -> gl-on; return -> off
        await pg.evaluate(f'scrollTo(0,{H*1.05})'); await pg.wait_for_function("document.documentElement.classList.contains('gl-on')",timeout=60000)
        print('gl on past hero ok; frames requested total',len(reqs))
        await pg.evaluate(f'scrollTo(0,{H*0.5})'); await pg.wait_for_timeout(800); print('back in hero gl-on:',await pg.evaluate("document.documentElement.classList.contains('gl-on')"))
        print('errors:',errs); await ctx.close()
        # 2. frames blocked -> static fallback
        ctx,pg,errs=await new(b); await pg.route('**/assets/animation/frame_*',lambda r:r.abort()); await pg.route('**/assets/animation/*/frame_*',lambda r:r.abort())
        await pg.goto(URL); await pg.wait_for_function("document.documentElement.classList.contains('ready')",timeout=60000)
        await pg.wait_for_function("document.documentElement.classList.contains('seq-fail')",timeout=20000)
        await pg.wait_for_timeout(500); await pg.screenshot(path='/home/claude/work/shots/t_fail.png'); print('fail ok; errors:',[e for e in errs if 'frame_' not in e][:3]); await ctx.close()
        # 3. reduced motion
        ctx,pg,errs=await new(b,reduced_motion='reduce'); reqs=[]
        pg.on('request',lambda r:reqs.append(r.url) if 'frame_' in r.url else None)
        await pg.goto(URL); await pg.wait_for_function("document.documentElement.classList.contains('ready')",timeout=60000); await pg.wait_for_timeout(800)
        await pg.screenshot(path='/home/claude/work/shots/t_reduced.png'); print('reduced: frames requested',len(reqs),'height',await pg.evaluate("__isu.sections.reveal.h"),'errors',errs); await ctx.close()
        # 4. phone, deep link into the page (GL needed straight away)
        ctx,pg,errs=await new(b); await pg.goto(URL); await pg.wait_for_function("document.documentElement.classList.contains('ready')",timeout=60000)
        H=await pg.evaluate("__isu.sections.lanyard.top+__isu.sections.lanyard.h*0.3"); await ctx.close()
        await b.close()
asyncio.run(main())
