// Maintenance / test-cleanup script. Hard-deletes users by email so the
// address is freed and can sign up again from scratch.
//
// Usage (run from frontend/, or via the root pnpm alias):
//   pnpm db:delete-users <email> [<email> ...]      delete the listed emails
//   pnpm db:delete-users --all-except <keepEmail>    delete everyone but keepEmail
//   pnpm db:delete-users ... --dry-run               preview only, no writes
//
// WHY a script and not a plain `deleteMany`:
//   Deleting a User is blocked by three `onDelete: Restrict` relations —
//   Organization.owner, AdminAction.actor, Withdrawal.user. We remove those
//   (and the FK-less Invitation rows) in order, inside one transaction per
//   user, then delete the User (which cascades OAuthAccount, VerificationCode,
//   Notification, NotificationPreferences, OrganizationMember; SetNull on
//   Order / FileUpload). Deleting an Organization cascades its products,
//   sales, customers, receivables, expenses, documents and settings.
//
// SAFETY: targets PROD if DATABASE_URL points to prod. There is NO undo.
//   Always run with --dry-run first. A SUPERADMIN is refused unless you add
//   --force-superadmin.

import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

interface RunDeps {
  prisma?: PrismaClient;
}

export async function main(
  args: string[] = process.argv.slice(2),
  deps: RunDeps = {},
): Promise<number> {
  const dryRun = args.includes('--dry-run');
  const forceSuperadmin = args.includes('--force-superadmin');
  const allExceptIdx = args.indexOf('--all-except');

  const prisma = deps.prisma ?? getPrisma();
  try {
    // Resolve the target set of users.
    let targets: { id: string; email: string; role: string }[];
    if (allExceptIdx !== -1) {
      const keep = args[allExceptIdx + 1]?.trim().toLowerCase();
      if (!keep) {
        console.error('Usage: pnpm db:delete-users --all-except <keepEmail>');
        return 1;
      }
      targets = await prisma.user.findMany({
        where: { email: { not: keep } },
        select: { id: true, email: true, role: true },
      });
    } else {
      const emails = args
        .filter((a) => !a.startsWith('--'))
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);
      if (emails.length === 0) {
        console.error(
          'Usage: pnpm db:delete-users <email> [<email> ...]  |  --all-except <keepEmail>  [--dry-run]',
        );
        return 1;
      }
      targets = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, role: true },
      });
      const found = new Set(targets.map((u) => u.email));
      for (const e of emails) if (!found.has(e)) console.log(`• skip ${e} — not found`);
    }

    if (targets.length === 0) {
      console.log('Nothing to delete.');
      return 0;
    }

    // Protect superadmins. In bulk mode (--all-except) we simply preserve them
    // and keep going. In explicit-email mode, naming a superadmin is more
    // deliberate, so we hard-stop unless --force-superadmin is given.
    const supers = targets.filter((u) => u.role === 'SUPERADMIN');
    if (supers.length > 0 && !forceSuperadmin) {
      if (allExceptIdx !== -1) {
        console.log(`• preserving SUPERADMIN(s): ${supers.map((u) => u.email).join(', ')}`);
        targets = targets.filter((u) => u.role !== 'SUPERADMIN');
      } else {
        console.error(
          `Refusing to delete SUPERADMIN(s): ${supers.map((u) => u.email).join(', ')}.\n` +
            `Add --force-superadmin if you really mean it (you may lock yourself out).`,
        );
        return 1;
      }
    }

    if (targets.length === 0) {
      console.log('Nothing to delete (only protected accounts matched).');
      return 0;
    }

    console.log(
      `${dryRun ? '[DRY-RUN] ' : ''}Deleting ${targets.length} user(s): ${targets
        .map((u) => u.email)
        .join(', ')}`,
    );
    if (dryRun) {
      console.log('No writes performed (--dry-run).');
      return 0;
    }

    let ok = 0;
    for (const u of targets) {
      await prisma.$transaction(async (tx) => {
        const orgs = await tx.organization.findMany({
          where: { ownerId: u.id },
          select: { id: true },
        });
        const orgIds = orgs.map((o) => o.id);
        if (orgIds.length > 0) {
          // Invitation has no FK relation — clean it manually first.
          await tx.invitation.deleteMany({ where: { organizationId: { in: orgIds } } });
          await tx.organization.deleteMany({ where: { id: { in: orgIds } } }); // cascades the rest
        }
        await tx.invitation.deleteMany({ where: { invitedByUserId: u.id } });
        await tx.adminAction.deleteMany({ where: { actorId: u.id } });
        await tx.withdrawal.deleteMany({ where: { userId: u.id } });
        await tx.user.delete({ where: { id: u.id } });
      });
      ok += 1;
      console.log(`✓ deleted ${u.email}`);
    }
    console.log(`Done — ${ok}/${targets.length} user(s) deleted.`);
    return 0;
  } finally {
    if (!deps.prisma && prismaClient) await prismaClient.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
