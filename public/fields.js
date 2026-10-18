document.querySelectorAll('input[type=password]').forEach(inp => {
  const wrap = document.createElement('span'); wrap.className = 'pw'; inp.before(wrap); wrap.append(inp);
  const b = document.createElement('button'); b.type = 'button'; b.className = 'pwtoggle'; b.textContent = 'Show'; b.setAttribute('aria-label', 'Show password'); b.setAttribute('aria-pressed', 'false');
  b.onclick = () => { const show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-pressed', String(show)); };
  wrap.append(b);
});
