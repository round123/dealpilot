import { LegalDocumentPage, LegalSection } from "./LegalDocumentPage";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage";

export const TermsOfServicePage = () => (
  <LegalDocumentPage
    title="服务条款"
    summary="本条款约定你使用 DealPilot Cloud Beta 时的账号责任、数据责任、可接受使用范围和服务边界。"
    relatedLink={{ label: "查看隐私政策", to: PrivacyPolicyPage.path }}
  >
    <LegalSection title="1. 服务内容">
      <p>
        DealPilot 提供个人云 CRM 的 Web/PWA
        功能，包括客户、联系人、项目、跟进、提醒、导入导出和加密云备份。首版不提供团队工作区、自动发送消息、本地数据库或浏览器关闭后的系统通知。
      </p>
    </LegalSection>

    <LegalSection title="2. 账号与邮箱确认">
      <ul>
        <li>你应提供可接收验证邮件的真实邮箱，并完成邮箱确认后使用账号。</li>
        <li>你应妥善保管密码和会话，不得共享账号或绕过访问控制。</li>
        <li>发现未经授权的访问时，应立即修改密码并联系项目维护渠道。</li>
      </ul>
    </LegalSection>

    <LegalSection title="3. 你的数据与责任">
      <p>
        你保留对所提交业务数据的合法权益，并授权 DealPilot
        在提供服务所必需的范围内处理这些数据。你应确保有权收集、上传和使用客户、联系人、消息摘要、附件及其他个人信息，并履行适用的告知和同意义务。
      </p>
    </LegalSection>

    <LegalSection title="4. 可接受使用">
      <p>你不得利用本服务：</p>
      <ul>
        <li>上传违法、侵权、恶意代码或未经授权取得的数据。</li>
        <li>发送垃圾信息、自动骚扰第三方或规避通信平台规则。</li>
        <li>探测、攻击、绕过账号隔离，或尝试访问其他用户的数据。</li>
        <li>泄露访问令牌、service role 凭据或其他用户的敏感信息。</li>
      </ul>
    </LegalSection>

    <LegalSection title="5. 云端处理与隐私">
      <p>
        服务使用新加坡区域的 Supabase 托管账号与 CRM 数据，并使用 GitHub Pages
        提供静态
        Web/PWA。数据类别、跨境处理、主要供应商、保留和删除规则以隐私政策为准。
      </p>
    </LegalSection>

    <LegalSection title="6. Cloud Beta 与可用性">
      <p>
        Cloud Beta
        仍可能发生功能调整、短时中断或兼容性问题。我们会采取合理的安全、备份和回滚措施，但你仍应定期使用导出或加密备份功能保留必要副本。本服务不替代法律、财务、报关或合规专业意见。
      </p>
    </LegalSection>

    <LegalSection title="7. 暂停与账号关闭">
      <p>
        对危害安全、侵犯他人权益或严重违反本条款的行为，可以限制或暂停服务。首版不提供自助删号；账号关闭和依法提出的数据清理请求通过受控管理员流程处理。
      </p>
    </LegalSection>

    <LegalSection title="8. 条款变更与联系">
      <p>
        条款发生实质变化时会更新生效日期，并在需要时要求重新同意。问题或权利请求可通过
        DealPilot 项目维护渠道联系运营方，且不得在公开讨论中提交客户敏感数据。
      </p>
      <p>
        项目维护渠道：{" "}
        <a
          href="https://github.com/round123/dealpilot"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
        >
          DealPilot GitHub 项目
        </a>
      </p>
    </LegalSection>
  </LegalDocumentPage>
);

TermsOfServicePage.path = "/terms";
