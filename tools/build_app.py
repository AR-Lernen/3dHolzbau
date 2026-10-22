#!/usr/bin/env python3
"""AR-Baukasten: Cadwork-WebViewer-Export (HTML) -> eigenständige AR-Webapp (index.html)

  python3 tools/build_app.py analyze EXPORT.html [--write-config config/projekt.json]
      Listet Bauteile, Geschosse, Texturen und Abmessungen auf und schlägt eine Konfiguration vor.

  python3 tools/build_app.py build EXPORT.html config/projekt.json [-o index.html]
      Liest die Geometrie, ordnet Texturen zu, bettet alles samt three.js ein und schreibt index.html.

Format des Exports (Cadwork 3d WebViewer, "Model WebViewer" als eine HTML-Datei):
  <script id="modelDescriptionFor_scene1">   JSON: Elements, GroupTree (Geschosse), Annotations
  <script id="geometryDescriptionFor_scene1"> JSON: shapes (Geometrie-Beschreibung), materialLibrary (Texturen)
  <cwShape id="shapes/batch_N.bin" base64data>   Binärdaten: je Shape  float32 Positionen (v*3), float32 Normalen (v*3),
                                                 float32 UVs (v*2), uint32 Dreiecksindizes;  OUTLINE: Positionen + uint32 Linienpaare
  <cwTextureBatches id="textures/_N.ctbin">      aneinandergereihte JPEGs (offsets/sizes aus materialLibrary.textures)
  Einheit: Meter, Y ist oben.  materialRefs[4] eines Shapes = Textur-ID.
"""
import argparse, base64, collections, io, json, os, re, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------- Export lesen
class Export:
    def __init__(self, path):
        self.text = open(path, encoding='utf8').read()
        self.bins = {m.group(1): base64.b64decode(m.group(2))
                     for m in re.finditer(r'<cwShape id="([^"]+)" base64data="([^"]*)"', self.text)}
        self.tex_batches = {m.group(1): base64.b64decode(m.group(2))
                            for m in re.finditer(r'<cwTextureBatches id="([^"]+)" base64data="([^"]*)"', self.text)}
        lines = self.text.split('\n')
        self.geom = self._json(lines, 'geometryDescriptionFor_scene1')
        self.model = self._json(lines, 'modelDescriptionFor_scene1')
        self.shapes = {s['description']['id']: s for s in self.geom['shapes']}
        self.floor_of = {}
        for top in self.model.get('GroupTree', {}).get('Groups', []):
            self._walk(top, top['name'])
        self.textures = {}
        for tx in self.geom.get('materialLibrary', {}).get('textures', []):
            im = tx['imageTexture']
            blob = self.tex_batches[im['url'][0]][im['offsets'][0]:im['offsets'][0] + im['sizes'][0]]
            self.textures[tx['id']] = dict(key=im['urlAsID'][0], blob=blob, blend=im['blendColor'] if im['model'] == 'BLEND' else None)
        self.elements = [e for e in self.model['Elements'] if e.get('volumes')]

    @staticmethod
    def _json(lines, tag):
        i = next(k for k, l in enumerate(lines) if f'id="{tag}"' in l)
        j = next(k for k in range(i, len(lines)) if '</script>' in lines[k])
        return json.loads('\n'.join(lines[i:j + 1]).split('>', 1)[1].rsplit('</script>', 1)[0])

    def _walk(self, node, floor):
        for e in node.get('elements', []): self.floor_of[e] = floor
        for c in node.get('children', []): self._walk(c, floor)

    def floor(self, e): return self.floor_of.get(e['UID'], '?')

    def raw(self, shape):
        b = shape['binaryGeometry']
        return b, self.bins[b['src']][b['offset']:b['offset'] + b['binSize']]

    def decode(self, shape):
        """-> Positionen (v,3), Indizes. SHAPE: Dreiecke, OUTLINE: Linienpaare."""
        b, buf = self.raw(shape); v = b['vertexCount']
        pos = np.frombuffer(buf, '<f4', v * 3).reshape(-1, 3)
        off = v * 32 if shape['description']['type'] == 'SHAPE' else v * 12     # pos(12)+normal(12)+uv(8)
        idx = np.frombuffer(buf, '<u4', b['indexCount'], off)
        if shape['description']['type'] == 'SHAPE': assert len(idx) % 3 == 0
        assert idx.max() < v, 'Indexpuffer passt nicht zum erwarteten Format'
        return pos, idx

    def pos_normals(self, shape):
        b, buf = self.raw(shape); v = b['vertexCount']
        return (np.frombuffer(buf, '<f4', v * 3).reshape(-1, 3).astype(float),
                np.frombuffer(buf, '<f4', v * 3, v * 12).reshape(-1, 3).astype(float))

    def bbox(self, pred):
        lo, hi = np.full(3, 1e9), np.full(3, -1e9)
        for e in self.elements:
            if pred(e):
                d = self.shapes[e['volumes'][0]]['description']; lo = np.minimum(lo, d['bboxMin']); hi = np.maximum(hi, d['bboxMax'])
        return lo, hi


