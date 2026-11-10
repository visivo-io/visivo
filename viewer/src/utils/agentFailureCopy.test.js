import {
  AGENT_FAILURE_COPY,
  agentProgressLine,
  classifyAgentFailure,
  describeAgentFailure,
  statusOf,
} from './agentFailureCopy';

describe('classifyAgentFailure', () => {
  it.each([
    ['TurnFailed 503', 'provider_busy'],
    ['status_code: 529, model_name: claude, body: overloaded', 'provider_busy'],
    ['status_code: 429, model_name: gpt-4o', 'provider_busy'],
    ['Error code: 500 - internal', 'provider_error'],
    ['HTTP 502 Bad Gateway', 'provider_error'],
    ['status_code: 504, model_name: x', 'timeout'],
    ['status_code: 408', 'timeout'],
    ['status_code: 401, body: invalid x-api-key', 'auth'],
    ['status_code: 403', 'auth'],
    ['status_code: 413, body: <html>', 'too_large'],
    ['ReadTimeout: timed out', 'timeout'],
    ['httpx.ConnectError: [Errno 61] Connection refused', 'connection'],
    ['Failed to fetch', 'connection'],
    ['Incorrect API key provided', 'auth'],
    ['The model is overloaded', 'provider_busy'],
    ['Content filter triggered: Malformed function call', 'content_filter'],
    [
      'Visivo-supplied inference is configured but not switched on at https://app.visivo.io.',
      'inference_unavailable',
    ],
    [
      'The agent reached the limit of what one turn may do (40 model requests, 80 tool calls).',
      'turn_limit',
    ],
    ['The turn reached its budget of 40 model requests.', 'turn_limit'],
    [
      'This conversation has grown too large to send. Start a new one to carry on.',
      'too_large',
    ],
    ['KeyError: something odd', 'unknown'],
    ['', 'unknown'],
  ])('%s -> %s', (raw, code) => {
    expect(classifyAgentFailure(raw)).toBe(code);
  });

  it('prefers the server sentence over the status it carries', () => {
    expect(
      classifyAgentFailure('Visivo-supplied inference is not available at x (status_code: 404)')
    ).toBe('inference_unavailable');
  });

  it('treats a missing message as unknown', () => {
    expect(classifyAgentFailure(null)).toBe('unknown');
    expect(classifyAgentFailure(undefined)).toBe('unknown');
  });

  it('falls back by context', () => {
    expect(classifyAgentFailure('Failed to start the agent', 'start')).toBe('start_failed');
    expect(classifyAgentFailure('status_code: 503', 'start')).toBe('provider_busy');
    expect(classifyAgentFailure('Failed to stop the agent', 'stop')).toBe('stop_failed');
    expect(classifyAgentFailure('Connection refused', 'poll')).toBe('lost_contact');
  });
});

describe('statusOf', () => {
  it('reads the status from the shapes the agent reports', () => {
    expect(statusOf('TurnFailed 503')).toBe(503);
    expect(statusOf('status_code: 429, model_name: x')).toBe(429);
    expect(statusOf('Error code: 529 - {...}')).toBe(529);
    expect(statusOf('no number here')).toBeNull();
    expect(statusOf('made 503 rows')).toBeNull();
  });
});

describe('describeAgentFailure', () => {
  it('replaces the raw error and keeps it as details', () => {
    const failure = describeAgentFailure('TurnFailed 503');
    expect(failure).toEqual({
      code: 'provider_busy',
      headline: AGENT_FAILURE_COPY.provider_busy.headline,
      hint: AGENT_FAILURE_COPY.provider_busy.hint,
      details: 'TurnFailed 503',
    });
    expect(failure.headline).not.toMatch(/503|TurnFailed/);
  });

  it('gives empty details for a missing message', () => {
    expect(describeAgentFailure(null).details).toBe('');
  });

  it('has a headline and hint for every class, without raw codes', () => {
    Object.values(AGENT_FAILURE_COPY).forEach(({ headline, hint }) => {
      expect(headline).toBeTruthy();
      expect(hint).toBeTruthy();
      expect(`${headline} ${hint}`).not.toMatch(/\b\d{3}\b|TurnFailed|status_code/);
    });
  });
});

describe('agentProgressLine', () => {
  it('maps the active states to a line', () => {
    expect(agentProgressLine('queued')).toMatch(/Waiting/);
    expect(agentProgressLine('running')).toMatch(/Working/);
  });

  it('has no line for a finished state', () => {
    expect(agentProgressLine('failed')).toBeNull();
    expect(agentProgressLine(undefined)).toBeNull();
  });
});
