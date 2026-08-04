import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SourceFormGenerator, {
  getSourceSchema,
  secretRefName,
  toSecretRef,
} from './SourceFormGenerator';

const renderForm = (props = {}) =>
  render(
    <SourceFormGenerator
      sourceType="postgresql"
      values={{}}
      onChange={() => {}}
      {...props}
    />
  );

describe('secret reference helpers', () => {
  test('round-trips a name through the reference syntax', () => {
    expect(toSecretRef('PGPW')).toBe('${env.PGPW}');
    expect(secretRefName('${env.PGPW}')).toBe('PGPW');
  });

  test('a literal is not a reference', () => {
    expect(secretRefName('hunter2')).toBe('');
    expect(secretRefName('')).toBe('');
    expect(secretRefName(undefined)).toBe('');
  });

  test('a partial match is not a reference', () => {
    expect(secretRefName('prefix${env.PW}')).toBe('');
    expect(secretRefName('${env.PW}suffix')).toBe('');
  });
});

describe('secret fields follow what the server said', () => {
  test('locally a password stays a masked text box', () => {
    renderForm({ secretsRequired: false });

    expect(screen.getByLabelText(/Password/)).toHaveAttribute('type', 'password');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  test('in cloud it becomes a picker over the account secrets', () => {
    renderForm({ secretsRequired: true, secretKeys: ['PGPW', 'OTHER'] });

    expect(screen.getByLabelText(/Password/)).toBe(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'PGPW' })).toBeInTheDocument();
  });

  test('choosing a secret stores a reference, not the name', async () => {
    const onChange = jest.fn();
    renderForm({ secretsRequired: true, secretKeys: ['PGPW'], onChange });

    await userEvent.selectOptions(screen.getByRole('combobox'), 'PGPW');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ password: '${env.PGPW}' }));
  });

  test('an existing reference shows as selected', () => {
    renderForm({
      secretsRequired: true,
      secretKeys: ['PGPW'],
      values: { password: '${env.PGPW}' },
    });

    expect(screen.getByRole('combobox')).toHaveValue('PGPW');
  });

  test('"New secret…" lets a name be typed and still stores a reference', async () => {
    const onChange = jest.fn();
    renderForm({ secretsRequired: true, secretKeys: [], onChange });

    await userEvent.selectOptions(screen.getByRole('combobox'), '__new__');
    await userEvent.type(screen.getByPlaceholderText('SECRET_NAME'), 'N');

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ password: '${env.N}' }));
  });
});

describe('schemas match the visivo source models', () => {
  test('bigquery offers credentials_base64, not a path that does not exist', () => {
    const names = getSourceSchema('bigquery').fields.map(f => f.name);

    // Sources are extra="forbid": credentials_path would make the source
    // unloadable by the runner.
    expect(names).toContain('credentials_base64');
    expect(names).not.toContain('credentials_path');
  });

  test('csv uses the field CSVFileSource declares', () => {
    const names = getSourceSchema('csv').fields.map(f => f.name);
    expect(names).toContain('file');
    expect(names).not.toContain('path');
  });

  test('only source types visivo implements are offered', () => {
    // No module exists for either — a source made from these could never run.
    expect(getSourceSchema('trino').fields).toHaveLength(0);
    expect(getSourceSchema('databricks').fields).toHaveLength(0);
  });

  test('the warehouses visivo does implement are present', () => {
    for (const type of ['clickhouse', 'redshift', 'excel']) {
      expect(getSourceSchema(type).fields.length).toBeGreaterThan(0);
    }
  });

  test('every credential-bearing field is typed secret', () => {
    // Mirrors what visivo types as SecretStrOrEnvVar; a plain password type
    // would slip past the cloud picker and be rejected on save.
    for (const type of ['postgresql', 'mysql', 'snowflake', 'clickhouse', 'redshift']) {
      const password = getSourceSchema(type).fields.find(f => f.name === 'password');
      expect(password?.type).toBe('secret');
    }
    const bq = getSourceSchema('bigquery').fields.find(f => f.name === 'credentials_base64');
    expect(bq.type).toBe('secret');
  });
});
