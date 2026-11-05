/* Croqi – application mobile */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const SESSION_KEY = 'croqi.session';

let api = null, session = null, state = null, history = [];
let portions = 1, plan = [], planDirty = false, histFilter = 'ALL', pollT = null;

/* ---------- utilitaires ---------- */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}
function ago(iso) {
  if (!iso) return '–';
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 6e4));
  if (m < 1) return "à l'instant";
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return h + ' h ' + (r ? String(r).padStart(2, '0') : '');
  return Math.floor(h / 24) + ' j ' + (h % 24) + ' h';
}
const hhmm = d => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
function dayLabel(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - x) / 864e5);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  return x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICON = {
  warn: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>',
  meal: '<svg viewBox="0 0 24 24"><path d="M3 12h18a9 9 0 0 1-18 0z"/><path d="M8 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4"/></svg>',
  pass: '<svg viewBox="0 0 24 24"><circle cx="7" cy="8" r="2"/><circle cx="17" cy="8" r="2"/><circle cx="4" cy="14" r="2"/><circle cx="20" cy="14" r="2"/><path d="M12 13c-3 0-5 3-5 5s2 2 5 2 5 0 5-2-2-5-5-5z"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg>'
};

/* ---------- connexion ---------- */
function showLogin(msg) {
  stopPoll();
  $('#app').hidden = true; $('#login').hidden = false;
  const last = store.get('croqi.lastServer');
  if (last) $('#lgServer').value = last;
  $('#loginErr').textContent = msg || '';
}
async function startApp(sess) {
  session = sess;
  api = sess.demo ? new DemoApi() : new HttpApi(sess.server, sess.token);
  $('#login').hidden = true; $('#app').hidden = false;
  $('#whoUser').textContent = sess.user;
  $('#whoServer').textContent = sess.demo ? 'Démo (simulation locale)' : sess.server;
  renderDemoExtras();
  showTab('home');
  await refresh();
  startPoll();
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const user = $('#lgUser').value.trim(), pass = $('#lgPass').value;
  let server = $('#lgServer').value.trim();
  if (!server) { $('#loginErr').textContent = "Indique l'adresse du serveur, ou essaie le mode démo."; return; }
  if (!/^https?:\/\//.test(server)) server = 'http://' + server;
  const btn = e.submitter || $('#loginForm .btn-primary');
  btn.disabled = true; btn.textContent = 'Connexion…'; $('#loginErr').textContent = '';
  try {
    const a = new HttpApi(server);
    await a.login(user, pass);
    store.set('croqi.lastServer', server);
    const sess = { server, token: a.token, user, demo: false };
    store.set(SESSION_KEY, sess);
    $('#lgPass').value = '';
    await startApp(sess);
  } catch (err) {
    $('#loginErr').textContent = err.message;
  } finally { btn.disabled = false; btn.textContent = 'Se connecter'; }
});
$('#demoBtn').addEventListener('click', () => {
  const sess = { demo: true, user: 'demo', server: '' };
  store.set(SESSION_KEY, sess);
  startApp(sess);
});
$('#logout').addEventListener('click', async () => {
  if (api) await api.logout();
  store.del(SESSION_KEY); api = null; state = null;
  showLogin();
});

/* ---------- onglets ---------- */
function showTab(name) {
  $$('.tab').forEach(t => t.hidden = t.id !== 'tab-' + name);
  $$('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  window.scrollTo(0, 0);
  if (name === 'hist') loadHistory();
  if (name === 'plan' && !planDirty && state) { plan = state.schedule.map(m => ({ ...m })); renderPlan(); }
}
$$('.tabbar button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* ---------- données ---------- */
async function refresh() {
  try {
    state = await api.getState();
    renderHome(); renderSettings();
    if (!planDirty) { plan = state.schedule.map(m => ({ ...m })); renderPlan(); }
    setLink(state.linked ? (api.demo ? 'demo' : 'ok') : 'nodev');
  } catch (err) {
    if (err.auth) { store.del(SESSION_KEY); return showLogin(err.message); }
    setLink('off');
  }
}
function setLink(k) {
  const p = $('#linkPill');
  p.className = 'pill ' + ({ ok: 'ok', demo: 'demo', off: 'off', nodev: 'off' }[k]);
  $('#linkTxt').textContent = { ok: 'En ligne', demo: 'Démo', off: 'Serveur hors ligne', nodev: 'Objet déconnecté' }[k];
  $('#whoLink').textContent = { ok: 'Distributeur relié', demo: 'Simulé', off: 'Serveur injoignable', nodev: 'Distributeur non relié' }[k];
}
function startPoll() { stopPoll(); pollT = setInterval(() => { if (!document.hidden) refresh(); }, 10000); }
function stopPoll() { clearInterval(pollT); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && api) refresh(); });

