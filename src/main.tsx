import React from "react";
import ReactDOM from "react-dom/client";
import { Toast } from "@heroui/react";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Toast.Provider placement="top end" />
    <App />
  </React.StrictMode>,
);
