import { icon } from './icons.js';

let active = null, sequence = 0;
const widgets = new WeakMap();
export function closeSelectMenu(restoreFocus = false) {
  if (!active) return;
  const { menu, button } = active;
  if (menu.matches(':popover-open')) menu.hidePopover();
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  if (restoreFocus && button.isConnected) button.focus();
  active = null;
}
function labelFor(select) {
  if (select.getAttribute('aria-label')) return select.getAttribute('aria-label');
  const label = select.closest('label');
  return label ? [...label.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ') : '';
}
function enhance(select) {
  if (widgets.has(select)) { widgets.get(select).sync(); return; }
  const wrapper = document.createElement('span');
  wrapper.className = 'site-select';
  select.before(wrapper);
  wrapper.append(select);
  select.dataset.customSelect = 'true';
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'select-trigger';
  button.setAttribute('role', 'combobox');
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const label = document.createElement('span');
  button.append(label);
  button.insertAdjacentHTML('beforeend', icon('chevron'));
  const menu = document.createElement('div');
  menu.id = 'site-options-' + ++sequence;
  menu.className = 'select-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('popover', 'manual');
  menu.hidden = true;
  button.setAttribute('aria-controls', menu.id);
  wrapper.append(button, menu);
  function sync() {
    const text = select.selectedOptions[0]?.textContent || '';
    if (label.textContent !== text) label.textContent = text;
    button.disabled = select.disabled;
    const name = labelFor(select);
    button.setAttribute('aria-label', name ? name + ': ' + text : text);
  }
  function open() {
    if (active?.button === button) { closeSelectMenu(true); return; }
    closeSelectMenu();
    menu.replaceChildren();
    menu.setAttribute('aria-label', labelFor(select) || label.textContent);
    [...select.options].forEach(option => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'select-option';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.selected));
      item.disabled = option.disabled;
      item.textContent = option.textContent;
      item.addEventListener('click', () => {
        select.value = option.value;
        sync();
        closeSelectMenu(true);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      menu.append(item);
    });
    const rect = button.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 150), innerWidth - 24);
    const below = innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upward = below < 220 && above > below;
    menu.style.width = width + 'px';
    menu.style.maxHeight = Math.max(80, Math.min(320, upward ? above : below)) + 'px';
    menu.style.left = Math.max(12, Math.min(rect.left, innerWidth - width - 12)) + 'px';
    menu.style.top = upward ? 'auto' : rect.bottom + 6 + 'px';
    menu.style.bottom = upward ? innerHeight - rect.top + 6 + 'px' : 'auto';
    menu.hidden = false;
    menu.showPopover?.();
    button.setAttribute('aria-expanded', 'true');
    active = { button, menu };
    const selected = menu.querySelector('[aria-selected="true"]:not(:disabled)') || menu.querySelector('button:not(:disabled)');
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: 'nearest' });
  }
  button.addEventListener('click', open);
  button.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); open(); }
  });
  let search = '', searchAt = 0;
  menu.addEventListener('keydown', event => {
    const options = [...menu.querySelectorAll('button:not(:disabled)')];
    let index = options.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSelectMenu(true); return; }
    if (event.key === 'Tab') { closeSelectMenu(true); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[index]?.focus();
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && event.key !== ' ') {
      search = Date.now() - searchAt > 700 ? event.key : search + event.key;
      searchAt = Date.now();
      options.find(o => o.textContent.toLocaleLowerCase().startsWith(search.toLocaleLowerCase()))?.focus();
    }
  });
  select.addEventListener('change', sync);
  widgets.set(select, { sync });
  sync();
}
export function enhanceSelects(root = document) {
  if (active && !active.button.isConnected) closeSelectMenu();
  root.querySelectorAll('select').forEach(enhance);
}
export function initSelectMenus() {
  enhanceSelects();
  const observer = new MutationObserver(records => {
    if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.tagName === 'SELECT' || n.tagName === 'OPTION' || n.querySelector?.('select'))))) enhanceSelects();
    if (active && !active.button.isConnected) closeSelectMenu();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('pointerdown', event => {
    if (active && !active.menu.contains(event.target) && !active.button.contains(event.target)) closeSelectMenu();
  }, true);
  document.addEventListener('scroll', event => { if (active && !active.menu.contains(event.target)) closeSelectMenu(); }, true);
  window.addEventListener('resize', () => closeSelectMenu());
}
