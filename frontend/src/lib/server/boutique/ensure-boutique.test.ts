// Phase 1 — onboarding idempotent de la boutique.
// Importe le mock Prisma EN PREMIER (le vi.mock se hisse au-dessus des imports
// du module testé). slug.ts reste réel (logique pure + retry de collision).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { ensureBoutique, getPrimaryMembership } from './ensure-boutique';

describe('ensureBoutique', () => {
  it('retourne la boutique possédée existante sans rien créer', async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce({
      id: 'org1',
      slug: 'amir',
      name: 'Amir',
      settings: { currency: 'XAF', phone: null, city: null, address: null, invoiceNote: null },
    } as never);

    const ctx = await ensureBoutique('u1', 'amir@x.td');

    expect(prismaMock.organization.create).not.toHaveBeenCalled();
    expect(ctx.organization.id).toBe('org1');
    expect(ctx.role).toBe('OWNER');
    expect(ctx.settings.currency).toBe('XAF');
  });

  it('crée une boutique avec settings XAF au 1er appel', async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce(null);
    prismaMock.$transaction.mockImplementation((cb: unknown) =>
      typeof cb === 'function'
        ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
        : Promise.resolve(cb),
    );
    prismaMock.organization.create.mockResolvedValueOnce({
      id: 'org2',
      slug: 'amir',
      name: 'Amir',
    } as never);
    prismaMock.organizationMember.create.mockResolvedValueOnce({} as never);
    prismaMock.boutiqueSettings.create.mockResolvedValueOnce({} as never);

    const ctx = await ensureBoutique('u1', 'amir@x.td');

    expect(prismaMock.organization.create).toHaveBeenCalled();
    expect(prismaMock.organizationMember.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'OWNER', userId: 'u1' }) }),
    );
    expect(prismaMock.boutiqueSettings.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: 'XAF' }) }),
    );
    expect(ctx.organization.id).toBe('org2');
    expect(ctx.settings.currency).toBe('XAF');
    expect(ctx.role).toBe('OWNER');
  });

  it("dérive le slug de la partie locale de l'email", async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce(null);
    prismaMock.$transaction.mockImplementation((cb: unknown) =>
      typeof cb === 'function'
        ? ((cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>)
        : Promise.resolve(cb),
    );
    prismaMock.organization.create.mockResolvedValueOnce({
      id: 'org3',
      slug: 'amir',
      name: 'Amir',
    } as never);
    prismaMock.organizationMember.create.mockResolvedValue({} as never);
    prismaMock.boutiqueSettings.create.mockResolvedValue({} as never);

    await ensureBoutique('u1', 'amir@x.td');

    expect(prismaMock.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: expect.stringMatching(/^amir/) }),
      }),
    );
  });
});

describe('getPrimaryMembership', () => {
  it("retourne OWNER pour l'org possédée", async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: 'org1' } as never);
    expect(await getPrimaryMembership('u1')).toEqual({ organizationId: 'org1', role: 'OWNER' });
  });

  it('retombe sur une adhésion quand le user ne possède rien', async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce(null);
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      organizationId: 'org9',
      role: 'MEMBER',
    } as never);
    expect(await getPrimaryMembership('u1')).toEqual({ organizationId: 'org9', role: 'MEMBER' });
  });

  it('retourne null sans aucune org', async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce(null);
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce(null);
    expect(await getPrimaryMembership('u1')).toBeNull();
  });
});
