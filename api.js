/* Croqi – couche d'accès aux données.
 * Deux implémentations, même interface :
 *   HttpApi : parle au serveur Java (Protocole B, HTTP + JSON), voir README.md
 *   DemoApi : simule le distributeur dans le téléphone (pour tester sans serveur)
 */
const PORTION_G = 20;          // 1 portion ≈ 20 g
const TANK_G = 1800;           // réservoir 3 L ≈ 1,8 kg de croquettes
const MAX_MEALS = 6, MAX_PORTIONS = 5;

/* ---------------- Serveur réel ---------------- */
class HttpApi {
  constructor(base, token) { this.base = base.replace(/\/+$/, ''); this.token = token; this.demo = false; }

  async req(method, path, body) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    let r;
    try {
      r = await fetch(this.base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: 'Bearer ' + this.token } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal
      });
    } catch (e) {
      throw new Error('Serveur injoignable (' + this.base + ')');
    } finally { clearTimeout(to); }
    if (r.status === 401) { const e = new Error('Session expirée, reconnecte-toi'); e.auth = true; throw e; }
    const txt = await r.text();
    const data = txt ? JSON.parse(txt) : {};
    if (!r.ok) throw new Error(data.error || ('Erreur serveur ' + r.status));
    return data;
  }

  async login(username, password) {
    const d = await this.req('POST', '/api/login', { username, password });
    this.token = d.token;
    return d;
  }
  logout()            { return this.req('POST', '/api/logout').catch(() => {}); }
  getState()          { return this.req('GET', '/api/state'); }
  setMode(mode)       { return this.req('POST', '/api/mode', { mode }); }
  dispense(portions)  { return this.req('POST', '/api/dispense', { portions }); }
  setSchedule(meals)  { return this.req('PUT', '/api/schedule', { meals }); }
  setSettings(s)      { return this.req('PUT', '/api/settings', s); }
  getHistory(days)    { return this.req('GET', '/api/history?days=' + (days || 30)); }
}

