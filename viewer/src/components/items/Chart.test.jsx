import { render, screen, waitFor } from '@testing-library/react';
import Chart from './Chart';
import { withProviders } from '../../utils/test-utils';
import * as useTracesData from '../../hooks/useTracesData';
import * as Trace from '../../models/Trace';
let chart;

beforeEach(() => {
  chart = {
    name: 'name',
    selector: { type: 'single', name: 'selector', parent_name: 'name' },
    traces: [],
  };
});

const tracesData = {
  'Trace Name 1': {
    'Cohort Name 1': {},
  },
};

describe('Chart', () => {
  test('renders chart with selector when name matches', async () => {
    jest
      .spyOn(useTracesData, 'useTracesData')
      .mockImplementation((projectId, traceNames) => tracesData);
    jest
      .spyOn(Trace, 'chartDataFromCohortData')
      .mockImplementation((cohortData, trace, cohortName) => ({}));
    render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });

    await waitFor(() => {
      expect(screen.getByText('Mock Plot')).toBeInTheDocument();
    });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  test('renders chart without selector when name does not match', async () => {
    jest
      .spyOn(useTracesData, 'useTracesData')
      .mockImplementation((projectId, traceNames) => tracesData);
    jest
      .spyOn(Trace, 'chartDataFromCohortData')
      .mockImplementation((cohortData, trace, cohortName) => ({}));
    chart.selector.parent_name = 'other';
    render(<Chart chart={chart} project={{ id: 1 }} />, { wrapper: withProviders });

    await waitFor(() => {
      expect(screen.getByText('Mock Plot')).toBeInTheDocument();
    });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
