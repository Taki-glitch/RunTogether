// RunTogether V1.0 — bipeur d'allure, bilan de séance (face-à-face, volume, RPE), assiduité du plan, mode plein soleil
(function () {
  const $ = id => document.getElementById(id);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const sgn = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(d).replace('.', ',') + ' %';
  const km = m => (m / 1000).toFixed(1).replace('.', ',') + ' km';

  // ---------- notes synchronisées (plan, RPE, échauffement) ----------
  window.rtSetNote = function (key, v) { state.notes = state.notes || {}; state.notes[key] = { v, u: Date.now() }; save(); };
  const note = key => { const e = state.notes && state.notes[key]; return e && e.v != null ? e.v : null; };

  // ---------- mode plein soleil ----------
  function applySun() {
    document.body.classList.toggle('sun', !!prefs.sun);
    const b = $('sunToggle'); if (b) b.textContent = prefs.sun ? '🌙 Mode sombre' : '☀️ Mode plein soleil';
  }
  if ($('sunToggle')) $('sunToggle').onclick = () => { prefs.sun = !prefs.sun; savePrefs(); applySun(); };
  applySun();

  // ---------- bipeur d'allure ----------
  prefs.paceRunners = prefs.paceRunners || {};
  const PITCH = { tom: 660, tika: 880, taki: 1100 };
  function tone(f, ms) {
    try {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f; g.gain.value = 0.3; o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + ms / 1000);
    } catch (e) {}
  }
  function buildPace() {
    const host = $('paceBox'); if (!host) return;
    host.innerHTML = `<div class="toggles"><div><label for="paceInterval">Bipeur d’allure : un bip à chaque repère de…</label><select id="paceInterval"><option value="0">Désactivé</option><option value="100">100 m</option><option value="200">200 m</option><option value="400">400 m</option></select></div>
<div class="actions" style="margin-top:0">${RUNNERS.map(r => `<label class="check"><input type="checkbox" data-pacer="${r.id}" ${prefs.paceRunners[r.id] ? 'checked' : ''}> ${r.name}</label>`).join('')}<button class="secondary" id="paceTest">Tester les sons</button></div>
<p class="small">Le bip sonne au moment où le coureur doit passer le repère, selon sa cible (grave : Tom, moyen : Tika, aigu : Taki). Place des plots tous les 100 ou 200 m. Actif pour le chrono partagé, les chronos individuels et la sortie longue.</p></div>`;
    $('paceInterval').value = String(prefs.paceInterval || 0);
    $('paceInterval').onchange = e => { prefs.paceInterval = Number(e.target.value); savePrefs(); unlockAudio(); };
    host.querySelectorAll('[data-pacer]').forEach(c => c.onchange = () => { prefs.paceRunners[c.dataset.pacer] = c.checked; savePrefs(); unlockAudio(); });
    $('paceTest').onclick = () => { unlockAudio(); RUNNERS.forEach((r, i) => setTimeout(() => tone(PITCH[r.id], 300), i * 450)); };
  }
  buildPace();
  const lastIdx = {}, lastEl = {};
  function check(key, id, el, dist, targetSec) {
    const P = prefs.paceInterval;
    if (!P || !prefs.paceRunners[id]) return;
    const per = targetSec * P / dist;
    if (!(per > 0)) return;
    if (lastEl[key] !== undefined && el < lastEl[key] - 0.5) lastIdx[key] = 0; // nouvelle répétition
    lastEl[key] = el;
    const idx = Math.floor(el / per);
    if (idx > (lastIdx[key] || 0)) { lastIdx[key] = idx; if (idx * P < dist) tone(PITCH[id], 130); }
  }
  setInterval(() => {
    if (!prefs.paceInterval) return;
    const s = current();
    if (s && sharedStart !== null) {
      const el = sharedElapsed();
      activeRunners().forEach(r => { if (sharedFinished[r.id] === undefined) check('sh-' + r.id, r.id, el, Number(s.distance), targetSeconds(r.id, s.distance)); });
    }
    if (s) activeRunners().forEach(r => { const t = individual[r.id]; if (t && t.running) check('in-' + r.id, r.id, t.elapsed + (performance.now() - t.start) / 1000, Number(s.distance), targetSeconds(r.id, s.distance)); });
    const L = window.rtLongRunInfo && window.rtLongRunInfo();
    if (L) RUNNERS.forEach(r => { const x = L.runners[r.id]; if (x && !x.done) check('lr-' + r.id, r.id, (Date.now() - L.start) / 1000, L.total, x.target * 60 * L.total / 1000); });
  }, 100);

  // ---------- plan : séances cochées ----------
  window.planItem = (text, runner, level, days, w, j) => {
    const key = `plan|${runner}|${level}|${days}|${w}|${j}`;
    return `<li style="list-style:none;margin-left:-18px"><label class="check"><input type="checkbox" data-plan="${key}" ${note(key) ? 'checked' : ''}> <span>${text}</span></label></li>`;
  };
  function attendance() {
    const host = $('planOutput'); if (!host || !host.firstChild) return;
    let el = $('planAttendance');
    if (!el) { el = document.createElement('p'); el.className = 'small'; el.id = 'planAttendance'; host.appendChild(el); }
    const n = id => Object.entries(state.notes || {}).filter(([k, e]) => k.startsWith('plan|' + id + '|') && e.v === true).length;
    el.textContent = 'Assiduité (séances de plan cochées, tous plans confondus) : ' + RUNNERS.map(r => `${r.name} ${n(r.id)}`).join(' · ');
  }
  window.bindPlan = function () {
    document.querySelectorAll('[data-plan]').forEach(c => c.onchange = () => { rtSetNote(c.dataset.plan, c.checked ? true : null); attendance(); });
    attendance();
  };

  // ---------- bilan de séance ----------
  let sessDay = null;
  const days = () => [...new Set(state.results.map(r => r.date.slice(0, 10)))].sort();
  function relPct(r) {
    const t = Number.isFinite(r.targetTime) && r.targetTime > 0 ? r.targetTime : targetSeconds(r.runner, r.distance);
    return (r.time / t - 1) * 100;
  }
  const dayLabel = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  function stats(day, id) {
    const a = state.results.filter(r => r.date.slice(0, 10) === day && r.runner === id);
    if (!a.length) return null;
    const dist = a.reduce((s, r) => s + r.distance, 0), time = a.reduce((s, r) => s + r.time, 0);
    return { n: a.length, dist, pace: time / dist * 1000, rel: mean(a.map(relPct)) };
  }
  function insight(rpe, st) {
    if (!rpe || !st) return '';
    if (rpe >= 8) return 'Séance ressentie très dure : prévois une séance facile ou du repos ensuite avant de relever la cible.';
    if (rpe >= 7 && st.rel > 3) return 'Effort élevé pour des chronos au-dessus de la cible : possible fatigue, garde la cible actuelle.';
    if (rpe <= 4 && st.rel <= 0) return 'Cible tenue avec un effort léger : il y a de la marge pour ajouter une répétition.';
    return 'Effort cohérent avec les chronos.';
  }
  function renderSession() {
    const host = $('sessionPanel'); if (!host) return;
    const head = '<div class="section-head"><h2>Bilan de séance</h2><span class="tag">Face-à-face</span></div>';
    const list = days();
    if (!list.length) { host.innerHTML = head + '<p class="empty">Le bilan apparaîtra après vos premiers chronos.</p>'; return; }
    if (!sessDay || !list.includes(sessDay)) sessDay = list[list.length - 1];
    const rs = state.results.filter(r => r.date.slice(0, 10) === sessDay);
    const groups = [], gi = {};
    rs.forEach(r => {
      const k = `${r.series}|${r.rep}|${r.distance}`;
      if (!(k in gi)) { gi[k] = groups.length; groups.push({ series: r.series, rep: r.rep, distance: r.distance, by: {} }); }
      groups[gi[k]].by[r.runner] = r;
    });
    const rows = groups.map(g => {
      const present = RUNNERS.filter(x => g.by[x.id]);
      const best = present.length > 1 ? present.reduce((a, b) => relPct(g.by[b.id]) < relPct(g.by[a.id]) ? b : a).id : null;
      const cells = RUNNERS.map(x => {
        const r = g.by[x.id];
        if (!r) return '<td>—</td>';
        return `<td${best === x.id ? ' style="color:var(--lime);font-weight:700"' : ''}>${fmt(r.time)}<div class="small">${sgn(relPct(r))} vs cible</div></td>`;
      }).join('');
      return `<tr><td>${esc(g.series)} · #${g.rep}<div class="small">${g.distance} m</div></td>${cells}</tr>`;
    }).join('');
    const cards = RUNNERS.map(r => {
      const st = stats(sessDay, r.id), cmpv = window.rtCompare ? rtCompare(sessDay, r.id) : null, rpe = note(`rpe|${sessDay}|${r.id}`), warm = note(`warm|${sessDay}|${r.id}`);
      const total = st ? st.dist + (Number(warm) || 0) * 1000 : (Number(warm) || 0) * 1000;
      const hist = list.slice(-5).map(d => ({ d, rpe: note(`rpe|${d}|${r.id}`), st: stats(d, r.id) })).filter(x => x.rpe && x.st)
        .map(x => `${dayLabel(x.d)} : RPE ${x.rpe} · ${sgn(x.st.rel)} vs cible`).join('<br>');
      return `<div class="person"><div class="name">${r.name}</div>
<div class="small">${st ? `${st.n} effort(s) chronométré(s) · ${km(st.dist)}<br>Allure moyenne ${Math.floor(st.pace / 60)}:${String(Math.round(st.pace % 60)).padStart(2, '0')} /km · ${sgn(st.rel)} vs cibles${cmpv && cmpv.prev != null ? `<br>${sgn(cmpv.prev)} vs séance précédente (mêmes distances)` : ''}${cmpv && cmpv.recent != null ? `<br>${sgn(cmpv.recent)} vs moyenne des 3 séances précédentes` : ''}` : 'Pas de chrono ce jour-là'}</div>
<label for="warm-${r.id}" style="margin-top:8px">Échauffement + retour au calme (km)</label><input id="warm-${r.id}" data-warm="${r.id}" type="number" min="0" max="50" step="0.1" value="${warm == null ? '' : warm}">
<div class="small" style="margin-top:6px">Total de la séance : <strong>${km(total)}</strong></div>
<label for="rpe-${r.id}" style="margin-top:8px">Effort ressenti (1 = très facile, 10 = maximal)</label><select id="rpe-${r.id}" data-rpe="${r.id}"><option value="">—</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value="${n}" ${Number(rpe) === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
<div class="small" style="margin-top:6px">${insight(Number(rpe), st)}</div>${hist ? `<div class="small" style="margin-top:6px">${hist}</div>` : ''}</div>`;
    }).join('');
    host.innerHTML = head + `<div class="filters"><div><label for="sessDay">Séance du</label><select id="sessDay">${list.slice().reverse().map(d => `<option value="${d}" ${d === sessDay ? 'selected' : ''}>${dayLabel(d)}</option>`).join('')}</select></div></div>
<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Répétition</th>${RUNNERS.map(r => `<th>${r.name}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
<p class="small">L’écart est calculé par rapport à la cible de chacun : c’est la comparaison équitable entre des allures différentes. Le meilleur écart de chaque répétition est en vert.</p>
<div class="people" style="margin-top:12px">${cards}</div>
<p class="small">Le volume compte les chronos enregistrés plus l’échauffement saisi. L’effort ressenti sert à croiser les chronos avec la fatigue : conseils indicatifs, pas un avis médical.</p>`;
    $('sessDay').onchange = e => { sessDay = e.target.value; renderSession(); };
    host.querySelectorAll('[data-warm]').forEach(i => i.onchange = () => { const v = Number(i.value); rtSetNote(`warm|${sessDay}|${i.dataset.warm}`, v > 0 ? v : null); renderSession(); });
    host.querySelectorAll('[data-rpe]').forEach(i => i.onchange = () => { rtSetNote(`rpe|${sessDay}|${i.dataset.rpe}`, i.value ? Number(i.value) : null); renderSession(); });
  }

  const prev = window.rtRenderExtra;
  window.rtRenderExtra = function () {
    if (prev) prev();
    renderSession();
    document.querySelectorAll('[data-plan]').forEach(c => { c.checked = !!note(c.dataset.plan); });
    attendance();
  };
  renderAll();
})();
