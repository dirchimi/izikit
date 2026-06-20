import type { ReactNode } from 'react';

/** En-tête de section landing : sur-titre (eyebrow) + titre + sous-titre optionnel, centré. */
export default function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="text-primary font-body text-xs font-semibold tracking-widest uppercase">
        {eyebrow}
      </span>
      <h2 className="font-headings text-foreground max-w-[640px] text-3xl font-bold md:text-[36px]">
        {title}
      </h2>
      {subtitle && (
        <p className="text-muted-foreground font-body max-w-[560px] text-base">{subtitle}</p>
      )}
    </div>
  );
}
