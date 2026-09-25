/**
 * useProjectChangeListener tests (VIS-808 / Track H H-2).
 *
 * The Workspace's socket bridge: `project_changed` → store soft-refresh
 * (+ external_edit_overwrite telemetry when drafts were dropped), and the
 * window soft-reload flag that suppresses the legacy hot-reload script's
 * hard refresh while the Workspace is mounted.
 */
import { renderHook } from '@testing-library/react';
import { io } from 'socket.io-client';
import useStore from '../../../stores/store';
import useProjectChangeListener from './useProjectChangeListener';
import { setWorkspaceTelemetryListener } from './telemetry';
import { setGlobalURLConfig, createURLConfig } from '../../../contexts/URLContext';

jest.mock('socket.io-client', () => {
  const handlers = {};
  const socket = {
    on: jest.fn((event, fn) => {
      handlers[event] = fn;
    }),
    close: jest.fn(),
    _handlers: handlers,
  };
  return { io: jest.fn(() => socket) };
});

const getSocket = () => io.mock.results[io.mock.results.length - 1].value;

describe('useProjectChangeListener (VIS-808)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete window.__VISIVO_SOFT_RELOAD__;
    useStore.setState({
      refreshFromProjectChange: jest.fn().mockResolvedValue(undefined),
      externalEditBannerVisible: false,
    });
  });

  test('sets the soft-reload flag while mounted and clears it on unmount', () => {
    const { unmount } = renderHook(() => useProjectChangeListener());

    expect(window.__VISIVO_SOFT_RELOAD__).toBe(true);
    unmount();
    expect(window.__VISIVO_SOFT_RELOAD__).toBe(false);
    expect(getSocket().close).toHaveBeenCalled();
  });

  test('project_changed triggers the store soft-refresh', () => {
    renderHook(() => useProjectChangeListener());

    getSocket()._handlers.project_changed({ drafts_dropped: false });

    expect(useStore.getState().refreshFromProjectChange).toHaveBeenCalledWith({
      draftsDropped: false,
    });
  });

  test('drafts_dropped emits external_edit_overwrite telemetry', () => {
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener(evt => events.push(evt));
    try {
      renderHook(() => useProjectChangeListener());

      getSocket()._handlers.project_changed({ drafts_dropped: true });

      expect(useStore.getState().refreshFromProjectChange).toHaveBeenCalledWith({
        draftsDropped: true,
      });
      expect(events.map(e => e.eventName)).toContain('external_edit_overwrite');
    } finally {
      unsubscribe();
    }
  });

  test('a clean recompile does not emit the overwrite event', () => {
    const events = [];
    const unsubscribe = setWorkspaceTelemetryListener(evt => events.push(evt));
    try {
      renderHook(() => useProjectChangeListener());

      getSocket()._handlers.project_changed({ drafts_dropped: false });

      expect(events.map(e => e.eventName)).not.toContain('external_edit_overwrite');
    } finally {
      unsubscribe();
    }
  });

  // VIS-1326: a dist build is static files with no Socket.IO server, so the
  // connection 404-polled forever. Gated on the same server-vs-dist signal
  // the router uses (urls.js's `socketIo` key).
  describe('on a dist build', () => {
    afterEach(() => {
      setGlobalURLConfig(createURLConfig({ environment: 'server' }));
    });

    test('never opens the socket, and sets no soft-reload flag', () => {
      setGlobalURLConfig(createURLConfig({ environment: 'dist' }));

      renderHook(() => useProjectChangeListener());

      expect(io).not.toHaveBeenCalled();
      expect(window.__VISIVO_SOFT_RELOAD__).toBeUndefined();
    });
  });
});
