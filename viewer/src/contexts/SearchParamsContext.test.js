import { render, screen, waitFor } from '@testing-library/react';
import { SearchParamsProvider } from './SearchParamsContext';
import { MemoryRouter } from 'react-router-dom';
import { useContext, useEffect } from 'react';
import SearchParamsContext from './SearchParamsContext';

const TestComponent = ({ value }) => {
    const [searchParams, setStateSearchParam] = useContext(SearchParamsContext);

    useEffect(() => {
        setStateSearchParam('test', value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <div>{searchParams.get('test')}</div>
}

describe('SearchParamsContext', () => {
    it('should set and get search parameters', async () => {
        render(
            <MemoryRouter initialEntries={['/?test=123']}>
                <SearchParamsProvider>
                    <TestComponent value={"123"} />
                </SearchParamsProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('123')).toBeInTheDocument();
        });
    });

    it('should clear the default parameter', async () => {
        render(
            <MemoryRouter initialEntries={['/?test=123']}>
                <SearchParamsProvider>
                    <TestComponent value={null} />
                </SearchParamsProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.queryByText('123')).not.toBeInTheDocument();
        });
    });
});
