/* GeoSoft Global | Structural Digital Twin walkthrough
   All engineering values here are illustrative teaching values. */
(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const f = (v, d = 1) => (Number.isFinite(v) ? Number(v).toFixed(d) : '—');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function svg(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function stxt(parent, x, y, text, attrs = {}) {
    const t = svg('text', Object.assign({ x, y }, attrs), parent);
    t.textContent = text;
    return t;
  }
  function fitCanvas(cv) {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(20, r.width), h = Math.max(20, r.height);
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
  }
  function utilColor(u) {
    const pass = cssVar('--pass'), lime = '#B8D84A', attn = cssVar('--attn'), orange = cssVar('--orange'), fail = cssVar('--fail');
    if (!Number.isFinite(u)) return cssVar('--steel');
    if (u > 1) return fail;
    if (u <= 0.5) return mix(pass, lime, u / 0.5);
    if (u <= 0.85) return mix(lime, attn, (u - 0.5) / 0.35);
    return mix(attn, orange, (u - 0.85) / 0.15);
  }
  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  const nowStamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
  function isShown(id) { const p = document.getElementById('tab-' + id); return p && !p.hidden; }

  /* ---------- theme ---------- */
  const root = document.documentElement;
  try { const saved = localStorage.getItem('gs-theme'); if (saved) root.dataset.theme = saved; } catch (e) { /* storage unavailable */ }
  $('#themeToggle').addEventListener('click', () => {
    const cur = root.dataset.theme || 'dark';
    root.dataset.theme = cur === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('gs-theme', root.dataset.theme); } catch (e) { /* ignore */ }
    redrawCurrent();
  });

  /* ---------- tabs ---------- */
  const tabs = $$('[role="tab"]');
  const initFns = {}, showFns = {}, redrawFns = {};
  const inited = {};
  let current = 'overview';

  function showTab(id, focus = false) {
    if (!document.getElementById('tab-' + id)) id = 'overview';
    current = id;
    tabs.forEach(t => {
      const on = t.dataset.tab === id;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      if (on) {
        t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        if (focus) t.focus();
      }
    });
    $$('[role="tabpanel"]').forEach(p => { p.hidden = p.id !== 'tab-' + id; });
    if (!inited[id] && initFns[id]) { inited[id] = true; initFns[id](); }
    if (showFns[id]) showFns[id]();
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignore */ }
    const bar = $('.tabbar');
    if (window.scrollY > bar.offsetTop) window.scrollTo({ top: bar.offsetTop, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  function redrawCurrent() { if (redrawFns[current]) redrawFns[current](); }

  tabs.forEach((t, i) => {
    t.setAttribute('aria-controls', 'tab-' + t.dataset.tab);
    t.id = 'tabbtn-' + t.dataset.tab;
    t.addEventListener('click', () => showTab(t.dataset.tab));
    t.addEventListener('keydown', e => {
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
      if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') j = 0;
      if (e.key === 'End') j = tabs.length - 1;
      if (j !== null) { e.preventDefault(); showTab(tabs[j].dataset.tab, true); }
    });
  });
  $$('[role="tabpanel"]').forEach(p => p.setAttribute('aria-labelledby', 'tabbtn-' + p.id.slice(4)));
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-goto]');
    if (g) showTab(g.dataset.goto);
  });
  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(redrawCurrent, 120); });

  /* =========================================================
     BEAM MODEL (shared by lab, design tab, copilot, monitoring)
     ========================================================= */
  const BEAM = {
    L: 8000,          // mm
    E: 210000,        // N/mm2  (EN 1993-1-1 3.2.6)
    I: 29380e4,       // mm4    UKB 457x191x67 (typical table value)
    Wel: 1296e3,      // mm3
    Wpl: 1471e3,      // mm3
    Av: 4094,         // mm2    A - 2btf + (tw+2r)tf
    fy: 355,          // N/mm2  S355, tf <= 16 mm
    gM0: 1.0,
    h: 453.4, b: 189.9, tw: 8.5, tf: 12.7
  };
  BEAM.McRd = BEAM.Wpl * BEAM.fy / BEAM.gM0;                 // N.mm
  BEAM.VplRd = BEAM.Av * BEAM.fy / Math.sqrt(3) / BEAM.gM0;   // N
  const DEFAULTS = { G: 15.66, Q: 12, P: 0, a: 4, lam: 1 };
  const lab = Object.assign({}, DEFAULTS, { probe: null, pinned: false });
  const NPTS = 241;

  function beamAt(x, w, P, a) {
    const { L, E, I } = BEAM;
    let M = w * x * (L - x) / 2;
    let V = w * (L / 2 - x);
    let d = w * x * (L ** 3 - 2 * L * x * x + x ** 3) / (24 * E * I);
    if (P) {
      const b = L - a;
      if (x <= a) {
        M += P * b * x / L; V += P * b / L;
        d += P * b * x * (L * L - b * b - x * x) / (6 * L * E * I);
      } else {
        M += P * a * (L - x) / L; V -= P * a / L;
        d += P * a * (L - x) * (2 * L * x - x * x - a * a) / (6 * L * E * I);
      }
    }
    return [M, V, d];
  }

  function solve(s) {
    const { L } = BEAM;
    const q = s.Q * s.lam;              // kN/m == N/mm
    const Pk = s.P * s.lam * 1000;      // N
    const a = s.a * 1000;
    const wU = 1.35 * s.G + 1.5 * q, PU = 1.5 * Pk;
    const wS = s.G + q, PS = Pk;
    const xs = [], M = [], V = [], D = [], DQ = [];
    for (let i = 0; i < NPTS; i++) {
      const x = L * i / (NPTS - 1);
      const u = beamAt(x, wU, PU, a), sl = beamAt(x, wS, PS, a), lq = beamAt(x, q, PS, a);
      xs.push(x); M.push(u[0]); V.push(u[1]); D.push(sl[2]); DQ.push(lq[2]);
    }
    const iM = M.reduce((bi, v, i) => (Math.abs(v) > Math.abs(M[bi]) ? i : bi), 0);
    const iD = D.reduce((bi, v, i) => (v > D[bi] ? i : bi), 0);
    const MEd = Math.abs(M[iM]);
    const VEd = Math.max(...V.map(Math.abs));
    const dMax = D[iD], dQ = Math.max(...DQ);
    const sigma = MEd / BEAM.Wel;
    const RA = wU * L / 2 + PU * (L - a) / L, RB = wU * L / 2 + PU * a / L;
    const checks = [
      { key: 'bend', name: 'Bending resistance', ref: 'EN 1993-1-1 6.2.5', dem: MEd / 1e6, cap: BEAM.McRd / 1e6, unit: 'kNm' },
      { key: 'shear', name: 'Shear resistance', ref: 'EN 1993-1-1 6.2.6', dem: VEd / 1e3, cap: BEAM.VplRd / 1e3, unit: 'kN' },
      { key: 'dtot', name: 'Deflection, total (SLS)', ref: 'Limit L/250, project spec', dem: dMax, cap: BEAM.L / 250, unit: 'mm' },
      { key: 'dq', name: 'Deflection, imposed (SLS)', ref: 'Limit L/360, project spec', dem: dQ, cap: BEAM.L / 360, unit: 'mm' }
    ];
    checks.forEach(c => { c.u = c.dem / c.cap; });
    const yieldU = sigma / BEAM.fy;
    const gov = checks.reduce((g, c) => (c.u > g.u ? c : g), checks[0]);
    const shearHigh = VEd > 0.5 * BEAM.VplRd;
    let status = gov.u > 1 ? 'FAIL' : gov.u > 0.85 ? 'PASS WITH ATTENTION' : 'PASS';
    if (shearHigh && status !== 'FAIL') status = 'REVIEW REQUIRED';
    return { xs, M, V, D, DQ, iM, iD, MEd, VEd, dMax, dQ, sigma, yieldU, RA, RB, wU, wS, PU, PS, q, Pk, a, checks, gov, status, shearHigh };
  }
  const REF = solve(DEFAULTS);
  let result = solve(lab);

  /* =========================================================
     OVERVIEW: intelligence loop
     ========================================================= */
  const LOOP = [
    ['Capture', 'Reality capture, LiDAR, BIM, GIS and imagery record what physically exists.'],
    ['Model', 'The structural digital twin gives every object one persistent identity.'],
    ['Load', 'Real and hypothetical loads are attached to objects in the scene.'],
    ['Analyze', 'Physics, FEM and AI surrogates compute the structural response.'],
    ['Design', 'Versioned code checks give adequacy and utilization.'],
    ['Monitor', 'Sensors stream live behaviour into the same model.'],
    ['Inspect', 'Periodic and event-driven inspections record defects with evidence.'],
    ['Compare', 'Predicted behaviour is compared with what is observed.'],
    ['Learn', 'Calibration and AI update the model from the differences.'],
    ['Predict', 'Forecast future condition, deterioration and risk.'],
    ['Optimize', 'Test maintenance, strengthening and design options.'],
    ['Decide', 'A qualified engineer approves the action.'],
    ['Update', 'The twin is updated, and the loop repeats.']
  ];
  initFns.overview = () => {
    const s = $('#loopSvg');
    const cx = 230, cy = 230, R = 160;
    svg('circle', { cx, cy, r: R, fill: 'none', style: 'stroke: var(--line)', 'stroke-width': 2 }, s);
    const arc = svg('circle', { cx, cy, r: R, fill: 'none', style: 'stroke: var(--accent)', 'stroke-width': 3, 'stroke-linecap': 'round', transform: `rotate(-90 ${cx} ${cy})` }, s);
    const C = 2 * Math.PI * R;
    arc.setAttribute('stroke-dasharray', `0 ${C}`);
    const hubT = stxt(s, cx, cy - 4, '', { 'text-anchor': 'middle', style: 'fill: var(--text); font: 700 34px var(--font-head)' });
    const hubS = stxt(s, cx, cy + 24, '', { 'text-anchor': 'middle', style: 'fill: var(--muted); font: 500 13px var(--font-body)' });
    stxt(s, cx, cy - 46, 'Structural intelligence loop', { 'text-anchor': 'middle', style: 'fill: var(--muted); font: 600 13px var(--font-head)' });
    const dot = svg('circle', { r: 6, style: 'fill: var(--accent)' }, s);
    const nodes = LOOP.map((n, i) => {
      const ang = -Math.PI / 2 + i * 2 * Math.PI / LOOP.length;
      const x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
      const g = svg('g', { class: 'loop-node', tabindex: 0, role: 'button', 'aria-label': n[0] }, s);
      svg('circle', { cx: x, cy: y, r: 9 }, g);
      const lx = cx + (R + 30) * Math.cos(ang), ly = cy + (R + 30) * Math.sin(ang) + 4;
      stxt(g, lx, ly, n[0], { 'text-anchor': Math.abs(Math.cos(ang)) < 0.2 ? 'middle' : Math.cos(ang) > 0 ? 'start' : 'end' });
      const pick = () => { setIdx(i); paused = performance.now() + 9000; };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      return { g, ang };
    });
    let idx = 0, shownAng = -Math.PI / 2, paused = 0, last = 0;
    function setIdx(i) {
      idx = i;
      nodes.forEach((n, j) => n.g.classList.toggle('on', j === i));
      hubT.textContent = LOOP[i][0];
      hubS.textContent = `Step ${i + 1} of ${LOOP.length}`;
      $('#loopCaption').innerHTML = `<b>${LOOP[i][0]}.</b> ${LOOP[i][1]}`;
      arc.setAttribute('stroke-dasharray', `${C * (i + 1) / LOOP.length} ${C}`);
    }
    setIdx(0);
    function placeDot(a) { dot.setAttribute('cx', cx + R * Math.cos(a)); dot.setAttribute('cy', cy + R * Math.sin(a)); }
    placeDot(shownAng);
    function tick(t) {
      if (!isShown('overview')) { running = false; return; }
      if (t > paused && t - last > 2200) { last = t; setIdx((idx + 1) % LOOP.length); }
      let target = nodes[idx].ang;
      while (target < shownAng - Math.PI) target += 2 * Math.PI;
      while (target > shownAng + Math.PI) target -= 2 * Math.PI;
      shownAng += (target - shownAng) * 0.08;
      placeDot(shownAng);
      requestAnimationFrame(tick);
    }
    let running = false;
    showFns.overview = () => { if (!reduceMotion && !running) { running = true; requestAnimationFrame(tick); } };
  };

  /* =========================================================
     ROADMAP
     ========================================================= */
  const STAGES = [
    { t: 'Visual twin', d: '3D models, BIM and point clouds in the browser. It looks right, but it makes no engineering claims. Every asset at this level is quality level D: visualization only.', q: 'What is it and what does it look like?', tags: ['3D scene', 'Point clouds', 'BIM / IFC', 'GIS', 'Asset metadata'], here: true },
    { t: 'Engineering twin', d: 'Each part gets engineering data: material, section, loads and supports. The twin generates an analysis model and sends it to a solver. This is MVP 1.', q: 'What loads it and how does it behave?', tags: ['Structural object model', 'Materials & sections', 'Load cases', 'Solver integration', 'Stress / strain / deflection', 'Provenance'] },
    { t: 'Design twin', d: 'Code checks turn results into adequacy: demand/capacity ratios, pass or fail, with every clause and intermediate value traceable. Optimization follows.', q: 'Is it safe and does it comply?', tags: ['Design code engine', 'Adequacy dashboard', 'Utilization', 'Optimization'] },
    { t: 'Operational twin', d: 'Sensors and inspections feed the same model, so it shows how the structure behaves now and how it has changed. This is MVP 2.', q: 'How is it behaving now and what has changed?', tags: ['Sensors & IoT', 'Live states', 'Inspections', 'Defects', 'As-designed vs as-built', 'Alerts'] },
    { t: 'Predictive twin', d: 'Physics plus data plus AI detect anomalies, calibrate the model, forecast deterioration and rank interventions. This is MVP 3 and the R&D programme, and it is the ultimate objective.', q: 'What will happen next and what should we do?', tags: ['Anomaly detection', 'Calibration', 'What-if', 'Predictive maintenance', 'AI copilot', 'Surrogates'] }
  ];
  initFns.roadmap = () => {
    const btns = $$('.stage');
    function set(i) {
      btns.forEach((b, j) => { b.classList.toggle('active', j === i); b.classList.toggle('done', j < i); b.setAttribute('aria-pressed', j === i); });
      $('#stageFill').style.width = (i / 4 * 100) + '%';
      const s = STAGES[i];
      $('#stageDetail').innerHTML = `<h3>Stage ${i + 1}: ${s.t}${s.here ? '<span class="here">GeoSoft today</span>' : ''}</h3><p>${s.d}</p><p><b>New question answered:</b> ${s.q}</p><div class="tags">${s.tags.map(t => `<span>${t}</span>`).join('')}</div>`;
    }
    btns.forEach((b, i) => b.addEventListener('click', () => { clearInterval(auto); set(i); }));
    set(0);
    let k = 0;
    const auto = reduceMotion ? null : setInterval(() => { k++; if (k > 4) { clearInterval(auto); set(0); return; } set(k); }, 1500);
  };

  /* =========================================================
     LAYERS + KNOWLEDGE GRAPH
     ========================================================= */
  const LAYERS = [
    { n: 'Reality', t: 'Layer 1: Reality', p: 'Establishes the actual physical condition and geometry of the asset.', s: 'Terrestrial, mobile and aerial LiDAR, photogrammetry, drones, bathymetry, ROV, imagery, inspection photos, video, point clouds and reality meshes.' },
    { n: 'Geometry', t: 'Layer 2: Geometry', p: 'Represents what the asset is made of as objects: members, surfaces, solids, connections, foundations, equipment, architectural and MEP interactions.', s: 'IFC, Revit, CAD formats, point clouds, 3D Tiles, OpenUSD where appropriate and GeoSoft-native structures.' },
    { n: 'Engineering', t: 'Layer 3: Engineering model', p: 'Turns geometry into engineering objects with sections, materials, releases, supports, effective lengths, reinforcement, connection stiffness and soil parameters.', s: 'Derived from layers 1 and 2, section libraries, material standards and engineer input.' },
    { n: 'Simulation', t: 'Simulation and results', p: 'Load cases, combinations, solver runs, stress, strain, deflection, buckling, dynamics and code checks, each stored as an immutable, versioned result.', s: 'Native engine, open-source and commercial solvers, HPC/GPU jobs and labelled AI surrogates.' },
    { n: 'Monitoring', t: 'Monitoring and inspection', p: 'Live sensor behaviour, inspections, defects and events, compared continuously with predictions.', s: 'IoT gateways, SensorThings/MQTT streams, inspection apps, drones and ROVs.' }
  ];
  initFns.layers = () => {
    const s = $('#layerStack');
    const cx = 230, gap = 74, base = 412;
    const P = (y0, u, v) => [cx + (u - v) * 88, y0 + (u + v) * 28];
    const groups = [];
    LAYERS.forEach((L, i) => {
      const y0 = base - i * gap;
      const wrap = svg('g', { class: 'layer' }, s);
      const g = svg('g', { tabindex: 0, role: 'button', 'aria-label': L.t }, wrap);
      const pts = [P(y0, -1, -1), P(y0, 1, -1), P(y0, 1, 1), P(y0, -1, 1)].map(p => p.join(',')).join(' ');
      svg('polygon', { points: pts, style: `fill: color-mix(in srgb, var(--surface-2) 88%, transparent); stroke: var(--line)`, 'stroke-width': 1.5 }, g);
      if (i === 0) {
        for (let k = 0; k < 90; k++) { const u = Math.random() * 1.8 - 0.9, v = Math.random() * 1.8 - 0.9; const [x, y] = P(y0, u, v); svg('circle', { cx: x, cy: y, r: 1.6, style: `fill: color-mix(in srgb, var(--sensor) ${Math.round(Math.random() * 100)}%, var(--accent))` }, g); }
      } else if (i === 1) {
        for (let k = -0.6; k <= 0.61; k += 0.4) {
          svg('line', { x1: P(y0, k, -0.8)[0], y1: P(y0, k, -0.8)[1], x2: P(y0, k, 0.8)[0], y2: P(y0, k, 0.8)[1], style: 'stroke: var(--steel)', 'stroke-width': 1.2 }, g);
          svg('line', { x1: P(y0, -0.8, k)[0], y1: P(y0, -0.8, k)[1], x2: P(y0, 0.8, k)[0], y2: P(y0, 0.8, k)[1], style: 'stroke: var(--steel)', 'stroke-width': 1.2 }, g);
        }
      } else if (i === 2) {
        [-0.6, 0, 0.6].forEach(u => {
          svg('line', { x1: P(y0, u, -0.6)[0], y1: P(y0, u, -0.6)[1], x2: P(y0, u, 0.6)[0], y2: P(y0, u, 0.6)[1], style: 'stroke: var(--attn)', 'stroke-width': 2.5 }, g);
          [-0.6, 0.6].forEach(v => { const [x, y] = P(y0, u, v); svg('circle', { cx: x, cy: y, r: 4, style: 'fill: var(--attn)' }, g); });
        });
      } else if (i === 3) {
        const cols = ['--pass', '--pass', '--attn', '--orange', '--fail', '--attn', '--pass'];
        cols.forEach((c, k) => {
          const u0 = -0.9 + k * 1.8 / cols.length, u1 = u0 + 1.8 / cols.length;
          const pp = [P(y0, u0, -0.5), P(y0, u1, -0.5), P(y0, u1, 0.5), P(y0, u0, 0.5)].map(p => p.join(',')).join(' ');
          svg('polygon', { points: pp, style: `fill: var(${c}); opacity: 0.75` }, g);
        });
      } else {
        [[-0.5, -0.4], [0.3, -0.5], [0.6, 0.4], [-0.3, 0.5], [0, 0]].forEach(([u, v], k) => {
          const [x, y] = P(y0, u, v);
          const c = svg('circle', { cx: x, cy: y, r: 4, style: 'fill: none; stroke: var(--sensor)', 'stroke-width': 2 }, g);
          svg('circle', { cx: x, cy: y, r: 3, style: 'fill: var(--sensor)' }, g);
          if (!reduceMotion) {
            svg('animate', { attributeName: 'r', values: '4;14', dur: '1.8s', begin: `${k * 0.35}s`, repeatCount: 'indefinite' }, c);
            svg('animate', { attributeName: 'opacity', values: '1;0', dur: '1.8s', begin: `${k * 0.35}s`, repeatCount: 'indefinite' }, c);
          }
        });
      }
      stxt(g, cx + 190, y0 + 5, L.n, { style: 'fill: var(--text); font: 600 15px var(--font-head)' });
      const pick = () => select(i);
      g.addEventListener('click', pick);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      groups.push(g);
    });
    // vertical sync line
    svg('line', { x1: cx - 176, y1: base, x2: cx - 176, y2: base - 4 * gap, style: 'stroke: var(--accent)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, s);
    stxt(s, cx - 186, base - 2 * gap, 'one identity', { 'text-anchor': 'middle', transform: `rotate(-90 ${cx - 186} ${base - 2 * gap})`, style: 'fill: var(--accent); font: 600 12px var(--font-head)' });
    function select(i) {
      groups.forEach((g, j) => {
        const dy = j > i ? -26 : j < i ? 26 : 0;
        g.style.transform = `translate(${j === i ? 18 : 0}px, ${dy}px)`;
        g.style.opacity = j === i ? 1 : 0.5;
      });
      const L = LAYERS[i];
      $('#layerDetail').innerHTML = `<h3>${L.t}</h3><p>${L.p}</p><h4>Sources and formats</h4><p>${L.s}</p>`;
    }
    select(0);

    // knowledge graph
    const K = $('#kgSvg');
    const N = [
      ['Structure: Warehouse A', 100, 50], ['Level 2', 100, 150], ['Column C-12', 100, 270], ['Beam B-204', 470, 230],
      ['Connection J-31', 230, 400], ['Sensor SG-01', 640, 70], ['Inspection 2025', 800, 170], ['Defect D-17', 800, 300],
      ['Analysis model AM-B204', 330, 80], ['Combination ULS-1', 470, 380], ['Result R-5120', 660, 420], ['Code check 6.2.5', 820, 430],
      ['Recommendation R-88', 640, 335], ['Scan PC-2025-07', 260, 320]
    ];
    const E = [[0, 1, 'contains'], [1, 2, 'contains'], [1, 3, 'contains'], [2, 4, 'joined at'], [3, 4, 'joined at'], [3, 5, 'monitored by'],
      [3, 6, 'inspected in'], [6, 7, 'found'], [7, 3, 'located on'], [3, 8, 'idealized as'], [8, 9, 'analysed for'], [9, 10, 'produced'],
      [10, 11, 'checked by'], [11, 12, 'informs'], [7, 12, 'informs'], [3, 13, 'evidence'], [10, 3, 'result for']];
    const eg = svg('g', {}, K), lg = svg('g', {}, K), ng = svg('g', {}, K);
    const edges = E.map(([a, b, lab]) => {
      const [, x1, y1] = N[a], [, x2, y2] = N[b];
      const line = svg('line', { x1, y1, x2, y2, class: 'kg-edge' }, eg);
      const t = stxt(lg, (x1 + x2) / 2, (y1 + y2) / 2 - 5, lab, { class: 'kg-elabel', 'text-anchor': 'middle' });
      return { a, b, line, t };
    });
    const nodes = N.map(([name, x, y], i) => {
      const w = name.length * 6.9 + 22;
      const g = svg('g', { class: 'kg-node', tabindex: 0, role: 'button', 'aria-label': name }, ng);
      svg('rect', { x: x - w / 2, y: y - 15, width: w, height: 30, rx: 6 }, g);
      stxt(g, x, y + 4.5, name, { 'text-anchor': 'middle' });
      const pick = () => sel(i);
      g.addEventListener('click', pick);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      return g;
    });
    function sel(i) {
      const nb = new Set();
      edges.forEach(e => {
        const on = e.a === i || e.b === i;
        e.line.classList.toggle('on', on); e.line.classList.toggle('dim', !on);
        e.t.classList.toggle('on', on);
        if (on) nb.add(e.a === i ? e.b : e.a);
      });
      nodes.forEach((g, j) => { g.classList.toggle('on', j === i); g.classList.toggle('nb', nb.has(j)); g.classList.toggle('dim', j !== i && !nb.has(j)); });
      const rel = edges.filter(e => e.a === i || e.b === i).map(e => e.a === i ? `${e.t.textContent} <b>${N[e.b][0]}</b>` : `<b>${N[e.a][0]}</b> ${e.t.textContent} it`);
      $('#kgInfo').innerHTML = `<b>${N[i][0]}</b>: ${rel.join('; ')}.`;
    }
    sel(3);
  };

  /* =========================================================
     CONVERT: 3D model -> analysis model
     ========================================================= */
  const CONV_STEPS = [
    ['Reality capture', 'A laser scan records the floor bay as millions of points. This is evidence of what exists, but it has no engineering meaning yet.'],
    ['BIM geometry', 'The BIM model (IFC) is aligned to the scan. Columns, beam and slab are now objects with classes and properties.'],
    ['Object recognition', 'The beam is identified as IfcBeam B-204 and checked against the scan. Deviation from the scan is within 4 mm, so the geometry is trusted.'],
    ['Analytical idealization', 'The solid beam becomes a centreline between column nodes N1 and N2. The span is measured node to node: 8.000 m.'],
    ['Boundary conditions', 'Simple shear connections at both columns are idealized as a pin and a roller. The slab is assumed to restrain the top flange laterally: flagged for the engineer.'],
    ['Section and material', 'Scanned depth 453 mm and width 190 mm match UKB 457×191×67 in the section library. Steel grade S355 comes from the IFC property set.'],
    ['Loads', 'Tributary width 3.0 m from the slab layout. Slab self-weight from its IFC thickness, imposed load from the office occupancy rule. Loads are attached to B-204 as objects.'],
    ['Analysis model ready', 'Analysis model AM-B204 v3 is generated with ULS and SLS combinations. Quality level B: engineering validated, with assumptions listed.']
  ];
  const PARAMS = [
    [1, 'Element class', 'IfcBeam', 'ifc'], [1, 'Member ID', 'B-204', 'ifc'],
    [2, 'Scan fit deviation', '≤ 4 mm', 'scan'],
    [3, 'Span L', '8.000 m', 'scan'], [3, 'Element type', 'Euler–Bernoulli beam', 'rule'],
    [4, 'Supports', 'Pin (N1), roller (N2)', 'rule'], [4, 'Lateral restraint', 'Full, by slab', 'assume'],
    [5, 'Section', 'UKB 457×191×67', 'lib'], [5, 'I_y', '29 380 cm⁴', 'lib'], [5, 'W_el,y / W_pl,y', '1296 / 1471 cm³', 'lib'],
    [5, 'Steel grade', 'S355', 'ifc'], [5, 'f_y', '355 MPa (t_f ≤ 16 mm)', 'rule'], [5, 'E', '210 GPa', 'rule'],
    [6, 'Tributary width', '3.00 m', 'scan'], [6, 'Slab 150 mm RC', '3.75 kN/m²', 'rule'], [6, 'Finishes & services', '1.25 kN/m²', 'assume'],
    [6, 'G_k (incl. 0.66 self-wt)', '15.66 kN/m', 'rule'], [6, 'Office, cat. B + partitions', '3.0 + 1.0 kN/m²', 'rule'], [6, 'Q_k', '12.00 kN/m', 'rule'],
    [7, 'ULS combination', '1.35G + 1.5Q (6.10)', 'rule'], [7, 'Deflection limits', 'L/250 total, L/360 imposed', 'assume'], [7, 'Twin quality level', 'B (3 assumptions open)', 'rule']
  ];
  const SRC_LABEL = { ifc: 'BIM / IFC', scan: 'Scan geometry', lib: 'Library match', rule: 'Code / rule', assume: 'Assumption' };

  initFns.convert = () => {
    const s = $('#convertSvg');
    const X0 = 150, Y0 = 400, SX = 64, SY = 28, SXY = 36, SZ = 60;
    const P = (x, y, z) => [X0 + x * SX + y * SXY, Y0 - z * SZ - y * SY];
    const pt = (x, y, z) => P(x, y, z).join(',');
    const poly = (arr, style, parent, extra = {}) => svg('polygon', Object.assign({ points: arr.map(p => pt(...p)).join(' '), style }, extra), parent);
    function box(x0, x1, y0, y1, z0, z1, parent, tone = '--steel') {
      const g = svg('g', {}, parent);
      poly([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], `fill: color-mix(in srgb, var(${tone}) 75%, var(--bg)); stroke: var(--bg); stroke-width: 0.6`, g);
      poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], `fill: color-mix(in srgb, var(${tone}) 50%, var(--bg)); stroke: var(--bg); stroke-width: 0.6`, g);
      poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], `fill: color-mix(in srgb, var(${tone}) 90%, white); stroke: var(--bg); stroke-width: 0.6`, g);
      return g;
    }
    const defs = svg('defs', {}, s);
    const clip = svg('clipPath', { id: 'scanClip' }, defs);
    const clipRect = svg('rect', { x: 0, y: 0, width: 900, height: 470 }, clip);
    const hatch = svg('pattern', { id: 'tribHatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    svg('line', { x1: 0, y1: 0, x2: 0, y2: 8, style: 'stroke: var(--accent)', 'stroke-width': 3 }, hatch);

    // ground grid
    const grid = svg('g', { opacity: 0.5 }, s);
    for (let x = -1; x <= 9; x++) svg('line', { x1: P(x, -2.5, 0)[0], y1: P(x, -2.5, 0)[1], x2: P(x, 2.5, 0)[0], y2: P(x, 2.5, 0)[1], style: 'stroke: var(--line)', 'stroke-width': 0.8 }, grid);
    for (let y = -2.5; y <= 2.5; y += 1) svg('line', { x1: P(-1, y, 0)[0], y1: P(-1, y, 0)[1], x2: P(9, y, 0)[0], y2: P(9, y, 0)[1], style: 'stroke: var(--line)', 'stroke-width': 0.8 }, grid);

    const zb0 = 3.05, zb1 = 3.5, zs1 = 3.65;
    // solids
    const gSolids = svg('g', { class: 'cv-face' }, s);
    const gCols = svg('g', {}, gSolids);
    box(-0.15, 0.15, -0.15, 0.15, 0, zb1, gCols);
    box(7.85, 8.15, -0.15, 0.15, 0, zb1, gCols);
    const gBeam = svg('g', {}, gSolids);
    box(0.15, 7.85, -0.095, 0.095, zb0, zb1, gBeam);
    const gSlab = svg('g', { class: 'cv-face' }, s);
    const slabStyle = 'fill: color-mix(in srgb, var(--steel) 35%, transparent); stroke: var(--steel); stroke-width: 1';
    poly([[-0.6, -2.2, zb1], [8.6, -2.2, zb1], [8.6, -2.2, zs1], [-0.6, -2.2, zs1]], slabStyle, gSlab);
    poly([[-0.6, -2.2, zs1], [8.6, -2.2, zs1], [8.6, 2.2, zs1], [-0.6, 2.2, zs1]], slabStyle, gSlab);
    const trib = poly([[-0.6, -1.5, zs1], [8.6, -1.5, zs1], [8.6, 1.5, zs1], [-0.6, 1.5, zs1]], 'fill: url(#tribHatch); opacity: 0.55; stroke: var(--accent); stroke-width: 1.5', s, { class: 'cv-fade' });

    // beam highlight outline
    const hl = svg('g', { class: 'cv-fade' }, s);
    poly([[0.15, -0.095, zb0], [7.85, -0.095, zb0], [7.85, -0.095, zb1], [0.15, -0.095, zb1]], 'fill: color-mix(in srgb, var(--accent) 35%, transparent); stroke: var(--accent); stroke-width: 2.5', hl);

    // point cloud
    const gPC = svg('g', { 'clip-path': 'url(#scanClip)' }, s);
    const rnd = (a, b) => a + Math.random() * (b - a);
    function cloudBox(x0, x1, y0, y1, z0, z1, n) {
      for (let k = 0; k < n; k++) {
        const face = Math.random();
        let p;
        if (face < 0.45) p = [rnd(x0, x1), y0, rnd(z0, z1)];
        else if (face < 0.75) p = [rnd(x0, x1), rnd(y0, y1), z1];
        else p = [x1, rnd(y0, y1), rnd(z0, z1)];
        const [x, y] = P(...p);
        const pc = Math.round(clamp(p[2] / 3.7, 0, 1) * 100);
        svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 1.25, style: `fill: color-mix(in srgb, var(--accent) ${pc}%, var(--sensor))` }, gPC);
      }
    }
    cloudBox(-0.15, 0.15, -0.15, 0.15, 0, zb1, 130);
    cloudBox(7.85, 8.15, -0.15, 0.15, 0, zb1, 130);
    cloudBox(0.15, 7.85, -0.095, 0.095, zb0, zb1, 260);
    cloudBox(-0.6, 8.6, -2.2, 2.2, zb1, zs1, 420);
    for (let k = 0; k < 180; k++) { const [x, y] = P(rnd(-1, 9), rnd(-2.5, 2.5), 0); svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 1, style: 'fill: var(--steel)', opacity: 0.6 }, gPC); }
    const scanLine = svg('line', { x1: 0, y1: 30, x2: 0, y2: 460, class: 'scan-line cv-fade' }, s);

    // labels (BIM classes)
    const gBimLabels = svg('g', { class: 'cv-fade' }, s);
    const lab1 = (x, y, z, t, dx = 8, dy = -8) => { const [px, py] = P(x, y, z); svg('line', { x1: px, y1: py, x2: px + dx, y2: py + dy, style: 'stroke: var(--muted)' }, gBimLabels); stxt(gBimLabels, px + dx + (dx < 0 ? -4 : 4), py + dy + 4, t, { class: 'cv-small', 'text-anchor': dx < 0 ? 'end' : 'start' }); };
    lab1(-0.15, -0.15, 1.6, 'IfcColumn C-12', -18, 24);
    lab1(8.15, -0.15, 1.6, 'IfcColumn C-13', 14, 20);
    lab1(4, 2.2, zs1, 'IfcSlab S-02 (t = 150 mm)', 10, -18);

    // recognition tag
    const tag = svg('g', { class: 'cv-tag cv-fade' }, s);
    { const [px, py] = P(4, -0.095, zb0); svg('line', { x1: px, y1: py, x2: px, y2: py + 46, style: 'stroke: var(--accent)', 'stroke-width': 1.5 }, tag); svg('rect', { x: px - 92, y: py + 46, width: 184, height: 26, rx: 4 }, tag); stxt(tag, px, py + 64, 'IfcBeam  B-204  ·  matched', { 'text-anchor': 'middle' }); }

    // centreline + nodes
    const gCL = svg('g', { class: 'cv-fade' }, s);
    const zc = (zb0 + zb1) / 2;
    const n1 = P(0, 0, zc), n2 = P(8, 0, zc);
    const cl = svg('line', { x1: n1[0], y1: n1[1], x2: n2[0], y2: n2[1], class: 'cv-cl' }, gCL);
    const clLen = Math.hypot(n2[0] - n1[0], n2[1] - n1[1]);
    cl.setAttribute('stroke-dasharray', clLen); cl.setAttribute('stroke-dashoffset', clLen);
    cl.style.transition = 'stroke-dashoffset 1.2s ease';
    svg('circle', { cx: n1[0], cy: n1[1], r: 7, class: 'cv-node' }, gCL);
    svg('circle', { cx: n2[0], cy: n2[1], r: 7, class: 'cv-node' }, gCL);
    stxt(gCL, n1[0] - 14, n1[1] - 12, 'N1', { class: 'cv-label', 'text-anchor': 'end' });
    stxt(gCL, n2[0] + 14, n2[1] - 12, 'N2', { class: 'cv-label' });
    { const a = P(0, -0.9, 0.2), b = P(8, -0.9, 0.2);
      svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], style: 'stroke: var(--attn)', 'stroke-width': 1.2 }, gCL);
      [a, b].forEach(p => svg('line', { x1: p[0], y1: p[1] - 7, x2: p[0], y2: p[1] + 7, style: 'stroke: var(--attn)', 'stroke-width': 1.2 }, gCL));
      stxt(gCL, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 20, 'L = 8.000 m (node to node)', { class: 'cv-small', 'text-anchor': 'middle', style: 'fill: var(--attn)' }); }

    // supports
    const gSup = svg('g', { class: 'cv-fade' }, s);
    function pin(x, y, roller) {
      svg('polygon', { points: `${x},${y + 8} ${x - 13},${y + 30} ${x + 13},${y + 30}`, style: 'fill: none; stroke: var(--text)', 'stroke-width': 2 }, gSup);
      if (roller) { svg('circle', { cx: x - 7, cy: y + 36, r: 5, style: 'fill: none; stroke: var(--text)', 'stroke-width': 2 }, gSup); svg('circle', { cx: x + 7, cy: y + 36, r: 5, style: 'fill: none; stroke: var(--text)', 'stroke-width': 2 }, gSup); }
      svg('line', { x1: x - 20, y1: y + (roller ? 43 : 32), x2: x + 20, y2: y + (roller ? 43 : 32), style: 'stroke: var(--text)', 'stroke-width': 2 }, gSup);
    }
    pin(n1[0], n1[1], false); pin(n2[0], n2[1], true);
    stxt(gSup, n1[0], n1[1] + 62, 'Pin', { class: 'cv-small', 'text-anchor': 'middle' });
    stxt(gSup, n2[0], n2[1] + 66, 'Roller', { class: 'cv-small', 'text-anchor': 'middle' });

    // section callout
    const gSec = svg('g', { class: 'cv-fade' }, s);
    { const bx = 700, by = 318;
      svg('rect', { x: bx, y: by, width: 190, height: 120, rx: 6, style: 'fill: var(--surface); stroke: var(--violet)', 'stroke-width': 1.5 }, gSec);
      const cxs = bx + 40, top = by + 20, H = 80, B = 36, tf = 6, tw = 4;
      svg('path', { d: `M${cxs - B / 2},${top} h${B} v${tf} h${-(B - tw) / 2} v${H - 2 * tf} h${(B - tw) / 2} v${tf} h${-B} v${-tf} h${(B - tw) / 2} v${-(H - 2 * tf)} h${-(B - tw) / 2} z`, style: 'fill: color-mix(in srgb, var(--violet) 40%, transparent); stroke: var(--violet)', 'stroke-width': 1.5 }, gSec);
      stxt(gSec, bx + 76, by + 34, 'UKB 457×191×67', { class: 'cv-label' });
      stxt(gSec, bx + 76, by + 54, 'h 453.4  b 189.9', { class: 'cv-small' });
      stxt(gSec, bx + 76, by + 72, 'tw 8.5  tf 12.7', { class: 'cv-small' });
      stxt(gSec, bx + 76, by + 92, 'S355  E 210 GPa', { class: 'cv-small' });
      stxt(gSec, bx + 76, by + 110, 'library match 98%', { class: 'cv-small', style: 'fill: var(--violet)' }); }

    // loads
    const gLoad = svg('g', { class: 'cv-fade' }, s);
    const arrows = svg('g', { class: reduceMotion ? '' : 'arrow-anim' }, gLoad);
    for (let i = 0; i <= 16; i++) {
      const x = i * 0.5; const [px, py] = P(x, 0, zs1 + 0.05);
      svg('line', { x1: px, y1: py - 44, x2: px, y2: py - 8, class: 'udl-arrow' }, arrows);
      svg('polygon', { points: `${px - 4},${py - 10} ${px + 4},${py - 10} ${px},${py - 2}`, class: 'udl-head' }, arrows);
    }
    { const a = P(0, 0, zs1 + 0.05), b = P(8, 0, zs1 + 0.05);
      svg('line', { x1: a[0], y1: a[1] - 44, x2: b[0], y2: b[1] - 44, class: 'udl-arrow' }, arrows);
      stxt(gLoad, (a[0] + b[0]) / 2, a[1] - 56, 'G_k 15.66 kN/m + Q_k 12.00 kN/m on B-204', { class: 'cv-label', 'text-anchor': 'middle' });
      const t1 = P(-0.6, 1.5, zs1), t2 = P(-0.6, -1.5, zs1);
      stxt(gLoad, t1[0] - 8, t1[1] + 4, 'tributary 3.0 m', { class: 'cv-small', 'text-anchor': 'end', style: 'fill: var(--accent)' }); }

    // ready banner
    const gReady = svg('g', { class: 'cv-fade' }, s);
    svg('rect', { x: 30, y: 24, width: 300, height: 58, rx: 6, style: 'fill: var(--pass); opacity: 0.16; stroke: var(--pass)' }, gReady);
    stxt(gReady, 46, 48, 'Analysis model AM-B204 v3 ready', { class: 'cv-label' });
    stxt(gReady, 46, 68, '2 nodes · 1 element · 2 cases · 2 combinations', { class: 'cv-small' });

    // step chips
    const ol = $('#convSteps');
    CONV_STEPS.forEach((st, i) => { const li = document.createElement('li'); li.textContent = i + 1; li.title = st[0]; li.tabIndex = 0; li.addEventListener('click', () => { stopPlay(); setStep(i); }); li.addEventListener('keydown', e => { if (e.key === 'Enter') { stopPlay(); setStep(i); } }); ol.appendChild(li); });

    // param table
    const tb = $('#paramTable tbody');
    const rows = PARAMS.map(p => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${p[1]}</td><td>${p[2]}</td><td><span class="src src-${p[3]}">${SRC_LABEL[p[3]]}</span></td>`; tb.appendChild(tr); return { tr, step: p[0] }; });

    let step = -1, scanRAF = null;
    function show(g, on, op = 1) { g.style.opacity = on ? op : 0; }
    function setStep(n) {
      const prev = step; step = n;
      $$('li', ol).forEach((li, i) => { li.classList.toggle('cur', i === n); li.classList.toggle('done', i < n); });
      $('#convCaption').innerHTML = `<b>${n + 1}. ${CONV_STEPS[n][0]}</b>${CONV_STEPS[n][1]}`;
      // point cloud
      gPC.style.transition = 'opacity 0.8s';
      gPC.style.opacity = n === 0 ? 1 : n === 1 ? 0.45 : n === 2 ? 0.3 : 0.12;
      gSolids.style.opacity = n === 0 ? 0 : n >= 3 ? 0.18 : 1;
      gBeam.style.opacity = 1;
      gCols.style.opacity = n === 2 ? 0.4 : 1;
      gSlab.style.opacity = n === 0 ? 0 : n === 2 ? 0.15 : n >= 3 ? (n === 6 ? 0.35 : 0.08) : 0.9;
      show(gBimLabels, n === 1 || n === 2);
      show(hl, n === 2);
      show(tag, n === 2);
      show(gCL, n >= 3);
      cl.setAttribute('stroke-dashoffset', n >= 3 ? 0 : clLen);
      show(gSup, n >= 4);
      show(gSec, n >= 5, n === 5 ? 1 : 0.55);
      show(gLoad, n >= 6);
      show(trib, n === 6, 0.55);
      show(gReady, n === 7);
      show(scanLine, false);
      // table rows
      rows.forEach(r => {
        const on = r.step <= n;
        const wasOn = r.tr.classList.contains('on');
        r.tr.classList.toggle('on', on);
        if (on && !wasOn) { r.tr.classList.add('flash'); setTimeout(() => r.tr.classList.remove('flash'), 900); }
      });
      // scan sweep
      cancelAnimationFrame(scanRAF);
      if (n === 0 && !reduceMotion && prev !== 0) {
        const t0 = performance.now();
        show(scanLine, true);
        const sweep = t => { const k = clamp((t - t0) / 1800, 0, 1); const x = 60 + k * 800; clipRect.setAttribute('width', x); scanLine.setAttribute('x1', x); scanLine.setAttribute('x2', x); if (k < 1) scanRAF = requestAnimationFrame(sweep); else show(scanLine, false); };
        clipRect.setAttribute('width', 0); scanRAF = requestAnimationFrame(sweep);
      } else clipRect.setAttribute('width', 900);
    }
    let playT = null;
    function stopPlay() { clearInterval(playT); playT = null; $('#convPlay').textContent = 'Play conversion'; }
    $('#convPlay').addEventListener('click', () => {
      if (playT) { stopPlay(); return; }
      $('#convPlay').textContent = 'Pause';
      if (step >= CONV_STEPS.length - 1) setStep(0);
      playT = setInterval(() => { if (step >= CONV_STEPS.length - 1 || !isShown('convert')) { stopPlay(); return; } setStep(step + 1); }, 2800);
    });
    $('#convNext').addEventListener('click', () => { stopPlay(); setStep(Math.min(step + 1, CONV_STEPS.length - 1)); });
    $('#convPrev').addEventListener('click', () => { stopPlay(); setStep(Math.max(step - 1, 0)); });
    setStep(0);

    initLab();
  };

  /* =========================================================
     ANALYSIS LAB
     ========================================================= */
  let labDraw = () => {};
  function initLab() {
    const ids = { lambda: 'lam', gk: 'G', qk: 'Q', pk: 'P', pa: 'a' };
    const outs = {
      lambda: v => f(v, 2) + '×', gk: v => f(v, 2) + ' kN/m', qk: v => f(v, 2) + ' kN/m', pk: v => f(v, 0) + ' kN', pa: v => f(v, 2) + ' m'
    };
    function syncOutputs() {
      for (const id in ids) { $('#' + id).value = lab[ids[id]]; $('#' + id + 'Out').textContent = outs[id](lab[ids[id]]); }
    }
    for (const id in ids) {
      $('#' + id).addEventListener('input', e => { lab[ids[id]] = parseFloat(e.target.value); $('#' + id + 'Out').textContent = outs[id](lab[ids[id]]); stopRamp(); update(); });
    }
    syncOutputs();

    const cvB = $('#beamCanvas'), cvM = $('#bmCanvas'), cvV = $('#sfCanvas'), cvD = $('#dfCanvas'), cvS = $('#secCanvas');
    let cur = { M: result.M.slice(), V: result.V.slice(), D: result.D.slice() };
    let geo = null;

    function update() {
      result = solve(lab);
      if (reduceMotion) cur = { M: result.M.slice(), V: result.V.slice(), D: result.D.slice() };
      $('#wEd').textContent = f(result.wU, 2) + ' kN/m';
      $('#wSls').textContent = f(result.wS, 2) + ' kN/m';
      $('#mMax').textContent = 'max ' + f(result.MEd / 1e6, 1) + ' kNm';
      $('#vMax').textContent = 'max ' + f(result.VEd / 1e3, 1) + ' kN';
      $('#dMax').textContent = 'max ' + f(result.dMax, 1) + ' mm';
      renderChecks(); renderProv(); updateDesignTab();
      if (reduceMotion) drawAll(0);
    }

    function renderChecks() {
      const r = result;
      const ul = $('#checks');
      const items = r.checks.map(c => {
        const col = utilColor(c.u);
        return `<li class="${c.u > 1 ? 'chk-fail' : ''}" data-k="${c.key}"><div class="chk-top"><b>${c.name}</b><span class="num">${f(c.u, 2)}</span></div>
          <div class="chk-ref">${f(c.dem, 1)} / ${f(c.cap, 1)} ${c.unit} · ${c.ref}</div>
          <div class="ubar"><i style="width:${clamp(c.u / 1.25 * 100, 0, 100)}%;background:${col}"></i></div></li>`;
      });
      items.push(`<li><div class="chk-top"><b>First yield, elastic (info)</b><span class="num">${f(r.yieldU, 2)}</span></div>
        <div class="chk-ref">σ = M/W<sub>el</sub> = ${f(r.sigma, 0)} MPa vs f<sub>y</sub> 355 MPa · not a limit for a class 1 section</div>
        <div class="ubar"><i style="width:${clamp(r.yieldU / 1.25 * 100, 0, 100)}%;background:${utilColor(r.yieldU)}"></i></div></li>`);
      items.push(`<li><div class="chk-top"><b>Section classification</b><span class="num">Class 1</span></div><div class="chk-ref">Flange c/t = 6.3 ≤ 9ε = 7.3; web c/t = 48 ≤ 72ε = 58.6 · Table 5.2</div></li>`);
      ul.innerHTML = items.join('');
      const st = $('#overallStatus');
      st.textContent = r.status;
      st.className = 'status ' + (r.status === 'FAIL' ? 'fail' : r.status === 'PASS' ? 'pass' : 'attn');
      $('#assumeNote').textContent = 'Not checked: lateral-torsional buckling, assumed fully restrained by the slab (assumption, engineer to confirm).' + (r.shearHigh ? ' V_Ed exceeds 0.5 V_pl,Rd, so bending–shear interaction (6.2.8) needs review.' : '');
    }

    function inputsString() { return JSON.stringify({ G: lab.G, Q: lab.Q, P: lab.P, a: lab.a, lam: lab.lam, sec: 'UKB457x191x67', mat: 'S355', L: 8.0 }); }
    function renderProv() {
      const items = [
        ['Model', 'AM-B204 v3'], ['Geometry', 'IFC rev C + scan PC-2025-07'], ['Section', 'UKB 457×191×67 (lib 2026.1)'], ['Material', 'S355, EN 10025-2'],
        ['Loads', `G ${f(lab.G, 2)}, Q ${f(lab.Q, 2)}×${f(lab.lam, 2)}, P ${f(lab.P * lab.lam, 0)} kN`], ['Combinations', 'ULS 6.10, SLS characteristic'], ['Boundary conditions', 'Pin + roller'], ['Solver', 'Closed-form E–B beam, demo 0.1'],
        ['Code', 'EN 1993-1-1:2005, recommended values'], ['Result tier', 'Tier 2: simplified physics'], ['Inputs hash', fnv(inputsString())], ['Engineer', 'Not yet reviewed']
      ];
      $('#provGrid').innerHTML = items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    }

    let runN = 0;
    $('#recordRun').addEventListener('click', () => {
      const log = $('#runLog');
      const empty = log.querySelector('.empty'); if (empty) empty.remove();
      runN++;
      const li = document.createElement('li');
      li.textContent = `#${String(runN).padStart(3, '0')}  ${nowStamp()}  λ=${f(lab.lam, 2)}  M_Ed=${f(result.MEd / 1e6, 1)} kNm  δ=${f(result.dMax, 1)} mm  gov=${result.gov.name} ${f(result.gov.u, 2)}  ${result.status}  hash ${fnv(inputsString())}`;
      log.prepend(li);
    });

    // ramp
    let rampRAF = null;
    function stopRamp() { if (rampRAF) { cancelAnimationFrame(rampRAF); rampRAF = null; $('#ramp').disabled = false; } }
    $('#ramp').addEventListener('click', () => {
      stopRamp();
      if (result.gov.u > 1) { lab.lam = 0; }
      $('#ramp').disabled = true;
      const stepFn = () => {
        lab.lam = Math.min(3.5, lab.lam + 0.008);
        result = solve(lab);
        $('#lambda').value = lab.lam; $('#lambdaOut').textContent = f(lab.lam, 2) + '×';
        if (result.gov.u > 1 || lab.lam >= 3.5) {
          rampRAF = null; $('#ramp').disabled = false; update();
          const li = $(`#checks li[data-k="${result.gov.key}"]`);
          if (li) li.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
          $('#assumeNote').textContent = `First check to fail at λ = ${f(lab.lam, 2)}: ${result.gov.name} (${result.gov.ref}). ` + $('#assumeNote').textContent;
          return;
        }
        update();
        rampRAF = requestAnimationFrame(stepFn);
      };
      rampRAF = requestAnimationFrame(stepFn);
    });
    $('#resetLab').addEventListener('click', () => { stopRamp(); Object.assign(lab, DEFAULTS); lab.pinned = false; lab.probe = null; syncOutputs(); update(); });

    // probe interaction
    function xFromEvent(e) {
      if (!geo) return null;
      const r = cvB.getBoundingClientRect();
      const px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      return clamp((px - geo.x0) / (geo.x1 - geo.x0), 0, 1) * BEAM.L;
    }
    cvB.addEventListener('mousemove', e => { if (!lab.pinned) { lab.probe = xFromEvent(e); if (reduceMotion) drawAll(0); } });
    cvB.addEventListener('mouseleave', () => { if (!lab.pinned) { lab.probe = null; if (reduceMotion) drawAll(0); } });
    cvB.addEventListener('click', e => { lab.pinned = !lab.pinned || Math.abs(xFromEvent(e) - lab.probe) > 200; lab.probe = xFromEvent(e); if (reduceMotion) drawAll(0); });
    cvB.addEventListener('touchstart', e => { lab.pinned = true; lab.probe = xFromEvent(e); }, { passive: true });

    function probeIndex() { const x = lab.probe == null ? result.xs[result.iM] : lab.probe; return Math.round(x / BEAM.L * (NPTS - 1)); }

    /* ----- drawing ----- */
    function drawBeam(t) {
      const { ctx, w, h } = fitCanvas(cvB);
      const x0 = 56, x1 = w - 56, by = h * 0.52, bh = 16;
      geo = { x0, x1 };
      const span = x1 - x0;
      const pxPerMm = 52 / (BEAM.L / 250);
      const text = cssVar('--text'), muted = cssVar('--muted'), red = cssVar('--fail'), line = cssVar('--line');
      const X = i => x0 + span * i / (NPTS - 1);
      const Y = i => by + clamp(cur.D[i] * pxPerMm, -10, h * 0.3);

      // undeformed
      ctx.setLineDash([5, 5]); ctx.strokeStyle = muted; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, by); ctx.lineTo(x1, by); ctx.stroke(); ctx.setLineDash([]);

      // loads
      const phase = reduceMotion ? 0 : (Math.sin(t / 260) + 1) * 3;
      const wRatio = clamp(result.wU / REF.wU, 0, 3);
      const aLen = 16 + 20 * Math.min(wRatio, 2.2);
      ctx.strokeStyle = red; ctx.fillStyle = red; ctx.lineWidth = 1.6;
      if (result.wU > 0.01) {
        const n = Math.max(8, Math.round(span / 34));
        ctx.beginPath(); ctx.moveTo(x0, Y(0) - bh / 2 - aLen - 6 + phase); ctx.lineTo(x1, Y(NPTS - 1) - bh / 2 - aLen - 6 + phase); ctx.stroke();
        for (let k = 0; k <= n; k++) {
          const i = Math.round(k / n * (NPTS - 1));
          const xx = X(i), yy = Y(i) - bh / 2 - 4 + phase;
          ctx.beginPath(); ctx.moveTo(xx, yy - aLen); ctx.lineTo(xx, yy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(xx - 4, yy - 6); ctx.lineTo(xx + 4, yy - 6); ctx.lineTo(xx, yy); ctx.fill();
        }
        ctx.font = '600 13px ' + cssVar('--font-num'); ctx.fillStyle = text; ctx.textAlign = 'left';
        ctx.fillText(`w_Ed = ${f(result.wU, 1)} kN/m (ULS)`, x0, Y(0) - bh / 2 - aLen - 16);
      }
      if (result.PU > 1) {
        const i = Math.round(result.a / BEAM.L * (NPTS - 1)), xx = X(i), yy = Y(i) - bh / 2 - 4 + phase * 1.4;
        const len = 46 + 30 * Math.min(result.PU / 2e5, 1.5);
        ctx.strokeStyle = cssVar('--orange'); ctx.fillStyle = cssVar('--orange'); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(xx, yy - len); ctx.lineTo(xx, yy - 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xx - 8, yy - 12); ctx.lineTo(xx + 8, yy - 12); ctx.lineTo(xx, yy); ctx.fill();
        ctx.font = '600 13px ' + cssVar('--font-num'); ctx.textAlign = 'center';
        ctx.fillText(`P_Ed = ${f(result.PU / 1000, 0)} kN`, xx, yy - len - 8);
      }

      // beam coloured by stress ratio
      for (let i = 0; i < NPTS - 1; i++) {
        const u = Math.abs(cur.M[i]) / BEAM.Wel / BEAM.fy;
        ctx.fillStyle = utilColor(u);
        ctx.beginPath();
        ctx.moveTo(X(i), Y(i) - bh / 2); ctx.lineTo(X(i + 1) + 0.6, Y(i + 1) - bh / 2);
        ctx.lineTo(X(i + 1) + 0.6, Y(i + 1) + bh / 2); ctx.lineTo(X(i), Y(i) + bh / 2); ctx.fill();
      }
      ctx.strokeStyle = text; ctx.lineWidth = 1;
      ctx.beginPath(); for (let i = 0; i < NPTS; i++) ctx[i ? 'lineTo' : 'moveTo'](X(i), Y(i) - bh / 2); ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < NPTS; i++) ctx[i ? 'lineTo' : 'moveTo'](X(i), Y(i) + bh / 2); ctx.stroke();

      // supports
      ctx.strokeStyle = text; ctx.lineWidth = 2;
      const sup = (x, roller) => {
        const y = by + bh / 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 12, y + 20); ctx.lineTo(x + 12, y + 20); ctx.closePath(); ctx.stroke();
        if (roller) { ctx.beginPath(); ctx.arc(x - 6, y + 25, 4.5, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 6, y + 25, 4.5, 0, 7); ctx.stroke(); }
        const gy = y + (roller ? 31 : 22);
        ctx.beginPath(); ctx.moveTo(x - 20, gy); ctx.lineTo(x + 20, gy); ctx.stroke();
      };
      sup(x0, false); sup(x1, true);

      // reactions
      ctx.strokeStyle = cssVar('--pass'); ctx.fillStyle = cssVar('--pass'); ctx.lineWidth = 2.5;
      [[x0, result.RA, 'R_A'], [x1, result.RB, 'R_B']].forEach(([x, R, n]) => {
        const yb = by + bh / 2 + 82, yt = by + bh / 2 + 42;
        ctx.beginPath(); ctx.moveTo(x, yb); ctx.lineTo(x, yt + 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 6, yt + 9); ctx.lineTo(x + 6, yt + 9); ctx.lineTo(x, yt); ctx.fill();
        ctx.font = '600 12px ' + cssVar('--font-num'); ctx.textAlign = 'center';
        ctx.fillText(`${n} ${f(R / 1000, 1)} kN`, x, yb + 15);
      });

      // span dimension
      ctx.fillStyle = muted; ctx.font = '12px ' + cssVar('--font-num'); ctx.textAlign = 'center';
      ctx.fillText('L = 8.000 m  ·  UKB 457×191×67  ·  S355', (x0 + x1) / 2, h - 10);
      const exag = pxPerMm / (span / BEAM.L);
      ctx.textAlign = 'right'; ctx.fillText(`deformation ×${f(exag, 0)}`, x1, by + bh / 2 + 112 > h - 26 ? h - 26 : by + bh / 2 + 112);

      // probe
      const pi = probeIndex();
      if (lab.probe != null) {
        const xx = X(pi);
        ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 1.2; ctx.setLineDash(lab.pinned ? [] : [4, 3]);
        ctx.beginPath(); ctx.moveTo(xx, 8); ctx.lineTo(xx, h - 24); ctx.stroke(); ctx.setLineDash([]);
        const sig = Math.abs(result.M[pi]) / BEAM.Wel;
        const lines = [`x = ${f(result.xs[pi] / 1000, 2)} m`, `M = ${f(result.M[pi] / 1e6, 1)} kNm`, `V = ${f(result.V[pi] / 1e3, 1)} kN`, `δ = ${f(result.D[pi], 2)} mm`, `σ = ${f(sig, 0)} MPa`, `ε = ${f(sig / BEAM.E * 1e6, 0)} µε`];
        const bw = 132, bhh = lines.length * 16 + 12;
        let bx = xx + 12; if (bx + bw > w - 4) bx = xx - 12 - bw;
        ctx.fillStyle = cssVar('--surface-2'); ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, 10, bw, bhh, 6) : ctx.rect(bx, 10, bw, bhh); ctx.fill(); ctx.stroke();
        ctx.fillStyle = text; ctx.font = '12px ' + cssVar('--font-num'); ctx.textAlign = 'left';
        lines.forEach((l, k) => ctx.fillText(l, bx + 10, 28 + k * 16));
      }
      ctx.strokeStyle = line;
    }

    function drawDiagram(cv, arr, ref, opts) {
      const { ctx, w, h } = fitCanvas(cv);
      const x0 = 12, x1 = w - 12, span = x1 - x0;
      const maxAbs = Math.max(...arr.map(Math.abs), 1e-9);
      let axisY, avail;
      if (opts.two) { axisY = h / 2; avail = h / 2 - 14; }
      else { axisY = 16; avail = h - 34; }
      const sc = Math.min(0.5 * avail / ref, 0.95 * avail / maxAbs);
      const col = opts.color;
      const Y = v => axisY + (opts.two ? -v : v) * sc;
      ctx.fillStyle = col + '33'; ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, axisY);
      arr.forEach((v, i) => ctx.lineTo(x0 + span * i / (arr.length - 1), Y(v)));
      ctx.lineTo(x1, axisY); ctx.closePath(); ctx.fill();
      ctx.beginPath(); arr.forEach((v, i) => ctx[i ? 'lineTo' : 'moveTo'](x0 + span * i / (arr.length - 1), Y(v))); ctx.stroke();
      ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, axisY); ctx.lineTo(x1, axisY); ctx.stroke();
      if (opts.limit) {
        const ly = Y(opts.limit.v);
        if (ly < h - 2) {
          ctx.setLineDash([6, 4]); ctx.strokeStyle = cssVar('--fail');
          ctx.beginPath(); ctx.moveTo(x0, ly); ctx.lineTo(x1, ly); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = cssVar('--fail'); ctx.font = '11px ' + cssVar('--font-num'); ctx.textAlign = 'right';
          ctx.fillText(opts.limit.label, x1, ly - 4);
        }
      }
      const pi = probeIndex();
      const px = x0 + span * pi / (arr.length - 1);
      ctx.strokeStyle = cssVar('--accent'); ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, 4); ctx.lineTo(px, h - 4); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = cssVar('--text'); ctx.font = '600 11px ' + cssVar('--font-num'); ctx.textAlign = px > w / 2 ? 'right' : 'left';
      const val = opts.fmt(arr[pi]);
      ctx.fillText(val, px + (px > w / 2 ? -6 : 6), opts.two ? 14 : h - 8);
    }

    function drawSection() {
      const { ctx, w, h } = fitCanvas(cvS);
      const pi = probeIndex();
      $('#probeX').textContent = f(result.xs[pi] / 1000, 2) + ' m';
      const M = result.M[pi];
      const sig = M / BEAM.Wel;                 // extreme fibre, elastic
      const top = 30, H = h - 66, mid = top + H / 2;
      const text = cssVar('--text'), muted = cssVar('--muted'), comp = cssVar('--accent'), tens = cssVar('--orange');
      // I-section
      const sx = 34, B = Math.min(70, w * 0.13), tf = H * BEAM.tf / BEAM.h, tw = Math.max(3, B * BEAM.tw / BEAM.b);
      ctx.fillStyle = cssVar('--steel'); ctx.strokeStyle = text; ctx.lineWidth = 1;
      ctx.fillRect(sx, top, B, tf); ctx.fillRect(sx, top + H - tf, B, tf); ctx.fillRect(sx + B / 2 - tw / 2, top, tw, H);
      ctx.setLineDash([4, 3]); ctx.strokeStyle = muted;
      ctx.beginPath(); ctx.moveTo(sx - 10, mid); ctx.lineTo(w - 14, mid); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = muted; ctx.font = '11px ' + cssVar('--font-num'); ctx.textAlign = 'left';
      ctx.fillText('NA', sx - 10, mid - 5);
      ctx.fillText('457×191×67', sx - 6, top + H + 20);

      function diagram(ox, width, valTop, unit, title, capVal) {
        const zero = ox + width / 2;
        const maxV = Math.max(Math.abs(valTop), capVal * 1.2);
        const k = (width / 2 - 6) / maxV;
        ctx.strokeStyle = muted; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(zero, top - 6); ctx.lineTo(zero, top + H + 6); ctx.stroke();
        // capped shape for stress if exceeds fy
        const N = 40;
        const vals = [];
        for (let j = 0; j <= N; j++) {
          const y = top + H * j / N;
          const lin = valTop * (1 - 2 * j / N);  // +top ... -bottom
          let v = lin;
          if (capVal && Math.abs(lin) > capVal) v = Math.sign(lin) * capVal;
          vals.push([y, v]);
        }
        ['top', 'bot'].forEach(part => {
          ctx.beginPath(); ctx.moveTo(zero, part === 'top' ? top : mid);
          vals.filter(([y]) => (part === 'top' ? y <= mid : y >= mid)).forEach(([y, v]) => ctx.lineTo(zero - v * k, y));
          ctx.lineTo(zero, part === 'top' ? mid : top + H); ctx.closePath();
          const c = (part === 'top') === (valTop >= 0) ? comp : tens;
          ctx.fillStyle = c + '55'; ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
        });
        if (capVal) {
          ctx.setLineDash([3, 3]); ctx.strokeStyle = cssVar('--fail');
          [-1, 1].forEach(sg => { const x = zero + sg * capVal * k; ctx.beginPath(); ctx.moveTo(x, top - 4); ctx.lineTo(x, top + H + 4); ctx.stroke(); });
          ctx.setLineDash([]);
        }
        ctx.fillStyle = text; ctx.font = '600 12px ' + cssVar('--font-head'); ctx.textAlign = 'center';
        ctx.fillText(title, zero, 16);
        ctx.font = '11px ' + cssVar('--font-num');
        const tv = capVal ? Math.min(Math.abs(valTop), capVal) : Math.abs(valTop);
        ctx.fillStyle = valTop >= 0 ? comp : tens;
        ctx.fillText(`${valTop >= 0 ? '−' : '+'}${f(tv, 0)} ${unit}`, zero - (valTop >= 0 ? 1 : -1) * (width / 4), top + 12);
        ctx.fillStyle = valTop >= 0 ? tens : comp;
        ctx.fillText(`${valTop >= 0 ? '+' : '−'}${f(tv, 0)} ${unit}`, zero + (valTop >= 0 ? 1 : -1) * (width / 4), top + H - 2);
      }
      const area0 = sx + B + 26, avail = w - area0 - 10;
      diagram(area0, avail / 2 - 8, sig, 'MPa', 'Bending stress σ', BEAM.fy);
      diagram(area0 + avail / 2 + 8, avail / 2 - 8, sig / BEAM.E * 1e6, 'µε', 'Strain ε (elastic)', 0);
      ctx.fillStyle = muted; ctx.font = '11px ' + cssVar('--font-body'); ctx.textAlign = 'left';
      const note = Math.abs(sig) > BEAM.fy ? 'Outer fibres yielded: stress capped at f_y (dashed), plastic reserve in use.' : 'Compression above the neutral axis, tension below (sagging).';
      ctx.fillText(note, area0, h - 6);
    }

    function drawAll(t) {
      drawBeam(t);
      drawDiagram(cvM, cur.M, REF.MEd, { color: cssVar('--accent'), fmt: v => f(v / 1e6, 1) + ' kNm', limit: { v: BEAM.McRd, label: 'M_c,Rd 522.2' } });
      drawDiagram(cvV, cur.V, Math.max(...REF.V.map(Math.abs)), { color: cssVar('--violet'), two: true, fmt: v => f(v / 1e3, 1) + ' kN' });
      drawDiagram(cvD, cur.D, REF.dMax, { color: cssVar('--sensor'), fmt: v => f(v, 2) + ' mm', limit: { v: BEAM.L / 250, label: 'L/250 = 32 mm' } });
      drawSection();
    }

    let loopOn = false;
    function loop(t) {
      if (!isShown('convert')) { loopOn = false; return; }
      ['M', 'V', 'D'].forEach(k => { const a = cur[k], b = result[k]; for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * 0.18; });
      drawAll(t);
      requestAnimationFrame(loop);
    }
    labDraw = () => { if (reduceMotion) drawAll(0); else if (!loopOn) { loopOn = true; requestAnimationFrame(loop); } };
    update();
    labDraw();
  }
  showFns.convert = () => labDraw();
  redrawFns.convert = () => labDraw();

  /* =========================================================
     DESIGN TAB (linked to lab state)
     ========================================================= */
  const ADEQ = [
    ['C-12', 'Combined axial + bending, 6.3.3', 0.91, 'PASS WITH ATTENTION', 'attn'],
    ['BR-07', 'Flexural buckling, 6.3.1', 1.08, 'FAIL', 'fail'],
    ['J-31', 'Bolt group shear; detail differs from scan', 0.78, 'REVIEW REQUIRED', 'review'],
    ['B-310', 'Steel grade unknown', NaN, 'INSUFFICIENT DATA', 'data'],
    ['S-02', 'Slab not yet modelled', NaN, 'NOT ANALYZED', 'none']
  ];
  function updateDesignTab() {
    if (!inited.design) return;
    const r = result, b = r.checks[0];
    $('#calcBox').innerHTML = `
      <div class="c-ref">EN 1993-1-1 6.2.5(2), class 1 section</div>
      M<sub>c,Rd</sub> = W<sub>pl,y</sub> · f<sub>y</sub> / γ<sub>M0</sub><br>
      W<sub>pl,y</sub> = 1471 cm³ <span class="c-ref">(section library, UKB 457×191×67)</span><br>
      f<sub>y</sub> = 355 N/mm² <span class="c-ref">(EN 10025-2, t<sub>f</sub> = 12.7 mm ≤ 16 mm)</span><br>
      γ<sub>M0</sub> = 1.00 <span class="c-ref">(recommended value; national annex may differ)</span><br>
      M<sub>c,Rd</sub> = 1471×10³ × 355 / 1.00 = <b>522.2 kNm</b><br>
      M<sub>Ed</sub> = <b>${f(b.dem, 1)} kNm</b> <span class="c-ref">(ULS 6.10, λ = ${f(lab.lam, 2)}, at x = ${f(r.xs[r.iM] / 1000, 2)} m)</span><br>
      <span class="c-res">M<sub>Ed</sub> / M<sub>c,Rd</sub> = ${f(b.u, 3)} ${b.u <= 1 ? '≤' : '>'} 1.0 → ${b.u <= 1 ? 'satisfied' : 'not satisfied'}</span>`;
    $('#calcLive').textContent = `${f(b.dem, 1)} / 522.2 kNm`;
    $('#resLive').textContent = `Utilization ${f(b.u, 2)}`;
    const rows = [['B-204', `${r.gov.name}, ${r.gov.ref}`, r.gov.u, r.status, r.status === 'FAIL' ? 'fail' : r.status === 'PASS' ? 'pass' : 'attn']].concat(ADEQ);
    $('#adequacyTable tbody').innerHTML = rows.map(([m, c, u, st, cls]) => `<tr><td><b>${m}</b></td><td>${c}</td><td>${Number.isFinite(u) ? `<div class="ad-bar"><div class="ubar"><i style="width:0;background:${utilColor(u)}" data-w="${clamp(u / 1.25 * 100, 0, 100)}"></i></div><span class="num">${f(u, 2)}</span></div>` : '<span class="num">—</span>'}</td><td><span class="st st-${cls}">${st}</span></td></tr>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => $$('#adequacyTable i[data-w]').forEach(i => { i.style.width = i.dataset.w + '%'; })));
  }
  initFns.design = () => {
    inited.design = true; updateDesignTab();
    const lis = $$('#codePath li');
    if (!reduceMotion) lis.forEach((li, i) => setTimeout(() => { li.classList.add('lit'); setTimeout(() => li.classList.remove('lit'), 600); }, i * 160));
  };
  showFns.design = () => updateDesignTab();

  /* =========================================================
     LOADS TAB
     ========================================================= */
  function flowDiagram(svgEl, labels, opts = {}) {
    const W = 900, n = labels.length, gap = opts.gap || 14, bw = (W - gap * (n - 1) - 8) / n, bh = opts.bh || 64, y = opts.y || 28;
    const boxes = labels.map((l, i) => {
      const x = 4 + i * (bw + gap);
      if (i < n - 1) svg('line', { x1: x + bw, y1: y + bh / 2, x2: x + bw + gap, y2: y + bh / 2, class: 'flow-line' }, svgEl);
      const g = svg('g', { class: 'flow-box' }, svgEl);
      svg('rect', { x, y, width: bw, height: bh, rx: 6 }, g);
      const lines = Array.isArray(l) ? l : [l];
      lines.forEach((t, k) => stxt(g, x + bw / 2, y + bh / 2 + 5 + (k - (lines.length - 1) / 2) * 16, t, { 'text-anchor': 'middle', style: k ? 'font: 500 11px var(--font-num); fill: var(--muted)' : '' }));
      return { g, cx: x + bw / 2, x, y };
    });
    svg('line', { x1: boxes[0].cx, y1: y + bh + 14, x2: boxes[n - 1].cx, y2: y + bh + 14, class: 'flow-line', 'stroke-dasharray': '3 5' }, svgEl);
    const dot = svg('circle', { r: 6, class: 'flow-dot', cy: y + bh + 14 }, svgEl);
    let start = performance.now();
    const dur = opts.dur || 900;
    function tick(t) {
      if (!svgEl.isConnected || svgEl.closest('[hidden]')) { running = false; return; }
      const total = dur * n;
      const k = ((t - start) % total) / dur;
      const i = Math.floor(k), fr = k - i;
      const a = boxes[i], b = boxes[Math.min(i + 1, n - 1)];
      dot.setAttribute('cx', a.cx + (b.cx - a.cx) * Math.min(1, fr * 1.4));
      boxes.forEach((bx, j) => bx.g.classList.toggle('on', j === i));
      requestAnimationFrame(tick);
    }
    let running = false;
    return () => { if (reduceMotion) { boxes.forEach(b => b.g.classList.add('on')); dot.remove(); return; } if (!running) { running = true; requestAnimationFrame(tick); } };
  }
  const COMBOS = [
    { id: 'ULS-1', name: 'ULS, imposed leading', clause: 'EN 1990 6.4.3.2, eq. (6.10)', terms: ['1.35 G', '+ 1.5 Q', '+ 1.5 × 0.6 W'], factors: 'γG = 1.35, γQ = 1.5, ψ0,W = 0.6', cases: 'LC1 G, LC2 Q (cat. B), LC3 W', assume: 'Permanent actions unfavourable', type: 'Linear static' },
    { id: 'ULS-2', name: 'ULS, wind leading', clause: 'EN 1990 6.4.3.2, eq. (6.10)', terms: ['1.35 G', '+ 1.5 W', '+ 1.5 × 0.7 Q'], factors: 'γG = 1.35, γQ = 1.5, ψ0,Q = 0.7', cases: 'LC1 G, LC2 Q, LC3 W', assume: 'Permanent actions unfavourable; check 1.0 G for uplift separately', type: 'Linear static' },
    { id: 'SLS-C', name: 'SLS characteristic', clause: 'EN 1990 6.5.3, eq. (6.14b)', terms: ['G', '+ Q', '+ 0.6 W'], factors: 'ψ0,W = 0.6', cases: 'LC1 G, LC2 Q, LC3 W', assume: 'Irreversible limit states', type: 'Linear static' },
    { id: 'SLS-F', name: 'SLS frequent', clause: 'EN 1990 6.5.3, eq. (6.15b)', terms: ['G', '+ 0.5 Q', '+ 0.0 W'], factors: 'ψ1,Q = 0.5, ψ2,W = 0', cases: 'LC1 G, LC2 Q, LC3 W', assume: 'Reversible limit states', type: 'Linear static' },
    { id: 'SLS-QP', name: 'SLS quasi-permanent', clause: 'EN 1990 6.5.3, eq. (6.16b)', terms: ['G', '+ 0.3 Q'], factors: 'ψ2,Q = 0.3', cases: 'LC1 G, LC2 Q', assume: 'Long-term effects, appearance', type: 'Linear static' },
    { id: 'ACC-1', name: 'Accidental', clause: 'EN 1990 6.4.3.3, eq. (6.11b)', terms: ['G', '+ A_d', '+ 0.5 Q', '+ 0.0 W'], factors: 'ψ1,Q = 0.5, ψ2,W = 0', cases: 'LC1 G, LC4 A_d impact, LC2 Q, LC3 W', assume: 'Impact load from project risk study', type: 'Linear static, member removal optional' }
  ];
  initFns.loads = () => {
    const start = flowDiagram($('#loadPath'), [['Selected object', 'B-204'], ['Applied loads', 'G, Q, W'], ['Load cases', 'LC1–LC4'], ['Combinations', 'ULS / SLS / ACC'], ['Structural response', 'M, V, δ, σ']], { bh: 70, y: 22, dur: 1000 });
    showFns.loads = start; start();
    const tabsEl = $('#comboTabs');
    COMBOS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'btn btn-small'; b.type = 'button'; b.textContent = c.id + ': ' + c.name;
      b.addEventListener('click', () => sel(i));
      tabsEl.appendChild(b);
    });
    function sel(i) {
      $$('button', tabsEl).forEach((b, j) => { b.classList.toggle('is-on', j === i); b.setAttribute('aria-pressed', j === i); });
      const c = COMBOS[i];
      $('#comboOut').innerHTML = `<h3>${c.id}: ${c.name}</h3>
        <div class="combo-formula">${c.terms.map((t, k) => `<span style="animation-delay:${k * 0.15}s">${t}&nbsp;</span>`).join('')}</div>
        <dl class="combo-fields">
          <div><dt>Code</dt><dd>EN 1990:2002 + A1:2005</dd></div>
          <div><dt>Edition / annex</dt><dd>Annex A1, recommended values</dd></div>
          <div><dt>Clause</dt><dd>${c.clause}</dd></div>
          <div><dt>Factors</dt><dd>${c.factors}</dd></div>
          <div><dt>Participating cases</dt><dd>${c.cases}</dd></div>
          <div><dt>Assumptions</dt><dd>${c.assume}</dd></div>
          <div><dt>Units</dt><dd>kN, m</dd></div>
          <div><dt>Analysis type</dt><dd>${c.type}</dd></div>
          <div><dt>Status</dt><dd>Implemented, pending independent verification</dd></div>
        </dl>`;
    }
    sel(0);
  };

  /* =========================================================
     ANALYSIS TAB
     ========================================================= */
  initFns.analysis = () => {
    const start = flowDiagram($('#pipeSvg'), [['Digital', 'twin'], ['Engineering', 'model'], ['Model', 'generator'], ['Solver'], ['Results', 'database'], ['3D result', 'view'], ['Code', 'check'], ['Engineering', 'decision']].map(a => a.length > 1 ? [a[0] + ' ' + a[1]] : a), { bh: 80, y: 34, gap: 12, dur: 750 });
    // make labels fit: rewrite text into two lines
    $$('#pipeSvg .flow-box text').forEach(t => {
      const words = t.textContent.split(' ');
      if (words.length > 1) {
        const x = t.getAttribute('x'), y = parseFloat(t.getAttribute('y'));
        t.textContent = '';
        words.forEach((w, k) => { const ts = svg('tspan', { x, y: y - 8 + k * 16 }, t); ts.textContent = w; });
      }
    });
    showFns.analysis = () => { start(); startMode(); };
    $('#rcTime').textContent = nowStamp();

    // mode shapes
    const BETA = [1.8751, 4.6941, 7.8548];
    function phi(m, xi) {
      const b = BETA[m], s = (Math.cosh(b) + Math.cos(b)) / (Math.sinh(b) + Math.sin(b));
      return Math.cosh(b * xi) - Math.cos(b * xi) - s * (Math.sinh(b * xi) - Math.sin(b * xi));
    }
    let mode = 0, mRun = false;
    const norm = BETA.map((_, m) => { let mx = 0; for (let i = 0; i <= 50; i++) mx = Math.max(mx, Math.abs(phi(m, i / 50))); return mx; });
    $$('#modeButtons button').forEach(b => b.addEventListener('click', () => { mode = +b.dataset.mode; $$('#modeButtons button').forEach(x => x.classList.toggle('is-on', x === b)); if (reduceMotion) drawMode(300); }));
    function drawMode(t) {
      const cv = $('#modeCanvas'); const { ctx, w, h } = fitCanvas(cv);
      const base = h - 30, top = 26, H = base - top, cx = w / 2;
      const amp = Math.min(70, w * 0.16);
      const rate = [1, 2.2, 3.4][mode];
      const s = reduceMotion ? 1 : Math.sin(t / 1000 * 2 * Math.PI * 0.6 * rate);
      // ground hatch
      ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx - 60, base); ctx.lineTo(cx + 60, base); ctx.stroke();
      for (let k = -60; k < 60; k += 10) { ctx.beginPath(); ctx.moveTo(cx + k, base); ctx.lineTo(cx + k - 8, base + 10); ctx.stroke(); }
      ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx, top); ctx.stroke(); ctx.setLineDash([]);
      const pts = [];
      for (let i = 0; i <= 60; i++) { const xi = i / 60; const d = phi(mode, xi) / norm[mode]; pts.push([cx + d * amp * s, base - xi * H, Math.abs(d)]); }
      for (let i = 0; i < pts.length - 1; i++) {
        ctx.strokeStyle = utilColor(pts[i][2] * Math.abs(s) * 1.05); ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
      }
      for (let k = 1; k <= 10; k++) { const p = pts[k * 6]; ctx.strokeStyle = cssVar('--text'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p[0] - 22, p[1]); ctx.lineTo(p[0] + 22, p[1]); ctx.stroke(); }
      ctx.fillStyle = cssVar('--text'); ctx.font = '600 13px ' + cssVar('--font-head'); ctx.textAlign = 'left';
      ctx.fillText(`Mode ${mode + 1}`, 14, 22);
      ctx.fillStyle = cssVar('--muted'); ctx.font = '12px ' + cssVar('--font-num');
      ctx.fillText(`f${mode + 1}/f1 = ${f((BETA[mode] / BETA[0]) ** 2, 2)}`, 14, 40);
      ctx.fillText('animation slowed', 14, 56);
    }
    function modeLoop(t) { if (!isShown('analysis')) { mRun = false; return; } drawMode(t); requestAnimationFrame(modeLoop); }
    function startMode() { if (reduceMotion) drawMode(300); else if (!mRun) { mRun = true; requestAnimationFrame(modeLoop); } }
    redrawFns.analysis = () => { if (reduceMotion) drawMode(300); };
  };

  /* =========================================================
     MONITORING TAB
     ========================================================= */
  initFns.monitor = () => {
    const cv = $('#monCanvas');
    const N = 240, data = [];
    const base = 584;          // µε, estimated dead + sustained imposed strain
    let mode = 'normal', extra = 0, tk = 0, faultV = null;
    function sample() {
      tk++;
      if (mode === 'overload') extra = Math.min(900, extra + 18); else extra = Math.max(0, extra - 25);
      if (mode === 'fault') { if (faultV == null) faultV = 2600; return Math.random() < 0.15 ? NaN : faultV + (Math.random() - 0.5) * 2; }
      faultV = null;
      return base + 55 * Math.sin(tk / 38) + (Math.random() - 0.5) * 16 + extra;
    }
    for (let i = 0; i < N; i++) data.push(sample());
    const TH = [['Watch', 0.5], ['Warning', 0.7], ['Critical', 0.9]];
    const strainForU = u => u * BEAM.McRd / BEAM.Wel / BEAM.E * 1e6;
    function stateFor(v) {
      if (mode === 'fault') return ['Sensor fault', 's-fault'];
      if (!Number.isFinite(v)) return ['Data unavailable', 's-na'];
      const u = (v / 1e6) * BEAM.E * BEAM.Wel / BEAM.McRd;
      if (u >= 0.9) return ['Critical', 's-crit'];
      if (u >= 0.7) return ['Warning', 's-warn'];
      if (u >= 0.5) return ['Watch', 's-watch'];
      return ['Normal', 's-normal'];
    }
    function draw() {
      const { ctx, w, h } = fitCanvas(cv);
      const L = 52, R = w - 10, T = 10, B = h - 24;
      const vMax = 2800, vMin = 0;
      const Y = v => B - (v - vMin) / (vMax - vMin) * (B - T);
      ctx.font = '11px ' + cssVar('--font-num'); ctx.textAlign = 'right';
      for (let v = 0; v <= vMax; v += 700) { ctx.strokeStyle = cssVar('--line'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(R, Y(v)); ctx.stroke(); ctx.fillStyle = cssVar('--muted'); ctx.fillText(v, L - 6, Y(v) + 4); }
      const thCol = ['#B8D84A', cssVar('--attn'), cssVar('--fail')];
      TH.forEach(([n, u], k) => { const y = Y(strainForU(u)); ctx.setLineDash([6, 4]); ctx.strokeStyle = thCol[k]; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = thCol[k]; ctx.textAlign = 'left'; ctx.fillText(`${n} (U ${u})`, L + 6, y - 4); });
      ctx.strokeStyle = mode === 'fault' ? cssVar('--violet') : cssVar('--sensor'); ctx.lineWidth = 2;
      ctx.beginPath(); let pen = false;
      data.forEach((v, i) => { const x = L + (R - L) * i / (N - 1); if (!Number.isFinite(v)) { pen = false; return; } if (!pen) { ctx.moveTo(x, Y(v)); pen = true; } else ctx.lineTo(x, Y(v)); });
      ctx.stroke();
      const lv = data[N - 1];
      if (Number.isFinite(lv)) { ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(R, Y(lv), 4, 0, 7); ctx.fill(); }
      ctx.fillStyle = cssVar('--muted'); ctx.textAlign = 'left'; ctx.fillText('µε', 8, h - 6); ctx.textAlign = 'right'; ctx.fillText('rolling window, simulated stream', R, h - 6);
    }
    function updateChain() {
      const v = data[N - 1];
      const [st, cls] = stateFor(v);
      const el = $('#monState'); el.textContent = st; el.className = 'state ' + cls;
      if (mode === 'fault' || !Number.isFinite(v)) {
        ['#mcStrain', '#mcStress', '#mcMoment', '#mcUtil'].forEach(s => { $(s).textContent = '—'; });
        $('#mcStrain').textContent = mode === 'fault' ? 'invalid' : '—';
        return;
      }
      const sig = v / 1e6 * BEAM.E, M = sig * BEAM.Wel / 1e6, u = M / (BEAM.McRd / 1e6);
      $('#mcStrain').textContent = f(v, 0) + ' µε';
      $('#mcStress').textContent = f(sig, 1) + ' MPa';
      $('#mcMoment').textContent = f(M, 1) + ' kNm';
      $('#mcUtil').textContent = f(u, 2);
    }
    let last = 0, run = false;
    function loop(t) {
      if (!isShown('monitor')) { run = false; return; }
      if (t - last > 130) { last = t; data.shift(); data.push(sample()); updateChain(); }
      draw();
      requestAnimationFrame(loop);
    }
    showFns.monitor = () => { if (reduceMotion) { draw(); updateChain(); } else if (!run) { run = true; requestAnimationFrame(loop); } };
    redrawFns.monitor = () => draw();
    $('#evOverload').addEventListener('click', () => { mode = 'overload'; if (reduceMotion) { for (let i = 0; i < 80; i++) { data.shift(); data.push(sample()); } draw(); updateChain(); } });
    $('#evFault').addEventListener('click', () => { mode = 'fault'; if (reduceMotion) { for (let i = 0; i < 40; i++) { data.shift(); data.push(sample()); } draw(); updateChain(); } });
    $('#evClear').addEventListener('click', () => { mode = 'normal'; if (reduceMotion) { extra = 0; for (let i = 0; i < 80; i++) { data.shift(); data.push(sample()); } draw(); updateChain(); } });

    // calibration
    const s = $('#calibSvg');
    const pred = 8.2, meas = 10.4, maxv = 12;
    const bx = 110, bw = 230, rows = [['Predicted', pred, '--accent', 'rtype-solver'], ['Measured', meas, '--sensor', 'rtype-sensor']];
    stxt(s, 20, 30, 'Midspan deflection, mm (example values)', { style: 'fill: var(--muted); font: 500 12px var(--font-body)' });
    rows.forEach(([n, v, c], i) => {
      const y = 60 + i * 64;
      stxt(s, 20, y + 22, n, { style: 'fill: var(--text); font: 600 13px var(--font-head)' });
      svg('rect', { x: bx, y, width: bw, height: 32, rx: 4, style: 'fill: var(--surface-2)' }, s);
      const bar = svg('rect', { x: bx, y, width: 0, height: 32, rx: 4, style: `fill: var(${c}); transition: width 1.2s cubic-bezier(.2,.8,.2,1) ${i * 0.3}s` }, s);
      stxt(s, bx + bw * v / maxv + 8, y + 22, f(v, 1) + ' mm', { style: 'fill: var(--text); font: 600 13px var(--font-num)' });
      requestAnimationFrame(() => requestAnimationFrame(() => bar.setAttribute('width', bw * v / maxv)));
    });
    const xp = bx + bw * pred / maxv, xm = bx + bw * meas / maxv;
    svg('line', { x1: xp, y1: 188, x2: xm, y2: 188, style: 'stroke: var(--attn)', 'stroke-width': 3 }, s);
    stxt(s, (xp + xm) / 2, 210, 'residual +2.2 mm', { 'text-anchor': 'middle', style: 'fill: var(--attn); font: 600 12px var(--font-num)' });
    $('#calibStats').innerHTML = [['Residual', '+2.2 mm'], ['Difference', '+26.8 %'], ['Model bias', 'Under-predicts'], ['Next step', 'Engineer review']].map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
  };

  /* =========================================================
     INSPECTION TAB: 4D timeline + event engine
     ========================================================= */
  const YEARS = [
    ['2022', 'As-designed', 'Design model issued. Geometry and engineering intent from the design team; nothing physical yet.', 'Designed'],
    ['2023', 'As-built', 'Handover scan compared with design. Column C-12 head is 12 mm out of position, inside the erection tolerance, so no structural effect.', 'As-built'],
    ['2024', 'Routine inspection', 'Drone and laser-scan inspection. No defects found. Asset operational.', 'Operational'],
    ['2025', 'Corrosion detected', 'Defect D-17 recorded on the bottom flange near C-12, with photo and scan evidence.', 'Degraded'],
    ['2026', 'Sensor installed', 'Strain gauge SG-01 added at midspan. Live behaviour now feeds the twin.', 'Under review'],
    ['2027', 'Updated analysis', 'Re-analysis with 1.5 mm flange loss (illustrative): bending utilization rises from 0.60 to 0.62. Engineer decides on repair timing.', 'Requires intervention']
  ];
  initFns.inspect = () => {
    const s = $('#tlSvg');
    const g = svg('g', {}, s);
    const cL = 180, cR = 720, top = 90, bot = 290, bd = 26;
    const col = (x) => svg('rect', { x: x - 10, y: top, width: 20, height: bot - top, class: 'tl-el' }, g);
    const c1 = col(cL), c2 = col(cR);
    const beam = svg('rect', { x: cL + 10, y: top, width: cR - cL - 20, height: bd, class: 'tl-el' }, g);
    const slab = svg('rect', { x: 120, y: top - 14, width: 660, height: 14, class: 'tl-el' }, g);
    svg('line', { x1: 80, y1: bot, x2: 820, y2: bot, style: 'stroke: var(--muted)', 'stroke-width': 2 }, g);
    const all = [c1, c2, beam, slab];
    // overlays
    const dev = svg('g', { class: 'tl-el' }, s);
    svg('rect', { x: cL - 10 + 8, y: top, width: 20, height: bot - top, style: 'fill: none; stroke: var(--attn); stroke-dasharray: 4 3', 'stroke-width': 1.5 }, dev);
    stxt(dev, cL - 24, top + 70, 'C-12 head +12 mm', { 'text-anchor': 'end', style: 'fill: var(--attn); font: 600 12px var(--font-num)' });
    const scan = svg('g', { class: 'tl-el' }, s);
    const dr = svg('g', {}, scan);
    svg('rect', { x: -16, y: -5, width: 32, height: 10, rx: 3, style: 'fill: var(--sensor)' }, dr);
    svg('line', { x1: -22, y1: -8, x2: 22, y2: -8, style: 'stroke: var(--sensor)', 'stroke-width': 2 }, dr);
    svg('polygon', { points: '0,5 -60,70 60,70', style: 'fill: var(--sensor); opacity: 0.15' }, dr);
    if (!reduceMotion) svg('animateTransform', { attributeName: 'transform', type: 'translate', values: '200,30;700,30;200,30', dur: '6s', repeatCount: 'indefinite' }, dr);
    else dr.setAttribute('transform', 'translate(450,30)');
    const defect = svg('g', { class: 'tl-el' }, s);
    svg('ellipse', { cx: cL + 64, cy: top + bd, rx: 22, ry: 7, style: 'fill: var(--fail)' }, defect);
    svg('line', { x1: cL + 64, y1: top + bd + 8, x2: cL + 64, y2: top + 70, style: 'stroke: var(--fail)' }, defect);
    stxt(defect, cL + 64, top + 86, 'D-17 corrosion', { 'text-anchor': 'middle', style: 'fill: var(--fail); font: 600 12px var(--font-head)' });
    const sensor = svg('g', { class: 'tl-el' }, s);
    const mx = (cL + cR) / 2;
    const ring = svg('circle', { cx: mx, cy: top + bd + 6, r: 6, style: 'fill: none; stroke: var(--sensor)', 'stroke-width': 2 }, sensor);
    svg('circle', { cx: mx, cy: top + bd + 6, r: 5, style: 'fill: var(--sensor)' }, sensor);
    if (!reduceMotion) { svg('animate', { attributeName: 'r', values: '6;20', dur: '1.6s', repeatCount: 'indefinite' }, ring); svg('animate', { attributeName: 'opacity', values: '1;0', dur: '1.6s', repeatCount: 'indefinite' }, ring); }
    stxt(sensor, mx, top + bd + 40, 'SG-01', { 'text-anchor': 'middle', style: 'fill: var(--sensor); font: 600 12px var(--font-num)' });
    const util = svg('g', { class: 'tl-el' }, s);
    stxt(util, mx, top - 26, 'U = 0.62 (was 0.60)', { 'text-anchor': 'middle', style: 'fill: var(--attn); font: 600 13px var(--font-num)' });
    const yearTxt = stxt(s, 30, 40, '', { style: 'fill: var(--text); font: 700 30px var(--font-head)' });
    const yearSub = stxt(s, 30, 62, '', { style: 'fill: var(--muted); font: 500 13px var(--font-body)' });

    const ys = $('#tlYears');
    YEARS.forEach(y => { const sp = document.createElement('span'); sp.textContent = y[0]; ys.appendChild(sp); });
    function set(i) {
      const Y = YEARS[i];
      yearTxt.textContent = Y[0]; yearSub.textContent = Y[1];
      $('#tlCaption').innerHTML = `<b>${Y[0]}: ${Y[1]}.</b> ${Y[2]}`;
      $$('span', ys).forEach((sp, j) => sp.classList.toggle('on', j === i));
      const designed = i === 0;
      all.forEach(e => { e.style.fill = designed ? 'none' : 'var(--steel)'; e.style.stroke = designed ? 'var(--accent)' : 'var(--bg)'; e.style.strokeDasharray = designed ? '6 4' : 'none'; e.style.strokeWidth = 1.5; });
      slab.style.fill = designed ? 'none' : 'color-mix(in srgb, var(--steel) 55%, var(--bg))';
      beam.style.fill = i === 5 ? utilColor(0.62) : designed ? 'none' : 'var(--steel)';
      dev.style.opacity = i === 1 ? 1 : 0;
      scan.style.opacity = i === 2 ? 1 : 0;
      defect.style.opacity = i >= 3 ? 1 : 0;
      sensor.style.opacity = i >= 4 ? 1 : 0;
      util.style.opacity = i === 5 ? 1 : 0;
      $$('#assetStates span').forEach(sp => sp.classList.toggle('on', sp.textContent === Y[3]));
      $('#tlRange').value = i;
    }
    let auto = null;
    $('#tlRange').addEventListener('input', e => { clearInterval(auto); set(+e.target.value); });
    set(0);
    if (!reduceMotion) { let k = 0; auto = setInterval(() => { if (!isShown('inspect')) return; k++; if (k > 5) { clearInterval(auto); return; } set(k); }, 1700); }

    $('#eventRun').addEventListener('click', () => {
      const lis = $$('#eventSteps li');
      lis.forEach(li => li.classList.remove('run', 'done'));
      $('#eventRun').disabled = true;
      lis.forEach((li, i) => {
        setTimeout(() => { li.classList.add('run'); }, i * (reduceMotion ? 0 : 650));
        setTimeout(() => { li.classList.remove('run'); li.classList.add('done'); if (i === lis.length - 1) { $('#eventRun').disabled = false; $$('#assetStates span').forEach(sp => sp.classList.toggle('on', sp.textContent === 'Under inspection')); } }, i * (reduceMotion ? 0 : 650) + (reduceMotion ? 0 : 600));
      });
    });
  };

  /* =========================================================
     AI TAB
     ========================================================= */
  const RISK = {
    f: ['Condition', 'Utilization', 'Observed anomaly', 'Trend', 'Uncertainty', 'Criticality', 'Environmental exposure', 'Inspection history'],
    v: [[20, 60, 5, 10, 25, 70, 40, 15], [45, 62, 55, 50, 35, 70, 40, 30]],
    why: ['Baseline: good condition, moderate utilization, high criticality (primary floor beam).',
      'Condition +25 (D-17 corrosion), observed anomaly +50 and trend +40 (strain change-point on SG-01), uncertainty +10 (section loss estimated), inspection history +15 (new defect), utilization +2 (re-analysis).']
  };
  initFns.ai = () => {
    // anomaly chart
    const cv = $('#anomCanvas');
    const N = 365, cp = 240;
    const exp = [], meas = [];
    let seed = 7; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < N; i++) {
      const e = 600 + 60 * Math.sin(i / N * 2 * Math.PI - 1.2);
      exp.push(e);
      meas.push(e + (rand() - 0.5) * 34 + (i > cp ? (i - cp) * 1.3 : 0));
    }
    let shown = reduceMotion ? N : 0, aRun = false;
    function draw() {
      const { ctx, w, h } = fitCanvas(cv);
      const L = 44, R = w - 12, T = 14, B = h - 26;
      const vMin = 450, vMax = 900;
      const X = i => L + (R - L) * i / (N - 1), Y = v => B - (v - vMin) / (vMax - vMin) * (B - T);
      ctx.fillStyle = cssVar('--accent') + '22';
      ctx.beginPath(); exp.forEach((e, i) => ctx[i ? 'lineTo' : 'moveTo'](X(i), Y(e + 45))); for (let i = N - 1; i >= 0; i--) ctx.lineTo(X(i), Y(exp[i] - 45)); ctx.fill();
      ctx.strokeStyle = cssVar('--accent'); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); exp.forEach((e, i) => ctx[i ? 'lineTo' : 'moveTo'](X(i), Y(e))); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < shown; i++) {
        const out = Math.abs(meas[i] - exp[i]) > 45;
        ctx.fillStyle = out ? cssVar('--attn') : cssVar('--sensor');
        ctx.beginPath(); ctx.arc(X(i), Y(meas[i]), out ? 2.6 : 1.8, 0, 7); ctx.fill();
      }
      if (shown > cp + 20) {
        ctx.strokeStyle = cssVar('--fail'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(X(cp), T); ctx.lineTo(X(cp), B); ctx.stroke();
        ctx.fillStyle = cssVar('--fail'); ctx.font = '600 12px ' + cssVar('--font-head'); ctx.textAlign = 'right';
        ctx.fillText('change point flagged: day 241', X(cp) - 6, T + 12);
        ctx.fillStyle = cssVar('--muted'); ctx.font = '11px ' + cssVar('--font-body');
        ctx.fillText('status: AI generated, awaiting engineer', X(cp) - 6, T + 28);
      }
      ctx.fillStyle = cssVar('--muted'); ctx.font = '11px ' + cssVar('--font-num'); ctx.textAlign = 'right';
      [500, 650, 800].forEach(v => ctx.fillText(v, L - 6, Y(v) + 4));
      ctx.textAlign = 'left'; ctx.fillText('µε, daily mean, SG-01 (simulated)', L, h - 8);
    }
    function loop() { if (!isShown('ai')) { aRun = false; return; } if (shown < N) { shown = Math.min(N, shown + 4); draw(); requestAnimationFrame(loop); } else { aRun = false; draw(); } }
    redrawFns.ai = () => draw();

    // risk
    function risk(sc) {
      $$('.risk-toggle button').forEach(b => b.classList.toggle('is-on', +b.dataset.risk === sc));
      const v = RISK.v[sc], base = RISK.v[0];
      $('#riskBars').innerHTML = RISK.f.map((n, i) => `<div class="risk-row ${sc && v[i] !== base[i] ? 'changed' : ''}"><span>${n}</span><div class="ubar"><i style="width:${base[i]}%;background:${utilColor(v[i] / 100)}" data-w="${v[i]}"></i></div><span class="num">${v[i]}${sc && v[i] !== base[i] ? ` <small>(+${v[i] - base[i]})</small>` : ''}</span></div>`).join('');
      requestAnimationFrame(() => requestAnimationFrame(() => $$('#riskBars i').forEach(i => { i.style.width = i.dataset.w + '%'; })));
      const tot = v.reduce((a, b) => a + b, 0) / v.length;
      $('#riskTotal').textContent = `Risk index ${Math.round(tot)} / 100` + (sc ? ` (was ${Math.round(base.reduce((a, b) => a + b, 0) / base.length)})` : '');
      $('#riskWhy').textContent = 'Why: ' + RISK.why[sc] + ' Equal weights shown; weights are configurable and versioned.';
    }
    $$('.risk-toggle button').forEach(b => b.addEventListener('click', () => risk(+b.dataset.risk)));
    risk(0);

    // copilot
    const CP = [
      { q: 'Which members have utilization above 0.8?', code: `codeChecks.find({ model: "AM-L2 v3", utilization: { gt: 0.8 } })\n  .sort("-utilization")`,
        a: () => `Two members: <b>BR-07</b> 1.08, FAIL, flexural buckling (EN 1993-1-1 6.3.1); <b>C-12</b> 0.91, pass with attention (6.3.3). <b>B-310</b> is excluded because its steel grade is unknown; it is marked insufficient data, not safe.<br><span class="ev">run R-5117</span><span class="ev">run R-5119</span><span class="ev">B-310 data gap</span>` },
      { q: 'Show all corrosion defects in Zone B.', code: `defects.find({ zone: "B", type: "corrosion", status: ["open", "monitoring"] })\nscene.highlight(result.ids)`,
        a: () => `One open defect: <b>D-17</b> on B-204 bottom flange, moderate severity, found 2025-03-14, confidence high.<br><span class="ev">IMG-5531</span><span class="ev">scan PC-2025-07</span><span class="ev">inspection INS-2025-03</span>` },
      { q: 'Compare measured and predicted deflection for B-204.', code: `calibration.compare({ member: "B-204", quantity: "deflection",\n  predicted: "AM-B204 v3", measured: "LVDT-03" })`,
        a: () => `Predicted 8.2 mm, measured 10.4 mm, residual +2.2 mm (+26.8 %). The model under-predicts. Candidate causes: stiffness, support fixity, section loss at D-17, sensor error. An engineering validation task has been opened.<br><span class="ev">test T-2026-02</span><span class="ev">AM-B204 v3</span>` },
      { q: 'Run the 20% increased live-load scenario.', code: `scenario.run({ base: "AM-B204 v3", modify: { Qk: "×1.2" }, tier: 2 })`,
        a: () => { const r = solve(Object.assign({}, lab, { lam: 1.2 })); return `Tier 2 result: M<sub>Ed</sub> = ${f(r.MEd / 1e6, 1)} kNm, governing check ${r.gov.name} at ${f(r.gov.u, 2)}, status <b>${r.status}</b>. Baseline was ${f(solve(Object.assign({}, lab, { lam: 1 })).gov.u, 2)}. Run a Tier 3 solver before any design decision.<br><span class="ev">scenario S-31 (Tier 2)</span><span class="ev">inputs from lab</span>`; } }
    ];
    let typing = null;
    function ask(i) {
      clearInterval(typing);
      const c = CP[i];
      $$('#cpButtons button').forEach((b, j) => b.classList.toggle('is-on', j === i));
      $('#cpQ').textContent = c.q; $('#cpQuery').textContent = ''; $('#cpA').innerHTML = '';
      if (reduceMotion) { $('#cpQuery').textContent = c.code; $('#cpA').innerHTML = c.a(); return; }
      let k = 0;
      typing = setInterval(() => { k += 3; $('#cpQuery').textContent = c.code.slice(0, k); if (k >= c.code.length) { clearInterval(typing); $('#cpA').innerHTML = c.a(); } }, 18);
    }
    CP.forEach((c, i) => { const b = document.createElement('button'); b.className = 'btn btn-small'; b.type = 'button'; b.textContent = c.q; b.addEventListener('click', () => ask(i)); $('#cpButtons').appendChild(b); });
    ask(0);

    // radar
    const s = $('#radarSvg'), cx = 220, cy = 220;
    const rings = [['Adopt', 70], ['Prototype', 120], ['Research', 165], ['Monitor', 205]];
    for (let i = rings.length - 1; i >= 0; i--) svg('circle', { cx, cy, r: rings[i][1], class: 'radar-ring', style: `fill: color-mix(in srgb, var(--accent) ${(4 - i) * 4}%, transparent)` }, s);
    rings.forEach(([n, r], i) => stxt(s, cx + 4, cy - r + 14 + (i ? 0 : 0), n, { class: 'radar-label' }));
    svg('line', { x1: cx - 210, y1: cy, x2: cx + 210, y2: cy, class: 'radar-ring' }, s);
    svg('line', { x1: cx, y1: cy - 210, x2: cx, y2: cy + 210, class: 'radar-ring' }, s);
    const Q = [['Data & formats', -1, -1], ['Solvers & physics', 1, -1], ['AI & ML', 1, 1], ['Platform & IoT', -1, 1]];
    Q.forEach(([n, sx, sy]) => stxt(s, cx + sx * 205, cy + sy * 212 + (sy < 0 ? 10 : -2), n, { class: 'radar-label', 'text-anchor': sx < 0 ? 'start' : 'end' }));
    const B = [
      ['IfcOpenShell (IFC)', 0, 0, 0.3, 'Read and write IFC; core of BIM ingestion.'], ['3D Tiles', 0, 0, 0.7, 'Streaming large reality meshes and point clouds.'], ['OpenUSD', 0, 1, 0.5, 'Common scene layer for CAD, simulation and ops data.'], ['CityGML', 0, 3, 0.4, 'City-scale context; relevant for infrastructure portfolios.'],
      ['OpenSees', 1, 1, 0.25, 'Frame and earthquake analysis; licence and validation review needed.'], ['CalculiX', 1, 1, 0.55, 'General FEM for solids and shells; GPL terms to review.'], ['Code_Aster', 1, 1, 0.8, 'Advanced nonlinear FEM; GPL terms to review.'], ['GPU FEM (e.g. Warp)', 1, 2, 0.5, 'GPU-accelerated solvers for interactive large models.'],
      ['Statistical anomaly + change-point', 2, 0, 0.5, 'Proven methods for SHM alerts; explainable.'], ['PhysicsNeMo', 2, 1, 0.5, 'Framework for physics-ML experiments.'], ['MeshGraphNet surrogates', 2, 2, 0.3, 'Graph networks for fast mesh response prediction.'], ['Neural operators', 2, 2, 0.6, 'Operator learning for families of load cases.'], ['PINNs', 2, 2, 0.85, 'Physics-informed nets for calibration and inverse problems.'],
      ['MQTT', 3, 0, 0.3, 'Lightweight sensor transport.'], ['Time-series DB', 3, 0, 0.7, 'Storage for high-rate sensor data.'], ['OGC SensorThings', 3, 1, 0.5, 'Open sensor data model and API.']
    ];
    const qAng = [[Math.PI, 1.5 * Math.PI], [1.5 * Math.PI, 2 * Math.PI], [0, 0.5 * Math.PI], [0.5 * Math.PI, Math.PI]];
    const blips = B.map(([n, q, ring, t, desc], i) => {
      const r0 = ring ? rings[ring - 1][1] : 10, r1 = rings[ring][1];
      const rr = r0 + (r1 - r0) * (0.35 + 0.3 * ((i * 37) % 10) / 10);
      const a = qAng[q][0] + (qAng[q][1] - qAng[q][0]) * (0.12 + 0.76 * t);
      const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
      const g = svg('g', { class: 'blip', tabindex: 0, role: 'button', 'aria-label': n }, s);
      svg('circle', { cx: x, cy: y, r: 7, style: `fill: var(${['--accent', '--pass', '--violet', '--sensor'][q]})` }, g);
      stxt(g, x, y + 3.5, i + 1, { 'text-anchor': 'middle', style: 'fill: var(--bg); font: 700 8px var(--font-num)' });
      const pick = () => { blips.forEach(b => b.classList.remove('on')); g.classList.add('on'); $('#radarInfo').innerHTML = `<b>${i + 1}. ${n}</b> (${rings[ring][0]}, ${Q[q][0]}): ${desc}`; };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      return g;
    });
    showFns.ai = () => { if (!aRun && shown < N) { aRun = true; requestAnimationFrame(loop); } else draw(); };
  };

  /* =========================================================
     GOVERNANCE TAB
     ========================================================= */
  initFns.governance = () => {
    const spans = $$('.wf-track span');
    const names = ['AI generated by copilot (anomaly A-12, risk change +18)', 'Engineer review opened by structural engineer', 'Engineer accepted: method and inputs checked', 'Engineer approved and signed off for issue'];
    let st = 0;
    function render(rejected = false) {
      spans.forEach((s, i) => { s.classList.toggle('done', i < st); s.classList.toggle('cur', i === st); });
      $('.wf-track').classList.toggle('rejected', rejected);
      $('#wfAdvance').disabled = rejected || st >= 3;
    }
    function log(t) { const li = document.createElement('li'); li.textContent = `${nowStamp()}  ${t}`; $('#wfLog').appendChild(li); }
    $('#wfAdvance').addEventListener('click', () => { if (st < 3) { st++; log(names[st]); render(); } });
    $('#wfReject').addEventListener('click', () => { log(`Rejected at "${spans[st].textContent}": site verification of D-17 required first`); render(true); $('#wfReject').disabled = true; });
    $('#wfReset').addEventListener('click', () => { st = 0; $('#wfLog').innerHTML = ''; log(names[0]); $('#wfReject').disabled = false; render(); });
    log(names[0]); render();
    showFns.governance = () => {
      const tr = $$('#trace span');
      tr.forEach(s => s.classList.remove('on'));
      tr.forEach((s, i) => setTimeout(() => s.classList.add('on'), reduceMotion ? 0 : 150 + i * 110));
    };
  };

  /* =========================================================
     PLATFORM TAB
     ========================================================= */
  initFns.platform = () => {
    const s = $('#archSvg');
    const row = (y, h, items, title, x0 = 20, x1 = 880) => {
      svg('rect', { x: x0 - 8, y: y - 22, width: x1 - x0 + 16, height: h + 30, rx: 8, class: 'arch-band' }, s);
      stxt(s, x0, y - 7, title, { class: 'arch-title' });
      const gap = 8, w = (x1 - x0 - gap * (items.length - 1)) / items.length;
      return items.map((t, i) => {
        const g = svg('g', { class: 'arch-box' }, s);
        const x = x0 + i * (w + gap);
        svg('rect', { x, y, width: w, height: h, rx: 5 }, g);
        const lines = t.split('|');
        lines.forEach((l, k) => stxt(g, x + w / 2, y + h / 2 + 4 + (k - (lines.length - 1) / 2) * 14, l, { 'text-anchor': 'middle' }));
        return { x: x + w / 2, y, h };
      });
    };
    const r1 = row(32, 34, ['Browser 3D twin', 'Tablet & field app', 'APIs & integrations'], 'Clients');
    const r2 = row(110, 30, ['API gateway | SSO · MFA · RBAC · tenant isolation · audit'.replace(' | ', ' · ')], 'Access');
    const r3 = row(186, 46, ['Asset &|graph', 'Engineering|model', 'Load|engine', 'Analysis jobs|CPU·GPU·HPC', 'Code|engine', 'Monitoring|SHM', 'Inspection|& defects', 'AI / ML|services', 'Reports'], 'Services');
    const r4 = row(276, 26, ['Event streaming: SensorReadingReceived · AnalysisCompleted · DefectCreated · ThresholdExceeded …'], 'Events');
    const r5 = row(350, 40, ['Spatial|DB', 'Engineering|DB', 'Time-series|DB', 'Object|storage', 'Results|DB', 'Knowledge|graph'], 'Data');
    const layers = [r1, r2, r3, r4, r5];
    const pulses = [];
    for (let k = 0; k < 10; k++) pulses.push({ c: svg('circle', { r: 3.5, class: 'arch-pulse', opacity: 0 }, s), t: Math.random(), lvl: k % 4, x: 40 + Math.random() * 820, sp: 0.006 + Math.random() * 0.006, dir: k % 3 ? 1 : -1 });
    let run = false;
    function tick() {
      if (!isShown('platform')) { run = false; return; }
      pulses.forEach(p => {
        p.t += p.sp;
        if (p.t > 1) { p.t = 0; p.lvl = Math.floor(Math.random() * 4); p.x = 40 + Math.random() * 820; p.dir = Math.random() < 0.65 ? 1 : -1; }
        const a = layers[p.lvl][0], b = layers[p.lvl + 1][0];
        const y0 = a.y + a.h, y1 = b.y;
        const tt = p.dir > 0 ? p.t : 1 - p.t;
        p.c.setAttribute('cx', p.x); p.c.setAttribute('cy', y0 + (y1 - y0) * tt);
        p.c.setAttribute('opacity', Math.sin(p.t * Math.PI));
      });
      requestAnimationFrame(tick);
    }
    showFns.platform = () => { if (!reduceMotion && !run) { run = true; requestAnimationFrame(tick); } };
    const EV = [['SensorReadingReceived', 'SG-01 612 µε'], ['GeometryUpdated', 'PC-2025-07'], ['InspectionCompleted', 'INS-2025-03'], ['DefectCreated', 'D-17'], ['AnalysisCompleted', 'AM-B204 v3'], ['CodeCheckFailed', 'BR-07 6.3.1'], ['ThresholdExceeded', 'SG-01 Watch'], ['ModelCalibrated', 'AM-B204 v4'], ['MaintenanceRequired', 'R-88']];
    const html = EV.map(([a, b]) => `<span><b>${a}</b> ${b}</span>`).join('');
    $('#ticker').innerHTML = html + html;
  };

  /* ---------- start ---------- */
  const startTab = (location.hash || '#overview').slice(1);
  showTab(startTab);
})();
