const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
(async () => {
  try {
    const r = await fetch('/api/me/role/' + encodeURIComponent(new URLSearchParams(location.search).get('id'))), d = await r.json();
    if (r.status === 401) { location = '/me'; return; }
    if (!r.ok) throw new Error(d.error);
    document.title = `${d.title} at ${d.company || 'a hiring company'} · noticeperiod.in`;
    $('#rco').textContent = d.company || 'Hiring company'; $('#rtitle').textContent = d.title;
    $('#facts').innerHTML = [d.location, `${d.openings} open`, `${d.min_years} to ${d.max_years} years`].map(x => `<span class="chip2">${esc(x)}</span>`).join('');
    $('#pct').textContent = d.score + '%'; $('#ring').style.setProperty('--p', d.score + '%');
    $('#rdesc').textContent = d.description || 'The hiring team has not added a description yet.';
    $('#have').innerHTML = d.matched.map(x => `<span class="chip2 on">${esc(x)}</span>`).join('') || '<span class="muted">None yet</span>';
    $('#miss').innerHTML = d.missing.map(x => `<span class="chip2">${esc(x)}</span>`).join('') || '<span class="muted">You cover every listed skill.</span>';
    $('#role').hidden = false;
  } catch (e) { $('#rerr').hidden = false; $('#rerr').textContent = e.message || 'Could not load this role.'; }
})();
