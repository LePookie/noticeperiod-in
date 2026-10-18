const $ = s => document.querySelector(s);
const form = $('#form'), el = n => form.elements[n], steps = [...form.querySelectorAll('.step')], file = $('#resume'), drop = $('#drop');
const JOIN = { 0: 'Immediately', 30: 'Within 1 month', 60: 'Within 2 months' };
let cur = 0;
function show(i, move = true) {
  cur = i; steps.forEach((s, k) => s.hidden = k !== i);
  $('#bar').style.width = `${(i + 1) / steps.length * 100}%`; $('#label').textContent = `Step ${i + 1} of ${steps.length}`;
  $('#back').hidden = i === 0; $('#next').textContent = i === steps.length - 1 ? 'Create my account' : 'Continue'; $('#err').textContent = '';
  if (move) { steps[i].querySelector('h2').focus({ preventScroll: true }); $('#apply').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}
function valid(i) {
  for (const f of steps[i].querySelectorAll('input,select')) if (!f.checkValidity()) { $('#err').textContent = f.validationMessage || 'Check this field.'; f.focus(); return false; }
  return true;
}
const set = (n, v) => { if (v !== '' && v != null && !el(n).value) el(n).value = v; };
async function parse(f) {
  $('#pmsg').textContent = 'Reading your resume…';
  try {
    const fd = new FormData(); fd.append('resume', f);
    const r = await fetch('/api/parse', { method: 'POST', body: fd }), d = await r.json(); if (!r.ok) throw new Error(d.error);
    set('name', d.name); set('email', d.email); set('phone', d.phone); set('years', d.years || ''); set('education', d.education); set('rolePref', d.jobs?.[0]?.role); (d.jobs || []).forEach((j, i) => { set(`j${i + 1}_role`, j.role); set(`j${i + 1}_company`, j.company); set(`j${i + 1}_period`, j.period); });
    $('#pmsg').textContent = 'Done. We filled in what we could read. Check the next steps.';
  } catch { $('#pmsg').textContent = 'Could not read that one. No problem, fill in the next steps yourself.'; }
}
function setFile(f) {
  if (!f) return;
  if (!/\.(pdf|docx|txt)$/i.test(f.name)) { $('#err').textContent = 'Upload a PDF, DOCX or TXT file.'; return; }
  if (f.size > 5 << 20) { $('#err').textContent = 'That file is over 5 MB.'; return; }
  const dt = new DataTransfer(); dt.items.add(f); file.files = dt.files;
  $('#fname').textContent = `${f.name} · ${(f.size / 1024).toFixed(0)} KB`; drop.classList.add('has'); $('#err').textContent = ''; parse(f);
}
async function send() {
  const b = $('#next'); b.disabled = true; b.textContent = 'Creating…';
  try {
    const r = await fetch('/api/apply', { method: 'POST', body: new FormData(form) }), d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Could not save your details.');
    if (d.betaLogin) { location = '/me'; return; }
    $('#flow').hidden = true; $('#verify').hidden = false; $('#vphone').textContent = el('phone').value; $('#vhint').hidden = false; $('#vhint').textContent = 'Your code was sent on WhatsApp.'; $('#vcode').focus();
  } catch (e) { $('#err').textContent = e.message; b.disabled = false; b.textContent = 'Create my account'; }
}
$('#vgo').onclick = async () => {
  try {
    const r = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: el('phone').value, code: $('#vcode').value }) }), d = await r.json();
    if (!r.ok) throw new Error(d.error); location = '/me';
  } catch (e) { $('#verr').textContent = e.message; }
};
$('#next').onclick = () => { if (!valid(cur)) return; cur < steps.length - 1 ? show(cur + 1) : send(); };
$('#back').onclick = () => show(cur - 1);
form.addEventListener('submit', e => e.preventDefault());
form.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'file') { e.preventDefault(); $('#next').click(); } });
el('joining').addEventListener('input', () => {
  const v = +el('joining').value; $('#join-out').textContent = JOIN[v]; el('joining').style.setProperty('--p', v / 60 * 100 + '%');
  $('#join-date').textContent = v ? 'Around ' + new Date(Date.now() + v * 864e5).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Today';
});
file.addEventListener('change', () => setFile(file.files[0]));
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => setFile(e.dataTransfer.files[0]));
show(0, false);
