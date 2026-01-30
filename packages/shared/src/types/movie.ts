/**
 * 映画情報
 */
export interface Movie {
  id: number;
  title: string;
  runtimeMinutes: number | null;
}

/**
 * 映画作成用のデータ（IDなし）
 */
export interface MovieInput {
  title: string;
  runtimeMinutes?: number | null;
}
