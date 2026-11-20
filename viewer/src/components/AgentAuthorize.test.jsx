import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentAuthorize from './AgentAuthorize';

describe('AgentAuthorize', () => {
  it('names the $30 starting credit', () => {
    render(<AgentAuthorize host="https://app.visivo.io" working={false} onAuthorize={() => {}} />);

    const credit = screen.getByTestId('agent-authorize-credit');
    expect(credit).toHaveTextContent('$30 of credit');
    expect(credit).toHaveTextContent('No card needed.');
  });

  it('calls onAuthorize from the button and shows the host', () => {
    const onAuthorize = jest.fn();
    render(<AgentAuthorize host="https://app.visivo.io" working={false} onAuthorize={onAuthorize} />);

    fireEvent.click(screen.getByTestId('agent-authorize-button'));

    expect(onAuthorize).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('agent-authorize-host')).toHaveTextContent('https://app.visivo.io');
  });

  it('disables the button while working and shows a message', () => {
    render(<AgentAuthorize host={null} working message="Opening the browser…" onAuthorize={() => {}} />);

    expect(screen.getByTestId('agent-authorize-button')).toBeDisabled();
    expect(screen.getByTestId('agent-authorize-button')).toHaveTextContent('Authorizing…');
    expect(screen.queryByTestId('agent-authorize-host')).toBeNull();
    expect(screen.getByTestId('agent-authorize-message')).toHaveTextContent('Opening the browser…');
  });
});
