// RunTogether V2.0 — navigation (accueil, sports, modes) et registre des sports
// Pour ajouter un sport : ajouter une entrée dans RT_SPORTS (enabled:true) avec ses modes, et créer sa vue "view-<id>".
(function () {
  const $ = id => document.getElementById(id);
  const ICON = {
    piste: '<svg viewBox="0 0 48 48"><rect x="6" y="14" width="36" height="20" rx="10"/><rect x="14" y="19" width="20" height="10" rx="5"/></svg>',
    exterieur: '<svg viewBox="0 0 48 48"><path d="M24 42s-12-11-12-20a12 12 0 0124 0c0 9-12 20-12 20z"/><circle cx="24" cy="22" r="4"/></svg>',
    libre: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="6"/><circle cx="24" cy="24" r="15"/><path d="M24 4v7M24 37v7M4 24h7M37 24h7"/></svg>'
  };
  window.RT_SPORTS = {
    run: { label: 'Course à pied', enabled: true, modes: [
      { id: 'piste', title: 'Piste d’athlétisme', desc: 'Chronos partagés ou individuels, fractionné, tours de piste et objectifs.', cta: 'Préparer la séance' },
      { id: 'exterieur', title: 'Parcours extérieur', desc: 'Un objectif de distance ou de durée, avec alerte et bilan.', cta: 'Choisir l’objectif' },
      { id: 'libre', title: 'Course libre GPS', desc: 'Démarre et cours : chrono, distance, allure et tracé.', cta: 'Démarrer' }] }
    // badminton: { label: 'Badminton', enabled: false, modes: [...] }, velo: {...}, marche: {...}
  };
  const VIEWS = ['home', 'piste', 'exterieur', 'libre', 'progression', 'reglages'];
  const sports = () => Object.entries(RT_SPORTS).filter(([, s]) => s.enabled);

  function renderHome() {
    const list = sports(); let sp = prefs.sport && RT_SPORTS[prefs.sport] && RT_SPORTS[prefs.sport].enabled ? prefs.sport : list[0][0];
    const chips = list.length > 1 ? `<div class="actions" style="margin:0 0 14px">${list.map(([id, s]) => `<button class="secondary ${id === sp ? 'sel' : ''}" data-sport="${id}">${s.label}</button>`).join('')}</div>` : '';
    $('view-home').innerHTML = `<section class="panel"><h2>Que souhaites-tu faire aujourd’hui ?</h2><p class="small" style="margin:-8px 0 14px">${RT_SPORTS[sp].label}</p>${chips}
<div class="cards">${RT_SPORTS[sp].modes.map(m => `<a class="card" href="#/${m.id}">${ICON[m.id] || ''}<h3>${m.title}</h3><p>${m.desc}</p><span class="go">${m.cta} →</span></a>`).join('')}</div></section>
<div class="cards" style="grid-template-columns:repeat(2,minmax(0,1fr))"><a class="card" style="min-height:0" href="#/progression"><h3>📈 Ma progression</h3><p>Historique, records, statistiques et plan vers le 10 km.</p></a><a class="card" style="min-height:0" href="#/reglages"><h3>⚙️ Réglages</h3><p>Synchronisation, sauvegarde, installation.</p></a></div>`;
    document.querySelectorAll('[data-sport]').forEach(b => b.onclick = () => { prefs.sport = b.dataset.sport; savePrefs(); renderHome(); });
  }
  function tabs() {
    const t = prefs.pgTab || 'sorties';
    ['sorties', 'piste', 'plan'].forEach(k => $('pg-' + k).classList.toggle('hidden', k !== t));
    document.querySelectorAll('[data-pg]').forEach(b => b.classList.toggle('selected', b.dataset.pg === t));
    window.dispatchEvent(new Event('resize')); // redessine le graphique quand l'onglet devient visible
  }
  function show(v) {
    VIEWS.forEach(x => $('view-' + x).classList.toggle('active', x === v));
    document.querySelectorAll('#bottomNav a').forEach(a => a.classList.toggle('on', a.dataset.v === v));
    if (v === 'home') renderHome();
    if (v === 'exterieur') rtOutdoor.renderSetup('goal');
    if (v === 'libre') rtOutdoor.renderSetup('free');
    if (v === 'progression') tabs();
    window.scrollTo(0, 0); window.dispatchEvent(new Event('resize'));
  }
  function route() {
    let h = (location.hash || '').replace(/^#\/?/, '');
    if (h === 'accueil') h = 'home';
    if (!VIEWS.includes(h)) h = (!location.hash && (localStorage.getItem('runtogether_rep') || (window.rtLongRunInfo && rtLongRunInfo()))) ? 'piste' : 'home';
    if (document.body.classList.contains('track')) h = 'piste'; // le mode piste plein écran reste dans la piste
    show(h);
  }
  ['piste', 'progression', 'reglages'].forEach(id => { const v = $('view-' + id); if (id === 'piste') v.insertAdjacentHTML('afterbegin', '<a class="back" href="#/home">← Accueil</a>'); });
  $('view-progression').insertAdjacentHTML('afterbegin', '<div class="pgtabs mode-tabs"><button data-pg="sorties">Sorties extérieures</button><button data-pg="piste">Piste</button><button data-pg="plan">Plan 10 km</button></div>');
  document.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { prefs.pgTab = b.dataset.pg; savePrefs(); tabs(); });
  window.addEventListener('hashchange', route);
  route();
})();
