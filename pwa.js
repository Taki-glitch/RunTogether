// RunTogether V1.0 — application installable, hors ligne, rappels (sauvegarde, installation)
(function () {
  const $ = id => document.getElementById(id);

  window.rtToast = function (msg) {
    const t = $('toast'); if (!t) return;
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(window.__toastTimer); window.__toastTimer = setTimeout(() => { t.style.display = 'none'; }, 4500);
  };

  // Service worker (nécessite https ou localhost)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  // Demande un stockage durable (Safari peut effacer les données d'un site peu utilisé)
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // L'écran reste allumé : on redemande le verrou quand la page redevient visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.__wantAwake && typeof keepAwake === 'function') keepAwake(true);
  });

  window.addEventListener('offline', () => rtToast('Hors ligne : le chrono continue de fonctionner, les données seront envoyées au retour du réseau.'));
  window.addEventListener('online', () => rtToast('Connexion rétablie.'));

  // Rappel de sauvegarde JSON
  window.rtBackupBanner = function () {
    const host = $('backupBanner'); if (!host) return;
    const results = state.results || [];
    const last = Number(localStorage.getItem('runtogether_lastexport') || 0), snooze = Number(localStorage.getItem('runtogether_backupsnooze') || 0);
    const oldest = results.length ? Math.min(...results.map(r => new Date(r.date).getTime())) : Date.now();
    const need = results.length && Date.now() - oldest > 7 * 86400000 && (!last || Date.now() - last > 14 * 86400000) && Date.now() > snooze;
    if (!need) { host.innerHTML = ''; return; }
    const txt = last ? `Dernière sauvegarde JSON il y a ${Math.round((Date.now() - last) / 86400000)} jours.` : 'Aucune sauvegarde JSON exportée depuis cet appareil.';
    host.innerHTML = `<div class="banner warn"><span>${txt} Exportez-en une pour ne rien perdre si la synchronisation tombe en panne.</span><span><button id="bkNow">Sauvegarder maintenant</button> <button class="secondary" id="bkLater">Plus tard</button></span></div>`;
    $('bkNow').onclick = () => $('exportJson').click();
    $('bkLater').onclick = () => { localStorage.setItem('runtogether_backupsnooze', String(Date.now() + 3 * 86400000)); host.innerHTML = ''; };
  };

  // Aide à l'installation (iPhone / iPad : Partager > Sur l'écran d'accueil)
  const standalone = window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferred = null;
  function installBanner() {
    const host = $('installBanner'); if (!host || standalone || localStorage.getItem('runtogether_installdismiss')) { if (host) host.innerHTML = ''; return; }
    if (isIOS) {
      host.innerHTML = `<div class="banner"><span>Pour lancer RunTogether comme une application et garder vos données : touchez <strong>Partager</strong> (carré avec une flèche) puis <strong>« Sur l’écran d’accueil »</strong>.</span><button class="secondary" id="instOk">OK</button></div>`;
      $('instOk').onclick = () => { localStorage.setItem('runtogether_installdismiss', '1'); host.innerHTML = ''; };
    } else if (deferred) {
      host.innerHTML = `<div class="banner"><span>Installer RunTogether sur cet appareil.</span><span><button id="instGo">Installer</button> <button class="secondary" id="instNo">Non merci</button></span></div>`;
      $('instGo').onclick = async () => { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; host.innerHTML = ''; };
      $('instNo').onclick = () => { localStorage.setItem('runtogether_installdismiss', '1'); host.innerHTML = ''; };
    }
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; installBanner(); });
  installBanner();

  const prev = window.rtRenderExtra;
  window.rtRenderExtra = function () { if (prev) prev(); rtBackupBanner(); };
  renderAll();
})();
