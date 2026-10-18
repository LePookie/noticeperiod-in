const $ = s => document.querySelector(s);
fetch('/api/me').then(r => { if (r.ok) { $('#del-box').hidden = false; $('#del-out').hidden = true; } });
$('#del').onclick = async () => {
  if (!confirm('Delete your account, profile and resume permanently?')) return;
  const r = await fetch('/api/me', { method: 'DELETE' });
  if (r.ok) { $('#del-box').hidden = true; $('#del-out').hidden = false; $('#del-out').textContent = 'Your account and data have been deleted.'; } else $('#del-msg').textContent = 'Could not delete. Please try again.';
};
