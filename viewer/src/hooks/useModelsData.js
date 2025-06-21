import { useState, useEffect, useContext, useMemo } from 'react';
import QueryContext from '../contexts/QueryContext';
import { useQuery } from '@tanstack/react-query';
import { fetchModelsData } from '../queries/modelsData';

function filterObject(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
}

export const useModelsData = (projectId, modelNames) => {
  const { fetchModelsQuery } = useContext(QueryContext);
  const [modelData, setModelData] = useState(null);
  const memoizedModelNames = useMemo(() => modelNames, [modelNames?.join(',')]);
  const { data: models, isLoading } = useQuery(fetchModelsQuery(projectId, memoizedModelNames));

  useEffect(() => {
    const waitForData = async () => {
      const fetched = await fetchModelsData(models);
      const ordered = memoizedModelNames.reduce((orderedJson, modelName) => {
        orderedJson[modelName] = fetched[modelName];
        return orderedJson;
      }, {});
      setModelData(filterObject(ordered, memoizedModelNames));
    };
    if (models) {
      waitForData();
    }
  }, [isLoading, models, memoizedModelNames]);

  return modelData;
};
