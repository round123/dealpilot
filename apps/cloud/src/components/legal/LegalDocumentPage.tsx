import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

type LegalDocumentPageProps = {
  title: string;
  summary: string;
  children: ReactNode;
  relatedLink: {
    label: string;
    to: string;
  };
};

export const LegalDocumentPage = ({
  title,
  summary,
  children,
  relatedLink,
}: LegalDocumentPageProps) => (
  <div className="min-h-screen bg-background text-foreground">
    <header className="border-b bg-muted/20">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link to="/login" className="text-lg font-semibold hover:underline">
          DealPilot
        </Link>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          返回登录
        </Link>
      </div>
    </header>

    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="border-b pb-8">
        <p className="text-sm font-medium text-primary">DealPilot Cloud Beta</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          {summary}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          生效日期：2026 年 8 月 3 日
        </p>
      </div>

      <div className="space-y-10 py-10 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:leading-7 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_p]:leading-7 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        {children}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t py-6 text-sm text-muted-foreground">
        <span>DealPilot 个人云 CRM</span>
        <Link
          to={relatedLink.to}
          className="font-medium text-foreground hover:underline"
        >
          {relatedLink.label}
        </Link>
      </footer>
    </main>
  </div>
);

export const LegalSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="space-y-3">
    <h2>{title}</h2>
    {children}
  </section>
);
