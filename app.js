/* Graph Maker – UI, data handling and SVG charts. Stats live in stats.js */
(function () {
'use strict';
const ST = window.GMStats;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- formatting ----------
const fmt = (x, d = 4) => {
  if (x === null || x === undefined || !isFinite(x)) return '–';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e6 || a < 1e-3) return x.toExponential(2);
  return String(+x.toPrecision(d));
};
const fmtP = p => !isFinite(p) ? '–' : (p < 1e-4 ? '<0.0001' : p.toFixed(4));
const pEq = p => (p < 1e-4 ? 'p < 0.0001' : 'p = ' + p.toFixed(4));
const stars = p => p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns';

// ---------- options ----------
const PAL = {
  okabe: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#444444'],
  muted: ['#4c78a8', '#f58518', '#54a24b', '#b279a2', '#72b7b2', '#e45756', '#9d755d', '#8c8c8c'],
  blues: ['#1f4e8c', '#4f84c4', '#8fb4dd', '#c3d9ee', '#163a68', '#6b9bd0', '#a9c8e6', '#dcebf7'],
  gray: ['#333333', '#767676', '#a8a8a8', '#d4d4d4', '#555555', '#8f8f8f', '#bfbfbf', '#e6e6e6']
};
const opt = {
  chart: 'bar', title: '', xLabel: '', yLabel: '', width: 760, height: 460, fontSize: 12, palette: 'okabe', order: 'file',
  err: 'sem', points: true, letters: true, barWidth: 0.7, colorEach: false, ymin: '', ymax: '',
  bw: 1, box: true, zero: false,
  bins: 0, hstat: 'count', kde: false, normal: false, hgroups: false,
  pstat: 'mean', donut: false, psort: true,
  xCol: -1, pCol: -1, lCol: -1, fcThr: 1, pThr: 0.05, topN: 10, adj: false,
  test: 'auto', post: 'default', alpha: 0.05, tA: 0, tB: 1,
  minorGrid: 'none', minorN: 1, rename: {}, customOrder: [[], [], []], patMode: 'off', patSize: 7, patWidth: 1.2, patColor: 'auto', patMap: {}, errCap: 'cap', errDir: 'both', whisk: 'tukey', meanMk: true, dotSize: 5, sx: -1, sy: -1, sg: -1, fit: 'linear', fitCI: true, corr: 'pearson', mu0: 0, ctrl: 0,
  caption: '', capAlign: 'left', titleAlign: 'left', font: 'inter', grid: 'h', gridStyle: 'solid', legend: 'right', custom: PAL.okabe.slice()
};
const curPal = () => (opt.palette === 'custom' ? opt.custom : (PAL[opt.palette] || PAL.okabe));
const T_MODES = ['student', 'welch', 'paired', 'mwu', 'wilcoxon', 'ks', 'perm', 'ftest', 'onesample'];
const MULTI_MODES = ['anova', 'welchanova', 'kruskal', 'median', 'jt'];
const CATS = ['bar', 'violin', 'box', 'dot', 'line'];

const state = { raw: null, wb: null, sheet: null, layout: 'wide', wideCols: [], f: [-1, -1, -1], val: -1, fileName: '', datasets: [], detect: null, textRaw: null, filters: [{ col: -1, val: '' }, { col: -1, val: '' }] };
let lastSVG = '', lastS = null, lastSc = null, lastVol = null, lastSS = null;


// ---------- fill patterns ----------
const PATS = [['solid', 'Solid'], ['diag', 'Diagonal lines ╱'], ['bdiag', 'Diagonal lines ╲'], ['horiz', 'Horizontal lines'], ['vert', 'Vertical lines'], ['cross', 'Cross-hatch ╳'], ['grid', 'Grid'], ['dots', 'Dots'], ['dotsL', 'Large dots'], ['checker', 'Checkerboard'], ['zigzag', 'Zig-zag']];
const PAT_AUTO = ['solid', 'diag', 'dots', 'horiz', 'cross', 'bdiag', 'vert', 'checker', 'grid', 'zigzag', 'dotsL'];
let PATDEFS = new Map(), lastUnits = [];
function patOf(key, idx) {
  if (opt.patMode === 'off') return 'solid';
  if (opt.patMode === 'custom') return (opt.patMap && opt.patMap[key]) || 'solid';
  return PAT_AUTO[idx % PAT_AUTO.length];
}
function patTile(pid, col, id) {
  const S = Math.max(3, +opt.patSize || 7), lw = Math.max(0.4, +opt.patWidth || 1.2);
  const pc = opt.patColor === 'black' ? '#1c2230' : opt.patColor === 'white' ? '#ffffff' : darken(col, 0.5);
  const st = `stroke="${pc}" stroke-width="${lw}" fill="none"`;
  let w = S, tr = '', marks = '';
  if (pid === 'horiz') marks = `<path d="M0 ${S / 2}H${S}" ${st}/>`;
  else if (pid === 'vert') marks = `<path d="M${S / 2} 0V${S}" ${st}/>`;
  else if (pid === 'diag') { tr = ' patternTransform="rotate(45)"'; marks = `<path d="M${S / 2} 0V${S}" ${st}/>`; }
  else if (pid === 'bdiag') { tr = ' patternTransform="rotate(-45)"'; marks = `<path d="M${S / 2} 0V${S}" ${st}/>`; }
  else if (pid === 'cross') { tr = ' patternTransform="rotate(45)"'; marks = `<path d="M${S / 2} 0V${S}M0 ${S / 2}H${S}" ${st}/>`; }
  else if (pid === 'grid') marks = `<path d="M${S / 2} 0V${S}M0 ${S / 2}H${S}" ${st}/>`;
  else if (pid === 'dots') marks = `<circle cx="${S / 2}" cy="${S / 2}" r="${Math.max(0.8, S * 0.17)}" fill="${pc}"/>`;
  else if (pid === 'dotsL') marks = `<circle cx="${S / 2}" cy="${S / 2}" r="${Math.max(1.2, S * 0.3)}" fill="${pc}"/>`;
  else if (pid === 'checker') { w = S * 2; marks = `<rect width="${S}" height="${S}" fill="${pc}"/><rect x="${S}" y="${S}" width="${S}" height="${S}" fill="${pc}"/>`; }
  else if (pid === 'zigzag') marks = `<path d="M0 ${S * 0.75}L${S / 2} ${S * 0.25}L${S} ${S * 0.75}" ${st}/>`;
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${w}" height="${pid === 'checker' ? S * 2 : S}"${tr}><rect width="${w}" height="${pid === 'checker' ? S * 2 : S}" fill="${col}"/>${marks}</pattern>`;
}
function patFill(pid, col) {
  if (!pid || pid === 'solid') return col;
  const id = `gmp-${pid}-${col.replace('#', '')}`;
  if (!PATDEFS.has(id)) PATDEFS.set(id, patTile(pid, col, id));
  return `url(#${id})`;
}
function injectPatterns(svg) {
  if (!PATDEFS.size) return svg;
  return svg.replace(/(<rect width="[^"]*" height="[^"]*" fill="#fff"\/>)/, `<defs>${[...PATDEFS.values()].join('')}</defs>$1`);
}
function renderPatGrid() {
  const box = $('#patGrid'); if (!box) return;
  const row = box.closest('[data-ctl="patGrid"]'); if (row) row.style.display = (opt.patMode === 'custom' && lastUnits.length) ? '' : 'none';
  if (opt.patMode !== 'custom' || !lastUnits.length) { box.innerHTML = ''; return; }
  const sig = lastUnits.map(u => u.name + u.col).join('|') + '|' + (opt.patMap ? JSON.stringify(opt.patMap) : '') + opt.patSize + opt.patWidth + opt.patColor;
  if (box.dataset.sig === sig) return; box.dataset.sig = sig;
  box.innerHTML = lastUnits.map((u, i) => {
    const pid = (opt.patMap && opt.patMap[u.name]) || 'solid', tid = 'pv' + i;
    return `<div class="pgrow"><svg width="34" height="22"><defs>${patTile(pid, u.col, tid)}</defs><rect width="34" height="22" rx="4" fill="${pid === 'solid' ? u.col : `url(#${tid})`}" stroke="${darken(u.col)}"/></svg><span title="${esc(u.name)}">${esc(u.name)}</span><select data-pu="${esc(u.name)}">${PATS.map(([v, l]) => `<option value="${v}" ${v === pid ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  }).join('');
  $$('select', box).forEach(sel => sel.onchange = () => { opt.patMap = Object.assign({}, opt.patMap, { [sel.dataset.pu]: sel.value }); schedule(0); });
}

// ---------- control specs ----------
const isCat = () => CATS.includes(opt.chart);
const errK = () => ['bar', 'dot', 'line'].includes(opt.chart);
const ERRN = { sem: 'SEM', sd: 'SD', ci: '95% CI', ci99: '99% CI', range: 'min–max', iqr: 'IQR' };
const SPEC = {
  chart: [
    { id: 'err', label: 'Error bars', type: 'select', opts: [['sem', 'SEM (standard error)'], ['sd', 'SD (standard deviation)'], ['ci', '95% confidence interval'], ['ci99', '99% confidence interval'], ['range', 'Range (min – max)'], ['iqr', 'Interquartile range (Q1 – Q3)'], ['none', 'None']], show: errK },
    { id: 'errCap', label: 'Error bar caps', type: 'select', opts: [['cap', 'With caps'], ['none', 'No caps']], show: () => errK() && opt.err !== 'none' },
    { id: 'errDir', label: 'Error bar direction', type: 'select', opts: [['both', 'Up and down'], ['up', 'Upward only']], show: () => errK() && opt.err !== 'none' },
    { id: 'whisk', label: 'Whiskers', type: 'select', opts: [['tukey', 'Tukey (1.5 × IQR, outliers shown)'], ['minmax', 'Min – max']], show: () => opt.chart === 'box' },
    { id: 'meanMk', label: 'Mean marker (◆)', type: 'check', show: () => opt.chart === 'box' },
    { id: 'points', label: 'Show data points', type: 'check', show: isCat },
    { id: 'letters', label: 'Significance letters', type: 'check', show: isCat },
    { id: 'colorEach', label: 'Colour each group', type: 'check', show: isCat },
    { id: 'box', label: 'Box inside violin', type: 'check', show: () => opt.chart === 'violin' },
    { id: 'zero', label: 'Axis starts at 0', type: 'check', show: () => ['violin', 'box', 'dot', 'line'].includes(opt.chart) },
    { id: 'barWidth', label: 'Width', type: 'range', min: .3, max: 1, step: .05, show: isCat },
    { id: 'bw', label: 'Smoothing', type: 'range', min: .3, max: 2.5, step: .1, show: () => opt.chart === 'violin' },
    { id: 'ymin', label: 'Y min', type: 'text', ph: 'auto', show: isCat },
    { id: 'ymax', label: 'Y max', type: 'text', ph: 'auto', show: isCat },
    { id: 'order', label: 'Group order', type: 'select', opts: [['file', 'As in file'], ['alpha', 'Alphabetical'], ['custom', 'Custom (drag on chart)']], show: isCat },
    { id: 'bins', label: 'Bins (0 = auto)', type: 'num', min: 0, max: 100, show: () => opt.chart === 'hist' },
    { id: 'hstat', label: 'Y axis', type: 'select', opts: [['count', 'Count'], ['density', 'Density'], ['percent', 'Percent']], show: () => opt.chart === 'hist' },
    { id: 'hgroups', label: 'Overlay groups', type: 'check', show: () => opt.chart === 'hist' },
    { id: 'kde', label: 'Density curve', type: 'check', show: () => opt.chart === 'hist' },
    { id: 'normal', label: 'Normal fit', type: 'check', show: () => opt.chart === 'hist' },
    { id: 'pstat', label: 'Slice size', type: 'select', opts: [['mean', 'Group mean'], ['sum', 'Group sum'], ['count', 'Count (n)']], show: () => opt.chart === 'pie' },
    { id: 'donut', label: 'Donut', type: 'check', show: () => opt.chart === 'pie' },
    { id: 'psort', label: 'Sort slices', type: 'check', show: () => opt.chart === 'pie' },
    { id: 'xCol', label: 'log2 fold change', type: 'select', dyn: 'cols', show: () => opt.chart === 'volcano' },
    { id: 'pCol', label: 'p-value', type: 'select', dyn: 'cols', show: () => opt.chart === 'volcano' },
    { id: 'lCol', label: 'Gene / label', type: 'select', dyn: 'colsNone', show: () => opt.chart === 'volcano' },
    { id: 'fcThr', label: '|log2FC| cutoff', type: 'num', min: 0, step: .1, show: () => opt.chart === 'volcano' },
    { id: 'pThr', label: 'p cutoff', type: 'num', min: 0, max: 1, step: .01, show: () => opt.chart === 'volcano' },
    { id: 'adj', label: 'Adjust p (Benjamini–Hochberg)', type: 'check', show: () => opt.chart === 'volcano' },
    { id: 'topN', label: 'Label top genes', type: 'num', min: 0, max: 60, show: () => opt.chart === 'volcano' },
    { id: 'sx', label: 'X variable', type: 'select', dyn: 'cols', show: () => opt.chart === 'scatter' },
    { id: 'sy', label: 'Y variable', type: 'select', dyn: 'cols', show: () => opt.chart === 'scatter' },
    { id: 'sg', label: 'Colour by (group)', type: 'select', dyn: 'colsNone', show: () => opt.chart === 'scatter' },
    { id: 'corr', label: 'Correlation', type: 'select', opts: [['pearson', 'Pearson r'], ['spearman', 'Spearman ρ'], ['kendall', 'Kendall τ']], show: () => opt.chart === 'scatter' },
    { id: 'fit', label: 'Regression line', type: 'select', opts: [['linear', 'Linear fit'], ['none', 'None']], show: () => opt.chart === 'scatter' },
    { id: 'fitCI', label: '95% CI band', type: 'check', show: () => opt.chart === 'scatter' && opt.fit === 'linear' },
    { id: 'dotSize', label: 'Marker size', type: 'num', min: 2, max: 14, show: () => ['dot', 'line', 'scatter'].includes(opt.chart) }
  ],
  stats: [
    { id: 'test', label: 'Test', type: 'select', opts: [['auto', 'Auto (checks assumptions)'], ['student', "Student's t-test"], ['welch', "Welch's t-test"], ['paired', 'Paired t-test'], ['mwu', 'Mann–Whitney U'], ['wilcoxon', 'Wilcoxon signed-rank'], ['ks', 'Kolmogorov–Smirnov (2 groups)'], ['perm', 'Permutation test (2 groups)'], ['ftest', 'F-test of variances (2 groups)'], ['onesample', 'One-sample t-test (vs a value)'], ['anova', 'ANOVA (1-, 2- or 3-way)'], ['welchanova', "Welch's ANOVA"], ['kruskal', 'Kruskal–Wallis'], ['median', "Mood's median test"], ['jt', 'Jonckheere–Terpstra trend'], ['none', 'No test']] },
    { id: 'mu0', label: 'Compare group A to', type: 'num', step: 'any', show: () => opt.test === 'onesample' || (lastS && lastS.mode === 'onesample') },
    { id: 'tA', label: 'Group A', type: 'select', dyn: 'cells', show: () => T_MODES.includes(lastS && lastS.mode) && lastS.active.length > 2 },
    { id: 'tB', label: 'Group B', type: 'select', dyn: 'cells', show: () => T_MODES.includes(lastS && lastS.mode) && lastS.mode !== 'onesample' && lastS.active.length > 2 },
    { id: 'post', label: 'Post-hoc', type: 'select', dyn: 'post', show: () => !lastS || (MULTI_MODES.includes(lastS.mode) && lastS.mode !== 'jt') },
    { id: 'ctrl', label: 'Control group', type: 'select', dyn: 'cells', show: () => lastS && lastS.mode === 'anova' && opt.post === 'dunnett' },
    { id: 'alpha', label: 'Significance level', type: 'select', opts: [[0.05, 'α = 0.05'], [0.01, 'α = 0.01'], [0.001, 'α = 0.001']] }
  ],
  style: [
    { id: 'title', label: 'Title', type: 'text', ph: '(none)' },
    { id: 'xLabel', label: 'X-axis label', type: 'text', ph: 'auto' },
    { id: 'yLabel', label: 'Y-axis label', type: 'text', ph: 'auto' },
    { id: 'titleAlign', label: 'Title position', type: 'select', opts: [['left', 'Left'], ['center', 'Middle'], ['right', 'Right']] },
    { id: 'caption', label: 'Figure caption', type: 'text', ph: 'e.g. Figure 1. Effect of …' },
    { id: 'capAlign', label: 'Caption align', type: 'select', opts: [['left', 'Left'], ['center', 'Centre']], show: () => !!opt.caption.trim() },
    { id: 'font', label: 'Font', type: 'select', opts: [['inter', 'Inter'], ['arial', 'Arial / Helvetica'], ['calibri', 'Calibri'], ['verdana', 'Verdana'], ['times', 'Times New Roman'], ['georgia', 'Georgia'], ['helvetica', 'Helvetica'], ['tahoma', 'Tahoma'], ['trebuchet', 'Trebuchet MS'], ['segoe', 'Segoe UI'], ['system', 'System UI'], ['palatino', 'Palatino'], ['garamond', 'Garamond'], ['cambria', 'Cambria'], ['lucida', 'Lucida Sans'], ['courier', 'Courier New'], ['mono', 'Monospace'], ['sans', 'Generic sans-serif'], ['serif', 'Generic serif']] },
    { id: 'fontSize', label: 'Font size', type: 'num', min: 8, max: 24 },
    { id: 'palette', label: 'Colour set', type: 'palette' },
    { id: 'patMode', label: 'Fill patterns', type: 'select', opts: [['off', 'Off (solid colours)'], ['auto', 'Automatic (different per bar/series)'], ['custom', 'Custom (choose below)']], show: () => ['bar', 'box', 'violin', 'hist', 'pie'].includes(opt.chart) },
    { id: 'patGrid', label: 'Pattern per bar', type: 'patgrid', show: () => ['bar', 'box', 'violin', 'hist', 'pie'].includes(opt.chart) && opt.patMode === 'custom' },
    { id: 'patSize', label: 'Pattern spacing (px)', type: 'num', min: 3, max: 24, show: () => ['bar', 'box', 'violin', 'hist', 'pie'].includes(opt.chart) && opt.patMode !== 'off' },
    { id: 'patWidth', label: 'Pattern line width', type: 'num', min: 0.4, max: 4, step: 0.2, show: () => ['bar', 'box', 'violin', 'hist', 'pie'].includes(opt.chart) && opt.patMode !== 'off' },
    { id: 'patColor', label: 'Pattern colour', type: 'select', opts: [['auto', 'Darker shade of the fill'], ['black', 'Black'], ['white', 'White']], show: () => ['bar', 'box', 'violin', 'hist', 'pie'].includes(opt.chart) && opt.patMode !== 'off' },
    { id: 'grid', label: 'Gridlines', type: 'select', opts: [['h', 'Horizontal'], ['v', 'Vertical'], ['both', 'Horizontal + vertical'], ['none', 'None']], show: () => opt.chart !== 'pie' },
    { id: 'gridStyle', label: 'Grid line style', type: 'select', opts: [['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted']], show: () => opt.chart !== 'pie' && opt.grid !== 'none' },
    { id: 'minorGrid', label: 'Minor gridlines', type: 'select', opts: [['none', 'None'], ['h', 'Horizontal'], ['v', 'Vertical'], ['both', 'Horizontal + vertical']], show: () => opt.chart !== 'pie' },
    { id: 'minorN', label: 'Minor lines per interval', type: 'num', min: 1, max: 9, show: () => opt.chart !== 'pie' && opt.minorGrid !== 'none' },
    { id: 'legend', label: 'Legend', type: 'select', opts: [['right', 'Right of chart'], ['bottom', 'Below x-axis title'], ['none', 'Hidden']] },
    { id: 'width', label: 'Width (px)', type: 'num', min: 360, max: 2400, step: 20 },
    { id: 'height', label: 'Height (px)', type: 'num', min: 240, max: 1600, step: 20 }
  ]
};
function ctlHTML(s) {
  if (s.type === 'patgrid') return `<div class="pal" data-ctl="${s.id}"><div class="pl">${s.label}</div><div id="patGrid" class="patgrid"></div></div>`;
  if (s.type === 'palette') return '<div class="pal" data-ctl="palette"><div class="pl">Colour set</div><div id="palPresets" class="presets"></div><div class="pl sub">Click a swatch to change that colour</div><div id="palCustom" class="swatches"></div></div>';
  const id = 'o_' + s.id; let inner = '';
  if (s.type === 'select') inner = `<select id="${id}"></select>`;
  else if (s.type === 'check') inner = `<input type="checkbox" id="${id}">`;
  else if (s.type === 'range') inner = `<input type="range" id="${id}" min="${s.min}" max="${s.max}" step="${s.step}">`;
  else if (s.type === 'num') inner = `<input type="number" id="${id}" ${s.min !== undefined ? `min="${s.min}"` : ''} ${s.max !== undefined ? `max="${s.max}"` : ''} step="${s.step || 1}">`;
  else inner = `<input type="text" id="${id}" placeholder="${s.ph || ''}">`;
  return `<label class="row ${s.type === 'check' ? 'chk' : ''}" data-ctl="${s.id}"><span>${s.label}</span>${inner}</label>`;
}
const ALLSPEC = [].concat(SPEC.chart, SPEC.stats, SPEC.style);
function buildControls() {
  $('#chartCtl').innerHTML = SPEC.chart.map(ctlHTML).join('');
  $('#statsCtl').innerHTML = SPEC.stats.map(ctlHTML).join('') + '<div class="hint" id="statsHint"></div>';
  $('#styleCtl').innerHTML = SPEC.style.map(ctlHTML).join('');
  ALLSPEC.forEach(s => {
    if (s.type === 'palette' || s.type === 'patgrid') return;
    const el = $('#o_' + s.id);
    if (s.opts) el.innerHTML = s.opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('');
    el.addEventListener(s.type === 'select' || s.type === 'check' ? 'change' : 'input', () => {
      if (s.type === 'check') opt[s.id] = el.checked;
      else if (s.type === 'num' || s.type === 'range') opt[s.id] = el.value === '' ? 0 : +el.value;
      else if (s.type === 'select') opt[s.id] = (typeof opt[s.id] === 'number') ? +el.value : el.value;
      else opt[s.id] = el.value;
      schedule();
    });
  });
}
const PRESET_NAMES = [['okabe', 'Colour-blind safe'], ['muted', 'Muted'], ['blues', 'Blues'], ['gray', 'Greyscale'], ['custom', 'Custom']];
function renderPalette(full = true) {
  const box = $('#palPresets'); if (!box) return;
  box.innerHTML = PRESET_NAMES.map(([k, n]) => `<button type="button" class="preset" data-pal="${k}" aria-pressed="${opt.palette === k}"><span class="sw">${(k === 'custom' ? opt.custom : PAL[k]).map(c => `<i style="background:${c}"></i>`).join('')}</span>${n}</button>`).join('');
  $$('.preset', box).forEach(b => b.onclick = () => { opt.palette = b.dataset.pal; renderPalette(); schedule(0); });
  if (!full) return;
  const cg = $('#palCustom'), cur = curPal();
  cg.innerHTML = cur.map((c, i) => `<input type="color" value="${c}" data-ci="${i}" aria-label="Colour ${i + 1}" title="Colour ${i + 1}">`).join('');
  $$('input', cg).forEach(inp => inp.addEventListener('input', () => {
    if (opt.palette !== 'custom') { opt.custom = curPal().slice(); opt.palette = 'custom'; }
    opt.custom[+inp.dataset.ci] = inp.value;
    renderPalette(false); schedule(60);
  }));
}
function syncControls() {
  ALLSPEC.forEach(s => {
    const el = $('#o_' + s.id); if (!el) return;
    if (s.dyn || s.type === 'patgrid') return;
    if (s.type === 'check') el.checked = !!opt[s.id]; else if (document.activeElement !== el) el.value = opt[s.id];
  });
}
function applyVisibility() {
  ALLSPEC.forEach(s => {
    const row = $(`[data-ctl="${s.id}"]`); if (!row) return;
    row.style.display = (!s.show || s.show()) ? '' : 'none';
  });
  $('#secStats').style.display = isCat() ? '' : 'none';
  $$('#chartSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.chart === opt.chart));
}
function setSelect(id, options, value) {
  const el = $('#o_' + id); if (!el) return;
  const sig = options.map(o => o[0] + '|' + o[1]).join('§');
  if (el.dataset.sig !== sig) {
    el.innerHTML = options.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('');
    el.dataset.sig = sig;
  }
  el.value = String(value);
}

// ---------- data import ----------
function toNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (v === null || v === undefined) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  if (/^[-+]?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? parseFloat(s) : NaN;
}
function normalizeRows(rows) {
  rows = rows.map(r => r.slice());
  while (rows.length && rows[rows.length - 1].every(c => c === null || c === undefined || c === '')) rows.pop();
  while (rows.length && rows[0].every(c => c === null || c === undefined || c === '')) rows.shift();
  if (rows.length < 2) return null;
  const w = Math.max(...rows.map(r => r.length));
  let headers = rows[0].slice(); while (headers.length < w) headers.push('');
  const seen = {};
  headers = headers.map((h, i) => {
    let t = (h === null || h === undefined || String(h).trim() === '') ? 'Column ' + (i + 1) : String(h).trim();
    if (seen[t]) { seen[t]++; t = t + ' (' + seen[t] + ')'; } else seen[t] = 1;
    return t;
  });
  const body = rows.slice(1).map(r => { const o = r.slice(); while (o.length < w) o.push(null); return o; })
    .filter(r => r.some(c => c !== null && c !== undefined && c !== ''));
  return { headers, rows: body };
}
function splitText(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const first = lines.find(l => l.trim() !== '') || '';
  const delim = first.includes('\t') ? '\t' : ((first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',');
  return lines.map(l => l.split(delim).map(c => { c = c.trim(); if (/^".*"$/.test(c)) c = c.slice(1, -1); return c === '' ? null : c; }));
}
function parseDelimited(text) { return normalizeRows(splitText(text).filter(r => r.some(c => c !== null))); }
// text (CSV / pasted): look for stacked or summary tables first
function loadText(text, name) {
  state.wb = null; state.fileName = name;
  const rows = splitText(text);
  let ds = [];
  try { ds = GMImport.detect({ [name]: rows }); } catch (e) { console.error(e); }
  state.datasets = ds; state.textRaw = parseDelimited(text);
  if (ds.length) { populateSheetSelect([]); loadSheet('ds:0'); }
  else { $('#sheetRow').style.display = 'none'; setRaw(state.textRaw, name); }
}
function populateSheetSelect(sheetNames) {
  const opts = state.datasets.map((d, i) => `<option value="ds:${i}">★ ${esc(d.label)}</option>`);
  if (!sheetNames.length && state.datasets.length) opts.push('<option value="__text__">Plain table, as-is</option>');
  sheetNames.forEach(n => opts.push(`<option value="${esc(n)}">${state.datasets.length ? 'As-is: ' : ''}${esc(n.trim() || n)}</option>`));
  if (sheetNames.length > 1) opts.push('<option value="__all__">As-is: all sheets stacked (adds a “Sheet” column)</option>');
  $('#sheetSel').innerHTML = opts.join('');
  $('#sheetRow').style.display = opts.length > 1 ? '' : 'none';
}
function colIsNumeric(raw, c) {
  let ne = 0, nn = 0;
  for (const r of raw.rows) { const v = r[c]; if (v === null || v === undefined || v === '') continue; ne++; if (!isNaN(toNum(v))) nn++; }
  return ne > 0 && nn / ne >= 0.8;
}
function autoLayout(raw) {
  const numeric = raw.headers.map((h, i) => colIsNumeric(raw, i));
  state.wideCols = numeric.map((n, i) => n ? i : -1).filter(i => i >= 0);
  const nonNum = numeric.map((n, i) => n ? -1 : i).filter(i => i >= 0);
  if (nonNum.length === 0) { state.layout = 'wide'; state.f = [-1, -1, -1]; state.val = state.wideCols[0] ?? -1; }
  else {
    state.layout = 'long';
    state.f = [nonNum[0] ?? -1, nonNum[1] ?? -1, nonNum[2] ?? -1];
    const nums = state.wideCols;
    state.val = nums.length ? nums[nums.length - 1] : -1;
  }
  guessVolcano(raw);
}
function guessVolcano(raw) {
  const h = raw.headers;
  const find = re => h.findIndex(x => re.test(x));
  const num = h.map((x, i) => colIsNumeric(raw, i));
  let x = find(/log2|lfc|fold|logfc/i), p = find(/p[._ -]?val|padj|fdr|^q|pvalue|^p$/i), l = find(/gene|symbol|name|^id$|feature|protein/i);
  const nums = num.map((n, i) => n ? i : -1).filter(i => i >= 0);
  if (x < 0) x = nums[0] ?? -1;
  if (p < 0 || p === x) p = nums.find(i => i !== x) ?? -1;
  opt.xCol = x; opt.pCol = p; opt.lCol = l;
}
function setRaw(raw, name, ds) {
  if (!raw) { toast('Could not find a table with a header row and at least one data row.'); return; }
  opt.customOrder = [[], [], []]; if (opt.order === 'custom') opt.order = 'file';
  state.raw = raw; state.fileName = name || ''; opt.sx = -1; opt.sy = -1; opt.sg = -1;
  state.filters = [{ col: -1, val: '' }, { col: -1, val: '' }]; state.detect = ds || null;
  autoLayout(raw);
  if (ds) {
    const d = ds.defaults, ix = n => raw.headers.indexOf(n);
    state.layout = 'long'; state.f = [-1, -1, -1];
    d.factors.forEach((n, i) => { state.f[i] = ix(n); });
    state.val = ix(d.value);
    d.filters.forEach((f, i) => { state.filters[i] = { col: ix(f.col), val: String(f.val) }; });
    if (opt.chart === 'volcano' || opt.chart === 'pie' || opt.chart === 'scatter') opt.chart = 'bar';
    opt.test = 'auto'; opt.tA = 0; opt.tB = 1;
  }
  renderDataControls();
  schedule(0);
}
function sheetToRaw(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  return normalizeRows(rows);
}
function loadSheet(name) {
  state.sheet = name;
  if (name.startsWith('ds:')) { const d = state.datasets[+name.slice(3)]; return setRaw(d.raw, state.fileName, d); }
  if (name === '__text__') return setRaw(state.textRaw, state.fileName);
  let raw;
  if (name === '__all__') {
    const parts = state.wb.SheetNames.map(n => ({ n, r: sheetToRaw(state.wb.Sheets[n]) })).filter(p => p.r);
    if (!parts.length) return toast('No usable sheets found.');
    const headers = ['Sheet'];
    parts.forEach(p => p.r.headers.forEach(h => { if (!headers.includes(h)) headers.push(h); }));
    const rows = [];
    parts.forEach(p => p.r.rows.forEach(r => {
      const o = [p.n]; headers.slice(1).forEach(h => { const i = p.r.headers.indexOf(h); o.push(i >= 0 ? r[i] : null); }); rows.push(o);
    }));
    raw = { headers, rows };
  } else raw = sheetToRaw(state.wb.Sheets[name]);
  setRaw(raw, state.fileName);
}
function handleFile(file) {
  const name = file.name; const ext = name.split('.').pop().toLowerCase();
  state.fileName = name;
  if (['csv', 'tsv', 'txt'].includes(ext)) {
    const fr = new FileReader();
    fr.onload = () => loadText(String(fr.result), name);
    fr.readAsText(file);
    return;
  }
  if (typeof XLSX === 'undefined') return toast('Excel reader could not load – save as CSV or paste the cells instead.');
  const fr = new FileReader();
  fr.onload = () => {
    try {
      state.wb = XLSX.read(new Uint8Array(fr.result), { type: 'array' });
      const names = state.wb.SheetNames;
      const sheets = {};
      names.forEach(n => { sheets[n] = XLSX.utils.sheet_to_json(state.wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true }); });
      try { state.datasets = GMImport.detect(sheets); } catch (e) { console.error(e); state.datasets = []; }
      populateSheetSelect(names);
      $('#sheetSel').value = state.datasets.length ? 'ds:0' : names[0];
      loadSheet($('#sheetSel').value);
    } catch (e) { toast('Could not read that file: ' + e.message); }
  };
  fr.readAsArrayBuffer(file);
}

// ---------- data mapping UI ----------
function renderDetect() {
  const d = state.detect; if (!d) return '';
  let h = `<div class="callout" style="font-size:12.5px"><b>Detected: ${esc(d.label)}</b><br>` + d.info.map(esc).join('<br>');
  if (d.merges && d.merges.length) h += `<details style="margin-top:4px"><summary style="cursor:pointer">Spelling differences merged automatically (${d.merges.reduce((a, m) => a + m.from.length, 0)})</summary>` + d.merges.map(m => `<div>${m.from.map(esc).join(', ')} → <b>${esc(m.to)}</b></div>`).join('') + '</details>';
  return h + '</div>';
}
function renderDataControls() {
  const r = state.raw, box = $('#dataMap');
  if (!r) { box.innerHTML = ''; $('#preview').style.display = 'none'; return; }
  const colOpts = (none, sel) => (none ? `<option value="-1">(none)</option>` : '') + r.headers.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h)}</option>`).join('');
  let h = `<div class="row"><span>Layout</span><select id="layoutSel"><option value="wide" ${state.layout === 'wide' ? 'selected' : ''}>Columns = groups</option><option value="long" ${state.layout === 'long' ? 'selected' : ''}>Factors + value</option></select></div>`;
  if (state.layout === 'wide') {
    h += `<div class="hint">Tick the columns to plot (first row = group names, replicates below).</div><div class="cols">` +
      r.headers.map((c, i) => `<label><input type="checkbox" data-wc="${i}" ${state.wideCols.includes(i) ? 'checked' : ''}>${esc(c)}</label>`).join('') + '</div>';
  } else {
    h += ['Factor 1 (x-axis)', 'Factor 2 (colour)', 'Factor 3 (panels)'].map((l, k) => `<div class="row"><span>${l}</span><select data-fc="${k}">${colOpts(true, state.f[k])}</select></div>`).join('');
    h += `<div class="row"><span>Value</span><select id="valSel">${colOpts(false, state.val)}</select></div>`;
  }
  if (state.layout === 'long') {
    const lvl = c => { const seen = []; const set = new Set(); r.rows.forEach(row => { const v = row[c]; if (v === null || v === undefined || v === '') return; const k = String(v); if (!set.has(k)) { set.add(k); seen.push(k); } }); return seen.slice(0, 300); };
    h += '<div class="hint" style="margin-top:2px">Only use rows where…</div>';
    state.filters.forEach((f, k) => {
      h += `<div class="row"><span>Filter ${k + 1}</span><div style="display:flex;gap:4px;min-width:0"><select data-flc="${k}">${colOpts(true, f.col)}</select><select data-flv="${k}" ${f.col < 0 ? 'disabled' : ''}><option value="">(all)</option>${f.col >= 0 ? lvl(f.col).map(v => `<option value="${esc(v)}" ${v === f.val ? 'selected' : ''}>${esc(v)}</option>`).join('') : ''}</select></div></div>`;
    });
  }
  box.innerHTML = renderDetect() + h;
  $$('[data-flc]', box).forEach(c => c.onchange = () => { state.filters[+c.dataset.flc] = { col: +c.value, val: '' }; renderDataControls(); schedule(); });
  $$('[data-flv]', box).forEach(c => c.onchange = () => { state.filters[+c.dataset.flv].val = c.value; schedule(); });
  $('#layoutSel').onchange = e => { state.layout = e.target.value; if (state.layout === 'wide' && !state.wideCols.length) state.wideCols = r.headers.map((x, i) => colIsNumeric(r, i) ? i : -1).filter(i => i >= 0); renderDataControls(); schedule(0); };
  $$('[data-wc]', box).forEach(c => c.onchange = () => { state.wideCols = $$('[data-wc]', box).filter(x => x.checked).map(x => +x.dataset.wc); schedule(); });
  $$('[data-fc]', box).forEach(c => c.onchange = () => { state.f[+c.dataset.fc] = +c.value; opt.customOrder = [[], [], []]; if (opt.order === 'custom') opt.order = 'file'; schedule(); });
  if ($('#valSel')) $('#valSel').onchange = e => { state.val = +e.target.value; schedule(); };
  const pv = $('#preview'); pv.style.display = '';
  pv.innerHTML = '<table><thead><tr>' + r.headers.map(x => `<th>${esc(x)}</th>`).join('') + '</tr></thead><tbody>' +
    r.rows.slice(0, 8).map(row => '<tr>' + row.map(c => `<td>${c === null ? '' : esc(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>' +
    (r.rows.length > 8 ? `<div class="hint" style="padding:4px 8px">${r.rows.length} rows total</div>` : '');
}

// ---------- tidy data ----------
function buildData() {
  const r = state.raw; if (!r) return null;
  const obs0 = []; let factors, valName;
  if (state.layout === 'wide') {
    const cols = state.wideCols.filter(c => c < r.headers.length);
    if (!cols.length) return null;
    factors = ['Group']; valName = 'Value';
    cols.forEach(c => r.rows.forEach(row => { const v = toNum(row[c]); if (!isNaN(v)) obs0.push({ l: [r.headers[c]], y: v }); }));
  } else {
    if (state.val < 0) return null;
    const fc = state.f.filter(i => i >= 0 && i !== state.val);
    valName = r.headers[state.val];
    factors = fc.length ? fc.map(i => r.headers[i]) : ['All'];
    const act = state.filters.filter(f => f.col >= 0 && f.val !== '');
    r.rows.forEach(row => {
      if (act.some(f => String(row[f.col]) !== f.val)) return;
      const v = toNum(row[state.val]); if (isNaN(v)) return;
      const l = fc.length ? fc.map(i => row[i]) : ['All'];
      if (l.some(x => x === null || x === undefined || x === '')) return;
      obs0.push({ l: l.map(String), y: v });
    });
  }
  if (!obs0.length) return null;
  const levels = factors.map((_, f) => {
    const seen = [], set = new Set();
    obs0.forEach(o => { if (!set.has(o.l[f])) { set.add(o.l[f]); seen.push(o.l[f]); } });
    if (opt.order === 'alpha') seen.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    else if (opt.order === 'custom' && opt.customOrder[f] && opt.customOrder[f].length) { const st = opt.customOrder[f]; seen.sort((a, b) => { const ia = st.indexOf(a), ib = st.indexOf(b); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); }); }
    return seen;
  });
  const idx = levels.map(l => new Map(l.map((v, i) => [v, i])));
  return { factors, levels, valName, obs: obs0.map(o => ({ k: o.l.map((v, f) => idx[f].get(v)), y: o.y })) };
}

// ---------- analysis ----------
function analyze(D) {
  const nf = D.factors.length, L = D.levels.map(l => l.length);
  const total = L.reduce((a, b) => a * b, 1);
  const idxOf = ks => ks.reduce((a, k, f) => a * L[f] + k, 0);
  const cells = [];
  for (let i = 0; i < total; i++) {
    const ks = new Array(nf); let rem = i;
    for (let f = nf - 1; f >= 0; f--) { ks[f] = rem % L[f]; rem = Math.floor(rem / L[f]); }
    cells.push({ ks, idx: i, label: ks.map((k, f) => D.levels[f][k]).join(' · '), ys: [] });
  }
  D.obs.forEach(o => cells[idxOf(o.k)].ys.push(o.y));
  cells.forEach(c => Object.assign(c, ST.describe(c.ys)));
  const active = cells.filter(c => c.n > 0);
  const N = active.reduce((a, c) => a + c.n, 0), k = active.length;
  const S = { D, nf, L, cells, active, N, k, mode: 'none', alpha: +opt.alpha, letters: null, pairs: null, anova: null, tt: null, levene: null, error: null, dfE: N - k };
  let sse = 0; active.forEach(c => c.ys.forEach(y => { sse += (y - c.mean) * (y - c.mean); }));
  S.dfE = N - k; S.MSE = S.dfE > 0 ? sse / S.dfE : NaN;
  if (active.length && active.every(c => c.n <= 1)) { S.single = true; S.mode = 'none'; S.norm = []; S.normResid = null; return S; }
  // assumption checks (always computed)
  S.norm = active.map(c => ({ label: c.label, n: c.n, res: ST.shapiroWilk(c.ys) }));
  const resid = []; active.forEach(c => c.ys.forEach(y => resid.push(y - c.mean)));
  S.normResid = resid.length >= 3 && resid.length <= 5000 ? ST.shapiroWilk(resid) : null;
  S.levene = k >= 2 ? ST.levene(active.map(c => c.ys)) : null;
  try { S.bart = k >= 2 && active.every(c => c.n >= 2 && c.sd > 0) ? ST.bartlett(active.map(c => c.ys)) : null; } catch (e) { S.bart = null; }

  let mode = opt.test;
  if (mode === 'auto') {
    const bad = S.norm.filter(x => x.res && x.res.p < 0.05).map(x => x.label);
    const unequal = S.levene && S.levene.p < 0.05;
    const small = active.some(c => c.n < 6) ? ' (with few replicates these checks have little power)' : '';
    if (k < 2) mode = 'none';
    else if (nf > 1) { mode = 'anova'; S.autoReason = 'Multi-factor design, so the factorial ANOVA was used' + (bad.length ? '; Shapiro–Wilk flags non-normal data in ' + bad.slice(0, 3).join(', ') + (bad.length > 3 ? '…' : '') + ', so interpret with care.' : '.'); }
    else if (bad.length) { mode = k === 2 ? 'mwu' : 'kruskal'; S.autoReason = 'Shapiro–Wilk flagged non-normal data in ' + bad.slice(0, 3).join(', ') + (bad.length > 3 ? '…' : '') + ', so a rank-based test was chosen' + small + '.'; }
    else if (unequal) { mode = k === 2 ? 'welch' : 'welchanova'; S.autoReason = 'Data look normal but variances differ (Brown–Forsythe p = ' + fmtP(S.levene.p) + '), so a Welch test was chosen' + small + '.'; }
    else { mode = k === 2 ? 'student' : 'anova'; S.autoReason = 'Data look normal with similar variances' + small + '.'; }
  }
  if (k < 2 && mode !== 'onesample') mode = 'none';
  S.mode = mode;
  const POSTS = { anova: ['tukey', 'dunnett', 'bonferroni', 'sidak', 'holm', 'lsd', 'scheffe'], welchanova: ['gh', 't2', 'bonferroni', 'holm'], kruskal: ['bonferroni', 'holm', 'sidak', 'bh'], median: ['bonferroni', 'holm', 'sidak', 'bh'], jt: [] };
  let post = opt.post;
  if (POSTS[mode]) post = (post === 'none') ? 'none' : (POSTS[mode].includes(post) ? post : (POSTS[mode][0] || 'none'));
  S.post = post;
  const finishPairs = (pairs, statName, title) => {
    S.pairs = pairs.map(p => Object.assign(p, { a: active[p.i].label, b: active[p.j].label }));
    S.pairStat = statName; S.pairTitle = title; S.pairAdj = post === 'lsd' ? 'p (unadjusted)' : 'Adj. p';
    if (post === 'dunnett') {
      S.letters = new Map(); active.forEach((c, i) => S.letters.set(c.idx, ''));
      pairs.forEach(p => { S.letters.set(active[p.j].idx, p.p < S.alpha ? stars(p.p) : 'ns'); });
      S.starMode = true; return;
    }
    const pm = new Map(); pairs.forEach(p => { pm.set(p.i + '_' + p.j, p.p); pm.set(p.j + '_' + p.i, p.p); });
    const lt = ST.letters(active.map(c => c.mean), (i, j) => pm.get(i + '_' + j) < S.alpha);
    S.letters = new Map(); active.forEach((c, i) => S.letters.set(c.idx, lt[i]));
  };
  try {
    if (T_MODES.includes(mode)) {
      let a = Math.min(opt.tA, k - 1), b = Math.min(opt.tB, k - 1);
      if (a === b && mode !== 'onesample') { a = 0; b = Math.min(1, k - 1); }
      opt.tA = a; opt.tB = b;
      const ya = active[a].ys, yb = active[b].ys;
      S.tt = mode === 'mwu' ? ST.mannWhitney(ya, yb) : mode === 'wilcoxon' ? ST.wilcoxon(ya, yb) : mode === 'ks' ? ST.ksTest(ya, yb) : mode === 'perm' ? ST.permTest(ya, yb) : mode === 'ftest' ? ST.fTest(ya, yb) : mode === 'onesample' ? ST.oneSampleT(ya, +opt.mu0 || 0) : ST.tTest(ya, yb, mode, S.alpha);
      S.tt.idx = [active[a].idx, active[b].idx]; S.tt.labels = mode === 'onesample' ? [active[a].label, 'μ = ' + fmt(+opt.mu0 || 0)] : [active[a].label, active[b].label];
    } else if (mode === 'anova') {
      try { S.anova = ST.nwayAnova(D.obs, L, D.factors); } catch (e) { S.error = e.message + ' The ANOVA table is skipped; letters on the chart still come from the all-groups comparison.'; }
      if (post !== 'none' && S.dfE > 0) {
        const T = { tukey: ['q', 'Tukey HSD'], bonferroni: ['t', 'Bonferroni-adjusted t-tests'], sidak: ['t', 'Šidák-adjusted t-tests'], holm: ['t', 'Holm step-down t-tests'], lsd: ['t', "Fisher's LSD (unadjusted t-tests)"], scheffe: ['F', 'Scheffé test'], dunnett: ['t', 'Dunnett (each group vs control)'] }[post];
        const ctrl = Math.max(0, Math.min(k - 1, +opt.ctrl || 0)); opt.ctrl = ctrl;
        const pr = ST.posthoc2(active.map(c => ({ n: c.n, mean: c.mean })), S.MSE, S.dfE, post, ctrl);
        finishPairs(pr, T[0], post === 'dunnett' ? `Dunnett (vs control: ${active[ctrl].label})` : T[1]);
        if (post === 'dunnett') S.pairNote = 'Dunnett p-values use equal-correlation integration (exact for balanced groups, close for unbalanced). Stars on the chart compare each group with the control.';
      }
    } else if (mode === 'welchanova') {
      const gs = active.map(c => c.ys);
      S.omni = ST.welchAnova(gs);
      if (post !== 'none') finishPairs(ST.gamesHowell(gs, post), post === 'gh' ? 'q' : 't', { gh: 'Games–Howell', t2: 'Tamhane T2 (Welch t-tests, Šidák-adjusted)', bonferroni: 'Welch t-tests, Bonferroni-adjusted', holm: 'Welch t-tests, Holm-adjusted' }[post]);
    } else if (mode === 'kruskal') {
      const gs = active.map(c => c.ys);
      S.omni = ST.kruskal(gs);
      if (post !== 'none') finishPairs(ST.dunn(gs, S.omni, post), 'z', "Dunn's test, " + { bonferroni: 'Bonferroni', holm: 'Holm', sidak: 'Šidák', bh: 'Benjamini–Hochberg (FDR)' }[post] + '-adjusted');
    } else if (mode === 'median') {
      const gs = active.map(c => c.ys);
      S.omni = ST.moodMedian(gs);
      if (post !== 'none') {
        const pr = []; for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const o = ST.moodMedian([gs[i], gs[j]]); pr.push({ i, j, diff: active[i].med - active[j].med, stat: o.chi2, p: o.p }); }
        const adj = ST.adjustP(pr.map(x => x.p), post); pr.forEach((x, ix) => { x.p = adj[ix]; });
        finishPairs(pr, 'χ²', 'Pairwise Mood median tests, ' + { bonferroni: 'Bonferroni', holm: 'Holm', sidak: 'Šidák', bh: 'Benjamini–Hochberg' }[post] + '-adjusted');
      }
    } else if (mode === 'jt') {
      S.omni = ST.jonckheere(active.map(c => c.ys));
    }
  } catch (e) { S.error = e.message; }
  return S;
}

// ---------- svg helpers ----------
const INK = '#1c2230', INK2 = '#5a6372', GRID = '#dde1e7', AXIS = '#8a93a2';
function niceTicks(lo, hi, n = 6) {
  if (!(hi > lo)) { hi = lo + 1; }
  const span = hi - lo, s0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(s0))), nm = s0 / mag;
  const step = (nm < 1.5 ? 1 : nm < 3 ? 2 : nm < 7 ? 5 : 10) * mag;
  const s = Math.floor(lo / step + 1e-9) * step, e = Math.ceil(hi / step - 1e-9) * step, t = [];
  for (let v = s; v <= e + step * 1e-6; v += step) t.push(+v.toFixed(12));
  return t;
}
function darken(hex, f = 0.7) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round((n >> 16) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}
const jit = i => ((i * 9301 + 49297) % 233280) / 233280 - 0.5;
const tipAttr = html => ` data-tip="${esc(html)}"`;
const FONTS = { inter: "Inter, Arial, Helvetica, sans-serif", arial: "Arial, Helvetica, sans-serif", calibri: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif", verdana: "Verdana, Geneva, sans-serif", times: "'Times New Roman', Times, serif", georgia: "Georgia, 'Times New Roman', serif", courier: "'Courier New', Courier, monospace", helvetica: "'Helvetica Neue', Helvetica, Arial, sans-serif", tahoma: "Tahoma, Geneva, sans-serif", trebuchet: "'Trebuchet MS', Helvetica, sans-serif", segoe: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", palatino: "'Palatino Linotype', Palatino, 'Book Antiqua', serif", garamond: "Garamond, 'EB Garamond', 'Times New Roman', serif", cambria: "Cambria, 'Caladea', Georgia, serif", lucida: "'Lucida Sans Unicode', 'Lucida Grande', sans-serif", system: "system-ui, -apple-system, 'Segoe UI', sans-serif", mono: "ui-monospace, Menlo, Consolas, 'DejaVu Sans Mono', monospace", serif: 'serif', sans: 'sans-serif' };
function svgOpen(W, H) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONTS[opt.font] || FONTS.inter}" font-size="${opt.fontSize}"><rect width="${W}" height="${H}" fill="#fff"/>`; }
function addCaption(svg) {
  const cap = (opt.caption || '').trim(); if (!cap) return svg;
  const m = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/); if (!m) return svg;
  const W = +m[1], H = +m[2], fs = opt.fontSize, maxW = W - 56;
  const words = cap.replace(/\s+/g, ' ').split(' '), lines = []; let cur = '';
  words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (cur && tw(t, fs) > maxW) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  const lh = fs * 1.35, add = lines.length * lh + 18, ctr = opt.capAlign === 'center';
  const lead = (cap.match(/^(Fig(?:ure)?\.?\s*\d+[a-z]?[.:]?)/i) || [''])[0];
  let t = '';
  lines.forEach((ln, i) => {
    const y = H + 8 + fs + i * lh;
    let body = esc(ln);
    if (i === 0 && lead && ln.startsWith(lead)) body = `<tspan font-weight="700">${esc(lead)}</tspan>${esc(ln.slice(lead.length))}`;
    t += `<text x="${ctr ? W / 2 : 28}" y="${y}" fill="${INK}" text-anchor="${ctr ? 'middle' : 'start'}" data-edit="caption">${body}</text>`;
  });
  return svg.replace(/viewBox="0 0 \S+ \S+" width="\S+" height="\S+"/, `viewBox="0 0 ${W} ${H + add}" width="${W}" height="${H + add}"`)
    .replace(/<rect width="\S+" height="\S+" fill="#fff"\/>/, `<rect width="${W}" height="${H + add}" fill="#fff"/>`)
    .replace(/<\/svg>\s*$/, t + '</svg>');
}
const gridH = () => opt.grid === 'h' || opt.grid === 'both', gridV = () => opt.grid === 'v' || opt.grid === 'both';
const mH = () => opt.minorGrid === 'h' || opt.minorGrid === 'both', mV = () => opt.minorGrid === 'v' || opt.minorGrid === 'both';
function minorVals(ticks, n) { const out = []; n = Math.max(1, Math.min(9, Math.round(n) || 1)); for (let i = 0; i < ticks.length - 1; i++) for (let k = 1; k <= n; k++) out.push(ticks[i] + (ticks[i + 1] - ticks[i]) * k / (n + 1)); return out; }
function minorLine(x1, y1, x2, y2) {
  const da = opt.gridStyle === 'dash' ? ' stroke-dasharray="4 4"' : opt.gridStyle === 'dot' ? ' stroke-dasharray="1 3.5" stroke-linecap="round"' : '';
  return `<line x1="${x1}" x2="${x2}" y1="${y1}" y2="${y2}" stroke="#e8ebf0" stroke-width="0.8"${da}/>`;
}
function gridLine(x1, y1, x2, y2) {
  const da = opt.gridStyle === 'dash' ? ' stroke-dasharray="5 4"' : opt.gridStyle === 'dot' ? ' stroke-dasharray="1.2 4" stroke-linecap="round"' : '';
  return `<line x1="${x1}" x2="${x2}" y1="${y1}" y2="${y2}" stroke="${GRID}" stroke-width="${opt.gridStyle === 'dot' ? 1.6 : 1}"${da}/>`;
}
// legend placed under the x-axis title: items [{label,color,op}]
function legendLayout(items, W, fs, title) {
  const maxW = W - 48, rows = []; let row = [], rw = 0;
  (title ? [{ title }] : []).concat(items).forEach(it => {
    const w = it.title ? tw(it.title, fs) + 16 : 19 + tw(it.label, fs) + 22;
    if (row.length && rw + w > maxW) { rows.push({ items: row, w: rw }); row = []; rw = 0; }
    row.push(Object.assign({ w }, it)); rw += w;
  });
  if (row.length) rows.push({ items: row, w: rw });
  return { rows, height: rows.length * (fs + 10) + 10 };
}
function legendDraw(lay, W, y, fs) {
  let g = '';
  lay.rows.forEach((r, ri) => {
    let x = (W - r.w) / 2; const yy = y + ri * (fs + 10) + fs;
    r.items.forEach(it => {
      if (it.title) g += txt(x, yy, it.title, { w: 600, fill: INK2 });
      else g += `<g${it.dragIdx !== undefined ? ` data-lg="${it.dragIdx}"` : ''}><rect x="${x}" y="${yy - 10}" width="12" height="12" rx="3" fill="${it.fillv || it.color}"${it.op ? ` fill-opacity="${it.op}"` : ''}${it.fillv && it.fillv !== it.color ? ` stroke="${darken(it.color)}" stroke-width="0.6"` : ''}/>` + txt(x + 19, yy, it.label) + '</g>';
      x += it.w;
    });
  });
  return g;
}
const txt = (x, y, s, a = {}) => `<text x="${x}" y="${y}" fill="${a.fill || INK}" text-anchor="${a.anchor || 'start'}" ${a.w ? `font-weight="${a.w}"` : ''} ${a.size ? `font-size="${a.size}"` : ''} ${a.rot ? `transform="rotate(${a.rot} ${x} ${y})"` : ''} ${a.dy ? `dy="${a.dy}"` : ''}${a.edit ? ` data-edit="${a.edit}"` : ''}${a.ph ? ' data-ph="1"' : ''}>${esc(s)}</text>`;
const tw = (s, fs) => String(s).length * fs * 0.56;
function errB(c) {
  const m = c.mean; let lo, hi;
  switch (opt.err) {
    case 'sem': lo = m - c.sem; hi = m + c.sem; break;
    case 'sd': lo = m - c.sd; hi = m + c.sd; break;
    case 'ci': lo = m - c.ci; hi = m + c.ci; break;
    case 'ci99': { const e = c.n > 1 ? ST.qt2(0.01, c.n - 1) * c.sem : NaN; lo = m - e; hi = m + e; break; }
    case 'range': lo = c.min; hi = c.max; break;
    case 'iqr': lo = c.q1; hi = c.q3; break;
    default: return null;
  }
  if (!isFinite(lo) || !isFinite(hi) || c.n < 2) return null;
  if (opt.errDir === 'up') lo = m;
  return [lo, hi];
}
function errDraw(cx, e, inner, yS) {
  if (!e) return '';
  const yt = yS(e[1]), yb = yS(e[0]), cap = opt.errCap === 'none' ? 0 : Math.min(inner * 0.35, 12);
  return `<g stroke="${INK}" stroke-width="1.4" fill="none"><path d="M${cx},${yt}V${yb}${cap ? `M${cx - cap / 2},${yt}h${cap}${opt.errDir === 'up' ? '' : `M${cx - cap / 2},${yb}h${cap}`}` : ''}"/></g>`;
}
function barPath(x, w, base, top) {
  const h = Math.abs(base - top), r = Math.min(3, w / 2, h);
  if (h < 0.5) return `M${x},${base}h${w}`;
  if (top < base) return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
  return `M${x},${base}V${top - r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top - r}V${base}Z`;
}
function titleSvg(xl, xr, y, fs) {
  const T = titleOf(''), al = opt.titleAlign, x = al === 'center' ? (xl + xr) / 2 : al === 'right' ? xr : xl, anchor = al === 'center' ? 'middle' : al === 'right' ? 'end' : 'start';
  return T ? txt(x, y, T, { size: fs + 4, w: 600, edit: 'title', anchor }) : txt(x, y, 'Click to add a title', { size: fs + 4, w: 600, edit: 'title', fill: '#b4bbc8', ph: 1, anchor });
}
function titleOf(def) { return opt.title || def || ''; }

