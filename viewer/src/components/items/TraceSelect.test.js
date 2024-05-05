import { render, screen, waitFor } from '@testing-library/react';
import TraceSelect from './TraceSelect'
import selectEvent from 'react-select-event'

const plotData = [
  {
    "name": "cohortName1"
  },
  {
    "name": "cohortName2"
  }
];

test('renders single select', async () => {
  let selectedTraceData = null;
  const onChange = (value) => { selectedTraceData = value }
  render(<TraceSelect plotData={plotData} showLabel onChange={onChange} />);

  const selectWrapper = screen.getByLabelText('Traces')
  await selectEvent.select(selectWrapper, 'cohortName1')

  await waitFor(() => {
    expect(selectedTraceData).toEqual(
      [{
        "name": "cohortName1"
      }])
  })
  expect(screen.queryByText('cohortName2')).not.toBeInTheDocument();
});

test('renders multiselect select', async () => {
  let selectedTraceData = null;
  const onChange = (value) => { selectedTraceData = value }
  render(<TraceSelect plotData={plotData} isMulti showLabel onChange={onChange} />);

  const selectWrapper = screen.getByLabelText('Traces')
  await selectEvent.select(selectWrapper, ['cohortName1', 'cohortName2'])

  await waitFor(() => {
    expect(selectedTraceData).toEqual(plotData)
  })
  expect(screen.getByText('cohortName2')).toBeInTheDocument();
});