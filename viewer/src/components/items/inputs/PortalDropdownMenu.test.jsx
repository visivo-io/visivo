/**
 * PortalDropdownMenu tests (VIS-901 #6).
 *
 * The canvas item slot clips with `overflow-hidden`, so an in-slot dropdown was
 * cut off. This component portals the menu to <body> with fixed positioning so
 * it overlays OUTSIDE the slot. These tests assert the portal target + the
 * anchored fixed positioning (the regression-relevant behaviour).
 */
import React, { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import PortalDropdownMenu from './PortalDropdownMenu';

const Harness = ({ children }) => {
  const anchorRef = useRef(null);
  return (
    <div>
      <div ref={anchorRef} data-testid="anchor" style={{ width: 200 }}>
        anchor
      </div>
      <PortalDropdownMenu anchorRef={anchorRef}>{children}</PortalDropdownMenu>
    </div>
  );
};

describe('PortalDropdownMenu', () => {
  beforeAll(() => {
    // jsdom returns a zero rect by default; give the anchor a deterministic box.
    Element.prototype.getBoundingClientRect = function () {
      return { top: 100, bottom: 130, left: 40, right: 240, width: 200, height: 30 };
    };
  });

  test('renders its children into document.body (escapes the slot)', () => {
    render(
      <Harness>
        <div data-testid="opt">Search options…</div>
      </Harness>
    );
    const menu = screen.getByTestId('portal-dropdown-menu');
    expect(menu).toBeInTheDocument();
    // Portalled OUTSIDE the anchor's subtree — the menu must NOT be a descendant
    // of the slot/anchor (that's what the overflow clipping fix is about).
    const anchor = screen.getByTestId('anchor');
    expect(anchor).not.toContainElement(menu);
    // Portalled directly under <body>, so it escapes any ancestor overflow clip.
    expect(document.body).toContainElement(menu);
    expect(screen.getByTestId('opt')).toHaveTextContent('Search options…');
  });

  test('positions itself fixed, anchored to the trigger box', () => {
    render(
      <Harness>
        <div>x</div>
      </Harness>
    );
    const menu = screen.getByTestId('portal-dropdown-menu');
    expect(menu.style.position).toBe('fixed');
    // Left + width track the anchor's bounding box.
    expect(menu.style.left).toBe('40px');
    expect(menu.style.width).toBe('200px');
    // Below the anchor by default (anchor.bottom + 4).
    expect(menu.style.top).toBe('134px');
  });
});
