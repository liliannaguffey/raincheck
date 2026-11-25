import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
let configured = false;
let authFailed = false;
const authListeners = new Set<() => void>();

export function onMapsAuthFailure(listener: () => void) {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export async function mapsLibrary<
  T extends Parameters<typeof importLibrary>[0],
>(name: T) {
  if (!key) throw new Error("Google Maps needs a browser API key.");
  if (authFailed)
    throw new Error("Google Maps rejected the browser credentials.");
  if (!configured) {
    const browser = window as Window & { gm_authFailure?: () => void };
    browser.gm_authFailure = () => {
      authFailed = true;
      for (const listener of authListeners) listener();
    };
    setOptions({ key, v: "weekly" });
    configured = true;
  }

  return new Promise<google.maps.ImportLibraryMap[T]>((resolve, reject) => {
    const off = onMapsAuthFailure(() =>
      reject(new Error("Google Maps rejected the browser credentials.")),
    );
    const timeout = window.setTimeout(() => {
      off();
      reject(new Error("Google Maps took too long to load."));
    }, 12000);
    void importLibrary(name)
      .then(resolve, reject)
      .finally(() => {
        window.clearTimeout(timeout);
        off();
      });
  });
}
