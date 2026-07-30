import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Welcome = () => (
  <Card>
    <CardHeader className="px-4">
      <CardTitle role="heading" aria-level={2}>
        欢迎使用 DealPilot
      </CardTitle>
    </CardHeader>
    <CardContent className="px-4">
      <p className="text-sm mb-4">
        在这里集中管理客户、联系人、商机、跟进记录和待办事项。
      </p>
      <p className="text-sm mb-4">
        当前演示数据保存在浏览器中，刷新页面后会恢复初始数据；连接云端后，数据将安全保存到你的个人账户。
      </p>
      <p className="text-sm">
        DealPilot 基于{" "}
        <a
          href="https://marmelab.com/atomic-crm"
          className="underline hover:no-underline"
        >
          Atomic CRM
        </a>
        构建。
      </p>
    </CardContent>
  </Card>
);
