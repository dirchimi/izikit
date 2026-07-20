import { test, expect } from 'vitest';
import { Prisma } from '@prisma/client';
test('OfflineOperation model exists with clientOpId unique', () => {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'OfflineOperation');
  expect(model).toBeDefined();
  expect(model!.fields.some((f) => f.name === 'clientOpId' && f.isUnique)).toBe(true);
});
test('StockMovement has unique clientOpId', () => {
  const m = Prisma.dmmf.datamodel.models.find((m) => m.name === 'StockMovement')!;
  expect(m.fields.some((f) => f.name === 'clientOpId' && f.isUnique)).toBe(true);
});
