import { render, screen } from '@testing-library/react';
import MarkdownItem from './MarkdownItem';

// Mock react-markdown since it doesn't work well in test environment
jest.mock('react-markdown', () => {
  return function MockMarkdown({ children }) {
    return <div data-testid="markdown-content">{children}</div>;
  };
});

describe('MarkdownItem', () => {
  test('renders markdown content', () => {
    const markdown = '# Hello World\n\nThis is **bold** text.';
    render(<MarkdownItem markdown={markdown} />);
    
    // Check that the markdown content is passed to the Markdown component
    // Note: newlines become spaces in text content
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('# Hello World This is **bold** text.');
  });

  test('applies text alignment classes', () => {
    const { container: leftContainer } = render(
      <MarkdownItem markdown="Left aligned" align="left" />
    );
    expect(leftContainer.firstChild).toHaveClass('text-left');

    const { container: centerContainer } = render(
      <MarkdownItem markdown="Center aligned" align="center" />
    );
    expect(centerContainer.firstChild).toHaveClass('text-center');

    const { container: rightContainer } = render(
      <MarkdownItem markdown="Right aligned" align="right" />
    );
    expect(rightContainer.firstChild).toHaveClass('text-right');
  });

  test('applies justify classes to inner div', () => {
    const { container } = render(
      <MarkdownItem markdown="Start" justify="start" />
    );
    // The justify class is applied to the inner container div
    const outerDiv = container.firstChild;
    const innerDiv = outerDiv.querySelector('div');
    
    expect(innerDiv).toHaveClass('w-full', 'h-full', 'overflow-auto', 'flex', 'flex-col', 'items-stretch', 'start');
  });

  test('applies height when not compact', () => {
    const { container } = render(
      <MarkdownItem markdown="Test" height={500} />
    );
    expect(container.firstChild).toHaveStyle({ height: '500px' });
  });

  test('does not apply height when compact', () => {
    const { container } = render(
      <MarkdownItem markdown="Test" height="compact" />
    );
    // When height is "compact", no specific height style should be applied
    const style = getComputedStyle(container.firstChild);
    expect(style.height).toBe('');
  });

  test('applies custom className and style', () => {
    const { container } = render(
      <MarkdownItem 
        markdown="Test" 
        className="custom-class" 
        style={{ backgroundColor: 'red' }} 
      />
    );
    expect(container.firstChild).toHaveClass('custom-class');
    expect(container.firstChild).toHaveStyle({ backgroundColor: 'red' });
  });

  test('renders basic markdown content', () => {
    const markdown = 'This is **bold** and *italic* text.';
    
    render(<MarkdownItem markdown={markdown} />);
    
    // Check that the markdown content is passed to the component
    expect(screen.getByTestId('markdown-content')).toHaveTextContent(markdown);
  });

  test('renders with markdown content', () => {
    const { container } = render(
      <MarkdownItem markdown="# Test Heading" />
    );
    
    // Verify the component renders
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByTestId('markdown-content')).toHaveTextContent('# Test Heading');
  });
});