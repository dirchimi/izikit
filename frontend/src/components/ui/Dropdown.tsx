'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';

export interface DropdownItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  /** Option actuellement sélectionnée → surbrillance + coche. */
  active?: boolean;
}

/**
 * Menu déroulant maison (charte Sahilley) : déclencheur libre, panneau animé,
 * fermeture au clic extérieur / Échap. Aligné à droite par défaut.
 */
export default function Dropdown({
  trigger,
  items,
  align = 'end',
  width = 'w-52',
}: {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end';
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={`animate-scale-in border-border bg-surface absolute ${
            align === 'end' ? 'end-0' : 'start-0'
          } z-50 mt-2 ${width} origin-top overflow-hidden rounded-xl border p-1 shadow-xl`}
        >
          {items.map((item, i) => (
            <button
              key={`${item.label}-${i}`}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`font-body flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm transition-colors ${
                item.danger
                  ? 'text-danger hover:bg-danger/10'
                  : item.active
                    ? 'bg-secondary text-secondary-foreground font-semibold'
                    : 'text-foreground hover:bg-muted'
              }`}
            >
              {item.icon && <Icon i={item.icon} size={15} className="shrink-0" />}
              <span className="flex-1 truncate">{item.label}</span>
              {item.active && <Icon i="check" size={15} className="text-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
