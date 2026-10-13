import { create } from 'zustand';
import createThemeSlice, { readStoredModeOverride, selectProjectTheme } from './themeStore';

const makeStore = () => create(set => ({ ...createThemeSlice(set) }));

describe('themeStore', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  it('remembers the viewer override in session state and localStorage per project', () => {
    const store = makeStore();
    store.getState().setThemeModeOverride('p1', 'dark');

    expect(store.getState().themeModeOverrides).toEqual({ p1: 'dark' });
    expect(readStoredModeOverride('p1')).toBe('dark');
    expect(readStoredModeOverride('p2')).toBeNull();
  });

  it('ignores unknown stored values', () => {
    window.localStorage.setItem('visivo:dashboard-theme:p1', 'sepia');
    expect(readStoredModeOverride('p1')).toBeNull();
  });

  it('keeps working when storage throws', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = makeStore();

    expect(() => store.getState().setThemeModeOverride('p1', 'light')).not.toThrow();
    expect(store.getState().themeModeOverrides.p1).toBe('light');
    expect(readStoredModeOverride('p1')).toBeNull();
  });

  it('reads the project theme from the project envelope', () => {
    expect(selectProjectTheme({ project: { config: { theme: { mode: 'dark' } } } })).toEqual({
      mode: 'dark',
    });
    expect(selectProjectTheme({ project: null })).toBeNull();
  });
});
