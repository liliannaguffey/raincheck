import type { RoutePlace } from "@raincheck/shared";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPlaceSearch } from "../maps/places";
import type { PlaceSuggestion } from "../maps/places";
import { Field } from "./Field";

interface LocationFieldProps {
  id: string;
  label: string;
  placeholder?: string;
  selected?: RoutePlace;
  error?: string;
  required?: boolean;
  onSelection: (place?: RoutePlace) => void;
}

export function LocationField({
  id,
  label,
  placeholder,
  selected,
  error,
  required,
  onSelection,
}: LocationFieldProps) {
  const [input, setInput] = useState(selected?.address ?? "");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [feedback, setFeedback] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [service] = useState(createPlaceSearch);
  const revision = useRef(0);
  const list = `${id}-suggestions`;
  const status = `${id}-status`;

  useEffect(() => {
    return () => {
      revision.current++;
      service.reset();
    };
  }, [service]);

  useEffect(() => {
    if (!open || selected || selecting || input.trim().length < 3) return;
    let current = true;
    const timeout = window.setTimeout(async () => {
      try {
        const results = await service.search(input.trim());
        if (!current) return;
        setSuggestions(results);
        setFeedback(
          results.length ? "" : "No locations found. Try another search.",
        );
      } catch {
        if (current)
          setFeedback(
            "Google Maps suggestions are unavailable. Check Maps setup or try again.",
          );
      }
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timeout);
    };
  }, [input, open, selected, selecting, service]);

  useEffect(() => {
    if (active >= 0)
      document
        .getElementById(`${list}-${active}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [active, list]);

  function close() {
    setOpen(false);
    setSuggestions([]);
    setActive(-1);
    service.reset();
  }

  async function select(suggestion: PlaceSuggestion) {
    const current = ++revision.current;
    close();
    setSelecting(true);
    setFeedback("Loading location…");
    try {
      const place = await suggestion.select();
      if (current !== revision.current) return;
      setInput(place.address);
      setFeedback("");
      onSelection(place);
    } catch {
      if (current === revision.current)
        setFeedback("This location could not be selected. Search again.");
    } finally {
      if (current === revision.current) setSelecting(false);
    }
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    } else if (
      (event.key === "ArrowDown" || event.key === "ArrowUp") &&
      suggestions.length
    ) {
      event.preventDefault();
      setActive((index) =>
        event.key === "ArrowDown"
          ? (index + 1) % suggestions.length
          : index <= 0
            ? suggestions.length - 1
            : index - 1,
      );
    } else if (event.key === "Enter" && open && suggestions[active]) {
      event.preventDefault();
      void select(suggestions[active]);
    }
  }

  const expanded = open && suggestions.length > 0;
  return (
    <div className="relative">
      <Field
        id={id}
        name={id}
        label={label}
        placeholder={placeholder}
        required={required}
        error={error}
        autoComplete="off"
        value={input}
        maxLength={512}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? list : undefined}
        aria-activedescendant={
          expanded && active >= 0 ? `${list}-${active}` : undefined
        }
        aria-describedby={feedback ? status : undefined}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={handleKey}
        onChange={(event) => {
          revision.current++;
          setSelecting(false);
          setInput(event.target.value);
          onSelection(undefined);
          setActive(-1);
          setSuggestions([]);
          setFeedback("");
          setOpen(true);
          if (event.target.value.trim().length < 3) service.reset();
        }}
      >
        {expanded && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
            <ul
              id={list}
              role="listbox"
              aria-label={`${label} suggestions`}
              className="max-h-56 overflow-y-auto"
            >
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.id}
                  id={`${list}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className="cursor-pointer border-b border-line px-3 py-2 hover:bg-teal-50 aria-selected:bg-teal-50"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void select(suggestion)}
                >
                  {suggestion.text}
                </li>
              ))}
            </ul>
            <p
              className="px-3 py-2 text-xs font-medium text-muted"
              translate="no"
            >
              Google Maps
            </p>
          </div>
        )}
        <span
          id={status}
          role="status"
          className={feedback ? "text-sm text-muted" : "sr-only"}
        >
          {feedback}
        </span>
      </Field>
    </div>
  );
}
