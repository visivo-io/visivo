/**
 * MarkdownEditorCanvas tests (VIS-1010).
 *
 * The editable `edit` lens of the markdown canvas: a split editor (left) + live
 * preview (right). We mock the shared <Markdown> renderer for a focused unit
 * test (it echoes the content it receives so we can assert the LIVE preview
 * tracks the draft), the debounced save action on the store, and the frame's
 * dirty context.
 */
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import MarkdownEditorCanvas from './MarkdownEditorCanvas';
import useStore from '../../../stores/store';
import { ObjectCanvasDirtyContext } from './ObjectCanvasFrame';

const mockMdSpy = jest.fn();
jest.mock('../../items/Markdown', () => ({
  __esModule: true,
  default: props => {
    mockMdSpy(props);
    return <div data-testid="markdown-renderer-mock">{props.markdown?.content}</div>;
  },
}));

const seed = (markdowns = [], saveMarkdown = jest.fn(() => Promise.resolve({ success: true }))) => {
  act(() => {
    useStore.setState({
      markdowns,
      saveMarkdown,
      fetchMarkdowns: jest.fn(),
      beginSaveActivity: jest.fn(),
      endSaveActivity: jest.fn(),
    });
  });
  return saveMarkdown;
};

const renderEditor = (overrides = {}) => {
  const setDirty = overrides.setDirty || jest.fn();
  const ctx = { dirty: false, setDirty };
  const utils = render(
    <ObjectCanvasDirtyContext.Provider value={ctx}>
      <MarkdownEditorCanvas
        activeObject={overrides.activeObject || { type: 'markdown', name: 'intro' }}
        record={overrides.record}
      />
    </ObjectCanvasDirtyContext.Provider>
  );
  return { setDirty, ...utils };
};

describe('MarkdownEditorCanvas (VIS-1010)', () => {
  beforeEach(() => mockMdSpy.mockClear());

  test('seeds the textarea from the saved markdown record', () => {
    seed([{ name: 'intro', config: { content: '# Hello' } }]);
    renderEditor();

    expect(screen.getByTestId('markdown-editor-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-editor-textarea')).toHaveValue('# Hello');
    // The live preview renders the seeded content too.
    expect(screen.getByTestId('markdown-editor-preview')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-renderer-mock')).toHaveTextContent('# Hello');
  });

  test('editing the textarea updates the LIVE preview', () => {
    seed([{ name: 'intro', config: { content: '# Hello' } }]);
    renderEditor();

    const textarea = screen.getByTestId('markdown-editor-textarea');
    fireEvent.change(textarea, { target: { value: '# Hello world' } });

    expect(textarea).toHaveValue('# Hello world');
    expect(screen.getByTestId('markdown-renderer-mock')).toHaveTextContent('# Hello world');
  });

  test('a change debounce-saves through the store and preserves align/justify', async () => {
    const saveMarkdown = seed([
      { name: 'intro', config: { content: '# Hello', align: 'center', justify: 'end' } },
    ]);
    renderEditor();

    fireEvent.change(screen.getByTestId('markdown-editor-textarea'), {
      target: { value: '# Hello world' },
    });

    // Debounced (~600ms): the save fires after the window elapses, not on keypress.
    await waitFor(() => expect(saveMarkdown).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(saveMarkdown).toHaveBeenCalledWith('intro', {
      name: 'intro',
      content: '# Hello world',
      align: 'center',
      justify: 'end',
    });
  });

  test('a change sets the frame dirty; matching the saved content clears it', () => {
    const setDirty = jest.fn();
    seed([{ name: 'intro', config: { content: '# Hello' } }]);
    renderEditor({ setDirty });

    // Initial mount: draft === saved → not dirty.
    expect(setDirty).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getByTestId('markdown-editor-textarea'), {
      target: { value: '# Hello!' },
    });
    expect(setDirty).toHaveBeenLastCalledWith(true);

    // Type back to the saved value → dirty clears.
    fireEvent.change(screen.getByTestId('markdown-editor-textarea'), {
      target: { value: '# Hello' },
    });
    expect(setDirty).toHaveBeenLastCalledWith(false);
  });

  test('falls back to the frame-resolved record when the store has no match', () => {
    seed([]); // empty store collection
    renderEditor({ record: { name: 'intro', content: '# From record', align: 'left' } });

    expect(screen.getByTestId('markdown-editor-textarea')).toHaveValue('# From record');
  });
});
