import type { ReactNode } from 'react';

export type CardProps = { title: string; children?: ReactNode };

export function Card({ title, children }: CardProps) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function useCardState(initial = false) {
  return initial;
}
