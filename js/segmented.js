/* ================= Segmentados ================= */
const instances = [];

export function createSegmented(el, items, initial, onChange) {
  const ind = document.createElement('span');
  ind.className = 'ind';
  el.appendChild(ind);
  const btns = items.map(([value, text]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.dataset.v = value;
    b.onclick = () => {
      api.set(value);
      if (onChange) onChange(value);
    };
    el.appendChild(b);
    return b;
  });
  const api = {
    val: initial,
    set(v) {
      api.val = v;
      btns.forEach(b => {
        const on = b.dataset.v === v;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on);
      });
      api.refresh();
    },
    dis(d) {
      el.classList.toggle('dis', d);
    },
    refresh() {
      const b = btns.find(x => x.dataset.v === api.val);
      ind.style.opacity = b ? 1 : 0;
      if (!b || !b.offsetWidth) return;
      ind.style.width = b.offsetWidth + 'px';
      ind.style.transform = `translateX(${b.offsetLeft}px)`;
    }
  };
  api.set(initial);
  instances.push(api);
  return api;
}

export function refreshAllSegmented() {
  instances.forEach(s => s.refresh());
}
