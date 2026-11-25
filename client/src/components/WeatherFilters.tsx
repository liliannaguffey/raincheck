import type { HazardCategory } from "@raincheck/shared";
import {
  CloudFog,
  CloudLightning,
  CloudRain,
  Snowflake,
  Wind,
} from "lucide-react";
import { Button } from "./ui";

const categories = [
  { id: "rain", label: "Rain", Icon: CloudRain },
  { id: "snow-ice", label: "Snow and ice", Icon: Snowflake },
  { id: "visibility", label: "Fog and reduced visibility", Icon: CloudFog },
  { id: "thunderstorms", label: "Thunderstorms", Icon: CloudLightning },
  { id: "winds", label: "Strong winds", Icon: Wind },
] as const;

export function WeatherFilters({
  selected,
  onToggle,
  onReset,
}: {
  selected: ReadonlySet<HazardCategory>;
  onToggle: (category: HazardCategory) => void;
  onReset: () => void;
}) {
  return (
    <fieldset className="mt-5 border-t border-line pt-3">
      <legend className="pr-2 text-sm font-semibold">Weather filters</legend>
      <div className="flex flex-wrap gap-2">
        <Button
          tone={selected.size ? "secondary" : "primary"}
          aria-pressed={!selected.size}
          onClick={onReset}
        >
          Show all
        </Button>
        {categories.map(({ id, label, Icon }) => (
          <Button
            key={id}
            tone={selected.has(id) ? "primary" : "secondary"}
            aria-pressed={selected.has(id)}
            onClick={() => onToggle(id)}
          >
            <Icon size={16} aria-hidden="true" /> {label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">
        Filters focus the map, timeline, and advisories. The overall route
        assessment still includes every category.
      </p>
    </fieldset>
  );
}
