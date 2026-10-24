const form = document.querySelector('#hire-form');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const error = document.querySelector('#hire-error'), success = document.querySelector('#hire-success'), button = form.querySelector('button');
  error.textContent = ''; success.textContent = ''; button.disabled = true;
  try {
    const response = await fetch('/api/hiring-interest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'We could not save your request.');
    form.hidden = true; success.textContent = 'Request received. We’ll contact you at your work email to begin verification.';
  } catch (err) { error.textContent = err.message; button.disabled = false; }
});
