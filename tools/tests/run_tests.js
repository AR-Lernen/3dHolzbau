// Automatische Prüfung der gebauten App (Desktop-Chromium + simuliertes WebXR).
//   cd tools/tests && npm install playwright iwer && node run_tests.js ../../index.html
// Umgebungsvariablen: CHROMIUM (Pfad zu Chromium, sonst Playwright-Standard), IWER_JS (Pfad zu iwer.min.js)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const file = path.resolve(process.argv[2] || '../../index.html');
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) fails++; };
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

(async () => {
  const launch = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] };
  if (process.env.CHROMIUM) launch.executablePath = process.env.CHROMIUM;
  const browser = await chromium.launch(launch);
  const errors = [];

  // ---------- 1. Vorschau, Ebenen, Referenzwände ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, permissions: ['camera'] }), p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.goto('file://' + file); await p.waitForTimeout(3000);
    const r = await p.evaluate(() => ({
      layers: layers.length, textured: layers.filter(l => l.mats[0].map).length, names: names.alt.length + names.holz.length,
      walls: Object.fromEntries(Object.entries(WALLS).map(([k, w]) => [k, w.len])), size: bsize.toArray(),
    }));
    ok(r.layers > 0, `Ebenen geladen (${r.layers}, davon ${r.textured} mit Foto-Textur)`);
    ok(Object.keys(r.walls).length === 4 && Object.values(r.walls).every(v => v > 1), 'vier Referenzwände mit plausibler Länge ' + JSON.stringify(Object.fromEntries(Object.entries(r.walls).map(([k, v]) => [k, +v.toFixed(2)]))));
    ok(r.size.every(v => v > 1 && v < 500), 'Modellausdehnung in Metern plausibel ' + r.size.map(v => v.toFixed(1)).join(' × '));
    // Schnellvorgabe Tragwerk
    const tr = await p.evaluate(() => { document.querySelector('[data-pre="trag"]').click(); return CLAD.map(n => vis[n]); });
    ok(tr.every(v => v === false), 'Vorgabe „Tragwerk“ blendet Verkleidung aus');
    // Referenzwand wählen
    const w = await p.evaluate(() => { chooseWall('anbau'); return { A: ptA, B: ptB, wall: refWall }; });
    ok(w.wall === 'anbau' && w.A && w.B, 'Referenzwand setzt A und B');
    // Ausrichtungsmathematik
    const m = await p.evaluate(() => {
      align.mode = 'fix'; align.a = new THREE.Vector3(1, .1, 2); align.b = new THREE.Vector3(1 + 3, .1, 2 + 4); align.adj.set(0, 0, 0); align.yaw = 0; applyAlignment();
      const A = new THREE.Vector3(...ptA).applyMatrix4(model.matrixWorld), B = new THREE.Vector3(...ptB).applyMatrix4(model.matrixWorld);
      return { dA: A.distanceTo(align.a), dir: B.clone().sub(A).setY(0).normalize().distanceTo(align.b.clone().sub(align.a).setY(0).normalize()), s: model.scale.x };
    });
    ok(m.dA < 1e-4 && m.dir < 1e-4 && m.s === 1, 'Zwei-Punkt-Ausrichtung: A liegt auf a, Richtung A→B stimmt, Maßstab 1,0');
    await p.evaluate(() => document.getElementById('layPanel').classList.remove('hide'));
    const free = await p.evaluate(() => { for (let y = 60; y < 800; y += 10) for (const x of [30, 200, 370]) if (document.elementFromPoint(x, y) && document.elementFromPoint(x, y).id === 'gl') return [x, y]; return null; });
    if (free) { await p.mouse.click(free[0], free[1]); await p.waitForTimeout(200); }
    ok(await p.evaluate(() => document.getElementById('layPanel').classList.contains('hide')), 'Vorschau: Tipp ins Bild schließt das Ebenen-Menü ' + JSON.stringify(free));
    // Ring muss aus jeder Richtung sichtbar sein (Trefferfläche vom Gerät kann beliebig orientiert sein)
    const ring = await p.evaluate(() => {
      for (const l of layers) l.mesh.visible = l.occ.visible = false; document.getElementById('pvPanel').style.display = 'none';
      orb.t.set(0, 0, 0); orb.r = 0.5; orb.el = 0.9; orb.az = 0.3; applyOrbit();
      const gl = renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, buf = new Uint8Array(W * H * 4), res = {};
      for (const [k, m] of [['oben', new THREE.Matrix4()], ['kopfüber', new THREE.Matrix4().makeRotationX(Math.PI)]]) {
        reticle.matrix.copy(m); reticle.matrixWorld.copy(m); reticle.matrixWorldNeedsUpdate = true; reticle.visible = true;
        renderer.render(scene, camera); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let n = 0; for (let i = 0; i < buf.length; i += 4) if (buf[i] > 240 && buf[i + 1] > 240 && buf[i + 2] > 240) n++; res[k] = n;
      }
      reticle.visible = false; return res;
    });
    ok(ring['oben'] > 200 && ring['kopfüber'] > 200, 'Ring wird gezeichnet, auch bei umgekehrter Flächenorientierung ' + JSON.stringify(ring));
    await ctx.close();
  }

  // ---------- 3. AR-Ablauf mit simuliertem WebXR (IWER) ----------
  let iwer = process.env.IWER_JS;
  if (!iwer) { try { iwer = require.resolve('iwer/build/iwer.min.js'); } catch (e) {} }
  if (!iwer) console.log('SKIP AR-Ablauf (iwer nicht installiert: npm install iwer)');
  else {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } }), p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(fs.readFileSync(iwer, 'utf8') + `;(()=>{const d=new IWER.XRDevice(IWER.metaQuest3); d.installRuntime({forceInstall:true});
      XRSession.prototype.requestHitTestSource=async()=>({cancel(){}});
      XRFrame.prototype.getHitTestResults=()=>[{getPose:()=>({transform:{matrix:new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-1.5,1])}})}];})();`);
    await p.goto('file://' + file); await p.waitForTimeout(3000);
    ok(await p.evaluate(() => xrOK), 'WebXR (simuliert) erkannt');
    await p.evaluate(() => document.getElementById('btnQuick').click()); await p.waitForTimeout(3500);
    const st = await p.evaluate(() => ({ inAR, stage, ovl, hit: !!hitPose, cross: getComputedStyle(document.getElementById('cross')).display, ring: reticle.visible }));
    ok(st.inAR && st.stage === 'free' && st.hit, `AR-Sitzung läuft (Modus ${st.ovl ? 'Overlay' : 'XR'}), Fläche erkannt`);
    ok(st.cross === 'none' && !st.ring, 'Fadenkreuz und Ring sind im freien Modus ausgeblendet');
    const sc = await p.evaluate(() => {
      const d = (a, b) => new THREE.Vector3(...a).applyMatrix4(model.matrixWorld).distanceTo(new THREE.Vector3(...b).applyMatrix4(model.matrixWorld));
      const r = { m1: d([0, 0, 0], [1, 0, 0]) }; document.querySelector('[data-sc="0.02"]').click(); r.m50 = d([0, 0, 0], [1, 0, 0]); document.querySelector('[data-sc="1"]').click(); return r;
    });
    ok(near(sc.m1, 1) && near(sc.m50, 0.02), `Maßstab 1:1 → 1 m = ${sc.m1.toFixed(3)} m, 1:50 → ${sc.m50.toFixed(3)} m`);
    const fit = await p.evaluate(async () => {
      document.getElementById('btnRealign').click(); const s1 = stage;
      document.querySelector('#wallBtns [data-wall="anbau"]').click(); const s2 = stage;
      const L = WALLS.anbau.len;
      hitPose = new THREE.Matrix4().makeTranslation(3, 0, 4); setPoint();
      hitPose = new THREE.Matrix4().makeTranslation(3 + L, 0, 4); setPoint();
      return { s1, s2, s3: stage, info: align.info, L };
    });
    ok(fit.s1 === 'wall' && fit.s2 === 'rA' && fit.s3 === 'done', 'Einpassen: Wandwahl → A → B → eingepasst');
    ok(/Δ 0\.[0-9] cm|Δ -0\.[0-9] cm/.test(fit.info), 'Abweichung nach Einpassung klein: ' + fit.info);
    // Menü einklappen
    const menu = await p.evaluate(() => { document.getElementById('btnMenu').click(); const off = getComputedStyle(document.getElementById('bottom')).display === 'none';
      document.getElementById('btnMenu').click(); const on = getComputedStyle(document.getElementById('bottom')).display !== 'none'; return { off, on }; });
    ok(menu.off && menu.on, 'Menü lässt sich ein- und ausklappen');
    // AR-Tisch 1:50: Modell erst nach dem Absetzen sichtbar, dann fest an der Trefferstelle
    await p.evaluate(() => xrSession && xrSession.end()); await p.waitForTimeout(500);
    await p.evaluate(() => document.getElementById('btnARTable').click()); await p.waitForTimeout(1500);
    const tb1 = await p.evaluate(() => ({ vis: model.visible, aim: aimOn, s: model.scale.x }));
    await p.evaluate(() => document.getElementById('btnPlace').click()); await p.waitForTimeout(400);
    const tb2 = await p.evaluate(() => ({ vis: model.visible, c: new THREE.Vector3(bcen.x, 0, bcen.z).applyMatrix4(model.matrixWorld).toArray(), h: hitPose && new THREE.Vector3().setFromMatrixPosition(hitPose).toArray() }));
    ok(!tb1.vis && tb1.aim && near(tb1.s, 0.02) && tb2.vis && tb2.h && tb2.c.every((v, i) => near(v, tb2.h[i])), 'AR-Tisch 1:50: zielen → absetzen → Modell steht an der Trefferstelle');
    // Gesten auf dem abgesetzten Tischmodell
    const ges = await p.evaluate(() => {
      const el = document.getElementById('touch'), ev = (type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true }));
      const C = () => new THREE.Vector3(bcen.x, 0, bcen.z).applyMatrix4(model.matrixWorld);
      const c0 = C(); ev('pointerdown', 1, 200, 760); ev('pointermove', 1, 240, 760); ev('pointerup', 1, 240, 760); const c1 = C();
      const y0 = align.yaw;
      ev('pointerdown', 1, 150, 760); ev('pointerdown', 2, 250, 760);
      ev('pointermove', 2, 250, 800); ev('pointermove', 1, 150, 720);     // Finger um den gemeinsamen Mittelpunkt im Uhrzeigersinn gedreht
      ev('pointerup', 1, 150, 720); ev('pointerup', 2, 250, 800); const c2 = C();
      return { dx: c1.x - c0.x, dz: c1.z - c0.z, dyaw: align.yaw - y0, centerShift: c2.distanceTo(c1) };
    });
    ok(ges.dx > 0 && Math.abs(ges.dz) < Math.abs(ges.dx), '(Ersatzweg Touch) 1 Finger nach rechts → Modell wandert nach rechts ' + JSON.stringify({ dx: +ges.dx.toFixed(3), dz: +ges.dz.toFixed(3) }));
    ok(ges.dyaw < 0 && ges.centerShift < 0.06, '(Ersatzweg Touch) 2 Finger im Uhrzeigersinn → Drehung im Uhrzeigersinn, Mitte folgt dem Bodenpunkt zwischen den Fingern ' + JSON.stringify({ dyaw: +ges.dyaw.toFixed(3), mitte: +ges.centerShift.toFixed(4) }));
    // Gesten über WebXR-Eingaben (Hauptweg auf dem Handy): simulierte Fingerstrahlen von oben auf die Tischebene
    const xg = await p.evaluate(() => {
      const ray = (x, z) => ({ targetRaySpace: { x, z } }), y0 = align.a.y + align.adj.y;
      // Strahl senkrecht nach unten: Pose-Matrix mit -Z = (0,-1,0)  → Spalte 2 = (0,1,0)
      const frameOf = () => ({ getPose: s => ({ transform: { matrix: new Float32Array([1,0,0,0, 0,0,-1,0, 0,1,0,0, s.x, y0 + 1, s.z, 1]) } }) });
      const C = () => new THREE.Vector3(bcen.x, 0, bcen.z).applyMatrix4(model.matrixWorld);
      const f1 = ray(0, 0); xrTouch.clear(); xrTouch.add(f1); xrG = null;
      const c0 = C(); xrGestureTick(frameOf()); f1.targetRaySpace = { x: 0.1, z: 0 }; xrGestureTick(frameOf()); const c1 = C();
      xrTouch.clear(); const a = ray(-0.1, 0), b = ray(0.1, 0); xrTouch.add(a); xrTouch.add(b); xrG = null; const y1 = align.yaw;
      xrGestureTick(frameOf()); a.targetRaySpace = { x: 0, z: -0.1 }; b.targetRaySpace = { x: 0, z: 0.1 }; xrGestureTick(frameOf()); const c2 = C();
      xrTouch.clear(); xrG = null;
      return { dx: c1.x - c0.x, dyaw: align.yaw - y1, mitte: c2.distanceTo(c1) };
    });
    ok(Math.abs(xg.dx - 0.1) < 1e-3 && Math.abs(Math.abs(xg.dyaw) - Math.PI / 2) < 1e-3 && xg.mitte < 1e-3, 'WebXR-Gesten: 10 cm ziehen → 10 cm verschoben, Finger 90° gedreht → Modell 90° um die Mitte ' + JSON.stringify({ dx: +xg.dx.toFixed(4), dyaw: +xg.dyaw.toFixed(3) }));
    // Ein-Finger-Drehmodus (Chrome liefert in AR oft nur EINEN Finger als Eingabe)
    const rot1 = await p.evaluate(() => {
      document.querySelector('[data-gm="rot"]').click();
      const y0 = align.a.y + align.adj.y, M = modelCenter();
      const frameOf = () => ({ getPose: s => ({ transform: { matrix: new Float32Array([1,0,0,0, 0,0,-1,0, 0,1,0,0, s.x, y0 + 1, s.z, 1]) } }) });
      const C = () => new THREE.Vector3(bcen.x, 0, bcen.z).applyMatrix4(model.matrixWorld);
      const f = { targetRaySpace: { x: M.x + 0.1, z: M.z } }; xrTouch.clear(); xrTouch.add(f); xrG = null;
      const c0 = C(), yaw0 = align.yaw; xrGestureTick(frameOf());
      f.targetRaySpace = { x: M.x, z: M.z + 0.1 }; xrGestureTick(frameOf());
      xrTouch.clear(); xrG = null; const r = { dyaw: align.yaw - yaw0, mitte: C().distanceTo(c0), on: document.querySelector('[data-gm="rot"]').classList.contains('on') };
      document.querySelector('[data-gm="move"]').click(); return r;
    });
    ok(rot1.on && Math.abs(rot1.dyaw + Math.PI / 2) < 1e-3 && rot1.mitte < 1e-3, 'Drehmodus: 1 Finger um 90° um die Mitte geführt → Modell 90° gedreht, Mitte bleibt ' + JSON.stringify({ dyaw: +rot1.dyaw.toFixed(3) }));
    // Zweiter Finger nur in der Eingabeliste (so meldet ihn Chrome), Regler, Fixieren
    const more = await p.evaluate(() => {
      const y0 = align.a.y + align.adj.y, M = modelCenter();
      const frameOf = () => ({ getPose: s => ({ transform: { matrix: new Float32Array([1,0,0,0, 0,0,-1,0, 0,1,0,0, s.x, y0 + 1, s.z, 1]) } }) });
      const C = () => new THREE.Vector3(bcen.x, 0, bcen.z).applyMatrix4(model.matrixWorld);
      const a = { targetRayMode: 'screen', targetRaySpace: { x: M.x - 0.1, z: M.z } }, b = { targetRayMode: 'screen', targetRaySpace: { x: M.x + 0.1, z: M.z } };
      xrTouch.clear(); xrTouch.add(a); xrG = null; const yaw0 = align.yaw;
      xrGestureTick(frameOf(), [a, b]); a.targetRaySpace = { x: M.x, z: M.z - 0.1 }; b.targetRaySpace = { x: M.x, z: M.z + 0.1 }; xrGestureTick(frameOf(), [a, b]);
      const twoFinger = align.yaw - yaw0; xrTouch.clear(); xrG = null;
      const s = document.getElementById('slRot'); s.value = 45; s.dispatchEvent(new Event('input')); const slider = align.yaw * 180 / Math.PI;
      document.getElementById('btnLock').click(); const c0 = C(), y1 = align.yaw;
      xrTouch.add(a); xrGestureTick(frameOf(), [a]); a.targetRaySpace = { x: M.x + 0.5, z: M.z }; xrGestureTick(frameOf(), [a]); xrTouch.clear();
      document.querySelector('[data-n="right"]').click(); document.querySelector('[data-n="cw"]').click();
      const lockedMoved = C().distanceTo(c0) + Math.abs(align.yaw - y1), hidden = document.getElementById('padRow').classList.contains('hide') && document.getElementById('rotRow').classList.contains('hide');
      document.getElementById('btnLock').click(); const unlocked = !document.getElementById('padRow').classList.contains('hide');
      return { twoFinger, slider, lockedMoved, hidden, unlocked };
    });
    ok(Math.abs(Math.abs(more.twoFinger) - Math.PI / 2) < 1e-3, 'Zweiter Finger aus der Eingabeliste: 2-Finger-Drehung um 90° erkannt');
    ok(Math.abs(more.slider - 45) < 1e-6, 'Dreh-Regler auf 45° → Modell 45° gedreht');
    ok(more.lockedMoved < 1e-9 && more.hidden && more.unlocked, 'Fixieren: Gesten, Pfeile und Drehen gesperrt, Stellelemente ausgeblendet; Lösen gibt frei');
    // Kurzer Tipp auf den freien Bildschirm blendet das Menü aus/ein; Ziehen nicht; Ebenen-Menü schließt zuerst
    const tap = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), off = () => document.body.classList.contains('menuOff');
      const el = document.getElementById('touch'), ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x, clientY: y, bubbles: true }));
      setMenu(false); await wait(500);
      ev('pointerdown', 200, 300); ev('pointerup', 200, 300); const r1 = off(); await wait(500);
      ev('pointerdown', 200, 300); ev('pointerup', 200, 300); const r2 = off(); await wait(500);
      // WebXR-Weg: eigene Sitzungsattrappe
      const h = {}, fake = { addEventListener: (k, f) => (h[k] = f) }; bindXrGestures(fake); const src = { targetRayMode: 'screen' };
      h.selectstart({ inputSource: src }); h.selectend({ inputSource: src }); const r3 = off(); await wait(500);
      h.selectstart({ inputSource: src }); align.adj.x += 0.05; h.selectend({ inputSource: src }); const r4 = off(); await wait(500);   // = Ziehen
      document.getElementById('layPanel').classList.remove('hide'); h.selectstart({ inputSource: src }); h.selectend({ inputSource: src });
      const r5 = document.getElementById('layPanel').classList.contains('hide') && off() === r4;
      bindXrGestures(xrSession); setMenu(false); return { r1, r2, r3, r4, r5 };
    });
    ok(tap.r1 && !tap.r2 && tap.r3 && tap.r4 === tap.r3 && tap.r5, 'Tipp ins Freie: Menü aus → ein (Touch und WebXR), Ziehen schaltet nicht, offenes Ebenen-Menü wird zuerst geschlossen ' + JSON.stringify(tap));
    // Bodenschätzung, wenn ARCore an der Zielstelle (z. B. Gebäudeecke) noch keine Fläche erkannt hat
    const fl = await p.evaluate(() => {
      const c = new THREE.Vector3(0, 1.6, 0), d = new THREE.Vector3(0, -1, -2).normalize();
      const q = estimateFloorPoint(c, d, 0), up = estimateFloorPoint(c, new THREE.Vector3(0, 0.2, -1).normalize(), 0);
      return { q: q && q.toArray().map(v => +v.toFixed(3)), up, floorY, hitEst };
    });
    ok(fl.q && Math.abs(fl.q[1]) < 1e-6 && Math.abs(fl.q[2] + 3.2) < 1e-3 && fl.up === null, 'Bodenschätzung: Zielstrahl trifft die Bodenebene 3,2 m vor dem Gerät; Blick nach oben ergibt keinen Punkt ' + JSON.stringify(fl.q));
    ok(fl.floorY !== null && Math.abs(fl.floorY) < 0.01 && fl.hitEst === false, 'Bodenhöhe wird aus echten Treffern mitgeführt (y = ' + (fl.floorY === null ? '–' : fl.floorY.toFixed(3)) + '), echter Treffer gilt nicht als geschätzt');
    // Mehrfach starten/beenden: genau EIN Hilfskontext, Zeichenkontext bleibt intakt, Preview zeichnet wieder
    const multi = [];
    for (let i = 0; i < 4; i++) {
      await p.evaluate(() => xrSession && xrSession.end()); await p.waitForTimeout(500);
      await p.evaluate(() => document.getElementById('btnQuick').click()); await p.waitForTimeout(1500);
      multi.push(await p.evaluate(() => { window.__gls = window.__gls || new Set(); window.__gls.add(xrGl); return { inAR, n: window.__gls.size, lost: renderer.getContext().isContextLost(), draws: renderer.info.render.calls }; }));
    }
    const last = multi[multi.length - 1];
    ok(multi.every(m => m.inAR && !m.lost && m.draws > 0) && last.n === 1, 'AR 4× neu gestartet: zeichnet jedes Mal, nur ein Hilfskontext ' + JSON.stringify(last));
    await p.evaluate(() => xrSession && xrSession.end()); await p.waitForTimeout(800);
    const back = await p.evaluate(() => ({ inAR, parent: document.getElementById('gl').parentElement.tagName, ar: document.body.classList.contains('ar') }));
    ok(!back.inAR && back.parent === 'BODY' && !back.ar, 'nach dem Beenden: zurück in der Vorschau, Zeichenfläche wieder an ihrem Platz');
    await ctx.close();
  }

  await browser.close();
  ok(errors.length === 0, 'keine JavaScript-Fehler' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(fails ? `\n${fails} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
  process.exit(fails ? 1 : 0);
})();
