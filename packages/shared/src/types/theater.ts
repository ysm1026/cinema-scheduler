/**
 * 映画館のチェーン種別
 */
export type TheaterChain = 'toho' | 'cinema_sunshine' | 'aeon' | 'united' | 'other';

/**
 * 映画館情報
 */
export interface Theater {
  id: number;
  name: string;
  area: string;
  chain: TheaterChain | null;
}

/**
 * 映画館作成用のデータ（IDなし）
 */
export interface TheaterInput {
  name: string;
  area: string;
  chain?: TheaterChain | null;
}
