import { createTestAuthProvider, StoryWrapper } from "@/test/StoryWrapper";
import type { AuthProvider, UserIdentity } from "ra-core";
import { useReducer } from "react";
import { flushSync } from "react-dom";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { ContactCreateSheet } from "./ContactCreateSheet";

let refreshIdentityHarness: () => void = () => undefined;

const IdentityHarness = () => {
  const [, refreshIdentity] = useReducer((value) => value + 1, 0);
  refreshIdentityHarness = refreshIdentity;

  return <ContactCreateSheet open onOpenChange={vi.fn()} />;
};

describe("ContactCreateSheet", () => {
  beforeAll(() => {
    page.viewport(1600, 900);
  });

  it("waits for identity loading before mounting a stable form", async () => {
    let resolveIdentity: (identity: UserIdentity) => void = () => undefined;
    const identityPromise = new Promise<UserIdentity>((resolve) => {
      resolveIdentity = resolve;
    });
    const authProvider: AuthProvider = {
      ...createTestAuthProvider(),
      getIdentity: () => identityPromise,
    };
    const screen = await render(
      <StoryWrapper authProvider={authProvider}>
        <IdentityHarness />
      </StoryWrapper>,
    );

    expect(screen.getByRole("dialog").query()).toBeNull();
    expect(
      screen.container.querySelector('input[name="first_name"]'),
    ).toBeNull();

    resolveIdentity({ id: 0, fullName: "Test User" });

    await expect.element(screen.getByRole("dialog")).toBeInTheDocument();

    const firstName = screen.getByLabelText(/first name/i);
    const lastName = screen.getByLabelText(/last name/i);
    await firstName.fill("Ada");
    await lastName.fill("Lovelace");

    flushSync(() => refreshIdentityHarness());

    await expect.element(screen.getByRole("dialog")).toBeInTheDocument();
    await expect.element(firstName).toHaveValue("Ada");
    await expect.element(lastName).toHaveValue("Lovelace");
  });

  it("mounts after identity loading completes without an identity", async () => {
    const authProvider = {
      ...createTestAuthProvider(),
      getIdentity: async () => undefined as unknown as UserIdentity,
    };

    const screen = await render(
      <StoryWrapper authProvider={authProvider}>
        <ContactCreateSheet open onOpenChange={vi.fn()} />
      </StoryWrapper>,
    );

    await expect.element(screen.getByRole("dialog")).toBeInTheDocument();
    await expect
      .element(screen.getByLabelText(/first name/i))
      .toBeInTheDocument();
  });
});
