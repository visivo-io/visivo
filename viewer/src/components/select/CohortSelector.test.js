import { render, screen, waitFor } from '@testing-library/react';
import CohortSelector from './CohortSelector';
import * as useTracesData from '../../hooks/useTracesData';
import { withProviders } from '../../utils/test-utils';

let selector;

beforeEach(() => {
  selector = {
    name: "selector",
    type: "single",
    parent_name: "selector",
    options: [
      { name: "traceName", type: "trace" }
    ]
  }
});

test('renders selector', async () => {
  const traceData = {
    "traceName": {
      "cohortName": {
        "columns.x_data": [
          "value 1",
          "value 2",
        ]
      }
    }
  };
  jest.spyOn(useTracesData, 'useTracesData').mockImplementation((projectId, traceNames) => (traceData));

  render(<CohortSelector names={["cohortName"]} selector={selector} project={{ id: 1 }} itemWidth={1} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByText('cohortName')).toBeInTheDocument();
  });
});
