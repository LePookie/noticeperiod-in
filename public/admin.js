const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FILTERS = ['q', 'band', 'minYears', 'joining', 'status'];
let meta, roles = [], role = '';

async function api(u, o = {}) {
  const r = await fetch('/api/admin' + u, { method: o.method || 'GET', headers: o.body ? { 'Content-Type': 'application/json' } : {}, body: o.body && JSON.stringify(o.body) });
  if (r.status === 401) { location = '/login'; throw new Error('Signed out'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}
const qs = () => { const p = new URLSearchParams(); FILTERS.forEach(k => $('#' + k).value && p.set(k, $('#' + k).value)); if (role) p.set('role', role); return p; };
const say = (el, msg, ok) => { $(el).textContent = msg; $(el).className = ok ? 'ok' : 'err'; };

const row = c => { const m = c.match; return `<tr>
<td><b>${m ? m.score + '%' : '–'}</b><div class="meter"><i style="width:${m?.score || 0}%"></i></div></td>
<td><b>${esc(c.name)}${c.verified ? ' ✓' : ''}</b><small>${esc(c.phone)}</small><small>${esc(c.email)}</small></td>
<td>${esc(c.band)}<small>${esc(c.years)} yrs</small>${c.jobs.length ? '<small title="' + esc(c.jobs.map(j => j.role + ' at ' + j.company + ' (' + j.period + ')').join('\n')) + '">' + esc(c.jobs[0].role) + (c.jobs[0].company ? ' at ' + esc(c.jobs[0].company) : '') + (c.jobs.length > 1 ? ' (+' + (c.jobs.length - 1) + ' more)' : '') + '</small>' : ''}</td><td>${esc(meta.JOIN[c.joining])}<small>${esc(c.ctc)} LPA</small></td>
<td>${esc(c.location)}<small>${esc(c.role_pref)}</small></td>
<td>${m ? esc(m.title) + (m.company ? ' at ' + esc(m.company) : '') : 'No open roles'}<small>${m ? esc(m.skills.slice(0, 4).join(', ')) : ''}</small></td>
<td><select data-s="${c.id}" aria-label="Status for ${esc(c.name)}">${meta.STATUS.map(s => `<option${s === c.status ? ' selected' : ''}>${s}</option>`).join('')}</select><div class="acts"><a href="/api/admin/resume/${c.id}">Resume</a><a href="#" data-x="${c.id}">Delete</a></div></td></tr>`; };

async function load() {
  const rows = await api('/candidates?' + qs());
  $('#summary').textContent = `${rows.length} profile${rows.length === 1 ? '' : 's'}, ranked by ${role ? 'fit for the selected role' : 'best fit across open roles'}, then by joining time.`;
  $('#xl').href = '/api/admin/export.xlsx?' + qs();
  $('#rows').innerHTML = rows.map(row).join('') || '<tr><td colspan="7" class="empty">No profiles match these filters.</td></tr>';
  document.querySelectorAll('[data-s]').forEach(s => s.onchange = () => api('/candidates/' + s.dataset.s, { method: 'PATCH', body: { status: s.value } }));
  document.querySelectorAll('[data-x]').forEach(a => a.onclick = async e => { e.preventDefault(); if (confirm('Delete this candidate and their resume permanently?')) { await api('/candidates/' + a.dataset.x, { method: 'DELETE' }); load(); } });
}
async function loadRoles() {
  roles = await api('/roles');
  if (role && !roles.some(r => String(r.id) === role && r.openings > 0)) role = '';
  $('#chips').innerHTML = [['', 'All open roles']].concat(roles.filter(r => r.openings > 0).map(r => [String(r.id), `${esc(r.title)}${r.company ? ' at ' + esc(r.company) : ''} (${r.openings})`]))
    .map(([id, t]) => `<button type="button" class="rolechip${id === role ? ' on' : ''}" data-r="${id}" aria-pressed="${id === role}">${t}</button>`).join('');
  document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { role = b.dataset.r; loadRoles().then(load); });
  $('#rrows').innerHTML = roles.map(r => `<tr><td><b>${esc(r.title)}</b><small>${esc(r.company)}</small></td><td>${r.openings}</td><td>${esc(r.location)}</td><td>${r.min_years}-${r.max_years}</td><td>${esc(r.skills)}</td>
    <td><a href="#" data-e="${r.id}">Edit</a><br><a href="#" data-c="${r.id}">Duplicate</a><br><a href="#" data-d="${r.id}">Delete</a></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No roles yet. Add one to start ranking candidates.</td></tr>';
  document.querySelectorAll('[data-e],[data-c]').forEach(a => a.onclick = e => { e.preventDefault(); fillRole(roles.find(x => x.id == (a.dataset.e || a.dataset.c)), !!a.dataset.c); });
  document.querySelectorAll('[data-d]').forEach(a => a.onclick = async e => { e.preventDefault(); if (confirm('Delete this role?')) { await api('/roles/' + a.dataset.d, { method: 'DELETE' }); await loadRoles(); load(); } });
  renderRecent(); fillLists();
}
async function loadTeam() {
  const t = await api('/team');
  $('#team').innerHTML = t.map(a => `<tr><td>${esc(a.email)}${a.me ? ' <small>(you)</small>' : ''}</td><td>${esc(a.created)}</td><td>${a.me ? '' : `<a href="#" data-rm="${a.id}">Remove</a>`}</td></tr>`).join('');
  document.querySelectorAll('[data-rm]').forEach(a => a.onclick = async e => { e.preventDefault(); if (confirm('Remove this person\'s access?')) { await api('/team/' + a.dataset.rm, { method: 'DELETE' }); loadTeam(); } });
}

document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  ['c', 'r', 'a', 't'].forEach(k => $('#t-' + k).hidden = k !== b.dataset.t);
});
FILTERS.forEach(k => $('#' + k).addEventListener(k === 'q' || k === 'minYears' ? 'input' : 'change', load));
$('#af').onsubmit = async e => { e.preventDefault(); try { await api('/team', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); say('#tmsg', 'Teammate added.', true); loadTeam(); } catch (x) { say('#tmsg', x.message); } };
$('#pf').onsubmit = async e => { e.preventDefault(); try { await api('/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); say('#tmsg', 'Password updated. Other sessions were signed out.', true); } catch (x) { say('#tmsg', x.message); } };
$('#out').onclick = async () => { await fetch('/api/admin/logout', { method: 'POST' }); location = '/login'; };

(async () => {
  meta = await api('/meta'); $('#who').textContent = meta.email;
  $('#band').innerHTML += meta.BANDS.map(b => `<option>${b}</option>`).join('');
  $('#status').innerHTML += meta.STATUS.map(s => `<option>${s}</option>`).join('');
  await loadRoles(); load(); loadTeam();
})();
