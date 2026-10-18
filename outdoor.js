// RunTogether V2.0 — moteur de séance extérieure (objectif distance/durée + course libre) avec GPS
// Un seul moteur pour les deux modes : "goal" (objectif) et "free" (libre). Aucune dépendance externe.
(function () {
  const $ = id => document.getElementById(id), KEY = 'runtogether_session', p2 = n => String(n).padStart(2, '0');
  const MAX_ACC = 30, MAX_SPEED = 10, GAP_S = 20, MIN_STEP = 2; // précision max (m), vitesse max (m/s), trou de signal (s), pas minimal (m)
  const rad = x => x * Math.PI / 180;
  const hav = (a, b) => { const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(h)); };
  const dur = s => { s = Math.max(0, Math.round(s)); const h = s / 3600 | 0, m = s % 3600 / 60 | 0; return h ? `${h}:${p2(m)}:${p2(s % 60)}` : `${m}:${p2(s % 60)}`; };
  const kmT = m => (m / 1000).toFixed(2).replace('.', ',');
  const paceT = (sec, m) => (m >= 50 && sec > 0) ? dur(sec / m * 1000) : '—';
  const rname = id => (RUNNERS.find(r => r.id === id) || {}).name || id;

  // ---------- polyline (précision 5) + simplification : tracé léger pour Firestore ----------
  function enc(pts) {
    let out = '', pl = 0, pn = 0;
    const w = v => { v = v < 0 ? ~(v << 1) : v << 1; while (v >= 32) { out += String.fromCharCode((32 | v & 31) + 63); v >>= 5; } out += String.fromCharCode(v + 63); };
    pts.forEach(p => { const la = Math.round(p[0] * 1e5), lo = Math.round(p[1] * 1e5); w(la - pl); w(lo - pn); pl = la; pn = lo; });
    return out;
  }
  function dec(s) {
    const out = []; let i = 0, la = 0, lo = 0;
    const r = () => { let c, sh = 0, v = 0; do { c = s.charCodeAt(i++) - 63; v |= (c & 31) << sh; sh += 5; } while (c >= 32); return v & 1 ? ~(v >> 1) : v >> 1; };
    while (i < s.length) { la += r(); lo += r(); out.push([la / 1e5, lo / 1e5]); }
    return out;
  }
  function simplify(pts, max = 120) { // Douglas-Peucker, tolérance augmentée jusqu'à tenir sous "max" points
    if (pts.length <= max) return pts;
    const k = Math.cos(rad(pts[0][0])), X = p => p[1] * 111320 * k, Y = p => p[0] * 110540;
    for (let tol = 6; tol < 2000; tol *= 1.5) {
      const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
      while (st.length) {
        const [a, b] = st.pop(); let mx = 0, mi = -1;
        const ax = X(pts[a]), ay = Y(pts[a]), dx = X(pts[b]) - ax, dy = Y(pts[b]) - ay, L = dx * dx + dy * dy || 1;
        for (let i = a + 1; i < b; i++) { const t = Math.max(0, Math.min(1, ((X(pts[i]) - ax) * dx + (Y(pts[i]) - ay) * dy) / L)), d = Math.hypot(X(pts[i]) - ax - t * dx, Y(pts[i]) - ay - t * dy); if (d > mx) { mx = d; mi = i; } }
        if (mx > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
      }
      const o = pts.filter((_, i) => keep[i]); if (o.length <= max) return o;
    }
    return [pts[0], pts[pts.length - 1]];
  }
  function traceSvg(track, w, h) { // tracé dessiné en SVG : fonctionne hors connexion, sans fond de carte
    const pts = track ? dec(track) : [];
    if (pts.length < 2) return `<svg viewBox="0 0 ${w} ${h}"><text x="${w / 2}" y="${h / 2}" fill="#a9b6c9" font-size="11" text-anchor="middle">Pas de tracé</text></svg>`;
    const k = Math.cos(rad(pts[0][0])), xs = pts.map(p => p[1] * k), ys = pts.map(p => -p[0]), pad = 8;
    const x0 = Math.min(...xs), y0 = Math.min(...ys), sc = Math.min((w - 2 * pad) / ((Math.max(...xs) - x0) || 1e-6), (h - 2 * pad) / ((Math.max(...ys) - y0) || 1e-6));
    const ox = (w - (Math.max(...xs) - x0) * sc) / 2, oy = (h - (Math.max(...ys) - y0) * sc) / 2;
    const q = pts.map((_, i) => [ox + (xs[i] - x0) * sc, oy + (ys[i] - y0) * sc]), f = n => n.toFixed(1);
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Tracé du parcours"><polyline points="${q.map(a => f(a[0]) + ',' + f(a[1])).join(' ')}" fill="none" stroke="#c7f36b" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${f(q[0][0])}" cy="${f(q[0][1])}" r="5" fill="#4ade80"/><circle cx="${f(q[q.length - 1][0])}" cy="${f(q[q.length - 1][1])}" r="5" fill="#ff8e8e"/></svg>`;
  }

  // ---------- séance en cours ----------
  let S = null, watchId = null, tickId = null, lastPersist = 0, lastFix = 0, gpsMsg = 'Recherche du signal…';
  const setup = { runner: (prefs.outRunner || 'tom'), type: 'distance', dist: 5000, time: 1800, gps: true };
  const el = (now = Date.now()) => S ? S.segs.reduce((s, g) => s + ((g[1] == null ? now : g[1]) - g[0]), 0) / 1000 : 0;
  const running = () => S && S.segs.length && S.segs[S.segs.length - 1][1] == null;
  const persist = () => { if (!S) return; S.beat = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  function onFix(pos) {
    lastFix = Date.now(); if (!S || !running()) return;
    const c = pos.coords;
    if (c.accuracy > MAX_ACC) { S.rej++; gpsMsg = `GPS imprécis (±${Math.round(c.accuracy)} m)`; return; }
    gpsMsg = `GPS ok (±${Math.round(c.accuracy)} m)`;
    if (c.speed > 0.4) S.sawSpeed = true; // certains appareils renvoient toujours 0 : on ne s'y fie qu'une fois une vitesse réelle vue
    const p = { lat: c.latitude, lon: c.longitude, t: pos.timestamp }, L = S.last;
    if (!L || S.reanchor) { S.last = p; S.reanchor = false; S.pts.push([+p.lat.toFixed(5), +p.lon.toFixed(5), p.t]); return; }
    const d = hav(L, p), dt = (p.t - L.t) / 1000;
    if (dt <= 0) return;
    if (d / dt > MAX_SPEED) { if (++S.jump >= 5) { S.last = p; S.jump = 0; } return; } // saut aberrant : ignoré
    S.jump = 0;
    if (d < MIN_STEP || (S.sawSpeed && c.speed != null && c.speed < 0.4 && d < 15)) return; // immobile / bruit GPS
    if (dt > GAP_S) { S.gaps++; S.gapD += d; } // signal perdu puis retrouvé : distance estimée en ligne droite
    S.dist += d; S.last = p; S.pts.push([+p.lat.toFixed(5), +p.lon.toFixed(5), p.t]);
    while (S.dist >= (S.splits.length + 1) * 1000) { S.splits.push(Math.round(el())); if (prefs.kmBeep !== false) beep(880, 200); }
  }
  function onErr(e) { gpsMsg = e.code === 1 ? 'Localisation refusée : autorise-la dans les réglages du navigateur' : e.code === 3 ? 'Signal GPS perdu…' : 'GPS indisponible'; }
  function startWatch() {
    if (!S || !S.gps || watchId !== null) return;
    if (!navigator.geolocation) { gpsMsg = 'GPS non pris en charge'; return; }
    watchId = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }
  function stopWatch() { if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId); watchId = null; }

  function instPace() { // allure sur ~30 s
    const P = S.pts; if (P.length < 2) return '—';
    let d = 0, i = P.length - 1; const tEnd = P[i][2];
    while (i > 0 && tEnd - P[i][2] < 30000) { d += hav({ lat: P[i - 1][0], lon: P[i - 1][1] }, { lat: P[i][0], lon: P[i][1] }); i--; }
    return paceT((tEnd - P[i][2]) / 1000, d);
  }

  function startSession(mode) {
    if (S) { showRun(); return; }
    const goal = mode === 'goal' ? { type: setup.type, v: setup.type === 'distance' ? setup.dist : setup.time } : null;
    if (goal && !(goal.v > 0)) { rtToast('Choisis un objectif valide.'); return; }
    S = { id: 'a-' + rtUuid(), runner: setup.runner, goal, gps: !!setup.gps, segs: [[Date.now(), null]], pts: [], dist: 0, gaps: 0, gapD: 0, rej: 0, jump: 0, last: null, reanchor: false, splits: [], reached: false, reachedAt: null };
    gpsMsg = S.gps ? 'Recherche du signal…' : 'GPS désactivé'; prefs.outRunner = setup.runner; savePrefs();
    unlockAudio(); keepAwake(true); startWatch(); persist(); showRun(); startTick();
  }
  function startTick() { clearInterval(tickId); tick(); tickId = setInterval(tick, 500); }
  function tick() {
    if (!S) return;
    const t = el(), g = S.goal;
    if (g && !S.reached) {
      const cur = g.type === 'time' ? t : S.dist;
      if (cur >= g.v) { S.reached = true; S.reachedAt = Math.round(t); beep(1200, 700); if (navigator.vibrate) navigator.vibrate([300, 150, 300]); rtToast('Objectif atteint ! 🎉'); }
    }
    if (Date.now() - lastPersist > 10000) { lastPersist = Date.now(); persist(); }
    if (S.gps && running() && lastFix && Date.now() - lastFix > 15000) gpsMsg = 'Signal GPS perdu…';
    const set = (id, v) => { const n = $(id); if (n) n.textContent = v; };
    set('rsTime', dur(t)); set('rsDist', kmT(S.dist)); set('rsAvg', paceT(t, S.dist)); set('rsInst', S.gps ? instPace() : '—'); set('rsGps', gpsMsg);
    const gl = $('rsGoal'); if (gl && g) {
      const cur = g.type === 'time' ? t : S.dist, pct = Math.min(100, cur / g.v * 100);
      let txt = g.type === 'time' ? `Reste ${dur(Math.max(0, g.v - t))}` + (S.dist > 100 ? ` · à ce rythme : ${kmT(S.dist / t * g.v)} km` : '') : `Reste ${kmT(Math.max(0, g.v - S.dist))} km` + (S.dist > 300 ? ` · arrivée prévue ${dur(t / S.dist * g.v)}` : '');
      if (S.reached) txt = 'Objectif atteint 🎉 — tu peux continuer ou terminer.';
      gl.innerHTML = `<div class="bar"><i style="width:${pct}%"></i></div><p class="small" style="text-align:center">${txt}</p>`;
    }
  }
  function pauseResume() {
    if (!S) return; const now = Date.now();
    if (running()) { S.segs[S.segs.length - 1][1] = now; } else { S.segs.push([now, null]); S.reanchor = true; startWatch(); keepAwake(true); }
    persist(); buildRun();
  }
  function finish() {
    if (!S) return; const now = Date.now();
    if (running()) S.segs[S.segs.length - 1][1] = now;
    stopWatch(); clearInterval(tickId); keepAwake(false);
    let dist = S.dist;
    if (!S.gps) { const v = prompt('Distance parcourue en km (laisse vide si inconnue)', S.goal && S.goal.type === 'distance' ? String(S.goal.v / 1000) : ''); const n = Number(String(v || '').replace(',', '.')); dist = Number.isFinite(n) && n > 0 ? n * 1000 : 0; }
    const track = S.pts.length > 1 ? enc(simplify(S.pts)) : '';
    const a = { id: S.id, sport: 'run', mode: S.goal ? 'goal' : 'free', runner: S.runner, date: new Date(S.segs[0][0]).toISOString(), time: Math.round(el()), distance: Math.round(dist), gps: S.gps, goal: S.goal, reached: S.reached, reachedAt: S.reachedAt, splits: S.splits, gaps: S.gaps, track, updatedAt: Date.now() };
    state.activities = state.activities || []; state.activities.push(a);
    S = null; try { localStorage.removeItem(KEY); } catch (e) {}
    save(); renderAll(); showSummary(a, true);
  }
  function abandon() { stopWatch(); clearInterval(tickId); keepAwake(false); S = null; try { localStorage.removeItem(KEY); } catch (e) {} hideRun(); }

  // ---------- écrans ----------
  const goalLabel = g => !g ? 'Course libre' : g.type === 'time' ? `Objectif ${Math.round(g.v / 60)} min` : `Objectif ${g.v / 1000} km`;
  function showRun() { $('runScreen').classList.add('on'); buildRun(); }
  function hideRun() { $('runScreen').classList.remove('on'); $('runScreen').innerHTML = ''; }
  function buildRun() {
    if (!S) return;
    $('runScreen').innerHTML = `<div class="section-head"><strong>${rname(S.runner)} · ${goalLabel(S.goal)}</strong><span class="tag" id="rsGps"></span></div>
<div class="timer" id="rsTime">0:00</div>
<div class="rs-grid"><div><b id="rsDist">0,00</b><small>km</small></div><div><b id="rsAvg">—</b><small>allure moy. /km</small></div><div><b id="rsInst">—</b><small>allure actuelle</small></div></div>
<div id="rsGoal" style="margin-top:14px"></div>
<div class="actions"><button id="rsPause" class="${running() ? 'secondary' : ''}">${running() ? '⏸ Pause' : '▶ Reprendre'}</button><button id="rsEnd" class="danger">■ Terminer</button></div>
${S.goal && S.goal.type === 'distance' && !S.gps && !S.reached ? '<div class="actions"><button class="secondary" id="rsManual">Objectif atteint (manuel)</button></div>' : ''}
<div id="rsConfirm"></div>
<p class="small" style="text-align:center">${S.gps ? 'Garde l’écran allumé : le suivi GPS peut s’interrompre si le téléphone se verrouille.' : 'Sans GPS : seul le chrono est enregistré.'}</p>`;
    $('rsPause').onclick = pauseResume;
    $('rsEnd').onclick = () => { $('rsConfirm').innerHTML = `<div class="notice" style="margin-top:12px">Terminer la séance (${dur(el())}, ${kmT(S.dist)} km) ?<div class="actions"><button id="cfOk">Enregistrer</button><button class="secondary" id="cfNo">Continuer</button><button class="danger" id="cfDel">Abandonner</button></div></div>`; $('cfOk').onclick = finish; $('cfNo').onclick = () => { $('rsConfirm').innerHTML = ''; }; $('cfDel').onclick = () => { if (confirm('Abandonner sans enregistrer cette séance ?')) abandon(); }; };
    const m = $('rsManual'); if (m) m.onclick = () => { S.reached = true; S.reachedAt = Math.round(el()); beep(1200, 500); buildRun(); };
    tick();
  }
  function showSummary(a, fresh) {
    const g = a.goal, sp = a.splits || [], per = sp.map((t, i) => t - (i ? sp[i - 1] : 0));
    const res = !g ? '' : a.reached ? `<div class="notice">Objectif atteint ✅${g.type === 'distance' && a.reachedAt ? ` — ${g.v / 1000} km en ${dur(a.reachedAt)}` : ''}</div>` : `<div class="warning">Objectif non atteint (${goalLabel(g).replace('Objectif ', '')} visés).</div>`;
    $('runScreen').innerHTML = `<div class="section-head"><h2>${fresh ? 'Séance enregistrée 🎉' : 'Détail de la sortie'}</h2><span class="tag">${rname(a.runner)} · ${new Date(a.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
<div class="stats" style="margin:12px 0"><div class="stat"><strong>${dur(a.time)}</strong><span>Durée</span></div><div class="stat"><strong>${a.distance ? kmT(a.distance) : '—'}</strong><span>km${a.gps ? '' : ' (saisi)'}</span></div><div class="stat"><strong>${paceT(a.time, a.distance)}</strong><span>Allure moy. /km</span></div><div class="stat"><strong>${goalLabel(g)}</strong><span>${a.mode === 'goal' ? 'Parcours extérieur' : 'Course libre'}</span></div></div>
${res}${a.gps ? `<div class="chartbox" style="margin-top:12px">${traceSvg(a.track, 320, 200)}</div>` : ''}
${a.gaps ? `<p class="small">⚠️ Signal GPS perdu ${a.gaps} fois : la distance de ces passages est estimée en ligne droite.</p>` : ''}
${per.length ? `<h3 style="margin-top:14px">Kilomètres</h3><div class="series-list">${per.map((t, i) => `<div class="series-item"><span>km ${i + 1}</span><strong>${dur(t)}</strong></div>`).join('')}</div>` : ''}
<div class="actions"><button id="smClose">Fermer</button><button class="danger" id="smDel">Supprimer</button></div>`;
    $('runScreen').classList.add('on'); $('runScreen').scrollTop = 0;
    $('smClose').onclick = hideRun;
    $('smDel').onclick = () => { if (!confirm('Supprimer cette sortie (y compris sur les autres appareils synchronisés) ?')) return; const i = state.activities.findIndex(x => x.id === a.id); if (i >= 0) { state.deleted.activities = state.deleted.activities || {}; state.deleted.activities[a.id] = Date.now(); state.activities.splice(i, 1); save(); renderAll(); } hideRun(); };
  }

  // ---------- configuration (modes 2 et 3) ----------
  function renderSetup(mode) {
    const host = $(mode === 'goal' ? 'view-exterieur' : 'view-libre'); if (!host) return;
    const goal = mode === 'goal', pre = setup.type === 'distance' ? [3000, 5000, 10000] : [1200, 1800, 2700, 3600];
    const val = setup.type === 'distance' ? setup.dist : setup.time, inCustom = !pre.includes(val);
    host.innerHTML = `<a class="back" href="#/home">← Accueil</a><section class="panel"><h2>${goal ? 'Parcours extérieur avec objectif' : 'Course libre avec GPS'}</h2>
<label>Qui court ?</label><div class="actions" style="margin:0 0 14px">${RUNNERS.map(r => `<button class="secondary ${r.id === setup.runner ? 'sel' : ''}" data-r="${r.id}">${r.name}</button>`).join('')}</div>
${goal ? `<div class="mode-tabs"><button class="${setup.type === 'distance' ? 'selected' : ''}" data-t="distance">Distance</button><button class="${setup.type === 'time' ? 'selected' : ''}" data-t="time">Durée</button></div>
<div class="actions" style="margin:0 0 12px">${pre.map(v => `<button class="secondary ${v === val ? 'sel' : ''}" data-v="${v}">${setup.type === 'distance' ? v / 1000 + ' km' : v / 60 + ' min'}</button>`).join('')}</div>
<label for="outCustom-${mode}">Personnalisé (${setup.type === 'distance' ? 'km' : 'minutes'})</label><input id="outCustom-${mode}" type="number" min="0.1" step="${setup.type === 'distance' ? '0.1' : '1'}" value="${inCustom ? val / (setup.type === 'distance' ? 1000 : 60) : ''}" placeholder="${setup.type === 'distance' ? 'ex. 7.5' : 'ex. 25'}">` : '<p class="small">Appuie sur Démarrer et cours où tu veux : durée, distance, allure et tracé sont enregistrés.</p>'}
<div class="toggles"><label class="check"><input type="checkbox" id="outGps-${mode}" ${setup.gps ? 'checked' : ''}> Activer le GPS (distance, allure, tracé)</label><label class="check"><input type="checkbox" id="outBeep-${mode}" ${prefs.kmBeep !== false ? 'checked' : ''}> Signal sonore à chaque kilomètre</label></div>
${!setup.gps && goal && setup.type === 'distance' ? '<p class="warning" style="margin-top:10px">Sans GPS, l’application ne peut pas détecter la distance : touche « Objectif atteint » toi-même ; la distance te sera demandée à la fin.</p>' : ''}
<div class="actions"><button id="outStart-${mode}" style="min-height:58px;font-size:19px;flex:1">▶ Démarrer</button></div>
<p class="small">La localisation est demandée au démarrage. Le GPS d’un site installé peut s’arrêter quand l’écran se verrouille : garde l’écran allumé (le chrono, lui, reste exact).</p></section>`;
    host.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { setup.runner = b.dataset.r; renderSetup(mode); });
    host.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { setup.type = b.dataset.t; renderSetup(mode); });
    host.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { setup[setup.type === 'distance' ? 'dist' : 'time'] = Number(b.dataset.v); renderSetup(mode); });
    const c = $('outCustom-'+mode); if (c) c.onchange = () => { const n = Number(c.value); if (n > 0) { setup[setup.type === 'distance' ? 'dist' : 'time'] = Math.round(n * (setup.type === 'distance' ? 1000 : 60)); renderSetup(mode); } };
    $('outGps-'+mode).onchange = e => { setup.gps = e.target.checked; renderSetup(mode); };
    $('outBeep-'+mode).onchange = e => { prefs.kmBeep = e.target.checked; savePrefs(); };
    $('outStart-'+mode).onclick = () => startSession(mode);
  }

  // ---------- historique (onglet « Sorties » de Progression) ----------
  let hf = 'all';
  function renderHistory() {
    const host = $('outdoorPanel'); if (!host) return;
    const all = (state.activities || []), list = all.filter(a => hf === 'all' || a.runner === hf).slice().reverse();
    const km = list.reduce((s, a) => s + a.distance, 0), t = list.reduce((s, a) => s + a.time, 0);
    host.innerHTML = `<div class="section-head"><h2>Sorties extérieures</h2><span class="tag">GPS et objectifs</span></div>
<div class="filters"><div><label for="hfRunner">Coureur</label><select id="hfRunner"><option value="all">Tout le groupe</option>${RUNNERS.map(r => `<option value="${r.id}" ${hf === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}</select></div></div>
${list.length ? `<div class="stats" style="margin:12px 0"><div class="stat"><strong>${list.length}</strong><span>sorties</span></div><div class="stat"><strong>${kmT(km)}</strong><span>km au total</span></div><div class="stat"><strong>${dur(t)}</strong><span>temps total</span></div><div class="stat"><strong>${kmT(Math.max(...list.map(a => a.distance)))}</strong><span>km, plus longue</span></div></div>
<div class="series-list">${list.map(a => `<div class="act" data-a="${a.id}">${traceSvg(a.track, 96, 60)}<div><strong>${rname(a.runner)} · ${a.distance ? kmT(a.distance) + ' km' : dur(a.time)}</strong><small class="small" style="display:block">${new Date(a.date).toLocaleDateString('fr-FR')} · ${dur(a.time)} · ${paceT(a.time, a.distance)} /km${a.goal ? (a.reached ? ' · objectif ✅' : ' · objectif ✗') : ''}</small></div></div>`).join('')}</div>` : '<p class="empty">Tes parcours extérieurs apparaîtront ici après ta première sortie.</p>'}
<p class="small">Les sorties de 2 km ou plus comptent dans la progression vers le 10 km (piste).</p>`;
    $('hfRunner').onchange = e => { hf = e.target.value; renderHistory(); };
    host.querySelectorAll('[data-a]').forEach(d => d.onclick = () => { const a = (state.activities || []).find(x => x.id === d.dataset.a); if (a) showSummary(a, false); });
  }
  window.rtOutdoorEfforts = id => (state.activities || []).filter(a => a.runner === id && a.gps && a.distance >= 2000 && a.time > 0).map(a => ({ runner: id, distance: a.distance, time: a.time, date: a.date }));

  // ---------- reprise après fermeture accidentelle ----------
  function restore() {
    let o = null; try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!o || !o.segs) return;
    S = o; gpsMsg = S.gps ? 'Recherche du signal…' : 'GPS désactivé'; S.reanchor = true;
    $('runScreen').classList.add('on');
    $('runScreen').innerHTML = `<h2>Séance interrompue</h2><div class="notice">Une séance de ${rname(S.runner)} (${dur(el(S.beat))}, ${kmT(S.dist)} km) était en cours quand la page s’est fermée.</div><div class="actions"><button id="rsBack">Reprendre</button><button class="secondary" id="rsStop">Terminer et enregistrer</button><button class="danger" id="rsDrop">Abandonner</button></div><p class="small">« Reprendre » compte le temps écoulé depuis l’interruption ; « Terminer » s’arrête au dernier point connu.</p>`;
    $('rsBack').onclick = () => { keepAwake(true); startWatch(); startTick(); buildRun(); };
    $('rsStop').onclick = () => { if (running()) S.segs[S.segs.length - 1][1] = S.beat; finish(); };
    $('rsDrop').onclick = () => { if (confirm('Abandonner cette séance sans l’enregistrer ?')) abandon(); };
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(); else if (S && S.gps && running()) startWatch(); });
  window.addEventListener('pagehide', persist);
  window.addEventListener('beforeunload', e => { if (S && running()) { e.preventDefault(); e.returnValue = ''; } });

  const prev = window.rtRenderExtra;
  window.rtRenderExtra = function () { if (prev) prev(); renderHistory(); };
  window.rtOutdoor = { renderSetup, active: () => !!S };
  window.rtGeo = { hav, enc, dec, simplify };
  restore();
  renderAll();
})();
