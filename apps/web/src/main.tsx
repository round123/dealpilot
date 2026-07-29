import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@/styles/globals.css";
import { setToken } from "@/lib/api-client";

const url = new URL(window.location.href);
const bootstrapToken = url.searchParams.get("token");
if (bootstrapToken) {
  setToken(bootstrapToken);
  url.searchParams.delete("token");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
