import {
  ResourceContextProvider,
  ShowBase,
  useDataProvider,
  type DataProvider,
} from "ra-core";
import { render } from "vitest-browser-react";
import { buildContact, StoryWrapper } from "@/test/StoryWrapper";
import { ContactAside } from "./ContactAside";
import { MobileSuccess } from "./ContactShow.mobile.stories";
import { ContactShow } from "./ContactShow";
import { AGENT_CRM_CAPABILITIES } from "../providers/capabilities";

const mockIsMobile = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: mockIsMobile,
}));

const renderContactAside = async (link?: "edit" | "show") => {
  const contact = buildContact();
  return render(
    <StoryWrapper data={{ contacts: [contact] }}>
      <ResourceContextProvider value="contacts">
        <ShowBase id={contact.id}>
          <ContactAside link={link} />
        </ShowBase>
      </ResourceContextProvider>
    </StoryWrapper>,
  );
};

describe("ContactShow", () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(true);
  });

  it("renders a safe zero-task label before nb_tasks is available", async () => {
    const screen = await render(<MobileSuccess />);

    await expect
      .element(screen.getByRole("tab", { name: "0 tasks" }))
      .toBeVisible();
    await expect
      .poll(
        () => screen.container.textContent?.includes("%{smart_count}") ?? false,
      )
      .toBe(false);
    await expect
      .poll(() => screen.container.textContent?.includes("||||") ?? false)
      .toBe(false);
  });

  it("hides unsupported provider features on mobile", async () => {
    const contact = buildContact({ id: 7, name: "Ada Lovelace" } as any);
    const screen = await render(
      <StoryWrapper
        data={{ contacts: [contact] }}
        dataProvider={{ capabilities: AGENT_CRM_CAPABILITIES }}
      >
        <ContactShow resource="contacts" id={contact.id} />
      </StoryWrapper>,
    );

    await expect
      .element(screen.getByRole("tab", { name: /details/i }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("tab", { name: /notes/i }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("tab", { name: /tasks/i }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByRole("combobox")).not.toBeInTheDocument();
    await expect.element(screen.getByText(/^tags$/i)).not.toBeInTheDocument();
  });

  it("updates the contact status from the aside", async () => {
    mockIsMobile.mockReturnValue(false);

    let dataProvider: DataProvider | null = null;
    const contact = buildContact({ status: "warm" });

    const DataProviderListener = () => {
      dataProvider = useDataProvider();
      return null;
    };

    const screen = await render(
      <StoryWrapper data={{ contacts: [contact] }}>
        <DataProviderListener />
        <ResourceContextProvider value="contacts">
          <ShowBase id={contact.id}>
            <ContactAside />
          </ShowBase>
        </ResourceContextProvider>
      </StoryWrapper>,
    );

    await expect
      .element(screen.getByRole("combobox"))
      .toHaveTextContent("Warm");

    await screen.getByRole("combobox").click();
    await screen.getByRole("option", { name: /hot/i }).click();

    await expect
      .poll(async () => {
        const { data } = await dataProvider!.getOne("contacts", {
          id: contact.id,
        });
        return data.status;
      })
      .toBe("hot");

    await expect.element(screen.getByRole("combobox")).toHaveTextContent("Hot");
  });

  it("shows merge and delete actions in the default Show aside", async () => {
    const screen = await renderContactAside();

    await expect
      .element(
        screen.getByRole("button", { name: /merge with another contact/i }),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /delete/i }))
      .toBeVisible();
  });

  it('hides merge and delete actions when link is "show"', async () => {
    const screen = await renderContactAside("show");

    await expect
      .element(
        screen.getByRole("button", { name: /merge with another contact/i }),
      )
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /delete/i }))
      .not.toBeInTheDocument();
  });
});
