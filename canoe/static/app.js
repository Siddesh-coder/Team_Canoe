/* Canoe front end. Plain JavaScript, no build step, no dependencies.
   Every number and decision comes from the API; this file only shows it. */
(() => {
'use strict';

// ------------------------------------------------------------------ helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LABEL = { routine_processing: 'Routine processing', request_information: 'Request information', human_review: 'Human review' };
const OUTCOMES = ['routine_processing', 'request_information', 'human_review'];
const pill = (r) => `<span class="pill ${esc(r)}">${esc(LABEL[r] || r)}</span>`;
const statusPill = (s) => `<span class="pill ${esc(s)}">${esc(s)}</span>`;
const fmtTime = (iso) => (iso || '').replace('T', ' ').replace(/\+00:00$/, ' UTC');
const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const money = (n) => (n === null || n === undefined ? '' : Number(n).toLocaleString('en-US'));

// field metadata for forms. type: bool | enum | number
const FIELDS = [
  { key: 'policy_active_on_incident', label: 'Policy active on the incident date', type: 'bool' },
  { key: 'claim_type', label: 'Claim type', type: 'enum', options: ['motor_own_damage', 'theft', 'other'] },
  { key: 'repair_type', label: 'Repair type', type: 'enum', options: ['standard', 'ev_high_voltage_battery'] },
  { key: 'quote_eur', label: 'Repair quote in euros', type: 'number', hint: 'Leave blank if you do not have it' },
  { key: 'incident_report_present', label: 'Incident report attached', type: 'bool' },
  { key: 'itemized_quote_present', label: 'Itemized quote attached (line items, not just a total)', type: 'bool' },
  { key: 'injury_reported', label: 'Anyone injured', type: 'bool' },
  { key: 'liability_disputed', label: 'Fault is disputed', type: 'bool' },
  { key: 'duplicate_flag', label: 'Already submitted before', type: 'bool' },
  { key: 'evidence_conflict', label: 'Evidence conflicts (for example photo dates)', type: 'bool' },
];
const FMETA = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
const SOURCE_TEXT = {
  claimant_form: 'stated by claimant', claimant_followup: 'stated by claimant, follow-up', reviewer_edit: 'corrected by reviewer',
  seed: 'from claim file', csv: 'from claim file', batch_upload: 'from claim file', labelled_import: 'from claim file',
};

const fv = (value) => (value === null || value === undefined ? '' : typeof value === 'boolean' ? (value ? 'True' : 'False') : String(value));
function controlFor(f, value, name) {
  const v = fv(value);
  const nm = name || f.key;
  if (f.type === 'bool') {
    return `<select name="${nm}"><option value=""${v === '' ? ' selected' : ''}>Not known</option>
      <option value="True"${v === 'True' ? ' selected' : ''}>Yes</option><option value="False"${v === 'False' ? ' selected' : ''}>No</option></select>`;
  }
  if (f.type === 'enum') {
    return `<select name="${nm}"><option value=""${v === '' ? ' selected' : ''}>Not known</option>${f.options
      .map((o) => `<option value="${o}"${v === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
  }
  return `<input type="text" inputmode="decimal" name="${nm}" value="${esc(v)}" placeholder="blank = not known" autocomplete="off">`;
}

// ------------------------------------------------------------------ api
// sessionStorage can be blocked (private mode, sandboxed frames). The app must still work.
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
};
let token = ss.get('canoe_token') || '';
async function api(path, opts = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = opts.body;
  if (body instanceof ArrayBuffer) headers['Content-Type'] = 'application/octet-stream';
  else if (body !== undefined && typeof body === 'object') { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  else if (typeof body === 'string') headers['Content-Type'] = 'text/csv';
  const res = await fetch(`/api${path}`, { method: opts.method || (body !== undefined ? 'POST' : 'GET'), headers, body });
  if (res.status === 401) {
    const t = window.prompt('This server needs an access token. Paste it here:');
    if (t) { token = t.trim(); ss.set('canoe_token', token); return api(path, opts); }
  }
  let data;
  try { data = await res.json(); } catch { data = { error: 'The server sent an unreadable answer.' }; }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

let toastTimer;
function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = `toast show${isErr ? ' err' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, isErr ? 6000 : 3200);
}
const fail = (e) => { console.error(e); toast(e.message || String(e), true); };

// ------------------------------------------------------------------ demo sign-in (no passwords in the prototype)
let user = null;
try { user = JSON.parse(ss.get('canoe_user') || 'null'); } catch { user = null; }
function setWho(role) {
  const el = $('#who');
  if (user && role) { el.hidden = false; el.textContent = `${user.name} · ${role}`; } else el.hidden = true;
}
function gate(role, blurb, onReady) {
  if (user) { setWho(role); return onReady(); }
  setWho(null);
  $('#main').innerHTML = `<div class="wrap page"><div class="card pad" style="max-width:520px;margin:40px auto">
    <div class="eyebrow">DEMO SIGN-IN</div><h1 style="font-size:38px;margin:8px 0 10px">${esc(role)}</h1>
    <p class="muted" style="margin-bottom:18px">${esc(blurb)}</p>
    <form id="signin" class="stack"><label class="f">Your name<input type="text" name="name" required autocomplete="name" placeholder="For example Rita Reviewer"></label>
    <button class="btn btn-ink" type="submit">Continue</button>
    <p class="caption">The prototype has no passwords. Your name is stored with every override, edit and publish you make.</p></form></div></div>`;
  $('#signin').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim();
    if (!name) return;
    user = { name }; ss.set('canoe_user', JSON.stringify(user)); setWho(role); onReady();
  });
  $('#signin input').focus();
}

// ------------------------------------------------------------------ shared pieces
function rowValue(f) {
  if (f.value === null || f.value === undefined) return `<span class="absent">${f.status === 'unreadable' ? 'unreadable: absent' : 'blank: absent'}</span>`;
  if (f.field === 'quote_eur') return esc(money(f.value));
  return esc(String(f.value));
}
function firedFields(claim) {
  const d = claim.latest_decision; if (!d) return [];
  const tr = (d.detail.trace || []).find((t) => t.rule === d.rule_id);
  if (tr) return tr.fields;
  if (d.rule_id === 'R0.absent_fact') return d.detail.missing_fields || [];
  return [];
}
function factsTable(claim, editable = false) {
  const hit = new Set(firedFields(claim));
  return `<table class="facts"><tbody>${claim.fields.map((f) => `<tr class="${hit.has(f.field) ? 'hit' : ''}">
    <td>${esc(f.field)}</td><td>${editable ? controlFor(FMETA[f.field], f.value, `fact_${f.field}`) : rowValue(f)}
    ${editable ? '' : (f.value !== null && SOURCE_TEXT[f.source] ? `<span class="src">${esc(SOURCE_TEXT[f.source])}</span>` : '')}</td></tr>`).join('')}</tbody></table>`;
}
function decisionHead(claim) {
  const d = claim.latest_decision;
  const rv = claim.effective_source === 'reviewer';
  return `<div class="ver-strip">${pill(claim.effective_recommendation)}
    <span class="version-tag">policy ${esc(d.policy_version)}</span><span class="version-tag">${esc(d.rule_id)}</span>
    ${rv ? '<span class="version-tag" style="color:var(--rust)">reviewer decision</span>' : ''}</div>`;
}
function emailBlock(claim) {
  const open = (claim.info_requests || []).filter((r) => r.status === 'open').pop();
  if (!open) return '';
  return `<hr class="rule"><div class="eyebrow">DRAFT EMAIL TO CLAIMANT${claim.claimant_email ? ` · ${esc(claim.claimant_email)}` : ''}</div>
    <p class="muted" style="margin:6px 0 10px;font-size:13px">Asks only for what is missing. Nothing is guessed.</p><div class="email"><strong>${esc(open.subject)}</strong>\n\n${esc(open.body)}</div>`;
}
function claimCard(claim, { showEmail = true } = {}) {
  const d = claim.latest_decision;
  return `<article class="card pad result"><div class="row between" style="align-items:flex-start">
    <div><div class="eyebrow">CLAIM ${esc(claim.case_id)} · ${esc(claim.case_status).toUpperCase()}</div><h2>${esc(claim.summary || 'Motor claim')}</h2></div>
    ${pill(claim.effective_recommendation)}</div>
    <div style="margin:16px 0 4px">${factsTable(claim)}</div>
    <p class="explain">${esc(d.explanation)}</p>${decisionHead(claim)}${showEmail ? emailBlock(claim) : ''}</article>`;
}

// ------------------------------------------------------------------ engraving (home hero)
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function buildScene(svg) {
  const r = rng(7);
  const f1 = (n) => n.toFixed(1);
  let out = '';
  // distant mountain: ridge line plus fine hatching
  const ridge = [[470, 205], [560, 160], [650, 118], [720, 88], [790, 74], [850, 92], [930, 128], [1010, 150], [1100, 172], [1200, 190]];
  out += `<path class="draw" pathLength="1" style="--d:.1s" stroke-width="1.2" d="M${ridge.map((p) => p.join(' ')).join(' L')}"/>`;
  let hatch = '';
  for (let x = 560; x < 1200; x += 6) {
    let y = 190;
    for (let i = 0; i < ridge.length - 1; i++) if (x >= ridge[i][0] && x <= ridge[i + 1][0]) { const t = (x - ridge[i][0]) / (ridge[i + 1][0] - ridge[i][0]); y = ridge[i][1] + t * (ridge[i + 1][1] - ridge[i][1]); }
    const len = 8 + r() * 26;
    hatch += `M${x} ${f1(y + 4)} l${f1(-len * 0.35)} ${f1(len)} `;
  }
  out += `<path class="fade" style="--d:.6s;opacity:.55" stroke-width=".7" d="${hatch}"/>`;
  // pines
  const pine = (x, base, h, w) => {
    let d = `M${x} ${base} L${x} ${base - h} `;
    const n = Math.floor(h / 6);
    for (let i = 1; i < n; i++) {
      const y = base - h + i * 6, span = (w * i) / n * (0.7 + r() * 0.5);
      d += `M${x} ${f1(y)} l${f1(-span)} ${f1(9 + r() * 3)} M${x} ${f1(y)} l${f1(span)} ${f1(9 + r() * 3)} `;
    }
    return d;
  };
  let trees = '';
  for (let i = 0; i < 26; i++) { const x = 840 + r() * 330; trees += pine(x, 215 + r() * 16, 70 + r() * 70, 11 + r() * 8); }
  for (let i = 0; i < 18; i++) { const x = 370 + r() * 190; trees += pine(x, 222 + r() * 10, 40 + r() * 28, 7 + r() * 5); }
  for (let i = 0; i < 7; i++) { const x = 20 + r() * 70; trees += pine(x, 226 + r() * 6, 30 + r() * 20, 6 + r() * 4); }
  out += `<path class="fade" style="--d:.9s" stroke-width=".8" d="${trees}"/>`;
  // shoreline
  out += `<path class="draw" pathLength="1" style="--d:.4s" stroke-width="1" d="M0 232 C 200 224, 420 236, 640 228 S 980 222, 1200 232"/>`;
  // water
  const water = (count, y0, y1, seed) => {
    const rr = rng(seed); let d = '';
    for (let i = 0; i < count; i++) { const y = y0 + rr() * (y1 - y0), x = rr() * 1200, len = 10 + rr() * 56; d += `M${f1(x)} ${f1(y)} h${f1(len)} `; }
    return d;
  };
  out += `<g class="ripple" style="--d:0s;opacity:.6"><path stroke-width=".9" d="${water(70, 246, 372, 11)}"/></g>`;
  out += `<g class="ripple" style="--d:-3s;opacity:.45"><path stroke-width=".7" d="${water(60, 250, 372, 23)}"/></g>`;
  // the canoe: a hull drawn as ribs between the gunwale and the keel, then thwarts and a paddle
  const L = 330, R = 1010, yb = 148, yr = 130, mid = (L + R) / 2;
  const hull = (cy) => `M${L} ${yb} Q ${mid} ${cy} ${R} ${yr}`;
  const onHull = (t, cy) => [(1 - t) * (1 - t) * L + 2 * (1 - t) * t * mid + t * t * R, (1 - t) * (1 - t) * yb + 2 * (1 - t) * t * cy + t * t * yr];
  let canoe = `<path class="draw" pathLength="1" style="--d:1s" stroke-width="2.4" d="${hull(208)}"/>`;
  canoe += `<path class="draw" pathLength="1" style="--d:1.05s" stroke-width="1.3" d="${hull(196)}"/>`;
  canoe += `<path class="draw" pathLength="1" style="--d:1.1s" stroke-width="2.6" d="${hull(372)}"/>`;
  for (let i = 1; i <= 13; i++) { const cy = 208 + (372 - 208) * (i / 14); canoe += `<path class="draw" pathLength="1" style="--d:${(1.15 + i * 0.05).toFixed(2)}s" stroke-width="${i % 3 === 0 ? 1 : 0.7}" d="${hull(cy)}"/>`; }
  canoe += `<path class="draw" pathLength="1" style="--d:1.9s" stroke-width="2" d="M${L} ${yb} q -12 -4 -16 -22 M${R} ${yr} q 12 -4 16 -22"/>`;
  [0.24, 0.5, 0.76].forEach((t, i) => { const [x, y] = onHull(t, 202); canoe += `<path class="draw" pathLength="1" style="--d:${(2 + i * 0.12).toFixed(2)}s" stroke-width="2.2" d="M${f1(x - 34)} ${f1(y + 3)} L${f1(x + 34)} ${f1(y - 4)}"/>`; });
  canoe += `<path class="draw" pathLength="1" style="--d:2.3s" stroke-width="2.4" d="M815 78 L 930 300"/><path class="draw" pathLength="1" style="--d:2.4s" stroke-width="1.5" d="M920 286 q 20 -10 32 8 q 6 26 -16 34 q -18 -14 -16 -42 z"/>`;
  out += `<g transform="translate(120 -6) scale(.96)"><g class="canoe">${canoe}</g>`;
  let refl = ''; const rr = rng(5);
  for (let i = 0; i < 30; i++) { const x = 380 + rr() * 600, y = 290 + rr() * 50; refl += `M${f1(x)} ${f1(y)} h${f1(16 + rr() * 50)} `; }
  out += `<path class="fade" style="--d:2.2s;--o:.7" stroke-width=".9" d="${refl}"/></g>`;
  out += `<path class="fade" style="--d:2s" stroke-width="1.2" d="M360 70 q6 -7 12 0 q6 -7 12 0 M392 84 q5 -6 10 0 q5 -6 10 0"/>`;
  svg.innerHTML = out;
}

// ------------------------------------------------------------------ views
async function viewHome() {
  setWho(null);
  const main = $('#main');
  let rows = [];
  try { const imp = await api('/impact'); rows = (imp.rechecks || []).slice(0, 3); } catch (e) { /* home works without the API */ }
  const sample = rows.length
    ? rows.map((r) => `<tr><td class="m">${esc(r.case_id)}</td><td class="m">open</td><td class="m">${esc(r.from_recommendation)}</td><td class="m rust">${esc(r.to_recommendation)}</td><td class="m rust">True</td></tr>`).join('')
    : `<tr><td class="m">[case A]</td><td class="m">open</td><td class="m">routine</td><td class="m rust">review</td><td class="m rust">True</td></tr>
       <tr><td class="m">[case B]</td><td class="m">open</td><td class="m">request_info</td><td class="m">request_info</td><td class="m">False</td></tr>
       <tr><td class="m">[case C]</td><td class="m">closed</td><td class="m">routine</td><td class="m dim">routine (kept)</td><td class="m">False</td></tr>`;
  main.innerHTML = `
  <section class="hero"><div class="wrap">
    <div class="eyebrow">TAKTILE CASE / THINC! MUNICH / 7–8 NOV 2026</div>
    <div class="hero-grid"><h1>Keep decisions right as the <em>rules change.</em></h1>
      <div class="hero-side"><p>Canoe reads a fictional motor claim, recommends the next step and shows the facts and the policy version behind it. It never approves or pays a claim.</p>
      <div class="hero-actions"><a class="btn btn-rust" href="#/triage">Triage a claim</a><a class="btn btn-ghost" href="#/policy">See a policy change</a><a class="link" href="#/triage/batch">Batch version</a></div></div></div>
    <div class="scene"><svg class="engraving" viewBox="0 0 1200 380" preserveAspectRatio="xMaxYMid slice" aria-hidden="true"></svg>
      <div class="example"><div class="top"><div><div class="eyebrow">EXAMPLE CLAIM</div><h3>Rear bumper, parking damage</h3></div><span class="pill human_review">Human review</span></div>
        <table class="facts" style="margin-top:12px"><tbody>
          <tr><td>claim_type</td><td>motor_own_damage</td></tr><tr><td>policy_active</td><td>true</td></tr><tr><td>injury_reported</td><td>false</td></tr>
          <tr class="hit"><td>quote_eur</td><td>2,140 &gt; 1,500</td></tr><tr><td>itemized_quote_present</td><td><span class="absent">blank: absent</span></td></tr></tbody></table>
        <p class="note">Rule 1 fires before the missing document. Policy v1 is attached to this recommendation.</p>
        <div class="row-btns"><a class="btn btn-ghost btn-sm" href="#/reviewers">Override</a><a class="btn btn-ink btn-sm" href="#/reviewers">Confirm review</a></div></div></div>
  </div></section>
  <section class="section"><div class="wrap">
    <div class="outcomes-head"><h2 class="section-title">Three outcomes, one order.</h2><p>Policy v1 is checked top to bottom. A known reason for review always comes before a missing document.</p></div>
    <div class="outcomes">
      <div class="outcome"><span class="num">i</span><div class="mono">RULE 1</div><h3>Human review</h3><p>Inactive policy, another claim type, injury, disputed liability, a duplicate, conflicting evidence or a quote above €1,500.</p></div>
      <div class="outcome"><span class="num">ii</span><div class="mono">RULE 2</div><h3>Request information</h3><p>The incident report or the itemized quote is missing. A blank field is an absent fact. We ask for it and never invent it.</p></div>
      <div class="outcome dark"><span class="num">iii</span><div class="mono">RULE 3</div><h3>Routine processing</h3><p>Nothing above applies. The claim may enter the insurer's normal downstream process. This is not a payment approval.</p></div>
    </div></div></section>
  <section class="wrap" style="padding-bottom:30px"><div class="control"><div><div class="eyebrow">CHANGE CONTROL</div><h2>When the rules change, <em>open</em> claims get another look.</h2>
    <p class="lead">Every recommendation keeps its policy version. Closed claims stay as decided. Overrides record the reviewer, the reason and the version.</p></div>
    <div><div class="table-wrap"><table class="data"><thead><tr><th>case_id</th><th>status</th><th>v1</th><th>v2</th><th>recheck</th></tr></thead><tbody>${sample}</tbody></table></div>
    <p class="caption">${rows.length ? 'Live rows from the claims register.' : 'Sample of the results format. Rows are placeholders until v2 is announced.'}</p></div></div></section>`;
  buildScene($('.engraving', main));
}

// ---- triage -------------------------------------------------------
const PRESETS = {
  easy: { claim_summary: 'Single-car parking scrape; photos and itemized workshop quote.', policy_active_on_incident: 'True', claim_type: 'motor_own_damage', repair_type: 'standard', quote_eur: '650', incident_report_present: 'True', itemized_quote_present: 'True', injury_reported: 'False', liability_disputed: 'False', duplicate_flag: 'False', evidence_conflict: 'False' },
  incomplete: { claim_summary: 'Minor bumper damage. The incident report has not been sent yet.', policy_active_on_incident: 'True', claim_type: 'motor_own_damage', repair_type: 'standard', quote_eur: '750', incident_report_present: '', itemized_quote_present: 'True', injury_reported: 'False', liability_disputed: 'False', duplicate_flag: 'False', evidence_conflict: 'False' },
  rulechange: { claim_summary: 'Electric vehicle battery housing repair; complete paperwork, quote 1,350.', policy_active_on_incident: 'True', claim_type: 'motor_own_damage', repair_type: 'ev_high_voltage_battery', quote_eur: '1350', incident_report_present: 'True', itemized_quote_present: 'True', injury_reported: 'False', liability_disputed: 'False', duplicate_flag: 'False', evidence_conflict: 'False' },
};

function viewTriage(mode) {
  setWho(null);
  const batch = mode === 'batch';
  $('#main').innerHTML = `<div class="wrap page"><div class="page-head"><div><div class="eyebrow">TRIAGE</div><h1>${batch ? 'Triage a file of claims.' : 'Triage a claim.'}</h1>
    <p>${batch ? 'Upload a CSV in the claims format. You get v1 and the newest policy side by side, with the rule behind each result.' : 'Answer what you know. Anything you leave as “Not known” is treated as absent, never as a guess.'}</p></div>
    <div class="tabs" role="tablist"><button role="tab" aria-selected="${!batch}" data-tab="single">One claim</button><button role="tab" aria-selected="${batch}" data-tab="batch">Batch version</button></div></div>
    <div id="triage-body"></div></div>`;
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.tab === 'batch' ? '#/triage/batch' : '#/triage'; }));
  batch ? triageBatch() : triageSingle();
}

function triageSingle() {
  $('#triage-body').innerHTML = `<div class="grid2" style="align-items:start"><form id="claim-form" class="card pad stack" novalidate>
    <div class="presets"><span class="muted" style="font-size:13px">Try an example:</span>
      <button type="button" class="btn btn-ghost btn-sm" data-preset="easy">Easy case</button><button type="button" class="btn btn-ghost btn-sm" data-preset="incomplete">Incomplete case</button><button type="button" class="btn btn-ghost btn-sm" data-preset="rulechange">EV battery case</button></div>
    <div class="grid-form"><label class="f">Your name<input type="text" name="claimant_name" autocomplete="name"></label>
      <label class="f">Email <small>we write here if something is missing</small><input type="email" name="claimant_email" autocomplete="email"></label>
      <label class="f full">What happened<textarea name="claim_summary" placeholder="One or two sentences"></textarea></label>
      ${FIELDS.map((f) => `<label class="f">${esc(f.label)}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}${controlFor(f, '')}</label>`).join('')}</div>
    <div class="row"><button class="btn btn-rust" type="submit">Get recommendation</button><button class="btn btn-ghost" type="reset">Clear</button></div></form>
    <div id="triage-result"><div class="card empty"><h3>Your result appears here</h3><p>With the facts used, the policy version and the reason.</p></div></div></div>`;
  const form = $('#claim-form');
  $$('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const p = PRESETS[b.dataset.preset];
    Object.entries(p).forEach(([k, v]) => { const el = form.elements[k]; if (el) el.value = v; });
    form.elements.claimant_name.value ||= 'Demo claimant'; form.elements.claimant_email.value ||= 'demo@example.com';
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form).entries());
    const btn = $('button[type=submit]', form); btn.disabled = true;
    try {
      const claim = await api('/claims', { body });
      $('#triage-result').innerHTML = `${claimCard(claim)}<div class="row" style="margin-top:12px"><a class="btn btn-ghost btn-sm" href="#/claim/${encodeURIComponent(claim.case_id)}">Open claim page</a>
        <span class="caption" style="margin:0">Claim number ${esc(claim.case_id)}</span></div>`;
    } catch (err) { fail(err); } finally { btn.disabled = false; }
  });
}

function triageBatch() {
  $('#triage-body').innerHTML = `<div class="stack"><label class="drop" id="drop" tabindex="0"><input type="file" accept=".csv,text/csv" id="file" class="hide">
    <h3>Drop a claims CSV here</h3><p class="muted">or click to choose a file. Same columns as the practice cases.</p></label>
    <div class="row"><label class="row" style="gap:8px;font-size:14px"><input type="checkbox" id="save"> Also add these claims to the register</label>
    <button class="btn btn-ghost btn-sm" id="sample">Use the practice file</button></div><div id="batch-out"></div></div>`;
  const drop = $('#drop'), file = $('#file');
  const run = async (text) => {
    try {
      const d = await api(`/batch${$('#save').checked ? '?save=1' : ''}`, { body: text });
      const counts = {}; d.results.forEach((r) => { counts[r.recommendation_v2] = (counts[r.recommendation_v2] || 0) + 1; });
      const rechecks = d.results.filter((r) => r.needs_recheck === 'True').length;
      $('#batch-out').innerHTML = `<div class="card pad"><div class="row between"><div><h2 style="font-size:28px">${d.results.length} claims triaged</h2>
        <p class="muted">Policy versions used: ${d.policy_versions.map(esc).join(', ')}. Open claims to recheck: <strong>${rechecks}</strong>.${d.saved ? ` Added to register: ${d.saved.added.length}, already there: ${d.saved.skipped_existing.length}.` : ''}</p></div>
        <button class="btn btn-ink" id="dl">Download results.csv</button></div>
        <div class="moves">${OUTCOMES.map((o) => `<span class="move">${esc(LABEL[o])}: ${counts[o] || 0}</span>`).join('')}</div>
        <div class="table-wrap"><table class="data"><thead><tr>${d.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${d.results.map((r) => `<tr>
          <td class="m">${esc(r.case_id)}</td><td>${pill(r.recommendation_v1)}</td><td>${pill(r.recommendation_v2)}</td>
          <td class="m ${r.needs_recheck === 'True' ? 'rust' : ''}">${esc(r.needs_recheck)}</td><td class="m">${esc(r.rule_v1)}</td><td class="m">${esc(r.rule_v2)}</td><td style="min-width:320px">${esc(r.explanation)}</td></tr>`).join('')}</tbody></table></div></div>`;
      $('#dl').addEventListener('click', () => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([d.csv], { type: 'text/csv' })); a.download = 'results.csv'; a.click();
      });
    } catch (err) { fail(err); }
  };
  const read = (f) => { const rd = new FileReader(); rd.onload = () => run(String(rd.result)); rd.readAsText(f); };
  file.addEventListener('change', () => file.files[0] && read(file.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); e.dataTransfer.files[0] && read(e.dataTransfer.files[0]); });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  $('#sample').addEventListener('click', async (e) => { e.preventDefault(); const t = await (await fetch('/sample_claims.csv')).text(); run(t); });
}

// ---- claimant page ------------------------------------------------
async function viewClaim(id) {
  setWho(null);
  if (!id) {
    $('#main').innerHTML = `<div class="wrap page"><div class="page-head"><div><div class="eyebrow">YOUR CLAIM</div><h1>Find your claim.</h1><p>Enter the claim number from your confirmation or email.</p></div></div>
      <form id="find" class="card pad row" style="max-width:520px"><input type="text" name="id" placeholder="CLM-0001" required style="flex:1"><button class="btn btn-ink" type="submit">Open</button></form></div>`;
    $('#find').addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/claim/${encodeURIComponent(new FormData(e.target).get('id').trim())}`; });
    return;
  }
  let claim;
  try { claim = await api(`/claims/${encodeURIComponent(id)}`); } catch (e) { $('#main').innerHTML = `<div class="wrap page"><div class="card empty"><h3>We could not find that claim</h3><p>${esc(e.message)}</p><p style="margin-top:12px"><a class="btn btn-ghost" href="#/claim">Try another number</a></p></div></div>`; return; }
  const req = (claim.info_requests || []).filter((r) => r.status === 'open').pop();
  $('#main').innerHTML = `<div class="wrap page"><div class="page-head"><div><div class="eyebrow">YOUR CLAIM</div><h1>${esc(claim.case_id)}</h1>
    <p>${claim.effective_recommendation === 'request_information' ? 'We need a little more from you before we can continue.' : claim.effective_recommendation === 'human_review' ? 'A claims reviewer will look at your claim.' : 'Your claim can move to normal processing. This is not a payment approval.'}</p></div></div>
    <div class="grid2" style="align-items:start"><div>${claimCard(claim, { showEmail: false })}</div><div class="stack">${req ? `<form id="answer" class="card pad stack"><h2 style="font-size:28px">What we still need</h2>
      ${req.ask_fields.map((k) => `<label class="f">${esc({ incident_report_present: 'Incident report', itemized_quote_present: 'Itemized quote', quote_eur: 'Repair quote in euros' }[k] || FMETA[k].label)}
        ${k === 'incident_report_present' || k === 'itemized_quote_present' ? `<small>${k === 'itemized_quote_present' ? 'One line per item, not just a total.' : ''} Choose Yes once it is attached to your claim.</small>` : ''}${controlFor(FMETA[k], '', `a_${k}`)}</label>`).join('')}
      <button class="btn btn-rust" type="submit">Send</button><p class="caption">What you tell us is recorded as stated by you. A reviewer can still check it.</p></form>` : '<div class="card empty"><h3>Nothing more is needed from you right now</h3></div>'}</div></div></div>`;
  const form = $('#answer');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = {};
    req.ask_fields.forEach((k) => { const v = form.elements[`a_${k}`].value; if (v !== '') values[k] = v; });
    try { await api(`/claims/${encodeURIComponent(id)}/info-response`, { body: { values, name: claim.claimant_name } }); toast('Thank you. Your answer is recorded.'); viewClaim(id); } catch (err) { fail(err); }
  });
}

