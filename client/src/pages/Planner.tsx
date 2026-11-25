import { CloudSun, MapPin, Route } from "lucide-react";
import { Card } from "../components/ui";

export function Planner() {
  return (
    <>
      <section className="hero">
        <div className="container-shell hero-inner">
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-200">
            <Route size={18} aria-hidden="true" /> Road trip weather planner
          </div>
          <h1>Know what’s ahead.</h1>
          <p>
            Plan for the weather you could encounter along your drive, from
            departure to arrival.
          </p>
        </div>
      </section>
      <div className="container-shell planner-grid">
        <Card>
          <MapPin className="text-accent" aria-hidden="true" />
          <h2 className="section-title mt-3">Plan your trip</h2>
        </Card>
        <Card className="self-start">
          <CloudSun className="text-accent" aria-hidden="true" />
          <h2 className="section-title mt-3">Weather along the way</h2>
          <p className="mt-2 text-muted">
            RainCheck pairs estimated arrival times with forecasts at points
            along your drive.
          </p>
        </Card>
      </div>
    </>
  );
}