// ---------- categorical charts (bar, violin) ----------
function renderCat(S, kind) {
  const showPts = opt.points && !S.single;
  const D = S.D, L = S.L, fs = +opt.fontSize, W = +opt.width, Hbase = +opt.height, pal = curPal();
  let H = Hbase;
  const L1 = L[0], L2 = L[1] || 1, L3 = L[2] || 1;
  const lev1 = D.levels[0], rn1 = l => (opt.rename && opt.rename[l]) || l, lev2 = D.levels[1] || [''], lev3 = D.levels[2] || [''];
  const cellAt = (a, b, c) => S.cells[(a * L2 + b) * L3 + c];
  const showLetters = opt.letters && S.letters;
  const EK = kind === 'bar' || kind === 'dot' || kind === 'line';
  const useBracket = kind !== 'violin' && S.mode !== 'onesample' && T_MODES.includes(S.mode) && S.tt && (S.nf < 3 || S.tt.idx.every((i, _, arr) => S.cells[i].ks[2] === S.cells[arr[0]].ks[2]));
  const topOf = c => { if (EK) { const e = errB(c); return Math.max(c.mean, e ? e[1] : c.mean, showPts ? c.max : -Infinity); } return c.max; };

  let lo = Infinity, hi = -Infinity;
  S.cells.forEach(c => {
    if (!c.n) return;
    if (EK) { const e = errB(c) || [c.mean, c.mean]; lo = Math.min(lo, e[0], c.mean, (kind === 'bar' || opt.zero) ? 0 : Infinity); hi = Math.max(hi, e[1], c.mean, (kind !== 'bar' && opt.zero) ? 0 : -Infinity); if (showPts) { lo = Math.min(lo, c.min); hi = Math.max(hi, c.max); } }
    else { lo = Math.min(lo, c.min); hi = Math.max(hi, c.max); if (opt.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); } }
  });
  if (!isFinite(lo)) return null;
  let span = (hi - lo) || Math.abs(hi) || 1;
  hi += span * ((showLetters || useBracket) ? 0.14 : 0.05);
  if (lo < 0) lo -= span * 0.05; else if (kind !== 'bar' && !opt.zero) lo -= span * 0.04;
  const uMin = opt.ymin !== '' && isFinite(+opt.ymin), uMax = opt.ymax !== '' && isFinite(+opt.ymax);
  if (uMin) lo = +opt.ymin; if (uMax) hi = +opt.ymax;
  if (hi <= lo) hi = lo + 1;
  let ticks = niceTicks(lo, hi, 6);
  const d0 = uMin ? lo : (kind === 'bar' && lo >= 0 ? 0 : ticks[0]);
  const d1 = uMax ? hi : ticks[ticks.length - 1];
  ticks = ticks.filter(t => t >= d0 - 1e-9 && t <= d1 + 1e-9);

  // geometry
  const hue = L2 > 1;
  const legMode = hue ? opt.legend : 'none', legRight = legMode === 'right', legBottom = legMode === 'bottom';
  const legW = legRight ? Math.max(tw(D.factors[1], fs) + 20, ...lev2.map(l => tw(l, fs) + 30), 90) : 0;
  const mr = legRight ? legW + 28 : 22, mt = 40 + (L3 > 1 ? 22 : 0);
  const gap = L3 > 1 ? 22 : 0;
  let ml = 66;
  let pw = (W - ml - mr - (L3 - 1) * gap) / L3, band = pw / L1;
  const maxLab = Math.max(...lev1.map(l => tw(rn1(l), fs)));
  const fsL = maxLab > band * 0.92 ? Math.max(9, fs - 2) : fs;
  const maxChars = Math.max(4, Math.floor(band * 0.98 / (fsL * 0.56)));
  const wrap = t => { const toks = String(t).split(/\s+/).flatMap(w => w.split(/(?<=-)(?=.)/)); const lines = []; let cur = ''; toks.forEach(w => { const jn = cur && !cur.endsWith('-') ? cur + ' ' + w : cur + w; if (cur && jn.length > maxChars) { lines.push(cur); cur = w; } else cur = jn; }); lines.push(cur); return lines; };
  let wrapped = lev1.map(l => wrap(rn1(l))), maxLines = Math.max(...wrapped.map(l => l.length));
  const rotate = maxLab > band * 0.92 && (maxLines > 9 || wrapped.some(l => l.some(x => x.length > maxChars * 1.12)));
  if (rotate) { ml = Math.min(W * 0.35, Math.max(66, Math.round(Math.min(maxLab, 620) * Math.cos(35 * Math.PI / 180) - band * 0.4))); pw = (W - ml - mr - (L3 - 1) * gap) / L3; band = pw / L1; }
  const mb = (rotate ? Math.min(maxLab, 620) * Math.sin(35 * Math.PI / 180) + fs + 14 : maxLines * fsL * 1.2 + 8) + 34;
  H = Hbase + Math.max(0, mb - (fs * 1.2 + 42));
  const legLay = legBottom ? legendLayout(lev2.map((l, i) => ({ label: l, color: pal[i % pal.length], fillv: patFill(patOf(l, i), pal[i % pal.length]), dragIdx: i })), W, fs, D.factors[1]) : null;
  const legH = legLay ? legLay.height : 0;
  const y0 = mt, y1 = H - mb;
  const yS = v => y1 - (v - d0) / (d1 - d0) * (y1 - y0);
  const geom = {};
  const unitName = c => hue ? lev2[c.ks[1]] : lev1[c.ks[0]], unitIdx = c => hue ? c.ks[1] : c.ks[0];
  const fillOf = (c, col) => patFill(patOf(unitName(c), unitIdx(c)), col);
  lastUnits = (hue ? lev2 : lev1).map((n, i) => ({ name: n, col: pal[(hue ? i : (opt.colorEach ? i : 0)) % pal.length] }));
  let g = svgOpen(W, H + legH);
  g += titleSvg(ml, W - mr, 24, fs);
  // grid & y ticks
  for (let p = 0; p < L3; p++) {
    const px = ml + p * (pw + gap);
    if (mH()) minorVals(ticks, opt.minorN).forEach(v => { g += minorLine(px, yS(v), px + pw, yS(v)); });
    if (gridH()) ticks.forEach(t => { g += gridLine(px, yS(t), px + pw, yS(t)); });
    if (gridV()) for (let a = 0; a <= L1; a++) g += gridLine(px + band * a, y0, px + band * a, y1);
    if (d0 < 0 && d1 > 0) g += `<line x1="${px}" x2="${px + pw}" y1="${yS(0)}" y2="${yS(0)}" stroke="${AXIS}" stroke-width="1"/>`;
    g += `<line x1="${px}" x2="${px + pw}" y1="${y1}" y2="${y1}" stroke="${AXIS}"/>`;
    if (L3 > 1) g += `<g data-pan="${p}">` + txt(px + pw / 2, mt - 10, `${D.factors[2]}: ${lev3[p]}`, { anchor: 'middle', w: 600, fill: INK2 }) + '</g>';
    for (let a = 0; a < L1; a++) {
      const cx = px + band * (a + 0.5), ly = y1 + fs + 8;
      g += `<g data-grp="${a}" data-p="${p}">`;
      if (rotate) g += txt(cx + 4, ly, rn1(lev1[a]), { anchor: 'end', rot: -35, fill: INK, edit: 'lvl:' + lev1[a] });
      else wrapped[a].forEach((ln, li) => { g += txt(cx, ly + li * fsL * 1.2, ln, { anchor: 'middle', size: fsL, edit: 'lvl:' + lev1[a] }); });
      g += '</g>';
    }
  }
  g += `<line x1="${ml}" x2="${ml}" y1="${y0}" y2="${y1}" stroke="${AXIS}"/>`;
  ticks.forEach(t => { g += `<line x1="${ml - 4}" x2="${ml}" y1="${yS(t)}" y2="${yS(t)}" stroke="${AXIS}"/>` + txt(ml - 8, yS(t) + 4, fmt(t, 3), { anchor: 'end', fill: INK2 }); });
  const defY = EK && !S.single ? `${D.valName}${opt.err === 'none' ? ' (mean)' : (opt.err === 'range' || opt.err === 'iqr') ? ' (mean; bars = ' + ERRN[opt.err] + ')' : ' (mean ± ' + ERRN[opt.err] + ')'}` : D.valName;
  g += txt(16, (y0 + y1) / 2, opt.yLabel || defY, { anchor: 'middle', rot: -90, fill: INK2, edit: 'yLabel' });
  const xdef = D.factors[0] === 'All' ? '' : D.factors[0];
  if (opt.xLabel || xdef) g += txt(ml + (W - ml - mr) / 2, H - 10, opt.xLabel || xdef, { anchor: 'middle', fill: INK2, edit: 'xLabel' });

  // marks
  const gw = band * opt.barWidth, bwSlot = gw / L2;
  if (kind === 'line') for (let c3 = 0; c3 < L3; c3++) for (let b = 0; b < L2; b++) {
    const pts = []; const px = ml + c3 * (pw + gap);
    for (let a = 0; a < L1; a++) { const c = cellAt(a, b, c3); if (c.n) pts.push(`${(px + band * (a + 0.5) + (b - (L2 - 1) / 2) * Math.min(10, band * 0.1)).toFixed(1)},${yS(c.mean).toFixed(1)}`); }
    if (pts.length > 1) g += `<polyline points="${pts.join(' ')}" fill="none" stroke="${pal[(hue ? b : 0) % pal.length]}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  for (let c3 = 0; c3 < L3; c3++) for (let a = 0; a < L1; a++) for (let b = 0; b < L2; b++) {
    const c = cellAt(a, b, c3); if (!c.n) continue;
    const px = ml + c3 * (pw + gap);
    const slotX = px + band * (a + 0.5) - gw / 2 + bwSlot * b;
    const inner = Math.max(2, bwSlot - (hue ? 3 : 0));
    const cx = kind === 'line' ? px + band * (a + 0.5) + (b - (L2 - 1) / 2) * Math.min(10, band * 0.1) : slotX + bwSlot / 2;
    const col = pal[(hue ? b : (opt.colorEach ? a : 0)) % pal.length], dk = darken(col);
    const tip = `<b>${esc(c.label)}</b><br>n = ${c.n}<br>mean = ${fmt(c.mean)}<br>SD = ${fmt(c.sd)} · SEM = ${fmt(c.sem)}<br>median = ${fmt(c.med)} (Q1 ${fmt(c.q1)} – Q3 ${fmt(c.q3)})` + (S.letters && S.letters.get(c.idx) ? `<br>group: ${S.letters.get(c.idx)}` : '');
    if (kind === 'bar') {
      const base = yS(Math.max(d0, Math.min(d1, 0))), top = yS(Math.max(d0, Math.min(d1, c.mean)));
      g += `<path d="${barPath(slotX + (bwSlot - inner) / 2, inner, base, top)}" fill="${fillOf(c, col)}" fill-opacity="0.9" stroke="${dk}" stroke-width="0.8"${tipAttr(tip)}/>`;
      g += errDraw(cx, errB(c), inner, yS);
    } else if (kind === 'dot' || kind === 'line') {
      g += errDraw(cx, errB(c), inner, yS);
      g += `<circle cx="${cx}" cy="${yS(c.mean)}" r="${+opt.dotSize}" fill="${col}" stroke="#fff" stroke-width="1.2"${tipAttr(tip)}/>`;
    } else if (kind === 'box') boxplot(c, cx, inner, col, dk, tip);
    else violin(c, cx, inner / 2);
    if (showPts) c.ys.forEach((v, i) => {
      const jx = cx + jit(i + c.idx * 7) * ((kind === 'dot' || kind === 'line') ? Math.min(inner, band * 0.3) : inner) * 0.62;
      g += `<circle cx="${jx.toFixed(1)}" cy="${yS(v).toFixed(1)}" r="${Math.min(3.2, fs / 3.6)}" fill="#fff" fill-opacity="0.85" stroke="${dk}" stroke-width="1.1"${tipAttr(`<b>${esc(c.label)}</b><br>value = ${fmt(v)}`)}/>`;
    });
    geom[c.idx] = { cx, top: yS(topOf(c)) };
    if (showLetters && S.letters.get(c.idx)) g += txt(cx, yS(topOf(c)) - 7, S.letters.get(c.idx), { anchor: 'middle', w: 600, size: fs + 1 });
  }
  function boxplot(c, cx, inner, col, dk, tip) {
    if (c.n < 2 || c.max === c.min) { g += `<circle cx="${cx}" cy="${yS(c.mean)}" r="4" fill="${col}"${tipAttr(tip)}/>`; return; }
    const iqr = c.q3 - c.q1; let wl = c.min, wh = c.max; const outs = [];
    if (opt.whisk === 'tukey') { const lf = c.q1 - 1.5 * iqr, uf = c.q3 + 1.5 * iqr; wl = Math.min(...c.sorted.filter(v => v >= lf)); wh = Math.max(...c.sorted.filter(v => v <= uf)); c.sorted.forEach(v => { if (v < lf || v > uf) outs.push(v); }); }
    const bwid = inner * 0.8, cap = bwid * 0.45;
    g += `<g stroke="${dk}" stroke-width="1.3" fill="none"><path d="M${cx},${yS(c.q3)}V${yS(wh)}M${cx},${yS(c.q1)}V${yS(wl)}M${cx - cap / 2},${yS(wh)}h${cap}M${cx - cap / 2},${yS(wl)}h${cap}"/></g>`;
    g += `<rect x="${cx - bwid / 2}" y="${yS(c.q3)}" width="${bwid}" height="${Math.max(1, yS(c.q1) - yS(c.q3))}" fill="${fillOf(c, col)}" fill-opacity="0.45" stroke="${dk}" stroke-width="1.3"${tipAttr(tip)}/>`;
    g += `<line x1="${cx - bwid / 2}" x2="${cx + bwid / 2}" y1="${yS(c.med)}" y2="${yS(c.med)}" stroke="${INK}" stroke-width="2.2"/>`;
    if (opt.meanMk) g += `<path d="M${cx},${yS(c.mean) - 4.5}l4.5,4.5l-4.5,4.5l-4.5,-4.5z" fill="#fff" stroke="${INK}" stroke-width="1.1"/>`;
    if (!showPts) outs.forEach(v => { g += `<circle cx="${cx}" cy="${yS(v)}" r="3" fill="none" stroke="${dk}" stroke-width="1.2"${tipAttr(`<b>${esc(c.label)}</b><br>outlier = ${fmt(v)}`)}/>`; });
  }
  function violin(c, cx, hw) {
    const col = pal[(hue ? Math.min(c.ks[1], 7) : (opt.colorEach ? c.ks[0] : 0)) % pal.length], dk = darken(col);
    const tip = `<b>${esc(c.label)}</b><br>n = ${c.n}<br>median = ${fmt(c.med)}<br>mean = ${fmt(c.mean)}`;
    if (c.n < 2 || c.max === c.min) { g += `<circle cx="${cx}" cy="${yS(c.mean)}" r="4" fill="${col}"${tipAttr(tip)}/>`; return; }
    const iqr = c.q3 - c.q1, sc = Math.min(c.sd, iqr > 0 ? iqr / 1.34 : c.sd);
    let h = 0.9 * (sc > 0 ? sc : c.sd) * Math.pow(c.n, -0.2) * opt.bw; if (!(h > 0)) h = (c.max - c.min) / 10;
    const m = 70, pts = []; let mx = 0;
    for (let i = 0; i <= m; i++) {
      const y = c.min + (c.max - c.min) * i / m; let d = 0;
      for (const v of c.ys) { const z = (y - v) / h; d += Math.exp(-0.5 * z * z); }
      pts.push([y, d]); if (d > mx) mx = d;
    }
    const left = pts.map(([y, d]) => `${(cx - hw * d / mx).toFixed(1)},${yS(y).toFixed(1)}`);
    const right = pts.slice().reverse().map(([y, d]) => `${(cx + hw * d / mx).toFixed(1)},${yS(y).toFixed(1)}`);
    g += `<polygon points="${left.concat(right).join(' ')}" fill="${fillOf(c, col)}" fill-opacity="0.4" stroke="${dk}" stroke-width="1.2" stroke-linejoin="round"${tipAttr(tip)}/>`;
    if (opt.box) {
      const bw = Math.max(4, hw * 0.28);
      g += `<line x1="${cx}" x2="${cx}" y1="${yS(Math.max(c.min, c.q1 - 1.5 * iqr))}" y2="${yS(Math.min(c.max, c.q3 + 1.5 * iqr))}" stroke="${INK}" stroke-width="1.2"/>` +
        `<rect x="${cx - bw / 2}" y="${yS(c.q3)}" width="${bw}" height="${Math.max(1, yS(c.q1) - yS(c.q3))}" fill="#fff" stroke="${INK}" stroke-width="1.2"/>` +
        `<line x1="${cx - bw / 2}" x2="${cx + bw / 2}" y1="${yS(c.med)}" y2="${yS(c.med)}" stroke="${INK}" stroke-width="2"/>` +
        `<path d="M${cx},${yS(c.mean) - 4}l4,4l-4,4l-4,-4z" fill="${dk}" stroke="#fff" stroke-width="1"/>`;
    }
  }
  // t-test bracket
  if (useBracket) {
    const [ia, ib] = S.tt.idx, ga = geom[ia], gb = geom[ib];
    if (ga && gb) {
      const yb = Math.min(ga.top, gb.top) - 16, x1 = Math.min(ga.cx, gb.cx), x2 = Math.max(ga.cx, gb.cx);
      g += `<path d="M${x1},${ga.cx <= gb.cx ? ga.top - 6 : gb.top - 6}V${yb}H${x2}V${ga.cx <= gb.cx ? gb.top - 6 : ga.top - 6}" fill="none" stroke="${INK}" stroke-width="1.2"/>`;
      g += txt((x1 + x2) / 2, yb - 5, `${stars(S.tt.p)}  (${pEq(S.tt.p)})`, { anchor: 'middle', w: 600 });
    }
  }
  // legend
  if (legBottom) g += legendDraw(legLay, W, H + 2, fs);
  if (legRight) {
    const lx = W - mr + 16; let ly = mt;
    g += txt(lx, ly + 4, D.factors[1], { w: 600, fill: INK2 });
    lev2.forEach((l, i) => { ly += 22; g += `<g data-lg="${i}"><rect x="${lx}" y="${ly - 10}" width="12" height="12" rx="3" fill="${patFill(patOf(l, i), pal[i % pal.length])}"/>` + txt(lx + 19, ly, l) + '</g>'; });
  }
  g += '</svg>';
  g = g.replace('<svg ', `<svg data-geo="${esc(JSON.stringify({ ml, pw, gap, band, L1, L3, y0, y1, lab: mb }))}" `);
  return g;
}

// ---------- histogram ----------
function renderHist(S) {
  const D = S.D, fs = +opt.fontSize, W = +opt.width, H = +opt.height, pal = curPal();
  const all = D.obs.map(o => o.y), n = all.length;
  let mn = Math.min(...all), mx = Math.max(...all); if (mn === mx) { mn -= 0.5; mx += 0.5; }
  const sorted = all.slice().sort((a, b) => a - b), iqr = ST.quantile(sorted, .75) - ST.quantile(sorted, .25);
  let nb = opt.bins > 0 ? Math.round(opt.bins) : (iqr > 0 ? Math.ceil((mx - mn) / (2 * iqr * Math.pow(n, -1 / 3))) : Math.ceil(Math.log2(n) + 1));
  nb = Math.max(3, Math.min(80, nb || 10));
  const bw = (mx - mn) / nb;
  const groups = (opt.hgroups && D.levels[0].length > 1 && D.levels[0].length <= 8)
    ? D.levels[0].map((l, i) => ({ label: l, ys: D.obs.filter(o => o.k[0] === i).map(o => o.y) })).filter(g => g.ys.length)
    : [{ label: D.valName, ys: all }];
  const multi = groups.length > 1;
  const scale = (cnt, ng) => opt.hstat === 'count' ? cnt : opt.hstat === 'percent' ? 100 * cnt / ng : cnt / (ng * bw);
  const curveScale = ng => opt.hstat === 'count' ? ng * bw : opt.hstat === 'percent' ? 100 * bw : 1;
  groups.forEach(g => {
    g.counts = new Array(nb).fill(0);
    g.ys.forEach(v => { let b = Math.floor((v - mn) / bw); if (b >= nb) b = nb - 1; g.counts[b]++; });
    g.vals = g.counts.map(c => scale(c, g.ys.length));
  });
  let ymax = Math.max(...groups.map(g => Math.max(...g.vals)));
  const curves = [];
  if (opt.kde || opt.normal) groups.forEach((g, gi) => {
    const d = ST.describe(g.ys); const pts = [];
    const h = d.n > 1 ? 0.9 * Math.min(d.sd, (d.q3 - d.q1) / 1.34 || d.sd) * Math.pow(d.n, -0.2) : bw;
    for (let i = 0; i <= 100; i++) {
      const x = mn - bw + (mx - mn + 2 * bw) * i / 100; let y;
      if (opt.kde) { let s = 0; for (const v of g.ys) { const z = (x - v) / h; s += Math.exp(-0.5 * z * z); } y = s / (g.ys.length * h * 2.5066282746) * curveScale(g.ys.length); }
      else y = d.sd > 0 ? Math.exp(-0.5 * Math.pow((x - d.mean) / d.sd, 2)) / (d.sd * 2.5066282746) * curveScale(g.ys.length) : 0;
      pts.push([x, y]); if (y > ymax) ymax = y;
    }
    curves.push({ pts, gi });
  });
  const xt = niceTicks(mn, mx, 8), yt = niceTicks(0, ymax * 1.08, 6);
  const xd0 = Math.min(xt[0], mn), xd1 = Math.max(xt[xt.length - 1], mx), yd1 = yt[yt.length - 1];
  const legRight = multi && opt.legend === 'right', legBottom = multi && opt.legend === 'bottom';
  const legLay = legBottom ? legendLayout(groups.map((gr, gi) => ({ label: gr.label, color: pal[gi % pal.length], fillv: patFill(patOf(gr.label, gi), pal[gi % pal.length]), op: 0.6 })), W, fs, '') : null, legH = legLay ? legLay.height : 0;
  const ml = 66, mr = legRight ? Math.max(...groups.map(g => tw(g.label, fs))) + 56 : 22, mt = 40, mb = fs + 52;
  const x0 = ml, x1 = W - mr, y0 = mt, y1 = H - mb;
  const xS = v => x0 + (v - xd0) / (xd1 - xd0) * (x1 - x0), yS = v => y1 - v / yd1 * (y1 - y0);
  lastUnits = groups.map((gr, gi) => ({ name: gr.label, col: pal[gi % pal.length] }));
  let g = svgOpen(W, H + legH);
  g += titleSvg(ml, W - mr, 24, fs);
  if (mH()) minorVals(yt, opt.minorN).forEach(v => { g += minorLine(x0, yS(v), x1, yS(v)); });
  if (mV()) minorVals(xt, opt.minorN).forEach(v => { const X = xS(v); if (X >= x0 - 0.5 && X <= x1 + 0.5) g += minorLine(X, y0, X, y1); });
  yt.forEach(t => { g += (gridH() ? gridLine(x0, yS(t), x1, yS(t)) : '') + `<line x1="${x0 - 4}" x2="${x0}" y1="${yS(t)}" y2="${yS(t)}" stroke="${AXIS}"/>` + txt(x0 - 8, yS(t) + 4, fmt(t, 3), { anchor: 'end', fill: INK2 }); });
  xt.forEach(t => { if (t < xd0 - 1e-9 || t > xd1 + 1e-9) return; g += (gridV() ? gridLine(xS(t), y0, xS(t), y1) : '') + `<line x1="${xS(t)}" x2="${xS(t)}" y1="${y1}" y2="${y1 + 4}" stroke="${AXIS}"/>` + txt(xS(t), y1 + fs + 6, fmt(t, 3), { anchor: 'middle', fill: INK2 }); });
  g += `<line x1="${x0}" x2="${x0}" y1="${y0}" y2="${y1}" stroke="${AXIS}"/><line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" stroke="${AXIS}"/>`;
  groups.forEach((gr, gi) => {
    const col = pal[gi % pal.length];
    gr.vals.forEach((v, b) => {
      if (v <= 0) return;
      const xa = xS(mn + b * bw), xb = xS(mn + (b + 1) * bw);
      g += `<rect x="${xa}" y="${yS(v)}" width="${Math.max(0.5, xb - xa)}"  height="${y1 - yS(v)}" fill="${patFill(patOf(gr.label, gi), col)}" fill-opacity="${multi ? 0.5 : 0.85}" stroke="${multi ? darken(col) : '#fff'}" stroke-width="${multi ? 1 : 1}"${tipAttr(`<b>${esc(gr.label)}</b><br>${fmt(mn + b * bw, 3)} to ${fmt(mn + (b + 1) * bw, 3)}<br>count = ${gr.counts[b]}`)}/>`;
    });
  });
  curves.forEach(c => { g += `<polyline fill="none" stroke="${darken(pal[c.gi % pal.length], 0.65)}" stroke-width="2" stroke-linejoin="round" points="${c.pts.map(([x, y]) => `${xS(x).toFixed(1)},${yS(y).toFixed(1)}`).join(' ')}"/>`; });
  g += txt(16, (y0 + y1) / 2, opt.yLabel || { count: 'Count', density: 'Density', percent: 'Percent of values (%)' }[opt.hstat], { anchor: 'middle', rot: -90, fill: INK2, edit: 'yLabel' });
  g += txt((x0 + x1) / 2, H - 12, opt.xLabel || D.valName, { anchor: 'middle', fill: INK2, edit: 'xLabel' });
  if (legBottom) g += legendDraw(legLay, W, H + 2, fs);
  if (legRight) { let ly = mt; groups.forEach((gr, gi) => { ly += 22; g += `<rect x="${x1 + 16}" y="${ly - 10}" width="12" height="12" rx="3" fill="${patFill(patOf(gr.label, gi), pal[gi % pal.length])}" fill-opacity=".6"/>` + txt(x1 + 35, ly, gr.label); }); }
  return g + '</svg>';
}

