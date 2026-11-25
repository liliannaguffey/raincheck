import type { RoutePlace } from "@raincheck/shared";
import { mapsLibrary } from "./google";

export interface PlaceSuggestion {
  id: string;
  text: string;
  select: () => Promise<RoutePlace>;
}

export function createPlaceSearch() {
  let session: google.maps.places.AutocompleteSessionToken | undefined;
  let revision = 0;

  return {
    reset() {
      revision++;
      session = undefined;
    },

    async search(input: string): Promise<PlaceSuggestion[]> {
      const current = revision;
      const { AutocompleteSessionToken, AutocompleteSuggestion } =
        await mapsLibrary("places");
      if (current !== revision) return [];
      session ??= new AutocompleteSessionToken();
      const { suggestions } =
        await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          sessionToken: session,
        });
      return suggestions.flatMap(({ placePrediction }) => {
        if (!placePrediction) return [];
        return [
          {
            id: placePrediction.placeId,
            text: placePrediction.text.toString(),
            async select() {
              const place = placePrediction.toPlace();
              await place.fetchFields({
                fields: ["formattedAddress", "location"],
              });
              if (!place.location)
                throw new Error("This place has no coordinates.");
              return {
                placeId: placePrediction.placeId,
                address:
                  place.formattedAddress || placePrediction.text.toString(),
                coordinate: place.location.toJSON(),
              };
            },
          },
        ];
      });
    },
  };
}
