import { render, screen, waitFor } from '@testing-library/react';
import TraceSelect from './TraceSelect'
import selectEvent from 'react-select-event'

const traceData = {
  "traceName": {
    "cohortName1": {
      "columns.x_data": [
        "value 1",
        "value 2",
      ]
    },
    "cohortName2": {
      "columns.x_data": [
        "value 3",
        "value 4",
      ]
    }
  }
};

test('renders single select', async () => {
  let selectedTraceData = null;
  const onChange = (value) => { selectedTraceData = value }
  render(<TraceSelect traceData={traceData} showLabel onChange={onChange} />);

  const selectWrapper = screen.getByLabelText('Traces')
  await selectEvent.select(selectWrapper, 'cohortName1')

  await waitFor(() => {
    expect(selectedTraceData).toEqual(
      {
        "traceName": {
          "cohortName1": {
            "columns.x_data": [
              "value 1",
              "value 2",
            ]
          }
        }
      })
  })
  expect(screen.queryByText('cohortName2')).not.toBeInTheDocument();
});

test('renders multiselect select', async () => {
  let selectedTraceData = null;
  const onChange = (value) => { selectedTraceData = value }
  render(<TraceSelect traceData={traceData} isMulti showLabel onChange={onChange} />);

  const selectWrapper = screen.getByLabelText('Traces')
  await selectEvent.select(selectWrapper, ['cohortName1', 'cohortName2'])

  await waitFor(() => {
    expect(selectedTraceData).toEqual(traceData)
  })
  expect(screen.getByText('cohortName2')).toBeInTheDocument();
});