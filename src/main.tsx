import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Radix Themes base stylesheet + IBM Plex Sans (source.coop's body font). The
// font is loaded via @fontsource (Vite-friendly) instead of next/font — this is
// a Vite SPA, not a Next app. Weights 400/500/600/700 match source.coop.
import "@radix-ui/themes/styles.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
