import { render } from "vitest-browser-react";

import { ContactCreateBasic } from "./ContactCreate.stories";
import { page } from "vitest/browser";
import { AGENT_CRM_CAPABILITIES } from "../providers/capabilities";
import {
  applyContactCapabilities,
  cleanupContactForCreate,
} from "./contactModel";

describe("ContactCreate", () => {
  beforeAll(() => {
    page.viewport(1600, 900);
  });
  it("shows empty email and phone placeholder inputs", async () => {
    const screen = await render(<ContactCreateBasic />);

    await expect.element(screen.getByPlaceholder("Email")).toBeInTheDocument();
    await expect
      .element(screen.getByPlaceholder("Phone number"))
      .toBeInTheDocument();
  });

  it("shows only Agent-supported fields with one email and phone", async () => {
    const screen = await render(
      <ContactCreateBasic
        dataProvider={{ capabilities: AGENT_CRM_CAPABILITIES }}
      />,
    );

    await expect
      .poll(() => screen.container.querySelector('input[name="name"]'))
      .not.toBeNull();
    expect(
      screen.container.querySelector('input[name="first_name"]'),
    ).toBeNull();
    expect(
      screen.container.querySelector('input[name="last_name"]'),
    ).toBeNull();
    await expect
      .poll(() => screen.getByPlaceholder("Email").all().length)
      .toBe(1);
    await expect
      .poll(() => screen.getByPlaceholder("Phone number").all().length)
      .toBe(1);
    expect(
      screen.container.querySelector('input[name="linkedin_url"]'),
    ).toBeNull();
  });

  it("strips unsupported fields and extra email or phone values", () => {
    const result = applyContactCapabilities(
      cleanupContactForCreate({
        first_name: "Ada",
        last_name: "Lovelace",
        title: "CTO",
        company_id: 1,
        email_jsonb: [
          { email: "ada@example.com", type: "Work" },
          { email: "other@example.com", type: "Other" },
        ],
        phone_jsonb: [
          { number: "123", type: "Work" },
          { number: "456", type: "Other" },
        ],
        background: "unsupported",
        tags: [1],
      } as any),
      AGENT_CRM_CAPABILITIES,
    );

    expect(result).toEqual({
      name: "Ada Lovelace",
      title: "CTO",
      company_id: 1,
      email_jsonb: [{ email: "ada@example.com", type: "Work" }],
      phone_jsonb: [{ number: "123", type: "Work" }],
    });
  });

  it("does not submit empty email and phone entries", async () => {
    const createMock = vi
      .fn()
      .mockImplementation(async (resource: string, params: any) => {
        if (resource === "contacts") {
          return { data: { id: 1, ...params.data } as any };
        }
      });

    const screen = await render(
      <ContactCreateBasic silent dataProvider={{ create: createMock }} />,
    );

    await expect.element(screen.getByPlaceholder("Email")).toBeInTheDocument();

    // Fill required fields only
    await screen.getByLabelText(/first name/i).fill("Ada");
    await screen.getByLabelText(/last name/i).fill("Lovelace");

    await screen.getByRole("button", { name: /^save$/i }).click();

    await expect
      .poll(() => screen.getByText("Element created"))
      .toBeInTheDocument();
    await screen.getByLabelText("Close toast").click();

    await expect(createMock).toBeCalledTimes(1);

    await expect(createMock).toBeCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          email_jsonb: null,
          phone_jsonb: null,
        }),
      }),
    );
  });

  it("submits only filled email and phone entries, stripping empty ones", async () => {
    const createMock = vi.fn().mockResolvedValue({ data: {} });
    const screen = await render(
      <ContactCreateBasic
        dataProvider={{
          create: createMock,
        }}
        silent
      />,
    );

    await expect.element(screen.getByPlaceholder("Email")).toBeInTheDocument();

    // Fill required fields
    await screen.getByLabelText(/first name/i).fill("Ada");
    await screen.getByLabelText(/last name/i).fill("Lovelace");

    // Fill email but leave phone empty
    await screen.getByPlaceholder("Email").fill("ada@example.com");

    await screen.getByRole("button", { name: /^save$/i }).click();

    await expect.poll(() => createMock).toBeCalledTimes(1);

    expect(createMock).toBeCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          email_jsonb: [{ email: "ada@example.com", type: "Work" }],
          phone_jsonb: null,
        }),
      }),
    );
  });

  it("submits both email and phone when filled", async () => {
    const createMock = vi.fn().mockResolvedValue({ data: {} });

    const screen = await render(
      <ContactCreateBasic
        silent
        dataProvider={{
          create: createMock,
        }}
      />,
    );

    await expect.element(screen.getByPlaceholder("Email")).toBeInTheDocument();

    // Fill required fields
    await screen.getByLabelText(/first name/i).fill("Ada");
    await screen.getByLabelText(/last name/i).fill("Lovelace");

    // Fill both email and phone
    await screen.getByPlaceholder("Email").fill("ada@example.com");
    await screen.getByPlaceholder("Phone number").fill("+1234567890");

    await screen.getByRole("button", { name: /^save$/i }).click();

    await expect.poll(() => createMock).toBeCalledTimes(1);

    expect(createMock).toBeCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          email_jsonb: [{ email: "ada@example.com", type: "Work" }],
          phone_jsonb: [{ number: "+1234567890", type: "Work" }],
        }),
      }),
    );
  });
});
