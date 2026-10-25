import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentOwnClient, { buildSnippets, mcpUrl } from './AgentOwnClient';

const setOrigin = origin => {
  delete window.location;
  window.location = { origin };
};
const originalLocation = window.location;
afterEach(() => {
  window.location = originalLocation;
  delete navigator.clipboard;
});

describe('snippets', () => {
  test('use the page origin', () => {
    setOrigin('http://localhost:8123');
    render(<AgentOwnClient />);
    expect(screen.getByText(/claude mcp add --transport http visivo http:\/\/localhost:8123\/api\/mcp\//)).toBeInTheDocument();
    const cursor = screen.getByTestId('agent-own-client-cursor');
    expect(cursor).toHaveTextContent('"url": "http://localhost:8123/api/mcp/"');
    expect(screen.getByTestId('agent-own-client-gemini')).toHaveTextContent(
      '"httpUrl": "http://localhost:8123/api/mcp/"'
    );
  });

  test.each([
    ['https://dev.example.com', 'https://dev.example.com/api/mcp/'],
    ['http://192.168.1.20:8000', 'http://192.168.1.20:8000/api/mcp/'],
    ['http://devbox:8123', 'http://devbox:8123/api/mcp/'],
  ])('keep the host, scheme and port of %s', (origin, expected) => {
    setOrigin(origin);
    render(<AgentOwnClient />);
    expect(screen.getByTestId('agent-own-client-cursor')).toHaveTextContent(`"url": "${expected}"`);
  });

  test.each(['', 'null'])('fall back to localhost:8000 when the origin is %p', origin => {
    expect(mcpUrl(origin)).toBe('http://localhost:8000/api/mcp/');
  });

  test('match the documented JSON blocks exactly', () => {
    const [, cursor, gemini] = buildSnippets('http://localhost:8000/api/mcp/');
    expect(JSON.parse(cursor.code)).toEqual({
      mcpServers: { visivo: { url: 'http://localhost:8000/api/mcp/' } },
    });
    expect(JSON.parse(gemini.code)).toEqual({
      mcpServers: { visivo: { httpUrl: 'http://localhost:8000/api/mcp/' } },
    });
  });

  test('link to the MCP guide', () => {
    setOrigin('http://localhost:8000');
    render(<AgentOwnClient />);
    expect(screen.getByRole('link', { name: 'Read the MCP guide' })).toHaveAttribute(
      'href',
      'https://docs.visivo.io/ai/mcp/'
    );
  });
});

describe('copy buttons', () => {
  test('write the snippet to the clipboard from the click handler', async () => {
    setOrigin('http://localhost:8000');
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AgentOwnClient />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy Claude Code snippet' }));

    expect(writeText).toHaveBeenCalledWith(
      'claude mcp add --transport http visivo http://localhost:8000/api/mcp/'
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copy Claude Code snippet' })).toHaveTextContent(
        'Copied'
      )
    );
  });

  test('select the text and say so when the clipboard is unavailable', () => {
    setOrigin('http://localhost:8000');
    render(<AgentOwnClient />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy Cursor snippet' }));

    expect(screen.getByRole('status')).toHaveTextContent('press Ctrl+C or Cmd+C');
    expect(window.getSelection().toString()).toContain('"mcpServers"');
  });

  test('fall back the same way when the write is rejected', async () => {
    setOrigin('http://localhost:8000');
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('no')) } });
    render(<AgentOwnClient />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy Gemini CLI snippet' }));

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Gemini CLI snippet' })).toHaveTextContent('Copy');
  });
});
