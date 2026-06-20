// Unit test for the Cloudinary client wrapper. Mocks ONLY the `cloudinary`
// SDK (not uploadBuffer) so the options we pass to `upload_stream` are
// actually asserted — the route test stubs uploadBuffer wholesale and would
// never catch a bad upload option (e.g. the metadata-vs-context bug that
// 502'd every real upload).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploadStream = vi.fn();
const config = vi.fn();

vi.mock('cloudinary', () => ({
  v2: {
    config: (...args: unknown[]) => config(...args),
    uploader: {
      upload_stream: (opts: unknown, cb: (e: unknown, r: unknown) => void) =>
        uploadStream(opts, cb),
    },
  },
}));

import { uploadBuffer, __resetCloudinarySingleton } from './cloudinary-client';

beforeEach(() => {
  vi.clearAllMocks();
  __resetCloudinarySingleton();
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'key';
  process.env.CLOUDINARY_API_SECRET = 'secret';
  // upload_stream returns a writable-ish stub; invoke the callback with a
  // happy response when .end() is called.
  uploadStream.mockImplementation((_opts: unknown, cb: (e: unknown, r: unknown) => void) => ({
    end: () => cb(null, { public_id: 'u/1', secure_url: 'https://cdn/u/1.png', bytes: 70 }),
  }));
});

describe('uploadBuffer', () => {
  it('passes the MIME as free-form `context`, never structured `metadata`', async () => {
    await uploadBuffer('u/1', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png');
    const opts = uploadStream.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(opts.context).toBe('mime=image/png');
    expect(opts.metadata).toBeUndefined(); // regression guard: metadata 502s real uploads
    expect(opts.public_id).toBe('u/1');
    expect(opts.resource_type).toBe('auto');
  });

  it('returns the public_id + secure_url + bytes from Cloudinary', async () => {
    const res = await uploadBuffer('u/1', Buffer.from([1, 2, 3]), 'image/png');
    expect(res).toEqual({ publicId: 'u/1', secureUrl: 'https://cdn/u/1.png', bytes: 70 });
  });

  it('throws StorageNotConfiguredError when creds are absent', async () => {
    __resetCloudinarySingleton();
    delete process.env.CLOUDINARY_API_SECRET;
    await expect(uploadBuffer('u/1', Buffer.from([1]), 'image/png')).rejects.toThrow(
      'Storage not configured',
    );
  });
});
