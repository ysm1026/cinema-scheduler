/**
 * 履歴エントリ
 */
export interface HistoryEntry {
  id: string;
  toolName: string;
  timestamp: string;
  request: Record<string, unknown>;
  response: unknown;
  error?: string;
}

/**
 * 履歴サービス（メモリ内保存）
 */
class HistoryService {
  private entries: HistoryEntry[] = [];
  private maxEntries = 100;

  /**
   * 履歴を追加する
   */
  add(
    toolName: string,
    request: Record<string, unknown>,
    response: unknown,
    error?: string
  ): HistoryEntry {
    const entryData = {
      id: crypto.randomUUID(),
      toolName,
      timestamp: new Date().toISOString(),
      request,
      response,
      ...(error && { error }),
    };
    const entry = entryData as HistoryEntry;

    this.entries.unshift(entry);

    // 最大件数を超えたら古いものを削除
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }

    return entry;
  }

  /**
   * 全履歴を取得する
   */
  getAll(): HistoryEntry[] {
    return this.entries;
  }

  /**
   * IDで履歴を取得する
   */
  getById(id: string): HistoryEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /**
   * 履歴をクリアする
   */
  clear(): void {
    this.entries = [];
  }
}

// シングルトンインスタンス
export const historyService = new HistoryService();
