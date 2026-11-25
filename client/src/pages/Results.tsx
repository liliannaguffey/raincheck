import { ActionLink } from "../components/ui";

export function Results() {
  return (
    <section className="container-shell page-section">
      <h1 className="page-title">Trip results</h1>
      <p className="mt-2 text-muted">Start in the planner to preview a trip.</p>
      <ActionLink className="mt-5" to="/">
        Open trip planner
      </ActionLink>
    </section>
  );
}
