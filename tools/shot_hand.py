import asyncio, sys
from playwright.async_api import async_playwright
views=sys.argv[1:]  # each like "name:yaw=0&pitch=0&open=0"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        for v in views:
            name,qs=v.split(':')
            pg=await b.new_page(viewport={'width':900,'height':900})
            pg.on('console',lambda m:print('console:',m.text))
            pg.on('pageerror',lambda e:print('ERR',e))
            await pg.goto('file:///home/claude/isu/dist/handview.html?'+qs)
            await pg.wait_for_function('window.done===true',timeout=60000)
            await pg.screenshot(path=f'/home/claude/work/hand_{name}.png')
            await pg.close()
        await b.close()
asyncio.run(main())
