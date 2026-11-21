import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./hooks/AppContext";
import "./styles.css";
if (location.hash.startsWith("#invite=")) {
  sessionStorage.setItem(
    "ours-invite",
    decodeURIComponent(location.hash.slice(8)),
  );
  history.replaceState(null, "", location.pathname + location.search);
}
if (location.search.includes("_v=")) {
  const cleaned = new URL(location.href);
  cleaned.searchParams.delete("_v");
  history.replaceState(
    null,
    "",
    cleaned.pathname + cleaned.search + cleaned.hash,
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
