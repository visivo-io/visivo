/**
 * useWorkspaceTabShortcuts (VIS-812 / Track O O-3).
 *
 * Covers the pure `handleTabShortcut` dispatcher (mod resolution per
 * platform, editable-target suppression, all three shortcut families) plus a
 * mounted integration pass driving real window keydown events through the
 * hook into the store.
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import useWorkspaceTabShortcuts, {
  handleTabShortcut,
  isEditableTarget,
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
  workspaceTabs: [
    { id: 'project:analytics', type: 'project', name: 'analytics' },
    { id: 'chart:c1', type: 'chart', name: 'c1' },
    { id: 'table:t1', type: 'table', name: 't1' },
  ],
  workspaceActiveTabId: 'chart:c1',
  openWorkspaceTab: jest.fn(),
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

  test('Cmd+1..9 switches by strip position; out-of-range digits are left to the browser', () => {
    const store = makeStore();
    const e2 = makeEvent({ key: '2', metaKey: true });
    expect(handleTabShortcut(e2, store, { mac: true })).toBe(true);
    expect(e2.preventDefault).toHaveBeenCalled();
    expect(store.switchWorkspaceTab).toHaveBeenCalledWith('chart:c1');

    const e9 = makeEvent({ key: '9', metaKey: true });
    expect(handleTabShortcut(e9, store, { mac: true })).toBe(false);
    expect(e9.preventDefault).not.toHaveBeenCalled();
    expect(store.switchWorkspaceTab).toHaveBeenCalledTimes(1);
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
});

describe('useWorkspaceTabShortcuts (mounted)', () => {
  const Harness = () => {
    useWorkspaceTabShortcuts();
    return null;
  };

  test('window keydown reaches the store through the hook', () => {
    const switchWorkspaceTab = jest.fn();
    act(() => {
      useStore.setState({
        workspaceTabs: [
          { id: 'project:p', type: 'project', name: 'p' },
          { id: 'chart:c1', type: 'chart', name: 'c1' },
        ],
        workspaceActiveTabId: 'project:p',
        switchWorkspaceTab,
      });
    });
    render(<Harness />);
    // jsdom reports no mac platform → ctrlKey is the modifier.
    fireEvent.keyDown(window, { key: '2', ctrlKey: true });
    expect(switchWorkspaceTab).toHaveBeenCalledWith('chart:c1');
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
    fireEvent.keyDown(window, { key: '1', ctrlKey: true });
    expect(switchWorkspaceTab).not.toHaveBeenCalled();
  });
});