// ---------- pie ----------
function renderPie(S) {
  const D = S.D, fs = +opt.fontSize, W = +opt.width, H = +opt.height, pal = curPal();
  let items = S.cells.filter(c => c.n > 0).map(c => ({ label: c.label, v: opt.pstat === 'sum' ? c.sum : opt.pstat === 'count' ? c.n : c.mean })).filter(i => i.v > 0);
  if (!items.length) return 'ERR:Pie charts need positive values (all group values are zero or negative).';
  if (opt.psort) items.sort((a, b) => b.v - a.v);
  let other = false;
  if (items.length > 8) { const rest = items.slice(7); items = items.slice(0, 7); items.push({ label: 'Other (' + rest.length + ')', v: rest.reduce((a, b) => a + b.v, 0) }); other = true; }
  const tot = items.reduce((a, b) => a + b.v, 0);
  const legRight = opt.legend === 'right', legBottom = opt.legend === 'bottom';
  const legW = Math.max(...items.map(i => tw(i.label, fs))) + 100;
  const r = Math.max(60, Math.min((H - 110) / 2, legRight ? (W - legW - 120) / 2 : (W - 160) / 2));
  const cx = legRight ? 50 + r + 40 : W / 2, cy = 56 + r + 8, ri = opt.donut ? r * 0.55 : 0;
  const pcol0 = i => (other && i === items.length - 1) ? '#9aa1ad' : pal[i % pal.length];
  const legLay = legBottom ? legendLayout(items.map((it, i) => ({ label: `${it.label} (${fmt(it.v, 3)})`, color: pcol0(i), fillv: patFill(patOf(it.label, i), pcol0(i)) })), W, fs, { mean: 'Group mean', sum: 'Group sum', count: 'Count (n)' }[opt.pstat]) : null, legH = legLay ? legLay.height : 0;
  const pcol = i => (other && i === items.length - 1) ? '#9aa1ad' : pal[i % pal.length];
  lastUnits = items.map((it, i) => ({ name: it.label, col: pcol(i) }));
  let g = svgOpen(W, H + legH);
  g += titleSvg(24, W - 24, 26, fs);
  let a0 = -Math.PI / 2;
  const P = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  items.forEach((it, i) => {
    const frac = it.v / tot, a1 = a0 + frac * 2 * Math.PI, col = patFill(patOf(it.label, i), pcol(i));
    const tip = `<b>${esc(it.label)}</b><br>${fmt(it.v)} (${(frac * 100).toFixed(1)}%)`;
    if (frac > 0.9999) g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}"${tipAttr(tip)}/>` + (ri ? `<circle cx="${cx}" cy="${cy}" r="${ri}" fill="#fff"/>` : '');
    else {
      const [x1, y1] = P(r, a0), [x2, y2] = P(r, a1), [x3, y3] = P(ri, a1), [x4, y4] = P(ri, a0), lg = frac > 0.5 ? 1 : 0;
      g += `<path d="M${x1},${y1}A${r},${r} 0 ${lg} 1 ${x2},${y2}${ri ? `L${x3},${y3}A${ri},${ri} 0 ${lg} 0 ${x4},${y4}Z` : `L${cx},${cy}Z`}" fill="${col}" stroke="#fff" stroke-width="2" stroke-linejoin="round"${tipAttr(tip)}/>`;
    }
    if (frac >= 0.02) { const am = (a0 + a1) / 2, [lx, ly] = P(r + 14, am), right = Math.cos(am) >= 0; g += txt(lx + (right ? 2 : -2), ly + 4, (frac * 100).toFixed(frac < 0.1 ? 1 : 0) + '%', { anchor: right ? 'start' : 'end', fill: INK2 }); }
    a0 = a1;
  });
  if (legBottom) g += legendDraw(legLay, W, H, fs);
  if (legRight) {
  const lx = cx + r + 80; let ly = 64;
  g += txt(lx, ly - 14, { mean: 'Group mean', sum: 'Group sum', count: 'Count (n)' }[opt.pstat], { w: 600, fill: INK2 });
  items.forEach((it, i) => { ly += 22; g += `<rect x="${lx}" y="${ly - 10}" width="12" height="12" rx="3" fill="${patFill(patOf(it.label, i), pcol(i))}"/>` + txt(lx + 19, ly, it.label) + txt(lx + 19 + Math.max(...items.map(q => tw(q.label, fs))) + 16, ly, fmt(it.v, 3), { fill: INK2 }); });
  }
  return g + '</svg>';
}


