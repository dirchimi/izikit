// Phase 1 — onboarding idempotent de la boutique.
// Importe le mock Prisma EN PREMIER (le vi.mock se hisse au-dessus des imports
// du module testé). slug.ts reste réel (logique pure + retry de collision).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect } from 'vitest';
import { ensureBoutique, getPrimaryMembership, dissolveEmptyAutoBoutique } from './ensure-boutique';

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

  it("employé invité : retourne la boutique de l'inviteur, sans en créer une (fix invitation)", async () => {
    // Ne POSSÈDE aucune org…
    prismaMock.organization.findFirst.mockResolvedValueOnce(null);
    // …mais est MEMBRE de celle de l'inviteur.
    prismaMock.organizationMember.findFirst.mockResolvedValueOnce({
      role: 'MEMBER',
      organization: {
        id: 'org-boss',
        slug: 'boss',
        name: 'Boutique du Patron',
        settings: {
          currency: 'XAF',
          phone: null,
          city: null,
          address: null,
          invoiceNote: null,
          logoUrl: null,
          businessType: null,
          overdueDays: 30,
          bigExpenseThreshold: 50000,
        },
      },
    } as never);

    const ctx = await ensureBoutique('emp1', 'emp@x.td');

    // Le bug : sans ce garde, une nouvelle boutique était créée pour l'employé.
    expect(prismaMock.organization.create).not.toHaveBeenCalled();
    expect(ctx.organization.id).toBe('org-boss');
    expect(ctx.role).toBe('MEMBER');
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

describe('dissolveEmptyAutoBoutique', () => {
  // Les 11 tables inspectées par le garde d'inactivité, dans l'ordre du helper.
  const countedModels = () =>
    [
      prismaMock.product,
      prismaMock.sale,
      prismaMock.customer,
      prismaMock.expense,
      prismaMock.receivable,
      prismaMock.repayment,
      prismaMock.document,
      prismaMock.stockMovement,
      prismaMock.supplierDebt,
      prismaMock.subscriptionPayment,
      prismaMock.invitation,
    ] as const;

  function mockCounts(overrides: Partial<Record<number, number>> = {}) {
    countedModels().forEach((m, i) => {
      m.count.mockResolvedValue((overrides[i] ?? 0) as never);
    });
  }
  const tx = () => prismaMock as unknown as Parameters<typeof dissolveEmptyAutoBoutique>[0];

  it("dissout la boutique auto-créée vide d'un employé fraîchement ajouté (fix : il restait enfermé dedans)", async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: 'org-vide' } as never);
    mockCounts();
    prismaMock.organizationMember.findMany.mockResolvedValueOnce([{ userId: 'emp1' }] as never);

    expect(await dissolveEmptyAutoBoutique(tx(), 'emp1')).toBe(true);
    expect(prismaMock.organization.delete).toHaveBeenCalledWith({ where: { id: 'org-vide' } });
  });

  it('ne touche à RIEN si la boutique possédée a des données métier (vrai patron invité ailleurs)', async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: 'org-active' } as never);
    mockCounts({ 1: 3 }); // 3 ventes
    prismaMock.organizationMember.findMany.mockResolvedValueOnce([{ userId: 'u1' }] as never);

    expect(await dissolveEmptyAutoBoutique(tx(), 'u1')).toBe(false);
    expect(prismaMock.organization.delete).not.toHaveBeenCalled();
  });

  it("ne touche à RIEN si la boutique possédée a d'autres membres", async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce({ id: 'org-equipe' } as never);
    mockCounts();
    prismaMock.organizationMember.findMany.mockResolvedValueOnce([
      { userId: 'u1' },
      { userId: 'autre' },
    ] as never);

    expect(await dissolveEmptyAutoBoutique(tx(), 'u1')).toBe(false);
    expect(prismaMock.organization.delete).not.toHaveBeenCalled();
  });

  it('no-op sans boutique possédée (invité qui ne s’était jamais inscrit seul)', async () => {
    prismaMock.organization.findFirst.mockResolvedValueOnce(null);
    expect(await dissolveEmptyAutoBoutique(tx(), 'emp1')).toBe(false);
    expect(prismaMock.organization.delete).not.toHaveBeenCalled();
  });
});
