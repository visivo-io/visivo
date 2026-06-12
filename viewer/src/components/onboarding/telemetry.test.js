/* Tests for the onboarding telemetry shim (VIS-843).
 *
 * Guarantees:
 *  - fireEvent still pushes to the window.__onbEvents buffer EXACTLY as before
 *    (the e2e suite asserts on this).
 *  - fireEvent ALSO forwards to the PostHog client, which enforces
 *    surface: 'viewer'.
 *  - Under jest (no VITE_POSTHOG_KEY) the PostHog client never initializes, so
 *    the real capture path is a guarded no-op and no PII leaves the viewer.
 */

import { fireEvent, getEventBuffer, clearEventBuffer } from './telemetry';
import { capturePosthog } from './posthogClient';
import { getPosthogConfig } from './posthogEnv';
import { isPosthogReady } from './posthogClient';

jest.mock('./posthogClient', () => {
  const actual = jest.requireActual('./posthogClient');
  return {
    ...actual,
    capturePosthog: jest.fn(),
  };
});

beforeEach(() => {
  clearEventBuffer();
  capturePosthog.mockClear();
});

describe('onboarding telemetry shim', () => {
  test('fireEvent pushes the event onto the window buffer (unchanged contract)', () => {
    fireEvent('onboarding_checklist_shown');
    const buf = getEventBuffer();
    expect(buf).toHaveLength(1);
    expect(buf[0].event).toBe('onboarding_checklist_shown');
    expect(buf[0].props).toEqual({});
    expect(typeof buf[0].ts).toBe('number');
  });

  test('fireEvent preserves props in the buffer', () => {
    fireEvent('onboarding_checklist_item_clicked', { item_id: 'build_model' });
    const buf = getEventBuffer();
    expect(buf[0].props).toEqual({ item_id: 'build_model' });
  });

  test('fireEvent also forwards the event to the PostHog client', () => {
    fireEvent('onboarding_role_chosen', { role: 'analytics_engineer' });
    expect(capturePosthog).toHaveBeenCalledTimes(1);
    expect(capturePosthog).toHaveBeenCalledWith('onboarding_role_chosen', {
      role: 'analytics_engineer',
    });
  });

  test('buffer push happens even if the PostHog forward throws', () => {
    capturePosthog.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(() => fireEvent('onboarding_checklist_completed')).not.toThrow();
    expect(getEventBuffer().map(e => e.event)).toContain('onboarding_checklist_completed');
  });
});

describe('env gating (no key in jest)', () => {
  test('getPosthogConfig returns null under jest (stub, no VITE_POSTHOG_KEY)', () => {
    expect(getPosthogConfig()).toBeNull();
  });

  test('posthog is never initialized without a key', () => {
    // Exercise the real capture path (not the mocked module).
    const realCapture = jest.requireActual('./posthogClient');
    realCapture.capturePosthog('onboarding_checklist_shown');
    expect(realCapture.isPosthogReady()).toBe(false);
    expect(isPosthogReady()).toBe(false);
  });
});