# ---------------------------------------------------------------- UV-Berechnung
def fiber_uv(ex, shape):
    """Holz: u entlang der Faser (Hauptachse des Bauteils), v quer; je Fläche nach Normale in eine der 3 Ebenen projiziert."""
    P, N = ex.pos_normals(shape)
    c = P - P.mean(0); _, V = np.linalg.eigh(c.T @ c if len(P) > 2 else np.eye(3)); a1, a2, a3 = V[:, 2], V[:, 1], V[:, 0]
    uv = np.zeros((len(P), 2))
    for i in range(len(P)):
        n = N[i]; d3, d2 = abs(n @ a3), abs(n @ a2)
        if d3 >= d2 and d3 >= abs(n @ a1): uv[i] = (P[i] @ a1, P[i] @ a2)
        elif d2 >= abs(n @ a1): uv[i] = (P[i] @ a1, P[i] @ a3)
        else: uv[i] = (P[i] @ a2, P[i] @ a3)
    return uv


def axis_uv(ex, shape):
    """Wände/Platten: Projektion auf die Weltachsen (u horizontal, v vertikal)."""
    P, N = ex.pos_normals(shape); uv = np.zeros((len(P), 2))
    for i in range(len(P)):
        n = np.abs(N[i])
        if n[1] >= n[0] and n[1] >= n[2]: uv[i] = (P[i][0], P[i][2])
        elif n[0] >= n[2]: uv[i] = (P[i][2], P[i][1])
        else: uv[i] = (P[i][0], P[i][1])
    return uv


# ---------------------------------------------------------------- Analyse
ALT_HINTS = ('ziegel', 'mauer', 'stein', 'beton', 'fundament', 'bestand', 'altbau', 'wand-0', 'putz')


def analyze(ex, write_config=None):
    stats = collections.OrderedDict()
    for e in ex.elements:
        s = stats.setdefault(e['name'], dict(n=0, floors=collections.Counter(), dims=[], tex=collections.Counter()))
        s['n'] += 1; s['floors'][ex.floor(e)] += 1
        d = ex.shapes[e['volumes'][0]]['description']; s['dims'].append(sorted(np.array(d['bboxMax']) - np.array(d['bboxMin'])))
        for v in e['volumes']:
            t = ex.shapes[v]['appearance']['materialRefs'][4]
            if t in ex.textures: s['tex'][ex.textures[t]['key']] += 1
    lo, hi = ex.bbox(lambda e: True)
    print(f"Projekt (intern, nicht veröffentlichen): {ex.model['ProjectInfo'].get('modelName')}")
    print(f"Elemente: {len(ex.elements)}   Shapes: {len(ex.shapes)}   Texturen: {len(ex.textures)}")
    print(f"Ausdehnung (m): {np.round(hi - lo, 2).tolist()}   Min: {np.round(lo, 2).tolist()}   Max: {np.round(hi, 2).tolist()}")
    if max(hi - lo) > 500: print("!! Ausdehnung > 500 – vermutlich Millimeter statt Meter; Export prüfen.")
    if min(hi - lo) < 0.5: print("!! Ausdehnung < 0,5 m – vermutlich falsche Einheit.")
    print(f"Geschosse (Gruppen der obersten Ebene): {[g['name'] for g in ex.model.get('GroupTree', {}).get('Groups', [])]}")
    print("\nBauteile (Name | Anzahl | Geschosse | Medianmaß klein/mittel/groß in m | Texturen)")
    for n, s in stats.items():
        med = np.median(np.array(s['dims']), axis=0).round(3).tolist()
        print(f"  {n:24s} {s['n']:4d}  {dict(s['floors'])}  {med}  {dict(s['tex'])}")
    alt = [n for n in stats if any(h in n.lower() for h in ALT_HINTS)]
    vol = lambda n: float(sum(np.prod(d) for d in stats[n]['dims']))          # Summe der Bounding-Box-Volumen
    clad = [n for n in stats if 'beplank' in n.lower() or 'schalung' in n.lower()]
    neu = sorted((n for n in stats if n not in alt and n not in clad), key=lambda n: -stats[n]['n'])      # häufigstes Neubau-Bauteil = Grundriss
    floors = [g['name'] for g in ex.model.get('GroupTree', {}).get('Groups', [])]
    ref_floor = 'EG' if 'EG' in floors else None
    cfg = dict(
        title='AR-Viewer', public_name='Modell', labels=dict(alt='Altbau', neu='Neubau'),
        altbau_names=alt, plain_names=clad, cladding_names=clad,
        wallmap_names=alt, floor_order=[g['name'] for g in ex.model.get('GroupTree', {}).get('Groups', [])],
        colors={}, tiles={}, tile_default=[1.0, 1.0],
        reference=dict(altbau_names=sorted(alt, key=lambda n: -vol(n))[:1], altbau_floor=ref_floor, neubau_names=neu[:1], neubau_floor=ref_floor),
        texture_max_px=512)
    print('\nVorschlag (bitte prüfen!): altbau_names =', alt)
    if write_config:
        json.dump(cfg, open(write_config, 'w', encoding='utf8'), ensure_ascii=False, indent=2)
        print('Konfigurationsentwurf geschrieben:', write_config)
    return cfg


