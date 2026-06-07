/**
 * MarkdownPreview tests (VIS-795 / N-3).
 *
 * The Track-N markdown preview reuses the EXISTING <Markdown> renderer,
 * resolving the saved markdown from the markdown store by name. <Markdown> is
 * mocked for a focused unit test.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import MarkdownPreview from './MarkdownPreview';
import useStore from '../../../stores/store';

const mockMdSpy = jest.fn();
jest.mock('../../items/Markdown', () => ({
  __esModule: true,
  default: props => {
    mockMdSpy(props);
    return <div data-testid="markdown-renderer-mock">{props.markdown?.content}</div>;
  },
}));

const seed = (markdowns = []) => {
  act(() => {
    useStore.setState({ markdowns, fetchMarkdowns: jest.fn() });
  });
};

describe('MarkdownPreview (VIS-795)', () => {
  beforeEach(() => mockMdSpy.mockClear());

  test('renders the existing Markdown renderer for a saved markdown', () => {
    seed([{ name: 'intro', config: { content: '# Hello' } }]);
    render(<MarkdownPreview activeObject={{ type: 'markdown', name: 'intro' }} />);
    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-renderer-mock')).toHaveTextContent('# Hello');
  });

  test('passes the resolved config (with name) to the renderer', () => {
    seed([{ name: 'intro', config: { content: '# Hi', align: 'center' } }]);
    render(<MarkdownPreview activeObject={{ type: 'markdown', name: 'intro' }} />);
    const passed = mockMdSpy.mock.calls[0][0].markdown;
    expect(passed).toMatchObject({ name: 'intro', content: '# Hi', align: 'center' });
  });

  test('renders an empty state when the markdown is not found', () => {
    seed([]);
    render(<MarkdownPreview activeObject={{ type: 'markdown', name: 'missing' }} />);
    expect(screen.getByTestId('markdown-preview-empty')).toHaveTextContent(/not found/i);
  });
});
