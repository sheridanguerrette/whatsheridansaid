#!/usr/bin/env python3
"""One-time migration: per-post JSON (from the Substack export) -> content/posts.json
Cleans leftover Substack widgets, converts post embeds to links, and lints the result."""
import json, glob, re, html, csv, sys
from collections import defaultdict

EXPORT = '/home/claude/substack_export'
SRC = '/home/claude/wss/content/posts'
OUT = '/home/claude/wss-project/content/posts.json'
ep_re = re.compile(r'^S(\d+)\s+(?:E(\d+)|Finale)\s*:\s*(.*)$', re.I)
def norm(t): return re.sub(r'\s+', ' ', t.replace('\u2019', "'")).strip().lower()
def esc(s): return html.escape(s, quote=True)
def text(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()

posts = [json.load(open(f)) for f in sorted(glob.glob(SRC + '/*.json'))]
by_title = {norm(p['title']): p for p in posts}

id_to_slug, slug_to_source = {}, {}
for r in csv.DictReader(open(EXPORT + '/posts.csv')):
    if r['is_published'] != 'true': continue
    pid = r['post_id'].split('.')[0]
    t = r['title'].strip(); m = ep_re.match(t); rest = m.group(3).strip() if m else t
    p = by_title.get(norm(rest))
    if p: id_to_slug[pid] = p['slug']; slug_to_source[p['slug']] = pid
title_of = {p['slug']: p['title'] for p in posts}
assert len(id_to_slug) == len(posts), f"id map incomplete: {len(id_to_slug)} of {len(posts)}"

def match_close(b, start, tag='div'):
    depth = 0
    for m in re.finditer(r'</?%s\b[^>]*>' % tag, b[start:], re.I):
        depth += -1 if m.group(0).startswith('</') else 1
        if depth == 0: return start + m.end()
    return None

def clean(p, stats):
    b = p['body']

    def embed(m):
        try: d = json.loads(html.unescape(m.group(1)))
        except Exception: return ''
        slug = id_to_slug.get(str(d.get('id')))
        stats['embeds'] += 1
        if not slug: return ''
        return f'<p><a href="/read/{slug}.html">{esc(title_of[slug])}</a></p>'
    b = re.sub(r'<div class="digest-post-embed" data-attrs="([^"]*)"></div>', embed, b)

    while True:
        i = b.find('<div class="embedded-post-wrap"')
        if i < 0: break
        j = match_close(b, i)
        blk = b[i:j]
        href = re.search(r'<a class="embedded-post"[^>]*href="([^"]+)"', blk)
        ttl = re.search(r'class="embedded-post-title"[^>]*>(.*?)</div>', blk, re.S)
        rep = f'<p><a href="{href.group(1)}">{esc(text(ttl.group(1)))}</a></p>' if href and ttl else ''
        b = b[:i] + rep + b[j:]

    b, n = re.subn(r'<div class="paywall-jump"[^>]*></div>', '', b); stats['paywall_markers'] += n
    b, n = re.subn(r'<div class="native-video-embed"[^>]*></div>', '', b)
    if n: stats['videos'].append(p['title'])

    def figure(blk):
        href = re.search(r'<a class="image-link[^"]*"[^>]*href="([^"]+)"', blk)
        cap = re.search(r'<figcaption[^>]*>(.*?)</figcaption>', blk, re.S)
        if not href: return ''
        c = f'<figcaption>{cap.group(1)}</figcaption>' if cap and text(cap.group(1)) else ''
        stats['figures'] += 1
        return f'<figure><img src="{href.group(1)}" alt="">{c}</figure>'
    while True:
        i = b.find('<div class="captioned-image-container"')
        if i < 0: break
        j = match_close(b, i)
        b = b[:i] + figure(b[i:j]) + b[j:]

    for pat in (r'read this episode on the WSS platform', r'Take a peek at the Substack platform', r'[Ii]ndependently hosted on both'):
        b, n = re.subn(r'<p[^>]*>(?:(?!</p>).)*?%s(?:(?!</p>).)*?</p>' % pat, '', b, flags=re.S)
        stats['promo_paras'] += n

    b, n = re.subn(r'<a [^>]*href="https?://(?:www\.)?(?:whatsheridansaid|sheridanguerrette)\.substack\.com[^"]*"[^>]*>(.*?)</a>', r'\1', b, flags=re.S)
    stats['unlinked'] += n

    def wix(m):
        s = m.group(1)
        return f'href="/read/{s}.html"' if s in title_of else m.group(0)
    b = re.sub(r'href="https?://(?:www\.)?whatsheridansaid\.com/post/([^"/?#]+)"', wix, b)

    b = re.sub(r'<p[^>]*>\s*(?:<br\s*/?>\s*)*</p>', '', b)
    return b.strip()

stats = defaultdict(int); stats['videos'] = []
out = []
for p in posts:
    body = clean(p, stats)
    out.append({
        'id': p['slug'], 'slug': p['slug'], 'title': p['title'], 'subtitle': p['subtitle'],
        'kind': p['kind'], 'season': p['season'], 'episode': p['episode'], 'finale': bool(p['finale']),
        'audience': p['audience'], 'status': 'published' if p['published'] else 'draft',
        'date': p['date'], 'cover': p['cover'] or '', 'featured': bool(p['featured']),
        'spotlight': bool(p['spotlight']), 'sourceId': slug_to_source.get(p['slug']), 'body': body,
    })

problems = []
bad = ['Previously on', 'WSS is independently hosted', 'button-wrapper', 'Substack link', 'WSS Link',
       'digest-post-embed', 'paywall-jump', 'captioned-image', 'pencraft', 'read this episode on the WSS',
       'native-video', 'embedded-post']
for x in out:
    t = len(text(x['body']))
    floor = 120 if x['kind'] == 'poem' else 400
    if t < floor: problems.append(f"{x['title'][:50]}: only {t} chars of text")
    for pat in bad:
        if pat in x['body']: problems.append(f"{x['title'][:50]}: still contains '{pat}'")
    if not x['cover']: problems.append(f"{x['title'][:50]}: no cover image")
if problems:
    print("LINT FAILED:"); [print('  -', q) for q in problems]; sys.exit(1)

json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(f"wrote {len(out)} posts -> {OUT}")
print({k: v for k, v in stats.items() if k != 'videos'})
print("posts that had videos (dropped):", stats['videos'])
