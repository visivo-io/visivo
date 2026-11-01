/**
 * @jest-environment node
 *
 * `copyItemLink` returns early when there is no `window`. Proving that needs an
 * environment that genuinely has none: the jsdom test deleted `global.window`,
 * which stopped removing it, so the assertion had been passing on a window that
 * was still there.
 */
import copyItemLink from './copyItemLink';
import copy from 'copy-to-clipboard';

jest.mock('copy-to-clipboard', () => jest.fn());

describe('copyItemLink without a window', () => {
  it('is a silent no-op', () => {
    expect(typeof window).toBe('undefined');
    expect(() => copyItemLink()).not.toThrow();
    expect(copy).not.toHaveBeenCalled();
  });
});
