import { OBJECT_TYPES, getTypeByValue, getTypeColors, DEFAULT_COLORS } from './objectTypeConfigs';

describe('objectTypeConfigs', () => {
  describe('OBJECT_TYPES', () => {
    it('should have all required properties for each object type', () => {
      OBJECT_TYPES.forEach(type => {
        // Basic properties
        expect(type).toHaveProperty('value');
        expect(type).toHaveProperty('label');
        expect(type).toHaveProperty('singularLabel');
        expect(type).toHaveProperty('icon');
        expect(type).toHaveProperty('enabled');
        expect(type).toHaveProperty('colors');

        // Check all color properties exist
        const requiredColorProperties = [
          'bg',
          'text',
          'border',
          'bgHover',
          'bgSelected',
          'borderSelected',
          'node',
          'nodeSelected',
          'connectionHandle', // This is critical - no fallbacks allowed
        ];

        requiredColorProperties.forEach(colorProp => {
          expect(type.colors).toHaveProperty(colorProp);
          expect(type.colors[colorProp]).toBeTruthy();
          expect(type.colors[colorProp]).not.toBe('');
        });

        // Verify connectionHandle is a valid hex color
        expect(type.colors.connectionHandle).toMatch(/^#[0-9a-fA-F]{6}$/);
      });
    });

    it('should have unique values for each object type', () => {
      const values = OBJECT_TYPES.map(t => t.value);
      const uniqueValues = [...new Set(values)];
      expect(uniqueValues.length).toBe(values.length);
    });

    it('should have unique connection handle colors for each object type', () => {
      const colors = OBJECT_TYPES.map(t => t.colors.connectionHandle);
      const uniqueColors = [...new Set(colors)];
      expect(uniqueColors.length).toBe(colors.length);
    });
  });

  describe('DEFAULT_COLORS', () => {
    it('should have all required color properties including connectionHandle', () => {
      const requiredColorProperties = [
        'bg',
        'text',
        'border',
        'bgHover',
        'bgSelected',
        'borderSelected',
        'node',
        'nodeSelected',
        'connectionHandle',
      ];

      requiredColorProperties.forEach(colorProp => {
        expect(DEFAULT_COLORS).toHaveProperty(colorProp);
        expect(DEFAULT_COLORS[colorProp]).toBeTruthy();
        expect(DEFAULT_COLORS[colorProp]).not.toBe('');
      });

      // Verify connectionHandle is a valid hex color
      expect(DEFAULT_COLORS.connectionHandle).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  describe('getTypeByValue', () => {
    it('should return correct type config for valid values', () => {
      expect(getTypeByValue('source').value).toBe('source');
      expect(getTypeByValue('model').value).toBe('model');
      expect(getTypeByValue('chart').value).toBe('chart');
    });

    it('should return undefined for invalid values', () => {
      expect(getTypeByValue('invalid')).toBeUndefined();
      expect(getTypeByValue('')).toBeUndefined();
      expect(getTypeByValue(null)).toBeUndefined();
    });
  });

  describe('getTypeColors', () => {
    it('should return colors with connectionHandle for valid types', () => {
      const sourceColors = getTypeColors('source');
      expect(sourceColors).toHaveProperty('connectionHandle');
      expect(sourceColors.connectionHandle).toBe('#14b8a6');

      const chartColors = getTypeColors('chart');
      expect(chartColors).toHaveProperty('connectionHandle');
      expect(chartColors.connectionHandle).toBe('#3b82f6');
    });

    it('should return DEFAULT_COLORS with connectionHandle for invalid types', () => {
      const colors = getTypeColors('invalid');
      expect(colors).toBe(DEFAULT_COLORS);
      expect(colors).toHaveProperty('connectionHandle');
      expect(colors.connectionHandle).toBe('#6b7280');
    });
  });
});