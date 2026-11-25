import type { ComponentProps } from "react";

interface FieldProps extends ComponentProps<"input"> {
  label: string;
  id: string;
  error?: string;
}

export function Field({ label, id, error, ...props }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : props["aria-describedby"]}
      />
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
