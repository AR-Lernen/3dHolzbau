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

  // ---------- 2. Tisch-Modus ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, permissions: ['camera'] }), p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.goto('file://' + file); await p.waitForTimeout(2500);
    await p.click('#btnTable'); await p.waitForTimeout(600);
    await p.evaluate(() => dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 10, beta: 60, gamma: 0 })));
    await p.waitForTimeout(500);
    const t = await p.evaluate(() => ({ inTab, s: model.scale.x, msg: document.getElementById('msg').textContent }));
    ok(t.inTab && near(t.s, 0.02), 'Tisch-Modus startet im Maßstab 1:50 ' + JSON.stringify(t));
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
