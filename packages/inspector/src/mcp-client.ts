import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * ツール情報
 */
export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * ツール実行結果
 */
export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * MCPクライアント
 */
export class McpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private tools: ToolInfo[] = [];

  /**
   * MCPサーバーに接続する
   */
  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    // MCPサーバーのパスを取得
    const serverPath = join(__dirname, '../../mcp/dist/server.js');

    // クライアントを作成
    this.client = new Client({
      name: 'cinema-inspector',
      version: '1.0.0',
    });

    // トランスポートを作成
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
    });

    // 接続
    await this.client.connect(this.transport);

    // ツール一覧を取得
    const { tools } = await this.client.listTools();
    this.tools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      inputSchema: tool.inputSchema as ToolInfo['inputSchema'],
    }));
  }

  /**
   * 接続を切断する
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  /**
   * ツール一覧を取得する
   */
  getTools(): ToolInfo[] {
    return this.tools;
  }

  /**
   * ツール情報を取得する
   */
  getTool(name: string): ToolInfo | undefined {
    return this.tools.find((t) => t.name === name);
  }

  /**
   * ツールを実行する
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.client) {
      throw new Error('Not connected to MCP server');
    }

    const result = await this.client.callTool({ name, arguments: args });
    return result as ToolResult;
  }
}

// シングルトンインスタンス
let clientInstance: McpClient | null = null;

/**
 * MCPクライアントインスタンスを取得する
 */
export async function getMcpClient(): Promise<McpClient> {
  if (!clientInstance) {
    clientInstance = new McpClient();
    await clientInstance.connect();
  }
  return clientInstance;
}

/**
 * MCPクライアントを終了する
 */
export async function closeMcpClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.disconnect();
    clientInstance = null;
  }
}
