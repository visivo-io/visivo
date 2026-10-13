import { useCallback, useEffect, useRef, useState } from 'react';
import {
  authorizationProgress,
  fetchAuthorization,
  startAuthorization,
} from '../api/authorization';
import { openOauthPopupWindow } from '../utils/utils';

const POLL_MS = 2000;
// Two minutes of a person signing in, creating an account, maybe finding the
// right browser window. Long enough to be patient, short enough that an
// abandoned popup stops polling rather than spinning until the tab closes.
const MAX_POLLS = 60;

/**
 * Whether this serve is authorized, and a way to become so (VIS-1377).
 *
 * "Authorized" is one idea — a token for the host this serve is pointed at —
 * so both the Agent tab and Deploy read it here rather than each keeping its
 * own answer and drifting.
 *
 * `authorize()` runs the device flow `serve` already hosts and re-checks when
 * it lands, so the surface that called it becomes usable without a reload.
 */
export default function useAuthorization() {
  const [authorized, setAuthorized] = useState(null);
  const [host, setHost] = useState(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState(null);
  const timer = useRef(null);
  const mounted = useRef(true);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const status = await fetchAuthorization();
      if (!mounted.current) return status;
      setAuthorized(status.authorized);
      setHost(status.host);
      return status;
    } catch {
      // A dist build has no server to ask, and that is not an error state —
      // it is a page with nothing to authorize.
      if (mounted.current) setAuthorized(false);
      return { authorized: false, host: null };
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
      stop();
    };
  }, [refresh, stop]);

  const authorize = useCallback(async () => {
    if (working) return;
    setWorking(true);
    setMessage(null);
    try {
      const { authId, url } = await startAuthorization();
      openOauthPopupWindow(url, 'Authorize Visivo');

      let polls = 0;
      stop();
      timer.current = setInterval(async () => {
        polls += 1;
        if (polls > MAX_POLLS) {
          stop();
          if (mounted.current) {
            setWorking(false);
            setMessage('Timed out waiting for authorization.');
          }
          return;
        }
        try {
          const progress = await authorizationProgress(authId);
          if (!mounted.current) return;
          setMessage(progress.message);
          if (progress.done) {
            stop();
            await refresh();
            if (mounted.current) {
              setWorking(false);
              setMessage(null);
            }
          } else if (progress.failed) {
            stop();
            setWorking(false);
            setMessage('Authorization was refused.');
          }
        } catch {
          stop();
          if (mounted.current) {
            setWorking(false);
            setMessage('Lost contact while authorizing.');
          }
        }
      }, POLL_MS);
    } catch (error) {
      setWorking(false);
      setMessage(error.message);
    }
  }, [working, stop, refresh]);

  return { authorized, host, working, message, authorize, refresh };
}
