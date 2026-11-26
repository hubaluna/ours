import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./hooks/AppContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";
if (location.hash.startsWith("#invite=")) {
  const inviteToken = decodeURIComponent(location.hash.slice(8));
  try {
    localStorage.setItem(
      "ours-invite-v1",
      JSON.stringify({ token: inviteToken, savedAt: Date.now() }),
    );
  } catch {
    sessionStorage.setItem("ours-invite", inviteToken);
  }
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
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  try {
    if (!sessionStorage.getItem("ours-chunk-reloaded")) {
      sessionStorage.setItem("ours-chunk-reloaded", "1");
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
});
window.addEventListener("error", (event) => {
  if (event.error) {
    console.error("[GlobalError]", event.error);
  }
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[UnhandledRejection]", event.reason);
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
