import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SourceFormGenerator, {
  getSourceSchema,
  parsePortInput,
  secretRefName,
  toSecretRef,
} from './SourceFormGenerator';

// The raw ${env.NAME} reference text, built from a variable. Writing it as a
// plain '${env.NAME}' string trips no-template-curly-in-string, and splitting
// that literal trips no-useless-concat — so compose it from a non-literal, which
// satisfies both while staying an independent value (not the fn under test).
const DOLLAR = '$';
const rawRef = name => DOLLAR + '{env.' + name + '}';

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
    expect(toSecretRef('PGPW')).toBe(rawRef('PGPW'));
    expect(secretRefName(rawRef('PGPW'))).toBe('PGPW');
  });

  test('a literal is not a reference', () => {
    expect(secretRefName('hunter2')).toBe('');
    expect(secretRefName('')).toBe('');
    expect(secretRefName(undefined)).toBe('');
  });

  test('a partial match is not a reference', () => {
    // The whole value must be the reference, not just contain one.
    expect(secretRefName('prefix' + rawRef('PW'))).toBe('');
    expect(secretRefName(rawRef('PW') + 'suffix')).toBe('');
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

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ password: toSecretRef('PGPW') })
    );
  });

  test('an existing reference shows as selected', () => {
    renderForm({
      secretsRequired: true,
      secretKeys: ['PGPW'],
      values: { password: toSecretRef('PGPW') },
    });

    expect(screen.getByRole('combobox')).toHaveValue('PGPW');
  });

  test('"New secret…" lets a name be typed and still stores a reference', async () => {
    const onChange = jest.fn();
    renderForm({ secretsRequired: true, secretKeys: [], onChange });

    await userEvent.selectOptions(screen.getByRole('combobox'), '__new__');
    await userEvent.type(screen.getByPlaceholderText('SECRET_NAME'), 'N');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ password: toSecretRef('N') })
    );
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

describe('port field', () => {
  test('shows an env var reference instead of a blank box', () => {
    renderForm({ values: { port: rawRef('PG_PORT') } });
    const port = screen.getByLabelText('Port');
    expect(port).toHaveAttribute('type', 'text');
    expect(port).toHaveValue(rawRef('PG_PORT'));
  });

  test('keeps a typed env var reference as text', () => {
    const onChange = jest.fn();
    renderForm({ values: { port: 5432 }, onChange });
    fireEvent.change(screen.getByLabelText('Port'), { target: { value: rawRef('OTHER_PORT') } });
    expect(onChange).toHaveBeenLastCalledWith({ port: rawRef('OTHER_PORT') });
  });

  test('stores typed digits as a number', () => {
    const onChange = jest.fn();
    renderForm({ values: { port: rawRef('PG_PORT') }, onChange });
    fireEvent.change(screen.getByLabelText('Port'), { target: { value: '6543' } });
    expect(onChange).toHaveBeenLastCalledWith({ port: 6543 });
  });

  test.each(['mysql', 'clickhouse', 'redshift'])('is a text field for %s too', sourceType => {
    renderForm({ sourceType, values: { port: rawRef('DB_PORT') } });
    expect(screen.getByLabelText('Port')).toHaveValue(rawRef('DB_PORT'));
  });

  test('says it takes a number or a reference, unless it shows an error', () => {
    const { rerender } = renderForm();
    expect(screen.getByText(`A number or an ${rawRef('NAME')} reference.`)).toBeInTheDocument();
    rerender(
      <SourceFormGenerator
        sourceType="postgresql"
        values={{}}
        onChange={() => {}}
        errors={{ port: 'Port is invalid' }}
      />
    );
    expect(screen.queryByText(/A number or an/)).not.toBeInTheDocument();
    expect(screen.getByText('Port is invalid')).toBeInTheDocument();
  });

  test('parsePortInput turns only whole digit strings into numbers', () => {
    expect(parsePortInput('5432')).toBe(5432);
    expect(parsePortInput('')).toBe('');
    expect(parsePortInput('54a')).toBe('54a');
    expect(parsePortInput(rawRef('PG_PORT'))).toBe(rawRef('PG_PORT'));
  });
});

describe('environment variable hint', () => {
  test('a local password field shows the env reference syntax and a docs link', () => {
    renderForm();
    const hint = screen.getByTestId('password-env-hint');
    expect(hint).toHaveTextContent(rawRef('PASSWORD'));
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute(
      'href',
      'https://docs.visivo.io/topics/environment-variables/'
    );
  });

  test('the bigquery key field gets its own variable name', () => {
    renderForm({ sourceType: 'bigquery' });
    expect(screen.getByTestId('credentials_base64-env-hint')).toHaveTextContent(
      rawRef('SERVICE_ACCOUNT_KEY')
    );
  });

  test('plain text fields and the cloud picker show no hint', () => {
    renderForm();
    expect(screen.queryByTestId('host-env-hint')).not.toBeInTheDocument();
    renderForm({ secretsRequired: true, secretKeys: [] });
    expect(screen.getAllByTestId('password-env-hint')).toHaveLength(1);
  });
});

describe('plain field behavior', () => {
  test('typing calls onChange, numbers are coerced and cleared to empty', async () => {
    const onChange = jest.fn();
    renderForm({ onChange });
    await userEvent.type(screen.getByLabelText(/^Host/), 'a');
    expect(onChange).toHaveBeenLastCalledWith({ host: 'a' });
    const port = screen.getByLabelText('Port');
    await userEvent.clear(port);
    expect(onChange).toHaveBeenLastCalledWith({ port: '' });
    await userEvent.type(port, '7');
    expect(onChange).toHaveBeenLastCalledWith({ port: 54327 });
  });

  test('the eye button reveals and re-masks the password', async () => {
    renderForm();
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByTitle('Show'));
    expect(input).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByTitle('Hide'));
    expect(input).toHaveAttribute('type', 'password');
  });

  test('no source type and unknown source type render a message', () => {
    renderForm({ sourceType: '' });
    expect(screen.getByText(/Select a source type/)).toBeInTheDocument();
    renderForm({ sourceType: 'nope' });
    expect(screen.getByText(/schema not available/)).toBeInTheDocument();
  });
});
