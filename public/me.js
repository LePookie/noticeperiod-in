const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CITIES = ['Bengaluru', 'Hyderabad', 'Mumbai', 'Pune', 'Chennai', 'Delhi NCR', 'Gurugram', 'Kolkata', 'Open to relocate', 'Other'];
async function api(u, o = {}) {
  const r = await fetch('/api' + u, { method: o.method || 'GET', headers: o.body ? { 'Content-Type': 'application/json' } : {}, body: o.body && JSON.stringify(o.body) });
  const d = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(d.error || 'Request failed'); e.status = r.status; throw e; } return d;
}
function show(c) {
  $('#login').hidden = true; $('#dash').hidden = false;
  $('#hello').textContent = 'Hi, ' + c.name.split(' ')[0]; $('#stage').textContent = c.stage; $('#contact').textContent = `${c.email} · ${c.phone} · ${c.years} yrs experience`;
  $('#city').innerHTML = CITIES.map(x => `<option>${x}</option>`).join('');
  const f = $('#pf').elements; f.rolePref.value = c.role_pref; f.ctc.value = c.ctc; f.location.value = c.location; f.joining.value = c.joining; f.education.value = c.education || '';
  [1, 2, 3].forEach(n => { const j = c.jobs[n - 1] || {}; f[`j${n}_role`].value = j.role || ''; f[`j${n}_company`].value = j.company || ''; f[`j${n}_period`].value = j.period || ''; });
  $('#rname').textContent = c.resume_name || 'No resume on file';
  const good = c.scores.filter(s => s.score >= 30);
  $('#matches').innerHTML = good.map(s => `<a class="match" href="/role?id=${s.id}"><div><b>${esc(s.title)}</b><small>${esc(s.company || 'Hiring company')}</small><small>${esc(s.skills.slice(0, 4).join(', '))}</small></div><span class="pct">${s.score}%</span></a>`).join('') || '<p class="sub">No strong matches yet. We keep checking as new roles open.</p>';
}
async function boot() { try { show(await api('/me')); } catch { $('#login').hidden = false; } }
$('#lf').onsubmit = async e => {
  e.preventDefault(); $('#lerr').textContent = ''; const email = $('#lmail').value, step2 = !$('#lcodew').hidden;
  try {
    if (!step2) { const d = await api('/login', { method: 'POST', body: { email } }); $('#lcodew').hidden = false; $('#lcode').focus(); $('#lgo').textContent = 'Verify'; $('#lhint').hidden = false; $('#lhint').textContent = d.devCode ? 'Test mode: your code is ' + d.devCode : 'If that email has an account, a code is on its way.'; }
    else { await api('/verify', { method: 'POST', body: { email, code: $('#lcode').value } }); boot(); }
  } catch (x) { $('#lerr').textContent = x.message; }
};
$('#pf').onsubmit = async e => {
  e.preventDefault(); const b = Object.fromEntries(new FormData(e.target));
  b.jobs = [1, 2, 3].map(n => ({ role: b[`j${n}_role`], company: b[`j${n}_company`], period: b[`j${n}_period`] }));
  try { await api('/me', { method: 'PATCH', body: b }); $('#pmsg').textContent = 'Saved. Your matches are updated.'; $('#pmsg').className = 'ok'; show(await api('/me')); } catch (x) { $('#pmsg').textContent = x.message; $('#pmsg').className = 'err'; }
};
$('#rfile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return; const fd = new FormData(); fd.append('resume', f); $('#rmsg').textContent = 'Uploading…';
  try { const r = await fetch('/api/me/resume', { method: 'POST', body: fd }), d = await r.json(); if (!r.ok) throw new Error(d.error); $('#rmsg').textContent = 'Resume replaced. Your matches are updated.'; show(await api('/me')); } catch (x) { $('#rmsg').textContent = x.message; }
};
$('#out').onclick = async () => { await api('/me/logout', { method: 'POST' }); location = '/'; };
boot();
