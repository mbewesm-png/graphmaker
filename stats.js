/* Statistics engine for Graph Maker. Pure functions, no DOM. */
(function (root) {
  'use strict';

  // ---------- special functions ----------
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 400, EPS = 3e-14, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function betai(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  // two-sided p for Student t
  function pT2(t, df) {
    if (!isFinite(t)) return 0;
    return betai(df / 2, 0.5, df / (df + t * t));
  }
  // upper-tail p for F
  function pF(F, d1, d2) {
    if (!(F > 0)) return 1;
    if (!isFinite(F)) return 0;
    return betai(d2 / 2, d1 / 2, d2 / (d2 + d1 * F));
  }
  const qtCache = new Map();
  // two-sided critical t for given alpha
  function qt2(alpha, df) {
    const key = alpha + '|' + df;
    if (qtCache.has(key)) return qtCache.get(key);
    let lo = 0, hi = 1e4;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (pT2(mid, df) > alpha) lo = mid; else hi = mid;
    }
    const v = (lo + hi) / 2;
    qtCache.set(key, v);
    return v;
  }
  function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  const Phi = z => 0.5 * erfc(-z / Math.SQRT2);

  // ---------- studentized range (Tukey) ----------
  const NZ = 96, ZLO = -8, ZHI = 8, HZ = (ZHI - ZLO) / NZ;
  const ZG = [], PHIG = [], SMALLPHI = [];
  for (let i = 0; i <= NZ; i++) {
    const z = ZLO + i * HZ;
    ZG.push(z);
    PHIG.push(Phi(z));
    SMALLPHI.push(Math.exp(-z * z / 2) / 2.5066282746310002);
  }
  function rangeCdf(w, k) {
    let s = 0;
    for (let i = 0; i <= NZ; i++) {
      const d = PHIG[i] - Phi(ZG[i] - w);
      const f = SMALLPHI[i] * Math.pow(d > 0 ? d : 0, k - 1);
      s += (i === 0 || i === NZ ? 1 : (i % 2 ? 4 : 2)) * f;
    }
    return Math.min(1, k * s * HZ / 3);
  }
  // upper-tail p of studentized range q, k groups, df error df
  function ptukeyUpper(q, k, df) {
    if (!(q > 0)) return 1;
    if (!isFinite(q)) return 0;
    const sd = 1 / Math.sqrt(2 * df);
    let slo, shi;
    if (df >= 30) { slo = Math.max(1e-6, 1 - 9 * sd); shi = 1 + 9 * sd; }
    else { slo = 1e-6; shi = 1 + 10 * sd; }
    const ns = 160, hs = (shi - slo) / ns;
    const lc = Math.log(2) + (df / 2) * Math.log(df / 2) - lgamma(df / 2);
    let tot = 0, mass = 0;
    for (let i = 0; i <= ns; i++) {
      const s = slo + i * hs;
      const w = (i === 0 || i === ns ? 1 : (i % 2 ? 4 : 2));
      const dens = Math.exp(lc + (df - 1) * Math.log(s) - df * s * s / 2);
      tot += w * dens * rangeCdf(q * s, k);
      mass += w * dens;
    }
    return Math.max(0, Math.min(1, 1 - tot / mass));
  }

  // ---------- descriptives ----------
  const sum = a => { let s = 0; for (const v of a) s += v; return s; };
  const mean = a => sum(a) / a.length;
  function variance(a) {
    if (a.length < 2) return NaN;
    const m = mean(a); let s = 0;
    for (const v of a) s += (v - m) * (v - m);
    return s / (a.length - 1);
  }
  function quantile(sorted, p) {
    if (!sorted.length) return NaN;
    const h = (sorted.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
  }
  function describe(ys) {
    const n = ys.length;
    const s = ys.slice().sort((a, b) => a - b);
    const m = n ? mean(ys) : NaN;
    const sd = n > 1 ? Math.sqrt(variance(ys)) : NaN;
    const sem = n > 1 ? sd / Math.sqrt(n) : NaN;
    const ci = n > 1 ? qt2(0.05, n - 1) * sem : NaN;
    return { n, sum: n ? sum(ys) : 0, mean: m, sd, sem, ci, min: s[0], max: s[n - 1], q1: quantile(s, 0.25), med: quantile(s, 0.5), q3: quantile(s, 0.75), sorted: s };
  }

  // ---------- t tests ----------
  function tTest(a, b, kind, alpha) {
    alpha = alpha || 0.05;
    const na = a.length, nb = b.length, ma = mean(a), mb = mean(b);
    let t, df, se, diff, d, name;
    if (kind === 'paired') {
      if (na !== nb) throw new Error('Paired t-test needs the same number of values in both groups (' + na + ' vs ' + nb + ').');
      const dd = a.map((v, i) => v - b[i]);
      const md = mean(dd), sdd = Math.sqrt(variance(dd));
      se = sdd / Math.sqrt(na); df = na - 1; diff = md; t = md / se; d = md / sdd;
      name = 'Paired t-test';
    } else if (kind === 'welch') {
      const va = variance(a), vb = variance(b);
      se = Math.sqrt(va / na + vb / nb);
      df = Math.pow(va / na + vb / nb, 2) / (Math.pow(va / na, 2) / (na - 1) + Math.pow(vb / nb, 2) / (nb - 1));
      diff = ma - mb; t = diff / se; d = diff / Math.sqrt((va + vb) / 2);
      name = "Welch's t-test";
    } else {
      const va = variance(a), vb = variance(b);
      const sp2 = ((na - 1) * va + (nb - 1) * vb) / (na + nb - 2);
      se = Math.sqrt(sp2 * (1 / na + 1 / nb)); df = na + nb - 2; diff = ma - mb; t = diff / se; d = diff / Math.sqrt(sp2);
      name = "Student's t-test";
    }
    const p = pT2(t, df);
    const crit = qt2(alpha, df);
    return { name, kind, t, df, p, diff, se, ciLo: diff - crit * se, ciHi: diff + crit * se, d, na, nb, ma, mb };
  }

  // ---------- linear model / n-way ANOVA (Type III, effect coding) ----------
  function solveSSE(cols, y) {
    const p = cols.length, n = y.length;
    const A = [];
    for (let i = 0; i < p; i++) A.push(new Float64Array(p + 1));
    let scale = 0;
    for (let i = 0; i < p; i++) {
      for (let j = i; j < p; j++) {
        let s = 0; const ci = cols[i], cj = cols[j];
        for (let r = 0; r < n; r++) s += ci[r] * cj[r];
        A[i][j] = s; A[j][i] = s;
      }
      let s = 0; for (let r = 0; r < n; r++) s += cols[i][r] * y[r];
      A[i][p] = s;
      scale = Math.max(scale, A[i][i]);
    }
    for (let c = 0; c < p; c++) {
      let piv = c;
      for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-9 * scale) throw new Error('Design is rank-deficient (some factor combinations have no data).');
      if (piv !== c) { const t = A[c]; A[c] = A[piv]; A[piv] = t; }
      for (let r = 0; r < p; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        if (f === 0) continue;
        for (let k = c; k <= p; k++) A[r][k] -= f * A[c][k];
      }
    }
    const b = []; for (let i = 0; i < p; i++) b.push(A[i][p] / A[i][i]);
    let sse = 0;
    for (let r = 0; r < n; r++) {
      let fit = 0; for (let i = 0; i < p; i++) fit += b[i] * cols[i][r];
      sse += (y[r] - fit) * (y[r] - fit);
    }
    return sse;
  }
  function subsets(nf) {
    const out = [];
    for (let m = 1; m < (1 << nf); m++) {
      const s = []; for (let f = 0; f < nf; f++) if (m & (1 << f)) s.push(f);
      out.push(s);
    }
    out.sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()));
    return out;
  }
  // obs: [{k:[levelIdx per factor], y}], L: levels per factor, names: factor names
  function nwayAnova(obs, L, names) {
    const nf = L.length, n = obs.length;
    const y = Float64Array.from(obs.map(o => o.y));
    const terms = subsets(nf).map(s => {
      const cols = [];
      const combos = [[]];
      let combosCur = [[]];
      for (const f of s) {
        const next = [];
        for (const c of combosCur) for (let l = 0; l < L[f] - 1; l++) next.push(c.concat([[f, l]]));
        combosCur = next;
      }
      for (const combo of combosCur) {
        const col = new Float64Array(n);
        for (let r = 0; r < n; r++) {
          let v = 1;
          for (const [f, l] of combo) {
            const lv = obs[r].k[f];
            v *= (lv === l ? 1 : (lv === L[f] - 1 ? -1 : 0));
          }
          col[r] = v;
        }
        cols.push(col);
      }
      return { name: s.map(f => names[f]).join(' × '), cols, df: cols.length };
    });
    const ones = new Float64Array(n).fill(1);
    const allCols = [ones].concat(...terms.map(t => t.cols));
    const dfModel = allCols.length;
    const dfE = n - dfModel;
    if (dfE <= 0) throw new Error('Not enough replicates for this ANOVA: need more observations than factor-level combinations.');
    const sseFull = solveSSE(allCols, y);
    const mse = sseFull / dfE;
    const ybar = mean(y);
    let sst = 0; for (const v of y) sst += (v - ybar) * (v - ybar);
    const rows = terms.map(t => {
      const reduced = [ones].concat(...terms.filter(o => o !== t).map(o => o.cols));
      const ssRed = solveSSE(reduced, y);
      const ss = Math.max(0, ssRed - sseFull);
      const ms = ss / t.df, F = ms / mse;
      return { term: t.name, ss, df: t.df, ms, F, p: pF(F, t.df, dfE), peta: ss / (ss + sseFull) };
    });
    return { rows, error: { ss: sseFull, df: dfE, ms: mse }, total: { ss: sst, df: n - 1 }, mse, dfE, n };
  }

  // Brown-Forsythe / Levene (median-centred) across cells
  function levene(cellsYs) {
    const obs = [];
    const act = cellsYs.filter(c => c.length > 0);
    act.forEach((ys, i) => {
      const s = ys.slice().sort((a, b) => a - b);
      const med = quantile(s, 0.5);
      for (const v of ys) obs.push({ k: [i], y: Math.abs(v - med) });
    });
    if (act.length < 2) return null;
    try {
      const a = nwayAnova(obs, [act.length], ['cell']);
      return { F: a.rows[0].F, df1: a.rows[0].df, df2: a.dfE, p: a.rows[0].p };
    } catch (e) { return null; }
  }

  // ---------- post-hoc ----------
  // groups: [{n, mean}] ; returns pairs with p
  function posthoc(groups, mse, dfE, method) {
    const k = groups.length, pairs = [];
    const m = k * (k - 1) / 2;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const gi = groups[i], gj = groups[j];
      const diff = gi.mean - gj.mean;
      let p, stat;
      if (method === 'bonferroni') {
        const se = Math.sqrt(mse * (1 / gi.n + 1 / gj.n));
        stat = diff / se; p = Math.min(1, m * pT2(stat, dfE));
      } else {
        const se = Math.sqrt(mse / 2 * (1 / gi.n + 1 / gj.n));
        stat = Math.abs(diff) / se; p = ptukeyUpper(stat, k, dfE);
      }
      pairs.push({ i, j, diff, stat, p });
    }
    return pairs;
  }

  // Compact letter display (insert-and-absorb). means -> order desc; sig(i,j) boolean
  function letters(means, sig) {
    const m = means.length;
    const order = means.map((v, i) => i).sort((a, b) => means[b] - means[a]);
    let cols = [new Array(m).fill(true)];
    const subset = (a, b) => a.every((v, i) => !v || b[i]);
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
      if (!sig(order[a], order[b])) continue;
      const next = [];
      for (const col of cols) {
        if (col[a] && col[b]) {
          const c1 = col.slice(); c1[a] = false;
          const c2 = col.slice(); c2[b] = false;
          next.push(c1, c2);
        } else next.push(col);
      }
      // absorb
      const keep = [];
      next.forEach((c, i) => {
        if (!c.some(Boolean)) return;
        for (let j = 0; j < next.length; j++) {
          if (i === j) continue;
          if (subset(c, next[j]) && (!subset(next[j], c) || j < i)) return;
        }
        keep.push(c);
      });
      cols = keep;
    }
    cols.sort((x, y) => x.indexOf(true) - y.indexOf(true) || x.lastIndexOf(true) - y.lastIndexOf(true));
    const abc = 'abcdefghijklmnopqrstuvwxyz';
    const out = new Array(m).fill('');
    cols.forEach((c, ci) => {
      const ch = ci < 26 ? abc[ci] : abc[Math.floor(ci / 26) - 1] + abc[ci % 26];
      for (let p = 0; p < m; p++) if (c[p]) out[order[p]] += ch;
    });
    return out;
  }

  // Benjamini-Hochberg
  function bh(ps) {
    const n = ps.length;
    const idx = ps.map((p, i) => i).sort((a, b) => ps[a] - ps[b]);
    const q = new Array(n); let prev = 1;
    for (let r = n - 1; r >= 0; r--) {
      const i = idx[r];
      prev = Math.min(prev, ps[i] * n / (r + 1));
      q[i] = prev;
    }
    return q;
  }


  // ---------- more special functions ----------
  function gammaQ(a, x) {
    if (x <= 0) return 1;
    const lg = lgamma(a);
    if (x < a + 1) {
      let ap = a, sum = 1 / a, del = sum;
      for (let n = 0; n < 1000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
      return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - lg));
    }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return Math.exp(-x + a * Math.log(x) - lg) * h;
  }
  const pChi2 = (x, df) => gammaQ(df / 2, x / 2);
  const pNorm2 = z => Math.min(1, erfc(Math.abs(z) / Math.SQRT2));
  function qnorm(p) { // Acklam
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425; let q, r, x;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= 1 - pl) { q = p - 0.5; r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    // one Halley refinement
    const e = Phi(x) - p, u = e * 2.5066282746310002 * Math.exp(x * x / 2);
    return x - u / (1 + x * u / 2);
  }

  // ---------- ranks & nonparametric tests ----------
  function rankAvg(vals) {
    const n = vals.length, idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    const r = new Array(n); let tieSum = 0;
    for (let i = 0; i < n;) {
      let j = i; while (j + 1 < n && vals[idx[j + 1]] === vals[idx[i]]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k]] = avg;
      const t = j - i + 1; tieSum += t * t * t - t; i = j + 1;
    }
    return { r, tieSum };
  }
  function median(a) { return quantile(a.slice().sort((x, y) => x - y), 0.5); }
  function mannWhitney(a, b) {
    const na = a.length, nb = b.length, N = na + nb;
    const { r, tieSum } = rankAvg(a.concat(b));
    let R1 = 0; for (let i = 0; i < na; i++) R1 += r[i];
    const U1 = R1 - na * (na + 1) / 2, U2 = na * nb - U1, mu = na * nb / 2;
    const sigma = Math.sqrt(na * nb / 12 * ((N + 1) - tieSum / (N * (N - 1))));
    const z = sigma > 0 ? (Math.abs(U1 - mu) - 0.5) / sigma : 0;
    const p = sigma > 0 ? pNorm2(Math.max(0, z)) : 1;
    return { name: 'Mann–Whitney U test', kind: 'mwu', U: Math.min(U1, U2), U1, z, p, r: z / Math.sqrt(N), na, nb, meda: median(a), medb: median(b), note: 'normal approximation with tie and continuity correction' };
  }
  function wilcoxon(a, b) {
    if (a.length !== b.length) throw new Error('Wilcoxon signed-rank test needs the same number of values in both groups (' + a.length + ' vs ' + b.length + ').');
    const d = a.map((v, i) => v - b[i]).filter(v => v !== 0);
    const n = d.length;
    if (n < 1) throw new Error('All paired differences are zero.');
    const { r, tieSum } = rankAvg(d.map(Math.abs));
    let Wp = 0; d.forEach((v, i) => { if (v > 0) Wp += r[i]; });
    const Wm = n * (n + 1) / 2 - Wp, mu = n * (n + 1) / 4;
    const sigma = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - tieSum / 48);
    const z = sigma > 0 ? (Math.abs(Wp - mu) - 0.5) / sigma : 0;
    const p = sigma > 0 ? pNorm2(Math.max(0, z)) : 1;
    return { name: 'Wilcoxon signed-rank test', kind: 'wilcoxon', W: Math.min(Wp, Wm), Wp, z, p, r: z / Math.sqrt(n), n, meda: median(a), medb: median(b), medd: median(a.map((v, i) => v - b[i])), note: 'normal approximation with tie and continuity correction; zero differences dropped' };
  }
  function kruskal(groups) {
    const all = [].concat(...groups), N = all.length, k = groups.length;
    const { r, tieSum } = rankAvg(all);
    let pos = 0, sumR = 0; const meanRank = [];
    groups.forEach(g => { let R = 0; for (let i = 0; i < g.length; i++) R += r[pos + i]; pos += g.length; meanRank.push(R / g.length); sumR += R * R / g.length; });
    let H = 12 / (N * (N + 1)) * sumR - 3 * (N + 1);
    const C = 1 - tieSum / (N * N * N - N);
    if (C > 0) H /= C;
    const df = k - 1;
    return { name: 'Kruskal–Wallis test', kind: 'kruskal', H, df, p: pChi2(H, df), eps2: H / (N - 1), N, k, meanRank, tieSum };
  }
  function dunn(groups, kw, method) {
    const { N, tieSum, meanRank } = kw, k = groups.length, pairs = [];
    const base = N * (N + 1) / 12 - tieSum / (12 * (N - 1));
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const se = Math.sqrt(base * (1 / groups[i].length + 1 / groups[j].length));
      const z = (meanRank[i] - meanRank[j]) / se;
      pairs.push({ i, j, diff: meanRank[i] - meanRank[j], stat: z, p: pNorm2(z) });
    }
    const adj = adjustP(pairs.map(q => q.p), method === 'bonf' || !method ? 'bonferroni' : method);
    pairs.forEach((q, ix) => { q.p = adj[ix]; });
    return pairs;
  }
  function welchAnova(groups) {
    const k = groups.length;
    const n = groups.map(g => g.length), m = groups.map(mean), v = groups.map(variance);
    if (n.some(x => x < 2) || v.some(x => !(x > 0))) throw new Error("Welch's ANOVA needs at least 2 values per group and some spread in every group.");
    const w = n.map((x, i) => x / v[i]), W = sum(w), mw = w.reduce((a, x, i) => a + x * m[i], 0) / W;
    const A = w.reduce((a, x, i) => a + x * (m[i] - mw) * (m[i] - mw), 0) / (k - 1);
    const lam = w.reduce((a, x, i) => a + Math.pow(1 - x / W, 2) / (n[i] - 1), 0);
    const B = 1 + 2 * (k - 2) / (k * k - 1) * lam, F = A / B, df1 = k - 1, df2 = (k * k - 1) / (3 * lam);
    return { name: "Welch's ANOVA", kind: 'welchanova', F, df1, df2, p: pF(F, df1, df2) };
  }
  function gamesHowell(groups, method) {
    const k = groups.length, pairs = [];
    const n = groups.map(g => g.length), mu = groups.map(mean), v = groups.map(variance);
    const gh = !method || method === 'gh';
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const a = v[i] / n[i], b = v[j] / n[j], se = Math.sqrt(a + b);
      const df = (a + b) * (a + b) / (a * a / (n[i] - 1) + b * b / (n[j] - 1));
      const t = (mu[i] - mu[j]) / se;
      pairs.push({ i, j, diff: mu[i] - mu[j], stat: gh ? Math.abs(t) * Math.SQRT2 : t, p: gh ? ptukeyUpper(Math.abs(t) * Math.SQRT2, k, df) : pT2(t, df) });
    }
    if (!gh) { const adj = adjustP(pairs.map(q => q.p), method === 't2' ? 'sidak' : method); pairs.forEach((q, ix) => { q.p = adj[ix]; }); }
    return pairs;
  }

  // ---------- Shapiro–Wilk (Royston 1995, AS R94) ----------
  function poly(cc, x) { let r = cc[0]; if (cc.length > 1) { let p = x * cc[cc.length - 1]; for (let j = cc.length - 2; j >= 1; j--) p = (p + cc[j]) * x; r += p; } return r; }
  function shapiroWilk(xin) {
    const n = xin.length;
    if (n < 3) return null;
    const x = xin.slice().sort((a, b) => a - b);
    if (x[n - 1] - x[0] < 1e-12 * Math.max(1, Math.abs(x[0]))) return null;
    const nn2 = Math.floor(n / 2), a = new Array(nn2 + 1).fill(0);
    if (n === 3) a[1] = Math.SQRT1_2;
    else {
      const an25 = n + 0.25, m = [0]; let summ2 = 0;
      for (let i = 1; i <= nn2; i++) { const q = qnorm((i - 0.375) / an25); m.push(q); summ2 += q * q; }
      summ2 *= 2; const ss = Math.sqrt(summ2), rsn = 1 / Math.sqrt(n);
      const c1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056], c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
      const a1 = poly(c1, rsn) - m[1] / ss;
      let i1, fac;
      if (n > 5) {
        i1 = 3; const a2 = -m[2] / ss + poly(c2, rsn);
        fac = Math.sqrt((summ2 - 2 * m[1] * m[1] - 2 * m[2] * m[2]) / (1 - 2 * a1 * a1 - 2 * a2 * a2)); a[2] = a2;
      } else { i1 = 2; fac = Math.sqrt((summ2 - 2 * m[1] * m[1]) / (1 - 2 * a1 * a1)); }
      a[1] = a1;
      for (let i = i1; i <= nn2; i++) a[i] = -m[i] / fac;
    }
    const mean0 = mean(x); let ssq = 0, sa = 0;
    for (let i = 0; i < n; i++) ssq += (x[i] - mean0) * (x[i] - mean0);
    for (let i = 1; i <= nn2; i++) sa += a[i] * (x[n - i] - x[i - 1]);
    let w = sa * sa / ssq; if (w > 1) w = 1;
    let pw;
    if (n === 3) { pw = 1.90985931710274 * (Math.asin(Math.sqrt(w)) - 1.04719755119660); if (pw < 0) pw = 0; }
    else {
      const w1 = 1 - w, lw1 = Math.log(w1); let y, mm, s;
      if (n <= 11) {
        const gamma = poly([-2.273, 0.459], n);
        if (lw1 >= gamma) return { W: w, p: 1e-99, n };
        y = -Math.log(gamma - lw1); mm = poly([0.544, -0.39978, 0.025054, -6.714e-4], n); s = Math.exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n));
      } else { const xx = Math.log(n); y = lw1; mm = poly([-1.5861, -0.31082, -0.083751, 0.0038915], xx); s = Math.exp(poly([-0.4803, -0.082676, 0.0030302], xx)); }
      pw = 0.5 * erfc((y - mm) / s / Math.SQRT2);
    }
    return { W: w, p: pw, n };
  }


  // ---------- p-value adjustment ----------
  function adjustP(ps, method) {
    const m = ps.length, idx = ps.map((v, i) => i).sort((a, b) => ps[a] - ps[b]), out = new Array(m);
    if (method === 'holm') { let run = 0; idx.forEach((ix, r) => { run = Math.max(run, Math.min(1, (m - r) * ps[ix])); out[ix] = run; }); }
    else if (method === 'bh') { let run = 1; for (let r = m - 1; r >= 0; r--) { const ix = idx[r]; run = Math.min(run, ps[ix] * m / (r + 1)); out[ix] = Math.min(1, run); } }
    else if (method === 'sidak') ps.forEach((v, i) => { out[i] = 1 - Math.pow(1 - v, m); });
    else if (method === 'none') ps.forEach((v, i) => { out[i] = v; });
    else ps.forEach((v, i) => { out[i] = Math.min(1, v * m); });
    return out;
  }
  const phi = z => Math.exp(-0.5 * z * z) / 2.5066282746310002;

  // Dunnett (many-to-one) upper-tail p: P(max_i |T_i| >= d), equicorrelation rho
  function pDunnett(d, m, nu, rho) {
    if (!(d > 0)) return 1;
    const sr = Math.sqrt(rho), sq = Math.sqrt(1 - rho);
    const lgc = nu / 2 * Math.log(nu) - (nu / 2 - 1) * Math.LN2 - lgamma(nu / 2);
    const fs = x => Math.exp(lgc + (nu - 1) * Math.log(x) - nu * x * x / 2);
    const inner = sv => {
      const nz = 120, zlo = -8, zhi = 8, h = (zhi - zlo) / nz; let acc = 0;
      for (let i = 0; i <= nz; i++) {
        const z = zlo + i * h, w = i === 0 || i === nz ? 1 : i % 2 ? 4 : 2;
        const c = Phi((sr * z + d * sv) / sq) - Phi((sr * z - d * sv) / sq);
        acc += w * phi(z) * Math.pow(Math.max(0, c), m);
      }
      return acc * h / 3;
    };
    const hi = 1 + 10 / Math.sqrt(2 * nu) + 2 / Math.sqrt(nu), ns = 400, h = hi / ns; let tot = 0;
    for (let i = 1; i <= ns; i++) {
      const x = i * h, w = i === ns ? 1 : i % 2 ? 4 : 2;
      tot += w * fs(x) * inner(x);
    }
    tot = tot * h / 3;
    return Math.min(1, Math.max(0, 1 - tot));
  }

  // pooled-variance post-hoc, all methods
  function posthoc2(groups, mse, dfE, method, ctrl) {
    const k = groups.length, pairs = [];
    if (method === 'tukey' || method === 'bonferroni') return posthoc(groups, mse, dfE, method);
    const pick = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (method !== 'dunnett' || i === ctrl) pick.push([i, j]);
    if (method === 'dunnett') {
      const rhos = [];
      pick.forEach(([i, j]) => rhos.push(Math.sqrt(groups[i].n / (groups[i].n + groups[j].n) * groups[j].n / (groups[i].n + groups[j].n))));
      const rho = rhos.reduce((a, b) => a + b, 0) / rhos.length;
      pick.forEach(([i, j]) => {
        const se = Math.sqrt(mse * (1 / groups[i].n + 1 / groups[j].n)), diff = groups[i].mean - groups[j].mean, t = diff / se;
        pairs.push({ i, j, diff, stat: Math.abs(t), p: pDunnett(Math.abs(t), pick.length, dfE, rho) });
      });
      return pairs;
    }
    const raw = [];
    pick.forEach(([i, j]) => {
      const se = Math.sqrt(mse * (1 / groups[i].n + 1 / groups[j].n)), diff = groups[i].mean - groups[j].mean, t = diff / se;
      let p;
      if (method === 'scheffe') p = pF(t * t / (k - 1), k - 1, dfE);
      else p = pT2(t, dfE);
      raw.push(p); pairs.push({ i, j, diff, stat: method === 'scheffe' ? t * t / (k - 1) : t, p });
    });
    if (method === 'holm' || method === 'sidak') adjustP(raw, method).forEach((q, ix) => { pairs[ix].p = q; });
    return pairs;
  }

  // ---------- more two-group tests ----------
  function ksExactUpper(m, n, d) { // P(D >= d), exact lattice-path count (no ties)
    const g = 1e-9, qq = (Math.floor(d * m * n - 1e-7) / (m * n)) + g; // D < d  <=> |i/m - j/n| <= qq
    const u = new Array(n + 1).fill(0);
    for (let j = 0; j <= n; j++) u[j] = (j / n > qq) ? 0 : 1;
    for (let i = 1; i <= m; i++) {
      const w = i / (i + n);
      u[0] = (i / m > qq) ? 0 : w * u[0];
      for (let j = 1; j <= n; j++) u[j] = (Math.abs(i / m - j / n) > qq) ? 0 : w * u[j] + u[j - 1];
    }
    return Math.max(0, Math.min(1, 1 - u[n]));
  }
  function ksTest(a, b) {
    const na = a.length, nb = b.length, all = a.map(v => [v, 0]).concat(b.map(v => [v, 1])).sort((x, y) => x[0] - y[0]);
    let ca = 0, cb = 0, D = 0;
    for (let i = 0; i < all.length;) {
      let j = i; while (j < all.length && all[j][0] === all[i][0]) { all[j][1] ? cb++ : ca++; j++; }
      D = Math.max(D, Math.abs(ca / na - cb / nb)); i = j;
    }
    let p, note;
    if (na * nb <= 40000) { p = ksExactUpper(na, nb, D); note = 'exact p-value'; }
    else {
      const en = Math.sqrt(na * nb / (na + nb)), lam = (en + 0.12 + 0.11 / en) * D; let s = 0;
      for (let j = 1; j <= 100; j++) s += 2 * (j % 2 ? 1 : -1) * Math.exp(-2 * j * j * lam * lam);
      p = Math.max(0, Math.min(1, s)); note = 'asymptotic p-value';
    }
    return { name: 'Kolmogorov–Smirnov test', kind: 'ks', D, p, na, nb, meda: median(a), medb: median(b), note };
  }
  function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
  function permTest(a, b, nperm) {
    nperm = nperm || 10000;
    const na = a.length, nb = b.length, all = a.concat(b), N = all.length, obs = Math.abs(mean(a) - mean(b));
    const r = rng(12345); let ge = 0; const x = all.slice();
    const tot = sum(all);
    for (let it = 0; it < nperm; it++) {
      for (let i = 0; i < na; i++) { const j = i + Math.floor(r() * (N - i)); const t = x[i]; x[i] = x[j]; x[j] = t; }
      let sa = 0; for (let i = 0; i < na; i++) sa += x[i];
      const d = Math.abs(sa / na - (tot - sa) / nb);
      if (d >= obs - 1e-12 * Math.max(1, obs)) ge++;
    }
    return { name: 'Permutation test (difference in means)', kind: 'perm', diff: mean(a) - mean(b), p: (ge + 1) / (nperm + 1), nperm, na, nb, ma: mean(a), mb: mean(b), note: nperm + ' random label shuffles (fixed seed); p = (extreme + 1)/(shuffles + 1)' };
  }
  function fTest(a, b) {
    const va = variance(a), vb = variance(b), F = va / vb, d1 = a.length - 1, d2 = b.length - 1;
    const up = pF(F, d1, d2), p = Math.min(1, 2 * Math.min(up, 1 - up));
    return { name: 'F-test for equal variances', kind: 'ftest', F, df1: d1, df2: d2, p, va, vb, na: a.length, nb: b.length, ratio: F };
  }
  function oneSampleT(a, mu0) {
    const n = a.length, m = mean(a), sd = Math.sqrt(variance(a)), se = sd / Math.sqrt(n), t = (m - mu0) / se, df = n - 1, p = pT2(t, df), crit = qt2(0.05, df);
    return { name: 'One-sample t-test', kind: 'onesample', t, df, p, mean: m, mu0, diff: m - mu0, se, ciLo: m - crit * se, ciHi: m + crit * se, d: (m - mu0) / sd, n };
  }
  function bartlett(groups) {
    const k = groups.length, n = groups.map(g => g.length), v = groups.map(variance), N = sum(n);
    const sp = v.reduce((a, x, i) => a + (n[i] - 1) * x, 0) / (N - k);
    const num = (N - k) * Math.log(sp) - v.reduce((a, x, i) => a + (n[i] - 1) * Math.log(x), 0);
    const c = 1 + (1 / (3 * (k - 1))) * (n.reduce((a, x) => a + 1 / (x - 1), 0) - 1 / (N - k));
    const T = num / c;
    return { T, df: k - 1, p: pChi2(T, k - 1) };
  }

  // ---------- more many-group tests ----------
  function moodMedian(groups) {
    const all = [].concat(...groups), gm = median(all), k = groups.length;
    const above = groups.map(g => g.filter(v => v > gm).length), below = groups.map((g, i) => g.length - above[i]);
    const tA = sum(above), tB = sum(below), N = tA + tB; let chi = 0;
    const yates = k === 2;
    groups.forEach((g, i) => {
      const eA = g.length * tA / N, eB = g.length * tB / N;
      [[above[i], eA], [below[i], eB]].forEach(([o, e]) => { if (e > 0) { let dd = Math.abs(o - e); if (yates) dd = Math.max(0, dd - 0.5); chi += dd * dd / e; } });
    });
    return { name: "Mood's median test", kind: 'median', chi2: chi, df: k - 1, p: pChi2(chi, k - 1), gm, above, below, N, k };
  }
  function jonckheere(groups) {
    const k = groups.length; let J = 0;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) for (const x of groups[i]) for (const y of groups[j]) J += y > x ? 1 : y === x ? 0.5 : 0;
    const n = groups.map(g => g.length), N = sum(n);
    const all = [].concat(...groups), cnt = new Map(); all.forEach(v => cnt.set(v, (cnt.get(v) || 0) + 1));
    const t = [...cnt.values()];
    const f1 = N * (N - 1) * (2 * N + 5) - n.reduce((a, x) => a + x * (x - 1) * (2 * x + 5), 0) - t.reduce((a, x) => a + x * (x - 1) * (2 * x + 5), 0);
    const f2 = n.reduce((a, x) => a + x * (x - 1) * (x - 2), 0) * t.reduce((a, x) => a + x * (x - 1) * (x - 2), 0) / (9 * N * (N - 1) * (N - 2));
    const f3 = n.reduce((a, x) => a + x * (x - 1), 0) * t.reduce((a, x) => a + x * (x - 1), 0) / (2 * N * (N - 1));
    const mu = (N * N - n.reduce((a, x) => a + x * x, 0)) / 4, v = f1 / 72 + f2 + f3, z = (J - mu) / Math.sqrt(v);
    return { name: 'Jonckheere–Terpstra trend test', kind: 'jt', J, mu, z, p: pNorm2(z), pUp: 1 - Phi(z), N, k, dir: z >= 0 ? 'increasing' : 'decreasing' };
  }

  // ---------- correlation & regression ----------
  function pearson(x, y) {
    const n = x.length, mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    const r = sxy / Math.sqrt(sxx * syy), df = n - 2, t = r * Math.sqrt(df / Math.max(1e-300, 1 - r * r));
    const p = Math.abs(r) >= 1 ? 0 : pT2(t, df);
    let lo = NaN, hi = NaN;
    if (n > 3 && Math.abs(r) < 1) { const zr = Math.atanh(r), se = 1 / Math.sqrt(n - 3), zc = qnorm(0.975); lo = Math.tanh(zr - zc * se); hi = Math.tanh(zr + zc * se); }
    const slope = sxy / sxx, icpt = my - slope * mx, sse = syy - slope * sxy, seSlope = Math.sqrt(Math.max(0, sse) / df / sxx);
    return { r, r2: r * r, t, df, p, n, lo, hi, slope, intercept: icpt, seSlope, seIntercept: Math.sqrt(Math.max(0, sse) / df * (1 / n + mx * mx / sxx)), mx, sxx, sse };
  }
  function spearman(x, y) { const rx = rankAvg(x).r, ry = rankAvg(y).r, o = pearson(rx, ry); return { rho: o.r, t: o.t, df: o.df, p: o.p, n: x.length }; }
  function kendall(x, y) {
    const n = x.length; let con = 0, dis = 0, tx = 0, ty = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = Math.sign(x[i] - x[j]), b = Math.sign(y[i] - y[j]);
      if (a === 0 && b === 0) { } else if (a === 0) tx++; else if (b === 0) ty++; else if (a === b) con++; else dis++;
    }
    const n0 = n * (n - 1) / 2, tau = (con - dis) / Math.sqrt((n0 - (tx + 0)) * (n0 - ty));
    const cx = new Map(), cy = new Map(); x.forEach(v => cx.set(v, (cx.get(v) || 0) + 1)); y.forEach(v => cy.set(v, (cy.get(v) || 0) + 1));
    const T = m => [...m.values()];
    const tt = a => a.reduce((s, t) => s + t * (t - 1) / 2, 0), tx2 = tt(T(cx)), ty2 = tt(T(cy));
    const tauB = (con - dis) / Math.sqrt((n0 - tx2) * (n0 - ty2));
    const v0 = n * (n - 1) * (2 * n + 5), vt = T(cx).reduce((s, t) => s + t * (t - 1) * (2 * t + 5), 0), vu = T(cy).reduce((s, t) => s + t * (t - 1) * (2 * t + 5), 0);
    const v1 = T(cx).reduce((s, t) => s + t * (t - 1), 0) * T(cy).reduce((s, t) => s + t * (t - 1), 0) / (2 * n * (n - 1));
    const v2 = T(cx).reduce((s, t) => s + t * (t - 1) * (t - 2), 0) * T(cy).reduce((s, t) => s + t * (t - 1) * (t - 2), 0) / (9 * n * (n - 1) * (n - 2));
    const varS = (v0 - vt - vu) / 18 + v1 + v2, z = (con - dis) / Math.sqrt(varS);
    return { tau: tauB, z, p: pNorm2(z), n };
  }

  const api = { gammaQ, pChi2, qnorm, mannWhitney, wilcoxon, kruskal, dunn, welchAnova, gamesHowell, shapiroWilk, median, lgamma, betai, pT2, pF, qt2, Phi, ptukeyUpper, mean, variance, quantile, describe, tTest, nwayAnova, levene, posthoc, letters, bh, adjustP, pDunnett, posthoc2, ksTest, permTest, fTest, oneSampleT, bartlett, moodMedian, jonckheere, pearson, spearman, kendall, rankAvg, pNorm2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GMStats = api;
})(typeof window !== 'undefined' ? window : globalThis);
