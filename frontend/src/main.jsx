import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
// Registers credartResetCatalogue() + handles ?reset — must run before React
// mounts, i.e. before any component reads the catalogue's localStorage state.
import "./lib/resetCatalogue.js";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
