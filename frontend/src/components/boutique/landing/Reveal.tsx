'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  className?: string;
}

/**
 * Révélation au défilement (sobre) pour les sections de la landing.
 * Robuste : rendu VISIBLE par défaut (SSR / sans JS / reduced-motion → aucun
 * contenu masqué, bon pour le SEO). Côté client uniquement, un élément situé
 * SOUS la ligne de flottaison est masqué puis ré-affiché en fondu quand il
 * entre dans le viewport. Les éléments déjà visibles ne sont jamais animés.
 */
export default function Reveal({ children, className }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') return;
    // Déjà à l'écran au chargement → on laisse visible, pas d'animation.
    if (el.getBoundingClientRect().top < window.innerHeight - 40) return;
    setHidden(true);
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          setHidden(false);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? 'translateY(16px)' : 'none',
        transition:
          'opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {children}
    </div>
  );
}
