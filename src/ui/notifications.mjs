/**
 * Notifications UI component.
 *
 * Renders toast notifications from `state.notifications`. Each toast
 * auto-dismisses after 5 000 ms unless manually closed by the user.
 *
 * Validates: Requirements 5.2, 5.3, 5.7, 6.3, 9.4
 */

/**
 * Creates the notifications component.
 *
 * @param {object} store — the app store exposing `subscribe`,
 *   `getState`, and `dismissNotification`.
 * @returns {HTMLDivElement} the container element to mount in the DOM.
 */
export function createNotifications(store) {
  const container = document.createElement('div');
  container.className = 'notifications';

  /** @type {Map<string, number>} active timer ids keyed by notification id */
  const activeTimers = new Map();

  /**
   * Renders (or re-renders) the notification list based on the
   * current store state. Clears all existing children and rebuilds
   * from scratch, ensuring no stale DOM nodes.
   */
  function render() {
    const { notifications } = store.getState();

    // Clear existing timers that are no longer relevant. Any timer
    // whose notification id is NOT present in the new list should be
    // cancelled (the notification was already dismissed elsewhere).
    for (const [id, timerId] of activeTimers) {
      if (!notifications.some((n) => n.id === id)) {
        clearTimeout(timerId);
        activeTimers.delete(id);
      }
    }

    // Clear DOM content.
    container.innerHTML = '';

    for (const notification of notifications) {
      const el = document.createElement('div');
      el.className = 'notification';
      if (notification.type === 'error') {
        el.classList.add('is-error');
      }

      // Message text.
      const msg = document.createElement('span');
      msg.className = 'notification-message';
      msg.textContent = notification.message;
      el.appendChild(msg);

      // Close button (×).
      const closeBtn = document.createElement('button');
      closeBtn.className = 'notification-close';
      closeBtn.textContent = '\u00d7'; // ×
      closeBtn.setAttribute('aria-label', 'Fechar notificação');
      closeBtn.addEventListener('click', () => {
        store.dismissNotification(notification.id);
      });
      el.appendChild(closeBtn);

      container.appendChild(el);

      // Schedule auto-dismiss timer. Clear any pre-existing timer for
      // this notification id first to avoid duplicates on re-render.
      if (activeTimers.has(notification.id)) {
        clearTimeout(activeTimers.get(notification.id));
      }

      const timerId = setTimeout(() => {
        activeTimers.delete(notification.id);
        store.dismissNotification(notification.id);
      }, 5000);

      activeTimers.set(notification.id, timerId);
    }
  }

  // Initial render from current state.
  render();

  // Subscribe to future state changes.
  store.subscribe(() => {
    render();
  });

  return container;
}
