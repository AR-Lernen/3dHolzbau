# Extrahiert die Geometrie aus dem Modell-Export und schreibt model.json
import re, base64, json, sys, collections
import numpy as np
src = sys.argv[1]; out = sys.argv[2]
t = open(src, encoding='utf8').read()
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

floor_of = {}
for top in m['GroupTree']['Groups']:
    def walk(n, fl):
        for e in n.get('elements', []): floor_of[e] = fl
        for c in n.get('children', []): walk(c, fl)
    walk(top, top['name'])

ALT = {'Vollziegel', 'Lehmstein', 'Wand-003'}
COL = {'Vollziegel': '#b4553d', 'Lehmstein': '#c9a06f', 'Wand-003': '#8d8d8d',
       'Wandstiel': '#e0b060', 'Balken': '#d49a4a', 'Beplankung': '#efd9a0', 'Rähm': '#c98d45',
       'Wandschwelle': '#b97f3e', 'Wandmontageschwelle': '#b97f3e', 'Sturz': '#cf9650',
       'Stütze': '#c58a42', 'Decke': '#e6c27a', 'Brüstung': '#dcae62', 'Unterzug': '#c58a42',
       'Auffütterung': '#e0b060', 'Platte': '#e6c27a'}
rgb = lambda h: [int(h[i:i+2], 16) for i in (1, 3, 5)]
layers = collections.OrderedDict()
for e in m['Elements']:
    typ = 'alt' if e['name'] in ALT else 'holz'
    fl = floor_of.get(e['UID'], '?')
    Ly = layers.setdefault((typ, fl), dict(p=[], i=[], c=[], ep=[], ei=[], n=0, en=0))
    for vid in e['volumes']:
        p, i = decode(shapes[vid])
        Ly['i'].append(i + Ly['n']); Ly['p'].append(p); Ly['n'] += len(p)
        Ly['c'].append(np.tile(np.array(rgb(COL.get(e['name'], '#cccccc')), np.uint8), (len(p), 1)))
    for a, b in e['outlines']:
        vid = a if shapes[a]['description']['type'] == 'OUTLINE' else b
        p, i = decode(shapes[vid]); Ly['ei'].append(i + Ly['en']); Ly['ep'].append(p); Ly['en'] += len(p)

b64 = lambda a: base64.b64encode(a.tobytes()).decode()
def idx(a): return ('u16', b64(a.astype('<u2'))) if a.max() < 65536 else ('u32', b64(a.astype('<u4')))
res = []
allp = []
for (typ, fl), Ly in layers.items():
    P = np.concatenate(Ly['p']).astype('<f4'); allp.append(P)
    I = np.concatenate(Ly['i']); EP = np.concatenate(Ly['ep']).astype('<f4'); EI = np.concatenate(Ly['ei'])
    it, ib = idx(I); et, eb = idx(EI)
    res.append(dict(type=typ, floor=fl, p=b64(P), i=ib, it=it, c=b64(np.concatenate(Ly['c'])),
                    ep=b64(EP), ei=eb, eit=et))
A = np.concatenate(allp)
json.dump(dict(name=m['ProjectInfo']['modelName'], min=A.min(0).tolist(), max=A.max(0).tolist(), layers=res),
          open(out, 'w'), separators=(',', ':'))
print(len(res), 'Ebenen', len(A), 'Vertices', A.min(0), A.max(0))
