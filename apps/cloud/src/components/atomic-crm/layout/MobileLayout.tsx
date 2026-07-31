import { Error } from "@/components/admin/error";
import { Notification } from "@/components/admin/notification";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense, useEffect, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useLocation } from "react-router";

import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { MobileNavigation } from "./MobileNavigation";

export const MobileLayout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname, location.hash]);

  return (
    <>
      <ErrorBoundary FallbackComponent={Error}>
        <Suspense fallback={<Skeleton className="h-12 w-12 rounded-full" />}>
          <div className="min-h-screen pb-20">{children}</div>
        </Suspense>
      </ErrorBoundary>
      <MobileNavigation />
      <Notification mobileOffset={{ bottom: "72px" }} />
    </>
  );
};
