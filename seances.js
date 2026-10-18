// RunTogether V1.0 — bibliothèque de séances, modification d'une série, participants, mode piste, retour arrière, plan par objectif
(function () {
  const $ = id => document.getElementById(id);

  // ---------- modification d'une série ----------
  window.rtEditUi = function (on) {
    let b = $('cancelEdit');
    if (on && !b) {
      b = document.createElement('button'); b.id = 'cancelEdit'; b.className = 'secondary'; b.textContent = 'Annuler la modification';
      b.onclick = () => { stopEdit(); };
      $('addSeries').after(b);
    } else if (!on && b) b.remove();
  };

  // ---------- bibliothèque de séances ----------
  const PRESETS = [
    { name: 'Fractionné court', desc: '8 × 200 m vite mais relâché, récupération 60 s. Avant : 10 min de footing facile et quelques gammes. Après : 5 min de marche ou de footing.', series: [['Fractionné court', 200, 8, 60]] },
    { name: 'Fractionné 400 m', desc: '6 × 400 m à la cible, récupération 90 s. Garde la même vitesse du 1er au dernier tour.', series: [['Fractionné 400 m', 400, 6, 90]] },
    { name: 'Intervalles longs', desc: '4 × 800 m à allure soutenue mais tenable, récupération 2 min. Utilise les passages à 400 m pour vérifier la régularité.', series: [['Intervalles longs', 800, 4, 120]] },
    { name: 'Pyramide', desc: '400 – 800 – 1 200 – 800 – 400 m avec 90 à 120 s de récupération. Les séries s’enchaînent automatiquement.', series: [['Pyramide 400', 400, 1, 90], ['Pyramide 800', 800, 1, 120], ['Pyramide 1200', 1200, 1, 120], ['Pyramide 800 (retour)', 800, 1, 120], ['Pyramide 400 (fin)', 400, 1, 90]] },
    { name: 'Endurance par blocs', desc: '5 × 1 000 m à allure facile (on peut parler), récupération 60 s. Idéal pour monter en distance sans forcer.', series: [['Endurance 1000', 1000, 5, 60]] },
    { name: 'Test 5 km', desc: '1 × 5 000 m (12,5 tours) à allure régulière : sert de repère pour le niveau et les objectifs.', series: [['Test 5 km', 5000, 1, 0]] }
  ];
  function addPreset(i, replace) {
    const p = PRESETS[i];
    if (replace) {
      if (state.series.length && !confirm('Remplacer la liste des séries par « ' + p.name + ' » ?')) return;
      const t = Date.now(); state.series.forEach(x => { state.deleted.series[x.id] = t; }); state.series = [];
    }
    const first = state.series.length;
    p.series.forEach((x, k) => state.series.push(rtNewSeries(x[0], x[1], x[2], x[3], k)));
    activeSeries = first; repIndex = 0; resetTimers(); save(); renderAll();
    window.rtToast && rtToast('« ' + p.name + ' » ajoutée.');
  }
  function buildLibrary() {
    const host = $('libraryBox'); if (!host) return;
    host.innerHTML = `<details style="margin-top:14px"><summary style="cursor:pointer;font-weight:700">Bibliothèque de séances</summary>
<div class="series-list" style="margin-top:10px">${PRESETS.map((p, i) => `<div class="series-item" style="display:block"><strong>${p.name}</strong><small>${p.desc}</small><div class="actions" style="margin-top:8px"><button class="secondary" data-preset-add="${i}">Ajouter</button><button class="secondary" data-preset-rep="${i}">Remplacer ma séance</button></div></div>`).join('')}
<div class="series-item" style="display:block"><strong>Sortie longue</strong><small>Course en tours de piste vers le 10 km, avec allure, écart à la cible et temps de chaque tour.</small><div class="actions" style="margin-top:8px"><button class="secondary" id="goLongRun">Aller à la sortie longue</button></div></div></div>
<p class="small">Les cibles de chacun se calculent automatiquement d’après ses chronos. Échauffement et retour au calme ne sont pas chronométrés : notez leur distance dans le bilan de séance.</p></details>`;
    host.querySelectorAll('[data-preset-add]').forEach(b => b.onclick = () => addPreset(Number(b.dataset.presetAdd), false));
    host.querySelectorAll('[data-preset-rep]').forEach(b => b.onclick = () => addPreset(Number(b.dataset.presetRep), true));
    $('goLongRun').onclick = () => $('longRunPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  buildLibrary();

  // ---------- participants ----------
  function buildPresent() {
    const host = $('presentBox'); if (!host) return;
    prefs.present = prefs.present || {};
    host.innerHTML = `<div class="actions" style="margin:0 0 10px;align-items:center"><span class="small">Qui court ?</span>${RUNNERS.map(r => `<label class="check"><input type="checkbox" data-present="${r.id}" ${prefs.present[r.id] === false ? '' : 'checked'}> ${r.name}</label>`).join('')}</div><p class="small">Les absents sont ignorés : la récupération démarre quand tous les présents ont terminé.</p>`;
    host.querySelectorAll('[data-present]').forEach(c => c.onchange = () => { prefs.present[c.dataset.present] = c.checked; savePrefs(); renderAll(); });
  }
  buildPresent();

  // ---------- mode piste ----------
  function enterTrack() {
    document.body.classList.add('track');
    try { sessionStorage.setItem('rt_track', '1'); } catch (e) {}
    try { const r = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } catch (e) {}
    unlockAudio(); keepAwake(true); window.scrollTo(0, 0);
  }
  function exitTrack() {
    document.body.classList.remove('track');
    try { sessionStorage.removeItem('rt_track'); } catch (e) {}
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
  }
  $('trackToggle').onclick = enterTrack;
  (function () { // quitter : appui maintenu 1 s, pour éviter les sorties accidentelles
    const b = $('trackExit'); let t = null;
    const start = e => { e.preventDefault(); b.textContent = 'Quitter…'; t = setTimeout(() => { b.textContent = 'Maintenir pour quitter'; exitTrack(); }, 1000); };
    const cancel = () => { clearTimeout(t); b.textContent = 'Maintenir pour quitter'; };
    b.addEventListener('pointerdown', start); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, cancel));
  })();
  try { if (sessionStorage.getItem('rt_track') === '1') document.body.classList.add('track'); } catch (e) {}

  // ---------- retour arrière après une opération destructrice ----------
  window.rtSnapshotUi = function () {
    const h = $('snapshotBox'); if (!h) return;
    let o = null; try { o = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null'); } catch (e) {}
    if (!o || !o.state) { h.innerHTML = ''; return; }
    const n = (o.state.results || []).length;
    h.innerHTML = `<div class="banner warn" style="margin-bottom:12px"><span>Dernière opération destructrice : ${esc(o.label)} (${new Date(o.at).toLocaleString('fr-FR')}). Retour possible : ${n} chrono(s).</span><button class="secondary" id="snapRestore">Annuler cette opération</button></div>`;
    $('snapRestore').onclick = () => {
      if (!confirm(`Restaurer l’état « ${o.label} » (${n} chrono(s)) ?`)) return;
      state = rtReplaceState(state, o.state); localStorage.removeItem(SNAP_KEY); save();
      activeSeries = 0; repIndex = 0; resetTimers(); renderAll(); rtSnapshotUi();
    };
  };
  rtSnapshotUi();

  // ---------- plan : niveau suggéré et objectif ----------
  const longestKm = id => { const a = state.results.filter(r => r.runner === id && r.distance >= 2000 && r.time > 0); return a.length ? Math.max(...a.map(r => r.distance)) / 1000 : 0; };
  const suggestLevel = id => { const k = longestKm(id); return k >= 5 ? 'fivek' : k >= 2 ? 'regular' : 'beginner'; };
  function levelHint() {
    const id = $('planRunner').value, k = longestKm(id), lv = suggestLevel(id);
    const label = { beginner: 'Débutant / reprise', regular: 'Court déjà 20–30 min', fivek: 'Peut déjà courir 5 km' }[lv];
    $('planLevelHint').innerHTML = k ? `D’après les sorties enregistrées (plus longue : ${k.toFixed(1).replace('.', ',')} km), niveau suggéré : <strong>${label}</strong>.` : 'Aucune sortie de 2 km ou plus enregistrée : choisis le niveau selon tes sensations.';
    if (k && $('planLevel').dataset.manual !== '1') $('planLevel').value = lv;
  }
  $('planLevel').onchange = () => { $('planLevel').dataset.manual = '1'; };
  $('planRunner').onchange = () => { $('planLevel').dataset.manual = '0'; levelHint(); };
  window.rtPlanAdjust = function (weeks, id, goal, level) {
    if (!goal || goal === 'none') return weeks;
    const out = weeks.map(w => w.slice());
    const base = longestKm(id) || ({ beginner: 2, regular: 3, fivek: 5 }[level] || 2);
    const fmtKm = k => k.toFixed(1).replace('.', ',');
    if (goal === '5k' || goal === '10k') {
      const goalKm = goal === '5k' ? 5 : 10;
      out.forEach((w, i) => {
        const km = i === 3 ? Math.max(1, base) : Math.min(goalKm, Math.max(base + 0.5, Math.round(base * Math.pow(1.1, i + 1) * 2) / 2));
        w[2] = `Sortie longue : ${fmtKm(km)} km à allure facile (environ ${Math.round(km * 2.5)} tours de piste)${i === 3 ? ' — semaine allégée' : ''}`;
      });
    }
    if (goal === 'time') {
      const cnt = {};
      state.results.filter(r => r.runner === id && r.distance >= 400 && r.distance <= 2000).forEach(r => { cnt[r.distance] = (cnt[r.distance] || 0) + 1; });
      const d = Number(Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x])[0] || 400), t = targetSeconds(id, d);
      out.forEach((w, i) => { w[1] = `Fractionné : ${i === 3 ? 4 : 4 + i} × ${d} m en ${fmt(t, false)} (cible), récupération 90 s${i === 3 ? ' — semaine allégée' : ''}`; });
    }
    return out;
  };

  const prev = window.rtRenderExtra;
  window.rtRenderExtra = function () { if (prev) prev(); levelHint(); };
  renderAll();
})();
