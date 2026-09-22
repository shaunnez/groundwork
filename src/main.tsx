import React from "react";
import { createRoot } from "react-dom/client";
import { LocalApp } from "./LocalApp.tsx";
import { App } from "./App.tsx";
import { WorkspaceApp } from "./workspace/WorkspaceApp.tsx";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/source-serif-4/600.css";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {location.pathname.startsWith("/prototype") ? (
      <App />
    ) : location.pathname.startsWith("/diagnostics") ? (
      <LocalApp />
    ) : (
      <WorkspaceApp />
    )}
  </React.StrictMode>,
);
