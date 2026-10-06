/**
 * The event-source seam (VIS-1345 / VIS-1337).
 *
 * The point of it is that a screen cannot tell which transport served it, so
 * that is what these pin: the same subscribe call over a socket and over a
 * poller, and the cases where the transports differ in ways a screen would
 * otherwise have to know about.
 */
import { io } from 'socket.io-client';
import { subscribe, canDeliver } from './eventSource';
import { setGlobalURLConfig, createURLConfig } from '../contexts/URLContext';

jest.mock('socket.io-client', () => {
  const handlers = {};
  const socket = {
    on: jest.fn((event, fn) => {
      handlers[event] = fn;
    }),
    off: jest.fn(event => {
      delete handlers[event];
    }),
    close: jest.fn(),
    _handlers: handlers,
  };
  return { io: jest.fn(() => socket) };
});

const getSocket = () => io.mock.results[io.mock.results.length - 1].value;
const TOPIC = { event: 'thing_happened' };

const server = () => setGlobalURLConfig(createURLConfig({ environment: 'server' }));
const dist = () => setGlobalURLConfig(createURLConfig({ environment: 'dist' }));

beforeEach(() => {
  jest.clearAllMocks();
  server();
});

afterEach(() => {
  server();
});

describe('where the server can push', () => {
  it('delivers the payload the socket carried', () => {
    const handler = jest.fn();
    subscribe(TOPIC, handler);

    getSocket()._handlers.thing_happened({ id: 7 });

    expect(handler).toHaveBeenCalledWith({ id: 7 });
  });

  it('unsubscribing releases the connection it opened', () => {
    // No refcounting here on purpose: socket.io-client caches its Manager per
    // URL and multiplexes, so the library does the sharing. An earlier version
    // counted subscribers on top of that and leaked a socket across the suite
    // when one never released.
    const unsubscribe = subscribe(TOPIC, jest.fn());

    unsubscribe();

    expect(getSocket().close).toHaveBeenCalled();
  });

  it('a topic that can fetch treats the event as a signal', async () => {
    // Both transports then deliver the identical shape by construction — a
    // socket payload and a polled value that only agree by convention are two
    // shapes that will eventually disagree.
    const poll = jest.fn().mockResolvedValue([{ id: 'run-1', state: 'running' }]);
    const handler = jest.fn();
    subscribe({ event: 'runs_changed', poll }, handler);

    getSocket()._handlers.runs_changed({ ignored: true });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(poll).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith([{ id: 'run-1', state: 'running' }]);
  });

  it('a topic that cannot fetch delivers what the event carried', () => {
    // Nothing can be asked "did the project recompile?" — the payload is the
    // only source.
    const handler = jest.fn();
    subscribe(TOPIC, handler);

    getSocket()._handlers.thing_happened({ drafts_dropped: true });

    expect(handler).toHaveBeenCalledWith({ drafts_dropped: true });
  });

  it('a push we cannot follow up on is not a dead subscription', async () => {
    const poll = jest
      .fn()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValue(['second']);
    const handler = jest.fn();
    subscribe({ event: 'runs_changed', poll }, handler);

    getSocket()._handlers.runs_changed({});
    await new Promise(resolve => setTimeout(resolve, 0));
    getSocket()._handlers.runs_changed({});
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(handler).toHaveBeenCalledWith(['second']);
  });

  it('stops delivering after unsubscribe', () => {
    const handler = jest.fn();
    const unsubscribe = subscribe(TOPIC, handler);

    unsubscribe();

    expect(getSocket().off).toHaveBeenCalledWith('thing_happened', handler);
  });
});

describe('where it cannot', () => {
  // Cloud has no push channel, and a dist build is static files with no
  // server at all (VIS-1326) — which is why this is gated rather than
  // attempted and retried.
  const POLLED = { event: 'thing_happened', poll: null, intervalMs: 10 };

  beforeEach(() => {
    dist();
  });

  it('never opens a socket', () => {
    subscribe({ ...POLLED, poll: jest.fn().mockResolvedValue({ id: 1 }) }, jest.fn());

    expect(io).not.toHaveBeenCalled();
  });

  it('delivers what the poller fetched, in the same shape', async () => {
    const handler = jest.fn();
    subscribe({ ...POLLED, poll: jest.fn().mockResolvedValue({ id: 7 }) }, handler);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(handler).toHaveBeenCalledWith({ id: 7 });
  });

  it('a topic only a server can know simply never fires', () => {
    // Better than an interval asking an endpoint that does not exist. A
    // recompile is the case: nothing in cloud can be asked whether one
    // happened.
    const handler = jest.fn();

    const unsubscribe = subscribe(TOPIC, handler);

    expect(canDeliver(TOPIC)).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  it('a failed poll is not a failed subscription', async () => {
    const poll = jest
      .fn()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValue({ id: 2 });
    const handler = jest.fn();
    subscribe({ ...POLLED, poll }, handler);

    await new Promise(resolve => setTimeout(resolve, 40));

    expect(handler).toHaveBeenCalledWith({ id: 2 });
  });

  it('stops polling after unsubscribe', async () => {
    const poll = jest.fn().mockResolvedValue({ id: 1 });
    const unsubscribe = subscribe({ ...POLLED, poll }, jest.fn());
    await new Promise(resolve => setTimeout(resolve, 0));

    unsubscribe();
    const afterStop = poll.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 40));

    expect(poll.mock.calls.length).toBe(afterStop);
  });
});

describe('canDeliver', () => {
  it('is true where the server pushes, whatever the topic', () => {
    expect(canDeliver(TOPIC)).toBe(true);
  });

  it('is true without a socket when the topic can be polled', () => {
    dist();

    expect(canDeliver({ ...TOPIC, poll: jest.fn() })).toBe(true);
  });
});
