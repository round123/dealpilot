import { LegalDocumentPage, LegalSection } from "./LegalDocumentPage";

export const PrivacyPolicyPage = () => (
  <LegalDocumentPage
    title="隐私政策"
    summary="本政策说明 DealPilot 如何处理账号和 CRM 数据，以及云端存储、跨境传输、供应商、保留与删除规则。"
    relatedLink={{ label: "查看服务条款", to: TermsPath }}
  >
    <LegalSection title="1. 适用范围">
      <p>
        本政策适用于 DealPilot Cloud Beta。DealPilot 是面向个人外贸经理的云端
        CRM，PostgreSQL
        是账号业务数据的唯一事实源，不提供本地数据库或离线业务写入模式。
      </p>
    </LegalSection>

    <LegalSection title="2. 我们处理的数据">
      <ul>
        <li>账号数据：邮箱、显示名称、语言、主题和认证会话。</li>
        <li>
          CRM
          数据：客户、联系人、社媒账号、项目、跟进、提醒、风险、里程碑、标签、任务和附件。
        </li>
        <li>
          用户主动提交的数据：CSV/XLSX 导入内容、导出请求和用户加密的云备份。
        </li>
        <li>
          必要的运行与安全记录：请求标识、错误类型、审计事件和最小化的访问元数据；日志不记录密码、访问令牌、完整消息正文或无关的客户敏感字段。
        </li>
      </ul>
    </LegalSection>

    <LegalSection title="3. 处理目的">
      <p>
        上述数据仅用于提供账号认证、客户管理、跟进提醒、数据导入导出、加密备份恢复、安全审计、故障排查和服务保护。未经另行明确同意，不用于广告画像或出售给第三方。
      </p>
    </LegalSection>

    <LegalSection title="4. 云端存储、跨境处理与供应商">
      <p>
        DealPilot 的生产数据库、身份认证、对象存储和 Edge Functions 由 Supabase
        托管，首选区域为新加坡。中国大陆用户提交的账号及 CRM
        数据会传输并存储到新加坡，这可能构成个人信息跨境处理。
      </p>
      <ul>
        <li>
          Supabase：提供 Auth、PostgreSQL、Storage 和 Edge
          Functions，处理账号及业务数据。
        </li>
        <li>
          GitHub Pages：托管 Web/PWA 静态文件，可能处理访问所需的 IP、User-Agent
          等网络元数据，但不作为 CRM 业务数据存储。
        </li>
        <li>
          GitHub Actions：用于构建和发布代码，不应接收或处理真实 CRM 业务数据。
        </li>
        <li>
          Supabase Auth 邮件能力：用于邮箱验证和密码重置。如后续接入独立 SMTP
          邮件供应商，我们会先更新本政策及供应商记录。
        </li>
      </ul>
      <p>
        注册时勾选同意表示你已知悉上述存储区域、跨境处理和主要供应商。若你不同意，请不要创建账号或提交客户资料。
      </p>
    </LegalSection>

    <LegalSection title="5. 数据隔离与安全">
      <p>
        每条业务记录绑定当前账号，数据库通过行级安全策略和复合外键阻止跨账号访问与引用。公网传输使用
        TLS，数据库、对象存储及供应商备份使用其提供的静态加密能力。客户端不会获得
        service role 凭据。
      </p>
      <p>
        当前应用内云备份只覆盖关系数据，不包含 Supabase Storage
        中的附件对象。独立对象备份和恢复演练完成前，Cloud Beta
        不开放真实客户附件存储。
      </p>
    </LegalSection>

    <LegalSection title="6. 保留与删除">
      <ul>
        <li>活跃业务数据保留至你删除相应记录或完成受控账号关闭流程。</li>
        <li>
          软删除的 Customer 默认保留 30 天，期间可恢复，期满后进入永久清理。
        </li>
        <li>
          应用内云备份和审计记录的自动淘汰尚未启用；真实客户数据开放前，目标保留期分别为
          35 天和 180 天。
        </li>
        <li>
          CSV/XLSX
          原文件仅在浏览器中解析，不上传到云端；云端只保存导入任务的幂等结果和摘要。
        </li>
      </ul>
      <p>
        首版不提供自助删除账号。依法提出的账号关闭或数据权利请求由受控管理员流程处理，并保留必要的审计状态。
      </p>
    </LegalSection>

    <LegalSection title="7. 你的权利">
      <p>
        你可以在产品内查看、更正、导出或删除有权限访问的业务数据。账号关闭、访问副本、更正或其他数据权利请求，请通过
        DealPilot
        项目维护渠道联系运营方；请勿在公开讨论中粘贴客户资料、密码或访问令牌。
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

    <LegalSection title="8. 政策更新">
      <p>
        当处理目的、存储区域、主要供应商或保留规则发生实质变化时，我们会更新生效日期，并在需要时重新取得明确同意。
      </p>
    </LegalSection>
  </LegalDocumentPage>
);

const TermsPath = "/terms";
PrivacyPolicyPage.path = "/privacy";
