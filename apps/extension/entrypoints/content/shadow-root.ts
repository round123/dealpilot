/**
 * DealPilot 插件 Shadow DOM 创建和隔离逻辑
 *
 * 将 design-tokens 的 :host 变量注入 Shadow DOM，
 * 防止宿主页面样式污染。
 */

import designTokensCss from "../../src/assets/design-tokens.css?inline";

/** Shadow DOM 宿主元素 ID */
const HOST_ELEMENT_ID = "dealpilot-float-host";

/** Shadow DOM 宿主元素样式 */
const HOST_STYLE = `
  position: fixed;
  top: 80px;
  right: 16px;
  z-index: 2147483000;
  width: 320px;
  max-height: 480px;
`;

/**
 * 创建 Shadow DOM 宿主元素并挂载
 *
 * 返回 shadowRoot 和 host 元素。
 * 如果已存在则返回现有的。
 */
export function createShadowHost(): { host: HTMLElement; shadow: ShadowRoot } {
  // 检查是否已存在
  const existing = document.getElementById(HOST_ELEMENT_ID);
  if (existing && existing.shadowRoot) {
    return { host: existing, shadow: existing.shadowRoot };
  }

  // 创建宿主元素
  const host = document.createElement("div");
  host.id = HOST_ELEMENT_ID;
  host.setAttribute("style", HOST_STYLE);

  // 挂载到 body（等待 body 可用）
  if (document.body) {
    document.body.appendChild(host);
  } else {
    // body 尚未就绪，等待 DOMContentLoaded
    document.addEventListener("DOMContentLoaded", () => {
      document.body.appendChild(host);
    });
  }

  // 创建 Shadow DOM
  const shadow = host.attachShadow({ mode: "open" });

  // 注入 design tokens（:host 变量定义）
  const styleEl = document.createElement("style");
  styleEl.textContent = designTokensCss;
  shadow.appendChild(styleEl);

  // 注入隔离样式重置
  const resetStyle = document.createElement("style");
  resetStyle.textContent = `
    :host {
      all: initial;
      font-family: var(--dp-font-sans);
      color: var(--dp-color-text-primary);
      box-sizing: border-box;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
  `;
  shadow.appendChild(resetStyle);

  // 创建 React 挂载容器
  const container = document.createElement("div");
  container.id = "dealpilot-root";
  container.setAttribute(
    "style",
    "font-family: var(--dp-font-sans); width: 100%; min-height: 200px;",
  );
  shadow.appendChild(container);

  return { host, shadow };
}

/**
 * 移除 Shadow DOM 宿主元素
 */
export function removeShadowHost(): void {
  const host = document.getElementById(HOST_ELEMENT_ID);
  if (host) {
    host.remove();
  }
}

/**
 * 获取 Shadow DOM 内的 React 挂载点
 */
export function getMountPoint(shadow: ShadowRoot): HTMLElement {
  return shadow.getElementById("dealpilot-root") as HTMLElement;
}

/**
 * 在 Shadow DOM 内注入额外的 CSS
 */
export function injectShadowStyle(shadow: ShadowRoot, css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  shadow.appendChild(style);
}