// ---- reviewer dashboard ---------------------------------------------
let rvFilter = 'attention', rvList = [], rvSearch = '';
function rvVisible() {
  const q = rvSearch.toLowerCase();
  return rvList.filter((c) => {
    if (q && !(`${c.case_id} ${c.summary}`.toLowerCase().includes(q))) return false;
    if (rvFilter === 'closed') return c.case_status === 'closed';
    if (rvFilter === 'all') return true;
    if (c.case_status !== 'open') return false;
    if (rvFilter === 'open') return true;
    return c.recheck_pending || c.effective_recommendation !== 'routine_processing';
  }).sort((a, b) => Number(b.recheck_pending) - Number(a.recheck_pending) || a.case_id.localeCompare(b.case_id));
}
function viewReviewers(id) {
  gate('Reviewer', 'Inspect the evidence, correct a recommendation and say why. Every correction is recorded with your name and the policy version.', async () => {
    try { rvList = (await api('/claims')).claims; } catch (e) { return fail(e); }
    $('#main').innerHTML = `<div class="wrap page"><div class="page-head"><div><div class="eyebrow">REVIEWERS</div><h1>Review queue.</h1><p>Open claims that need a person come first. Pick one to see the facts, the rule and what happened so far.</p></div></div>
      <div class="review-layout"><aside class="card queue" aria-label="Claims"><div style="padding:6px 8px"><input type="search" id="rv-search" placeholder="Find a claim" value="${esc(rvSearch)}"></div><div class="chips" id="chips"></div><div id="queue-list"></div></aside><section id="detail" aria-live="polite"></section></div></div>`;
    const drawQueue = () => {
      $('#chips').innerHTML = [['attention', 'Needs a person'], ['open', 'All open'], ['closed', 'Closed'], ['all', 'Everything']].map(([k, t]) => `<button class="chip" data-f="${k}" aria-pressed="${rvFilter === k}">${t}</button>`).join('');
      const items = rvVisible();
      $('#queue-list').innerHTML = items.length ? items.map((c) => `<button class="q-item" data-id="${esc(c.case_id)}" aria-current="${c.case_id === id}">
        <div class="t"><span class="mono">${esc(c.case_id)}</span><span class="row" style="gap:6px">${c.recheck_pending ? '<span class="pill pending">recheck</span>' : ''}${pill(c.effective_recommendation)}</span></div><div class="s">${esc(c.summary)}</div></button>`).join('')
        : '<div class="empty"><h3>Nothing here</h3><p>Try another filter.</p></div>';
      $$('#chips .chip').forEach((b) => b.addEventListener('click', () => { rvFilter = b.dataset.f; drawQueue(); }));
      $$('.q-item').forEach((b) => b.addEventListener('click', () => { location.hash = `#/reviewers/${encodeURIComponent(b.dataset.id)}`; }));
    };
    drawQueue();
    $('#rv-search').addEventListener('input', (e) => { rvSearch = e.target.value; drawQueue(); });
    if (id) reviewDetail(id); else $('#detail').innerHTML = '<div class="card empty"><h3>Choose a claim</h3><p>The queue on the left lists claims by what needs attention.</p></div>';
  });
}

