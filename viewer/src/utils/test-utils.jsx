import { MemoryRouter } from 'react-router-dom';
import { futureFlags } from '../router-config';
import { QueryProvider } from '../contexts/QueryContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Routes, Route } from 'react-router-dom';

export const JWT_TOKEN = {
  access:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzAwNDM2MzUwLCJpYXQiOjE3MDA0MzI3NTAsImp0aSI6Ijg3N2YxNjJmMGM2NTQ4YmZiNjdlMzMzMmRjNmFjYzRiIiwidXNlcl9pZCI6ImJiYzc5MTc1LTliOTItNGJkMS1hNTBiLTMwYjhmM2Q5ZjM2NSJ9.4ZlQo437i51Ca1qqwl7Zm5TL81pybb5nCOdAgrC-2CY',
  refresh:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTcwMTAzNzU1MCwiaWF0IjoxNzAwNDMyNzUwLCJqdGkiOiIxNDhlYjMwOTI0Mjk0YTM5YTljNzM1YzU4YjYzM2UwMyIsInVzZXJfaWQiOiJiYmM3OTE3NS05YjkyLTRiZDEtYTUwYi0zMGI4ZjNkOWYzNjUifQ.Hz9be0D2JSbevuGL1bIqxiwIDtk3Cx7Ark40XRF8ArI',
  user: 'tim@visivo.io',
};

export const TestComponent = () => {
  return <div>TEST COMPONENT</div>;
};

export const withProviders = ({ children, initialPath = '/', traces = [] }) => {
  const fetchTracesQuery = (projectId, name) => ({
    queryKey: ['trace', projectId, name],
    queryFn: () => traces,
  });

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return (
    <MemoryRouter initialEntries={[initialPath]} future={futureFlags}>
      <QueryProvider value={{ fetchTracesQuery }}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path={initialPath.split('?')[0]} element={children} />
          </Routes>
        </QueryClientProvider>
      </QueryProvider>
    </MemoryRouter>
  );
};
