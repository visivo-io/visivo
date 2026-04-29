import React from 'react';

/**
 * EmptyStateCTA - Shared empty-state component with actionable CTAs.
 *
 * Replaces dead-end empty states across the viewer with a consistent layout
 * that surfaces a primary call-to-action (and optional secondary action) so
 * users always have a clear next step.
 *
 * Props:
 * - icon: Optional ReactNode rendered above the title (e.g. <HiDatabase />)
 * - title: Short headline (string)
 * - body: Supporting copy explaining the next step (string)
 * - primaryAction: { label, onClick } — main CTA, styled with primary color
 * - secondaryAction: { label, onClick } — optional secondary CTA
 */
export default function EmptyStateCTA({ icon, title, body, primaryAction, secondaryAction }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 px-6 text-center"
      data-testid="empty-state-cta"
    >
      {icon && (
        <div className="mb-4 text-secondary-400" data-testid="empty-state-icon">
          {icon}
        </div>
      )}
      {title && (
        <h3 className="text-lg font-medium text-secondary-900 mb-2">{title}</h3>
      )}
      {body && (
        <p className="text-sm text-secondary-600 max-w-md mb-6">{body}</p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="flex flex-col sm:flex-row gap-3">
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
              data-testid="empty-state-primary"
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="bg-white border border-secondary-300 text-secondary-700 px-4 py-2 rounded-lg hover:bg-secondary-50 transition-colors"
              data-testid="empty-state-secondary"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
