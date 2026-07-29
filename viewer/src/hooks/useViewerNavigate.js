import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { viewerPath } from '../contexts/viewerBase';

/**
 * `useNavigate`, with root-absolute paths resolved against the viewer's mount
 * base (see contexts/viewerBase).
 *
 * Use this instead of `useNavigate` anywhere the destination is a viewer
 * surface written root-absolute (`/workspace`, `/explorer`, …). At the root
 * mount it is exactly `useNavigate`; under a prefix it keeps the navigation
 * inside it, so the host doesn't have to catch and repair the escape.
 *
 * Everything `useNavigate` accepts still works: a delta (`navigate(-1)`), a
 * relative path, or a location object — only a root-absolute string is rebased.
 */
export const useViewerNavigate = () => {
  const navigate = useNavigate();

  return useCallback(
    (...args) => {
      const [to, ...rest] = args;
      if (typeof to === 'number') return navigate(to);
      const rebased =
        to && typeof to === 'object' && typeof to.pathname === 'string'
          ? { ...to, pathname: viewerPath(to.pathname) }
          : viewerPath(to);
      // Forward the arguments we were actually given. Always passing a second
      // one would turn `navigate('/x')` into `navigate('/x', undefined)` — same
      // behaviour at runtime, but it breaks every caller's test assertion and
      // makes this a leaky drop-in rather than a transparent one.
      return navigate(rebased, ...rest);
    },
    [navigate]
  );
};

export default useViewerNavigate;
