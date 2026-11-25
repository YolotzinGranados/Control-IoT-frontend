import { $, setText, formatTime } from '../utils/dom.js';

export class NotificationsView {
  constructor() {
    this.root = $('#action-message');
    this.title = $('#action-message-title');
    this.text = $('#action-message-text');
    this.time = $('#action-message-time');
    this.icon = this.root?.querySelector('.action-message-icon i');
  }

  show(title, message, tone = 'neutral') {
    if (!this.root) return;
    this.root.dataset.tone = tone;
    setText(this.title, title);
    setText(this.text, message);
    setText(this.time, formatTime());
    const icons = { neutral: 'bi-info-circle', success: 'bi-check-circle', warning: 'bi-exclamation-triangle', error: 'bi-x-octagon' };
    if (this.icon) this.icon.className = `bi ${icons[tone] || icons.neutral}`;
  }
}