# ---------------------------------------------------------------- Bauen
def build(ex, cfg, out_html):
    alt_names, plain, wallmap = set(cfg['altbau_names']), set(cfg.get('plain_names', [])), set(cfg.get('wallmap_names', []))
    tiles = json.load(open(os.path.join(HERE, 'config', 'tiles_default.json'), encoding='utf8'))['tiles']
    tiles.update(cfg.get('tiles', {}))
    tile_def, max_px = tuple(cfg.get('tile_default', [1.0, 1.0])), cfg.get('texture_max_px', 512)
    imgs = {}

    def image_b64(key, blob):
        if key not in imgs:
            im = Image.open(io.BytesIO(blob)).convert('RGB')
            if max(im.size) > max_px: im = im.resize((max_px, max_px), Image.LANCZOS)
            buf = io.BytesIO(); im.save(buf, 'JPEG', quality=82, optimize=True); imgs[key] = base64.b64encode(buf.getvalue()).decode()
        return key

    def avg_color(tex):
        im = Image.open(io.BytesIO(tex['blob'])).convert('RGB').resize((8, 8)); a = np.asarray(im, float).reshape(-1, 3).mean(0) / 255
        if tex['blend']: a = a * np.array(tex['blend'])
        return '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in np.clip(a, 0, 1))

    layers = collections.OrderedDict()
    for e in ex.elements:
        typ = 'alt' if e['name'] in alt_names else 'holz'
        fl, first = ex.floor(e), None
        for vid in e['volumes']:
            sp = ex.shapes[vid]; tid = sp['appearance']['materialRefs'][4]
            textured = e['name'] not in plain and tid in ex.textures
            Ly = layers.setdefault((typ, fl, e['name'], tid if textured else -1),
                                   dict(p=[], i=[], uv=[], ep=[], ei=[], n=0, en=0, tid=tid if textured else None, ref=tid))
            first = first or Ly
            p, i = ex.decode(sp); Ly['i'].append(i + Ly['n']); Ly['p'].append(p); Ly['n'] += len(p)
            if textured:
                tile = tuple(tiles.get(ex.textures[tid]['key'], tile_def))
                uv = axis_uv(ex, sp) if e['name'] in wallmap else fiber_uv(ex, sp)
                Ly['uv'].append((uv / np.array(tile)).astype('<f4'))
        for a, b in e['outlines']:                      # Kanten je Element nur einmal
            vid = a if ex.shapes[a]['description']['type'] == 'OUTLINE' else b
            p, i = ex.decode(ex.shapes[vid]); first['ei'].append(i + first['en']); first['ep'].append(p); first['en'] += len(p)

    b64 = lambda a: base64.b64encode(a.tobytes()).decode()
    idx = lambda a: ('u16', b64(a.astype('<u2'))) if a.max() < 65536 else ('u32', b64(a.astype('<u4')))
    default_col = {'alt': '#a8a29a', 'holz': '#d9a95f'}
    res, allp = [], []
    for (typ, fl, name, _), Ly in layers.items():
        P = np.concatenate(Ly['p']).astype('<f4'); allp.append(P); it, ib = idx(np.concatenate(Ly['i']))
        epb = eb = et = None
        if Ly['ep']: et, eb = idx(np.concatenate(Ly['ei'])); epb = b64(np.concatenate(Ly['ep']).astype('<f4'))
        col = cfg.get('colors', {}).get(name) or (avg_color(ex.textures[Ly['ref']]) if Ly['ref'] in ex.textures else default_col[typ])
        d = dict(type=typ, floor=fl, name=name, col=col, p=b64(P), i=ib, it=it, ep=epb, ei=eb, eit=et)
        if Ly['uv']:
            ti = ex.textures[Ly['tid']]; d.update(uv=b64(np.concatenate(Ly['uv'])), img=image_b64(ti['key'], ti['blob']), tint=ti['blend'])
        res.append(d)
    A = np.concatenate(allp)

    # Referenz: Außenmaße des Bestands und Grundriss des Neubaus (für die Referenzwand-Auswahl)
    r = cfg.get('reference', {})
    anames, nnames = set(r.get('altbau_names') or alt_names), set(r.get('neubau_names') or [])
    af, nf = r.get('altbau_floor'), r.get('neubau_floor')
    def ref_box(names, floor):
        lo, hi = ex.bbox(lambda e: e['name'] in names and (floor is None or ex.floor(e) == floor))
        if lo[0] > hi[0]:
            print(f"!! Referenz {sorted(names)} im Geschoss {floor!r} nicht gefunden – nehme alle Geschosse.")
            lo, hi = ex.bbox(lambda e: e['name'] in names)
        if lo[0] > hi[0]: sys.exit(f"Referenz-Bauteile {sorted(names)} existieren nicht – 'reference' in der Konfiguration prüfen.")
        return lo, hi
    alo, ahi = ref_box(anames, af)
    nlo, nhi = ref_box(nnames, nf) if nnames else (alo, ahi)
    ref = dict(x0=float(alo[0]), x1=float(ahi[0]), z0=float(alo[2]), z1=float(ahi[2]), y=float(alo[1]),
               hx0=float(nlo[0]), hx1=float(nhi[0]), hz0=float(nlo[2]), hz1=float(nhi[2]))
    web_cfg = dict(floor_order=cfg.get('floor_order', []), cladding_names=cfg.get('cladding_names', []), labels=cfg['labels'])
    model = dict(name=cfg.get('public_name', 'Modell'), min=A.min(0).tolist(), max=A.max(0).tolist(), imgs=imgs, ref=ref, cfg=web_cfg, layers=res)

    tpl = open(os.path.join(HERE, 'app_template.html'), encoding='utf8').read()
    three = open(os.path.join(HERE, 'vendor', 'three.min.js'), encoding='utf8').read().replace('</script', '<\\/script')
    for old, new in (('Altbau', cfg['labels']['alt']), ('Holzbau', cfg['labels']['neu'])): tpl = tpl.replace(old, new)
    tpl = tpl.replace('<title>%s AR</title>' % cfg['labels']['neu'], '<title>%s</title>' % cfg['title'], 1)
    html = tpl.replace('/*THREE*/', three, 1).replace('/*MODEL*/', json.dumps(model, separators=(',', ':')), 1)

    # Anonymitätsprüfung: interner Projektname darf nicht im Ergebnis stehen
    internal = ex.model['ProjectInfo'].get('modelName') or ''
    if internal and internal.lower() in html.lower() and internal.lower() != cfg.get('public_name', '').lower():
        print(f"!! WARNUNG: interner Projektname '{internal}' kommt im Ergebnis vor – bitte prüfen.")
    open(out_html, 'w', encoding='utf8').write(html)
    print(f"{out_html}: {os.path.getsize(out_html) / 1e6:.1f} MB · {len(res)} Ebenen · {len(A)} Vertices · {len(imgs)} Texturen")
    print('Referenz:', {k: round(v, 2) for k, v in ref.items()})
    return ref


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    a = sub.add_parser('analyze'); a.add_argument('export'); a.add_argument('--write-config')
    b = sub.add_parser('build'); b.add_argument('export'); b.add_argument('config'); b.add_argument('-o', '--out', default='index.html')
    args = ap.parse_args()
    ex = Export(args.export)
    if args.cmd == 'analyze': analyze(ex, args.write_config)
    else: build(ex, json.load(open(args.config, encoding='utf8')), args.out)


if __name__ == '__main__':
    main()
