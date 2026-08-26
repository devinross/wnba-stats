import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { SourceProvider } from "./PageSources.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Sections declare which wnba.com page they were built from; the provider
        collects those so the page can footnote them all in one place. */}
    <SourceProvider>
      <App />
    </SourceProvider>
  </React.StrictMode>
);
