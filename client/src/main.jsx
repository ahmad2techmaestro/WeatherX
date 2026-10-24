import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/hanken-grotesk";

import "./services/apiClient";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/scene.css";
import "./styles/ui.css";
import "./styles/layout.css";
import "./styles/pages.css";
import "./styles/depth.css";
import "./styles/tailwind.css";
import "./styles/premium.css";
import "./styles/map.css";
import "./styles/auth.css";
import "./styles/pages2.css";
import "./styles/today.css";

import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";
import { PlacesProvider } from "./context/PlacesContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <PlacesProvider>
            <App />
          </PlacesProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
