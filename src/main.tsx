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
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