function timelineItems(c) {
  const ev = [];
  c.decisions.forEach((d) => ev.push({ at: d.created_at, id: d.id, html: `<strong>Policy ${esc(d.policy_version)}</strong> recommended ${pill(d.recommendation)} <span class="mono">${esc(d.rule_id)}</span> <span class="faint">(${esc(d.trigger)})</span>` }));
  c.overrides.forEach((o) => ev.push({ at: o.created_at, cls: 't-override', html: `<strong>${o.kind === 'override' ? 'Override' : 'Confirmed'}</strong> by ${esc(o.reviewer)} on policy ${esc(o.policy_version)}: ${o.kind === 'override' ? `${pill(o.original_recommendation)} to ${pill(o.corrected_recommendation)}. Reason: “${esc(o.reason)}”` : pill(o.corrected_recommendation)}` }));
  c.fact_edits.forEach((e) => ev.push({ at: e.created_at, cls: 't-override', html: `<strong>Fact corrected</strong> by ${esc(e.editor)} (${esc(e.role)}): <span class="mono">${esc(e.field)}</span> ${esc(e.old_value)} to ${esc(e.new_value)}. ${esc(e.reason)}` }));
  c.rechecks.forEach((r) => ev.push({ at: r.created_at, html: `<strong>Recheck flagged</strong> ${esc(r.from_version)} to ${esc(r.to_version)}: ${esc(r.from_recommendation)} to ${esc(r.to_recommendation)} <span class="pill ${r.status === 'pending' ? 'pending' : 'closed'}">${esc(r.status)}</span>` }));
  c.info_requests.forEach((r) => ev.push({ at: r.created_at, html: `<strong>Information requested</strong> from claimant: <span class="mono">${esc(r.ask_fields.join(', '))}</span> <span class="faint">(${esc(r.status)})</span>` }));
  c.outcomes.forEach((o) => ev.push({ at: o.recorded_at, html: `<strong>Final outcome arrived</strong> (${esc(o.source)}): ${pill(o.final_outcome)} ${esc(o.note)}` }));
  return ev.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : (b.id || 0) - (a.id || 0)));
}

