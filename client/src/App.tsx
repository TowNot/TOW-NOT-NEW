import { IncidentDesk } from "./pages/IncidentDesk";
import { LandingPage } from "./pages/LandingPage";

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return <LandingPage />;
  return <IncidentDesk />;
}
