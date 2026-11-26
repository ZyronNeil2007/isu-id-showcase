# Renders the supplied lanyard SVG into texture layers (build-time only).
# Every layer is produced from the original SVG markup; nothing is redrawn.
import asyncio, re, base64, sys
from playwright.async_api import async_playwright
SRC='/home/claude/isu/assets/raw/lanyard.svg'
OUT='/home/claude/isu/assets/lanyard/'
svg=open(SRC,encoding='utf8').read()
# name, show-selector, region (x0,y0,w,h in mm), px per mm
LAYERS=[
 ('base',     '#strip-background,#wave-pattern,#end-stripes-left,#end-stripes-right', (10,10,900,20), 4),
 ('values',   '#values-text', (68,10,258,20), 16),
 ('flame',    '#flame-left',  (332,11,20,18), 44),
 ('ornament', '#ornament-left',(372,10,66,20), 32),
 ('seal',     '#seal-center', (451,11,18,18), 40),
 ('wordmark', '#university-name',(618,11,239,18), 20),
 ('clip',     'CLIP', (10,50,50,20), 24),
]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for name,sel,(x,y,w,h),k in LAYERS:
            W,H=round(w*k),round(h*k)
            t=re.sub(r'viewBox="0 0 920 190" width="920mm" height="190mm"',f'viewBox="{x} {y} {w} {h}" width="{W}" height="{H}"',svg,1)
            if sel=='CLIP':
                css='#lanyard-strip,#id-card,svg>rect,#clip-end-piece>text{display:none}'
            else:
                css=f'#lanyard-strip>*,#clip-end-piece,#id-card,svg>rect{{display:none}} {sel.replace(",","{display:inline !important} ")}{{display:inline !important}}'
            t=t.replace('</defs>','</defs><style>'+css+'</style>',1)
            t=t.replace('<svg ','<svg id="s" style="display:block" ',1)
            html=f'<!doctype html><html><body style="margin:0;background:transparent">{t}</body></html>'
            pg=await b.new_page(viewport={'width':W,'height':H})
            await pg.set_content(html)
            await pg.wait_for_timeout(400)
            await pg.screenshot(path=OUT+name+'.png',omit_background=True,clip={'x':0,'y':0,'width':W,'height':H})
            print(name,W,H)
            await pg.close()
        await b.close()
asyncio.run(main())
