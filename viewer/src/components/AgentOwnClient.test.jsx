import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentOwnClient, { buildSnippets, mcpUrl, offersOwnClient } from './AgentOwnClient';

const pageUrl = `${window.location.origin}/api/mcp/`;

// The panel is collapsed until asked for, so anything reading its contents
// opens it first. Rendering alone no longer shows a snippet.
const renderExpanded = () => {
  render(<AgentOwnClient />);
  fireEvent.click(screen.getByRole('button', { name: /use your own agent/i }));
};

afterEach(() => {
  delete navigator.clipboard;
});

describe('snippets', () => {
  test('use the page origin', () => {
    renderExpanded();
    expect(
      screen.getByText(`claude mcp add --transport http visivo ${pageUrl}`)
    ).toBeInTheDocument();
    expect(screen.getByTestId('agent-own-client-cursor')).toHaveTextContent(`"url": "${pageUrl}"`);
    expect(screen.getByTestId('agent-own-client-gemini')).toHaveTextContent(
      `"httpUrl": "${pageUrl}"`
    );
  });

  test.each([
    ['https://dev.example.com', 'https://dev.example.com/api/mcp/'],
    ['http://192.168.1.20:8000', 'http://192.168.1.20:8000/api/mcp/'],
    ['http://devbox:8123', 'http://devbox:8123/api/mcp/'],
  ])('keep the host, scheme and port of %s', (origin, expected) => {
    expect(mcpUrl(origin)).toBe(expected);
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
    renderExpanded();
    expect(screen.getByRole('link', { name: 'Read the MCP guide' })).toHaveAttribute(
      'href',
      'https://docs.visivo.io/ai/mcp/'
    );
  });
});

describe('copy buttons', () => {
  test('write the snippet to the clipboard from the click handler', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderExpanded();

    fireEvent.click(screen.getByRole('button', { name: 'Copy Claude Code snippet' }));

    expect(writeText).toHaveBeenCalledWith(`claude mcp add --transport http visivo ${pageUrl}`);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copy Claude Code snippet' })).toHaveTextContent(
        'Copied'
      )
    );
  });

  test('select the text and say so when the clipboard is unavailable', () => {
    renderExpanded();

    fireEvent.click(screen.getByRole('button', { name: 'Copy Cursor snippet' }));

    expect(screen.getByRole('status')).toHaveTextContent('press Ctrl+C or Cmd+C');
    expect(window.getSelection().toString()).toContain('"mcpServers"');
  });

  test('fall back the same way when the write is rejected', async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('no')) } });
    renderExpanded();

    fireEvent.click(screen.getByRole('button', { name: 'Copy Gemini CLI snippet' }));

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Gemini CLI snippet' })).toHaveTextContent('Copy');
  });
});


describe('collapsing', () => {
  test('starts collapsed so using our agent is the first thing on offer', () => {
    render(<AgentOwnClient />);

    expect(screen.getByRole('button', { name: /use your own agent/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByTestId('agent-own-client-claude')).not.toBeInTheDocument();
  });

  test('opens and closes again on the heading', () => {
    render(<AgentOwnClient />);
    const toggle = screen.getByRole('button', { name: /use your own agent/i });

    fireEvent.click(toggle);
    expect(screen.getByTestId('agent-own-client-claude')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(screen.queryByTestId('agent-own-client-claude')).not.toBeInTheDocument();
  });
});

describe('where it is offered', () => {
  // Removed with the guard itself (VIS-1665), once cloud serves /api/mcp/.
  test.each(['app.visivo.io', 'visivo.io', 'APP.VISIVO.IO'])(
    'stays hidden on %s, where the endpoint does not exist',
    hostname => {
      expect(offersOwnClient(hostname)).toBe(false);
    }
  );

  test.each(['localhost', '127.0.0.1', 'devbox', 'notvisivo.io', 'visivo.io.example.com'])(
    'is offered on %s',
    hostname => {
      expect(offersOwnClient(hostname)).toBe(true);
    }
  );

  test('renders nothing at all on a visivo.io host', () => {
    render(<AgentOwnClient hostname="app.visivo.io" />);

    expect(screen.queryByTestId('agent-own-client')).not.toBeInTheDocument();
  });

  test('still renders where the endpoint exists', () => {
    render(<AgentOwnClient hostname="localhost" />);

    expect(screen.getByTestId('agent-own-client')).toBeInTheDocument();
  });
});
