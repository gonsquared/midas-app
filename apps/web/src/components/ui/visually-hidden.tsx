import type { ElementType, ReactNode } from 'react';

/** Content for assistive technology only. Same technique as Tailwind's `sr-only`. */
export function VisuallyHidden({
  as: Tag = 'span',
  children,
}: {
  as?: ElementType;
  children: ReactNode;
}) {
  return <Tag className="sr-only">{children}</Tag>;
}
