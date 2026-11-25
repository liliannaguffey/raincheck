import {
  severityOrder,
  severityPresentation,
} from "../weather/severityPresentation";

export function SeverityLegend() {
  return (
    <div className="mt-4">
      <ul
        aria-label="Route weather legend"
        className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink"
      >
        {severityOrder.map((severity) => {
          const { label, color, symbol } = severityPresentation[severity];
          return (
            <li key={severity} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="grid size-5 place-items-center rounded bg-white text-xs font-bold"
                style={{ color, border: `1px solid ${color}` }}
              >
                {symbol}
              </span>
              {label}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-muted">
        Colors estimate weather between samples. Actual road conditions may
        differ.
      </p>
    </div>
  );
}
