export const $ = (selector, root = document) => root.querySelector(selector);
export const createElement = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
export const setText = (element, value) => { if (element) element.textContent = value ?? ''; };
export const setHidden = (element, hidden) => { if (element) element.hidden = Boolean(hidden); };
export const setDisabled = (element, disabled) => { if (element) element.disabled = Boolean(disabled); };
export const formatTime = (value = new Date()) => new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(value instanceof Date ? value : new Date(value));
