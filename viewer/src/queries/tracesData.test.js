import { fetchTracesData } from './tracesData';

describe('fetchTracesData', () => {
  it('should return an empty object if traces array is empty', async () => {
    const traces = [];
    const result = await fetchTracesData(traces);
    expect(result).toEqual({});
  });

  it('should fetch data for each trace and return it in an object', async () => {
    const traces = [
      { name: 'trace1', signed_data_file_url: 'url1' },
      { name: 'trace2', signed_data_file_url: 'url2' },
    ];
    global.fetch = jest.fn().mockImplementation(url => {
      if (url === 'url1') {
        return Promise.resolve({ json: () => Promise.resolve({ data: 'data1' }) });
      } else if (url === 'url2') {
        return Promise.resolve({ json: () => Promise.resolve({ data: 'data2' }) });
      }
    });
    const result = await fetchTracesData(traces);
    expect(result).toEqual({
      trace1: { data: 'data1' },
      trace2: { data: 'data2' },
    });
  });
});
