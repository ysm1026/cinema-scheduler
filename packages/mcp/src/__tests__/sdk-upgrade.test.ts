import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

describe('MCP SDK アップグレード検証', () => {
  it('StreamableHTTPServerTransport がインポート可能であること', () => {
    expect(StreamableHTTPServerTransport).toBeDefined();
    expect(typeof StreamableHTTPServerTransport).toBe('function');
  });

  it('McpServer が引き続きインポート可能であること', () => {
    expect(McpServer).toBeDefined();
    expect(typeof McpServer).toBe('function');
  });

  it('StdioServerTransport が引き続きインポート可能であること', () => {
    expect(StdioServerTransport).toBeDefined();
    expect(typeof StdioServerTransport).toBe('function');
  });

  it('McpServer インスタンスを生成できること', () => {
    const server = new McpServer({
      name: 'test-server',
      version: '1.0.0',
    });
    expect(server).toBeDefined();
  });
});
