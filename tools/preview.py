import re, json, glob, os, base64
os.chdir('/home/claude/wss-project')
css = open('src/assets/style.css').read()
js = open('src/assets/site.js').read()
portrait = 'data:image/jpeg;base64,' + base64.b64encode(open('src/assets/portrait.png','rb').read()).decode() if False else ''
def b64(path): return 'data:image/jpeg;base64,' + base64.b64encode(open(path,'rb').read()).decode()
HERO=b64('src/assets/hero.jpg'); FEAT=b64('src/assets/feature.jpg'); ASPOT=b64('src/assets/about-spotlight.jpg'); POET=b64('src/assets/poetry-hero-real.jpg')
def prep(s, depth):
    b = re.search(r'<header id="top">.*?</footer>', s, re.S).group(0)
    pre = '../' if depth else ''
    b = b.replace('href="%sindex.html#top"' % pre, 'href="#" data-go="home"').replace('href="%sindex.html"' % pre, 'href="#" data-go="home"')
    b = b.replace('href="%spoetry.html"' % pre, 'href="#" data-go="poetry"')
    b = b.replace('href="%sabout.html"' % pre, 'href="#" data-go="about"')
    b = b.replace('href="%sarchive.html"' % pre, 'href="#" data-go="archive"')
    b = b.replace('src="assets/hero.jpg"', 'src="'+HERO+'"').replace('src="assets/feature.jpg"', 'src="'+FEAT+'"').replace('src="assets/about-spotlight.jpg"', 'src="'+ASPOT+'"').replace('src="assets/poetry-hero-real.jpg"', 'src="'+POET+'"')
    b = re.sub(r'src="(?:\.\./)?assets/[^"]+"', 'src=""', b)
    b = re.sub(r'href="(?:read/)?([a-z0-9\-]+)\.html"', r'href="#\1" data-go="\1"', b)
    return b
pages = {}
for f in sorted(glob.glob('dist/read/*.html')):
    pages[os.path.basename(f)[:-5]] = prep(open(f).read(), 1)
pages['home'] = prep(open('dist/index.html').read(), 0)
pages['poetry'] = prep(open('dist/poetry.html').read(), 0)
pages['about'] = prep(open('dist/about.html').read(), 0)
pages['archive'] = prep(open('dist/archive.html').read(), 0)
_i = js.index('// ---------- subscribe forms')
JS1 = js[:_i] + '})();'
JS2 = '(function(){' + js[_i:]
import glob as _g
CANDS=[]
# ---HERO VARIANTS---
COPY = '<div class="pb-copy"><div class="eyebrow">Three Poems a Day &mdash; Some You Get</div><h1>Poetry</h1><p>Poetry taught her how to read &mdash; not just the letters on the page, but the emotions moving beneath them.</p><a href="#free" class="pb-link">Start with the free poems &darr;</a></div>'
VA = '<section class="page-billboard pb-bright"><div class="pb-bg"><img class="pb-photo" src="' + b64('/tmp/v/A.jpg') + '" alt=""></div>' + COPY + '</section>'
VB = '<section class="pb-framed">' + COPY + '<figure class="pbf-photo"><img src="' + b64('/tmp/v/B.jpg') + '" alt=""></figure></section>'
VC = ('<section class="pb-polas">' + COPY + '<div class="polas">'
      '<figure class="pola p2"><img src="' + b64('/tmp/v/C2.jpg') + '" alt=""></figure>'
      '<figure class="pola p3"><img src="' + b64('/tmp/v/C3.jpg') + '" alt=""></figure>'
      '<figure class="pola p1"><img src="' + b64('/tmp/v/C1.jpg') + '" alt=""></figure></div></section>')
