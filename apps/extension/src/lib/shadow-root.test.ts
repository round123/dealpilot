import { afterEach, describe, expect, test } from "bun:test";

import {
  createShadowHost,
  getMountPoint,
  removeShadowHost,
} from "../../entrypoints/content/shadow-root";

const originalDocument = globalThis.document;

afterEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
    writable: true,
  });
});

describe("Content Script Shadow DOM boundary", () => {
  test("keeps rendered CRM text inside an extension-only closed root", () => {
    const document = new FakeDocument();
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: document,
      writable: true,
    });

    const { host, shadow } = createShadowHost();
    const mountPoint = getMountPoint(shadow);
    const sensitiveText =
      "客户：北风贸易；最近跟进：已发送报价；提醒：明天回访";

    mountPoint.textContent = sensitiveText;

    expect(host.shadowRoot).toBeNull();
    expect(host.shadowRoot?.textContent).toBeUndefined();
    expect(getMountPoint(shadow).textContent).toBe(sensitiveText);
    expect(createShadowHost()).toEqual({ host, shadow });

    removeShadowHost();
    expect(document.getElementById("dealpilot-float-host")).toBeNull();
  });
});

class FakeNode {
  textContent: string | null = null;
  readonly children: FakeElement[] = [];

  appendChild<T extends FakeElement>(child: T): T {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  findById(id: string): FakeElement | null {
    for (const child of this.children) {
      if (child.id === id) return child;
      const nested = child.findById(id);
      if (nested) return nested;
    }
    return null;
  }
}

class FakeShadowRoot extends FakeNode {
  getElementById(id: string): FakeElement | null {
    return this.findById(id);
  }
}

class FakeElement extends FakeNode {
  id = "";
  parent: FakeNode | null = null;
  shadowRoot: FakeShadowRoot | null = null;
  private closedShadowRoot: FakeShadowRoot | null = null;

  attachShadow(init: ShadowRootInit): FakeShadowRoot {
    const shadow = new FakeShadowRoot();
    if (init.mode === "open") this.shadowRoot = shadow;
    else this.closedShadowRoot = shadow;
    return shadow;
  }

  setAttribute(): void {}

  remove(): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }
}

class FakeDocument {
  readonly body = new FakeElement();

  createElement(): FakeElement {
    return new FakeElement();
  }

  getElementById(id: string): FakeElement | null {
    return this.body.findById(id);
  }

  addEventListener(): void {}
}
