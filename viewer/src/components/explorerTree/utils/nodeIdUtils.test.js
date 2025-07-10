import {
  createNodeId,
  parseNodeId,
  createSourceNodeId,
  createDatabaseNodeId,
  createSchemaNodeId,
  createTableNodeId,
  createColumnNodeId,
  getDataKey,
} from './nodeIdUtils';

describe('nodeIdUtils', () => {
  describe('createNodeId and parseNodeId', () => {
    it('should create and parse source node IDs correctly', () => {
      const sourceId = createSourceNodeId('mySource');
      const parsed = parseNodeId(sourceId);

      expect(parsed).toEqual({
        type: 'source',
        path: ['mySource'],
      });
    });

    it('should create and parse database node IDs correctly', () => {
      const dbId = createDatabaseNodeId('mySource', 'myDb');
      const parsed = parseNodeId(dbId);

      expect(parsed).toEqual({
        type: 'database',
        path: ['mySource', 'myDb'],
      });
    });

    it('should create and parse schema node IDs correctly', () => {
      const schemaId = createSchemaNodeId('mySource', 'myDb', 'public');
      const parsed = parseNodeId(schemaId);

      expect(parsed).toEqual({
        type: 'schema',
        path: ['mySource', 'myDb', 'public'],
      });
    });

    it('should create and parse table node IDs with schema correctly', () => {
      const tableId = createTableNodeId('mySource', 'myDb', 'public', 'users');
      const parsed = parseNodeId(tableId);

      expect(parsed).toEqual({
        type: 'table',
        path: ['mySource', 'myDb', 'public', 'users'],
      });
    });

    it('should create and parse table node IDs without schema correctly', () => {
      const tableId = createTableNodeId('mySource', 'myDb', null, 'users');
      const parsed = parseNodeId(tableId);

      expect(parsed).toEqual({
        type: 'table',
        path: ['mySource', 'myDb', 'users'],
      });
    });

    it('should create and parse column node IDs with schema correctly', () => {
      const columnId = createColumnNodeId('mySource', 'myDb', 'public', 'users', 'id');
      const parsed = parseNodeId(columnId);

      expect(parsed).toEqual({
        type: 'column',
        path: ['mySource', 'myDb', 'public', 'users', 'id'],
      });
    });

    it('should create and parse column node IDs without schema correctly', () => {
      const columnId = createColumnNodeId('mySource', 'myDb', null, 'users', 'id');
      const parsed = parseNodeId(columnId);

      expect(parsed).toEqual({
        type: 'column',
        path: ['mySource', 'myDb', 'users', 'id'],
      });
    });
  });

  describe('getDataKey', () => {
    it('should generate correct data keys', () => {
      expect(getDataKey.database('mySource')).toBe('mySource');
      expect(getDataKey.schema('mySource', 'myDb')).toBe('mySource.myDb');
      expect(getDataKey.table('mySource', 'myDb', 'public')).toBe('mySource.myDb.public');
      expect(getDataKey.table('mySource', 'myDb', null)).toBe('mySource.myDb');
      expect(getDataKey.column('mySource', 'myDb', 'public', 'users')).toBe(
        'mySource.myDb.public.users'
      );
      expect(getDataKey.column('mySource', 'myDb', null, 'users')).toBe('mySource.myDb.users');
    });
  });

  describe('Edge cases', () => {
    it('should handle special characters in names', () => {
      const sourceId = createSourceNodeId('my-source.with_special@chars');
      const parsed = parseNodeId(sourceId);

      expect(parsed).toEqual({
        type: 'source',
        path: ['my-source.with_special@chars'],
      });
    });

    it('should handle empty strings', () => {
      const sourceId = createSourceNodeId('');
      const parsed = parseNodeId(sourceId);

      expect(parsed).toEqual({
        type: 'source',
        path: [''],
      });
    });

    it('should return null for invalid node IDs', () => {
      expect(parseNodeId('invalid-base64')).toBeNull();
      expect(parseNodeId('')).toBeNull();
      expect(parseNodeId(null)).toBeNull();
      expect(parseNodeId(undefined)).toBeNull();
    });
  });
});
