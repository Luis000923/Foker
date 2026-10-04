import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
}

/** Botón base del sistema de diseño. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', ...props },
  ref,
) {
  return <button ref={ref} data-variant={variant} {...props} />;
});