// ---------- scatter + correlation ----------
function guessScatter(raw) {
  const nums = raw.headers.map((h, i) => colIsNumeric(raw, i) ? i : -1).filter(i => i >= 0);
  opt.sx = nums[0] ?? -1; opt.sy = nums[1] ?? -1; opt.sg = -1;
  const cat = raw.headers.findIndex((h, i) => !nums.includes(i) && new Set(raw.rows.map(r => r[i]).filter(v => v !== null && v !== '')).size <= 10);
  opt.sg = cat;
}
function scatterData() {
  const r = state.raw; if (!r) return null;
  if (opt.sx < 0 || opt.sy < 0 || opt.sx >= r.headers.length || opt.sy >= r.headers.length) guessScatter(r);
  if (opt.sx < 0 || opt.sy < 0) return null;
  const pts = [];
  r.rows.forEach(row => {
    const x = toNum(row[opt.sx]), y = toNum(row[opt.sy]); if (isNaN(x) || isNaN(y)) return;
    const gv = opt.sg >= 0 && row[opt.sg] !== null && row[opt.sg] !== undefined && row[opt.sg] !== '' ? String(row[opt.sg]) : '';
    pts.push({ x, y, g: gv });
  });
  return pts.length >= 3 ? pts : null;
}
function corrOf(xs, ys) {
  const pe = ST.pearson(xs, ys); let main;
  if (opt.corr === 'spearman') { const o = ST.spearman(xs, ys); main = { sym: 'ρ', val: o.rho, p: o.p, name: 'Spearman' }; }
  else if (opt.corr === 'kendall') { const o = ST.kendall(xs, ys); main = { sym: 'τ', val: o.tau, p: o.p, name: 'Kendall' }; }
  else main = { sym: 'r', val: pe.r, p: pe.p, name: 'Pearson' };
  return { n: xs.length, pe, main };
}
function renderScatter() {
  const pts = scatterData();
  if (!pts) return 'ERR:Pick two numeric columns for X and Y (at least 3 rows with numbers in both).';
  const r = state.raw, fs = +opt.fontSize, W = +opt.width, Hb = +opt.height, pal = curPal();
  const levels = [...new Set(pts.map(p => p.g))], hasG = levels.length > 1 || levels[0] !== '';
  const gOf = p => levels.indexOf(p.g);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const sets = [{ label: 'All points', xs, ys }].concat(hasG ? levels.map((l, i) => ({ label: l, xs: pts.filter(p => p.g === l).map(p => p.x), ys: pts.filter(p => p.g === l).map(p => p.y), gi: i })) : []);
  sets.forEach(st => { st.n = st.xs.length; if (st.n >= 3 && new Set(st.xs).size > 1 && new Set(st.ys).size > 1) st.c = corrOf(st.xs, st.ys); });
  lastSc = { x: r.headers[opt.sx], y: r.headers[opt.sy], sets, hasG, corr: opt.corr };
  const fitSets = hasG ? sets.slice(1) : sets.slice(0, 1);
  const xt = niceTicks(Math.min(...xs), Math.max(...xs), 7), yt0 = niceTicks(Math.min(...ys), Math.max(...ys), 6);
  let ylo = Math.min(...ys), yhi = Math.max(...ys);
  const bands = [];
  if (opt.fit === 'linear') fitSets.forEach(st => {
    if (!st.c) return; const pe = st.c.pe, crit = ST.qt2(0.05, pe.df), sres = Math.sqrt(Math.max(0, pe.sse) / pe.df);
    const a = Math.min(...st.xs), b = Math.max(...st.xs), line = [], up = [], dn = [];
    for (let i = 0; i <= 40; i++) { const x = a + (b - a) * i / 40, yh = pe.intercept + pe.slope * x, se = sres * Math.sqrt(1 / pe.n + (x - pe.mx) ** 2 / pe.sxx); line.push([x, yh]); up.push([x, yh + crit * se]); dn.push([x, yh - crit * se]); ylo = Math.min(ylo, yh - (opt.fitCI ? crit * se : 0)); yhi = Math.max(yhi, yh + (opt.fitCI ? crit * se : 0)); }
    bands.push({ st, line, up, dn });
  });
  const yt = niceTicks(Math.min(yt0[0], ylo), Math.max(yt0[yt0.length - 1], yhi), 6);
  const xd0 = Math.min(xt[0], Math.min(...xs)), xd1 = Math.max(xt[xt.length - 1], Math.max(...xs)), yd0 = yt[0], yd1 = yt[yt.length - 1];
  const legMode = hasG ? opt.legend : 'none', legRight = legMode === 'right', legBottom = legMode === 'bottom';
  const legLay = legBottom ? legendLayout(levels.map((l, i) => ({ label: l, color: pal[i % pal.length] })), W, fs, r.headers[opt.sg]) : null, legH = legLay ? legLay.height : 0;
  const ml = 66, mr = legRight ? Math.max(tw(r.headers[opt.sg], fs) + 20, ...levels.map(l => tw(l, fs) + 30), 90) + 28 : 22, mt = 40, mb = fs + 52, H = Hb;
  const x0 = ml, x1 = W - mr, y0 = mt, y1 = H - mb;
  const xS = v => x0 + (v - xd0) / (xd1 - xd0) * (x1 - x0), yS = v => y1 - (v - yd0) / (yd1 - yd0) * (y1 - y0);
  let g = svgOpen(W, H + legH);
  g += titleSvg(ml, W - mr, 24, fs);
  if (mH()) minorVals(yt, opt.minorN).forEach(v => { g += minorLine(x0, yS(v), x1, yS(v)); });
  if (mV()) minorVals(xt, opt.minorN).forEach(v => { const X = xS(v); if (X >= x0 - 0.5 && X <= x1 + 0.5) g += minorLine(X, y0, X, y1); });
  yt.forEach(t => { g += (gridH() ? gridLine(x0, yS(t), x1, yS(t)) : '') + `<line x1="${x0 - 4}" x2="${x0}" y1="${yS(t)}" y2="${yS(t)}" stroke="${AXIS}"/>` + txt(x0 - 8, yS(t) + 4, fmt(t, 3), { anchor: 'end', fill: INK2 }); });
  xt.forEach(t => { if (t < xd0 - 1e-9 || t > xd1 + 1e-9) return; g += (gridV() ? gridLine(xS(t), y0, xS(t), y1) : '') + `<line x1="${xS(t)}" x2="${xS(t)}" y1="${y1}" y2="${y1 + 4}" stroke="${AXIS}"/>` + txt(xS(t), y1 + fs + 6, fmt(t, 3), { anchor: 'middle', fill: INK2 }); });
  g += `<line x1="${x0}" x2="${x0}" y1="${y0}" y2="${y1}" stroke="${AXIS}"/><line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" stroke="${AXIS}"/>`;
  const poly = a => a.map(([x, y]) => `${xS(x).toFixed(1)},${yS(y).toFixed(1)}`).join(' ');
  bands.forEach(b => {
    const col = hasG ? pal[b.st.gi % pal.length] : pal[0];
    if (opt.fitCI) g += `<polygon points="${poly(b.up.concat(b.dn.slice().reverse()))}" fill="${col}" fill-opacity="0.15" stroke="none"/>`;
    g += `<polyline points="${poly(b.line)}" fill="none" stroke="${darken(col, 0.8)}" stroke-width="2"/>`;
  });
  pts.forEach(p => {
    const col = hasG ? pal[gOf(p) % pal.length] : pal[0];
    g += `<circle cx="${xS(p.x).toFixed(1)}" cy="${yS(p.y).toFixed(1)}" r="${+opt.dotSize}" fill="${col}" fill-opacity="0.75" stroke="${darken(col)}" stroke-width="0.8"${tipAttr(`${p.g ? '<b>' + esc(p.g) + '</b><br>' : ''}${esc(lastSc.x)} = ${fmt(p.x)}<br>${esc(lastSc.y)} = ${fmt(p.y)}`)}/>`;
  });
  const main = sets[0].c;
  if (main && !hasG) g += txt(x1 - 6, y0 + fs + 4, `${main.main.sym} = ${fmt(main.main.val, 3)}, ${pEq(main.main.p)}`, { anchor: 'end', fill: INK2, w: 600 });
  g += txt(16, (y0 + y1) / 2, opt.yLabel || lastSc.y, { anchor: 'middle', rot: -90, fill: INK2, edit: 'yLabel' });
  g += txt((x0 + x1) / 2, H - 12, opt.xLabel || lastSc.x, { anchor: 'middle', fill: INK2, edit: 'xLabel' });
  if (legBottom) g += legendDraw(legLay, W, H + 2, fs);
  if (legRight) { const lx = W - mr + 16; let ly = mt; g += txt(lx, ly + 4, r.headers[opt.sg], { w: 600, fill: INK2 }); levels.forEach((l, i) => { ly += 22; g += `<rect x="${lx}" y="${ly - 10}" width="12" height="12" rx="3" fill="${pal[i % pal.length]}"/>` + txt(lx + 19, ly, l); }); }
  return g + '</svg>';
}
function scatterStatsHTML(sc) {
  const a = +opt.alpha, nm = { pearson: 'Pearson r', spearman: 'Spearman ρ', kendall: 'Kendall τ (b)' }[sc.corr];
  let h = `<h3>Correlation: ${esc(sc.y)} vs ${esc(sc.x)} (${nm})</h3><div class="tblwrap"><table class="tbl"><thead><tr><th>Group</th><th>n</th><th>${nm.split(' ')[1]}</th><th>p</th><th></th><th>R² (linear)</th><th>Slope ± SE</th><th>Intercept</th><th>95% CI of r</th></tr></thead><tbody>`;
  sc.sets.forEach(st => {
    if (!st.c) { h += `<tr><td>${esc(st.label)}</td><td>${st.n}</td><td colspan="7">needs at least 3 points with spread in x and y</td></tr>`; return; }
    const c = st.c, pe = c.pe;
    h += `<tr class="${c.main.p < a ? 'sig' : ''}"><td>${esc(st.label)}</td><td>${c.n}</td><td>${fmt(c.main.val, 4)}</td><td>${fmtP(c.main.p)}</td><td>${stars(c.main.p)}</td><td>${fmt(pe.r2, 4)}</td><td>${fmt(pe.slope)} ± ${fmt(pe.seSlope)}</td><td>${fmt(pe.intercept)}</td><td>${isFinite(pe.lo) ? fmt(pe.lo, 3) + ' to ' + fmt(pe.hi, 3) : '–'}</td></tr>`;
  });
  return h + `</tbody></table></div><div class="legendnote">Regression line is ordinary least squares; the shaded band is its 95% confidence interval. R², slope and the CI of r are always Pearson/linear; the p-value and coefficient follow the correlation method you picked.</div>`;
}
function scatterText(sc) {
  const L = [['Group', 'n', sc.corr, 'p', 'R2', 'slope', 'slope SE', 'intercept'].join('\t')];
  sc.sets.forEach(st => { if (st.c) L.push([st.label, st.n, st.c.main.val, st.c.main.p, st.c.pe.r2, st.c.pe.slope, st.c.pe.seSlope, st.c.pe.intercept].join('\t')); });
  return L.join('\n');
}

