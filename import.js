/* Smart spreadsheet detection for Graph Maker. Pure functions, no DOM.
   Input: { sheetName: rows[][] } (2-D arrays of cell values, formulas already evaluated).
   Output: list of datasets { id, label, info[], merges[], raw:{headers,rows}, defaults }.
   Recognises:
     A) "stacked blocks": several small tables down a sheet, each = header row (empty corner cell,
        trait names) + a label row (treatment / crop) + numbered replicate rows + an "average" row.
     B) "summary blocks": several tables side by side (one per crop/group) with row labels such as
        "... (%change)" and one value per trait.
   Anything else is left to the ordinary table reader. */
(function (root) {
  'use strict';
  const clean = s => String(s).replace(/\s+/g, ' ').trim();
  const isNum = v => typeof v === 'number' && isFinite(v);
  const empty = v => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  const isText = v => typeof v === 'string' && v.trim() !== '' && !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v.trim());
  function coerce(v) {
    if (typeof v === 'string') {
      const t = v.trim();
      if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return parseFloat(t);
      if (/^[-+]?\d+,\d+$/.test(t)) return parseFloat(t.replace(',', '.'));
      return t === '' ? null : t;
    }
    if (v === undefined) return null;
    if (typeof v === 'number' && !isFinite(v)) return null;
    return v;
  }

  // optimal-string-alignment (Damerau-Levenshtein) distance
  function osa(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  const thrFor = len => len >= 12 ? 2 : len >= 3 ? 1 : 0;

  // cluster raw strings by key similarity; returns Map raw -> canonical key-cluster id and cluster members
  function cluster(items) { // items: [{key, raw}]
    const freq = new Map();
    items.forEach(it => freq.set(it.key, (freq.get(it.key) || 0) + 1));
    const keys = Array.from(freq.keys()).sort((a, b) => freq.get(b) - freq.get(a));
    const reps = [], map = new Map();
    keys.forEach(k => {
      let hit = null;
      for (const r of reps) if (osa(k, r) <= Math.min(thrFor(k.length), thrFor(r.length))) { hit = r; break; }
      if (hit) map.set(k, hit); else { reps.push(k); map.set(k, k); }
    });
    return map;
  }

  // ---------- trait names ----------
  function traitParts(h) {
    let t = clean(h);
    const um = t.match(/\(([^)]*)\)/);
    const unit = um ? clean(um[1]) : '';
    let base = clean(t.replace(/\([^)]*\)/g, ''));
    let key = base.toLowerCase().replace(/^no\.?\s*(of\s+)?/, '').replace(/[^a-z]/g, '');
    key = key.replace(/^(plant)?height/, 'length');
    if (key.length > 3 && key.endsWith('s')) key = key.slice(0, -1);
    return { base, unit, key };
  }
  const titleCase = s => s.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());

  // ---------- block detection ----------
  function findBlocks(rows) {
    const blocks = []; let i = 0;
    while (i < rows.length) {
      const r = rows[i] || [];
      const texts = []; let others = 0;
      r.forEach((v, c) => { if (c > 0 && !empty(v)) { others++; if (isText(v)) texts.push(c); } });
      if (empty(r[0]) && texts.length >= 2 && texts.length === others) {
        const lab = rows[i + 1];
        if (lab && isText(lab[0]) && lab.slice(1).every(empty)) {
          let j = i + 2; const data = [];
          while (j < rows.length && isNum((rows[j] || [])[0])) {
            const rr = rows[j];
            if (texts.some(c => isNum(rr[c]))) data.push(rr);
            j++;
          }
          if (data.length) blocks.push({ label: clean(lab[0]), traits: texts.map(c => ({ col: c, name: clean(r[c]) })), data });
          i = j; continue;
        }
      }
      i++;
    }
    return blocks;
  }

  // side-by-side summary tables
  function findSummary(rows) {
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const r = rows[i] || [];
      const runs = []; let c = 0;
      while (c < r.length) {
        if (!empty(r[c])) {
          let e = c; while (e + 1 < r.length && !empty(r[e + 1])) e++;
          if (e - c + 1 >= 3 && r.slice(c, e + 1).every(isText)) runs.push({ c0: c, c1: e });
          c = e + 1;
        } else c++;
      }
      if (runs.length < 2) continue;
      const body = [];
      for (let k = i + 1; k < rows.length; k++) {
        const rr = rows[k] || [];
        if (runs.some(run => isText(rr[run.c0]) && rr.slice(run.c0 + 1, run.c1 + 1).some(isNum))) body.push(k);
      }
      if (body.length < 3) continue;
      // each labelled cell must be followed only by numbers or blanks
      const ok = runs.every(run => body.every(k => { const rr = rows[k] || []; return !isText(rr[run.c0]) || rr.slice(run.c0 + 1, run.c1 + 1).every(v => empty(v) || isNum(v)); }));
      if (!ok) continue;
      return { headerRow: i, runs: runs.map(run => ({ title: clean(r[run.c0]), traits: r.slice(run.c0 + 1, run.c1 + 1).map((n, k) => ({ col: run.c0 + 1 + k, name: clean(n) })), c0: run.c0 })), body };
    }
    return null;
  }

  // ---------- label parsing ----------
  function parseLabel(label) {
    return clean(label).split(/\s*(?:\+|&|\bwith\b|\band\b)\s*/i).filter(Boolean)
      .map(p => clean(p.replace(/\([^)]*\)/g, '')));
  }
  function irrigationOf(txt) {
    if (/non[\s\-_]*irrig/i.test(txt)) return 'Non-irrigated';
    if (/irrig/i.test(txt)) return 'Irrigated';
    return '';
  }


  // ---------- wide sheets: one measurement per sheet, groups as columns ----------
  function findWide(rows) {
    if (rows.length < 3) return null;
    const rowText = r => (rows[r] || []).map(v => isText(v));
    const rowHasNum = r => (rows[r] || []).some(v => isNum(v));
    // how many leading rows are header rows (text only, at least 2 text cells), up to 3
    let hdr = 0;
    while (hdr < 3 && hdr < rows.length - 3 && !rowHasNum(hdr) && rowText(hdr).filter(Boolean).length >= 2) hdr++;
    if (hdr < 1) return null;
    const width = Math.max(...rows.slice(0, hdr + 1).map(r => r.length));
    // combine header rows: blank cells in upper rows inherit the label on their left (merged cells)
    const lvl = [];
    for (let k = 0; k < hdr; k++) {
      const arr = []; let last = '';
      for (let c = 0; c < width; c++) {
        const v = rows[k][c];
        if (isText(v)) { last = clean(v); arr.push(last); }
        else arr.push(k < hdr - 1 && !empty(rows[hdr - 1][c]) ? last : '');
      }
      lvl.push(arr);
    }
    const heads = [], cols = [];
    for (let c = 0; c < width; c++) {
      const h = clean(lvl.map(a => a[c]).filter(Boolean).join(' '));
      if (h && !lvl.every(a => !a[c])) { cols.push(c); heads.push(h); }
    }
    if (cols.length < 2) return null;
    let numc = 0, tot = 0; const skipped = [];
    cols.forEach(c => { for (let r = hdr; r < rows.length; r++) { const v = rows[r][c]; if (empty(v)) continue; tot++; if (isNum(v)) numc++; else skipped.push({ r: r + 1, c, v: String(v) }); } });
    if (tot < 6 || numc / tot < 0.8) return null;
    const c0 = cols[0]; let lab = 0, nonEmpty = 0;
    for (let r = hdr; r < rows.length; r++) { const v = rows[r][c0]; if (empty(v)) continue; nonEmpty++; if (isText(v) && !isNum(coerce(v))) lab++; }
    if (nonEmpty && lab / nonEmpty > 0.5) return null;
    return { cols, headers: heads, skipped, hdr };
  }
  function splitHeaders(heads) {
    const uniq = Array.from(new Set(heads)), n = uniq.length;
    if (n < 4) return null;
    const words = uniq.map(h => h.split(' '));
    const tries = [];
    for (let k = 1; k <= 2; k++) tries.push({ side: 'suffix', k });
    for (let k = 1; k <= 2; k++) tries.push({ side: 'prefix', k });
    for (const t of tries) {
      const parts = words.map(w => w.length > t.k ? (t.side === 'suffix' ? [w.slice(0, -t.k).join(' '), w.slice(-t.k).join(' ')] : [w.slice(0, t.k).join(' '), w.slice(t.k).join(' ')]) : null);
      if (parts.some(x => !x)) continue;
      const A = Array.from(new Set(parts.map(x => x[0]))), B = Array.from(new Set(parts.map(x => x[1])));
      const combos = new Set(parts.map(x => x[0] + '\u0001' + x[1]));
      if (A.length >= 2 && B.length >= 2 && A.length * B.length === n && combos.size === n) return { map: new Map(uniq.map((h, i) => [h, parts[i]])), A, B };
    }
    return null;
  }
  const fixTypo = s => s.replace(/lenght/gi, m => m[0] === 'L' ? 'Length' : 'length').replace(/\s+/g, ' ').trim();
  function wideDatasets(wides) {
    const allHeads = []; wides.forEach(w => w.w.headers.forEach(h => allHeads.push(h)));
    const sp = splitHeaders(allHeads);
    if (!sp && wides.length < 2) return [];
    const rec = [], info = [], skippedAll = [], traits = [];
    const f1 = 'Group', f2 = 'Condition';
    wides.forEach(({ name, rows, w }) => {
      const trait = fixTypo(clean(name)).replace(/^./, ch => ch.toUpperCase());
      traits.push(trait); let nv = 0;
      w.cols.forEach((c, i) => {
        const head = w.headers[i], parts = sp ? sp.map.get(head) : [head, ''];
        let rep = 0;
        for (let r = w.hdr; r < rows.length; r++) {
          const v = rows[r][c]; if (empty(v)) continue; rep++;
          if (!isNum(v)) { skippedAll.push(`${trait}, ${head}, row ${r + 1}: “${v}”`); continue; }
          rec.push(sp ? [trait, head, parts[0], parts[1], rep, v] : [trait, head, parts[0], rep, v]); nv++;
        }
      });
      info.push(`${trait}: ${nv} values`);
    });
    const headers = sp ? ['Trait', 'Sample', f1, f2, 'Replicate', 'Value'] : ['Trait', 'Group', 'Replicate', 'Value'];
    const lines = [
      `One measurement per sheet, groups as columns: ${wides.length} sheet${wides.length > 1 ? 's' : ''} combined (${traits.join(', ')}).`,
      sp ? `Column names were split into <b>${f1}</b> (${sp.A.join(', ')}) × <b>${f2}</b> (${sp.B.join(', ')}), so two-way tests work directly.`.replace(/<\/?b>/g, '') : 'Column names are used as the groups.',
      'Use the “Trait” filter to switch between sheets.'
    ];
    const multi = wides.filter(x => x.w.hdr > 1).length;
    if (multi) lines.push(`${multi} sheet${multi > 1 ? 's have' : ' has'} a header spread over several rows (for example Group on top, Condition below); the rows were merged automatically.`);
    if (skippedAll.length) lines.push(`Treated as missing (not numbers): ${skippedAll.slice(0, 3).join('; ')}${skippedAll.length > 3 ? ` and ${skippedAll.length - 3} more` : ''}.`);
    const cnt = new Map(); rec.forEach(r => cnt.set(r[0], (cnt.get(r[0]) || 0) + 1));
    const bestTrait = traits.slice().sort((a, b) => (cnt.get(b) || 0) - (cnt.get(a) || 0))[0];
    const ds = [{
      id: 'wide:all', label: `All sheets combined (${traits.length} measurement${traits.length > 1 ? 's' : ''})`, info: lines, merges: [],
      raw: { headers, rows: rec },
      defaults: { layout: 'long', factors: sp ? [f1, f2] : ['Group'], value: 'Value', filters: [{ col: 'Trait', val: bestTrait }], chart: 'bar' }
    }];
    return ds;
  }

  function detect(sheets) {
    const names = Object.keys(sheets);
    const stacked = [], summaries = [], wides = [];
    names.forEach(name => {
      const rows = (sheets[name] || []).map(r => (r || []).map(coerce));
      const first = rows[0] || [];
      const title = first.filter(v => !empty(v)).length === 1 && isText(first.find(v => !empty(v))) ? clean(first.find(v => !empty(v))) : '';
      const blocks = findBlocks(rows);
      if (blocks.length) stacked.push({ name, title, blocks });
      else { const s = findSummary(rows); if (s) summaries.push({ name, title, rows, s }); else { const w = findWide(rows); if (w) wides.push({ name, rows, w }); } }
    });
    const nBlocks = stacked.reduce((a, s) => a + s.blocks.length, 0);
    if (nBlocks < 2 && !summaries.length) return wides.length ? wideDatasets(wides) : [];

    // ---- harmonise trait names across everything ----
    const allHeaders = [];
    stacked.forEach(s => s.blocks.forEach(b => b.traits.forEach(t => allHeaders.push(t.name))));
    summaries.forEach(s => s.s.runs.forEach(r => r.traits.forEach(t => allHeaders.push(t.name))));
    const tp = allHeaders.map(h => Object.assign({ raw: h }, traitParts(h)));
    const cmap = cluster(tp.map(t => ({ key: t.key, raw: t.raw })));
    const groups = new Map();
    tp.forEach(t => { const k = cmap.get(t.key); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
    const traitName = new Map(); // raw header -> canonical display
    const merges = [];
    groups.forEach((list, k) => {
      const f = new Map(); list.forEach(t => { const lab = t.base + '|' + t.unit; f.set(lab, (f.get(lab) || 0) + 1); });
      const baseFreq = new Map(); list.forEach(t => baseFreq.set(t.base.toLowerCase(), (baseFreq.get(t.base.toLowerCase()) || 0) + 1));
      const bestBase = list.find(t => t.base.toLowerCase() === Array.from(baseFreq.entries()).sort((a, b) => b[1] - a[1])[0][0]).base;
      const units = list.map(t => t.unit).filter(Boolean);
      const unit = units.length ? units.sort((a, b) => units.filter(x => x === b).length - units.filter(x => x === a).length)[0] : '';
      let name = titleCase(bestBase);
      if (/^(plant )?(height|length)$/i.test(bestBase) || k === 'length') name = 'Plant height';
      name = name.replace(/\bNo Of\b/, 'No of');
      const disp = unit ? `${name} (${unit})` : name;
      const seen = Array.from(new Set(list.map(t => t.raw)));
      list.forEach(t => traitName.set(t.raw, disp));
      const variants = Array.from(new Set(list.map(t => clean(t.raw)))).filter(v => v !== disp);
      if (variants.length) merges.push({ to: disp, from: variants });
    });

    // ---- crop-name harmonisation ----
    const cropRaw = [];
    stacked.forEach(s => s.blocks.forEach(b => parseLabel(b.label).forEach(n => cropRaw.push(n))));
    summaries.forEach(s => s.s.runs.forEach(r => cropRaw.push(clean(r.title))));
    const ck = cropRaw.map(n => ({ raw: n, key: n.toLowerCase().replace(/[^a-z]/g, '') }));
    const cm = cluster(ck);
    const cropGroups = new Map();
    ck.forEach(c => { const k = cm.get(c.key); if (!cropGroups.has(k)) cropGroups.set(k, []); cropGroups.get(k).push(c); });
    const cropName = new Map(), cropVariants = [];
    cropGroups.forEach(list => {
      const counts = new Map(); list.forEach(c => counts.set(c.key, (counts.get(c.key) || 0) + 1));
      const best = Array.from(counts.entries()).sort((a, b) => b[0].length - a[0].length || b[1] - a[1])[0][0];
      const disp = titleCase(list.find(c => c.key === best).raw);
      list.forEach(c => { cropName.set(c.key, disp); });
      const vs = Array.from(new Set(list.map(c => c.raw))).filter(v => v !== disp);
      vs.forEach(v => cropVariants.push([v, disp]));
      if (vs.length) merges.push({ to: disp, from: vs });
    });
    const crop = raw => cropName.get(clean(raw).toLowerCase().replace(/[^a-z]/g, '')) || titleCase(clean(raw));
    const fixText = s => {
      let t = clean(s).replace(/-{2,}/g, '-').replace(/\bVS\b/g, 'vs');
      cropVariants.forEach(([v, to]) => { t = t.replace(new RegExp('\\b' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), to); });
      return t;
    };

    const datasets = [];
    const traitOrder = [];
    const addTrait = n => { if (!traitOrder.includes(n)) traitOrder.push(n); };

    // ---- replicate dataset ----
    if (nBlocks >= 2) {
      const recs = [];
      stacked.forEach((s, si) => {
        const ctx = s.title + ' ' + s.name;
        const irr = irrigationOf(ctx);
        s.blocks.forEach(b => {
          const parts = parseLabel(b.label).map(crop);
          const mainCrop = parts[0] || b.label, partner = parts.length > 1 ? parts.slice(1).join(' + ') : '';
          const system = parts.length > 1 ? 'Intercropping' : 'Mono';
          const irrL = irr ? irr.toLowerCase() : '';
          const treatment = system === 'Mono'
            ? (irr ? 'Mono-' + irrL : 'Mono')
            : (irr ? `${irr} intercropping with ${partner}` : `Intercropping with ${partner}`);
          b.data.forEach(rr => {
            const rec = { Sheet: clean(s.name), Irrigation: irr || 'Not stated', System: system, Treatment: treatment, Crop: mainCrop, Partner: partner || 'None', Replicate: rr[0], _si: si };
            b.traits.forEach(t => { const n = traitName.get(t.name); addTrait(n); rec[n] = isNum(rr[t.col]) ? rr[t.col] : null; });
            recs.push(rec);
          });
        });
      });
      const irrRank = { 'Irrigated': 0, 'Non-irrigated': 1, 'Not stated': 2 }, sysRank = { Mono: 0, Intercropping: 1 };
      const idx = recs.map((r, i) => i);
      idx.sort((a, b) => (irrRank[recs[a].Irrigation] - irrRank[recs[b].Irrigation]) || (sysRank[recs[a].System] - sysRank[recs[b].System]) || recs[a].Partner.localeCompare(recs[b].Partner) || a - b);
      const headers = ['Sheet', 'Irrigation', 'System', 'Treatment', 'Crop', 'Partner', 'Replicate'].concat(traitOrder.filter(n => recs.some(r => isNum(r[n]))));
      const rowsOut = idx.map(i => headers.map(h => recs[i][h] === undefined ? null : recs[i][h]));
      const cropCount = {}; recs.forEach(r => { cropCount[r.Crop] = (cropCount[r.Crop] || 0) + 1; });
      const crops = Object.keys(cropCount);
      const topCrop = crops.sort((a, b) => cropCount[b] - cropCount[a])[0];
      const traitCount = {}; headers.slice(7).forEach(h => { traitCount[h] = rowsOut.reduce((a, r) => a + (isNum(r[headers.indexOf(h)]) ? 1 : 0), 0); });
      const val = headers.slice(7).find(h => /overall/i.test(h)) || headers.slice(7).sort((a, b) => traitCount[b] - traitCount[a])[0];
      const treatments = Array.from(new Set(rowsOut.map(r => r[3])));
      datasets.push({
        id: 'replicates',
        label: `Replicate measurements – ${stacked.length} sheet${stacked.length > 1 ? 's' : ''} combined`,
        info: [
          `${stacked.length} sheet${stacked.length > 1 ? 's' : ''}, ${nBlocks} tables found, ${recs.length} plants.`,
          `Crops: ${crops.sort().join(', ')}.`,
          `Sheets: ${stacked.map(s => s.name.trim()).join(' · ')}.`,
          `${treatments.length} treatments (irrigation × mono/intercropping × partner crop).`,
          `Measurements: ${headers.slice(7).join(', ')}.`,
          'Average rows and blank rows were skipped.'
        ],
        merges,
        raw: { headers, rows: rowsOut },
        defaults: { layout: 'long', factors: ['Treatment'], value: val, filters: [{ col: 'Crop', val: topCrop }], chart: 'bar' }
      });
    }

    // ---- summary dataset(s) ----
    summaries.forEach(sm => {
      const recs = [];
      sm.s.body.forEach(k => {
        const rr = sm.rows[k];
        sm.s.runs.forEach(run => {
          if (!isText(rr[run.c0])) return;
          const lab = clean(rr[run.c0]);
          const kind = /%\s*change|percent/i.test(lab) ? '% change' : 'Mean';
          const comp = fixText(lab.replace(/\(\s*%\s*change\s*\)/i, '')).replace(/\s+/g, ' ').trim();
          const rec = { Sheet: clean(sm.name), Kind: kind, Comparison: comp, Crop: crop(run.title) };
          let any = false;
          run.traits.forEach(t => { const n = traitName.get(t.name); addTrait(n); const v = rr[t.col]; rec[n] = isNum(v) ? v : null; if (isNum(v)) any = true; });
          if (any) recs.push(rec);
        });
      });
      if (!recs.length) return;
      const headers = ['Sheet', 'Kind', 'Comparison', 'Crop'].concat(traitOrder.filter(n => recs.some(r => isNum(r[n]))));
      const rowsOut = recs.map(r => headers.map(h => r[h] === undefined ? null : r[h]));
      const kinds = Array.from(new Set(recs.map(r => r.Kind)));
      const firstCrop = recs[0].Crop;
      const val = headers.slice(4).find(h => /overall/i.test(h)) || headers[4];
      datasets.push({
        id: 'summary:' + sm.name,
        label: `${clean(sm.name)} – means & % change`,
        info: [
          `Summary table: ${sm.s.runs.length} side-by-side blocks (${sm.s.runs.map(r => crop(r.title)).join(', ')}).`,
          `${recs.length} values: ${kinds.join(' and ')}. Formula results were read as values.`,
          'Each cell is a single number (no replicates), so error bars and tests are not available for this dataset.'
        ],
        merges: [],
        raw: { headers, rows: rowsOut },
        defaults: { layout: 'long', factors: ['Comparison'], value: val, filters: [{ col: 'Kind', val: kinds.includes('% change') ? '% change' : kinds[0] }, { col: 'Crop', val: firstCrop }], chart: 'bar' }
      });
    });
    return datasets.concat(wides.length ? wideDatasets(wides) : []);
  }

  const api = { detect, findBlocks, findSummary, traitParts, osa };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GMImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
