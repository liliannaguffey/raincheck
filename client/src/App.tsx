import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { About, NotFound, SavedTrips } from "./pages/InfoPages";
import { Planner } from "./pages/Planner";
import { Results } from "./pages/Results";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Planner />} />
        <Route path="results" element={<Results />} />
        <Route path="saved" element={<SavedTrips />} />
        <Route path="about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
