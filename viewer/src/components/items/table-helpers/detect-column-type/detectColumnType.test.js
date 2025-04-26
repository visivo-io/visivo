import detectColumnType from './detectColumnType';

describe('detectColumnType', () => {
  // Remove all Math.random mocking!

  describe('numeric detection', () => {
    it('should detect numeric columns with all numbers', () => {
      const data = [
        { value: 1 },
        { value: 2 },
        { value: 3.14 },
        { value: -5 },
        { value: 0 },
      ];

      expect(detectColumnType(data, 'value')).toBe('numeric');
    });

    it('should detect numeric columns with currency strings', () => {
      const data = [
        { amount: '$100' },
        { amount: '$1,250.99' },
        { amount: '$ 50' },
        { amount: '$0' },
        { amount: '$10,000' },
      ];

      expect(detectColumnType(data, 'amount')).toBe('numeric');
    });
  });

  describe('text detection', () => {
    it('should detect text columns with all strings', () => {
      const data = [
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' },
        { name: 'Diana' },
        { name: 'Eve' },
      ];

      expect(detectColumnType(data, 'name')).toBe('text');
    });
  });

  describe('threshold boundary testing - with larger datasets', () => {
    it('should return numeric when mostly numeric (90%)', () => {
      const data = [
        ...Array.from({ length: 9 }, (_, i) => ({ value: i })), // 9 numeric
        { value: 'text1' },  // 1 text = 90% numeric
      ];

      expect(detectColumnType(data, 'value')).toBe('numeric');
    });

    it('should return text when mostly text (80% numeric)', () => {
      const data = [
        ...Array.from({ length: 2 }, (_, i) => ({ value: i })), // 2 numeric  
        ...Array.from({ length: 8 }, (_, i) => ({ value: `text${i}` })), // 8 text = 80% numeric
      ];

      expect(detectColumnType(data, 'value')).toBe('text');
    });
  });

  describe('edge cases', () => {
    it('should handle empty dataset', () => {
      const data = [];
      expect(detectColumnType(data, 'value')).toBe('text');
    });

    it('should handle all null/undefined/empty values', () => {
      const data = [
        { value: null },
        { value: undefined },
        { value: '' },
        { value: null },
        { value: undefined },
      ];

      expect(detectColumnType(data, 'value')).toBe('text');
    });

    it('should handle missing key', () => {
      const data = [
        { otherKey: 'value1' },
        { otherKey: 'value2' },
        { otherKey: 'value3' },
      ];

      expect(detectColumnType(data, 'missingKey')).toBe('text');
    });
  });

  describe('real-world scenarios', () => {
    it('should handle product data with mixed pricing formats', () => {
      const data = [
        { price: '$19.99' },
        { price: '25.50' },
        { price: '$1,299' },
        { price: '0.99' },
        { price: '$5,000.00' },
        { price: '150' },
        { price: '$75.25' },
        { price: '2,500' },
      ];

      expect(detectColumnType(data, 'price')).toBe('numeric');
    });

    it('should handle user data with names', () => {
      const data = [
        { name: 'John Doe' },
        { name: 'Jane Smith' },
        { name: 'Bob Johnson' },
        { name: 'Alice Brown' },
        { name: 'Charlie Wilson' },
        { name: 'Diana Davis' },
        { name: 'Eve Miller' },
        { name: 'Frank Garcia' },
      ];

      expect(detectColumnType(data, 'name')).toBe('text');
    });
  });

  describe('specific numeric formats', () => {
    it('should handle scientific notation', () => {
      const data = [
        { value: '1e5' },
        { value: '2.5e-3' },
        { value: '1.23e+10' },
        { value: '4.56E7' },
        { value: '7.89e0' },
      ];

      expect(detectColumnType(data, 'value')).toBe('numeric');
    });

    it('should handle boolean values as text', () => {
      const data = [
        { flag: true },
        { flag: false },
        { flag: true },
        { flag: false },
        { flag: true },
      ];

      expect(detectColumnType(data, 'flag')).toBe('text');
    });
  });
});