async function reviewDetail(id) {
  const box = $('#detail');
  let c;
  try { c = await api(`/claims/${encodeURIComponent(id)}`); } catch (e) { box.innerHTML = `<div class="card empty"><h3>Not found</h3><p>${esc(e.message)}</p></div>`; return; }
  const d = c.latest_decision, pending = c.rechecks.filter((r) => r.status === 'pending').pop();
  const editable = c.editable;
  box.innerHTML = `<div class="stack">
    <div class="card pad"><div class="row between" style="align-items:flex-start"><div><div class="eyebrow">${esc(c.case_id)} · ${statusPill(c.case_status)}</div><h2 style="font-size:30px;margin-top:6px">${esc(c.summary || 'Motor claim')}</h2></div>${decisionHead(c)}</div>
      ${c.effective_source === 'reviewer' ? `<div class="notice" style="margin-top:14px">System said ${pill(d.recommendation)} under policy ${esc(d.policy_version)}. A reviewer decided ${pill(c.effective_recommendation)}. The system output is kept for the record.</div>` : ''}
      ${pending ? `<div class="notice" style="margin-top:14px"><strong>Recheck needed.</strong> Policy ${esc(pending.to_version)} changed this open claim from ${esc(pending.from_recommendation)} to ${esc(pending.to_recommendation)}.${pending.has_override ? ' A reviewer had already overridden the earlier result.' : ''}</div>` : ''}
      ${!editable ? '<div class="notice calm" style="margin-top:14px">This claim is closed. Its decision is kept as it was and cannot be changed by a policy update.</div>' : ''}</div>
    <div class="grid2" style="align-items:start">
      <div class="card pad"><div class="row between"><h3 style="font-size:24px">Facts</h3>${editable ? '<button class="btn btn-ghost btn-sm" id="edit-facts">Correct a fact</button>' : ''}</div>
        <p class="caption" style="margin:4px 0 10px">Blank means absent. It is never filled in for the system.</p><div id="facts-box">${factsTable(c)}</div><div id="facts-actions"></div></div>
      <div class="card pad"><h3 style="font-size:24px">Why this recommendation</h3><p class="explain">${esc(d.explanation)}</p>
        <div class="eyebrow" style="margin:6px 0">RULES CHECKED IN ORDER</div><div class="trace">${(d.detail.trace || []).map((t) => `<div class="t-${t.counted_as}"><span>${esc(t.rule)}</span><span>${esc(t.counted_as === 'true' ? (t.result === 'unknown' ? 'matched (blank)' : 'matched') : t.result === 'unknown' ? 'unknown' : 'no')}</span></div>`).join('')}</div>
        ${emailBlock(c)}</div></div>
    ${editable ? `<form class="action" id="override-form"><h3>Your decision</h3><div class="grid-form"><label class="f">Next step<select name="rec">${OUTCOMES.map((o) => `<option value="${o}"${o === c.effective_recommendation ? ' selected' : ''}>${LABEL[o]}</option>`).join('')}</select></label>
      <label class="f">Reviewer<input type="text" name="reviewer" value="${esc(user.name)}" required></label>
      <label class="f full">Reason <small>required when you change the recommendation</small><textarea name="reason" placeholder="What did you see that the rules could not?"></textarea></label></div>
      <div class="row" style="margin-top:12px"><button class="btn btn-rust" type="submit" id="do-override">Record override</button><button class="btn btn-ink" type="button" id="do-confirm">Confirm recommendation</button>
      <span class="caption" style="margin:0">Recorded with policy <strong>${esc(d.policy_version)}</strong>, your name and the time.</span></div></form>` : ''}
    <div class="card pad"><h3 style="font-size:24px;margin-bottom:12px">History</h3><ul class="timeline">${timelineItems(c).map((e) => `<li class="${e.cls || ''}"><span class="when">${esc(fmtTime(e.at))}</span>${e.html}</li>`).join('')}</ul></div>
    <details class="card pad"><summary style="cursor:pointer;font-weight:500">Record the final outcome (arrives later)</summary><form id="outcome-form" class="grid-form" style="margin-top:14px">
      <label class="f">What happened in the end<select name="final_outcome">${OUTCOMES.map((o) => `<option value="${o}">${LABEL[o]}</option>`).join('')}</select></label>
      <label class="f">Source<input type="text" name="source" placeholder="payment run, audit, appeal"></label><label class="f full">Note<input type="text" name="note"></label>
      <div class="full"><button class="btn btn-ghost btn-sm" type="submit">Save outcome</button> <span class="caption">Kept separately. It never overwrites the recommendation or a reviewer decision.</span></div></form></details></div>`;

  const refresh = async () => { try { rvList = (await api('/claims')).claims; } catch (e) { /* keep old list */ } viewReviewers(id); };
  const submitDecision = async (rec) => {
    const f = $('#override-form');
    try { await api(`/claims/${encodeURIComponent(id)}/override`, { body: { corrected_recommendation: rec, reason: f.elements.reason.value, reviewer: f.elements.reviewer.value } }); toast(rec === c.effective_recommendation ? 'Confirmed and recorded.' : 'Override recorded.'); user.name = f.elements.reviewer.value.trim() || user.name; refresh(); } catch (e) { fail(e); }
  };
  if (editable) {
    $('#override-form').addEventListener('submit', (e) => { e.preventDefault(); submitDecision($('#override-form').elements.rec.value); });
    $('#do-confirm').addEventListener('click', () => submitDecision(c.effective_recommendation));
    $('#edit-facts').addEventListener('click', () => {
      $('#facts-box').innerHTML = factsTable(c, true);
      $('#facts-actions').innerHTML = `<label class="f" style="margin-top:12px">Why are you correcting these facts?<input type="text" id="fact-reason" placeholder="For example: photo shows a bandage"></label>
        <div class="row" style="margin-top:10px"><button class="btn btn-rust btn-sm" id="save-facts">Save and re-run policy</button><button class="btn btn-ghost btn-sm" id="cancel-facts">Cancel</button></div>`;
      $('#cancel-facts').addEventListener('click', () => reviewDetail(id));
      $('#save-facts').addEventListener('click', async () => {
        const changes = {};
        c.fields.forEach((f) => { const el = $(`[name="fact_${f.field}"]`); const now = el.value; const was = fv(f.value); if (now !== was) changes[f.field] = now; });
        if (!Object.keys(changes).length) return toast('Nothing changed.');
        try { await api(`/claims/${encodeURIComponent(id)}/facts`, { body: { changes, reason: $('#fact-reason').value, reviewer: user.name } }); toast('Facts corrected and the policy re-run.'); refresh(); } catch (e) { fail(e); }
      });
    });
  }
  $('#outcome-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    try { await api(`/claims/${encodeURIComponent(id)}/outcome`, { body: { final_outcome: f.elements.final_outcome.value, source: f.elements.source.value, note: f.elements.note.value, recorded_by: user.name } }); toast('Outcome recorded.'); reviewDetail(id); } catch (err) { fail(err); }
  });
}

