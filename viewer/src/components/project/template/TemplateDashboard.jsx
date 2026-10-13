import React, { useLayoutEffect, useRef, useState } from 'react';
import useDimensions from 'react-cool-dimensions';

// A slot element the template gave no height still needs a box a chart can
// measure, so it gets the grid's `medium` row height.
export const UNSIZED_SLOT_HEIGHT = 396;

const SHADOW_BASE_CSS = ':host { display: block; } slot { display: contents; }';

/**
 * One item, projected into its <slot>. The item is positioned out of flow so
 * it never sizes the slot element: the template's CSS alone decides the box,
 * and measuring that box can't feed back into it.
 */
const TemplateSlot = ({ slotName, renderItem }) => {
  const [unsized, setUnsized] = useState(false);
  const { observe, width, height } = useDimensions({
    onResize: ({ height: measured }) => {
      if (measured === 0 && !unsized) setUnsized(true);
    },
  });

  return (
    <div
      ref={observe}
      slot={slotName}
      data-testid={`template-slot-${slotName}`}
      style={{
        position: 'relative',
        width: '100%',
        height: unsized ? UNSIZED_SLOT_HEIGHT : '100%',
        minWidth: 0,
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        {width > 0 && height > 0 ? renderItem({ width, height }) : null}
      </div>
    </div>
  );
};

/**
 * Renders a template dashboard: the author's sanitised HTML inside a shadow
 * root, with each item as a light-DOM child projected into its <slot>.
 *
 * The shadow boundary keeps the template's CSS and the app's CSS apart, while
 * items stay in the light DOM where the app's styles (and Plotly's) apply.
 * Layout containment on the outer wrapper keeps `position: fixed` in the
 * template from escaping the dashboard; it sits outside the host so `:host`
 * rules in the template can't undo it. Nothing clips, so an input's dropdown
 * can open past its slot.
 */
const TemplateDashboard = ({ dashboardName, prepared, renderItem }) => {
  const hostRef = useRef(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    const base = document.createElement('style');
    base.textContent = SHADOW_BASE_CSS;
    root.replaceChildren(base, prepared.fragment.cloneNode(true));
  }, [prepared]);

  return (
    <div
      data-testid={`dashboard_${dashboardName}`}
      data-dashboard-kind="template"
      className="w-full max-w-full px-6 pb-8"
      style={{ contain: 'layout', position: 'relative' }}
    >
      <div ref={hostRef} data-testid="template-dashboard-host">
        {prepared.slots.map(slot => (
          <TemplateSlot
            key={slot.slotName}
            slotName={slot.slotName}
            renderItem={size => renderItem(slot, size)}
          />
        ))}
      </div>
    </div>
  );
};

export default TemplateDashboard;