/* ---------------- Simulation (mode démo) ---------------- */
class DemoApi {
  constructor() {
    this.demo = true;
    this.KEY = 'croqi.demo.v1';
    this.s = this.load() || this.seed();
    this.tick();
  }
  load() { try { return JSON.parse(localStorage.getItem(this.KEY)); } catch { return null; } }
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.s)); } catch {} }

  seed() {
    const now = Date.now(), DAY = 864e5; // DAY sert aux passages aléatoires dans la journée
    const schedule = [{ time: '07:00', portions: 2 }, { time: '12:30', portions: 1 }, { time: '19:00', portions: 2 }];
    const ev = [];
    let r = 7;
    const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    const start = new Date(now - 30 * DAY); start.setHours(0, 0, 0, 0);
    for (const day = new Date(start); day.getTime() < now; day.setDate(day.getDate() + 1)) {
      const d = day.getTime(); // minuit local (setDate gère le changement d'heure)
      for (const m of schedule) {
        const [h, mi] = m.time.split(':').map(Number);
        const t = new Date(day).setHours(h, mi, 0, 0);
        if (t < now) ev.push({ t, type: 'MEAL', n: m.portions, src: 'AUTO' });
      }
      if (rnd() < 0.25) {
        const t = d + (14 + Math.floor(rnd() * 6)) * 36e5 + Math.floor(rnd() * 60) * 6e4;
        if (t < now) ev.push({ t, type: 'MEAL', n: 1, src: rnd() < 0.5 ? 'BTN' : 'APP' });
      }
      const nPass = 8 + Math.floor(rnd() * 10);
      for (let i = 0; i < nPass; i++) {
        const t = d + Math.floor(rnd() * DAY);
        if (t < now) ev.push({ t, type: 'PASS' });
      }
      if (rnd() < 0.08) ev.push({ t: d + 10 * 36e5, type: 'ALERT', msg: 'Niveau bas (18 %)' });
    }
    ev.sort((a, b) => a.t - b.t);
    return {
      mode: 'AUTO', grams: Math.round(TANK_G * 0.62), schedule,
      settings: { hungerH: 12, lowPct: 20 },
      events: ev, lastTick: now
    };
  }

  // fait avancer la simulation jusqu'à maintenant (repas programmés + passages aléatoires)
  tick() {
    const s = this.s, now = Date.now();
    let from = s.lastTick || now;
    if (now - from > 3 * 864e5) from = now - 3 * 864e5;
    if (s.mode === 'AUTO') {
      for (let day = new Date(from); day.getTime() <= now; day.setDate(day.getDate() + 1)) {
        for (const m of s.schedule) {
          const [h, mi] = m.time.split(':').map(Number);
          const t = new Date(day); t.setHours(h, mi, 0, 0);
          if (t.getTime() > from && t.getTime() <= now) this.serve(m.portions, 'AUTO', t.getTime());
        }
      }
    }
    // ~1 passage toutes les 80 min en moyenne
    const mins = (now - from) / 6e4;
    const n = Math.min(40, Math.floor(mins / 80 + Math.random() * 0.6));
    for (let i = 0; i < n; i++) s.events.push({ t: from + Math.random() * (now - from), type: 'PASS' });
    s.events.sort((a, b) => a.t - b.t);
    const cut = now - 31 * 864e5;
    s.events = s.events.filter(e => e.t >= cut);
    s.lastTick = now;
    this.save();
  }

  serve(n, src, t = Date.now()) {
    const s = this.s;
    const before = this.pct();
    const g = Math.min(s.grams, n * PORTION_G);
    if (g <= 0) { s.events.push({ t, type: 'ALERT', msg: 'Réservoir vide, repas non servi' }); return false; }
    s.grams -= g;
    s.events.push({ t, type: 'MEAL', n, src });
    const after = this.pct();
    if (before >= s.settings.lowPct && after < s.settings.lowPct)
      s.events.push({ t: t + 1, type: 'ALERT', msg: `Niveau bas (${after} %)` });
    return true;
  }
  pct() { return Math.round(this.s.grams / TANK_G * 100); }
  wait(ms = 350) { return new Promise(r => setTimeout(r, ms)); }

  async login(u, p) { await this.wait(); return { token: 'demo', user: u || 'demo' }; }
  async logout() {}

  async getState() {
    this.tick();
    const s = this.s, ev = s.events;
    const sod = new Date(); sod.setHours(0, 0, 0, 0);
    const lastMeal = [...ev].reverse().find(e => e.type === 'MEAL');
    const lastPass = [...ev].reverse().find(e => e.type === 'PASS');
    return {
      linked: true, mode: s.mode, level: this.pct(), grams: s.grams,
      passesToday: ev.filter(e => e.type === 'PASS' && e.t >= sod.getTime()).length,
      lastMeal: lastMeal ? new Date(lastMeal.t).toISOString() : null,
      lastMealPortions: lastMeal ? lastMeal.n : 0,
      lastPass: lastPass ? new Date(lastPass.t).toISOString() : null,
      schedule: s.schedule.map(m => ({ ...m })), settings: { ...s.settings }
    };
  }
  async setMode(mode) { await this.wait(200); this.tick(); this.s.mode = mode; this.save(); return { ok: true }; }
  async dispense(n) {
    await this.wait(900);
    if (!this.serve(n, 'APP')) { this.save(); throw new Error('Réservoir vide'); }
    this.save(); return { ok: true };
  }
  async setSchedule(meals) { await this.wait(); this.tick(); this.s.schedule = meals; this.save(); return { ok: true }; }
  async setSettings(st) { await this.wait(200); Object.assign(this.s.settings, st); this.save(); return { ok: true }; }
  async getHistory(days = 30) {
    this.tick();
    const cut = Date.now() - days * 864e5;
    return { events: this.s.events.filter(e => e.t >= cut).map(e => ({ ...e, t: new Date(e.t).toISOString() })) };
  }
  // petit bonus démo : remplir le réservoir
  async refill() { this.s.grams = TANK_G; this.s.events.push({ t: Date.now(), type: 'ALERT', msg: 'Réservoir rempli (100 %)' }); this.save(); }
}
