import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={'width':1632,'height':2592})
        pg.on('pageerror',lambda e:print('ERR',e)); pg.on('console',lambda m:print('c:',m.text))
        await pg.goto('file:///home/claude/isu/dist/cardtest.html'); await pg.wait_for_function('window.done===true',timeout=30000)
        for i in ['f','b']:
            await pg.locator('#'+i).screenshot(path=f'/home/claude/work/mine_{i}.png')
        await b.close()
asyncio.run(main())
