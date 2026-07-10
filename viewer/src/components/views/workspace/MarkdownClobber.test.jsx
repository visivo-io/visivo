/**
 * Markdown 3-path clobber CANARY (VIS-1018 step 2).
 *
 * The SAME markdown record was historically written by THREE independent save
 * paths that could clobber each other:
 *   (1) MarkdownEditorCanvas — a LOCAL draft + ~600ms debounced `saveMarkdown`,
 *   (2) MarkdownEditForm     — the footer `handleSave` calling `saveMarkdown`,
 *   (3) useObjectSave        — the standalone rail-save → `saveMarkdown`.
 * Each captured its OWN draft at schedule time, so whichever debounce fired LAST
 * (by wall-clock) won — overwriting the newer edit from the other surface with a
 * stale value.
 *
 * The fix routes all of them through the unified `useRecordSave('markdown', …)`
 * backbone: every edit writes the record's config into the store collection
 * OPTIMISTICALLY (`updateRecordConfigOptimistic`) and the debounced persist reads
 * the CURRENT store value at FIRE time. So two surfaces editing the same record
 * converge on the LAST WRITE rather than racing stale per-surface closures.
 *
 * This canary reproduces the race against the REAL store (real
 * `updateRecordConfigOptimistic`, mocked `saveMarkdown`):
 *
 *   1. open the markdown editor canvas,
 *   2. the RAIL schedules a save with content "R" (via its own `useRecordSave`
 *      instance — the exact hook MarkdownEditForm now flushes through),
 *   3. WITHIN the 600ms debounce window, the CANVAS edits content "C",
 *   4. advance timers past the debounce,
 *   5. assert the PERSISTED `saveMarkdown` value is "C" (the canvas edit, the
 *      last write) — NOT "R".
 *
 * Against the OLD independent-draft logic the canvas and rail held separate
 * drafts and the rail's stale "R" could land last, clobbering "C"; this test
 * asserts canvas-wins under the optimistic-store + fire-time-read fix.
 */
import React from 'react';
import { render, screen, act, fireEvent, renderHook } from '@testing-library/react';
import MarkdownEditorCanvas from './MarkdownEditorCanvas';
import useStore from '../../../stores/store';
import useRecordSave from '../../../hooks/useRecordSave';
import { ObjectCanvasDirtyContext } from './ObjectCanvasFrame';

// Echo the content the renderer receives so we can also eyeball the live preview.
jest.mock('../../items/Markdown', () => ({
  __esModule: true,
  default: props => (
    <div data-testid="markdown-renderer-mock">{props.markdown?.content}</div>
  ),
}));

const seed = saveMarkdown => {
  act(() => {
    useStore.setState({
      markdowns: [
        { name: 'intro', config: { content: '# seed', align: 'center', justify: 'end' } },
      ],
      saveMarkdown,
      fetchMarkdowns: jest.fn(),
      beginSaveActivity: jest.fn(),
      endSaveActivity: jest.fn(),
      saveActivityCount: 0,
      lastSaveFailed: false,
    });
  });
};

const renderCanvas = () =>
  render(
    <ObjectCanvasDirtyContext.Provider value={{ dirty: false, setDirty: jest.fn() }}>
      <MarkdownEditorCanvas activeObject={{ type: 'markdown', name: 'intro' }} />
    </ObjectCanvasDirtyContext.Provider>
  );

describe('Markdown 3-path clobber canary (VIS-1018)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('canvas edit (last write) wins over a rail edit scheduled within the debounce window', async () => {
    const saveMarkdown = jest.fn(() => Promise.resolve({ success: true }));
    seed(saveMarkdown);

    // The rail uses the SAME backbone the canvas does (this is the exact hook
    // MarkdownEditForm.handleSave now flushes through).
    const { result: rail } = renderHook(() => useRecordSave('markdown', 'intro', { delay: 600 }));

    renderCanvas();

    // (1) RAIL schedules a save with content "R".
    act(() => {
      rail.current.scheduleSave({
        name: 'intro',
        content: 'RAIL EDIT',
        align: 'center',
        justify: 'end',
      });
    });

    // (2) WITHIN the 600ms window, the CANVAS edits content "C".
    act(() => {
      jest.advanceTimersByTime(200); // still inside both debounce windows
    });
    fireEvent.change(screen.getByTestId('markdown-editor-textarea'), {
      target: { value: 'CANVAS EDIT' },
    });

    // (3) advance past the debounce so every pending persist fires.
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    // (4) the persisted value is the CANVAS edit (the last write), NOT the rail's.
    expect(saveMarkdown).toHaveBeenCalled();
    const lastCall = saveMarkdown.mock.calls[saveMarkdown.mock.calls.length - 1];
    expect(lastCall[0]).toBe('intro');
    expect(lastCall[1].content).toBe('CANVAS EDIT');

    // Defensively assert NO persist ever clobbered with the stale rail value.
    for (const call of saveMarkdown.mock.calls) {
      expect(call[1].content).not.toBe('RAIL EDIT');
    }

    // align/justify are preserved across the converged write.
    expect(lastCall[1]).toMatchObject({ align: 'center', justify: 'end' });
  });

  test('the store collection converges on the canvas edit before the persist fires', async () => {
    const saveMarkdown = jest.fn(() => Promise.resolve({ success: true }));
    seed(saveMarkdown);

    const { result: rail } = renderHook(() => useRecordSave('markdown', 'intro', { delay: 600 }));
    renderCanvas();

    act(() => {
      rail.current.scheduleSave({ name: 'intro', content: 'RAIL EDIT', align: 'center', justify: 'end' });
    });
    fireEvent.change(screen.getByTestId('markdown-editor-textarea'), {
      target: { value: 'CANVAS EDIT' },
    });

    // Both surfaces wrote to the SAME optimistic store entry; the canvas wrote
    // last, so the live record (read by the fire-time persist) is the canvas edit.
    const entry = useStore.getState().markdowns.find(m => m.name === 'intro');
    expect(entry.config.content).toBe('CANVAS EDIT');

    // Flush the pending debounce inside act so the persist's status update
    // doesn't escape act; it persists the converged canvas value.
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    const lastCall = saveMarkdown.mock.calls[saveMarkdown.mock.calls.length - 1];
    expect(lastCall[1].content).toBe('CANVAS EDIT');
  });
});