// ---------- volcano ----------
function volcanoData() {
  const r = state.raw; if (!r || opt.xCol < 0 || opt.pCol < 0) return null;
  const pts = [];
  r.rows.forEach((row, i) => {
    const x = toNum(row[opt.xCol]); let p = toNum(row[opt.pCol]);
    if (isNaN(x) || isNaN(p) || p < 0 || p > 1) return;
    pts.push({ x, p, name: opt.lCol >= 0 && row[opt.lCol] !== null ? String(row[opt.lCol]) : '' });
  });
  if (!pts.length) return null;
  if (opt.adj) { const q = ST.bh(pts.map(p => p.p)); pts.forEach((p, i) => { p.p = q[i]; }); }
  const minP = Math.min(...pts.filter(p => p.p > 0).map(p => p.p), 1e-300);
  pts.forEach(p => { p.y = -Math.log10(p.p > 0 ? p.p : minP / 10); });
  return pts;
}
function renderVolcano() {
  const pts = volcanoData();
  if (!pts) return 'ERR:Pick the fold-change and p-value columns (the data needs numeric values in both).';
  const fs = +opt.fontSize, W = +opt.width, H = +opt.height;
  const fc = +opt.fcThr, pt = +opt.pThr, yThr = -Math.log10(pt);
  const UP = '#D55E00', DN = '#0072B2', NS = '#a3aab6';
  const cls = p => (p.p < pt && p.x >= fc) ? 'up' : (p.p < pt && p.x <= -fc) ? 'dn' : 'ns';
  pts.forEach(p => p.c = cls(p));
  const nUp = pts.filter(p => p.c === 'up').length, nDn = pts.filter(p => p.c === 'dn').length;
  lastVol = { nUp, nDn, n: pts.length, fc, pt, adj: opt.adj, top: pts.filter(p => p.c !== 'ns' && p.name).sort((a, b) => b.y - a.y).slice(0, 5) };
  const xm = Math.max(...pts.map(p => Math.abs(p.x)), fc * 1.2), xt = niceTicks(-xm, xm, 8), xl = Math.max(Math.abs(xt[0]), Math.abs(xt[xt.length - 1]));
  const ym = Math.max(...pts.map(p => p.y), yThr * 1.2), yt = niceTicks(0, ym * 1.05, 6), yd1 = yt[yt.length - 1];
  const lg = [[DN, `Down ${nDn}`], [NS, `Not significant ${pts.length - nUp - nDn}`], [UP, `Up ${nUp}`]];
  const legLay = opt.legend === 'bottom' ? legendLayout(lg.map(([c, s]) => ({ label: s, color: c })), W, fs, '') : null, legH = legLay ? legLay.height : 0;
  const ml = 66, mr = 24, mt = opt.legend === 'right' ? 44 : 30, mb = fs + 52, x0 = ml, x1 = W - mr, y0 = mt, y1 = H - mb;
  const xS = v => x0 + (v + xl) / (2 * xl) * (x1 - x0), yS = v => y1 - v / yd1 * (y1 - y0);
  let g = svgOpen(W, H + legH);
  g += titleSvg(ml, W - mr, 24, fs);
  if (mH()) minorVals(yt, opt.minorN).forEach(v => { g += minorLine(x0, yS(v), x1, yS(v)); });
  if (mV()) minorVals(xt, opt.minorN).forEach(v => { const X = xS(v); if (X >= x0 - 0.5 && X <= x1 + 0.5) g += minorLine(X, y0, X, y1); });
  yt.forEach(t => { g += (gridH() ? gridLine(x0, yS(t), x1, yS(t)) : '') + `<line x1="${x0 - 4}" x2="${x0}" y1="${yS(t)}" y2="${yS(t)}" stroke="${AXIS}"/>` + txt(x0 - 8, yS(t) + 4, fmt(t, 3), { anchor: 'end', fill: INK2 }); });
  xt.forEach(t => { g += (gridV() ? gridLine(xS(t), y0, xS(t), y1) : '') + `<line x1="${xS(t)}" x2="${xS(t)}" y1="${y1}" y2="${y1 + 4}" stroke="${AXIS}"/>` + txt(xS(t), y1 + fs + 6, fmt(t, 3), { anchor: 'middle', fill: INK2 }); });
  g += `<line x1="${x0}" x2="${x0}" y1="${y0}" y2="${y1}" stroke="${AXIS}"/><line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" stroke="${AXIS}"/>`;
  const dash = `stroke="${INK2}" stroke-width="1" stroke-dasharray="4 4" opacity=".7"`;
  if (fc > 0) g += `<line x1="${xS(-fc)}" x2="${xS(-fc)}" y1="${y0}" y2="${y1}" ${dash}/><line x1="${xS(fc)}" x2="${xS(fc)}" y1="${y0}" y2="${y1}" ${dash}/>`;
  g += `<line x1="${x0}" x2="${x1}" y1="${yS(yThr)}" y2="${yS(yThr)}" ${dash}/>`;
  const order = { ns: 0, dn: 1, up: 1 };
  pts.slice().sort((a, b) => order[a.c] - order[b.c]).forEach(p => {
    const col = p.c === 'up' ? UP : p.c === 'dn' ? DN : NS;
    g += `<circle cx="${xS(p.x).toFixed(1)}" cy="${yS(p.y).toFixed(1)}" r="${p.c === 'ns' ? 2.6 : 3.2}" fill="${col}" fill-opacity="${p.c === 'ns' ? 0.5 : 0.8}"${tipAttr(`<b>${esc(p.name || 'point')}</b><br>log2FC = ${fmt(p.x)}<br>${opt.adj ? 'adj. p' : 'p'} = ${fmt(p.p)}`)}/>`;
  });
  // labels
  const sig = pts.filter(p => p.c !== 'ns' && p.name).sort((a, b) => b.y - a.y).slice(0, Math.max(0, +opt.topN));
  const placed = [];
  const hit = (b) => placed.some(q => !(b.x2 < q.x1 || b.x1 > q.x2 || b.y2 < q.y1 || b.y1 > q.y2));
  sig.forEach(p => {
    const px = xS(p.x), py = yS(p.y), w = tw(p.name, fs) + 2, h = fs + 2;
    const cands = [[7, -6, 'start'], [-7, -6, 'end'], [7, 13, 'start'], [-7, 13, 'end'], [0, -12, 'middle'], [0, 20, 'middle'], [10, 3, 'start'], [-10, 3, 'end'], [14, -18, 'start'], [-14, -18, 'end'], [14, 26, 'start'], [-14, 26, 'end']];
    for (const [dx, dy, an] of cands) {
      const tx = px + dx, ty = py + dy;
      const bx1 = an === 'start' ? tx : an === 'end' ? tx - w : tx - w / 2, bx2 = bx1 + w, by1 = ty - h + 3, by2 = ty + 3;
      const b = { x1: bx1, x2: bx2, y1: by1, y2: by2 };
      if (bx1 < x0 || bx2 > x1 + 10 || by1 < y0 - 8 || by2 > y1) continue;
      if (hit(b)) continue;
      placed.push(b);
      g += `<text x="${tx}" y="${ty}" text-anchor="${an}" font-size="${fs - 1}" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${esc(p.name)}</text>`;
      break;
    }
  });
  g += txt(16, (y0 + y1) / 2, opt.yLabel || (opt.adj ? '−log10 (adjusted p)' : '−log10 (p-value)'), { anchor: 'middle', rot: -90, fill: INK2, edit: 'yLabel' });
  g += txt((x0 + x1) / 2, H - 12, opt.xLabel || 'log2 fold change', { anchor: 'middle', fill: INK2, edit: 'xLabel' });
  if (legLay) g += legendDraw(legLay, W, H + 2, fs);
  let lx = x1; if (opt.legend === 'right') lg.slice().reverse().forEach(([c, s]) => { const w = tw(s, fs) + 26; lx -= w; g += `<circle cx="${lx + 6}" cy="${y0 - 14}" r="5" fill="${c}"/>` + txt(lx + 16, y0 - 10, s, { fill: INK2 }); });
  return g + '</svg>';
}

