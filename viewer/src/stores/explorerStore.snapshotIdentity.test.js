/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
/**
 * Snapshot object-identity regression armor (e2e-gap-review.md #28 —
 * LOW·PARTIAL: "draft.legacyState's nested objects are captured by reference,
 * never proven safe across many park/resume cycles").
 *
 * `snapshotExplorerWorkingState()`/`restoreExplorerWorkingState()`
 * (explorerStore.js) capture nested objects — `explorerInsightStates`, and
 * each model's `computedColumns` array — BY REFERENCE, not deep-cloned, when
 * a snapshot is embedded into an exploration's cached
 * `draft.legacyState` (explorationLegacyBridge.js's `legacyStateToDraft`).
 * This is currently safe ONLY because every mutator in explorerStore.js is
 * copy-on-write (spread — `{...state.x, [k]: ...}` / `[...arr, item]` — never
 * `.push()`/`.splice()`/direct assignment): switching to a different
 * exploration REPOINTS the live store at a brand-new object rather than
 * mutating the old one in place, so a PARKED exploration's already-cached
 * snapshot is never reachable from the live store again.
 *
 * No prior test pinned this invariant across MANY park/resume cycles between
 * two explorations — this is a pure object-IDENTITY concern, not
 * DOM-observable, so it's a unit test here rather than an e2e story. It locks
 * in the invariant so a future accidental in-place mutation on
 * `explorerInsightStates`/`computedColumns` fails loudly here instead of
 * silently corrupting a parked exploration's cached draft (e.g. the Home
 * gallery's "n queries · n insights" summary silently drifting whenever a
 * DIFFERENT exploration is edited afterward).
 */
import { act } from '@testing-library/react';
import useStore from './store';
import { legacyStateToDraft } from '../components/views/workspace/explorationLegacyBridge';

/** Snapshot the CURRENT live working state and project it into the shape a
 * real park (ExplorationPane's unmount cleanup -> updateExplorationDraft)
 * would cache under `workspaceExplorations.byId[id].draft`. */
const park = () => legacyStateToDraft(useStore.getState().snapshotExplorerWorkingState());

