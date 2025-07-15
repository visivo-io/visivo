import { renderHook, act } from '@testing-library/react';
import { useAttributeParser } from './useAttributeParser';

test('parses JSON object correctly', () => {
  const { result } = renderHook(() => useAttributeParser());
  const jsonValue = JSON.stringify({ name: 'testObject', is_inline_defined: false });

  act(() => {
    result.current.checkAndParseJson(jsonValue);
  });

  expect(result.current.isJsonObject).toBe(true);
  expect(result.current.parsedObject).toEqual({ name: 'testObject', is_inline_defined: false });
});

test('identifies query function pattern', () => {
  const { result } = renderHook(() => useAttributeParser());

  act(() => {
    result.current.checkAndParseJson('query(SELECT * FROM table)');
  });

  expect(result.current.isQueryValue).toBe(true);
  expect(result.current.queryType).toBe('function');
});

test('identifies query bracket pattern', () => {
  const { result } = renderHook(() => useAttributeParser());

  act(() => {
    result.current.checkAndParseJson('?{SELECT * FROM table}');
  });

  expect(result.current.isQueryValue).toBe(true);
  expect(result.current.queryType).toBe('bracket');
});