// ---------- statistics panel ----------
function descTable(S) {
  let h = '<div class="tblwrap"><table class="tbl"><thead><tr><th>Group</th><th>n</th><th>Mean</th><th>SD</th><th>SEM</th><th>95% CI</th><th>Median</th>' + (S.letters ? '<th>Letters</th>' : '') + '</tr></thead><tbody>';
  S.cells.forEach(c => {
    if (!c.n) return;
    h += `<tr><td>${esc(c.label)}</td><td>${c.n}</td><td>${fmt(c.mean)}</td><td>${fmt(c.sd)}</td><td>${fmt(c.sem)}</td><td>${isFinite(c.ci) ? fmt(c.mean - c.ci) + ' – ' + fmt(c.mean + c.ci) : '–'}</td><td>${fmt(c.med)}</td>` + (S.letters ? `<td><b>${S.letters.get(c.idx) || ''}</b></td>` : '') + '</tr>';
  });
  return h + '</tbody></table></div>';
}
function pairsTable(S, a) {
  let h = `<h3>${S.pairTitle}: ${S.post === 'dunnett' ? S.pairs.length + ' comparisons with the control' : 'all ' + S.k + ' groups compared'}, α = ${a}</h3>`;
  h += `<div class="tblwrap"><table class="tbl"><thead><tr><th>Comparison</th><th>${S.post === 'bh' ? 'Difference' : 'Difference'}</th><th>${S.pairStat}</th><th>${S.pairAdj || 'Adj. p'}</th><th></th></tr></thead><tbody>`;
  S.pairs.slice().sort((x, y) => x.p - y.p).forEach(p => { h += `<tr class="${p.p < a ? 'sig' : ''}"><td>${esc(p.a)} − ${esc(p.b)}</td><td>${fmt(p.diff)}</td><td>${fmt(p.stat)}</td><td>${fmtP(p.p)}</td><td>${stars(p.p)}</td></tr>`; });
  h += '</tbody></table></div>';
  if (S.mode === 'kruskal') h += `<div class="legendnote">Differences are in mean rank. Bars on the chart still show mean ± error; medians are in the table below.</div>`;
  if (S.pairNote) h += `<div class="legendnote">${S.pairNote}</div>`;
  return h + (S.starMode ? '' : `<div class="legendnote">Groups that share a letter on the chart are not significantly different.</div>`);
}
function assumptionsHTML(S, a) {
  let h = '<h3>Assumption checks</h3>';
  const rows = S.norm.filter(x => x.res);
  if (rows.length) {
    h += '<div class="tblwrap" style="max-height:220px"><table class="tbl"><thead><tr><th>Shapiro–Wilk normality</th><th>n</th><th>W</th><th>p</th><th></th></tr></thead><tbody>';
    rows.forEach(x => { h += `<tr class="${x.res.p < a ? 'sig' : ''}"><td>${esc(x.label)}</td><td>${x.n}</td><td>${fmt(x.res.W, 4)}</td><td>${fmtP(x.res.p)}</td><td>${x.res.p < a ? 'non-normal' : 'ok'}</td></tr>`; });
    if (S.normResid && S.k > 1) h += `<tr class="${S.normResid.p < a ? 'sig' : ''}"><td><b>All residuals pooled</b></td><td>${S.normResid.n}</td><td>${fmt(S.normResid.W, 4)}</td><td>${fmtP(S.normResid.p)}</td><td>${S.normResid.p < a ? 'non-normal' : 'ok'}</td></tr>`;
    h += '</tbody></table></div>';
  } else h += '<div class="legendnote">Shapiro–Wilk needs at least 3 values with some spread in a group.</div>';
  if (S.levene) h += `<div class="callout ${S.levene.p < a ? 'warn' : ''}" style="margin-top:8px">Equal variances (Brown–Forsythe): F(${S.levene.df1}, ${S.levene.df2}) = ${fmt(S.levene.F)}, ${pEq(S.levene.p)}. ${S.levene.p < a ? 'Variances differ – consider Welch’s test.' : 'No evidence that variances differ.'}</div>`;
  if (S.bart) h += `<div class="callout ${S.bart.p < a ? 'warn' : ''}" style="margin-top:8px">Equal variances (Bartlett, assumes normality): χ²(${S.bart.df}) = ${fmt(S.bart.T)}, ${pEq(S.bart.p)}.</div>`;
  return h;
}
function statsHTML(S) {
  let h = '';
  const a = S.alpha;
  if (S.single) return `<div class="callout" style="margin-top:12px">Every group here has a single value (for example a mean or a % change), so error bars and statistical tests are not available. The chart shows the values as given.</div><h3>Values</h3>` + descTable(S);
  if (S.error) h += `<div class="err" style="margin-top:12px">${esc(S.error)}</div>`;
  if (S.autoReason) h += `<div class="callout" style="margin-top:12px"><b>Auto-selected: ${esc(testName(S))}.</b> ${esc(S.autoReason)}</div>`;
  if (S.tt) {
    const t = S.tt, np = t.kind === 'mwu' || t.kind === 'wilcoxon';
    const head = { mwu: () => `U = ${fmt(t.U)}, z = ${fmt(t.z)}`, wilcoxon: () => `W = ${fmt(t.W)}, z = ${fmt(t.z)}`, ks: () => `D = ${fmt(t.D, 4)}`, perm: () => `mean difference = ${fmt(t.diff)}`, ftest: () => `F(${t.df1}, ${t.df2}) = ${fmt(t.F)}` }[t.kind] || (() => `t(${fmt(t.df, 4)}) = ${fmt(t.t)}`);
    const vs = t.kind === 'onesample' ? `<b>${esc(t.labels[0])}</b> vs <b>${esc(t.labels[1])}</b>` : `<b>${esc(t.labels[0])}</b> vs <b>${esc(t.labels[1])}</b>`;
    h += `<h3>${t.name}</h3><div class="callout">${vs}: ${head()}, ${pEq(t.p)} <span class="pill ${t.p < a ? 's' : 'n'}">${t.p < a ? 'significant ' + stars(t.p) : 'not significant'}</span></div>`;
    const tb = rows => `<table class="tbl" style="margin-top:8px"><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;
    if (np) h += tb([['Median A', fmt(t.meda)], ['Median B', fmt(t.medb)], ...(t.kind === 'wilcoxon' ? [['Median of paired differences', fmt(t.medd)]] : []), ['Effect size r (|z|/√N)', fmt(t.r, 3)]]) + `<div class="legendnote">${t.note}. Bars show mean ± error; the test compares ranks.</div>`;
    else if (t.kind === 'ks') h += tb([['Median A', fmt(t.meda)], ['Median B', fmt(t.medb)], ['Max distance between the two cumulative distributions (D)', fmt(t.D, 4)]]) + `<div class="legendnote">Tests whether the two samples come from the same distribution (shape, spread or location); ${t.note}.</div>`;
    else if (t.kind === 'perm') h += tb([['Mean A', fmt(t.ma)], ['Mean B', fmt(t.mb)], ['Difference (A − B)', fmt(t.diff)], ['Shuffles', t.nperm]]) + `<div class="legendnote">${t.note}. Makes no distributional assumptions.</div>`;
    else if (t.kind === 'ftest') h += tb([['Variance A', fmt(t.va)], ['Variance B', fmt(t.vb)], ['Variance ratio (A / B)', fmt(t.ratio)]]) + `<div class="legendnote">Two-sided F-test; sensitive to non-normal data.</div>`;
    else if (t.kind === 'onesample') h += tb([['Mean', fmt(t.mean)], ['Value tested against (μ)', fmt(t.mu0)], ['Difference', fmt(t.diff)], [`${100 * (1 - a)}% CI of the mean`, `${fmt(t.mean - ST.qt2(a, t.df) * t.se)} to ${fmt(t.mean + ST.qt2(a, t.df) * t.se)}`], ['Standard error', fmt(t.se)], ["Cohen's d", fmt(t.d, 3)]]);
    else h += tb([['Mean difference (A − B)', fmt(t.diff)], [`${100 * (1 - a)}% CI of difference`, `${fmt(t.ciLo)} to ${fmt(t.ciHi)}`], ['Standard error', fmt(t.se)], ["Cohen's d", fmt(t.d, 3)]]);
  }
  if (S.omni) {
    const o = S.omni, pill = `<span class="pill ${o.p < a ? 's' : 'n'}">${o.p < a ? 'significant ' + stars(o.p) : 'not significant'}</span>`;
    if (o.kind === 'kruskal') {
      h += `<h3>${o.name}</h3><div class="callout">H(${o.df}) = ${fmt(o.H)}, ${pEq(o.p)} ${pill} · ε² = ${fmt(o.eps2, 3)} · all ${S.k} groups compared</div>`;
      h += '<table class="tbl" style="margin-top:8px"><thead><tr><th>Group</th><th>n</th><th>Median</th><th>Mean rank</th></tr></thead><tbody>' + S.active.map((c, i) => `<tr><td>${esc(c.label)}</td><td>${c.n}</td><td>${fmt(c.med)}</td><td>${fmt(o.meanRank[i], 3)}</td></tr>`).join('') + '</tbody></table>';
    } else if (o.kind === 'median') {
      h += `<h3>${o.name}</h3><div class="callout">χ²(${o.df}) = ${fmt(o.chi2)}, ${pEq(o.p)} ${pill} · grand median = ${fmt(o.gm)}</div>`;
      h += '<table class="tbl" style="margin-top:8px"><thead><tr><th>Group</th><th>n</th><th>Above grand median</th><th>At or below</th></tr></thead><tbody>' + S.active.map((c, i) => `<tr><td>${esc(c.label)}</td><td>${c.n}</td><td>${o.above[i]}</td><td>${o.below[i]}</td></tr>`).join('') + '</tbody></table>';
    } else if (o.kind === 'jt') {
      h += `<h3>${o.name}</h3><div class="callout">J = ${fmt(o.J)}, z = ${fmt(o.z)}, ${pEq(o.p)} (two-sided) ${pill} · trend is <b>${o.dir}</b> across the groups in the order shown on the chart</div><div class="legendnote">Tests for an ordered trend (low → high) across the groups, left to right. Use "Group order" to change the order; no post-hoc is needed.</div>`;
    } else h += `<h3>${o.name}</h3><div class="callout">F(${o.df1}, ${fmt(o.df2, 4)}) = ${fmt(o.F)}, ${pEq(o.p)} ${pill} · all ${S.k} groups compared (no equal-variance assumption)</div>`;
  }
  if (S.anova) {
    const an = S.anova, nWay = ['One', 'Two', 'Three'][S.nf - 1] || S.nf;
    h += `<h3>${nWay}-way ANOVA ${S.nf > 1 ? '(Type III, with interactions)' : ''}</h3>`;
    h += '<div class="tblwrap"><table class="tbl"><thead><tr><th>Source</th><th>SS</th><th>df</th><th>MS</th><th>F</th><th>p</th><th></th><th>partial η²</th></tr></thead><tbody>';
    an.rows.forEach(r => { h += `<tr class="${r.p < a ? 'sig' : ''}"><td>${esc(r.term)}</td><td>${fmt(r.ss)}</td><td>${r.df}</td><td>${fmt(r.ms)}</td><td>${fmt(r.F)}</td><td>${fmtP(r.p)}</td><td>${stars(r.p)}</td><td>${fmt(r.peta, 3)}</td></tr>`; });
    h += `<tr><td>Error (within)</td><td>${fmt(an.error.ss)}</td><td>${an.error.df}</td><td>${fmt(an.error.ms)}</td><td></td><td></td><td></td><td></td></tr>`;
    h += `<tr><td>Total</td><td>${fmt(an.total.ss)}</td><td>${an.total.df}</td><td></td><td></td><td></td><td></td><td></td></tr></tbody></table></div>`;
  }
  if (S.pairs) h += pairsTable(S, a);
  h += assumptionsHTML(S, a);
  h += `<h3>Descriptive statistics</h3>` + descTable(S);
  return h;
}
function testName(S) {
  return { student: "Student's t-test", welch: "Welch's t-test", paired: 'Paired t-test', mwu: 'Mann–Whitney U test', wilcoxon: 'Wilcoxon signed-rank test', anova: ['One', 'Two', 'Three'][S.nf - 1] + '-way ANOVA', welchanova: "Welch's ANOVA", kruskal: 'Kruskal–Wallis test', ks: 'Kolmogorov–Smirnov test', perm: 'Permutation test', ftest: 'F-test of variances', onesample: 'One-sample t-test', median: "Mood's median test", jt: 'Jonckheere–Terpstra trend test', none: 'no test' }[S.mode];
}
function statsText(S) {
  if (!S && !(lastSc && opt.chart === 'scatter')) return '';
  const L = [];
  if (lastSc && opt.chart === 'scatter') return scatterText(lastSc);
  L.push(['Group', 'n', 'Mean', 'SD', 'SEM', 'Median', 'CI95 low', 'CI95 high', S.letters ? 'Letters' : ''].join('\t'));
  S.cells.forEach(c => { if (c.n) L.push([c.label, c.n, c.mean, c.sd, c.sem, c.med, c.mean - c.ci, c.mean + c.ci, S.letters ? (S.letters.get(c.idx) || '') : ''].join('\t')); });
  if (S.tt) { const t = S.tt; L.push('', t.name + ': ' + t.labels.join(' vs '), ...Object.entries({ t: t.t, U: t.U, W: t.W, D: t.D, F: t.F, z: t.z, df: t.df, p: t.p, 'mean diff': t.diff, 'Cohen d': t.d, 'effect r': t.r }).filter(e => e[1] !== undefined).map(e => e[0] + ' = ' + e[1])); }
  if (S.omni) { const o = S.omni; L.push('', o.name, Object.entries({ H: o.H, 'chi2': o.chi2, J: o.J, z: o.z, F: o.F, df: o.df, df1: o.df1, df2: o.df2, p: o.p }).filter(e => e[1] !== undefined).map(e => e[0] + ' = ' + e[1]).join(', ')); }
  if (S.anova) {
    L.push('', ['Source', 'SS', 'df', 'MS', 'F', 'p', 'partial eta2'].join('\t'));
    S.anova.rows.forEach(r => L.push([r.term, r.ss, r.df, r.ms, r.F, r.p, r.peta].join('\t')));
    L.push(['Error', S.anova.error.ss, S.anova.error.df, S.anova.error.ms].join('\t'));
  }
  if (S.pairs) { L.push('', S.pairTitle, ['Comparison', 'Diff', S.pairStat, 'Adj p'].join('\t')); S.pairs.forEach(p => L.push([p.a + ' - ' + p.b, p.diff, p.stat, p.p].join('\t'))); }
  L.push('', ['Shapiro-Wilk', 'n', 'W', 'p'].join('\t'));
  S.norm.forEach(x => { if (x.res) L.push([x.label, x.n, x.res.W, x.res.p].join('\t')); });
  if (S.levene) L.push('', `Brown-Forsythe: F(${S.levene.df1},${S.levene.df2}) = ${S.levene.F}, p = ${S.levene.p}`);
  return L.join('\n');
}


// ---------- plain-language interpretation ----------
const magEta = e => e < 0.01 ? 'negligible' : e < 0.06 ? 'small' : e < 0.14 ? 'medium' : 'large';
const magD = d => { d = Math.abs(d); return d < 0.2 ? 'negligible' : d < 0.5 ? 'small' : d < 0.8 ? 'medium' : 'large'; };
const magR = r => { r = Math.abs(r); return r < 0.1 ? 'negligible' : r < 0.3 ? 'weak' : r < 0.5 ? 'moderate' : r < 0.7 ? 'strong' : 'very strong'; };
const pctDiff = (a, b) => (isFinite(a) && isFinite(b) && b !== 0) ? (100 * (a - b) / Math.abs(b)) : NaN;
const sigWord = (p, a) => p < a ? 'statistically significant' : 'not statistically significant';
function listJoin(a, max = 4) { const x = a.slice(0, max).map(esc); const more = a.length > max ? ` and ${a.length - max} more` : ''; return x.length > 1 ? x.slice(0, -1).join(', ') + ' and ' + x[x.length - 1] + more : (x[0] || '') + more; }

function interpGraphCat(S) {
  const out = [], kind = opt.chart, act = S.active;
  const errDesc = { sem: '± 1 standard error of the mean (SEM). It shows how precisely each mean is estimated, not how spread out the individual values are', sd: '± 1 standard deviation (SD), which is the spread of the individual values', ci: 'the 95% confidence interval of the mean', ci99: 'the 99% confidence interval of the mean', range: 'the full range from the smallest to the largest value', iqr: 'the interquartile range (Q1 to Q3), the middle 50% of the values' };
  if (S.single) { out.push('Each position shows a single value (for example a mean or a % change) as given, so there are no error bars or tests.'); return out; }
  const bars = opt.err !== 'none';
  if (kind === 'bar') out.push(`Each bar is the <b>mean</b> of a group${bars ? `; the error bars show ${errDesc[opt.err]}${opt.errDir === 'up' ? ' (drawn upward only)' : ''}` : ''}.`);
  else if (kind === 'dot') out.push(`Each dot is a group <b>mean</b>${bars ? `, with error bars showing ${errDesc[opt.err]}` : ''}.`);
  else if (kind === 'line') out.push(`Dots are group <b>means</b>${bars ? ` (error bars: ${errDesc[opt.err]})` : ''}, joined across the x-axis${S.L[1] > 1 ? ` for each ${esc(S.D.factors[1])} level. Lines that are not parallel hint at an interaction between ${esc(S.D.factors[0])} and ${esc(S.D.factors[1])}; check the ANOVA interaction term` : ''}.`);
  else if (kind === 'box') out.push(`Each box spans the <b>middle 50%</b> of the values (Q1–Q3); the thick line is the <b>median</b>${opt.meanMk ? ' and the diamond is the mean' : ''}. Whiskers reach ${opt.whisk === 'tukey' ? 'the most extreme values within 1.5 × IQR; circles beyond them are outliers' : 'the minimum and maximum'}. A mean far from the median suggests skewed data.`);
  else if (kind === 'violin') out.push(`Each violin shows the <b>shape of the distribution</b>: wider = more values at that level${opt.box ? '; the inner box is Q1–Q3 with the median line and a diamond for the mean' : ''}. Two humps would suggest two sub-populations.`);
  const ns = act.map(c => c.n), nmin = Math.min(...ns), nmax = Math.max(...ns);
  out.push(`${act.length} group${act.length > 1 ? 's' : ''} are plotted with <b>n = ${nmin === nmax ? nmin : nmin + '–' + nmax}</b> values each${opt.points && kind !== 'violin' ? '; the small circles are the individual measurements' : ''}.${nmin < 5 ? ' With fewer than 5 values per group, error bars and tests are unreliable, so treat the pattern as preliminary.' : ''}`);
  const hi = act.slice().sort((a, b) => b.mean - a.mean), top = hi[0], bot = hi[hi.length - 1];
  if (act.length > 1) { const pc = pctDiff(top.mean, bot.mean); out.push(`The <b>highest mean</b> is <b>${esc(top.label)}</b> (${fmt(top.mean, 4)}) and the <b>lowest</b> is <b>${esc(bot.label)}</b> (${fmt(bot.mean, 4)})${isFinite(pc) ? `, a difference of ${fmt(Math.abs(pc), 3)}% of the lower value` : ''}.`); }
  if (S.letters && opt.letters) out.push(S.starMode ? 'Stars above the bars compare each group with the <b>control</b> (* p < 0.05, ** p < 0.01, *** p < 0.001, ns = not significant).' : 'Letters above the groups come from the post-hoc test: <b>groups that share a letter are not significantly different</b>; groups with no letter in common are. “a” is the group with the highest mean.');
  else if (S.tt && kind !== 'violin' && S.mode !== 'onesample') out.push(`The bracket marks the two groups that were compared (${stars(S.tt.p)}).`);
  return out;
}
function interpStatsCat(S) {
  const a = S.alpha, out = [];
  if (S.single) return ['Every group has a single value, so no statistics can be calculated. Add replicate measurements to get error bars and tests.'];
  if (S.mode === 'none') return ['No test was run. Pick one under <b>Statistics</b>, or provide at least two groups.'];
  if (S.autoReason) out.push(`<b>Why this test:</b> ${esc(S.autoReason)}`);
  const t = S.tt;
  if (t) {
    const A = esc(t.labels[0]), B = esc(t.labels[1]);
    if (t.kind === 'onesample') out.push(`The mean of <b>${A}</b> (${fmt(t.mean, 4)}) differs from ${fmt(t.mu0, 4)} by ${fmt(t.diff, 3)}; this is <b>${sigWord(t.p, a)}</b> (${pEq(t.p)}). The ${100 * (1 - a)}% confidence interval of the mean is ${fmt(t.mean - ST.qt2(a, t.df) * t.se, 4)} to ${fmt(t.mean + ST.qt2(a, t.df) * t.se, 4)}${t.p < a ? ', which excludes the test value' : ', which includes the test value'}. Effect size: Cohen’s d = ${fmt(t.d, 3)} (${magD(t.d)}).`);
    else if (t.kind === 'ftest') out.push(`The variance of <b>${A}</b> is ${fmt(t.ratio, 3)} × that of <b>${B}</b>. The difference in spread is <b>${sigWord(t.p, a)}</b> (${pEq(t.p)}).${t.p < a ? ' Unequal variances mean a Welch test is safer than a Student t-test.' : ' There is no clear evidence the spreads differ.'}`);
    else if (t.kind === 'ks') out.push(`<b>${A}</b> and <b>${B}</b> have ${t.p < a ? '<b>significantly different</b>' : 'no significantly different'} distributions (D = ${fmt(t.D, 3)}, ${pEq(t.p)}). The KS test is sensitive to any difference in location, spread or shape, so a significant result does not say which of these differs; check the box or violin plot.`);
    else if (t.kind === 'perm') out.push(`The mean of <b>${A}</b> is ${fmt(t.ma, 4)} and of <b>${B}</b> is ${fmt(t.mb, 4)} (difference ${fmt(t.diff, 3)}). Shuffling group labels ${t.nperm.toLocaleString()} times, a difference this large arose by chance with probability ${pEq(t.p)}, so the difference is <b>${sigWord(t.p, a)}</b>. This test makes no normality assumption.`);
    else if (t.kind === 'mwu' || t.kind === 'wilcoxon') out.push(`Comparing <b>${A}</b> (median ${fmt(t.meda, 4)}) with <b>${B}</b> (median ${fmt(t.medb, 4)}): the difference is <b>${sigWord(t.p, a)}</b> (${pEq(t.p)}, effect size r = ${fmt(t.r, 2)}, ${magR(t.r)}). This rank-based test compares the typical (median) ranking and does not assume normal data${t.kind === 'wilcoxon' ? '; it also assumes values are paired in the same row order' : ''}.`);
    else {
      const hi = t.diff >= 0 ? A : B, lo = t.diff >= 0 ? B : A;
      out.push(`<b>${hi}</b> is higher than <b>${lo}</b> by ${fmt(Math.abs(t.diff), 3)} on average. The difference is <b>${sigWord(t.p, a)}</b> (${t.name.replace(/ t-test/, '')}: ${pEq(t.p)}). The ${100 * (1 - a)}% confidence interval of the difference is ${fmt(t.ciLo, 3)} to ${fmt(t.ciHi, 3)}${(t.ciLo > 0 || t.ciHi < 0) ? ', which does not include 0' : ', which includes 0, so the true difference could be zero'}. Effect size: Cohen’s d = ${fmt(t.d, 2)} (${magD(t.d)}).`);
    }
    if (S.k > 2) out.push(`Only the two selected groups were compared; with ${S.k} groups, use ANOVA (or its alternatives) rather than repeated pairwise tests.`);
  }
  if (S.omni) {
    const o = S.omni;
    if (o.kind === 'jt') out.push(`There is a <b>${sigWord(o.p, a)}</b> ${o.dir} trend across the groups in the order shown (${pEq(o.p)}). ${o.p < a ? '' : 'No consistent rise or fall was detected. '}The result depends on the group order, so check it is the order you intend (dose, time, etc.).`);
    else out.push(`${o.name} across ${S.k} groups is <b>${sigWord(o.p, a)}</b> (${pEq(o.p)}), meaning ${o.p < a ? 'at least one group differs from the others' : 'there is no clear evidence that the groups differ'}.${o.kind === 'kruskal' ? ' This is a rank-based test, so it concerns typical (median) values rather than means.' : ''}${o.kind === 'welchanova' ? ' It does not assume equal variances.' : ''}${o.kind === 'median' ? ' It checks whether groups differ in how many values fall above the overall median.' : ''}`);
  }
  if (S.anova) {
    const rows = S.anova.rows, sig = rows.filter(r => r.p < a), nsr = rows.filter(r => r.p >= a);
    out.push(`${S.nf > 1 ? 'The factorial ANOVA tests each factor and their interactions.' : 'The one-way ANOVA tests whether the group means differ.'} ${sig.length ? 'Significant: ' + sig.map(r => `<b>${esc(r.term)}</b> (F = ${fmt(r.F, 3)}, ${pEq(r.p)}, partial η² = ${fmt(r.peta, 2)}, ${magEta(r.peta)} effect)`).join('; ') + '.' : '<b>No term is significant</b>, so there is no clear evidence of an effect.'}${nsr.length && sig.length ? ' Not significant: ' + nsr.map(r => esc(r.term)).join(', ') + '.' : ''}`);
    const inter = sig.filter(r => r.term.includes('×'));
    if (inter.length) out.push(`<b>Interaction:</b> ${listJoin(inter.map(r => r.term))} ${inter.length > 1 ? 'are' : 'is'} significant, meaning the effect of one factor <b>depends on the level of another</b>. Interpret the main effects with care and look at the individual groups (the letters or stars on the chart).`);
  } else if (S.mode === 'anova' && S.error) out.push(`The ANOVA table could not be calculated (${esc(S.error)}).`);
  if (S.pairs) {
    const np = S.pairs.length, sg = S.pairs.filter(p => p.p < a), best = S.pairs.slice().sort((x, y) => x.p - y.p)[0];
    out.push(`<b>Post-hoc (${esc(S.pairTitle)}):</b> ${sg.length} of ${np} comparison${np > 1 ? 's are' : ' is'} significant at α = ${a}.${best ? ` The clearest difference is <b>${esc(best.a)}</b> vs <b>${esc(best.b)}</b> (${pEq(best.p)}).` : ''}${S.post === 'lsd' ? ' Fisher’s LSD does not correct for multiple comparisons, so it can give false positives when there are many groups.' : ''}`);
    if (S.letters && !S.starMode) {
      const groups = new Map(); S.active.forEach(c => { const l = S.letters.get(c.idx) || ''; if (l) groups.set(l, (groups.get(l) || []).concat(c.label)); });
      const first = S.active.slice().sort((x, y) => y.mean - x.mean)[0], fl = S.letters.get(first.idx) || '';
      const sameAsTop = S.active.filter(c => c !== first && fl && (S.letters.get(c.idx) || '').split('').some(ch => fl.includes(ch))).map(c => c.label);
      if (S.active.length > 1) out.push(`Highest group: <b>${esc(first.label)}</b>${sameAsTop.length ? ', which is not significantly different from ' + listJoin(sameAsTop) : ', which is significantly higher than every other group'}.`);
    }
  }
  const ass = [];
  const bad = S.norm.filter(x => x.res && x.res.p < a).map(x => x.label);
  if (bad.length) ass.push(`Shapiro–Wilk flags non-normal data in ${listJoin(bad, 3)}`);
  if (S.levene && S.levene.p < a) ass.push('variances differ between groups (Brown–Forsythe)');
  if (['student', 'anova'].includes(S.mode) && ass.length) out.push(`<b>Caution:</b> ${ass.join(' and ')}. This test assumes normal data with similar spread, so consider a Welch, rank-based or permutation alternative.`);
  else if (!ass.length && ['mwu', 'kruskal'].includes(S.mode) && opt.test !== 'auto') out.push('The data look roughly normal, so a parametric test would have more power than this rank-based one.');
  if (S.active.some(c => c.n < 5)) out.push('<b>Sample size:</b> some groups have fewer than 5 values, so normality and equal-variance checks have little power and p-values are fragile.');
  out.push('A p-value says how surprising the data are if there were no real effect; it does not measure how <i>important</i> the effect is. Use the effect sizes and confidence intervals alongside it.');
  return out;
}
function interpGraphOther(S) {
  const o = [];
  if (opt.chart === 'hist') {
    const all = S.D.obs.map(x => x.y), n = all.length, d = ST.describe(all), sk = n > 2 ? all.reduce((s, v) => s + Math.pow((v - d.mean) / d.sd, 3), 0) * n / ((n - 1) * (n - 2)) : 0;
    o.push(`The histogram shows how <b>${n} values</b> of ${esc(S.D.valName)} are distributed: taller bars mean more values fall in that range.`);
    o.push(`Mean = ${fmt(d.mean, 4)}, median = ${fmt(d.med, 4)}, SD = ${fmt(d.sd, 4)}, range ${fmt(d.min, 4)} to ${fmt(d.max, 4)}. ${Math.abs(sk) < 0.5 ? 'The distribution is roughly symmetric.' : sk > 0 ? 'It is <b>right-skewed</b> (a longer tail of high values), so the median is the better “typical” value.' : 'It is <b>left-skewed</b> (a longer tail of low values), so the median is the better “typical” value.'}`);
    const sw = n >= 3 && n <= 5000 ? ST.shapiroWilk(all) : null;
    if (sw) o.push(`Shapiro–Wilk normality test: W = ${fmt(sw.W, 4)}, ${pEq(sw.p)} → the values ${sw.p < S.alpha ? '<b>deviate from a normal distribution</b>; consider rank-based tests' : 'are consistent with a normal distribution'}.`);
  } else if (opt.chart === 'pie') {
    const act = S.active.map(c => ({ label: c.label, v: opt.pstat === 'sum' ? c.sum : opt.pstat === 'count' ? c.n : c.mean })).filter(x => x.v > 0).sort((a, b) => b.v - a.v), tot = act.reduce((s, x) => s + x.v, 0);
    if (act.length) o.push(`Each slice is that group’s share of the total ${{ mean: 'of the group means', sum: 'sum', count: 'count' }[opt.pstat]}. The largest slice is <b>${esc(act[0].label)}</b> at ${fmt(100 * act[0].v / tot, 3)}%${act.length > 1 ? `, and the smallest is <b>${esc(act[act.length - 1].label)}</b> at ${fmt(100 * act[act.length - 1].v / tot, 3)}%` : ''}.`);
    o.push('Pie charts show proportions of a whole only; they carry no error information and no statistical test. Use a bar or box chart to compare groups statistically.');
  }
  return o;
}
function interpVolcano() {
  const v = lastVol; if (!v) return [[], []];
  const g = [`Each point is one feature (gene). The x-axis is the <b>effect size</b> (log2 fold change: +1 = doubled, −1 = halved) and the y-axis is the <b>significance</b> (−log10 ${v.adj ? 'adjusted ' : ''}p; higher = stronger evidence). Points far from the centre line and high up are both large and significant.`,
    `Dashed lines mark the cutoffs: |log2FC| ≥ ${v.fc} and ${v.adj ? 'adjusted ' : ''}p < ${v.pt}. Coloured points pass both.`];
  const s = [`Of ${v.n.toLocaleString()} features, <b>${v.nUp}</b> are significantly <b>up</b> and <b>${v.nDn}</b> <b>down</b> (${fmt(100 * (v.nUp + v.nDn) / v.n, 3)}% of all).`];
  if (v.top.length) s.push(`The most significant: ${listJoin(v.top.map(p => `${p.name} (log2FC ${fmt(p.x, 3)})`), 5)}.`);
  s.push(v.adj ? 'p-values were adjusted with Benjamini–Hochberg, controlling the false discovery rate.' : '<b>Caution:</b> p-values are not adjusted for testing thousands of features, so some “significant” hits will be false positives. Turn on the Benjamini–Hochberg adjustment for a safer list.');
  return [g, s];
}
function interpScatter(sc) {
  const a = +opt.alpha, nm = { pearson: 'Pearson r', spearman: 'Spearman ρ', kendall: 'Kendall τ' }[sc.corr];
  const g = [`Each point is one observation: <b>${esc(sc.x)}</b> on the x-axis and <b>${esc(sc.y)}</b> on the y-axis.${sc.hasG ? ' Colours separate the groups.' : ''}${opt.fit === 'linear' ? ' The line is the least-squares best fit and the shaded band its 95% confidence interval; a narrow band means the line is well determined.' : ''}`];
  const s = [];
  sc.sets.forEach(st => {
    if (!st.c) { s.push(`<b>${esc(st.label)}</b>: too few points or no variation to calculate a correlation.`); return; }
    const c = st.c, m = c.main, pe = c.pe;
    s.push(`<b>${esc(st.label)}</b> (n = ${c.n}): a <b>${magR(m.val)} ${m.val >= 0 ? 'positive' : 'negative'}</b> correlation (${nm.split(' ')[1]} = ${fmt(m.val, 3)}), which is <b>${sigWord(m.p, a)}</b> (${pEq(m.p)}). ${m.val >= 0 ? 'Higher' : 'Higher'} ${esc(sc.x)} tends to go with ${m.val >= 0 ? 'higher' : 'lower'} ${esc(sc.y)}. The line explains <b>${fmt(100 * pe.r2, 3)}%</b> of the variation in ${esc(sc.y)} (R² = ${fmt(pe.r2, 3)}); each +1 in ${esc(sc.x)} changes ${esc(sc.y)} by about ${fmt(pe.slope, 3)} (± ${fmt(pe.seSlope, 2)} SE).`);
  });
  if (sc.hasG) { const gs = sc.sets.slice(1).filter(x => x.c); if (gs.length === 2) { const d = gs[0].c.pe.slope - gs[1].c.pe.slope, se = Math.sqrt(gs[0].c.pe.seSlope ** 2 + gs[1].c.pe.seSlope ** 2), z = d / se; s.push(`The slopes of the two groups differ by ${fmt(Math.abs(d), 3)} (z ≈ ${fmt(z, 2)}, ${pEq(ST.pNorm2(z))}); ${ST.pNorm2(z) < a ? 'the groups respond differently to the x variable' : 'no clear difference in slope'}.`); } }
  s.push('<b>Correlation is not causation</b>: a strong relationship does not show that one variable drives the other, and a few extreme points can create or hide a correlation.');
  return [g, s];
}
function interpretation(S) {
  let g = [], s = [];
  if (opt.chart === 'volcano') [g, s] = interpVolcano();
  else if (opt.chart === 'scatter') { if (!lastSc) return null; [g, s] = interpScatter(lastSc); }
  else if (!S) return null;
  else if (isCat()) { g = interpGraphCat(S); s = interpStatsCat(S); }
  else { g = interpGraphOther(S); s = []; }
  return { g, s };
}
function interpHTML(S) {
  const r = interpretation(S); if (!r || (!r.g.length && !r.s.length)) return '';
  const li = a => '<ul class="interp">' + a.map(x => `<li>${x}</li>`).join('') + '</ul>';
  let h = '<div class="ihead"><h3 style="margin:0">Interpretation</h3><button class="btn sm" id="btnCopyInterp">Copy text</button></div>';
  if (r.g.length) h += '<h4>Reading the graph</h4>' + li(r.g);
  if (r.s.length) h += '<h4>What the statistics say</h4>' + li(r.s);
  return h + '<div class="legendnote">Generated automatically from the numbers on screen. It describes the data; it does not replace judgement about your experimental design.</div>';
}
function interpText(S) {
  const r = interpretation(S); if (!r) return '';
  const strip = x => x.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return (r.g.length ? 'READING THE GRAPH\n' + r.g.map(x => '- ' + strip(x)).join('\n') + '\n\n' : '') + (r.s.length ? 'WHAT THE STATISTICS SAY\n' + r.s.map(x => '- ' + strip(x)).join('\n') : '');
}

// ---------- render pipeline ----------
let timer = null;
function schedule(ms = 140) { clearTimeout(timer); timer = setTimeout(render, ms); }
function render() {
  const box = $('#chartbox'), out = $('#statsOut'), note = $('#chartNote');
  note.textContent = '';
  applyVisibility();
  // dynamic selects
  if (state.raw) {
    const cols = state.raw.headers.map((h, i) => [i, h]);
    if (opt.chart === 'scatter' && (opt.sx < 0 || opt.sy < 0 || opt.sx >= cols.length || opt.sy >= cols.length)) guessScatter(state.raw);
    setSelect('sx', cols, opt.sx); setSelect('sy', cols, opt.sy); setSelect('sg', [[-1, '(none)']].concat(cols), opt.sg);
    setSelect('xCol', cols, opt.xCol); setSelect('pCol', cols, opt.pCol); setSelect('lCol', [[-1, '(none)']].concat(cols), opt.lCol);
  }
  PATDEFS = new Map(); lastUnits = [];
  lastS = null; lastSc = null; lastVol = null; lastSS = null; lastSVG = ''; { const io = $('#interpOut'); if (io) io.style.display = 'none'; }
  if (!state.raw) { box.innerHTML = '<div class="empty"><b>Load some data to begin</b><br>Drop an Excel or CSV file on the left, paste cells, or pick an example.</div>'; out.style.display = 'none'; return; }
  let svg = '', S = null;
  try {
    if (opt.chart === 'volcano') { svg = renderVolcano(); out.style.display = 'none'; }
    else if (opt.chart === 'scatter') { svg = renderScatter(); if (lastSc && !svg.startsWith('ERR:')) { out.style.display = ''; out.innerHTML = scatterStatsHTML(lastSc); } else out.style.display = 'none'; }
    else {
      const D = buildData();
      if (!D) { box.innerHTML = '<div class="empty">No numeric values found. Check the layout and column choices on the left.</div>'; out.style.display = 'none'; return; }
      S = analyze(D); lastS = S;
      if (isCat()) svg = renderCat(S, opt.chart) || 'ERR:No data to plot.';
      else if (opt.chart === 'hist') svg = renderHist(S);
      else svg = renderPie(S);
      if (isCat()) {
        out.style.display = ''; out.innerHTML = statsHTML(S);
        const lbl = S.cells.filter(c => c.n).map(c => [S.active.indexOf(c), c.label]);
        setSelect('tA', lbl, opt.tA); setSelect('tB', lbl, opt.tB); setSelect('ctrl', lbl, opt.ctrl);
        const PO = { anova: [['default', 'Default (Tukey HSD)'], ['dunnett', 'Dunnett (vs a control)'], ['bonferroni', 'Bonferroni'], ['sidak', 'Šidák'], ['holm', 'Holm'], ['lsd', "Fisher's LSD (unadjusted)"], ['scheffe', 'Scheffé']], welchanova: [['default', 'Default (Games–Howell)'], ['t2', 'Tamhane T2'], ['bonferroni', 'Welch t, Bonferroni'], ['holm', 'Welch t, Holm']], kruskal: [['default', "Default (Dunn, Bonferroni)"], ['holm', 'Dunn, Holm'], ['sidak', 'Dunn, Šidák'], ['bh', 'Dunn, Benjamini–Hochberg']], median: [['default', 'Default (Bonferroni)'], ['holm', 'Holm'], ['sidak', 'Šidák'], ['bh', 'Benjamini–Hochberg']] }[S.mode] || [['default', 'Not needed for this test']];
        if (!PO.some(o => o[0] === opt.post) && opt.post !== 'none') opt.post = 'default';
        setSelect('post', PO.concat([['none', 'None']]), opt.post);
        $('#statsHint').textContent = S.letters ? 'Letters come from the post-hoc test across every group (every factor combination).' : (S.mode === 'none' ? 'Need at least two groups to run a test.' : '');
        applyVisibility();
      } else out.style.display = 'none';
      if (opt.chart === 'bar' && opt.points === false && opt.err === 'none') note.textContent = 'Tip: turn on error bars or data points so the spread is visible.';
    }
  } catch (e) { svg = 'ERR:' + e.message; console.error(e); }
  if (svg.startsWith('ERR:')) { box.innerHTML = `<div class="err">${esc(svg.slice(4))}</div>`; return; }
  svg = injectPatterns(addCaption(svg)); lastSVG = svg.replace(/<text[^>]*data-ph="1"[^>]*>[^<]*<\/text>/g, ''); box.innerHTML = svg;
  renderPatGrid();
  if (isCat() && !note.textContent) note.textContent = 'Tip: drag a group, legend entry or panel title to reorder it; click the title or an axis label to edit it.';
  else if (!note.textContent && ['hist', 'scatter', 'volcano'].includes(opt.chart)) note.textContent = 'Tip: click the title or an axis label on the chart to edit it.';
  try {
    const io = $('#interpOut'), ih = interpHTML(S);
    if (io) { io.style.display = ih ? '' : 'none'; io.innerHTML = ih; const b = $('#btnCopyInterp'); if (b) b.onclick = async () => toast((await copyText(interpText(S))) ? 'Interpretation copied.' : 'Copy was blocked by the browser.'); }
  } catch (e) { console.error(e); }
  syncControls();
}

// ---------- tooltip ----------
(function () {
  const tip = $('#tip');
  document.addEventListener('mousemove', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { tip.style.display = 'none'; return; }
    tip.innerHTML = t.dataset.tip; tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - w - 8) + 'px';
    tip.style.top = Math.min(e.clientY + 14, innerHeight - h - 8) + 'px';
  });
})();

// ---------- export ----------
let DL = null;
(async () => { try { DL = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { DL = null; } })();
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 3200); }
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch (e) {
    try { const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e2) { return false; }
  }
}
async function saveFile(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  if (DL) {
    try { await DL.save({ filename: name, data: blob }); toast('Saved ' + name); return; }
    catch (e1) {
      if (/declin|cancel|denied|reject/i.test(String(e1 && e1.message))) return;
      try { await DL.save({ filename: name, data: new Uint8Array(await blob.arrayBuffer()) }); toast('Saved ' + name); return; } catch (e2) { /* fall through */ }
    }
  }
  if (typeof data === 'string' && await copyText(data)) toast('Saving files is not available here – the text was copied to your clipboard instead.');
  else toast('Saving files is not available in this view.');
}
function svgToPng(svg, scale = 2) {
  return new Promise((res, rej) => {
    const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/); const w = +m[1], h = +m[2];
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(b => b ? res(b) : rej(new Error('PNG export failed')), 'image/png'); };
    img.onerror = () => rej(new Error('Could not rasterise the chart'));
    img.src = url;
  });
}
function baseName() { return (state.fileName || 'graph').replace(/\.[^.]+$/, '') + '_' + opt.chart; }

// ---------- examples ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeNorm(r) { return () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }; }
function loadExample(kind) {
  const r = rng(11), nrm = makeNorm(r), rd = v => Math.round(v * 100) / 100;
  let raw, o = {};
  if (kind === 'ttest' || kind === 'oneway') {
    const defs = kind === 'ttest' ? [['Control', 20], ['Treated', 24.5]] : [['Control', 10], ['Drug A', 13], ['Drug B', 11.5], ['Drug C', 17]];
    const n = kind === 'ttest' ? 10 : 6, sd = kind === 'ttest' ? 3 : 1.6;
    raw = { headers: defs.map(d => d[0]), rows: Array.from({ length: n }, () => defs.map(d => rd(d[1] + sd * nrm()))) };
    o = { chart: 'bar' };
  } else if (kind === 'twoway' || kind === 'threeway') {
    const rows = [];
    if (kind === 'twoway') {
      const m = { 'WT|Vehicle': 10, 'WT|Drug': 16, 'KO|Vehicle': 11, 'KO|Drug': 12 };
      ['WT', 'KO'].forEach(gt => ['Vehicle', 'Drug'].forEach(tr => { for (let i = 0; i < 6; i++) rows.push([gt, tr, rd(m[gt + '|' + tr] + 1.6 * nrm())]); }));
      raw = { headers: ['Genotype', 'Treatment', 'Expression'], rows };
    } else {
      ['WT', 'KO'].forEach(gt => ['Vehicle', 'Drug'].forEach(tr => ['25°C', '37°C'].forEach(tp => {
        const base = 10 + (gt === 'KO' ? 1 : 0) + (tr === 'Drug' ? 5 : 0) + (tp === '37°C' ? 2 : 0) + (gt === 'WT' && tr === 'Drug' && tp === '37°C' ? 4 : 0);
        for (let i = 0; i < 5; i++) rows.push([gt, tr, tp, rd(base + 1.5 * nrm())]);
      })));
      raw = { headers: ['Genotype', 'Treatment', 'Temperature', 'Expression'], rows };
    }
    o = { chart: 'bar' };
  } else if (kind === 'scatter') {
    const rows = [];
    [['Control', 0.9, 4], ['Treated', 1.7, 2]].forEach(([gname, sl, ic]) => { for (let i = 0; i < 14; i++) { const dose = rd(1 + i * 0.9 + r()); rows.push([dose, rd(ic + sl * dose + 1.4 * nrm()), gname]); } });
    raw = { headers: ['Dose (mg/kg)', 'Response', 'Group'], rows };
    o = { chart: 'scatter' };
  } else {
    const rows = [];
    for (let i = 1; i <= 1500; i++) {
      const eff = r() < 0.18 ? (r() < 0.5 ? -1 : 1) * (0.8 + 1.8 * r()) : 0, fc = eff + 0.45 * nrm(), se = 0.18 + 0.3 * r(), z = Math.abs(fc / se);
      rows.push(['GENE' + String(i).padStart(4, '0'), rd(fc), Math.max(1e-12, ST.pT2(z, 20))]);
    }
    ['BRCA1', 'MYC', 'TP53', 'IL6', 'VEGFA', 'CDK1', 'FOXO3', 'STAT3'].forEach((n, i) => { rows[i * 7][0] = n; });
    raw = { headers: ['Gene', 'log2FoldChange', 'pvalue'], rows };
    o = { chart: 'volcano' };
  }
  Object.assign(opt, { test: 'auto', post: 'default', tA: 0, tB: 1, title: '', xLabel: '', yLabel: '' }, o);
  state.wb = null; state.datasets = []; $('#sheetRow').style.display = 'none';
  setRaw(raw, kind + '_example');
  if (kind === 'ttest') { opt.test = 'auto'; }
}


// ---------- on-chart interaction: drag to reorder, click titles to edit ----------
function reorderLevel(f, from, to) {
  if (!lastS || from === to) return;
  const lv = lastS.D.levels[f].slice(); const [m] = lv.splice(from, 1); lv.splice(to, 0, m);
  opt.customOrder[f] = lv; opt.order = 'custom'; syncControls(); schedule(0);
}
function wireChart() {
  const box = $('#chartbox'), card = box.parentElement; card.style.position = 'relative';
  let drag = null, editing = null;
  const NS = 'http://www.w3.org/2000/svg';
  const svgPt = (svg, e) => { const m = svg.getScreenCTM(); if (!m) return null; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(m.inverse()); };
  const geoOf = svg => { try { return JSON.parse(svg.dataset.geo); } catch (e) { return null; } };
  const clear = () => { if (drag && drag.ghost) drag.ghost.remove(); if (drag && drag.dim) drag.dim.forEach(n => n.removeAttribute('opacity')); drag = null; box.style.userSelect = ''; };
  box.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !isCat() || !lastS || editing) return;
    const svg = box.querySelector('svg'); if (!svg) return; { const de = e.target.closest('[data-edit]'); if (de && !de.dataset.edit.startsWith('lvl:')) return; }
    const geo = geoOf(svg); if (!geo) return;
    let kind = null, idx = -1, panel = 0;
    const lg = e.target.closest('[data-lg]'), pn = e.target.closest('[data-pan]'), gr = e.target.closest('[data-grp]');
    if (lg) { kind = 'lg'; idx = +lg.dataset.lg; } else if (pn) { kind = 'pan'; idx = +pn.dataset.pan; } else if (gr) { kind = 'grp'; idx = +gr.dataset.grp; panel = +gr.dataset.p; }
    else {
      const pt = svgPt(svg, e); if (!pt) return;
      if (pt.y < geo.y0 || pt.y > geo.y1 + geo.lab || pt.x < geo.ml) return;
      const pstep = geo.pw + geo.gap; panel = Math.floor((pt.x - geo.ml) / pstep); if (panel < 0 || panel >= geo.L3) return;
      const xin = pt.x - (geo.ml + panel * pstep); if (xin > geo.pw) return;
      kind = 'grp'; idx = Math.min(geo.L1 - 1, Math.floor(xin / geo.band));
    }
    drag = { kind, idx, panel, x0: e.clientX, y0: e.clientY, active: false, svg, geo, target: idx };
    drag.pid = e.pointerId;
  });
  box.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.active) { if (Math.hypot(dx, dy) < 6) return; drag.active = true; try { box.setPointerCapture(drag.pid); } catch (er) {} box.style.userSelect = 'none'; $('#tip') && ($('#tip').style.display = 'none'); }
    const { svg, geo, kind } = drag, pt = svgPt(svg, e); if (!pt) return;
    if (drag.ghost) drag.ghost.remove();
    const gh = document.createElementNS(NS, 'g'); gh.setAttribute('pointer-events', 'none');
    const mk = (n, a) => { const el = document.createElementNS(NS, n); Object.entries(a).forEach(([k, v]) => el.setAttribute(k, v)); gh.appendChild(el); return el; };
    if (kind === 'grp') {
      const pstep = geo.pw + geo.gap, px = geo.ml + drag.panel * pstep;
      const t = Math.max(0, Math.min(geo.L1 - 1, Math.floor((pt.x - px) / geo.band))); drag.target = t;
      mk('rect', { x: pt.x - geo.band / 2, y: geo.y0, width: geo.band, height: geo.y1 - geo.y0, fill: '#2f6fed', 'fill-opacity': 0.12, stroke: '#2f6fed', 'stroke-dasharray': '4 3' });
      const lx = px + geo.band * (t + (t > drag.idx ? 1 : 0)); if (t !== drag.idx) mk('line', { x1: lx, x2: lx, y1: geo.y0, y2: geo.y1, stroke: '#2f6fed', 'stroke-width': 3 });
    } else {
      const sel = kind === 'lg' ? '[data-lg]' : '[data-pan]', items = $$(sel, svg), key = kind === 'lg' ? 'lg' : 'pan';
      let best = -1, bd = Infinity;
      items.forEach(el => { const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = Math.hypot(cx - e.clientX, cy - e.clientY); if (d < bd) { bd = d; best = +el.dataset[key]; } });
      drag.target = best;
      const src = items.find(el => +el.dataset[key] === drag.idx), dst = items.find(el => +el.dataset[key] === best);
      if (src && !drag.dim) { drag.dim = [src]; src.setAttribute('opacity', '0.35'); }
      if (dst && best !== drag.idx) { const bb = dst.getBBox(); mk('rect', { x: bb.x - 4, y: bb.y - 3, width: bb.width + 8, height: bb.height + 6, rx: 4, fill: '#2f6fed', 'fill-opacity': 0.15, stroke: '#2f6fed' }); }
      if (src) { const c = src.cloneNode(true); c.removeAttribute('data-lg'); c.removeAttribute('data-pan'); c.setAttribute('opacity', '0.85'); const m = svg.getScreenCTM(), sp = svgPt(svg, { clientX: drag.x0, clientY: drag.y0 }); c.setAttribute('transform', `translate(${pt.x - sp.x},${pt.y - sp.y})`); gh.appendChild(c); }
    }
    svg.appendChild(gh); drag.ghost = gh;
  });
  const finish = e => {
    if (!drag) return; const d = drag, was = d.active; clear();
    if (was) { box._justDragged = true; setTimeout(() => { box._justDragged = false; }, 50); const f = d.kind === 'grp' ? 0 : d.kind === 'lg' ? 1 : 2; if (d.target !== d.idx && d.target >= 0) reorderLevel(f, d.idx, d.target); }
  };
  box.addEventListener('pointerup', finish); box.addEventListener('pointercancel', () => clear());
  // inline editing of titles / axis labels / caption
  box.addEventListener('click', e => {
    if (box._justDragged) return;
    const t = e.target.closest('[data-edit]'); if (!t || editing) return;
    const id = t.dataset.edit, cr = card.getBoundingClientRect(), r = t.getBoundingClientRect();
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'inline-edit';
    const isLvl = id.startsWith('lvl:'), orig = isLvl ? id.slice(4) : '';
    const lvlFull = isLvl ? ((opt.rename && opt.rename[orig]) || orig) : '';
    inp.value = isLvl ? lvlFull : t.dataset.ph ? '' : id === 'caption' ? (opt.caption || '') : (opt[id] || t.textContent);
    const w = Math.max(240, Math.min(cr.width - 20, r.width + 80));
    inp.style.width = w + 'px';
    inp.style.left = Math.max(6, Math.min(cr.width - w - 6, r.left - cr.left + r.width / 2 - w / 2)) + 'px';
    inp.style.top = Math.max(4, r.top - cr.top + r.height / 2 - 16) + 'px';
    card.appendChild(inp); editing = inp; inp.focus(); inp.select();
    let done = false;
    const commit = ok => { if (done) return; done = true; editing = null; const v = inp.value; inp.remove(); if (ok && isLvl) { const nv = v.trim(); opt.rename = opt.rename || {}; if (!nv || nv === orig) delete opt.rename[orig]; else opt.rename[orig] = nv; syncControls(); schedule(0); } else if (ok) { opt[id] = v.trim() === t.textContent.trim() && id !== 'caption' && !opt[id] ? '' : v; syncControls(); schedule(0); } };
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') commit(true); else if (ev.key === 'Escape') commit(false); });
    inp.addEventListener('blur', () => commit(true));
  });
}

// ---------- wire up ----------
function init() {
  buildControls(); renderPalette(); wireChart();
  $$('#chartSeg button').forEach(b => b.onclick = () => { opt.chart = b.dataset.chart; if (opt.chart === 'volcano' && state.raw) guessVolcanoIfNeeded(); schedule(0); });
  const drop = $('#drop'), file = $('#file');
  drop.onclick = () => file.click();
  file.onchange = () => { if (file.files[0]) handleFile(file.files[0]); file.value = ''; };
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('on'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('on'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
  $('#sheetSel').onchange = e => loadSheet(e.target.value);
  $('#usePaste').onclick = () => { const t = $('#paste').value; if (!t.trim()) return toast('Paste some cells first.'); loadText(t, 'pasted'); };
  $('#example').onchange = e => { if (e.target.value) loadExample(e.target.value); e.target.value = ''; };
  $('#btnSvg').onclick = () => lastSVG ? saveFile(baseName() + '.svg', lastSVG, 'image/svg+xml') : toast('Nothing to save yet.');
  $('#btnPng').onclick = async () => { if (!lastSVG) return toast('Nothing to save yet.'); try { saveFile(baseName() + '.png', await svgToPng(lastSVG), 'image/png'); } catch (e) { toast(e.message); } };
  $('#btnCopyStats').onclick = async () => { const t = statsText(lastS); if (!t) return toast('No statistics for this chart type.'); toast((await copyText(t)) ? 'Statistics copied (paste into Excel).' : 'Copy was blocked by the browser.'); };
  loadExample('twoway');
}
function guessVolcanoIfNeeded() { if (opt.xCol < 0 || opt.pCol < 0) guessVolcano(state.raw); }
init();
})();
