import { io } from 'socket.io-client';
import { isAvailable } from '../contexts/URLContext';

/**
 * One way to ask "tell me when this happens", with two transports underneath.
 *
 * Two screens want the same thing — the run view and the agent tab both show
 * work happening now — and two environments answer it differently. `visivo
 * serve` runs `flask_socketio` and can push; cloud has no push channel at all
 * and the viewer polls. Writing each screen against whichever it happens to
 * have is how the same screen gets written twice.
 *
 * So a screen subscribes to a TOPIC and never learns which transport served
 * it. When cloud grows a socket (VIS-1345's sidecar), the screens do not
 * change; the topic's transport does.
 *
 * A topic declares both halves because only the topic knows them: the socket
 * event its payload arrives on, and how to fetch the same thing when there is
 * no socket to arrive on.
 *
 * One rule decides what a subscriber receives, and it falls out of what the
 * topic declared rather than needing a flag:
 *
 *   with `poll`    the socket event is a SIGNAL — `poll` fetches the value and
 *                  the subscriber gets that, so both transports deliver the
 *                  identical shape by construction. Runs work this way.
 *   without `poll` the socket payload IS the value, because nothing can be
 *                  asked for it — there is no endpoint that returns "a tool
 *                  just ran" or "the project recompiled".
 *
 * The first case is what makes "a screen cannot tell which transport it got"
 * true rather than aspirational: a payload shape and a polled shape that only
 * have to agree by convention are two shapes that will eventually disagree.
 */

/** No socket to connect to — a dist build is static files (VIS-1326). */
const canPush = () => isAvailable('socketIo');

/**
 * One connection per subscription, deliberately.
 *
 * `socket.io-client` already caches its Manager per URL and multiplexes
 * events over a single transport, so this does not open a socket per screen —
 * the library does the sharing. An earlier version refcounted a module-level
 * connection on top of that and got the count wrong: a subscriber that never
 * released left the socket open across the whole suite.
 */
const connect = () =>
  io({
    // The Flask-SocketIO server runs in threading mode — polling is its
    // native transport; websocket upgrade is attempted automatically.
    transports: ['polling', 'websocket'],
    reconnectionAttempts: 5,
  });

/**
 * Subscribe to a topic. Returns the unsubscribe.
 *
 * @param {{event: string, poll?: function, intervalMs?: number}} topic
 * @param {function} handler called with the payload, however it arrived
 */
export function subscribe(topic, handler) {
  if (canPush()) {
    const socket = connect();
    // A topic that knows how to fetch its value always fetches it; the event
    // only says when. See the rule in the module docstring.
    const onEvent = topic.poll
      ? async () => {
          try {
            const value = await topic.poll();
            if (value !== undefined) handler(value);
          } catch {
            // A push we could not follow up on is not a dead subscription.
          }
        }
      : handler;
    socket.on(topic.event, onEvent);
    return () => {
      socket.off(topic.event, onEvent);
      socket.close();
    };
  }

  // No push here. A topic with no `poll` simply never fires, which is the
  // honest answer for something only a server can know — better than an
  // interval that asks an endpoint that does not exist.
  if (!topic.poll) return () => {};

  let stopped = false;
  let timer;
  const tick = async () => {
    if (stopped) return;
    try {
      const payload = await topic.poll();
      if (!stopped && payload !== undefined) handler(payload);
    } catch {
      // A failed poll is not a failed subscription — the next one may work.
    }
    if (!stopped) timer = setTimeout(tick, topic.intervalMs ?? 3000);
  };
  tick();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** Whether a subscription to this topic can currently deliver anything. */
export function canDeliver(topic) {
  return canPush() || Boolean(topic.poll);
}

