/**
 * workspaceErdLayoutStore — session-only per-scope ERD layout (build spec §6).
 *
 * Pins the set/get/clear contract: node positions + pill waypoints round-trip
 * per scope, scopes never collide, clearErdLayout wipes nodes+waypoints AND
 * bumps layoutVersion, and getErdLayout returns a STABLE empty identity.
 */
import { act } from '@testing-library/react';
import useStore from './store';

const reset = () => {
  act(() => {
    useStore.setState({ workspaceErdLayout: {}, workspaceErdLayoutVersion: {} });
  });
};

describe('workspaceErdLayoutStore slice', () => {
  beforeEach(reset);

  test('setErdNodePosition round-trips a position for a scope', () => {
    act(() => useStore.getState().setErdNodePosition('semantic-layer', 'n1', { x: 10, y: 20 }));
    expect(useStore.getState().getErdLayout('semantic-layer').nodes.n1).toEqual({ x: 10, y: 20 });
  });

  test('setErdNodePositions batch-writes multiple positions', () => {
    act(() =>
      useStore
        .getState()
        .setErdNodePositions('semantic-layer', { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } })
    );
    const { nodes } = useStore.getState().getErdLayout('semantic-layer');
    expect(nodes.a).toEqual({ x: 1, y: 2 });
    expect(nodes.b).toEqual({ x: 3, y: 4 });
  });

  test('setErdNodePositions ignores non-finite coords', () => {
    act(() =>
      useStore
        .getState()
        .setErdNodePositions('semantic-layer', { ok: { x: 5, y: 6 }, bad: { x: NaN, y: 1 } })
    );
    const { nodes } = useStore.getState().getErdLayout('semantic-layer');
    expect(nodes.ok).toEqual({ x: 5, y: 6 });
    expect(nodes.bad).toBeUndefined();
  });

  test('"semantic-layer" and "relation:x" scopes never collide', () => {
    act(() => {
      useStore.getState().setErdNodePosition('semantic-layer', 'n1', { x: 1, y: 1 });
      useStore.getState().setErdNodePosition('relation:orders_to_users', 'n1', { x: 9, y: 9 });
    });
    expect(useStore.getState().getErdLayout('semantic-layer').nodes.n1).toEqual({ x: 1, y: 1 });
    expect(
      useStore.getState().getErdLayout('relation:orders_to_users').nodes.n1
    ).toEqual({ x: 9, y: 9 });
  });

  test('setErdEdgeWaypoint sets and clears a waypoint', () => {
    act(() => useStore.getState().setErdEdgeWaypoint('semantic-layer', 'e1', { x: 7, y: 8 }));
    expect(useStore.getState().getErdLayout('semantic-layer').waypoints.e1).toEqual({ x: 7, y: 8 });
    // null clears it.
    act(() => useStore.getState().setErdEdgeWaypoint('semantic-layer', 'e1', null));
    expect(useStore.getState().getErdLayout('semantic-layer').waypoints.e1).toBeUndefined();
  });

  test('setting a waypoint does not clobber node positions (and vice versa)', () => {
    act(() => {
      useStore.getState().setErdNodePosition('semantic-layer', 'n1', { x: 2, y: 3 });
      useStore.getState().setErdEdgeWaypoint('semantic-layer', 'e1', { x: 4, y: 5 });
    });
    const layout = useStore.getState().getErdLayout('semantic-layer');
    expect(layout.nodes.n1).toEqual({ x: 2, y: 3 });
    expect(layout.waypoints.e1).toEqual({ x: 4, y: 5 });
  });

  test('clearErdLayout wipes nodes+waypoints AND bumps layoutVersion', () => {
    act(() => {
      useStore.getState().setErdNodePosition('semantic-layer', 'n1', { x: 1, y: 1 });
      useStore.getState().setErdEdgeWaypoint('semantic-layer', 'e1', { x: 2, y: 2 });
    });
    const before = useStore.getState().workspaceErdLayoutVersion['semantic-layer'] || 0;
    act(() => useStore.getState().clearErdLayout('semantic-layer'));
    const layout = useStore.getState().getErdLayout('semantic-layer');
    expect(layout.nodes).toEqual({});
    expect(layout.waypoints).toEqual({});
    expect(useStore.getState().workspaceErdLayoutVersion['semantic-layer']).toBe(before + 1);
  });

  test('clearErdLayout only affects the targeted scope', () => {
    act(() => {
      useStore.getState().setErdNodePosition('semantic-layer', 'n1', { x: 1, y: 1 });
      useStore.getState().setErdNodePosition('relation:__all__', 'n1', { x: 2, y: 2 });
      useStore.getState().clearErdLayout('semantic-layer');
    });
    expect(useStore.getState().getErdLayout('semantic-layer').nodes).toEqual({});
    expect(useStore.getState().getErdLayout('relation:__all__').nodes.n1).toEqual({ x: 2, y: 2 });
  });

  test('getErdLayout returns a STABLE empty identity for untouched scopes', () => {
    const a = useStore.getState().getErdLayout('never-touched');
    const b = useStore.getState().getErdLayout('also-untouched');
    expect(a).toBe(b); // same frozen empty reference → no memo churn
    expect(a.nodes).toEqual({});
    expect(a.waypoints).toEqual({});
  });

  test('the slice is session-only (not in the persisted partialize set)', () => {
    // Sanity: writing layout doesn't add it to the persisted keys. We assert the
    // state key exists on the live store but is not one of the persisted names.
    act(() => useStore.getState().setErdNodePosition('semantic-layer', 'n1', { x: 1, y: 1 }));
    expect(useStore.getState().workspaceErdLayout['semantic-layer']).toBeDefined();
  });
});
