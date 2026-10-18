const f = document.querySelector('#lf'), err = document.querySelector('#err'), go = document.querySelector('#go');
f.addEventListener('submit', async e => {
  e.preventDefault(); err.textContent = ''; go.disabled = true; go.textContent = 'Signing in…';
  try {
    const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(f))) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Could not sign in.');
    location = '/admin';
  } catch (x) { err.textContent = x.message; go.disabled = false; go.textContent = 'Sign in'; }
});
