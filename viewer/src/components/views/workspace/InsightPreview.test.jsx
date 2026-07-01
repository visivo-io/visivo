/**
 * InsightPreview tests (VIS-798 / N-5).
 *
 * The Track-N insight preview reuses Explorer's EXISTING render path — the
 * common/InsightPreview component — resolving the saved insight from the insight
 * store by name and handing it the config. The Explorer preview is mocked for a
 * focused unit test.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import InsightPreview from './InsightPreview';
import useStore from '../../../stores/store';

const mockExplorerInsightSpy = jest.fn();
jest.mock('../common/InsightPreview', () => ({
  __esModule: true,
  default: props => {
    mockExplorerInsightSpy(props);
    return <div data-testid="explorer-insight-preview-mock">{props.insightConfig?.name}</div>;
  },
}));

const seed = (insights = []) => {
  act(() => {
    useStore.setState({ insights, fetchInsights: jest.fn() });
  });
};

describe('InsightPreview (VIS-798)', () => {
  beforeEach(() => mockExplorerInsightSpy.mockClear());

  test('renders the Explorer insight render path for a saved insight', () => {
    seed([{ name: 'sales', config: { props: { type: 'bar' } } }]);
    render(<InsightPreview activeObject={{ type: 'insight', name: 'sales' }} projectId="p1" />);
    expect(screen.getByTestId('insight-preview')).toBeInTheDocument();
    expect(screen.getByTestId('explorer-insight-preview-mock')).toHaveTextContent('sales');
  });

  test('passes the resolved config (with name) and projectId to the Explorer preview', () => {
    seed([{ name: 'sales', config: { props: { type: 'bar' } } }]);
    render(<InsightPreview activeObject={{ type: 'insight', name: 'sales' }} projectId="p1" />);
    const props = mockExplorerInsightSpy.mock.calls[0][0];
    expect(props.insightConfig).toMatchObject({ name: 'sales', props: { type: 'bar' } });
    expect(props.projectId).toBe('p1');
  });

  test('renders an empty state when the insight is not found', () => {
    seed([]);
    render(<InsightPreview activeObject={{ type: 'insight', name: 'missing' }} projectId="p1" />);
    expect(screen.getByTestId('insight-preview-empty')).toHaveTextContent(/not found/i);
  });
});
