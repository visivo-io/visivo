import React from 'react';
import { render, screen, within } from '@testing-library/react';
import Markdown from './Markdown';

describe('Markdown Component', () => {
  const sampleMarkdown = {
    name: 'sample-markdown',
    path: 'sample-markdown',
    content: '# Hello World',
    justify: 'center',
    align: 'center',
  };

  const row = { height: 'regular' };
  const height = '400px';

  test('renders markdown content correctly', () => {
    render(<Markdown markdown={sampleMarkdown} row={row} height={height} />);
    const container = screen.getByTestId('sample-markdown');
    expect(within(container).getByText(/hello world/i)).toBeInTheDocument();
  });

  test('renders no built-in Copy/share button (the kebab owns Copy)', () => {
    render(<Markdown markdown={sampleMarkdown} row={row} height={height} />);
    // The per-item Copy link lives ONLY in the flip-layer kebab now — Markdown
    // itself renders no share button.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test.each([
    ['end', 'mt-auto'],
    ['center', 'my-auto'],
    ['between', 'justify-between'],
    ['around', 'justify-around'],
    ['evenly', 'justify-evenly'],
  ])('justify %s wraps the content in a %s block', (justify, cls) => {
    render(<Markdown markdown={{ ...sampleMarkdown, justify }} row={row} height={height} />);
    expect(screen.getByTestId('markdown-body')).toHaveClass('prose', cls);
  });

  test.each([
    ['right', 'text-right'],
    ['center', 'text-center'],
    [undefined, 'text-left'],
  ])('align %s sets %s', (align, cls) => {
    render(<Markdown markdown={{ ...sampleMarkdown, align }} row={row} height={height} />);
    expect(screen.getByTestId('sample-markdown')).toHaveClass(cls);
  });

  test('a compact row does not fix the height', () => {
    render(<Markdown markdown={sampleMarkdown} row={{ height: 'compact' }} height={height} />);
    expect(screen.getByTestId('sample-markdown')).not.toHaveStyle({ height });
  });
});
