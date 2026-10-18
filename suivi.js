// RunTogether V1.0 — records, courbes par coureur, volume hebdomadaire, comparaison entre séances, régularité des tours
(function () {
  const $ = id => document.getElementById(id);
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const STD = [400, 800, 1000, 1600, 2000, 5000, 10000];
  const okRes = r => Number.isFinite(r.time) && r.time > 0 && (r.kind !== 'long' || r.completed);
  const dayOf = r => r.date.slice(0, 10);
  const byDate = (a, b) => new Date(a.date) - new Date(b.date);
  const pct = (a, b) => (a / b - 1) * 100;
  const sgn = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(d).replace('.', ',') + ' %';
  const dLabel = d => new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const km = m => (m / 1000).toFixed(1).replace('.', ',');
  const sec1 = s => fmt(s, true);

  function perDay(id, d) {
    const m = {};
    state.results.filter(r => r.runner === id && r.distance === d && okRes(r)).forEach(r => { (m[dayOf(r)] = m[dayOf(r)] || []).push(r.time); });
    return Object.keys(m).sort().map(day => ({ day, mean: mean(m[day]), best: Math.min(...m[day]) }));
  }

  // Comparaison d'une séance avec la précédente et avec la moyenne récente (mêmes distances uniquement).
  window.rtCompare = function (day, id) {
    const ds = [...new Set(state.results.filter(r => r.runner === id && dayOf(r) === day && okRes(r)).map(r => r.distance))];
    const prev = [], rec = [];
    ds.forEach(d => {
      const s = perDay(id, d), i = s.findIndex(x => x.day === day);
      if (i < 1) return;
      prev.push(pct(s[i].mean, s[i - 1].mean));
      rec.push(pct(s[i].mean, mean(s.slice(Math.max(0, i - 3), i).map(x => x.mean))));
    });
    return { prev: prev.length ? mean(prev) : null, recent: rec.length ? mean(rec) : null };
  };

  function prData(id) {
    const out = {};
    state.results.filter(r => r.runner === id && okRes(r)).sort(byDate).forEach(r => {
      const o = out[r.distance] = out[r.distance] || { best: Infinity, date: null, events: [] };
      if (r.time < o.best) { o.events.push({ date: r.date, time: r.time, prev: o.best === Infinity ? null : o.best }); o.best = r.time; o.date = r.date; }
    });
    return out;
  }

  function mondayKey(date) {
    const d = new Date(date), off = (d.getDay() + 6) % 7, m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - off);
    return m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0') + '-' + String(m.getDate()).padStart(2, '0');
  }

  function spark(series) {
    if (series.length < 2) return '<div class="small">Au moins 2 séances sont nécessaires pour tracer la courbe.</div>';
    const W = 300, H = 80, p = 8, ys = series.map(x => x.mean), mn = Math.min(...ys), mx = Math.max(...ys), rg = (mx - mn) || 1;
    const pts = series.map((x, i) => [p + i * (W - 2 * p) / (series.length - 1), p + (x.mean - mn) / rg * (H - 2 * p)]);
    const bi = ys.indexOf(mn);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Temps moyen par séance"><polyline points="${pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')}" fill="none" stroke="var(--blue)" stroke-width="2.5"/>${pts.map((q, i) => `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${i === bi ? 5 : 3}" fill="${i === bi ? 'var(--lime)' : 'var(--blue)'}"/>`).join('')}</svg>`;
  }

  let sparkD = null;
  function render() {
    const host = $('suiviPanel'); if (!host) return;
    const head = '<div class="section-head"><h2>Records et progression</h2><span class="tag">Une distance à la fois</span></div>';
    const valid = state.results.filter(okRes);
    if (!valid.length) { host.innerHTML = head + '<p class="empty">Les records, courbes et volumes apparaîtront après vos premiers chronos.</p>'; return; }

    // distances disponibles
    const cnt = {}; valid.forEach(r => { cnt[r.distance] = (cnt[r.distance] || 0) + 1; });
    const dists = Object.keys(cnt).map(Number).filter(d => STD.includes(d) || cnt[d] >= 3).sort((a, b) => a - b);
    if (!dists.length) dists.push(...Object.keys(cnt).map(Number).sort((a, b) => a - b).slice(0, 3));
    if (sparkD === null || !dists.includes(sparkD)) sparkD = dists.slice().sort((a, b) => cnt[b] - cnt[a])[0];

    // courbes par coureur
    const curves = RUNNERS.map(r => {
      const s = perDay(r.id, sparkD), last = s[s.length - 1], pr = s.length ? Math.min(...s.map(x => x.best)) : null;
      const cmp = last ? rtCompare(last.day, r.id) : null;
      const line = last ? `Dernière séance (${dLabel(last.day)}) : ${sec1(last.mean)} en moyenne · record ${sec1(pr)}${cmp && cmp.prev != null ? `<br>${sgn(cmp.prev)} vs séance précédente` : ''}${cmp && cmp.recent != null ? ` · ${sgn(cmp.recent)} vs moyenne récente` : ''}` : 'Pas de chrono sur cette distance.';
      return `<div class="person"><div class="name">${r.name}</div>${spark(s)}<div class="small">${line}</div></div>`;
    }).join('');

    // records
    const rows = []; const events = [];
    RUNNERS.forEach(r => {
      const pd = prData(r.id);
      dists.forEach(d => {
        const o = pd[d]; if (!o) return;
        const last = o.events[o.events.length - 1], gain = last && last.prev != null ? `−${(last.prev - last.time).toFixed(1).replace('.', ',')} s` : '1er chrono';
        rows.push(`<tr><td><strong>${r.name}</strong></td><td>${d} m</td><td><strong style="color:var(--lime)">${sec1(o.best)}</strong></td><td>${dLabel(o.date)}</td><td>${gain}</td></tr>`);
      });
      Object.entries(pd).forEach(([d, o]) => o.events.forEach(e => { if (e.prev != null) events.push({ r, d, e }); }));
    });
    events.sort((a, b) => new Date(b.e.date) - new Date(a.e.date));
    const evTxt = events.slice(0, 6).map(x => `<div class="small">${dLabel(x.e.date)} · <strong>${x.r.name}</strong> bat son record sur ${x.d} m : ${sec1(x.e.time)} (−${(x.e.prev - x.e.time).toFixed(1).replace('.', ',')} s)</div>`).join('') || '<div class="small">Aucun record battu pour l’instant : il faut au moins 2 chronos sur une même distance.</div>';

    // volume hebdomadaire (8 dernières semaines)
    const weeks = []; const now = new Date(); const cur = mondayKey(now);
    const base = new Date(cur + 'T12:00:00');
    for (let i = 7; i >= 0; i--) { const d = new Date(base); d.setDate(d.getDate() - 7 * i); weeks.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); }
    const vol = {}, days = {};
    state.results.forEach(r => { const w = mondayKey(r.date); vol[w + '|' + r.runner] = (vol[w + '|' + r.runner] || 0) + r.distance; (days[w + '|' + r.runner] = days[w + '|' + r.runner] || new Set()).add(dayOf(r)); });
    const maxV = Math.max(1, ...Object.values(vol));
    const wrows = weeks.slice().reverse().map(w => `<tr><td>Sem. du ${dLabel(w)}</td>${RUNNERS.map(r => { const v = vol[w + '|' + r.id] || 0, n = (days[w + '|' + r.id] || new Set()).size; return `<td>${v ? `<span class="wkbar" style="width:${Math.max(4, v / maxV * 70)}px"></span> ${km(v)} km<div class="small">${n} séance(s)</div>` : '—'}</td>`; }).join('')}</tr>`).join('');

    // régularité des tours
    const reg = RUNNERS.map(r => {
      const a = state.results.filter(x => x.runner === r.id && x.splits && x.splits.length > 1).sort(byDate).slice(-5);
      if (!a.length) return `<div class="small"><strong>${r.name}</strong> : pas encore de tours enregistrés.</div>`;
      const sp = a.map(x => { const p = x.splits.map((t, i) => { const d = x.lap && (i + 1) * x.lap > x.distance ? x.distance - i * x.lap : (x.lap || 400); return t / d; }); return (Math.max(...p) - Math.min(...p)) / mean(p) * 100; });
      return `<div class="small"><strong>${r.name}</strong> : écart moyen de ${mean(sp).toFixed(1).replace('.', ',')} % entre le tour le plus rapide et le plus lent (${a.length} effort(s) récents). Plus c’est bas, plus c’est régulier.</div>`;
    }).join('');

    host.innerHTML = head + `<div class="filters"><div><label for="sparkDist">Distance des courbes</label><select id="sparkDist">${dists.map(d => `<option value="${d}" ${d === sparkD ? 'selected' : ''}>${d} m</option>`).join('')}</select></div></div>
<div class="people" style="margin-top:12px">${curves}</div><p class="small">Chaque courbe montre le temps moyen par séance sur la même distance ; le point vert est la meilleure séance. Seules des distances identiques sont comparées.</p>
<h3 style="margin-top:16px">Records personnels</h3><div class="table-wrap"><table><thead><tr><th>Coureur</th><th>Distance</th><th>Record</th><th>Date</th><th>Dernier gain</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
<h3 style="margin-top:14px">Records battus récemment</h3>${evTxt}
<h3 style="margin-top:16px">Volume par semaine</h3><div class="table-wrap"><table><thead><tr><th>Semaine</th>${RUNNERS.map(r => `<th>${r.name}</th>`).join('')}</tr></thead><tbody>${wrows}</tbody></table></div><p class="small">Distance totale des efforts chronométrés (hors échauffement).</p>
<h3 style="margin-top:14px">Régularité</h3>${reg}`;
    $('sparkDist').onchange = e => { sparkD = Number(e.target.value); render(); };
  }

  const prev = window.rtRenderExtra;
  window.rtRenderExtra = function () { if (prev) prev(); render(); };
  renderAll();
})();
