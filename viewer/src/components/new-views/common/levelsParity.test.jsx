/**
 * Canvas ↔ editor LEVELS parity (VIS-899).
 *
 * The regression this guards: the canvas Project Editor rendered level groups
 * derived from the shared default level names while the right-rail
 * Project-Settings form read the literal `defaults.levels` and showed
 * "No dashboard levels defined" — two sources, one mismatch.
 *
 * These tests assert the two surfaces show the SAME ordered level labels for
 * BOTH cases:
 *   1. no levels configured  → both fall back to the shared defaults
 *   2. levels configured     → both show the configured list, in order
 *
 * "Canvas" labels come from the real `groupDashboardsByLevel` (the function
 * ProjectEditor renders). "Editor" labels come from the real
 * <ProjectDefaultsEditForm> rendered into the DOM (the level <input> titles).
 * Both read through the shared `getEffectiveLevels` source of truth.
 *
 * The comparison goes through the reusable `assertSurfacesMatch` harness so
 * future object types can add a sibling descriptor + test.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import ProjectDefaultsEditForm from './ProjectDefaultsEditForm';
import { groupDashboardsByLevel } from '../project/editor/useProjectEditorData';
import {
  canvasLevelLabels,
  editorLevelLabels,
  assertSurfacesMatch,
} from '../../../utils/parityTestUtils';
import { defaultLevels } from '../../../utils/dashboardUtils';
import useStore from '../../../stores/store';

// The form pulls a couple of unrelated store actions on mount; stub them so the
// render is self-contained and we only exercise the level surface.
const seedStore = () => {
  act(() => {
    useStore.setState({
      fetchSources: jest.fn(),
      saveDefaults: jest.fn().mockResolvedValue({ success: true }),
      checkPublishStatus: jest.fn(),
      sources: [],
    });
  });
};

// Read the level titles the rendered editor form actually shows: each level row
// renders a title <input> with placeholder "Title".
const readEditorTitles = () =>
  screen
    .queryAllByPlaceholderText('Title')
    .map(input => input.value);

const renderEditor = defaults => {
  render(<ProjectDefaultsEditForm defaults={defaults} onSave={() => {}} onClose={() => {}} />);
};

describe('canvas ↔ editor levels parity (VIS-899)', () => {
  beforeEach(seedStore);

  test('no levels configured: both surfaces show the shared default levels', () => {
    const defaults = { levels: [] };

    // Canvas surface — grouped output (with some dashboards so groups render).
    const groups = groupDashboardsByLevel(
      [{ name: 'exec', config: { level: 0 } }],
      defaults
    );
    const canvas = canvasLevelLabels(groups);

    // Editor surface — actually rendered form.
    renderEditor(defaults);
    const editor = editorLevelLabels(
      readEditorTitles().map(title => ({ title }))
    );

    // The editor shows the full editable set (the shared defaults) — NOT empty
    // / "No levels defined" (the original VIS-899 bug). The canvas applies
    // display windowing on top of the SAME source, so it is an in-order prefix.
    expect(editor.length).toBeGreaterThan(0);
    expect(editor).toEqual(defaultLevels.map(l => l.title));
    expect(canvas.length).toBeGreaterThan(0);
    expect(() =>
      assertSurfacesMatch({ objectType: 'levels', canvas, editor, mode: 'prefix' })
    ).not.toThrow();
  });

  test('levels configured: both surfaces show the configured list in order', () => {
    const defaults = {
      levels: [
        { title: 'Exec', description: 'top' },
        { title: 'Ops', description: 'day to day' },
        { title: 'Squad', description: 'team' },
      ],
    };

    const groups = groupDashboardsByLevel(
      [{ name: 'a', config: { level: 'Exec' } }, { name: 'b', config: { level: 'Squad' } }],
      defaults
    );
    const canvas = canvasLevelLabels(groups);

    renderEditor(defaults);
    const editor = editorLevelLabels(readEditorTitles().map(title => ({ title })));

    expect(canvas).toEqual(['Exec', 'Ops', 'Squad']);
    expect(editor).toEqual(['Exec', 'Ops', 'Squad']);
    expect(() => assertSurfacesMatch({ objectType: 'levels', canvas, editor })).not.toThrow();
  });

  test('parity harness detects the original bug (canvas non-empty, editor empty)', () => {
    // The exact VIS-899 regression: canvas renders levels, editor shows none.
    expect(() =>
      assertSurfacesMatch({
        objectType: 'levels',
        canvas: ['Organization', 'Department'],
        editor: [],
        mode: 'prefix',
      })
    ).toThrow(/parity mismatch for "levels"/);
  });
});
