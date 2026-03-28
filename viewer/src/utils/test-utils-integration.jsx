/**
 * Integration test utilities.
 *
 * Unlike test-utils.jsx, this module is designed for integration tests that
 * need REAL React Query behavior (not the global mock from setupTests.js).
 *
 * Usage in integration test files:
 *   1. Add `jest.unmock('@tanstack/react-query');` at the TOP of your test file
 *   2. Import { renderIntegration } from this module
 *   3. Optionally provide a mockFetch handler for controlled API responses
 *
 * Example:
 *   jest.unmock('@tanstack/react-query');
 *   import { renderIntegration } from '../../utils/test-utils-integration';
 *
 *   it('loads data from API', async () => {
 *     const mockFetch = (url) => {
 *       if (url.includes('/api/models/')) {
 *         return { ok: true, json: async () => ({ models: [] }) };
 *       }
 *       return { ok: true, json: async () => ({}) };
 *     };
 *
 *     renderIntegration(<MyComponent />, { mockFetch });
 *     await screen.findByText('No models');
 *   });
 */

import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { futureFlags } from '../router-config';
import { URLProvider } from '../contexts/URLContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Create a wrapper for integration tests with real React Query.
 *
 * @param {Object} options
 * @param {string} options.initialPath - Initial route path
 * @param {string} options.environment - URL environment ('server' or 'local')
 * @param {Function} options.mockFetch - Optional fetch mock: (url, options) => Response-like object
 */
const createIntegrationWrapper = ({
  initialPath = '/',
  environment = 'server',
  mockFetch,
} = {}) => {
  // Install fetch mock if provided
  if (mockFetch) {
    const originalFetch = global.fetch;
    beforeEach(() => {
      global.fetch = jest.fn(async (url, options) => {
        const result = await mockFetch(url, options);
        return {
          ok: result?.ok ?? true,
          status: result?.status ?? 200,
          json: result?.json ?? (async () => ({})),
          text: result?.text ?? (async () => ''),
          headers: new Headers(result?.headers ?? {}),
        };
      });
    });
    afterEach(() => {
      global.fetch = originalFetch;
    });
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return ({ children }) => (
    <MemoryRouter initialEntries={[initialPath]} future={futureFlags}>
      <URLProvider environment={environment}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path={initialPath.split('?')[0]} element={children} />
          </Routes>
        </QueryClientProvider>
      </URLProvider>
    </MemoryRouter>
  );
};

/**
 * Render a component for integration testing with real React Query.
 *
 * @param {React.ReactElement} ui - Component to render
 * @param {Object} options - Options passed to createIntegrationWrapper
 * @returns {Object} render result from @testing-library/react
 */
export const renderIntegration = (ui, options = {}) => {
  const Wrapper = createIntegrationWrapper(options);
  return render(ui, { wrapper: Wrapper });
};

export { createIntegrationWrapper };