/* ---------- accueil ---------- */
function renderHome() {
  const s = state;
  // jauge
  const lvl = Math.max(0, Math.min(100, s.level));
  $('#lvl').textContent = lvl + '%';
  $('#gaugeFill').style.strokeDashoffset = 314.16 * (1 - lvl / 100);
  const low = lvl < s.settings.lowPct, crit = lvl < 8;
  $('#gauge').className = 'gauge' + (crit ? ' crit' : low ? ' low' : '');
  $('#gauge').setAttribute('aria-label', 'Niveau de croquettes : ' + lvl + ' %');
  $('#lvlLabel').textContent = crit ? 'Presque vide' : low ? 'Niveau bas' : lvl > 70 ? 'Bien rempli' : 'Correct';
  const g = s.grams ?? Math.round(lvl / 100 * TANK_G);
  $('#lvlGrams').textContent = `≈ ${(g / 1000).toFixed(1).replace('.', ',')} kg · ${Math.floor(g / PORTION_G)} portions restantes`;

  // stats
  $('#lastMeal').textContent = s.lastMeal ? ago(s.lastMeal) : '–';
  $('#lastMealAt').textContent = s.lastMeal ? `à ${hhmm(s.lastMeal)} · ${s.lastMealPortions || '?'} portion${s.lastMealPortions > 1 ? 's' : ''}` : 'Aucun repas';
  $('#passes').textContent = s.passesToday;
  $('#lastPass').textContent = s.lastPass ? 'dernier il y a ' + ago(s.lastPass) : '–';

  // alertes
  const al = [];
  if (low) al.push(['warn', `Plus que ${lvl} % de croquettes. Pense à remplir le réservoir.`]);
  const hungerMin = s.lastMeal ? (Date.now() - new Date(s.lastMeal)) / 6e4 : Infinity;
  if (hungerMin > s.settings.hungerH * 60) al.push(['bad', `Aucun repas depuis plus de ${s.settings.hungerH} h.`]);
  if (!s.linked) al.push(['bad', "Le distributeur n'est pas relié au serveur. Les repas programmés continuent sur l'appareil."]);
  $('#alerts').innerHTML = al.map(([k, m]) => `<div class="alert ${k}">${ICON.warn}<span>${esc(m)}</span></div>`).join('');

  // mode
  $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === s.mode));
  $('#modeHint').textContent = s.mode === 'AUTO' ? 'Le planning sert les repas' : 'Repas uniquement à la demande';
  const nx = nextMeal(s.schedule);
  $('#nextMeal').innerHTML = s.mode === 'AUTO' && nx
    ? `Prochain repas <b>${nx.time}</b> · ${nx.portions} portion${nx.portions > 1 ? 's' : ''} (≈ ${nx.portions * PORTION_G} g)${nx.tomorrow ? ' demain' : ''}`
    : s.mode === 'AUTO' ? 'Aucun repas programmé' : '';
  renderServe();
}
function nextMeal(sch) {
  if (!sch || !sch.length) return null;
  const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
  const sorted = [...sch].sort((a, b) => a.time.localeCompare(b.time));
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const n = sorted.find(m => toMin(m.time) > cur);
  return n ? n : { ...sorted[0], tomorrow: true };
}
function renderServe() {
  $('#pCount').textContent = portions;
  $('#pGrams').textContent = `≈ ${portions * PORTION_G} g`;
  $('#serveBtn').textContent = `Servir ${portions} portion${portions > 1 ? 's' : ''}`;
  $('#pMinus').disabled = portions <= 1; $('#pPlus').disabled = portions >= MAX_PORTIONS;
}
$('#pMinus').addEventListener('click', () => { portions = Math.max(1, portions - 1); renderServe(); });
$('#pPlus').addEventListener('click', () => { portions = Math.min(MAX_PORTIONS, portions + 1); renderServe(); });
$('#serveBtn').addEventListener('click', async () => {
  const b = $('#serveBtn'); b.disabled = true; b.textContent = 'Distribution…';
  try {
    await api.dispense(portions);
    navigator.vibrate?.(30);
    toast(`${portions} portion${portions > 1 ? 's' : ''} servie${portions > 1 ? 's' : ''}`);
    await refresh();
  } catch (err) { toast(err.message); }
  finally { b.disabled = false; renderServe(); }
});
$$('.seg button').forEach(b => b.addEventListener('click', async () => {
  if (!state || state.mode === b.dataset.mode) return;
  const prev = state.mode; state.mode = b.dataset.mode; renderHome();
  try { await api.setMode(b.dataset.mode); toast(b.dataset.mode === 'AUTO' ? 'Mode automatique' : 'Mode manuel'); await refresh(); }
  catch (err) { state.mode = prev; renderHome(); toast(err.message); }
}));

