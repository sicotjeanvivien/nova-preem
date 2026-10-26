import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/chakra-petch/latin-500.css";
import "@fontsource/chakra-petch/latin-600.css";
import "@fontsource/chakra-petch/latin-700.css";
import "@fontsource/chakra-petch/latin-ext-600.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-ext-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./ui/styles/tokens.css";
import "./ui/styles/app.css";
import { createBrowserServices } from "./platform/services.ts";
import { registerServiceWorker } from "./platform/serviceWorker.ts";
import { App } from "./ui/App.tsx";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App services={createBrowserServices()} />
  </StrictMode>,
);
