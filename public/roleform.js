const rf = $('#rf'), fe = rf.elements, chipin = $('#chipin'), box = $('#chipbox');
const PLACES = ['Any', 'Remote', 'Bengaluru', 'Hyderabad', 'Mumbai', 'Pune', 'Chennai', 'Delhi NCR', 'Gurugram', 'Kolkata'];
const TEMPLATE = 'About the role\n\n\nWhat you will do\n- \n- \n- \n\nWhat we are looking for\n- \n- \n- ';
let skills = [], again = false;
const uniq = a => [...new Set(a.filter(Boolean))];
function sync() {
  fe.skills.value = skills.join(', '); box.querySelectorAll('.chip2').forEach(c => c.remove());
  skills.forEach((s, i) => { const c = document.createElement('span'); c.className = 'chip2'; c.textContent = s; const x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Remove ' + s); x.textContent = '×'; x.onclick = () => { skills.splice(i, 1); sync(); }; c.append(x); box.insertBefore(c, chipin); });
  preview();
}
const addSkill = v => { v = v.trim().toLowerCase(); if (v && !skills.includes(v)) skills.push(v); chipin.value = ''; sync(); };
chipin.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(chipin.value); } else if (e.key === 'Backspace' && !chipin.value && skills.length) { skills.pop(); sync(); } });
chipin.addEventListener('input', () => { if (!chipin.value.includes(',')) return; const p = chipin.value.split(','); chipin.value = p.pop(); p.forEach(x => { x = x.trim().toLowerCase(); if (x && !skills.includes(x)) skills.push(x); }); sync(); });
chipin.addEventListener('blur', () => addSkill(chipin.value));
function preview() {
  const v = n => fe[n].value.trim();
  $('#preview').innerHTML = `<p class="muted">Preview, as a candidate sees it</p><h2>${esc(v('title') || 'Role title')}</h2><p>${esc(v('company') || 'Company')} · ${esc(v('location') || 'Any')} · ${esc(v('openings') || 0)} open · ${esc(v('min_years') || 0)} to ${esc(v('max_years') || 50)} years</p><div>${skills.map(s => `<span class="chip2 on">${esc(s)}</span>`).join('')}</div><p class="desc">${esc(v('description') || 'The description appears here.')}</p>`;
}
rf.addEventListener('input', preview);
const clearForm = () => { rf.reset(); fe.id.value = ''; skills = []; $('#rt').textContent = 'Add a role'; sync(); };
window.fillRole = (r, dup) => {
  rf.reset(); ['title', 'company', 'location', 'openings', 'min_years', 'max_years', 'description'].forEach(k => fe[k].value = r[k] ?? ''); fe.id.value = dup ? '' : r.id;
  skills = (r.skills || '').split(',').map(s => s.trim()).filter(Boolean); $('#rt').textContent = dup ? 'Add a role (copied, adjust and save)' : 'Edit role'; sync(); document.querySelector('[data-t=a]').click(); fe.title.focus();
};
window.renderRecent = () => {
  $('#recent').innerHTML = roles.slice().sort((a, b) => b.id - a.id).slice(0, 6).map(r => `<div class="match"><div><b>${esc(r.title)}</b><small>${esc(r.company)} · ${esc(r.location)}</small></div><a href="#" data-dup="${r.id}">Duplicate</a></div>`).join('') || '<p class="muted">Nothing yet.</p>';
  $('#recent').querySelectorAll('[data-dup]').forEach(a => a.onclick = e => { e.preventDefault(); fillRole(roles.find(x => x.id == a.dataset.dup), true); });
};
window.fillLists = () => {
  const opt = a => a.map(x => `<option value="${esc(x)}">`).join('');
  $('#companies').innerHTML = opt(uniq(roles.map(r => r.company))); $('#locations').innerHTML = opt(uniq([...PLACES, ...roles.map(r => r.location)]));
  $('#skilllist').innerHTML = opt(uniq(roles.flatMap(r => r.skills.split(',').map(s => s.trim().toLowerCase()))));
};
$('#tmpl').onclick = () => { if (!fe.description.value.trim()) fe.description.value = TEMPLATE; fe.description.focus(); preview(); };
$('#rx').onclick = clearForm;
$('#save').onclick = () => { again = false; };
$('#saveadd').onclick = () => { again = true; rf.requestSubmit(); };
rf.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); again = true; rf.requestSubmit(); } });
rf.onsubmit = async e => {
  e.preventDefault(); $('#rerr').textContent = ''; addSkill(chipin.value);
  try {
    const t = fe.title.value; await api('/roles', { method: 'POST', body: Object.fromEntries(new FormData(rf)) });
    clearForm(); await loadRoles(); load();
    if (again) { say('#rerr', `Saved "${t}". Candidates re-scored. Next role:`, true); fe.title.focus(); } else document.querySelector('[data-t=r]').click();
  } catch (x) { say('#rerr', x.message); }
};
sync();
