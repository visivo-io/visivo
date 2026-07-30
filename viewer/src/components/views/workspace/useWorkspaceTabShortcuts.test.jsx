/**
 * useWorkspaceTabShortcuts (VIS-812 / Track O O-3; Explore 2.0 Phase 0
 * reconciliation with the view-switcher shortcuts).
 *
 * Covers the pure `handleTabShortcut` dispatcher (mod resolution per
 * platform, editable-target suppression, all shortcut families) plus a
 * mounted integration pass driving real window keydown events through the
 * hook into the store.
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import useWorkspaceTabShortcuts, {
  handleTabShortcut,
  isEditableTarget,
  hasBlockingModal,
} from './useWorkspaceTabShortcuts';
import useStore from '../../../stores/store';

const makeEvent = (overrides = {}) => ({
  key: 't',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  target: document.body,
  preventDefault: jest.fn(),
  ...overrides,
});

const makeStore = (overrides = {}) => ({
  project: { project_json: { name: 'analytics' } },
  // Views (project/semantic-layer/explorer) left the tab model in Phase 0 —
  // `workspaceTabs` holds only DOCUMENT tabs now.
  workspaceTabs: [
    { id: 'chart:c1', type: 'chart', name: 'c1' },
    { id: 'table:t1', type: 'table', name: 't1' },
  ],
  workspaceActiveTabId: 'chart:c1',
  openWorkspaceTab: jest.fn(),
  openWorkspaceView: jest.fn(),
  requestCloseWorkspaceTab: jest.fn(),
  switchWorkspaceTab: jest.fn(),
  ...overrides,
});

describe('handleTabShortcut (pure dispatcher)', () => {
  test('Cmd+T on mac opens the project tab (the "new empty tab")', () => {
    const store = makeStore();
    const e = makeEvent({ key: 't', metaKey: true });
    expect(handleTabShortcut(e, store, { mac: true })).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(store.openWorkspaceTab).toHaveBeenCalledWith({
      id: 'project:analytics',
      type: 'project',
      name: 'analytics',
    });
  });

  test('Ctrl+T on non-mac is the modifier; Cmd is ignored there', () => {
    const store = makeStore();
    expect(
      handleTabShortcut(makeEvent({ key: 't', ctrlKey: true }), store, { mac: false })
    ).toBe(true);
    expect(store.openWorkspaceTab).toHaveBeenCalledTimes(1);
    // metaKey alone on non-mac → not our shortcut.
    expect(
      handleTabShortcut(makeEvent({ key: 't', metaKey: true }), store, { mac: false })
    ).toBe(false);
    expect(store.openWorkspaceTab).toHaveBeenCalledTimes(1);
  });

  test('Cmd+W closes the ACTIVE tab through the dirty guard', () => {
    const store = makeStore();
    const e = makeEvent({ key: 'w', metaKey: true });
    expect(handleTabShortcut(e, store, { mac: true })).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(store.requestCloseWorkspaceTab).toHaveBeenCalledWith('chart:c1');
  });

  test('Cmd+W with no active tab still claims the shortcut but closes nothing', () => {
    const store = makeStore({ workspaceActiveTabId: null });
    expect(handleTabShortcut(makeEvent({ key: 'w', metaKey: true }), store, { mac: true })).toBe(
      true
    );
    expect(store.requestCloseWorkspaceTab).not.toHaveBeenCalled();
  });

  test('Cmd+1/2/3 switch to the three workspace views, in registry order', () => {
    const store = makeStore();
    const e1 = makeEvent({ key: '1', metaKey: true });
    expect(handleTabShortcut(e1, store, { mac: true })).toBe(true);
    expect(e1.preventDefault).toHaveBeenCalled();
    expect(store.openWorkspaceView).toHaveBeenCalledWith('project');

    const e2 = makeEvent({ key: '2', metaKey: true });
    expect(handleTabShortcut(e2, store, { mac: true })).toBe(true);
    expect(store.openWorkspaceView).toHaveBeenCalledWith('semantic-layer');

    const e3 = makeEvent({ key: '3', metaKey: true });
    expect(handleTabShortcut(e3, store, { mac: true })).toBe(true);
    expect(store.openWorkspaceView).toHaveBeenCalledWith('explorer');

    expect(store.switchWorkspaceTab).not.toHaveBeenCalled();
  });

  test('Cmd+4..9 switches by strip position (shifted down to make room for the view shortcuts); out-of-range digits are left to the browser', () => {
    const store = makeStore();
    // Position 1 (Cmd+4) → the first tab, `chart:c1`.
    const e4 = makeEvent({ key: '4', metaKey: true });
    expect(handleTabShortcut(e4, store, { mac: true })).toBe(true);
    expect(e4.preventDefault).toHaveBeenCalled();
    expect(store.switchWorkspaceTab).toHaveBeenCalledWith('chart:c1');

    // Position 2 (Cmd+5) → the second tab, `table:t1`.
    const e5 = makeEvent({ key: '5', metaKey: true });
    expect(handleTabShortcut(e5, store, { mac: true })).toBe(true);
    expect(store.switchWorkspaceTab).toHaveBeenCalledWith('table:t1');

    // No third tab open → Cmd+6 is left to the browser.
    const e6 = makeEvent({ key: '6', metaKey: true });
    expect(handleTabShortcut(e6, store, { mac: true })).toBe(false);
    expect(e6.preventDefault).not.toHaveBeenCalled();
    expect(store.switchWorkspaceTab).toHaveBeenCalledTimes(2);
    expect(store.openWorkspaceView).not.toHaveBeenCalled();
  });

  test('shortcuts are suppressed while typing in editable targets', () => {
    const store = makeStore();
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });

    [input, textarea, editable].forEach(target => {
      expect(
        handleTabShortcut(makeEvent({ key: 'w', metaKey: true, target }), store, { mac: true })
      ).toBe(false);
    });
    expect(store.requestCloseWorkspaceTab).not.toHaveBeenCalled();
  });

  test('chords with Shift or Alt are never claimed (browser/system shortcuts)', () => {
    const store = makeStore();
    expect(
      handleTabShortcut(makeEvent({ key: 't', metaKey: true, shiftKey: true }), store, {
        mac: true,
      })
    ).toBe(false);
    expect(
      handleTabShortcut(makeEvent({ key: 'w', metaKey: true, altKey: true }), store, {
        mac: true,
      })
    ).toBe(false);
    expect(store.openWorkspaceTab).not.toHaveBeenCalled();
    expect(store.requestCloseWorkspaceTab).not.toHaveBeenCalled();
  });

  test('plain keys without the modifier are ignored', () => {
    const store = makeStore();
    expect(handleTabShortcut(makeEvent({ key: 't' }), store, { mac: true })).toBe(false);
    expect(store.openWorkspaceTab).not.toHaveBeenCalled();
  });

  test('isEditableTarget recognises selects and rejects plain divs', () => {
    expect(isEditableTarget(document.createElement('select'))).toBe(true);
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  // P4-D1: a keyboard-driven tab/view switch mid-promote (or mid any other
  // blocking-modal flow) must never fire — closes the door the promote
  // modal's mouse-backdrop guard already closes, that shortcuts used to
  // bypass entirely.
  describe('hasBlockingModal / P4-D1 shortcut suppression', () => {
    let marker;

    afterEach(() => {
      if (marker) {
        document.body.removeChild(marker);
        marker = null;
      }
    });

    const mountBlockingModal = () => {
      marker = document.createElement('div');
      marker.setAttribute('aria-modal', 'true');
      document.body.appendChild(marker);
    };

    test('hasBlockingModal is false with nothing in the DOM', () => {
      expect(hasBlockingModal()).toBe(false);
    });

    test('hasBlockingModal is true once any element carries aria-modal="true"', () => {
      mountBlockingModal();
      expect(hasBlockingModal()).toBe(true);
    });

    test('Cmd+1/2/3 (view switch) is suppressed while a blocking modal is open', () => {
      mountBlockingModal();
      const store = makeStore();
      expect(handleTabShortcut(makeEvent({ key: '1', metaKey: true }), store, { mac: true })).toBe(
        false
      );
      expect(store.openWorkspaceView).not.toHaveBeenCalled();
    });

    test('Cmd+4-9 (tab position) is suppressed while a blocking modal is open', () => {
      mountBlockingModal();
      const store = makeStore();
      expect(handleTabShortcut(makeEvent({ key: '4', metaKey: true }), store, { mac: true })).toBe(
        false
      );
      expect(store.switchWorkspaceTab).not.toHaveBeenCalled();
    });

    test('Cmd+W (close active tab) is suppressed while a blocking modal is open', () => {
      mountBlockingModal();
      const store = makeStore();
      expect(handleTabShortcut(makeEvent({ key: 'w', metaKey: true }), store, { mac: true })).toBe(
        false
      );
      expect(store.requestCloseWorkspaceTab).not.toHaveBeenCalled();
    });

    test('Cmd+T (new tab) is suppressed while a blocking modal is open', () => {
      mountBlockingModal();
      const store = makeStore();
      expect(handleTabShortcut(makeEvent({ key: 't', metaKey: true }), store, { mac: true })).toBe(
        false
      );
      expect(store.openWorkspaceTab).not.toHaveBeenCalled();
    });

    test('shortcuts resume normally once the modal is gone', () => {
      mountBlockingModal();
      const store = makeStore();
      expect(handleTabShortcut(makeEvent({ key: '1', metaKey: true }), store, { mac: true })).toBe(
        false
      );
      document.body.removeChild(marker);
      marker = null;
      expect(handleTabShortcut(makeEvent({ key: '1', metaKey: true }), store, { mac: true })).toBe(
        true
      );
      expect(store.openWorkspaceView).toHaveBeenCalledWith('project');
    });
  });
});

describe('useWorkspaceTabShortcuts (mounted)', () => {
  const Harness = () => {
    useWorkspaceTabShortcuts();
    return null;
  };

  test('window keydown reaches the store through the hook (tab position, shifted to 4+)', () => {
    const switchWorkspaceTab = jest.fn();
    act(() => {
      useStore.setState({
        workspaceTabs: [{ id: 'chart:c1', type: 'chart', name: 'c1' }],
        workspaceActiveTabId: 'chart:c1',
        switchWorkspaceTab,
      });
    });
    render(<Harness />);
    // jsdom reports no mac platform → ctrlKey is the modifier.
    fireEvent.keyDown(window, { key: '4', ctrlKey: true });
    expect(switchWorkspaceTab).toHaveBeenCalledWith('chart:c1');
  });

  test('window keydown reaches the store through the hook (view switch, 1/2/3)', () => {
    act(() => {
      useStore.setState({ workspaceTabs: [], workspaceActiveTabId: null });
    });
    render(<Harness />);
    fireEvent.keyDown(window, { key: '2', ctrlKey: true });
    expect(useStore.getState().workspaceActiveView).toBe('semantic-layer');
  });

  test('the listener is removed on unmount', () => {
    const switchWorkspaceTab = jest.fn();
    act(() => {
      useStore.setState({
        workspaceTabs: [{ id: 'chart:c1', type: 'chart', name: 'c1' }],
        workspaceActiveTabId: 'chart:c1',
        switchWorkspaceTab,
      });
    });
    const { unmount } = render(<Harness />);
    unmount();
    fireEvent.keyDown(window, { key: '4', ctrlKey: true });
    expect(switchWorkspaceTab).not.toHaveBeenCalled();
  });
});
