import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EmptyStateCTA from './EmptyStateCTA';

describe('EmptyStateCTA', () => {
  test('renders title and body', () => {
    render(<EmptyStateCTA title="Nothing here yet" body="Add something to get started." />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByText('Add something to get started.')).toBeInTheDocument();
  });

  test('renders primary action and fires onClick when clicked', () => {
    const onClick = jest.fn();
    render(
      <EmptyStateCTA
        title="Empty"
        body="Body"
        primaryAction={{ label: 'Add Source', onClick }}
      />
    );

    const button = screen.getByTestId('empty-state-primary');
    expect(button).toHaveTextContent('Add Source');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('renders secondary action when provided and fires onClick when clicked', () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    render(
      <EmptyStateCTA
        title="Empty"
        body="Body"
        primaryAction={{ label: 'Add Source', onClick: onPrimary }}
        secondaryAction={{ label: 'Learn More', onClick: onSecondary }}
      />
    );

    const secondary = screen.getByTestId('empty-state-secondary');
    expect(secondary).toHaveTextContent('Learn More');
    fireEvent.click(secondary);
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onPrimary).not.toHaveBeenCalled();
  });

  test('does not render primary action when not provided', () => {
    render(<EmptyStateCTA title="Empty" body="Body" />);
    expect(screen.queryByTestId('empty-state-primary')).not.toBeInTheDocument();
  });

  test('does not render secondary action when not provided', () => {
    render(
      <EmptyStateCTA
        title="Empty"
        body="Body"
        primaryAction={{ label: 'Go', onClick: () => {} }}
      />
    );
    expect(screen.queryByTestId('empty-state-secondary')).not.toBeInTheDocument();
  });

  test('renders icon when provided', () => {
    render(
      <EmptyStateCTA
        icon={<span data-testid="icon-content">ICON</span>}
        title="Empty"
        body="Body"
      />
    );
    expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument();
    expect(screen.getByTestId('icon-content')).toBeInTheDocument();
  });

  test('does not render icon container when no icon prop', () => {
    render(<EmptyStateCTA title="Empty" body="Body" />);
    expect(screen.queryByTestId('empty-state-icon')).not.toBeInTheDocument();
  });
});
