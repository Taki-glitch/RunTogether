// RunTogether V0.8 — objectifs automatiques, sortie longue en tours de piste, progression vers le 10 km
(function () {
  const $ = id => document.getElementById(id);
  const RUN_KEY = 'runtogether_longrun';
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const fmtDur = sec => {
    if (!Number.isFinite(sec)) return '—';
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  };
  const fmtSigned = sec => (sec < 0 ? '−' : '+') + fmtDur(Math.abs(sec));
  const fmtPaceSec = s => Number.isFinite(s) && s > 0 ? fmtDur(s) + ' /km' : '—';
  const paceInput = min => fmtDur(min * 60);
  function parsePace(str) {
    str = String(str).trim().replace(',', '.');
    const m = str.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return Number(m[1]) + Number(m[2]) / 60;
    const n = Number(str);
    return Number.isFinite(n) ? n : NaN;
  }
  const manualPace = id => Number(state.paces[id] || (RUNNERS.find(r => r.id === id) || {}).pace || 6);
  const byDate = (a, b) => new Date(a.date) - new Date(b.date);
  const resultsFor = (id, d) => state.results.filter(r => r.runner === id && r.distance === d && Number.isFinite(r.time)).sort(byDate);

  // ---------- 1. Objectifs automatiques ----------
  // Cible = 2 % plus rapide que la moyenne des 3 derniers chronos sur la même distance.
  // Sans historique sur cette distance : estimation (formule de Riegel) depuis la distance la plus proche, sinon allure manuelle.
  window.rtAutoTarget = function (id, d) {
    d = Number(d);
    const a = resultsFor(id, d);
    if (a.length) {
      const ref = mean(a.slice(-3).map(r => r.time));
      return { seconds: ref * 0.98, ref, best: Math.min(...a.map(r => r.time)), n: a.length, source: 'hist' };
    }
    const mine = state.results.filter(r => r.runner === id && r.distance >= 200 && Number.isFinite(r.time));
    const ds = [...new Set(mine.map(r => r.distance))];
    if (ds.length) {
      ds.sort((x, y) => Math.abs(Math.log(d / x)) - Math.abs(Math.log(d / y)));
      const d2 = ds[0], ref2 = mean(resultsFor(id, d2).slice(-3).map(r => r.time));
      return { seconds: ref2 * Math.pow(d / d2, 1.06), ref: null, best: null, n: 0, source: 'est', from: d2 };
    }
    return { seconds: manualPace(id) * 60 * d / 1000, ref: null, best: null, n: 0, source: 'manual' };
  };

  let advDist = null;
  function adviceFor(id, d) {
    const a = resultsFor(id, d), name = runnerName(id), out = [];
    if (a.length < 3) {
      out.push(`Encore ${3 - a.length} chrono(s) sur ${d} m pour dégager une tendance.`);
      return out;
    }
    const recent = mean(a.slice(-3).map(r => r.time));
    const prevArr = a.length >= 6 ? a.slice(-6, -3) : a.slice(0, 1);
    const prev = mean(prevArr.map(r => r.time));
    const pct = (recent - prev) / prev * 100;
    const last5 = a.slice(-5).map(r => r.time), m5 = mean(last5);
    const cv = Math.sqrt(mean(last5.map(t => (t - m5) ** 2))) / m5 * 100;
    // ralentissement entre la 1re et la dernière répétition d'une même séance
    const sess = {};
    a.forEach(r => { const k = r.date.slice(0, 10) + '|' + r.series; (sess[k] = sess[k] || []).push(r); });
    const fades = Object.values(sess).filter(g => g.length >= 3).slice(-3).map(g => {
      g.sort((x, y) => (x.rep || 0) - (y.rep || 0));
      return (g[g.length - 1].time - g[0].time) / g[0].time * 100;
    });
    const fade = fades.length ? mean(fades) : null;
    if (fade !== null && fade > 5) out.push(`Tu ralentis d’environ ${fade.toFixed(0)} % entre la 1re et la dernière répétition : pars un peu moins vite ou ajoute 15 à 30 s de récupération.`);
    if (pct < -1) out.push(`Progression : −${Math.abs(pct).toFixed(1)} % sur les derniers chronos. Garde la cible et ajoute 1 répétition à la prochaine séance.`);
    else if (pct > 1) out.push(`Chronos plus lents de ${pct.toFixed(1)} %. Garde la même cible, soigne la récupération (sommeil, séance facile entre deux séances dures).`);
    else out.push(`Chronos stables${cv < 3 ? ' et réguliers' : ''}. Vise la cible (−2 %) sur 2 répétitions, puis change une seule chose à la fois : +1 répétition ou −10 à 15 s de récupération.`);
    return out;
  }
  function renderTargets() {
    const host = $('autoTargetPanel'); if (!host) return;
    const set = new Set([400, 800, 1000]);
    state.series.forEach(s => set.add(Number(s.distance)));
    state.results.forEach(r => set.add(r.distance));
    const dists = [...set].filter(Number.isFinite).sort((a, b) => a - b);
    if (advDist === null || !dists.includes(advDist)) {
      const s = current(), lastR = state.results[state.results.length - 1];
      advDist = s ? Number(s.distance) : lastR ? lastR.distance : 400;
      if (!dists.includes(advDist)) advDist = dists[0];
    }
    const rows = RUNNERS.map(r => {
      const t = rtAutoTarget(r.id, advDist);
      const src = t.source === 'hist' ? `${t.n} chrono(s) enregistré(s)` : t.source === 'est' ? `estimée d’après ${t.from} m` : 'allure manuelle';
      return `<tr><td><strong>${r.name}</strong></td><td>${t.ref ? fmt(t.ref) : '—'}</td><td>${t.best ? fmt(t.best) : '—'}</td><td><strong style="color:var(--lime)">${fmt(t.seconds)}</strong></td><td class="small">${src}</td></tr>`;
    }).join('');
    const advice = RUNNERS.map(r => `<div class="series-item" style="display:block"><strong>${r.name}</strong><small>${adviceFor(r.id, advDist).join('<br>')}</small></div>`).join('');
    host.innerHTML = `<div class="section-head"><h2>Objectifs automatiques</h2><span class="tag">Calculés d’après vos chronos</span></div>
<div class="filters"><div><label for="advDistance">Distance</label><select id="advDistance">${dists.map(d => `<option value="${d}" ${d === advDist ? 'selected' : ''}>${d} m</option>`).join('')}</select></div></div>
<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Coureur</th><th>Forme récente</th><th>Record</th><th>Cible</th><th>Origine</th></tr></thead><tbody>${rows}</tbody></table></div>
<h3 style="margin-top:16px">Pour progresser</h3><div class="series-list">${advice}</div>
<div class="toggles"><label class="check"><input type="checkbox" id="optAutoTargets" ${prefs.autoTargets ? 'checked' : ''}> Utiliser ces cibles pendant le chronométrage (sinon : allure manuelle de chaque coureur)</label></div>
<p class="small">Forme récente = moyenne des 3 derniers chronos sur la distance. Cible = 2 % plus rapide que la forme récente. Sans historique, la cible est estimée depuis une autre distance (formule de Riegel, approximative pour des fractionnés) ou calculée avec l’allure manuelle. Conseils indicatifs, à adapter à vos sensations.</p>`;
    $('advDistance').onchange = e => { advDist = Number(e.target.value); renderTargets(); };
    $('optAutoTargets').onchange = e => { prefs.autoTargets = e.target.checked; savePrefs(); renderAll(); };
  }

  // ---------- 2. Sortie longue en tours de piste ----------
  let lr = null, setup = { dist: '10000', custom: '12000', lap: 400, paces: {} }, tickId = null;
  try { lr = JSON.parse(localStorage.getItem(RUN_KEY) || 'null'); } catch (e) { lr = null; }
  const saveLr = () => { if (lr) localStorage.setItem(RUN_KEY, JSON.stringify(lr)); else localStorage.removeItem(RUN_KEY); };
  const totalLaps = () => Math.ceil(lr.total / lr.lap);
  const distAt = k => Math.min(k * lr.lap, lr.total);
  const allDone = () => lr && RUNNERS.every(r => lr.runners[r.id].done);
  const elapsed = () => (Date.now() - lr.start) / 1000;

  function longRuns(id) { return state.results.filter(r => r.runner === id && r.distance >= 2000 && r.time > 0).sort(byDate); }
  // Allure conseillée pour la prochaine sortie : on ne cherche pas à aller plus vite si on allonge la distance.
  function suggestedPace(id, total) {
    const a = longRuns(id);
    if (!a.length) return manualPace(id);
    const last = a[a.length - 1], p = last.time / last.distance * 1000 / 60;
    return total > last.distance * 1.1 ? p : p * 0.99;
  }
  function nextDistance(id) {
    const a = longRuns(id);
    if (!a.length) return 3000;
    const longest = Math.max(...a.map(r => r.distance));
    if (longest >= 10000) return 10000;
    return Math.min(10000, Math.max(longest + 400, Math.ceil(longest * 1.1 / 400) * 400));
  }

  function liveStats(id) {
    const r = lr.runners[id], k = r.laps.length;
    if (!k) return { k, dist: 0 };
    const dist = distAt(k), t = r.laps[k - 1];
    const lapTime = t - (k > 1 ? r.laps[k - 2] : 0), lapDist = dist - distAt(k - 1);
    const avg = t / dist * 1000, target = r.target * 60;
    return { k, dist, t, lapTime, lapPace: lapTime / lapDist * 1000, avg, proj: avg * lr.total / 1000, gap: t - target * dist / 1000 };
  }

  function startRun() {
    const total = setup.dist === 'custom' ? Number(setup.custom) : Number(setup.dist);
    const lap = Number(setup.lap);
    if (!Number.isFinite(total) || total < 400 || total > 100000 || !Number.isFinite(lap) || lap < 50 || lap > 1000) { alert('Vérifie la distance (400 m minimum) et la longueur du tour (50 à 1000 m).'); return; }
    const runners = {};
    for (const r of RUNNERS) {
      const p = parsePace(setup.paces[r.id] != null ? setup.paces[r.id] : paceInput(suggestedPace(r.id, total)));
      if (!(p >= 2 && p <= 15)) { alert(`Allure cible de ${r.name} invalide (exemple : 6:00).`); return; }
      runners[r.id] = { target: p, laps: [], done: false, resultId: null };
    }
    lr = { start: Date.now(), total, lap, runners };
    saveLr(); unlockAudio(); keepAwake(true); startTick(); renderLongRun();
  }
  function startTick() {
    clearInterval(tickId);
    tickId = setInterval(() => {
      if (!lr) return;
      const c = $('lrClock'); if (c) c.textContent = fmtDur(elapsed());
      RUNNERS.forEach(r => {
        const n = $('lrSince-' + r.id), x = lr.runners[r.id]; if (!n || x.done) return;
        n.textContent = fmtDur(elapsed() - (x.laps.length ? x.laps[x.laps.length - 1] : 0));
      });
      if (allDone()) clearInterval(tickId);
    }, 250);
  }
  function lap(id) {
    const x = lr.runners[id]; if (x.done) return;
    const t = elapsed(), last = x.laps.length ? x.laps[x.laps.length - 1] : 0;
    if (t - last < 3) return; // anti double-tap
    x.laps.push(Math.round(t * 10) / 10);
    if (navigator.vibrate) navigator.vibrate(40);
    if (x.laps.length >= totalLaps()) finishRunner(id); else { saveLr(); renderLongRun(); }
  }
  function undoLap(id) {
    const x = lr.runners[id]; if (!x.laps.length) return;
    if (x.done) removeRecorded(x);
    x.laps.pop(); x.done = false; saveLr(); renderLongRun();
  }
  function removeRecorded(x) {
    if (!x.resultId) return;
    const i = state.results.findIndex(r => r.id === x.resultId);
    if (i >= 0) { state.deleted.results[x.resultId] = Date.now(); state.results.splice(i, 1); save(); }
    x.resultId = null;
  }
  function finishRunner(id) {
    const x = lr.runners[id], k = x.laps.length;
    x.done = true;
    if (k > 0) {
      const dist = distAt(k), time = x.laps[k - 1], target = x.target * 60 * dist / 1000;
      const splits = x.laps.map((t, i) => Math.round((t - (i ? x.laps[i - 1] : 0)) * 10) / 10);
      const rid = rtUuid();
      state.results.push({ id: rid, date: new Date(lr.start).toISOString(), series: `Sortie ${lr.total / 1000} km`, seriesIndex: -1, rep: 1, distance: dist, runner: id, time, targetTime: target, diff: time - target, kind: 'long', completed: k >= totalLaps(), lap: lr.lap, splits, updatedAt: Date.now() });
      x.resultId = rid; save();
    }
    saveLr();
    if (allDone()) keepAwake(false);
    renderAll();
  }
  function stopRunner(id) {
    const x = lr.runners[id], k = x.laps.length;
    if (!k) { if (confirm(`${runnerName(id)} n’a validé aucun tour. L’arrêter sans enregistrement ?`)) { x.done = true; saveLr(); renderLongRun(); } return; }
    if (!confirm(`Enregistrer ${runnerName(id)} : ${distAt(k)} m en ${fmtDur(x.laps[k - 1])} ? (la distance compte les tours complets)`)) return;
    finishRunner(id);
  }

  function runnerCard(r) {
    const x = lr.runners[r.id], s = liveStats(r.id), N = totalLaps(), lapTarget = x.target * 60 * lr.lap / 1000;
    let body = `<div class="small">${s.k} / ${N} tours · ${s.dist} m</div><div class="bar"><i style="width:${Math.min(100, s.dist / lr.total * 100)}%"></i></div>`;
    if (s.k) {
      body += `<div class="small" style="margin-top:6px">Dernier tour : <strong>${fmtDur(s.lapTime)}</strong> (${fmtPaceSec(s.lapPace)})<br>Allure moyenne : <strong>${fmtPaceSec(s.avg)}</strong><br>Arrivée à ce rythme : <strong>${fmtDur(s.proj)}</strong><br>Écart à la cible : <strong style="color:${s.gap <= 0 ? 'var(--lime)' : 'var(--red)'}">${fmtSigned(s.gap)}</strong> ${s.gap <= 0 ? '(en avance)' : '(en retard)'}</div>`;
    } else body += `<div class="small" style="margin-top:6px">Tour cible : ${fmtDur(lapTarget)} (${fmtPaceSec(x.target * 60)})</div>`;
    const laps = x.laps.map((t, i) => ({ n: i + 1, d: t - (i ? x.laps[i - 1] : 0) })).slice(-4).reverse().map(l => `<div class="small">Tour ${l.n} : ${fmtDur(l.d)}</div>`).join('');
    const ctrl = x.done
      ? `<div class="notice" style="margin-top:8px">Terminé : ${s.k ? `${s.dist} m en ${fmtDur(s.t)}` : 'aucun tour'}</div>`
      : `<div class="small" style="margin-top:6px">Depuis le dernier tour : <span id="lrSince-${r.id}">${fmtDur(elapsed() - (s.k ? x.laps[s.k - 1] : 0))}</span></div><button class="lapbtn" data-lap="${r.id}">Tour ${s.k + 1}</button>`;
    return `<div class="runner-timer" style="text-align:left"><strong>${r.name}</strong>${body}${ctrl}<div class="actions" style="justify-content:flex-start"><button class="secondary" data-undo="${r.id}" ${s.k ? '' : 'disabled'}>Annuler le dernier tour</button><button class="secondary" data-stop="${r.id}" ${x.done ? 'disabled' : ''}>Arrêter ici</button></div>${laps}</div>`;
  }

  function progressTable() {
    const rows = RUNNERS.map(r => {
      const a = longRuns(r.id);
      if (!a.length) return `<tr><td><strong>${r.name}</strong></td><td colspan="4" class="small">Pas encore de sortie de 2 km ou plus. Première étape suggérée : ${nextDistance(r.id)} m à ${fmtPaceSec(manualPace(r.id) * 60)}.</td></tr>`;
      const last = a[a.length - 1], lastPace = last.time / last.distance * 1000;
      const longest = Math.max(...a.map(x => x.distance)), pct = Math.min(100, longest / 10000 * 100);
      const nd = nextDistance(r.id), np = suggestedPace(r.id, nd);
      const nextTxt = longest >= 10000 ? `10 km atteint : viser ${fmtPaceSec(np * 60)} (−5 à −10 s/km)` : `${nd} m à ${fmtPaceSec(np * 60)}`;
      return `<tr><td><strong>${r.name}</strong><div class="bar" style="margin-top:6px"><i style="width:${pct}%"></i></div></td><td>${longest} m<div class="small">${pct.toFixed(0)} % du 10 km</div></td><td>${fmtPaceSec(lastPace)}<div class="actions" style="margin-top:4px"><button class="secondary mini" data-setpace="${r.id}:${(lastPace / 60).toFixed(3)}" style="padding:4px 7px;font-size:11px">Prendre comme allure actuelle</button></div></td><td>${fmtDur(lastPace * 10)}</td><td>${nextTxt}</td></tr>`;
    }).join('');
    return `<h3 style="margin-top:18px">Progression vers le 10 km</h3><div class="table-wrap"><table><thead><tr><th>Coureur</th><th>Plus longue sortie</th><th>Allure dernière sortie</th><th>10 km à cette allure*</th><th>Prochaine sortie suggérée</th></tr></thead><tbody>${rows}</tbody></table></div><p class="small">*Projection mathématique à allure constante, pas une prédiction. Sorties prises en compte : 2 km et plus. La suggestion ajoute environ 10 % de distance à la fois et ne demande pas d’aller plus vite quand la distance augmente. Indicatif : adapte-le à tes sensations et arrête-toi en cas de douleur inhabituelle.</p>`;
  }

  function renderLongRun() {
    const host = $('longRunPanel'); if (!host) return;
    let main;
    if (!lr) {
      const optDist = [2000, 3000, 5000, 8000, 10000, 15000].map(d => `<option value="${d}" ${String(d) === setup.dist ? 'selected' : ''}>${d / 1000} km</option>`).join('') + `<option value="custom" ${setup.dist === 'custom' ? 'selected' : ''}>Autre distance…</option>`;
      const total = setup.dist === 'custom' ? Number(setup.custom) : Number(setup.dist);
      const paces = RUNNERS.map(r => {
        if (setup.paces[r.id] == null) setup.paces[r.id] = paceInput(suggestedPace(r.id, total || 10000));
        return `<div><label for="lrPace-${r.id}">Allure cible ${r.name} (min:s /km)</label><input id="lrPace-${r.id}" value="${esc(setup.paces[r.id])}" inputmode="numeric" placeholder="6:00"></div>`;
      }).join('');
      main = `<div class="fields"><div><label for="lrDist">Distance visée</label><select id="lrDist">${optDist}</select></div><div id="lrCustomWrap" ${setup.dist === 'custom' ? '' : 'hidden'}><label for="lrCustom">Distance personnalisée (m)</label><input id="lrCustom" type="number" min="400" step="400" value="${esc(setup.custom)}"></div><div><label for="lrLap">Longueur d’un tour (m)</label><input id="lrLap" type="number" min="50" max="1000" step="50" value="${esc(setup.lap)}"></div>${paces}</div>
<div class="actions"><button id="lrStart">Démarrer la sortie</button></div>
<p class="small">Départ commun. Touchez « Tour » pour chaque coureur quand il passe la ligne : le site calcule l’allure, l’écart à la cible et l’arrivée prévue. Les allures proposées viennent de vos dernières sorties (sans accélérer quand la distance augmente). À la fin, chaque coureur est enregistré dans l’historique avec ses temps de tour.</p>`;
    } else {
      const N = totalLaps(), finished = allDone();
      main = `<div class="current">Objectif ${lr.total} m · ${N} tours de ${lr.lap} m</div><div class="timer" id="lrClock">${fmtDur(elapsed())}</div>
<div class="finish-grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">${RUNNERS.map(runnerCard).join('')}</div>
<div class="actions">${finished ? '<button id="lrNew">Nouvelle sortie</button>' : '<button class="danger" id="lrAbort">Fermer la sortie</button>'}</div>
<p class="small">${finished ? 'Sortie terminée : les résultats sont dans l’historique (bouton « Tours » pour le détail).' : 'La sortie reste en cours si vous fermez la page. « Fermer la sortie » conserve les résultats déjà enregistrés.'}</p>`;
    }
    host.innerHTML = `<div class="section-head"><h2>Sortie longue — vers le 10 km</h2><span class="tag">Tours de piste</span></div>${main}${progressTable()}`;
    if (!lr) {
      $('lrDist').onchange = e => { setup.dist = e.target.value; setup.paces = {}; renderLongRun(); };
      $('lrCustom') && ($('lrCustom').oninput = e => { setup.custom = e.target.value; });
      $('lrCustom') && ($('lrCustom').onchange = () => { setup.paces = {}; renderLongRun(); });
      $('lrLap').oninput = e => { setup.lap = e.target.value; };
      RUNNERS.forEach(r => { $('lrPace-' + r.id).oninput = e => { setup.paces[r.id] = e.target.value; }; });
      $('lrStart').onclick = startRun;
    } else {
      host.querySelectorAll('[data-lap]').forEach(b => b.onclick = () => lap(b.dataset.lap));
      host.querySelectorAll('[data-undo]').forEach(b => b.onclick = () => undoLap(b.dataset.undo));
      host.querySelectorAll('[data-stop]').forEach(b => b.onclick = () => stopRunner(b.dataset.stop));
      const nb = $('lrNew'); if (nb) nb.onclick = () => { lr = null; setup.paces = {}; saveLr(); clearInterval(tickId); renderLongRun(); };
      const ab = $('lrAbort'); if (ab) ab.onclick = () => { if (confirm('Fermer la sortie ? Les résultats déjà enregistrés sont conservés, les coureurs encore en course ne seront pas enregistrés.')) { lr = null; setup.paces = {}; saveLr(); clearInterval(tickId); keepAwake(false); renderLongRun(); } };
    }
    host.querySelectorAll('[data-setpace]').forEach(b => b.onclick = () => {
      const [id, p] = b.dataset.setpace.split(':'), v = Math.round(Number(p) * 10) / 10;
      state.paces[id] = Math.min(12, Math.max(2, v)); state.pacesUpdatedAt[id] = Date.now(); save(); renderAll();
    });
  }

  window.showSplits = function (index) {
    const r = state.results[index]; if (!r || !r.splits) return;
    const lines = r.splits.map((t, i) => {
      const d = r.lap && (i + 1) * r.lap > r.distance ? r.distance - i * r.lap : (r.lap || 400);
      return `Tour ${i + 1} : ${fmtDur(t)} (${fmtPaceSec(t / d * 1000)})`;
    });
    const paces = r.splits.map((t, i) => { const d = r.lap && (i + 1) * r.lap > r.distance ? r.distance - i * r.lap : (r.lap || 400); return t / d * 1000; });
    const reg = paces.length > 1 ? `\n\nRégularité : ${Math.round(Math.max(...paces) - Math.min(...paces))} s/km d’écart entre le tour le plus rapide et le plus lent.` : '';
    alert(`${runnerName(r.runner)} — ${r.distance} m en ${fmtDur(r.time)}\n\n` + lines.join('\n') + reg);
  };

  window.rtLongRunInfo = () => (lr && !allDone() ? lr : null);
  window.rtRenderExtra = function () { renderTargets(); renderLongRun(); };
  if (lr && !allDone()) startTick();
  renderAll();
})();
