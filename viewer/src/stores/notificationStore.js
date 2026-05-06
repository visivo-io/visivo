/**
 * Notification Store Slice
 *
 * Lightweight toast / notification queue. Keeps a flat array of
 * notification objects keyed by an auto-incrementing id and exposes
 * push/dismiss helpers. Components render from `notifications` and
 * dismiss either by id or by letting the auto-dismiss timer fire.
 *
 * Each notification: { id, message, variant, durationMs }
 *   - variant: 'success' | 'info' | 'warning' | 'error'
 *   - durationMs: defaults to 4000ms; pass 0 to keep open until dismissed.
 */

let notificationIdCounter = 0;

const DEFAULT_DURATION_MS = 4000;

const createNotificationSlice = (set, get) => ({
  notifications: [],

  /**
   * Push a new notification onto the queue. Returns the new id.
   * Auto-dismiss is scheduled when durationMs > 0.
   */
  pushNotification: ({ message, variant = 'info', durationMs = DEFAULT_DURATION_MS }) => {
    notificationIdCounter += 1;
    const id = notificationIdCounter;
    set(state => ({
      notifications: [...state.notifications, { id, message, variant, durationMs }],
    }));

    if (durationMs > 0 && typeof setTimeout === 'function') {
      setTimeout(() => {
        const dismiss = get().dismissNotification;
        if (dismiss) dismiss(id);
      }, durationMs);
    }

    return id;
  },

  dismissNotification: id => {
    set(state => ({
      notifications: state.notifications.filter(n => n.id !== id),
    }));
  },

  clearNotifications: () => {
    set({ notifications: [] });
  },
});

export default createNotificationSlice;