// ---- policy owner ---------------------------------------------------
let draft = null, policyInfo = null, jsonMode = false, editorOpen = false, lastParse = null, parseMode = 'replace';
const OUT_LABEL = { human_review: 'Human review', request_information: 'Request information' };
function ruleSentence(r) {
  const conds = condList(r).map((c) => `${c.field} ${(OPS.find((o) => o[0] === c.op) || [, c.op])[1]}${noValue(c.op) ? '' : ` ${Array.isArray(c.value) ? c.value.join(', ') : c.value}`}`).join(' and ');
  return `${conds}${r.blank_counts_as_match ? ' or is blank' : ''}`;
}
const OPS = [['is_true', 'is yes'], ['is_false', 'is no'], ['eq', 'equals'], ['neq', 'does not equal'], ['gt', 'greater than'], ['gte', 'at least'], ['lt', 'less than'], ['lte', 'at most'], ['in', 'is one of'], ['not_in', 'is none of']];
const noValue = (op) => op === 'is_true' || op === 'is_false';
function condList(rule) { const w = rule.when; return Array.isArray(w) ? w : (w.all || [w]); }
function viewPolicy() {
  gate('Policy owner', 'Draft a rule change, see exactly which past and pending claims it moves, then publish with an approver. Published versions never change.', async () => {
    try { policyInfo = await api('/policy'); } catch (e) { return fail(e); }
    const latest = policyInfo.versions[policyInfo.versions.length - 1];
    if (!draft || draft.base !== latest.version) draft = { base: latest.version, title: latest.title, note: '', rules: JSON.parse(JSON.stringify(latest.rules)), default: latest.default };
    drawPolicy();
  });
}
function parseReport() {
  if (!lastParse) return '';
  const r = lastParse;
  const rows = r.lines.filter((l) => l.status !== 'ignored' || !/comment|heading/.test(l.detail));
  const list = rows.map((l) => `<div class="pl ${esc(l.status)}"><span class="mono">${l.n}</span><span>${esc(l.text)}</span><span class="d">${esc(l.status === 'ok' ? l.detail : l.detail)}</span></div>`).join('');
  const head = r.has_errors
    ? '<div class="notice"><strong>Some lines could not be read, so the draft was not changed.</strong> Fix the lines marked in red and upload again. Nothing is guessed.</div>'
    : `<div class="notice calm"><strong>${r.draft.rules.length} rules are in the draft below.</strong> Check the list, then preview the impact.${r.notes.length ? `<br>${r.notes.map(esc).join('<br>')}` : ''}</div>`;
  return `${head}${r.warnings.filter((w) => !/^Line /.test(w)).map((w) => `<div class="caption">${esc(w)}</div>`).join('')}<div class="plist">${list}</div>`;
}
function drawPolicy() {
  const latest = policyInfo.versions[policyInfo.versions.length - 1];
  const next = `v${parseInt(latest.version.slice(1), 10) + 1}`;
  const fieldOpts = (sel) => Object.entries(policyInfo.fields).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(k)}</option>`).join('');
  $('#main').innerHTML = `<div class="wrap page"><div class="page-head"><div><div class="eyebrow">POLICY CHANGES</div><h1>Policy ${esc(latest.version)} is live.</h1>
    <p>Rules run top to bottom and the first match decides. This page drafts the <strong>next</strong> version: edit a copy below, preview its effect against the live ${esc(latest.version)}, then publish it as ${next}.</p>
    ${policyInfo.versions.length > 1 ? `<p class="caption" style="margin-top:8px">To see what ${esc(latest.version)} changed compared with v1, open <a href="#/business">Business case</a> and its Policy impact tab.</p>` : ''}</div>
    <div class="ver-strip">${policyInfo.versions.map((p) => `<span class="version-tag"${p.version === latest.version ? ' style="background:var(--ink);color:var(--paper)"' : ''}>${esc(p.version)}${p.meta && p.meta.approved_by ? ` · approved by ${esc(p.meta.approved_by)}` : ''}</span>`).join('')}</div></div>
    <div class="grid2 wide" style="align-items:start"><div class="stack">
      <div class="card pad stack"><div><h2 style="font-size:28px">Upload a policy document</h2>
        <p class="muted" style="margin-top:6px">A .txt, .md or .docx written in plain sentences, one rule per line, for example <span class="mono">Send to human_review if quote_eur is greater than 1200</span>. <a href="/policy_template.txt" download>Download the template</a>.</p></div>
        <div class="row"><label class="row" style="gap:6px;font-size:14px"><input type="radio" name="mode" value="replace"${parseMode === 'replace' ? ' checked' : ''}> This document is the whole policy</label>
          <label class="row" style="gap:6px;font-size:14px"><input type="radio" name="mode" value="add"${parseMode === 'add' ? ' checked' : ''}> Add these rules to the current ones</label></div>
        <label class="drop" id="doc-drop" tabindex="0"><input type="file" id="doc-file" accept=".txt,.md,.docx" class="hide"><h3>Choose a policy document</h3><p class="muted">or drop it here</p></label>
        ${parseReport()}</div>
      <div class="row between"><h2 style="font-size:30px">Draft ${next}</h2><button class="btn btn-ghost btn-sm" id="reset">Start again from ${esc(latest.version)}</button></div>
      <ol class="sentences">${draft.rules.map((r, i) => `<li><span class="ord">${i + 1}</span><div><span class="pill ${esc(r.outcome)}">${esc(OUT_LABEL[r.outcome] || r.outcome)}</span> <span class="mono">if ${esc(ruleSentence(r))}</span><div class="why">${esc(r.reason)}</div></div></li>`).join('')}
        <li class="last"><span class="ord">·</span><div><span class="pill routine_processing">Routine processing</span> <span class="mono">otherwise</span></div></li></ol>
      <details class="card pad" id="editor"${editorOpen || jsonMode ? ' open' : ''}><summary style="cursor:pointer;font-weight:500">Edit rules by hand</summary>
        <div class="stack" style="margin-top:14px"><div class="row"><button class="btn btn-ghost btn-sm" id="json-toggle">${jsonMode ? 'Back to editor' : 'Edit as JSON'}</button></div>
      ${jsonMode ? `<textarea id="json-area" style="min-height:420px;font:12.5px var(--mono)">${esc(JSON.stringify({ title: draft.title, rules: draft.rules, default: draft.default }, null, 2))}</textarea><div><button class="btn btn-ink btn-sm" id="json-apply">Apply JSON</button></div>`
      : `<div id="rules" class="stack">${draft.rules.map((r, ri) => `<div class="rule" data-ri="${ri}"><div class="rule-top"><span class="ord">${ri + 1}</span>
        <input type="text" data-k="id" value="${esc(r.id)}" aria-label="Rule id"><select data-k="outcome" aria-label="Outcome"><option value="human_review"${r.outcome === 'human_review' ? ' selected' : ''}>Human review</option><option value="request_information"${r.outcome === 'request_information' ? ' selected' : ''}>Request information</option></select>
        <span class="row" style="gap:4px"><button class="icon-btn" data-act="up" title="Move up" aria-label="Move up">↑</button><button class="icon-btn" data-act="down" title="Move down" aria-label="Move down">↓</button><button class="icon-btn" data-act="del" title="Remove rule" aria-label="Remove rule">×</button></span></div>
        <input type="text" data-k="reason" value="${esc(r.reason)}" placeholder="Plain-language reason shown to reviewers" aria-label="Reason">
        ${condList(r).map((c, ci) => `<div class="cond" data-ci="${ci}"><select data-c="field">${fieldOpts(c.field)}</select><select data-c="op">${OPS.map(([o, t]) => `<option value="${o}"${c.op === o ? ' selected' : ''}>${t}</option>`).join('')}</select>
          <input type="text" data-c="value" value="${esc(Array.isArray(c.value) ? c.value.join(', ') : c.value ?? '')}"${noValue(c.op) ? ' disabled placeholder="no value"' : ''} aria-label="Value"><button class="icon-btn" data-act="delcond" title="Remove condition" aria-label="Remove condition">×</button></div>`).join('')}
        <div class="row"><button class="btn btn-ghost btn-sm" data-act="addcond">Add condition (all must hold)</button>${r.outcome === 'request_information' ? `<label class="row" style="gap:6px;font-size:13px"><input type="checkbox" data-k="blank_counts_as_match"${r.blank_counts_as_match ? ' checked' : ''}> A blank counts as missing</label>` : ''}</div></div>`).join('')}
        <div class="rule" style="background:var(--sand)"><div class="row between"><strong>${esc(draft.default.id)}</strong>${pill('routine_processing')}</div><p class="muted" style="font-size:13px">${esc(draft.default.reason)}</p></div></div>
        <div><button class="btn btn-ghost" id="add-rule">Add a rule</button></div>`}
        </div></details>
      <div class="row"><button class="btn btn-ink" id="preview">Preview impact</button></div></div>
      <div class="stack"><div id="impact" class="card pad"><h3 style="font-size:24px">Impact preview</h3><p class="muted" style="margin-top:6px">Nothing has changed yet. Preview shows which open claims would move and confirms closed claims stay as they are.</p></div></div></div></div>`;
  bindPolicy(next);
}
function bindPolicy(next) {
  const redraw = () => drawPolicy();
  $('#reset').addEventListener('click', () => { draft = null; lastParse = null; viewPolicy(); });
  $('#editor').addEventListener('toggle', (e) => { editorOpen = e.target.open; });
  $$('input[name=mode]').forEach((r) => r.addEventListener('change', () => { parseMode = r.value; }));
  const doc = $('#doc-file'), drop = $('#doc-drop');
  const readDoc = async (file) => {
    try {
      const r = await api(`/policy/parse?mode=${parseMode}`, { body: await file.arrayBuffer() });
      lastParse = r;
      if (r.has_errors) toast('Some lines could not be read. The draft was not changed.', true);
      else { draft.rules = r.draft.rules; draft.title = r.draft.title || draft.title; draft.default = r.draft.default; toast(`${r.draft.rules.length} rules read from ${file.name}.`); }
      redraw();
    } catch (e) { fail(e); }
  };
  doc.addEventListener('change', () => doc.files[0] && readDoc(doc.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); e.dataTransfer.files[0] && readDoc(e.dataTransfer.files[0]); });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doc.click(); } });
  $('#json-toggle').addEventListener('click', () => { jsonMode = !jsonMode; redraw(); });
  if (jsonMode) {
    $('#json-apply').addEventListener('click', () => { try { const j = JSON.parse($('#json-area').value); draft.rules = j.rules; draft.title = j.title || draft.title; draft.default = j.default || draft.default; jsonMode = false; toast('JSON applied.'); redraw(); } catch (e) { fail(new Error(`That is not valid JSON: ${e.message}`)); } });
  } else {
    $('#add-rule').addEventListener('click', () => { draft.rules.push({ id: `R1.new_rule_${draft.rules.length + 1}`, outcome: 'human_review', reason: 'Describe why this needs review.', when: [{ field: 'quote_eur', op: 'gt', value: 1000 }] }); redraw(); });
    $('#rules').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const rEl = b.closest('.rule'), ri = Number(rEl.dataset.ri), act = b.dataset.act;
      if (act === 'del') draft.rules.splice(ri, 1);
      if (act === 'up' && ri > 0) [draft.rules[ri - 1], draft.rules[ri]] = [draft.rules[ri], draft.rules[ri - 1]];
      if (act === 'down' && ri < draft.rules.length - 1) [draft.rules[ri + 1], draft.rules[ri]] = [draft.rules[ri], draft.rules[ri + 1]];
      if (act === 'addcond') { const w = condList(draft.rules[ri]); w.push({ field: 'quote_eur', op: 'gt', value: 1000 }); draft.rules[ri].when = w; }
      if (act === 'delcond') { const w = condList(draft.rules[ri]); if (w.length > 1) { w.splice(Number(b.closest('.cond').dataset.ci), 1); draft.rules[ri].when = w; } else return toast('A rule needs at least one condition.', true); }
      redraw();
    });
    $('#rules').addEventListener('change', (e) => {
      const rEl = e.target.closest('.rule'); if (!rEl || rEl.dataset.ri === undefined) return;
      const rule = draft.rules[Number(rEl.dataset.ri)], t = e.target;
      if (t.dataset.k) { rule[t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.k === 'outcome') redraw(); }
      if (t.dataset.c) {
        const w = condList(rule), c = w[Number(t.closest('.cond').dataset.ci)];
        if (t.dataset.c === 'value') {
          const raw = t.value.trim();
          if (['gt', 'gte', 'lt', 'lte'].includes(c.op)) c.value = raw === '' ? '' : Number(raw);
          else if (c.op === 'in' || c.op === 'not_in') c.value = raw.split(',').map((s) => s.trim()).filter(Boolean);
          else c.value = raw;
        } else { c[t.dataset.c] = t.value; if (t.dataset.c === 'op') { if (noValue(t.value)) delete c.value; else if (c.value === undefined) c.value = ''; redraw(); } }
        rule.when = w;
      }
    });
  }
  $('#preview').addEventListener('click', async () => {
    try {
      const pv = await api('/policy/preview', { body: { draft: draftBody() } });
      const changed = pv.rows.filter((r) => r.changed);
      $('#impact').innerHTML = `<h3 style="font-size:24px">Impact preview: ${esc(pv.from_version)} to ${esc(pv.to_version)}</h3>
        <div class="grid3" style="margin:14px 0"><div><div class="big" style="font:500 36px var(--serif)">${pv.open_claims}</div><div class="muted">open claims checked</div></div><div><div class="big" style="font:500 36px var(--serif);color:var(--rust)">${pv.changed}</div><div class="muted">would change</div></div><div><div class="big" style="font:500 36px var(--serif)">${pv.closed_untouched}</div><div class="muted">closed, untouched</div></div></div>
        <div class="moves">${Object.entries(pv.moves).map(([k, n]) => `<span class="move">${esc(k)}: ${n}</span>`).join('') || '<span class="muted">No recommendation would change.</span>'}</div>
        ${pv.warnings.map((w) => `<div class="notice" style="margin-bottom:8px">${esc(w)}</div>`).join('')}
        ${changed.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>case</th><th>from</th><th>to</th><th>new rule</th></tr></thead><tbody>${changed.map((r) => `<tr><td class="m">${esc(r.case_id)}</td><td>${pill(r.from)}</td><td>${pill(r.to)}</td><td class="m">${esc(r.rule_to)}</td></tr>`).join('')}</tbody></table></div>` : ''}
        <hr class="rule"><h3 style="font-size:22px">Publish ${esc(pv.to_version)}</h3>
        <form id="publish" class="stack" style="margin-top:10px"><label class="f">Author<input type="text" name="by" value="${esc(user.name)}" required></label><label class="f">Approved by <small>a second person</small><input type="text" name="appr" required></label>
        <label class="f">What changed and why<textarea name="note" required></textarea></label><button class="btn btn-rust" type="submit">Publish ${esc(pv.to_version)}</button>
        <p class="caption">Open claims are re-decided and flagged for recheck. Closed claims are never touched.</p></form>`;
      $('#publish').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = e.target;
        if (!window.confirm(`Publish ${pv.to_version}? This cannot be undone. Open claims will be re-decided.`)) return;
        try { const res = await api('/policy/publish', { body: { draft: draftBody(), published_by: f.by.value, approved_by: f.appr.value, note: f.note.value } });
          toast(`${res.version} published. ${res.applied.open_changed} open claims flagged for recheck.`); draft = null; viewPolicy(); } catch (err) { fail(err); }
      });
    } catch (e) { fail(e); }
  });
}
function draftBody() { return { title: draft.title, rules: draft.rules, default: draft.default, note: draft.note }; }

