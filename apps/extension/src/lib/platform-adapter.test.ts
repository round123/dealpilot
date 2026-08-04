import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import {
  detectConversation,
  getPlatformAdapter,
  initializePlatformAdapter,
  type PlatformDomContext,
} from "./platform-adapter";

function fixture(url: string, body: string) {
  const fixtureWindow = new Window({ url });
  fixtureWindow.document.body.innerHTML = body;
  const context = {
    window: fixtureWindow as unknown as Window & globalThis.Window,
    document: fixtureWindow.document as unknown as Document,
  } satisfies PlatformDomContext;
  return { fixtureWindow, context };
}

describe("WhatsApp Web DOM adapter", () => {
  test("parses a phone-backed 1:1 chat and an inbound multiline reply", () => {
    const { context } = fixture(
      "https://web.whatsapp.com/#/chat/861380001234",
      `
        <header data-testid="conversation-header" data-chat-id="861380001234@c.us">
          <span title="+86 138 0001 1234"></span>
        </header>
        <div class="message-in" aria-selected="true">
          <div data-testid="quoted-message">
            <span class="selectable-text copyable-text">Old quoted text</span>
          </div>
          <span class="selectable-text copyable-text">First line<br>Second line</span>
          <time datetime="2026-08-01T08:30:00+08:00">08:30</time>
        </div>
      `,
    );

    expect(detectConversation(context)).toEqual({
      platform: "whatsapp",
      conversationName: "+86 138 0001 1234",
      rawIdentifier: "861380001234",
      normalizedIdentifier: "861380001234",
      isOneOnOne: true,
      conversationType: "one_on_one",
    });
    expect(getPlatformAdapter(context)?.getSelectedMessage()).toEqual({
      body: "First line\nSecond line",
      direction: "inbound",
      timestamp: "2026-08-01T00:30:00.000Z",
    });
  });

  test("keeps a named contact distinct and reads an outbound epoch timestamp", () => {
    const epoch = 1_722_501_000_000;
    const { context } = fixture(
      "https://web.whatsapp.com/",
      `
        <header data-testid="conversation-header" data-chat-type="contact"><span title="Alice Zhang"></span></header>
        <div class="message-out selected" data-timestamp="${epoch}">
          <div data-testid="message-text">Sent message</div>
        </div>
      `,
    );

    expect(detectConversation(context)).toMatchObject({
      rawIdentifier: "Alice Zhang",
      normalizedIdentifier: "name:alice zhang",
      isOneOnOne: true,
    });
    expect(getPlatformAdapter(context)?.getSelectedMessage()).toEqual({
      body: "Sent message",
      direction: "outbound",
      timestamp: new Date(epoch).toISOString(),
    });
  });

  test("rejects groups even when a message element is selected", () => {
    const { context } = fixture(
      "https://web.whatsapp.com/",
      `
        <header data-testid="conversation-header" data-chat-id="120363001@g.us">
          <span title="Sales team"></span>
        </header>
        <div class="message-in selected"><span data-testid="message-text">Group text</span></div>
      `,
    );
    const adapter = getPlatformAdapter(context);

    expect(adapter?.getConversation()).toMatchObject({
      conversationType: "group",
      isOneOnOne: false,
    });
    expect(adapter?.getSelectedMessage()).toBeNull();
  });

  test("does not turn an image-only message into a text follow-up", () => {
    const { context } = fixture(
      "https://web.whatsapp.com/",
      `
        <header data-testid="conversation-header" data-chat-type="contact"><span title="Alice"></span></header>
        <div class="message-in selected"><img alt="photo" src="photo.jpg"></div>
      `,
    );

    expect(getPlatformAdapter(context)?.getSelectedMessage()).toBeNull();
  });

  test("remembers the first message interaction before the adapter is requested", () => {
    const { fixtureWindow, context } = fixture(
      "https://web.whatsapp.com/",
      `
        <header data-testid="conversation-header" data-chat-type="contact">
          <span title="Alice"></span>
        </header>
        <div id="first-message" class="message-in">
          <span data-testid="message-text">First interaction</span>
        </div>
      `,
    );

    initializePlatformAdapter(context);
    context.document
      .querySelector("#first-message")
      ?.dispatchEvent(
        new fixtureWindow.Event("pointerdown", { bubbles: true }),
      );

    expect(getPlatformAdapter(context)?.getSelectedMessage()).toMatchObject({
      body: "First interaction",
      direction: "inbound",
    });
  });

  test("fails closed for an ambiguous header that could be a group", () => {
    const { context } = fixture(
      "https://web.whatsapp.com/",
      `
        <header data-testid="conversation-header"><span title="Project Alpha"></span></header>
        <div class="message-in selected"><span data-testid="message-text">Ambiguous text</span></div>
      `,
    );
    const adapter = getPlatformAdapter(context);

    expect(adapter?.getConversation()).toMatchObject({
      conversationType: "unknown",
      isOneOnOne: false,
    });
    expect(adapter?.getSelectedMessage()).toBeNull();
  });
});

