import { render, screen, waitFor } from '@testing-library/react';
import CohortSelect from './CohortSelect'
import selectEvent from 'react-select-event'

const tracesData = {
  "Trace Name 1": {
    "Cohort Name 1": {},
    "Cohort Name 2": {}
  },
  "Trace Name 2": {
    "Cohort Name 3": {},
  }
};

test('renders single select', async () => {
  let selectedTraceData = null;
  const onChange = (value) => { selectedTraceData = value }
  render(<CohortSelect tracesData={tracesData} showLabel onChange={onChange} />);

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
  render(<CohortSelect tracesData={tracesData} isMulti showLabel onChange={onChange} />);

  const selectWrapper = screen.getByLabelText('Traces')
  await selectEvent.select(selectWrapper, ['Cohort Name 1', 'Cohort Name 2', "Cohort Name 3"])

  await waitFor(() => {
    expect(selectedTraceData).toEqual(tracesData)
  })
  expect(screen.getByText('Cohort Name 2')).toBeInTheDocument();
});