// ---- business -------------------------------------------------------
let bizTab = 'history', bizFilter = { status: '', q: '' };
function csvText(rows) { return rows.map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); }
function download(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); }
function viewBusiness() {
  gate('Operations', 'Full claim history, what each policy change did to old and new claims, and the error rates for the business case.', async () => {
    let claims, impact, q, audit;
    try { [claims, impact, q, audit] = await Promise.all([api('/claims'), api('/impact'), api('/quality'), api('/audit')]); } catch (e) { return fail(e); }
    const list = claims.claims;
    const tab = (k, t) => `<button role="tab" aria-selected="${bizTab === k}" data-t="${k}">${t}</button>`;
    let body = '';
    if (bizTab === 'history') {
      const rows = list.filter((c) => (!bizFilter.status || c.case_status === bizFilter.status) && (!bizFilter.q || `${c.case_id} ${c.summary}`.toLowerCase().includes(bizFilter.q.toLowerCase())));
      body = `<div class="row between" style="margin-bottom:12px"><div class="row"><select id="b-status" style="width:auto"><option value="">All claims</option><option value="open"${bizFilter.status === 'open' ? ' selected' : ''}>Open</option><option value="closed"${bizFilter.status === 'closed' ? ' selected' : ''}>Closed</option></select>
        <input type="search" id="b-q" placeholder="Search" value="${esc(bizFilter.q)}" style="width:220px"></div><button class="btn btn-ghost btn-sm" id="b-export">Export CSV</button></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>case</th><th>status</th><th>summary</th><th>quote</th><th>v1</th><th>latest</th><th>decided by</th><th>recheck</th></tr></thead><tbody>${rows.map((c) => `<tr class="clickable" data-id="${esc(c.case_id)}"><td class="m">${esc(c.case_id)}</td><td>${statusPill(c.case_status)}</td><td style="max-width:300px">${esc(c.summary)}</td><td class="m">${esc(money(c.quote_eur))}</td><td>${pill(c.recommendation_v1)}</td>
          <td>${pill(c.effective_recommendation)}<div class="mono faint">${esc(c.rule)}</div></td><td class="m">${esc(c.effective_source.replace('_', ' '))}</td><td>${c.recheck_pending ? '<span class="pill pending">pending</span>' : ''}</td></tr>`).join('')}</tbody></table></div><p class="caption">${rows.length} of ${list.length} claims. Click a row to open it in the review queue.</p>`;
    } else if (bizTab === 'impact') {
      const only1 = impact.versions.length === 1;
      body = only1 ? `<div class="card empty"><h3>No policy change yet</h3><p>Publish a new version on the Policy changes page and its effect shows up here.</p></div>` : `<div class="stack"><div class="grid3 four">
        <div class="card stat"><div class="big">${impact.open_claims}</div><div class="lab">open claims re-decided under ${esc(impact.latest_version)}</div></div>
        <div class="card stat"><div class="big bad">${impact.recheck_total}</div><div class="lab">changed and flagged for recheck</div></div>
        <div class="card stat"><div class="big">${impact.recheck_pending}</div><div class="lab">still waiting for a reviewer</div></div>
        <div class="card stat"><div class="big">${impact.closed_claims}</div><div class="lab">closed claims left exactly as decided</div></div></div>
        <div class="card pad"><div class="eyebrow">WHERE THE OPEN CLAIMS MOVED</div><div class="moves">${Object.entries(impact.moves).map(([k, n]) => `<span class="move">${esc(k)}: ${n}</span>`).join('') || '<span class="muted">Nothing moved.</span>'}</div>
          <div class="table-wrap"><table class="data"><thead><tr><th>case</th><th>from</th><th>to</th><th>versions</th><th>status</th></tr></thead><tbody>${impact.rechecks.map((r) => `<tr class="clickable" data-id="${esc(r.case_id)}"><td class="m">${esc(r.case_id)}</td><td>${pill(r.from_recommendation)}</td><td>${pill(r.to_recommendation)}</td><td class="m">${esc(r.from_version)} to ${esc(r.to_version)}</td><td><span class="pill ${r.status === 'pending' ? 'pending' : 'closed'}">${esc(r.status)}</span></td></tr>`).join('')}</tbody></table></div></div>
        <div class="notice calm">For new claims: every claim that arrives now is decided under ${esc(impact.latest_version)} and carries that version. To see the effect of a change before it goes live, use the preview on the Policy changes page.</div></div>`;
    } else if (bizTab === 'rates') {
      const vs = Object.values(q.versions).filter((v) => v.labelled_cases);
      body = `<div class="card pad stack"><p class="muted prose">These are the measured error rates the business case should use, taken from labelled cases. Rates are shares of all labelled cases. A wrong routine recommendation is the expensive error, so it is listed first.</p>
        <div class="table-wrap"><table class="data"><thead><tr><th>policy</th><th>labelled</th><th>wrong routine</th><th>wrong routine rate</th><th>unnecessary escalations</th><th>unnecessary rate</th><th>accuracy</th></tr></thead><tbody>${vs.map((v) => `<tr><td class="m">${esc(v.policy_version)}</td><td class="m">${v.n}</td><td class="m">${v.incorrect_routine}</td><td class="m rust">${pct(v.incorrect_routine_rate)}</td><td class="m">${v.unnecessary_human_review}</td><td class="m">${pct(v.unnecessary_human_review_rate)}</td><td class="m">${pct(v.accuracy)}</td></tr>`).join('')}</tbody></table></div>
        <div><button class="btn btn-ghost btn-sm" id="r-export">Export for the spreadsheet</button></div>
        <p class="caption">With only 14 labelled cases these rates are a starting point. Treat zero errors as “none seen yet”, not as zero risk.</p>
        <hr class="rule"><div class="eyebrow">ADD LABELS</div><p class="muted" style="margin:6px 0 10px">Import a labelled CSV with expected_v1 and, once v2 exists, expected_v2, to measure a new policy version.</p>
        <div class="row"><input type="file" id="lab-file" accept=".csv,text/csv"><button class="btn btn-ghost btn-sm" id="lab-go">Import labels</button></div></div>`;
    } else {
      body = `<div class="card pad"><div class="eyebrow">ACTIVITY LOG</div><div class="table-wrap" style="margin-top:10px"><table class="data"><thead><tr><th>time</th><th>event</th><th>case</th><th>by</th><th>version</th><th>detail</th></tr></thead><tbody>${audit.events.map((e) => `<tr><td class="m">${esc(fmtTime(e.at))}</td><td>${esc(e.type.replace('_', ' '))}</td><td class="m">${esc(e.case_id)}</td><td>${esc(e.by)}</td><td class="m">${esc(e.policy_version)}</td><td>${esc(e.detail)}</td></tr>`).join('') || '<tr><td colspan="6" class="dim">Nothing recorded yet.</td></tr>'}</tbody></table></div></div>`;
    }
    $('#main').innerHTML = `<div class="wrap page"><div class="page-head"><div><div class="eyebrow">BUSINESS CASE</div><h1>The whole picture.</h1><p>Every claim, open or closed, and what each policy change did to it.</p></div>
      <div class="tabs" role="tablist">${tab('history', 'Claim history')}${tab('impact', 'Policy impact')}${tab('rates', 'Error rates')}${tab('log', 'Activity log')}</div></div>${body}</div>`;
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => { bizTab = b.dataset.t; viewBusiness(); }));
    $$('tr.clickable').forEach((r) => r.addEventListener('click', () => { location.hash = `#/reviewers/${encodeURIComponent(r.dataset.id)}`; }));
    const st = $('#b-status'); if (st) st.addEventListener('change', (e) => { bizFilter.status = e.target.value; viewBusiness(); });
    const qq = $('#b-q'); if (qq) qq.addEventListener('change', (e) => { bizFilter.q = e.target.value; viewBusiness(); });
    const ex = $('#b-export'); if (ex) ex.addEventListener('click', () => download('claim_history.csv', csvText([['case_id', 'status', 'summary', 'quote_eur', 'recommendation_v1', 'latest_recommendation', 'policy_version', 'rule', 'decided_by', 'recheck_pending']].concat(list.map((c) => [c.case_id, c.case_status, c.summary, c.quote_eur, c.recommendation_v1, c.effective_recommendation, c.policy_version, c.rule, c.effective_source, c.recheck_pending])))));
    const lg = $('#lab-go'); if (lg) lg.addEventListener('click', () => {
      const f = $('#lab-file').files[0]; if (!f) return toast('Choose a CSV file first.', true);
      const rd = new FileReader(); rd.onload = async () => { try { const r = await api('/labelled-import', { body: String(rd.result) }); toast(`Labels imported. New claims: ${r.added.length}, existing updated: ${r.skipped_existing.length}.`); viewBusiness(); } catch (e) { fail(e); } }; rd.readAsText(f);
    });
    const rx = $('#r-export'); if (rx) rx.addEventListener('click', () => download('error_rates.csv', csvText([['policy', 'labelled', 'wrong_routine', 'wrong_routine_rate', 'unnecessary_escalations', 'unnecessary_rate', 'accuracy']].concat(Object.values(q.versions).filter((v) => v.labelled_cases).map((v) => [v.policy_version, v.n, v.incorrect_routine, v.incorrect_routine_rate, v.unnecessary_human_review, v.unnecessary_human_review_rate, v.accuracy])))));
  });
}

