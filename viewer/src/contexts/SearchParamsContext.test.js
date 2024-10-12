import { render, screen, waitFor } from '@testing-library/react';
import { SearchParamsProvider } from './SearchParamsContext';
import { MemoryRouter } from 'react-router-dom';
import { useContext, useEffect } from 'react';
import SearchParamsContext from './SearchParamsContext';

const TestComponent = () => {
    const [searchParams, setStateSearchParam] = useContext(SearchParamsContext);

    useEffect(() => {
        setStateSearchParam('test', '123');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div>{searchParams.get('test')}</div>
}

describe('SearchParamsContext', () => {
    it('should set and get search parameters', async () => {
        render(
            <MemoryRouter initialEntries={['/?test=123']}>
                <SearchParamsProvider>
                    <TestComponent />
                </SearchParamsProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('123')).toBeInTheDocument();
        });
    });
});
