const $ = s => document.querySelector(s);
const CITIES = ['Bengaluru', 'Hyderabad', 'Mumbai', 'Pune', 'Chennai', 'Delhi NCR', 'Gurugram', 'Kolkata', 'Open to relocate', 'Other'];
async function api(u, o = {}) {
  const r = await fetch('/api' + u, { method: o.method || 'GET', headers: o.body ? { 'Content-Type': 'application/json' } : {}, body: o.body && JSON.stringify(o.body) });
  const d = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(d.error || 'Request failed'); e.status = r.status; throw e; } return d;
}
function cities(select, value) { select.innerHTML = CITIES.map(x => `<option>${x}</option>`).join(''); select.value = value || ''; }
function show(c) {
  $('#login').hidden = true; $('#dash').hidden = false;
  $('#hello').textContent = 'Hi, ' + c.name.split(' ')[0]; $('#stage').textContent = c.stage;
  $('#contact').textContent = `${c.email} · ${c.phone} · ${c.linkedin || 'LinkedIn to add'}`;
  const f = $('#pf').elements; f.rolePref.value = c.role_pref || ''; f.skills.value = (c.skills || []).join(', '); f.years.value = c.years ?? ''; f.relevantYears.value = c.relevant_years ?? ''; f.currentCtc.value = c.current_ctc ?? ''; f.ctc.value = c.ctc ?? ''; cities(f.location, c.location); cities(f.preferredLocation, c.preferred_location); f.workPreference.value = c.work_preference || 'hybrid'; f.joining.value = c.joining; f.education.value = c.education || '';
  const privacy = $('#privacy-form').elements; privacy.paused.checked = Boolean(c.paused); privacy.blockedCompanies.value = (c.blocks || []).join(', ');
  $('#rname').textContent = c.resume_name || 'No resume on file';
}
async function boot() { try { show(await api('/me')); } catch { $('#login').hidden = false; } }
$('#lf').onsubmit = async e => {
  e.preventDefault(); $('#lerr').textContent = ''; const phone = $('#lphone').value, step2 = !$('#lcodew').hidden;
  try {
    if (!step2) { const d = await api('/login', { method: 'POST', body: { phone } }); if (d.betaLogin) return boot(); $('#lcodew').hidden = false; $('#lcode').focus(); $('#lgo').textContent = 'Verify'; $('#lhint').hidden = false; $('#lhint').textContent = d.codeSent ? 'A verification code is on its way on WhatsApp.' : 'If that phone number has an account, a code is on its way.'; }
    else { await api('/verify', { method: 'POST', body: { phone, code: $('#lcode').value } }); boot(); }
  } catch (x) { $('#lerr').textContent = x.message; }
};
$('#pf').onsubmit = async e => {
  e.preventDefault(); const b = Object.fromEntries(new FormData(e.target));
  try { await api('/me', { method: 'PATCH', body: b }); $('#pmsg').textContent = 'Saved. Your profile stays private until you accept outreach.'; $('#pmsg').className = 'ok'; show(await api('/me')); } catch (x) { $('#pmsg').textContent = x.message; $('#pmsg').className = 'err'; }
};
$('#privacy-form').onsubmit = async e => {
  e.preventDefault(); const f = e.target.elements;
  try { await api('/me/privacy', { method: 'PATCH', body: { paused: f.paused.checked, blockedCompanies: f.blockedCompanies.value } }); $('#privacy-msg').textContent = 'Privacy settings saved.'; $('#privacy-msg').className = 'ok'; show(await api('/me')); } catch (x) { $('#privacy-msg').textContent = x.message; $('#privacy-msg').className = 'err'; }
};
$('#rfile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return; const fd = new FormData(); fd.append('resume', f); $('#rmsg').textContent = 'Uploading…';
  try { const r = await fetch('/api/me/resume', { method: 'POST', body: fd }), d = await r.json(); if (!r.ok) throw new Error(d.error); $('#rmsg').textContent = 'Resume replaced. Your matches are updated.'; show(await api('/me')); } catch (x) { $('#rmsg').textContent = x.message; }
};
$('#out').onclick = async () => { await api('/me/logout', { method: 'POST' }); location = '/'; };
boot();
