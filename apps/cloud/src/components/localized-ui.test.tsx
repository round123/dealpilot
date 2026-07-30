import { render } from "vitest-browser-react";

import { Welcome } from "@/components/atomic-crm/dashboard/Welcome";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

describe("中文基础界面", () => {
  it("显示中文 DealPilot 欢迎内容", async () => {
    const screen = await render(<Welcome />);

    await expect
      .element(screen.getByRole("heading", { name: "欢迎使用 DealPilot" }))
      .toBeVisible();
    await expect
      .element(screen.getByText(/集中管理客户、联系人、商机/))
      .toBeVisible();
  });

  it("为分页操作提供中文可见文本和无障碍名称", async () => {
    const screen = await render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#previous" />
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#next" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    await expect
      .element(screen.getByRole("navigation", { name: "分页" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "转到上一页" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "转到下一页" }))
      .toBeVisible();
  });
});
