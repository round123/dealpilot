import type { Contact, EmailAndType } from "../../types";
import { getContactAvatar } from "./getContactAvatar";

describe("getContactAvatar", () => {
  it("returns an explicitly stored avatar unchanged", async () => {
    const avatar = "https://storage.example.test/signed/avatar.png";

    await expect(
      getContactAvatar({
        avatar: { src: avatar },
        first_name: "Ada",
        email_jsonb: [{ email: "ada@example.com", type: "Work" }],
      }),
    ).resolves.toBe(avatar);
  });

  it("generates a local initials data URL without making a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const avatar = await getContactAvatar({
      first_name: "Ada",
      last_name: "Lovelace",
      email_jsonb: [{ email: "ada@example.com", type: "Work" }],
    });

    expect(avatar).toMatch(/^data:image\/svg\+xml;charset=UTF-8,/);
    expect(decodeURIComponent(avatar?.split(",", 2)[1] ?? "")).toContain(
      ">AL</text>",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("uses the email local part only to generate initials locally", async () => {
    const email: EmailAndType[] = [
      { email: "anthony@marmelab.com", type: "Work" },
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const avatar = await getContactAvatar({ email_jsonb: email });

    expect(decodeURIComponent(avatar?.split(",", 2)[1] ?? "")).toContain(
      ">A</text>",
    );
    expect(avatar).not.toContain("gravatar");
    expect(avatar).not.toContain("marmelab.com");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns null when there is no stored avatar or local initial source", async () => {
    const record: Partial<Contact> = { email_jsonb: [] };

    await expect(getContactAvatar(record)).resolves.toBeNull();
  });
});
