# Extrahiert die Geometrie aus dem Modell-Export und schreibt model.json
import re, base64, json, sys, collections
import numpy as np, io
from PIL import Image
src = sys.argv[1]; out = sys.argv[2]
t = open(src, encoding='utf8').read(); t_all = t
bins = {m.group(1): base64.b64decode(m.group(2))
        for m in re.finditer(r'<cwShape id="([^"]+)" base64data="([^"]*)"', t)}
L = t.split('\n')
def js(tag):
    i = next(k for k, l in enumerate(L) if f'id="{tag}"' in l)
    j = next(k for k in range(i, len(L)) if '</script>' in L[k])
    return json.loads('\n'.join(L[i:j+1]).split('>', 1)[1].rsplit('</script>', 1)[0])
g = js('geometryDescriptionFor_scene1'); m = js('modelDescriptionFor_scene1')
shapes = {s['description']['id']: s for s in g['shapes']}

def decode(s):
    b = s['binaryGeometry']; buf = bins[b['src']][b['offset']:b['offset'] + b['binSize']]
    v = b['vertexCount']; pos = np.frombuffer(buf, '<f4', v * 3).reshape(-1, 3)
    if s['description']['type'] == 'SHAPE':
        idx = np.frombuffer(buf, '<u4', b['indexCount'], v * 32)   # pos(12)+normal(12)+uv(8)
        assert len(idx) % 3 == 0
    else:
        idx = np.frombuffer(buf, '<u4', b['indexCount'], v * 12)
    assert idx.max() < v
    return pos, idx

def wood_uv(s):
    # Faserrichtung per Hauptachsenanalyse; UV in Metern: u = entlang der Faser, v = quer. Fläche wird per Normale einer der drei Ebenen zugeordnet.
    b = s['binaryGeometry']; buf = bins[b['src']][b['offset']:b['offset'] + b['binSize']]; v = b['vertexCount']
    P = np.frombuffer(buf, '<f4', v * 3).reshape(-1, 3).astype(float); N = np.frombuffer(buf, '<f4', v * 3, v * 12).reshape(-1, 3).astype(float)
    c = P - P.mean(0); w, V = np.linalg.eigh(c.T @ c if len(P) > 2 else np.eye(3)); a1, a2, a3 = V[:, 2], V[:, 1], V[:, 0]
    uv = np.zeros((v, 2), '<f4')
    for i in range(v):
        n = N[i]; d3, d2 = abs(n @ a3), abs(n @ a2)
        if d3 >= d2 and d3 >= abs(n @ a1): uv[i] = (P[i] @ a1, P[i] @ a2)
        elif d2 >= abs(n @ a1): uv[i] = (P[i] @ a1, P[i] @ a3)
        else: uv[i] = (P[i] @ a2, P[i] @ a3)
    return uv

floor_of = {}
for top in m['GroupTree']['Groups']:
    def walk(n, fl):
        for e in n.get('elements', []): floor_of[e] = fl
        for c in n.get('children', []): walk(c, fl)
    walk(top, top['name'])

ALT = {'Vollziegel', 'Lehmstein', 'Wand-003'}
PLAIN = {'Beplankung'}                       # bleibt einfarbig (kein Foto)
WALLMAP = {'Vollziegel', 'Lehmstein', 'Wand-003', 'Platte'}   # Wände/Platten: Achsenprojektion statt Faserrichtung
COL = {'Vollziegel': '#b4553d', 'Lehmstein': '#c9a06f', 'Wand-003': '#8d8d8d',
       'Wandstiel': '#e0b060', 'Balken': '#d49a4a', 'Beplankung': '#efd9a0', 'Rähm': '#c98d45',
       'Wandschwelle': '#b97f3e', 'Wandmontageschwelle': '#b97f3e', 'Sturz': '#cf9650',
       'Stütze': '#c58a42', 'Decke': '#e6c27a', 'Brüstung': '#dcae62', 'Unterzug': '#c58a42',
       'Auffütterung': '#e0b060', 'Platte': '#e6c27a'}
# Kachelgröße in Metern (u entlang Faser/horizontal, v quer/vertikal) je Bild
TILE = {'cwdbimg_121': (1.2, .5), 'cwdbimg_127': (.5, .5), 'cwdbimg_88_gs': (1.0, .5), 'cwdbimg_5_gs': (.5, .5),
        'cwdbimg_4': (1.4, .7), 'cwdbimg_5': (.5, .5), 'cwdbimg_49': (1.0, .6), 'cwdbimg_54': (1.2, 1.2),
        'cwdbimg_2618': (.8, .8), 'cwdbimg_2614': (.8, .8), 'cwdbimg_269': (1.5, 1.5)}

