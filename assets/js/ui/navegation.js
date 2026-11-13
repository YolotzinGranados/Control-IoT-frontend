// La navegación funciona independientemente de la API.
(() => {
  const tabs = [
    ...document.querySelectorAll('.view-tabs [role="tab"]'),
  ];

  const monitor = document.getElementById('view-monitor');

  if (!monitor || !tabs.length || monitor.dataset.navigationReady) {
    return;
  }

  monitor.dataset.navigationReady = 'true';

  const style = document.createElement('style');

  style.textContent = `
    [role="tabpanel"][hidden] {
      display: none !important;
    }

    .view-tabs button {
      min-height: 48px;
    }

    .ws-event {
      margin-top: 24px;
      padding: 24px;
      min-width: 0;
    }

    .ws-event pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 260px;
      overflow: auto;
      color: inherit;
    }
  `;

  document.head.append(style);

  // Mueve los mismos indicadores, sin duplicarlos.
  const indicators = document.querySelector('.connectivity-panel');
  const note = document.querySelector('.connectivity-note');

  if (indicators) {
    monitor.prepend(indicators);
  }

  if (note && indicators) {
    indicators.after(note);
  }

  function select(index, notify = true) {
    tabs.forEach((tab, i) => {
      const selected = i === index;

      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;

      const panel = document.getElementById(
        tab.getAttribute('aria-controls')
      );

      if (panel) {
        panel.hidden = !selected;
      }
    });

    if (notify) {
      document.dispatchEvent(
        new CustomEvent('iot:view-change', {
          detail: {
            view: tabs[index].getAttribute('aria-controls'),
          },
        })
      );
    }
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));

    tab.addEventListener('keydown', (event) => {
      if (![
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
      ].includes(event.key)) {
        return;
      }

      event.preventDefault();

      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (
            index
            + (event.key === 'ArrowRight' ? 1 : -1)
            + tabs.length
          ) % tabs.length;

      select(next);
      tabs[next].focus();
    });
  });

  select(0, false);
})();