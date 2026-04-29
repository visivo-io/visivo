import React from 'react';
import { Toast } from 'flowbite-react';
import { HiCheckCircle, HiInformationCircle, HiExclamation, HiX } from 'react-icons/hi';
import useStore from '../../stores/store';

const ICONS = {
  success: HiCheckCircle,
  info: HiInformationCircle,
  warning: HiExclamation,
  error: HiExclamation,
};

const TOAST_CLASSES = {
  success: 'bg-green-50 text-green-900 border border-green-200',
  info: 'bg-white text-gray-900 border border-gray-200',
  warning: 'bg-amber-50 text-amber-900 border border-amber-200',
  error: 'bg-red-50 text-red-900 border border-red-200',
};

const ICON_CLASSES = {
  success: 'text-green-600',
  info: 'text-primary-600',
  warning: 'text-amber-600',
  error: 'text-red-600',
};

/**
 * Stack of dismissable toast notifications fed from the global notification
 * store slice. Mounted once near the layout root.
 */
const NotificationToasts = () => {
  const notifications = useStore(state => state.notifications) || [];
  const dismissNotification = useStore(state => state.dismissNotification);

  if (!notifications.length) return null;

  return (
    <div
      className="fixed top-16 right-4 z-50 flex flex-col gap-2"
      data-testid="notification-toasts"
    >
      {notifications.map(notification => {
        const Icon = ICONS[notification.variant] || ICONS.info;
        const containerClass =
          TOAST_CLASSES[notification.variant] || TOAST_CLASSES.info;
        const iconClass = ICON_CLASSES[notification.variant] || ICON_CLASSES.info;
        return (
          <Toast
            key={notification.id}
            className={`${containerClass} shadow-md`}
            data-testid={`notification-${notification.variant}`}
          >
            <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center">
              <Icon className={`h-5 w-5 ${iconClass}`} aria-hidden="true" />
            </div>
            <div className="ml-3 text-sm font-medium">{notification.message}</div>
            <button
              type="button"
              onClick={() => dismissNotification && dismissNotification(notification.id)}
              className="ml-3 -mr-1.5 -my-1.5 rounded-lg p-1.5 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-200"
              aria-label="Dismiss notification"
            >
              <HiX className="h-4 w-4" />
            </button>
          </Toast>
        );
      })}
    </div>
  );
};

export default NotificationToasts;
