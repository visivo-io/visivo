import { useState, useCallback } from 'react';

export const useAttributeParser = () => {
  const [isJsonObject, setIsJsonObject] = useState(false);
  const [parsedObject, setParsedObject] = useState(null);
  const [isQueryValue, setIsQueryValue] = useState(false);
  const [queryType, setQueryType] = useState(null);

  const checkAndParseJson = useCallback(val => {
    // Check for query patterns first
    const queryFunctionPattern = /^query\((.*)\)$/;
    const queryBracketPattern = /^\?\{(.*)\}$/;

    if (queryFunctionPattern.test(val) || queryBracketPattern.test(val)) {
      setIsQueryValue(true);
      setQueryType(queryFunctionPattern.test(val) ? 'function' : 'bracket');
      setIsJsonObject(false);
      setParsedObject(null);
      return false;
    }

    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && parsed.name) {
        setParsedObject(parsed);
        setIsJsonObject(true);
        return true;
      }
    } catch (e) {
      // Not valid JSON
    }
    setIsJsonObject(false);
    setParsedObject(null);
    return false;
  }, []);

  return {
    isJsonObject,
    parsedObject,
    isQueryValue,
    queryType,
    checkAndParseJson,
    setIsQueryValue,
    setQueryType,
    setIsJsonObject,
    setParsedObject
  };
}; 