// 맨 위 메뉴 바. 앱 화면과 기기 점검 페이지가 같이 쓴다.
// base: 이 페이지에서 microlab 폴더까지 가는 길 ('' 또는 '../../')
import { MODES } from './modes.js';

export function buildNav({ bar, base = '', current = '' }) {
  const menu = bar.querySelector('[data-nav-menu]');
  const toggle = bar.querySelector('[data-nav-toggle]');
  const items = [
    { id: 'home', href: base + '#/', label: '🏠 홈' },
    ...MODES.filter((m) => m.load).map((m) => ({ id: m.id, href: `${base}#/${m.id}`, label: `${m.emoji} ${m.title}` })),
    { id: 'device-check', href: base + 'tools/device-check/', label: '⚙️ 기기 점검', right: true },
  ];
  menu.replaceChildren(
    ...items.map((it) => {
      const a = document.createElement('a');
      a.href = it.href;
      a.textContent = it.label;
      a.dataset.nav = it.id;
      if (it.right) a.classList.add('nav-right');
      return a;
    }),
  );
  const setOpen = (open) => {
    menu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!menu.classList.contains('open')));
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  const setActive = (id) => {
    for (const a of menu.querySelectorAll('a')) {
      if (a.dataset.nav === id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  };
  setActive(current);
  return { setActive };
}
