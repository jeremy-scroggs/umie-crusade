import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

/**
 * Labeled text input atom. Mobile-first: 44px min touch height, full-width.
 * Renders an `aria-describedby` error region so assistive tech surfaces
 * validation feedback alongside the visual red text.
 */
export function TextInput({
  label,
  error,
  id,
  className = '',
  ...rest
}: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-mono text-white/80">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        className={`min-h-[44px] w-full rounded-md bg-black/60 px-3 py-2 font-mono text-base text-white border border-white/20 focus:border-red-500 focus:outline-none ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
      {error ? (
        <span id={errorId} role="alert" className="text-sm text-red-400">
          {error}
        </span>
      ) : null}
    </div>
  );
}
