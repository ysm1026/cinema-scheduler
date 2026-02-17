import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGcsStorage } from '../db/gcs-storage.js';
import type { Storage } from '@google-cloud/storage';

function createMockStorage(overrides?: {
  download?: () => Promise<[Buffer]>;
  save?: (data: Buffer) => Promise<void>;
  getMetadata?: () => Promise<[Record<string, unknown>]>;
}) {
  const download = overrides?.download ?? vi.fn().mockResolvedValue([Buffer.from('mock-db-data')]);
  const save = overrides?.save ?? vi.fn().mockResolvedValue(undefined);
  const getMetadata = overrides?.getMetadata ?? vi.fn().mockResolvedValue([{
    updated: '2026-02-13T06:00:00.000Z',
    generation: '1234567890',
  }]);

  const file = vi.fn().mockReturnValue({ download, save, getMetadata });
  const bucket = vi.fn().mockReturnValue({ file });

  return {
    storage: { bucket } as unknown as Storage,
    mocks: { bucket, file, download, save, getMetadata },
  };
}

describe('GcsStorage', () => {
  describe('download', () => {
    it('should download file from GCS as Buffer', async () => {
      const content = Buffer.from('sqlite-binary-data');
      const { storage, mocks } = createMockStorage({
        download: vi.fn().mockResolvedValue([content]),
      });
      const gcs = createGcsStorage(storage);

      const result = await gcs.download('my-bucket', 'data.db');

      expect(mocks.bucket).toHaveBeenCalledWith('my-bucket');
      expect(mocks.file).toHaveBeenCalledWith('data.db');
      expect(result).toEqual(content);
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should propagate error when bucket does not exist', async () => {
      const { storage } = createMockStorage({
        download: vi.fn().mockRejectedValue(new Error('No such bucket: nonexistent')),
      });
      const gcs = createGcsStorage(storage);

      await expect(gcs.download('nonexistent', 'data.db')).rejects.toThrow('No such bucket');
    });

    it('should propagate error when object does not exist', async () => {
      const { storage } = createMockStorage({
        download: vi.fn().mockRejectedValue(new Error('No such object: data.db')),
      });
      const gcs = createGcsStorage(storage);

      await expect(gcs.download('my-bucket', 'data.db')).rejects.toThrow('No such object');
    });
  });

  describe('upload', () => {
    it('should upload Buffer to GCS', async () => {
      const data = Buffer.from('new-db-data');
      const saveFn = vi.fn().mockResolvedValue(undefined);
      const { storage, mocks } = createMockStorage({ save: saveFn });
      const gcs = createGcsStorage(storage);

      await gcs.upload('my-bucket', 'data.db', data);

      expect(mocks.bucket).toHaveBeenCalledWith('my-bucket');
      expect(mocks.file).toHaveBeenCalledWith('data.db');
      expect(saveFn).toHaveBeenCalledWith(data);
    });

    it('should propagate error on permission denied', async () => {
      const { storage } = createMockStorage({
        save: vi.fn().mockRejectedValue(new Error('Permission denied')),
      });
      const gcs = createGcsStorage(storage);

      await expect(gcs.upload('my-bucket', 'data.db', Buffer.from('x'))).rejects.toThrow('Permission denied');
    });
  });

  describe('getMetadata', () => {
    it('should return parsed metadata with updated date and generation', async () => {
      const { storage, mocks } = createMockStorage({
        getMetadata: vi.fn().mockResolvedValue([{
          updated: '2026-02-13T06:00:00.000Z',
          generation: '9876543210',
        }]),
      });
      const gcs = createGcsStorage(storage);

      const metadata = await gcs.getMetadata('my-bucket', 'data.db');

      expect(mocks.bucket).toHaveBeenCalledWith('my-bucket');
      expect(mocks.file).toHaveBeenCalledWith('data.db');
      expect(metadata.updated).toEqual(new Date('2026-02-13T06:00:00.000Z'));
      expect(metadata.generation).toBe('9876543210');
    });

    it('should convert numeric generation to string', async () => {
      const { storage } = createMockStorage({
        getMetadata: vi.fn().mockResolvedValue([{
          updated: '2026-01-01T00:00:00.000Z',
          generation: 12345,
        }]),
      });
      const gcs = createGcsStorage(storage);

      const metadata = await gcs.getMetadata('my-bucket', 'data.db');

      expect(metadata.generation).toBe('12345');
    });

    it('should propagate error when access is denied', async () => {
      const { storage } = createMockStorage({
        getMetadata: vi.fn().mockRejectedValue(new Error('Access denied')),
      });
      const gcs = createGcsStorage(storage);

      await expect(gcs.getMetadata('my-bucket', 'data.db')).rejects.toThrow('Access denied');
    });
  });
});
