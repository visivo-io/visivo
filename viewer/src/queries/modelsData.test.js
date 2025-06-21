import { fetchModelsData } from './modelsData';

describe('fetchModelsData', () => {
  it('should return an empty object if models array is empty', async () => {
    const models = [];
    const result = await fetchModelsData(models);
    expect(result).toEqual({});
  });

  it('should fetch data for each model and return it in an object', async () => {
    const models = [
      { name: 'model1', signed_data_file_url: 'url1' },
      { name: 'model2', signed_data_file_url: 'url2' },
    ];
    global.fetch = jest.fn().mockImplementation(url => {
      if (url === 'url1') {
        return Promise.resolve({ json: () => Promise.resolve({ data: 'data1' }) });
      } else if (url === 'url2') {
        return Promise.resolve({ json: () => Promise.resolve({ data: 'data2' }) });
      }
    });
    const result = await fetchModelsData(models);
    expect(result).toEqual({
      model1: { data: 'data1' },
      model2: { data: 'data2' },
    });
  });
});