/* ---------- planning ---------- */
function renderPlan() {
  const list = $('#planList');
  if (!plan.length) list.innerHTML = '<div class="plan-empty">Aucun repas programmé</div>';
  else list.innerHTML = plan.map((m, i) => `
    <div class="meal">
      <input type="time" value="${m.time}" data-i="${i}" aria-label="Heure du repas ${i + 1}">
      <div>
        <div class="stepper">
          <button type="button" data-i="${i}" data-d="-1" aria-label="Moins" ${m.portions <= 1 ? 'disabled' : ''}>−</button>
          <output>${m.portions}</output>
          <button type="button" data-i="${i}" data-d="1" aria-label="Plus" ${m.portions >= MAX_PORTIONS ? 'disabled' : ''}>+</button>
        </div>
        <div class="por">portion${m.portions > 1 ? 's' : ''} · ${m.portions * PORTION_G} g</div>
      </div>
      <button type="button" class="del" data-del="${i}" aria-label="Supprimer le repas de ${m.time}">${ICON.trash}</button>
    </div>`).join('');
  const tot = plan.reduce((a, m) => a + m.portions, 0);
  $('#planTotal').textContent = plan.length ? `${plan.length} repas · ${tot} portions · ≈ ${tot * PORTION_G} g par jour` : '';
  $('#addMeal').hidden = plan.length >= MAX_MEALS;
  $('#savePlan').disabled = !planDirty;
}
$('#planList').addEventListener('click', e => {
  const st = e.target.closest('[data-d]'), del = e.target.closest('[data-del]');
  if (st) { const m = plan[+st.dataset.i]; m.portions = Math.min(MAX_PORTIONS, Math.max(1, m.portions + +st.dataset.d)); }
  else if (del) plan.splice(+del.dataset.del, 1);
  else return;
  planDirty = true; renderPlan();
});
$('#planList').addEventListener('change', e => {
  if (e.target.type === 'time' && e.target.value) { plan[+e.target.dataset.i].time = e.target.value; planDirty = true; renderPlan(); }
});
$('#addMeal').addEventListener('click', () => {
  const last = plan.length ? plan[plan.length - 1].time : '07:00';
  const h = (parseInt(last) + (plan.length ? 4 : 0)) % 24;
  plan.push({ time: String(h).padStart(2, '0') + ':00', portions: 1 });
  planDirty = true; renderPlan();
});
$('#savePlan').addEventListener('click', async () => {
  const times = plan.map(m => m.time);
  if (new Set(times).size !== times.length) return toast('Deux repas ont la même heure');
  const meals = [...plan].sort((a, b) => a.time.localeCompare(b.time));
  const b = $('#savePlan'); b.disabled = true; b.textContent = 'Envoi…';
  try { await api.setSchedule(meals); planDirty = false; toast('Planning envoyé au distributeur'); await refresh(); }
  catch (err) { toast(err.message); }
  finally { b.textContent = 'Envoyer au distributeur'; renderPlan(); }
});

