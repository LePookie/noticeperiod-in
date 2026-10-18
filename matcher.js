import { db, tx } from './db.js';

// ---------- matching: TF-IDF similarity, skills, experience fit, joining speed, location, role title ----------
const tok = s => (s || '').toLowerCase().match(/[a-z][a-z0-9+#.]*/g) || [];
const rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text, s) => new RegExp(`(^|[^a-z0-9+#])${rx(s)}($|[^a-z0-9+#])`).test(text);
const vec = (t, df, N) => { const m = new Map(); for (const w of t) m.set(w, (m.get(w) || 0) + 1);
  for (const [k, v] of m) m.set(k, v * (Math.log((N + 1) / (1 + (df.get(k) || 0))) + 1)); return m; };
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (const [k, v] of a) { na += v * v; if (b.has(k)) d += v * b.get(k); }
  for (const v of b.values()) nb += v * v; return na && nb ? d / Math.sqrt(na * nb) : 0; };
function rescore(only) {
  const roles = db.prepare('select * from roles where openings > 0').all();
  const docs = roles.map(r => tok(`${r.title} ${r.skills} ${r.description}`));
  const df = new Map(); docs.forEach(d => new Set(d).forEach(w => df.set(w, (df.get(w) || 0) + 1)));
  const upd = db.prepare('update candidates set scores=? where id=?');
  tx(() => { for (const c of db.prepare(`select id, years, joining, location, role_pref, resume_text, exp1, exp2, exp3, education from candidates${only ? ' where id=' + Number(only) : ''}`).all()) {
    const text = `${c.role_pref} ${c.exp1} ${c.exp2} ${c.exp3} ${c.education} ${c.resume_text}`.toLowerCase(), rv = vec(tok(text), df, docs.length), pref = new Set(tok(c.role_pref));
    const out = roles.map((r, i) => {
      const skills = r.skills.split(',').map(s => s.trim().toLowerCase()).filter(Boolean), hit = skills.filter(s => has(text, s));
      const sim = Math.min(1, cos(rv, vec(docs[i], df, docs.length)) * 2), skill = skills.length ? hit.length / skills.length : sim;
      const gap = c.years < r.min_years ? r.min_years - c.years : c.years > r.max_years ? c.years - r.max_years : 0;
      const exp = Math.max(0, 1 - gap * .25), join = Math.max(.1, 1 - c.joining / 100);
      const loc = /^(any|remote)|flexible/i.test(r.location) || r.location.toLowerCase() === c.location.toLowerCase() ? 1 : c.location === 'Open to relocate' ? .7 : .3;
      const tt = tok(r.title), fit = tt.length ? tt.filter(w => pref.has(w)).length / tt.length : 0;
      return { id: r.id, title: r.title, company: r.company, skills: hit, score: Math.round(100 * (.30 * skill + .20 * sim + .20 * exp + .15 * join + .10 * loc + .05 * fit)) };
    }).sort((a, b) => b.score - a.score);
    upd.run(JSON.stringify(out), c.id);
  } });
}

export { rescore };