VD = ('<section class="pbd"><div class="pb-bg"><img class="pbd-glow" src="' + b64('/tmp/cands/c3.jpg') + '" alt=""><img class="pbd-main" src="' + b64('/tmp/cands/c3.jpg') + '" alt=""></div>' + COPY + '</section>')
VE = '<section class="page-billboard pb-wide"><div class="pb-bg"><img class="pb-photo" src="' + b64('/tmp/v/E.jpg') + '" alt=""></div>' + COPY + '</section>'
HV = {'A': VA, 'B': VB, 'C': VC, 'D': VD, 'E': VE}
def js_json(o): return json.dumps(o).replace('</', '<\\/')
doc = ('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1,viewport-fit=cover">'
 '<title>What Sheridan Said - Preview</title>'
 '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Gloock&family=Questrial&display=swap" rel="stylesheet">'
 '<style>' + css + '\n#pk{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);flex-wrap:wrap;justify-content:center;max-width:94vw;border-radius:18px !important;z-index:9998;background:#fff;color:#000;font:13px Questrial,sans-serif;padding:8px 12px;display:flex;gap:8px;align-items:center;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.4)}#pk button{padding:0 12px;height:30px;white-space:nowrap;border-radius:999px;border:1px solid #000;background:#fff;color:#000;cursor:pointer;font:13px Questrial,sans-serif}#pk button.on{background:#000;color:#fff}body{padding-top:38px}header{top:38px !important}.pv-bar{position:fixed;top:0;left:0;right:0;z-index:9999;background:#fff;color:#000;font:13px Questrial,sans-serif;padding:9px 14px;text-align:center;letter-spacing:.04em}</style></head><body>'
 '<div class="pv-bar">PREVIEW &mdash; click any episode or poem card to open it. Previous / Next work at the bottom of each episode.</div>'
 '<div class="cursor-heart" id="cursorHeart">&#9825;</div><div id="stage"></div>'
 '<script>var HV=' + js_json(HV) + ';var CANDS=' + js_json(CANDS) + ';var PAGES=' + js_json(pages) + ''';
function go(slug){var s=PAGES[slug]?slug:'home';document.getElementById('stage').innerHTML=PAGES[s];window.scrollTo(0,0);if(window.initPage)initPage();addPicker(s);}
function setHero(v){var sec=document.querySelector('.page-billboard,.pb-framed,.pb-polas,.pbd');if(!sec)return;var t=document.createElement('div');t.innerHTML=HV[v];sec.replaceWith(t.firstChild);document.querySelectorAll('#pk button').forEach(function(b){b.className=b.getAttribute('data-v')===v?'on':'';});window.scrollTo(0,0);}
function addPicker(s){var old=document.getElementById("pk");if(old)old.remove();return;var d=document.createElement("div");d.id="pk";var L=[["A","A &middot; Brighter"],["B","B &middot; Framed photo"],["C","C &middot; Polaroids"],["D","D &middot; Original dark frame"],["E","E &middot; Extended shade"]];var h="<span>Poetry hero:</span>";L.forEach(function(x){h+="<button data-v="+x[0]+">"+x[1]+"</button>";});d.innerHTML=h;document.body.appendChild(d);setHero("E");}
document.addEventListener('click',function(e){
var pkb=e.target.closest('#pk button');if(pkb){setHero(pkb.getAttribute('data-v'));return;}
var ar=e.target.closest('.slider-arrow');
if(ar){var row=ar.closest('.slider-wrap').querySelector('.row');row.scrollBy({left:(ar.classList.contains('left')?-1:1)*row.clientWidth,behavior:'smooth'});return;}
var a=e.target.closest('a');if(!a)return;e.preventDefault();var g=a.getAttribute('data-go');if(g)go(g);});
document.addEventListener('submit',function(e){e.preventDefault();});
go('home');</script><script>try{''' + JS1 + '''}catch(err){}</script><script>function initPage(){try{''' + JS2 + '''}catch(err){}}initPage();</script></body></html>''')
open('/mnt/user-data/outputs/wss-preview.html', 'w').write(doc)
print(len(pages), len(doc))
