import { Storage } from '@google-cloud/storage';

export interface GcsMetadata {
  updated: Date;
  generation: string;
}

export interface GcsStorageService {
  download(bucket: string, objectName: string): Promise<Buffer>;
  upload(bucket: string, objectName: string, data: Buffer): Promise<void>;
  getMetadata(bucket: string, objectName: string): Promise<GcsMetadata>;
}

/**
 * Google Cloud Storage ファイル操作サービスを作成する
 * ADC（Application Default Credentials）で自動認証
 */
export function createGcsStorage(storage?: Storage): GcsStorageService {
  const client = storage ?? new Storage();

  return {
    async download(bucket: string, objectName: string): Promise<Buffer> {
      const [contents] = await client.bucket(bucket).file(objectName).download();
      return Buffer.from(contents);
    },

    async upload(bucket: string, objectName: string, data: Buffer): Promise<void> {
      await client.bucket(bucket).file(objectName).save(data);
    },

    async getMetadata(bucket: string, objectName: string): Promise<GcsMetadata> {
      const [metadata] = await client.bucket(bucket).file(objectName).getMetadata();
      return {
        updated: new Date(metadata.updated as string),
        generation: String(metadata.generation),
      };
    },
  };
}
