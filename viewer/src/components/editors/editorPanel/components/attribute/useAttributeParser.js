import { useState, useCallback } from 'react';
import { QUERY_FUNCTION_PATTERN, QUERY_BRACKET_PATTERN } from '../../../../../constants';

export const useAttributeParser = () => {
  const [isJsonObject, setIsJsonObject] = useState(false);
  const [parsedObject, setParsedObject] = useState(null);
  const [isQueryValue, setIsQueryValue] = useState(false);
  const [queryType, setQueryType] = useState(null);

  const checkAndParseJson = useCallback(val => {
    // Check for query patterns first
    if (QUERY_FUNCTION_PATTERN.test(val) || QUERY_BRACKET_PATTERN.test(val)) {
      setIsQueryValue(true);
      setQueryType(QUERY_FUNCTION_PATTERN.test(val) ? 'function' : 'bracket');
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
    setParsedObject,
  };
};
