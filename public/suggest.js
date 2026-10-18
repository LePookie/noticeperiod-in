(async () => {
  let roles = []; try { roles = await (await fetch('/roles.json?v=10')).json(); } catch { return; }
  const low = roles.map(r => r.toLowerCase());
  const find = q => { q = q.trim().toLowerCase(); if (!q) return []; const a = [], b = [], c = [];
    low.forEach((r, i) => { const k = r.indexOf(q); if (k === 0) a.push(i); else if (k > 0 && r[k - 1] === ' ') b.push(i); else if (k > 0) c.push(i); });
    return [...a, ...b, ...c].slice(0, 8).map(i => roles[i]); };
  document.querySelectorAll('input[data-roles]').forEach(inp => {
    const box = document.createElement('div'); box.className = 'sug'; box.hidden = true; box.id = 'sug' + Math.random().toString(36).slice(2, 7); box.setAttribute('role', 'listbox'); inp.after(box);
    inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-controls', box.id); inp.setAttribute('aria-expanded', 'false'); inp.autocomplete = 'off';
    let items = [], active = -1;
    const close = () => { box.hidden = true; inp.setAttribute('aria-expanded', 'false'); active = -1; };
    const choose = v => { inp.value = v; close(); inp.dispatchEvent(new Event('change', { bubbles: true })); };
    const paint = () => [...box.children].forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
    inp.addEventListener('input', () => {
      items = find(inp.value); box.innerHTML = '';
      items.forEach(r => { const el = document.createElement('div'); el.setAttribute('role', 'option'); el.textContent = r; el.addEventListener('mousedown', e => { e.preventDefault(); choose(r); }); box.append(el); });
      box.hidden = !items.length || (items.length === 1 && items[0].toLowerCase() === inp.value.trim().toLowerCase()); inp.setAttribute('aria-expanded', String(!box.hidden)); active = -1;
    });
    inp.addEventListener('blur', close);
    inp.addEventListener('keydown', e => {
      if (box.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); e.stopPropagation(); choose(items[active]); }
      else if (e.key === 'Escape') close();
    });
  });
})();
