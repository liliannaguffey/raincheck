import { ArrowLeft, Bookmark, CloudSun } from "lucide-react";
import { ActionLink, Card } from "../components/ui";

export function SavedTrips() {
  return (
    <section className="container-shell page-section">
      <h1 className="page-title">Saved trips</h1>
      <Card className="mt-6">
        <Bookmark className="text-accent" aria-hidden="true" />
        <h2 className="section-title mt-3">Trip saving is coming later</h2>
        <p className="mt-2 text-muted">
          Use the trip planner to calculate a driving route.
        </p>
        <ActionLink className="mt-5" to="/">
          Open trip planner
        </ActionLink>
      </Card>
    </section>
  );
}

export function About() {
  return (
    <section className="container-shell page-section">
      <h1 className="page-title">About RainCheck</h1>
      <Card className="mt-6">
        <CloudSun className="text-accent" aria-hidden="true" />
        <h2 className="section-title mt-3">How route weather works</h2>
        <p className="mt-2 max-w-prose text-muted">
          RainCheck is designed to estimate where you’ll be at different points
          on your drive and match those arrival times to available forecasts.
          The planned integrations use Google Maps for driving routes and
          OpenWeather for forecasts.
        </p>
      </Card>
    </section>
  );
}

export function NotFound() {
  return (
    <section className="container-shell page-section">
      <h1 className="page-title">Page not found</h1>
      <ActionLink className="mt-5" to="/">
        <ArrowLeft size={18} aria-hidden="true" /> Back to planner
      </ActionLink>
    </section>
  );
}
