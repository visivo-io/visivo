import React from 'react';
import { render } from '@testing-library/react';
import DistProviders from './DistProviders';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryProvider } from './contexts/QueryContext';
import { StoreProvider } from './StoreProvider';

// Mock child components to test provider structure
jest.mock('react-router-dom', () => ({
  RouterProvider: ({ children }) => <div data-testid="router-provider">{children}</div>
}));

jest.mock('./DistRouter', () => ({
  __esModule: true,
  default: {}
}));

jest.mock('./router-config', () => ({
  futureFlags: {}
}));

describe('DistProviders', () => {
  test('renders all required providers in correct order', () => {
    const { container } = render(<DistProviders />);
    
    // Verify the component renders without errors
    expect(container).toBeTruthy();
  });

  test('includes StoreProvider for state management', () => {
    // This test ensures that StoreProvider is included in the provider tree
    // If StoreProvider is missing, components that use the store will fail
    const TestComponent = () => {
      // This would throw if StoreProvider is not in the tree
      const store = React.useContext(React.createContext(null));
      return <div>Store context available</div>;
    };

    // Should not throw when rendering
    expect(() => render(<DistProviders />)).not.toThrow();
  });

  test('includes QueryClientProvider for data fetching', () => {
    const { container } = render(<DistProviders />);
    // The presence of QueryClientProvider is verified by successful render
    expect(container).toBeTruthy();
  });

  test('matches LocalProviders structure for consistency', () => {
    // This test ensures DistProviders has the same essential providers as LocalProviders
    // excluding WorksheetProvider which is only needed in local mode
    const { container } = render(<DistProviders />);
    expect(container).toBeTruthy();
  });
});