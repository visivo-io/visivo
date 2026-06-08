import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatusIndicator } from './StatusIndicator';
import { ObjectStatus } from '../../stores/store';

// Avoid pulling the whole composed store (and its onboarding/posthog chain);
// the component only needs the ObjectStatus enum. (babel hoists jest.mock above
// the imports above, so the ObjectStatus import resolves to this mock.)
jest.mock('../../stores/store', () => ({
  __esModule: true,
  ObjectStatus: { NEW: 'NEW', MODIFIED: 'MODIFIED', PUBLISHED: 'PUBLISHED', DELETED: 'DELETED' },
}));

describe('StatusIndicator', () => {
  it('renders nothing for a published or missing status', () => {
    const { container, rerender } = render(<StatusIndicator status={ObjectStatus.PUBLISHED} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<StatusIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a titled dot for NEW objects', () => {
    render(<StatusIndicator status={ObjectStatus.NEW} />);
    expect(screen.getByTitle('New - Not yet committed')).toBeInTheDocument();
  });

  it('renders a titled dot for MODIFIED objects', () => {
    render(<StatusIndicator status={ObjectStatus.MODIFIED} />);
    expect(screen.getByTitle('Modified - Has uncommitted changes')).toBeInTheDocument();
  });
});
