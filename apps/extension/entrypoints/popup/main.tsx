/**
 * DealPilot Popup 入口
 *
 * 加载 React 并渲染 App。
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "../../src/assets/design-tokens.css";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
