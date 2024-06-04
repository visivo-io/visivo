import { render, screen, waitFor } from '@testing-library/react';
import CohortSelect from './CohortSelect'
import selectEvent from 'react-select-event'
import { withProviders } from '../../utils/test-utils';

const tracesData = {
  "Trace Name 1": {
    "Cohort Name 1": {},
    "Cohort Name 2": {}
  },
  "Trace Name 2": {
    "Cohort Name 3": {},
  }
};


let mockSearchParams = ''

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useSearchParams: () => {
    return [
      new URLSearchParams(mockSearchParams),
      (newParams) => {
        mockSearchParams = newParams(new URLSearchParams(mockSearchParams))
      }
    ]
  }
}));

test('renders single select', async () => {
  let selectedTraceData = null;
  const onChange = (value) => { selectedTraceData = value }
  render(<CohortSelect tracesData={tracesData} showLabel onChange={onChange} />, { wrapper: withProviders });

  const selectWrapper = screen.getByLabelText('Traces')
  await selectEvent.select(selectWrapper, 'Cohort Name 1')

  await waitFor(() => {
    expect(selectedTraceData).toEqual(
      {
        "Trace Name 1": {
          "Cohort Name 1": {},
        },
      })
  })
  expect(screen.queryByText('cohortName2')).not.toBeInTheDocument();
});

test('renders multiselect select', async () => {
  let selectedTraceData = null;
  const onChange = (value) => { selectedTraceData = value }
  render(<CohortSelect tracesData={tracesData} isMulti showLabel onChange={onChange} name={"Chart"} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(selectedTraceData).toEqual(tracesData)
  })
  expect(screen.getByText('Cohort Name 2')).toBeInTheDocument();
  const selectWrapper = screen.getByLabelText('Traces')
  await selectEvent.select(selectWrapper, 'Cohort Name 2')
  await waitFor(() => {
    expect(mockSearchParams).toEqual(new URLSearchParams({}))
  })
});