# Texturen aus dem Export
tbat = {mm.group(1): base64.b64decode(mm.group(2)) for mm in re.finditer(r'<cwTextureBatches id="([^"]+)" base64data="([^"]*)"', t_all)}
texinfo = {}
for tx in g['materialLibrary']['textures']:
    im = tx['imageTexture']; blob = tbat[im['url'][0]][im['offsets'][0]:im['offsets'][0] + im['sizes'][0]]
    texinfo[tx['id']] = dict(key=im['urlAsID'][0], blob=blob, blend=im['blendColor'] if im['model'] == 'BLEND' else None)
imgs = {}
def image_b64(key, blob):
    if key not in imgs:
        im = Image.open(io.BytesIO(blob)).convert('RGB')
        if max(im.size) > 512: im = im.resize((512, 512), Image.LANCZOS)
        buf = io.BytesIO(); im.save(buf, 'JPEG', quality=82, optimize=True); imgs[key] = base64.b64encode(buf.getvalue()).decode()
    return key

def axis_uv(s):
    b = s['binaryGeometry']; buf = bins[b['src']][b['offset']:b['offset'] + b['binSize']]; v = b['vertexCount']
    P = np.frombuffer(buf, '<f4', v * 3).reshape(-1, 3).astype(float); N = np.frombuffer(buf, '<f4', v * 3, v * 12).reshape(-1, 3).astype(float)
    uv = np.zeros((v, 2))
    for i in range(v):
        n = np.abs(N[i])
        if n[1] >= n[0] and n[1] >= n[2]: uv[i] = (P[i][0], P[i][2])
        elif n[0] >= n[2]: uv[i] = (P[i][2], P[i][1])
        else: uv[i] = (P[i][0], P[i][1])
    return uv

rgb = lambda h: [int(h[i:i+2], 16) for i in (1, 3, 5)]
layers = collections.OrderedDict()
for e in m['Elements']:
    typ = 'alt' if e['name'] in ALT else 'holz'
    fl = floor_of.get(e['UID'], '?')
    first = None
    for vid in e['volumes']:
        sp = shapes[vid]; tid = sp['appearance']['materialRefs'][4]
        textured = e['name'] not in PLAIN and tid in texinfo
        key = (typ, fl, e['name'], tid if textured else -1)
        Ly = layers.setdefault(key, dict(p=[], i=[], uv=[], ep=[], ei=[], n=0, en=0, tid=tid if textured else None))
        if first is None: first = Ly
        p, i = decode(sp)
        Ly['i'].append(i + Ly['n']); Ly['p'].append(p); Ly['n'] += len(p)
        if textured:
            ti = texinfo[tid]; tile = TILE.get(ti['key'], (1, 1))
            uv = axis_uv(sp) if e['name'] in WALLMAP else wood_uv(sp)
            Ly['uv'].append((uv / np.array(tile)).astype('<f4'))
    for a, b in e['outlines']:                                   # Kanten nur einmal je Element (an die erste Ebene)
        vid = a if shapes[a]['description']['type'] == 'OUTLINE' else b
        p, i = decode(shapes[vid]); first['ei'].append(i + first['en']); first['ep'].append(p); first['en'] += len(p)

b64 = lambda a: base64.b64encode(a.tobytes()).decode()
def idx(a): return ('u16', b64(a.astype('<u2'))) if a.max() < 65536 else ('u32', b64(a.astype('<u4')))
res = []; allp = []
for (typ, fl, name, tk), Ly in layers.items():
    P = np.concatenate(Ly['p']).astype('<f4'); allp.append(P)
    I = np.concatenate(Ly['i']); it, ib = idx(I)
    if Ly['ep']:
        EP = np.concatenate(Ly['ep']).astype('<f4'); EI = np.concatenate(Ly['ei']); et, eb = idx(EI); epb = b64(EP)
    else: epb = eb = et = None
    d = dict(type=typ, floor=fl, name=name, col=COL.get(name, '#cccccc'), p=b64(P), i=ib, it=it, ep=epb, ei=eb, eit=et)
    if Ly['uv']:
        ti = texinfo[Ly['tid']]; d.update(uv=b64(np.concatenate(Ly['uv'])), img=image_b64(ti['key'], ti['blob']), tint=ti['blend'])
    res.append(d)
A = np.concatenate(allp)
json.dump(dict(name=m['ProjectInfo']['modelName'], min=A.min(0).tolist(), max=A.max(0).tolist(), imgs=imgs, layers=res),
          open(out, 'w'), separators=(',', ':'))
print(len(res), 'Ebenen', len(A), 'Vertices', len(imgs), 'Bilder', sum(len(v) for v in imgs.values()) // 1024, 'KB Bilder')
