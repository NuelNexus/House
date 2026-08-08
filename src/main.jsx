import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { appwrite } from "./lib/appwrite";
import "./styles/global.css";

// Appwrite setup check: ping the backend every time the app opens to
// verify the SDK + project are wired up correctly (added as part of the
// Appwrite onboarding setup). Failures are logged, never crash the app.
appwrite
  .ping()
  .then(() => console.info("[appwrite] backend reachable"))
  .catch(() => console.warn("[appwrite] ping failed — backend unreachable"));

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
