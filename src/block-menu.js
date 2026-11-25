// Shared block menu for the render and the 3D view. One selected block, or none.

export function mountBlockMenu(root, hooks) {
  const btn = root.querySelector('button');
  const menu = root.querySelector('[role="radiogroup"]');
  let open = false;
  if (!btn || !menu) return { refresh() {}, close() {}, isOpen: () => false };

  function paint() {
    const selected = hooks.selected() || null;
    const blocks = hooks.blocks();
    const label = hooks.t('blocks');
    btn.textContent = `${label} ▾`;
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', selected ? hooks.t('blockChosen').replace('{id}', selected) : label);
    const allOn = !selected;
    const options = [`<button type="button" role="radio" data-block="" aria-checked="${allOn}" tabindex="${allOn ? 0 : -1}">${hooks.t('allBlocks')}</button>`];
    for (const b of blocks) {
      const on = selected === b.id;
      const count = b.has_data ? hooks.freeCount(b.id) : hooks.t('soon');
      options.push(`<button type="button" role="radio" data-block="${b.id}" aria-checked="${on}" tabindex="${on ? 0 : -1}"><span>${b.id}</span><small>${count}</small></button>`);
    }
    menu.innerHTML = options.join('');
    menu.hidden = !open;
    menu.setAttribute('aria-label', hooks.t('blocks'));
  }

  function radios() { return [...menu.querySelectorAll('[role="radio"]')]; }

  root.addEventListener('click', (e) => {
    if (e.target.closest('#block-btn')) {
      e.stopPropagation();
      open = !open;
      paint();
      if (open) menu.querySelector('[aria-checked="true"]')?.focus();
      return;
    }
    const opt = e.target.closest('#block-menu [role="radio"]');
    if (!opt) return;
    e.stopPropagation();
    open = false;
    hooks.onSelect(opt.dataset.block || null);
    paint();
    btn.focus();
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!open) return;
      e.preventDefault();
      e.stopPropagation();
      open = false;
      paint();
      btn.focus();
      return;
    }
    if (e.target === btn && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation();
      open = true;
      paint();
      (menu.querySelector('[aria-checked="true"]') || menu.querySelector('[role="radio"]'))?.focus();
      return;
    }
    if (!open || !menu.contains(e.target)) return;
    const list = radios();
    const i = Math.max(0, list.indexOf(document.activeElement));
    const go = (n) => {
      e.preventDefault();
      e.stopPropagation();
      const el = list[(n + list.length) % list.length];
      if (!el) return;
      hooks.onSelect(el.dataset.block || null);
      paint();
      menu.querySelector(`[data-block="${el.dataset.block || ''}"]`)?.focus();
    };
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(i + 1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(i - 1);
    if (e.key === 'Home') go(0);
    if (e.key === 'End') go(list.length - 1);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      open = false;
      paint();
      btn.focus();
    }
  });

  document.addEventListener('pointerdown', (e) => {
    if (!open || root.contains(e.target)) return;
    open = false;
    paint();
  });

  return {
    refresh: paint,
    close() { open = false; paint(); },
    isOpen: () => open,
  };
}
