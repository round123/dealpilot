import { createRouter, createRoute, createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DashboardPage } from "@/features/dashboard/routes/dashboard";
import { CustomersPage } from "@/features/customers/routes/customers";
import { CustomerDetailPage } from "@/features/customers/routes/customer-detail";
import { CustomerImportPage } from "@/features/customers/routes/customer-import";
import { ProjectsPage } from "@/features/projects/routes/projects";
import { ProjectDetailPage } from "@/features/projects/routes/project-detail";
import { RemindersPage } from "@/features/reminders/routes/reminders";
import { BackupPage } from "@/features/backups/routes/backup";
import { SettingsPage } from "@/features/settings/routes/settings";

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const customersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/customers",
  component: CustomersPage,
});

const customerDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/customers/$id",
  component: CustomerDetailPage,
});

const customerImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/customers/import",
  component: CustomerImportPage,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  component: ProjectsPage,
});

const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$id",
  component: ProjectDetailPage,
});

const remindersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reminders",
  component: RemindersPage,
});

const backupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/backup",
  component: BackupPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  customersRoute,
  customerDetailRoute,
  customerImportRoute,
  projectsRoute,
  projectDetailRoute,
  remindersRoute,
  backupRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
