import type { ComponentProps } from "react";

interface FieldProps extends ComponentProps<"input"> {
  label: string;
  id: string;
  error?: string;
}

export function Field({ label, id, error, children, ...props }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [error && `${id}-error`, props["aria-describedby"]]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      {children}
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
