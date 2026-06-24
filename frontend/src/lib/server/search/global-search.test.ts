import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { globalSearch } from './global-search';

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.product.findMany.mockResolvedValue([] as never);
  prismaMock.customer.findMany.mockResolvedValue([] as never);
  prismaMock.sale.findMany.mockResolvedValue([] as never);
  prismaMock.expense.findMany.mockResolvedValue([] as never);
});

describe('globalSearch', () => {
  it('returns empty (no queries) when the term is shorter than 2 chars', async () => {
    const r = await globalSearch(prismaMock as never, 'org-1', 'a');
    expect(r.total).toBe(0);
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });

  it('queries all groups scoped to the org and maps hits with hrefs', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Riz parfumé', ref: 'P-RIZ', qty: 12, sellPrice: 5000 },
    ] as never);
    prismaMock.customer.findMany.mockResolvedValue([
      { id: 'c1', name: 'Awa', phone: '+235 66' },
    ] as never);

    const r = await globalSearch(prismaMock as never, 'org-1', 'riz');

    expect(r.products[0]).toMatchObject({ id: 'p1', label: 'Riz parfumé', href: '/stock' });
    expect(r.customers[0]).toMatchObject({ id: 'c1', label: 'Awa', href: '/creances' });
    expect(r.total).toBe(2);
    // org scoping present on the product query
    const where = (
      prismaMock.product.findMany.mock.calls[0]![0] as { where: { organizationId: string } }
    ).where;
    expect(where.organizationId).toBe('org-1');
  });
});
