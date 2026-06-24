import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { notifyOwner, notifyUser, resolveOwnerId } from './notify-owner';
import { saleMadeNotification } from './templates';

beforeEach(() => {
  vi.clearAllMocks();
});

const input = saleMadeNotification({ id: 's1', number: 'V-0001', total: 5000 }, 'XAF');

describe('resolveOwnerId', () => {
  it('returns ownerId when the org exists', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ ownerId: 'owner-1' } as never);
    await expect(resolveOwnerId(prismaMock as never, 'org-1')).resolves.toBe('owner-1');
  });

  it('returns null when the org is missing', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null as never);
    await expect(resolveOwnerId(prismaMock as never, 'org-x')).resolves.toBeNull();
  });
});

describe('notifyUser', () => {
  it('creates the notification when the in-app channel is enabled (default opt-out)', async () => {
    prismaMock.notificationPreferences.findUnique.mockResolvedValue(null as never);
    prismaMock.notification.create.mockResolvedValue({ id: 'n1' } as never);

    const res = await notifyUser(prismaMock as never, 'owner-1', input);

    expect(res).toEqual({ id: 'n1' });
    expect(prismaMock.notification.create).toHaveBeenCalledOnce();
    const arg = prismaMock.notification.create.mock.calls[0]![0] as { data: { userId: string } };
    expect(arg.data.userId).toBe('owner-1');
  });

  it('skips creation when the user disabled this type in-app', async () => {
    prismaMock.notificationPreferences.findUnique.mockResolvedValue({
      prefs: { SALE_MADE: { inApp: false } },
    } as never);

    const res = await notifyUser(prismaMock as never, 'owner-1', input);

    expect(res).toBeNull();
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it('returns null when the row is deduplicated (P2002)', async () => {
    prismaMock.notificationPreferences.findUnique.mockResolvedValue(null as never);
    prismaMock.notification.create.mockRejectedValue({ code: 'P2002' } as never);

    await expect(notifyUser(prismaMock as never, 'owner-1', input)).resolves.toBeNull();
  });
});

describe('notifyOwner', () => {
  it('resolves the owner then notifies them', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({ ownerId: 'owner-1' } as never);
    prismaMock.notificationPreferences.findUnique.mockResolvedValue(null as never);
    prismaMock.notification.create.mockResolvedValue({ id: 'n1' } as never);

    const res = await notifyOwner(prismaMock as never, 'org-1', input);

    expect(res).toEqual({ id: 'n1' });
  });

  it('does nothing when the org has no resolvable owner', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null as never);

    const res = await notifyOwner(prismaMock as never, 'org-1', input);

    expect(res).toBeNull();
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });
});
