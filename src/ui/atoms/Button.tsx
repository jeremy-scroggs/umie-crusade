import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-red-700 hover:bg-red-600 disabled:bg-red-900 disabled:text-white/50 text-white',
  ghost:
    'bg-transparent hover:bg-white/10 text-white border border-white/30',
};

/**
 * Primary action atom. Mobile-first: `min-h-[44px]` satisfies iOS tap-target
 * guidance; full-width by default since hero-create is a single-column flow.
 */
export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`min-h-[44px] w-full rounded-md px-4 py-2 font-mono text-base transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