describe('draft.legacyState snapshot object identity across many park/resume cycles (#28)', () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({
        explorerModelTabs: [],
        explorerModelStates: {},
        explorerActiveModelName: null,
        explorerInsightStates: {},
        explorerChartInsightNames: [],
        explorerActiveInsightName: null,
        explorerChartName: null,
        explorerChartLayout: {},
        // Cross-type name-collision guard (assertNameUnique) reads these
        // cached-object collections too — keep them empty/deterministic so
        // this test's fixture names never collide with real project state
        // some other test file may have left behind.
        models: [],
        insights: [],
        sources: [],
        charts: [],
        inputs: [],
        metrics: [],
        dimensions: [],
        relations: [],
        tables: [],
        dashboards: [],
      });
    });
  });

  test("mutating exploration B many cycles after A last parked never mutates A's already-cached draft.legacyState object", () => {
    const byId = {};

    // ---- Cycle 0: build + park exploration A ----
    act(() => {
      useStore.getState().restoreExplorerWorkingState(null);
      useStore.getState().createModelTab('a_query');
      useStore.getState().addActiveModelComputedColumn({ name: 'a_col_1', expression: '1+1' });
      useStore.getState().createInsight('a_insight');
      useStore.getState().setInsightProp('a_insight', 'x', '${ref(a_query).a_col_1}');
    });
    byId.A = park();

    // Sanity check on the PREMISE itself (captured by reference, not a bug to
    // fix): the cached draft's `insightStates` really is the SAME object as
    // whatever the live store held at park time.
    expect(byId.A.legacyState.insightStates).toBe(useStore.getState().explorerInsightStates);

    // A snapshot of A's cached draft's CONTENT right after it first parked —
    // diffed against itself after 3 more full A<->B round trips below.
    const draftAAfterFirstPark = JSON.parse(JSON.stringify(byId.A));

    // ---- Cycle 0: switch to B (a hard reset, matching a real activate-a-
    // different-tab restore), build + park B ----
    act(() => {
      useStore.getState().restoreExplorerWorkingState(null);
      useStore.getState().createModelTab('b_query');
      useStore.getState().addActiveModelComputedColumn({ name: 'b_col_1', expression: '2+2' });
      useStore.getState().createInsight('b_insight');
      useStore.getState().setInsightProp('b_insight', 'y', '${ref(b_query).b_col_1}');
    });
    byId.B = park();

    // ---- 3 more park/resume cycles, alternating A -> B -> A -> B, each one
    // resuming from the OTHER exploration's own cached legacyState (exactly
    // what ExplorationPane's restore-on-activate does) and mutating further.
    for (let cycle = 0; cycle < 3; cycle++) {
      act(() => {
        useStore.getState().restoreExplorerWorkingState(byId.A.legacyState);
        useStore.getState().addActiveModelComputedColumn({
          name: `a_extra_${cycle}`,
          expression: `${cycle}`,
        });
        useStore.getState().setInsightProp('a_insight', `extra_${cycle}`, `val_${cycle}`);
      });
      byId.A = park();

      act(() => {
        useStore.getState().restoreExplorerWorkingState(byId.B.legacyState);
        useStore.getState().addActiveModelComputedColumn({
          name: `b_extra_${cycle}`,
          expression: `${cycle}`,
        });
        useStore.getState().setInsightProp('b_insight', `extra_${cycle}`, `val_${cycle}`);
      });
      byId.B = park();
    }

    // The FIRST cached snapshot's content (captured before any of the above)
    // is untouched by object reference — proving none of B's many later
    // mutations (nor A's own later re-parks, which repoint `byId.A` at a
    // brand-new draft object rather than mutating the first one) ever
    // reached back through the shared `insightStates`/`computedColumns`
    // references to corrupt an already-parked snapshot.
    expect(JSON.parse(JSON.stringify(draftAAfterFirstPark))).toEqual(draftAAfterFirstPark);
    expect(draftAAfterFirstPark.legacyState.insightStates.a_insight.props).toEqual({
      x: '${ref(a_query).a_col_1}',
    });
    expect(
      draftAAfterFirstPark.legacyState.modelStates.a_query.computedColumns.map(c => c.name)
    ).toEqual(['a_col_1']);

    // A's LATEST cached draft reflects every one of A's OWN edits, and NONE
    // of B's — proving the shared-reference risk never actually bled state
    // across explorations despite being captured by reference at every park.
    const finalA = byId.A;
    expect(Object.keys(finalA.legacyState.insightStates)).toEqual(['a_insight']);
    expect(finalA.legacyState.insightStates.a_insight.props).toEqual({
      x: '${ref(a_query).a_col_1}',
      extra_0: 'val_0',
      extra_1: 'val_1',
      extra_2: 'val_2',
    });
    expect(
      finalA.legacyState.modelStates.a_query.computedColumns.map(c => c.name)
    ).toEqual(['a_col_1', 'a_extra_0', 'a_extra_1', 'a_extra_2']);

    const finalB = byId.B;
    expect(Object.keys(finalB.legacyState.insightStates)).toEqual(['b_insight']);
    expect(finalB.legacyState.insightStates.b_insight.props).toEqual({
      y: '${ref(b_query).b_col_1}',
      extra_0: 'val_0',
      extra_1: 'val_1',
      extra_2: 'val_2',
    });
    expect(
      finalB.legacyState.modelStates.b_query.computedColumns.map(c => c.name)
    ).toEqual(['b_col_1', 'b_extra_0', 'b_extra_1', 'b_extra_2']);

    // And, critically, A's final draft carries NO trace of B's names/values
    // (the actual "cross-exploration bleed" failure mode #28 worries about).
    expect(finalA.legacyState.insightStates.b_insight).toBeUndefined();
    expect(finalA.legacyState.modelStates.b_query).toBeUndefined();
    expect(finalB.legacyState.insightStates.a_insight).toBeUndefined();
    expect(finalB.legacyState.modelStates.a_query).toBeUndefined();
  });
});
