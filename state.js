// RunTogether V2.0 — modèle de données et fusion sûre (suppressions et corrections conservées)
(function () {
  const DEFAULT_PACES = { tom: 4, tika: 6, taki: 6 };
  const MAX_TOMB = 180 * 86400000; // on garde les suppressions 180 jours
  const num = (x, d = 0) => { x = Number(x); return Number.isFinite(x) ? x : d; };
  function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); }
  const legacyResultId = r => `legacy-${r.date || ''}-${r.runner || ''}-${r.distance || ''}-${r.time || ''}`;
  const legacySeriesId = s => 's-' + hash(`${s.name}|${s.distance}|${s.reps}|${s.rest}`);
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  function cleanTombs(src) {
    const out = {}, cut = Date.now() - MAX_TOMB;
    Object.entries(src || {}).forEach(([k, v]) => { v = num(v); if (v >= cut) out[k] = v; });
    return out;
  }

  // Met un état dans une forme canonique (identique quel que soit l'appareil).
  function normalize(st) {
    st = st && typeof st === 'object' ? st : {};
    const dr = cleanTombs(st.deleted && st.deleted.results);
    const ds = cleanTombs(st.deleted && st.deleted.series);
    const da = cleanTombs(st.deleted && st.deleted.activities);

    const rm = new Map();
    (Array.isArray(st.results) ? st.results : []).forEach(r => {
      if (!r || typeof r !== 'object') return;
      const id = r.id || legacyResultId(r);
      const x = { ...r, id, updatedAt: num(r.updatedAt) };
      const o = rm.get(id);
      if (!o || x.updatedAt > o.updatedAt || (x.updatedAt === o.updatedAt && JSON.stringify(x) > JSON.stringify(o))) rm.set(id, x);
    });
    const results = [...rm.values()]
      .filter(r => !(r.id in dr && dr[r.id] >= r.updatedAt))
      .sort((a, b) => ((Date.parse(a.date) || 0) - (Date.parse(b.date) || 0)) || cmp(a.id, b.id));

    const sm = new Map();
    (Array.isArray(st.series) ? st.series : []).forEach((s, i) => {
      if (!s || typeof s !== 'object') return;
      const id = s.id || legacySeriesId(s);
      const x = { ...s, id, created: s.created != null ? num(s.created) : i, updatedAt: num(s.updatedAt) };
      const o = sm.get(id);
      if (!o || x.updatedAt > o.updatedAt || (x.updatedAt === o.updatedAt && JSON.stringify(x) > JSON.stringify(o))) sm.set(id, x);
    });
    const series = [...sm.values()]
      .filter(s => !(s.id in ds && ds[s.id] >= s.updatedAt))
      .sort((a, b) => (a.created - b.created) || cmp(a.id, b.id));

    // V2.0 : sorties extérieures (GPS / objectif). Même logique que les chronos : la version la plus récente gagne.
    const am = new Map();
    (Array.isArray(st.activities) ? st.activities : []).forEach(a => {
      if (!a || typeof a !== 'object' || !a.id) return;
      const x = { ...a, updatedAt: num(a.updatedAt) }, o = am.get(a.id);
      if (!o || x.updatedAt > o.updatedAt || (x.updatedAt === o.updatedAt && JSON.stringify(x) > JSON.stringify(o))) am.set(a.id, x);
    });
    const activities = [...am.values()].filter(a => !(a.id in da && da[a.id] >= a.updatedAt))
      .sort((a, b) => ((Date.parse(a.date) || 0) - (Date.parse(b.date) || 0)) || cmp(a.id, b.id));

    const notes = {};
    Object.entries(st.notes || {}).forEach(([k, e]) => { if (e && typeof e === 'object') notes[k] = { v: e.v === undefined ? null : e.v, u: num(e.u) }; });
    const paces = { ...DEFAULT_PACES, ...(st.paces || {}) };
    const pacesUpdatedAt = { ...(st.pacesUpdatedAt || {}) };
    return { ...st, series, results, activities, notes, paces, pacesUpdatedAt, deleted: { results: dr, series: ds, activities: da } };
  }

  // Fusion : pour chaque chrono / série, la version la plus récente gagne ;
  // une suppression plus récente que la dernière modification l'emporte.
  function merge(a, b) {
    if (!a && !b) return normalize({});
    if (!a) return normalize(b);
    if (!b) return normalize(a);
    a = normalize(a); b = normalize(b);
    const maxMap = (x, y) => { const o = { ...x }; Object.entries(y).forEach(([k, v]) => { o[k] = Math.max(num(o[k]), v); }); return o; };
    const paces = {}, pu = {};
    new Set([...Object.keys(a.paces), ...Object.keys(b.paces)]).forEach(k => {
      const ta = num(a.pacesUpdatedAt[k]), tb = num(b.pacesUpdatedAt[k]), pa = a.paces[k], pb = b.paces[k];
      let pick;
      if (pa == null) pick = pb; else if (pb == null) pick = pa;
      else if (ta > tb) pick = pa; else if (tb > ta) pick = pb; else pick = Math.max(num(pa), num(pb));
      paces[k] = pick; pu[k] = Math.max(ta, tb);
    });
    const notes = { ...a.notes };
    Object.entries(b.notes).forEach(([k, e]) => {
      const o = notes[k];
      if (!o || e.u > o.u || (e.u === o.u && JSON.stringify(e) > JSON.stringify(o))) notes[k] = e;
    });
    return normalize({
      notes,
      series: [...a.series, ...b.series],
      results: [...a.results, ...b.results],
      activities: [...a.activities, ...b.activities],
      paces, pacesUpdatedAt: pu,
      deleted: { results: maxMap(a.deleted.results, b.deleted.results), series: maxMap(a.deleted.series, b.deleted.series), activities: maxMap(a.deleted.activities, b.deleted.activities) }
    });
  }

  // Import d'une sauvegarde : remplace tout, sans que l'ancien contenu ne revienne via le cloud.
  function replaceState(old, obj) {
    const t = Date.now(), inc = normalize(obj), o = normalize(old);
    const dr = { ...o.deleted.results }, ds = { ...o.deleted.series }, da = { ...o.deleted.activities };
    o.activities.forEach(a => { da[a.id] = t; }); inc.activities.forEach(a => { a.updatedAt = t + 1; });
    o.results.forEach(r => { dr[r.id] = t; });
    o.series.forEach(s => { ds[s.id] = t; });
    inc.results.forEach(r => { r.updatedAt = t + 1; });
    inc.series.forEach(s => { s.updatedAt = t + 1; });
    const pu = {}; Object.keys(inc.paces).forEach(k => { pu[k] = t + 1; });
    const notes = {};
    Object.keys(o.notes).forEach(k => { notes[k] = { v: null, u: t }; });
    Object.entries(inc.notes).forEach(([k, e]) => { notes[k] = { v: e.v, u: t + 1 }; });
    return normalize({ series: inc.series, results: inc.results, activities: inc.activities, notes, paces: inc.paces, pacesUpdatedAt: pu, deleted: { results: dr, series: ds, activities: da } });
  }

  function newSeries(name, distance, reps, rest, i = 0) {
    const now = Date.now() + i;
    return { id: 's-' + uuid(), name, distance, reps, rest, created: now, updatedAt: now };
  }

  window.rtUuid = uuid;
  window.rtNormalize = normalize;
  window.rtMergeStates = merge;
  window.rtReplaceState = replaceState;
  window.rtNewSeries = newSeries;
})();
