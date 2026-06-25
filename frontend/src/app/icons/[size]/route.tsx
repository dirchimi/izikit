import { appIcon } from '@/lib/pwa/app-icon';

// Icônes du manifeste PWA : /icons/192 et /icons/512 (PNG générés via next/og).
export const runtime = 'nodejs';

const ALLOWED: Record<string, number> = { '192': 192, '512': 512 };

export function generateStaticParams() {
  return Object.keys(ALLOWED).map((size) => ({ size }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> },
): Promise<Response> {
  const { size } = await params;
  return appIcon(ALLOWED[size] ?? 512);
}