describe("Telegram Web DOM adapter", () => {
  test("parses the K route username and an inbound multiline reply", () => {
    const { context } = fixture(
      "https://web.telegram.org/k/#@buyer_team",
      `
        <div class="chat-header">
          <div class="header-title-name">Buyer</div>
          <div class="header-title-subtitle">last seen recently</div>
        </div>
        <div class="Message incoming" aria-selected="true">
          <div class="ReplyPreview"><div class="message-text">Quoted text</div></div>
          <div class="message-text">Need 20 units<br>by Friday</div>
          <time datetime="2026-08-02T10:15:00Z">10:15</time>
        </div>
      `,
    );

    expect(detectConversation(context)).toEqual({
      platform: "telegram",
      conversationName: "Buyer",
      rawIdentifier: "@buyer_team",
      normalizedIdentifier: "buyer_team",
      isOneOnOne: true,
      conversationType: "one_on_one",
    });
    expect(getPlatformAdapter(context)?.getSelectedMessage()).toEqual({
      body: "Need 20 units\nby Friday",
      direction: "inbound",
      timestamp: "2026-08-02T10:15:00.000Z",
    });
  });

  test("parses the A route numeric id and an outgoing message", () => {
    const epochSeconds = 1_722_600_000;
    const { context } = fixture(
      "https://web.telegram.org/a/#123456789",
      `
        <div class="ChatInfo" data-peer-type="user"><h3>Procurement Lead</h3></div>
        <div class="message-list-item own is-selected" data-timestamp="${epochSeconds}">
          <div class="text-content">I will send the quote.</div>
        </div>
      `,
    );

    expect(detectConversation(context)).toMatchObject({
      rawIdentifier: "123456789",
      normalizedIdentifier: "123456789",
      isOneOnOne: true,
    });
    expect(getPlatformAdapter(context)?.getSelectedMessage()).toEqual({
      body: "I will send the quote.",
      direction: "outbound",
      timestamp: new Date(epochSeconds * 1000).toISOString(),
    });
  });

  test("rejects group and channel metadata", () => {
    for (const fixtureCase of [
      { type: "group", subtitle: "32 members", hash: "#-100111" },
      { type: "channel", subtitle: "2,400 subscribers", hash: "#news" },
    ] as const) {
      const { context } = fixture(
        `https://web.telegram.org/k/${fixtureCase.hash}`,
        `
          <div class="chat-header" data-peer-type="${fixtureCase.type}">
            <div class="header-title-name">Updates</div>
            <div class="header-title-subtitle">${fixtureCase.subtitle}</div>
          </div>
          <div class="Message incoming selected"><div class="message-text">Not allowed</div></div>
        `,
      );
      const adapter = getPlatformAdapter(context);

      expect(adapter?.getConversation()).toMatchObject({
        conversationType: fixtureCase.type,
        isOneOnOne: false,
      });
      expect(adapter?.getSelectedMessage()).toBeNull();
    }
  });

  test("keeps display-only times null and ignores non-text messages", () => {
    const textFixture = fixture(
      "https://web.telegram.org/k/#@buyer",
      `
        <div class="chat-header" data-peer-type="user"><div class="header-title-name">Buyer</div></div>
        <div class="Message incoming selected">
          <div class="message-text">No absolute timestamp</div><time>09:30</time>
        </div>
      `,
    );
    expect(
      getPlatformAdapter(textFixture.context)?.getSelectedMessage()?.timestamp,
    ).toBeNull();

    const mediaFixture = fixture(
      "https://web.telegram.org/k/#@buyer",
      `
        <div class="chat-header" data-peer-type="user"><div class="header-title-name">Buyer</div></div>
        <div class="Message incoming selected"><video src="clip.mp4"></video></div>
      `,
    );
    expect(
      getPlatformAdapter(mediaFixture.context)?.getSelectedMessage(),
    ).toBeNull();
  });

  test("fails closed for an ambiguous header that could be a public group", () => {
    const { context } = fixture(
      "https://web.telegram.org/k/#project_alpha",
      `
        <div class="chat-header"><div class="header-title-name">Project Alpha</div></div>
        <div class="Message incoming selected"><div class="message-text">Ambiguous text</div></div>
      `,
    );
    const adapter = getPlatformAdapter(context);

    expect(adapter?.getConversation()).toMatchObject({
      conversationType: "unknown",
      isOneOnOne: false,
    });
    expect(adapter?.getSelectedMessage()).toBeNull();
  });
});

describe("SPA conversation boundary", () => {
  test("does not reuse an interacted message after the active chat changes", () => {
    const { fixtureWindow, context } = fixture(
      "https://web.telegram.org/k/#@alice",
      `
        <div class="chat-header" data-peer-type="user"><div class="header-title-name">Alice</div></div>
        <div id="alice-message" class="Message incoming">
          <div class="message-text">Alice's message</div>
        </div>
      `,
    );
    const adapter = getPlatformAdapter(context);
    const aliceMessage = context.document.querySelector("#alice-message");
    aliceMessage?.dispatchEvent(
      new fixtureWindow.Event("pointerdown", { bubbles: true }),
    );
    expect(adapter?.getSelectedMessage()?.body).toBe("Alice's message");

    fixtureWindow.location.hash = "#@bob";
    const title = context.document.querySelector(".header-title-name");
    if (title) title.textContent = "Bob";

    expect(aliceMessage?.isConnected).toBe(true);
    expect(detectConversation(context)).toMatchObject({
      normalizedIdentifier: "bob",
    });
    expect(adapter?.getSelectedMessage()).toBeNull();
  });
});