/* ---------- historique ---------- */
async function loadHistory() {
  try { history = (await api.getHistory(30)).events.map(e => ({ ...e, t: new Date(e.t) })); }
  catch (err) { toast(err.message); }
  renderHistory();
}
function renderHistory() {
  // graphique 7 jours
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d); }
  const agg = days.map(d => {
    const e = d.getTime() + 864e5;
    const evs = history.filter(x => x.t >= d && x.t < e);
    return { d, m: evs.filter(x => x.type === 'MEAL').reduce((a, x) => a + (x.n || 1), 0), p: evs.filter(x => x.type === 'PASS').length };
  });
  const max = Math.max(1, ...agg.map(a => Math.max(a.m, a.p)));
  $('#chart').innerHTML = agg.map(a => `
    <div class="bar" title="${a.m} portions, ${a.p} passages">
      <div class="cols"><div class="c m" style="height:${a.m / max * 100}%"></div><div class="c p" style="height:${a.p / max * 100}%"></div></div>
      <div class="d">${a.d.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 3)}</div>
    </div>`).join('');

  // liste
  const evs = history.filter(e => histFilter === 'ALL' || e.type === histFilter).sort((a, b) => b.t - a.t).slice(0, 300);
  if (!evs.length) { $('#histList').innerHTML = '<div class="plan-empty">Rien à afficher</div>'; return; }
  const groups = new Map();
  for (const e of evs) { const k = e.t.toDateString(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  const SRC = { AUTO: 'Planning', BTN: 'Bouton du distributeur', APP: "Depuis l'application" };
  $('#histList').innerHTML = [...groups.values()].map(g => `
    <div class="day-h">${dayLabel(g[0].t)}</div>
    <div class="ev-list">${g.map(e => e.type === 'MEAL'
      ? `<div class="ev MEAL"><div class="ic">${ICON.meal}</div><div><div class="lbl">Repas · ${e.n} portion${e.n > 1 ? 's' : ''}</div><div class="sub">${SRC[e.src] || ''} · ≈ ${e.n * PORTION_G} g</div></div><div class="t">${hhmm(e.t)}</div></div>`
      : e.type === 'PASS'
      ? `<div class="ev PASS"><div class="ic">${ICON.pass}</div><div><div class="lbl">Passage devant la gamelle</div></div><div class="t">${hhmm(e.t)}</div></div>`
      : `<div class="ev ALERT"><div class="ic">${ICON.bell}</div><div><div class="lbl">${esc(e.msg || 'Alerte')}</div></div><div class="t">${hhmm(e.t)}</div></div>`
    ).join('')}</div>`).join('');
}
$$('.chip').forEach(c => c.addEventListener('click', () => {
  histFilter = c.dataset.f; $$('.chip').forEach(x => x.classList.toggle('on', x === c)); renderHistory();
}));

/* ---------- réglages ---------- */
function renderSettings() {
  if (document.activeElement?.closest?.('#tab-set')) return;
  $('#hungerH').value = state.settings.hungerH;
  $('#lowPct').value = state.settings.lowPct;
}
$('#saveSet').addEventListener('click', async () => {
  const hungerH = Math.min(48, Math.max(1, parseInt($('#hungerH').value) || 12));
  const lowPct = Math.min(50, Math.max(5, parseInt($('#lowPct').value) || 20));
  try { await api.setSettings({ hungerH, lowPct }); toast('Réglages enregistrés'); document.activeElement?.blur(); await refresh(); }
  catch (err) { toast(err.message); }
});
function renderDemoExtras() {
  $('#demoRefill')?.remove();
  if (!api.demo) return;
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'demoRefill'; b.className = 'btn btn-ghost'; b.textContent = 'Remplir le réservoir (démo)';
  b.addEventListener('click', async () => { await api.refill(); toast('Réservoir rempli'); refresh(); });
  $('#logout').before(b);
}

/* ---------- démarrage ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
const saved = store.get(SESSION_KEY);
saved ? startApp(saved) : showLogin();
