import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ArchiveRestore,
  BellRing,
  Building2,
  Ellipsis,
  FolderKanban,
  Home,
  MessageSquareText,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import { useTranslate } from "ra-core";
import { Link, matchPath, useLocation } from "react-router";

export const MobileNavigation = () => {
  const location = useLocation();
  const translate = useTranslate();

  let currentPath: string | boolean = "/";
  if (matchPath("/", location.pathname)) {
    currentPath = "/";
  } else if (matchPath("/contacts/*", location.pathname)) {
    currentPath = "/contacts";
  } else if (matchPath("/companies/*", location.pathname)) {
    currentPath = "/companies";
  } else if (matchPath("/tasks/*", location.pathname)) {
    currentPath = "/tasks";
  } else if (matchPath("/reminders/*", location.pathname)) {
    currentPath = "/reminders";
  } else if (matchPath("/deals/*", location.pathname)) {
    currentPath = "/deals";
  } else {
    currentPath = false;
  }

  // Check if the app is running as a PWA (standalone mode)
  const isPwa = window.matchMedia("(display-mode: standalone)").matches;
  // Check if it's iOS on the web
  const isWebiOS = /iPad|iPod|iPhone/.test(window.navigator.userAgent);

  return (
    <nav
      aria-label={translate("crm.navigation.label")}
      className="fixed bottom-0 left-0 right-0 z-50 bg-secondary h-14"
      style={{
        // iOS bug: even though viewport is set correctly, the bottom safe area inset is not accounted for
        // So we manually add some padding to avoid the navigation being too close to the home bar
        paddingBottom: isPwa && isWebiOS ? 15 : undefined,
        // We use box-sizing: border-box, so the height contains the padding.
        // To actually increase the padding, we need to increase the height as well
        height:
          "calc(var(--spacing)) * 6" + (isPwa && isWebiOS ? " + 15px" : ""),
      }}
    >
      <div className="flex justify-center">
        <>
          <NavigationButton
            href="/"
            Icon={Home}
            label={translate("ra.page.dashboard")}
            isActive={currentPath === "/"}
          />
          <NavigationButton
            href="/companies"
            Icon={Users}
            label={translate("resources.companies.name", {
              smart_count: 2,
            })}
            isActive={currentPath === "/companies"}
          />
          <CreateButton />
          <NavigationButton
            href="/reminders"
            Icon={BellRing}
            label={translate("resources.reminders.name", { smart_count: 2 })}
            isActive={currentPath === "/reminders"}
          />
          <MoreButton />
        </>
      </div>
    </nav>
  );
};

const NavigationButton = ({
  href,
  Icon,
  label,
  isActive,
}: {
  href: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  isActive: boolean;
}) => (
  <Button
    asChild
    variant="ghost"
    className={cn(
      "flex-col gap-1 h-auto py-2 px-1 rounded-md w-16",
      isActive ? null : "text-muted-foreground",
    )}
  >
    <Link to={href}>
      <Icon className="size-6" />
      <span className="text-[0.6rem] font-medium">{label}</span>
    </Link>
  </Button>
);

const CreateButton = () => {
  const translate = useTranslate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="default"
          size="icon"
          className="h-16 w-16 rounded-full -mt-3"
          aria-label={translate("ra.action.create")}
        >
          <Plus className="size-10" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild className="h-12 px-4 text-base">
          <Link to="/companies/create">
            <Building2 />
            {translate("resources.companies.action.new")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="h-12 px-4 text-base">
          <Link to="/deals/create">
            <FolderKanban />
            {translate("resources.deals.action.new")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="h-12 px-4 text-base">
          <Link to="/follow_ups/create">
            <MessageSquareText />
            {translate("resources.follow_ups.action.create")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="h-12 px-4 text-base">
          <Link to="/reminders/create">
            <BellRing />
            {translate("resources.reminders.action.create")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const MoreButton = () => {
  const location = useLocation();
  const translate = useTranslate();
  const isActive =
    !!matchPath("/settings", location.pathname) ||
    !!matchPath("/contacts/*", location.pathname) ||
    !!matchPath("/deals/*", location.pathname) ||
    !!matchPath("/follow_ups/*", location.pathname);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "flex-col gap-1 h-auto py-2 px-1 rounded-md w-16",
            isActive ? null : "text-muted-foreground",
          )}
        >
          <Ellipsis className="size-6" />
          <span className="text-[0.6rem] font-medium">
            {translate("crm.common.misc")}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to="/contacts">
            <Users />
            {translate("resources.contacts.name", { smart_count: 2 })}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/deals">
            <FolderKanban />
            {translate("resources.deals.name", { smart_count: 2 })}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/follow_ups">
            <MessageSquareText />
            {translate("resources.follow_ups.name", { smart_count: 2 })}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/companies/deleted">
            <ArchiveRestore />
            {translate("resources.companies.deleted.title")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings />
            {translate("crm.settings.title")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