// ------------------------------------------------------------------ router
const routes = [
  [/^$/, () => viewHome()], [/^triage$/, () => viewTriage('single')], [/^triage\/batch$/, () => viewTriage('batch')],
  [/^claim$/, () => viewClaim('')], [/^claim\/(.+)$/, (m) => viewClaim(decodeURIComponent(m[1]))],
  [/^reviewers$/, () => viewReviewers('')], [/^reviewers\/(.+)$/, (m) => viewReviewers(decodeURIComponent(m[1]))],
  [/^policy$/, () => viewPolicy()], [/^business$/, () => viewBusiness()],
];
let lastRoute = '';
function route() {
  const path = location.hash.replace(/^#\/?/, '');
  const same = lastRoute.split('/')[0] === path.split('/')[0] && path.startsWith('reviewers') && lastRoute.startsWith('reviewers') && $('#detail');
  lastRoute = path;
  const base = path.split('/')[0];
  $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === base || (base === 'claim' && a.dataset.nav === 'triage')));
  if (same && path !== 'reviewers') { $$('.q-item').forEach((b) => b.setAttribute('aria-current', String(decodeURIComponent(path.split('/')[1]) === b.dataset.id))); reviewDetail(decodeURIComponent(path.split('/')[1])); return; }
  const hit = routes.find(([re]) => re.test(path));
  (hit ? hit[1](path.match(hit[0])) : viewHome());
  if (!same) { window.scrollTo(0, 0); }
}
window.addEventListener('hashchange', route);
$('#to-top').addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: 0 }); });
api('/health').then((h) => { $('#foot-version').textContent = h.policy_version; }).catch(() => {});
route();
})();
