import type {
  CoreAdminProps,
  AuthProvider,
  DashboardComponent,
  LayoutComponent,
} from "ra-core";
import { CustomRoutes, localStorageStore, Resource } from "ra-core";
import { useEffect, useMemo } from "react";
import { Route } from "react-router";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { Admin } from "@/components/admin/admin";
import { ForgotPasswordPage } from "@/components/supabase/forgot-password-page";
import { SetPasswordPage } from "@/components/supabase/set-password-page";

import companies from "../companies";
import contacts from "../contacts";
import { Dashboard } from "../dashboard/Dashboard";
import { MobileDashboard } from "../dashboard/MobileDashboard";
import deals from "../deals";
import followUps from "../followUps";
import { Layout } from "../layout/Layout";
import { MobileLayout } from "../layout/MobileLayout";
import { SignupPage } from "../login/SignupPage";
import { ConfirmationRequired } from "../login/ConfirmationRequired";
import { ImportPage } from "../misc/ImportPage";
import { ChangelogPage } from "../misc/ChangelogPage";
import {
  getAuthProvider as defaultAuthProviderBuilder,
  getDataProvider as defaultDataProviderBuilder,
} from "../providers/supabase";
import { SettingsPageMobile } from "../settings/SettingsPageMobile";
import { SettingsPage } from "../settings/SettingsPage";
import { CloudDataToolsPage } from "../settings/CloudDataToolsPage";
import {
  CONFIGURATION_STORE_KEY,
  type ConfigurationContextValue,
} from "./ConfigurationContext";
import type { CrmDataProvider } from "../providers/types";
import {
  defaultCompanySectors,
  defaultCurrency,
  defaultDarkModeLogo,
  defaultDealCategories,
  defaultDealPipelineStatuses,
  defaultDealStages,
  defaultLightModeLogo,
  defaultNoteStatuses,
  defaultTaskTypes,
  defaultTitle,
} from "./defaultConfiguration";
import { i18nProvider as defaulti18nProvider } from "../providers/commons/i18nProvider";
import { StartPage } from "../login/StartPage.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { MobileTasksList } from "../tasks/MobileTasksList.tsx";
import reminders from "../reminders";
import { ContactListMobile } from "../contacts/ContactList.tsx";
import { ContactShow } from "../contacts/ContactShow.tsx";
import { DeletedCustomersPage } from "../companies/DeletedCustomersPage.tsx";
import { CompanyListMobile } from "../companies/CompanyList.tsx";
import { NoteShowPage } from "../notes/NoteShowPage.tsx";
import { clearAccountState, createCloudQueryClient } from "./accountState";
import { cloudCustomerOperations } from "../providers/cloudCustomerOperations";
import { CustomerOperationsProvider } from "../providers/CustomerOperationsContext";
import type { CustomerOperations } from "../providers/customerOperations";
import { createLocalCustomerOperations } from "../providers/localCustomerOperations";
import {
  ImportOperationsProvider,
  type CustomerImportOperations,
} from "../providers/importOperations";
import {
  LocalDataOperationsProvider,
  type LocalDataOperations,
} from "../providers/localDataOperations";
import { CrmProviderCapabilitiesProvider } from "../providers/capabilities";
import { LocalPrivacyGuard } from "../settings/LocalPrivacyNotice";

const defaultStore = localStorageStore(undefined, "CRM");
const defaultQueryClient = createCloudQueryClient();

export type CRMProps = {
  dataProvider?: CrmDataProvider;
  authProvider?: AuthProvider;
  i18nProvider?: CoreAdminProps["i18nProvider"];
  disableTelemetry?: boolean;
  store?: CoreAdminProps["store"];
  dashboard?: DashboardComponent;
  layout?: LayoutComponent;
  customerOperations?: CustomerOperations;
  importOperations?: CustomerImportOperations;
  localDataOperations?: LocalDataOperations;
} & Partial<ConfigurationContextValue>;

/**
 * CRM Component
 *
 * This component sets up and renders the main CRM application using `ra-core`. It provides
 * default configurations and themes but allows for customization through props. The component
 * seeds the store with any custom prop values for backwards compatibility.
 *
 * @param {LabeledValue[]} companySectors - The list of company sectors used in the application.
 * @param {string} currency - The ISO 4217 currency code used to format monetary values (e.g. "USD", "EUR", "GBP").
 * @param {RaThemeOptions} darkTheme - The theme to use when the application is in dark mode.
 * @param {LabeledValue[]} dealCategories - The categories of deals used in the application.
 * @param {string[]} dealPipelineStatuses - The statuses of deals in the pipeline used in the application.
 * @param {DealStage[]} dealStages - The stages of deals used in the application.
 * @param {RaThemeOptions} lightTheme - The theme to use when the application is in light mode.
 * @param {string} darkModeLogo - Logo shown in dark mode and on the auth pages. Must be an imported asset, an absolute URL, or a data URI — never a route-relative path like "./logos/x.svg", which breaks on nested routes such as /oauth/consent (issue #291).
 * @param {string} lightModeLogo - Logo shown in light mode. Same rule as darkModeLogo: imported asset, absolute URL, or data URI only.
 * @param {NoteStatus[]} noteStatuses - The statuses of notes used in the application.
 * @param {LabeledValue[]} taskTypes - The types of tasks used in the application.
 * @param {string} title - The title of the CRM application.
 *
 * @returns {JSX.Element} The rendered CRM application.
 *
 * @example
 * // Basic usage of the CRM component
 * import { CRM } from '@/components/atomic-crm/dashboard/CRM';
 *
 * const App = () => (
 *     <CRM
 *         darkModeLogo="https://example.com/logo-dark.svg"
 *         lightModeLogo="https://example.com/logo-light.svg"
 *         title="My Custom CRM"
 *         lightTheme={{
 *             ...defaultTheme,
 *             palette: {
 *                 primary: { main: '#0000ff' },
 *             },
 *         }}
 *     />
 * );
 *
 * export default App;
 */
export const CRM = ({
  companySectors = defaultCompanySectors,
  currency = defaultCurrency,
  dealCategories = defaultDealCategories,
  dealPipelineStatuses = defaultDealPipelineStatuses,
  dealStages = defaultDealStages,
  darkModeLogo = defaultDarkModeLogo,
  lightModeLogo = defaultLightModeLogo,
  noteStatuses = defaultNoteStatuses,
  taskTypes = defaultTaskTypes,
  title = defaultTitle,
  dataProvider = defaultDataProviderBuilder(),
  authProvider = defaultAuthProviderBuilder(),
  i18nProvider = defaulti18nProvider,
  store = defaultStore,
  disableTelemetry: _disableTelemetry,
  customerOperations,
  importOperations,
  localDataOperations,
  ...rest
}: CRMProps) => {
  // Seed the store with CRM prop values if not already stored
  // (backwards compatibility for prop-based config)
  useEffect(() => {
    if (!store.getItem(CONFIGURATION_STORE_KEY)) {
      store.setItem(CONFIGURATION_STORE_KEY, {
        companySectors,
        currency,
        dealCategories,
        dealPipelineStatuses,
        dealStages,
        noteStatuses,
        taskTypes,
        title,
        darkModeLogo,
        lightModeLogo,
      } satisfies ConfigurationContextValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const isMobile = useIsMobile();
  const queryClient = useMemo(() => createCloudQueryClient(), []);
  const resolvedCustomerOperations = useMemo(
    () =>
      customerOperations ??
      (import.meta.env.VITE_IS_DEMO === "true"
        ? createLocalCustomerOperations(dataProvider)
        : cloudCustomerOperations),
    [customerOperations, dataProvider],
  );

  // on login, pre-fetch the configuration to avoid a flickering
  // when accessing the app for the first time
  const wrappedAuthProvider = useMemo<AuthProvider>(
    () => ({
      ...authProvider,
      login: async (params: any) => {
        clearAccountState(queryClient, store);
        const result = await authProvider.login(params);
        try {
          const config = await dataProvider.getConfiguration();
          if (Object.keys(config).length > 0) {
            store.setItem(CONFIGURATION_STORE_KEY, config);
          }
        } catch {
          // Non-critical: config will load via useConfigurationLoader
        }
        return result;
      },
      handleCallback: async (params: any) => {
        if (!authProvider.handleCallback) {
          throw new Error(
            "handleCallback is not implemented in the authProvider",
          );
        }
        clearAccountState(queryClient, store);
        const result = await authProvider.handleCallback(params);
        try {
          const config = await dataProvider.getConfiguration();
          if (Object.keys(config).length > 0) {
            store.setItem(CONFIGURATION_STORE_KEY, config);
          }
        } catch {
          // Non-critical: config will load via useConfigurationLoader
        }
        return result;
      },
      logout: async (params: any) => {
        try {
          return await authProvider.logout(params);
        } finally {
          clearAccountState(queryClient, store);
        }
      },
    }),
    [authProvider, dataProvider, queryClient, store],
  );

  const ResponsiveAdmin = isMobile ? MobileAdmin : DesktopAdmin;

  return (
    <LocalDataOperationsProvider operations={localDataOperations}>
      <LocalPrivacyGuard>
        <ImportOperationsProvider operations={importOperations}>
          <CustomerOperationsProvider operations={resolvedCustomerOperations}>
            <CrmProviderCapabilitiesProvider
              capabilities={dataProvider.capabilities}
            >
              <ResponsiveAdmin
                dataProvider={dataProvider}
                authProvider={wrappedAuthProvider}
                i18nProvider={i18nProvider}
                store={store}
                queryClient={queryClient}
                loginPage={StartPage}
                requireAuth
                disableTelemetry={true}
                {...rest}
              />
            </CrmProviderCapabilitiesProvider>
          </CustomerOperationsProvider>
        </ImportOperationsProvider>
      </LocalPrivacyGuard>
    </LocalDataOperationsProvider>
  );
};

const DesktopAdmin = (
  props: CoreAdminProps & {
    dashboard?: DashboardComponent;
    layout?: LayoutComponent;
  },
) => {
  return (
    <Admin
      layout={props.layout ?? Layout}
      dashboard={props.dashboard ?? Dashboard}
      {...props}
    >
      <CustomRoutes noLayout>
        <Route path={SignupPage.path} element={<SignupPage />} />
        <Route
          path={ConfirmationRequired.path}
          element={<ConfirmationRequired />}
        />
        <Route path={SetPasswordPage.path} element={<SetPasswordPage />} />
        <Route
          path={ForgotPasswordPage.path}
          element={<ForgotPasswordPage />}
        />
      </CustomRoutes>

      <CustomRoutes>
        <Route path={SettingsPage.path} element={<SettingsPage />} />
        <Route
          path={CloudDataToolsPage.path}
          element={<CloudDataToolsPage />}
        />
        <Route path={ImportPage.path} element={<ImportPage />} />
        <Route path={ChangelogPage.path} element={<ChangelogPage />} />
        <Route
          path={DeletedCustomersPage.path}
          element={<DeletedCustomersPage />}
        />
      </CustomRoutes>
      <Resource name="companies" {...companies} />
      <Resource name="contacts" {...contacts} />
      <Resource name="deals" {...deals} />
      <Resource name="follow_ups" {...followUps} />
      <Resource name="reminders" {...reminders} />
      <Resource name="deal_risks" />
      <Resource name="deal_milestones" />
      <Resource name="social_accounts" />
      <Resource name="contact_notes" />
      <Resource name="deal_notes" />
      <Resource name="tasks" />
      <Resource name="tags" />
    </Admin>
  );
};

const MobileAdmin = (
  props: CoreAdminProps & {
    dashboard?: DashboardComponent;
    layout?: LayoutComponent;
  },
) => {
  const queryClient = props.queryClient ?? defaultQueryClient;
  const asyncStoragePersister = createAsyncStoragePersister({
    storage: localStorage,
  });

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <Admin
        queryClient={queryClient}
        layout={props.layout ?? MobileLayout}
        dashboard={props.dashboard ?? MobileDashboard}
        {...props}
      >
        <CustomRoutes noLayout>
          <Route path={SignupPage.path} element={<SignupPage />} />
          <Route
            path={ConfirmationRequired.path}
            element={<ConfirmationRequired />}
          />
          <Route path={SetPasswordPage.path} element={<SetPasswordPage />} />
          <Route
            path={ForgotPasswordPage.path}
            element={<ForgotPasswordPage />}
          />
        </CustomRoutes>
        <CustomRoutes>
          <Route
            path={SettingsPageMobile.path}
            element={<SettingsPageMobile />}
          />
          <Route
            path={CloudDataToolsPage.path}
            element={<CloudDataToolsPage />}
          />
          <Route path={ImportPage.path} element={<ImportPage />} />
          <Route path={ChangelogPage.path} element={<ChangelogPage />} />
          <Route
            path={DeletedCustomersPage.path}
            element={<DeletedCustomersPage />}
          />
        </CustomRoutes>
        <Resource
          name="contacts"
          list={ContactListMobile}
          show={ContactShow}
          recordRepresentation={contacts.recordRepresentation}
        >
          <Route path=":id/notes/:noteId" element={<NoteShowPage />} />
        </Resource>
        <Resource name="companies" {...companies} list={CompanyListMobile} />
        <Resource name="deals" {...deals} />
        <Resource name="follow_ups" {...followUps} />
        <Resource name="reminders" {...reminders} />
        <Resource name="deal_risks" />
        <Resource name="deal_milestones" />
        <Resource name="social_accounts" />
        <Resource name="tasks" list={MobileTasksList} />
      </Admin>
    </PersistQueryClientProvider>
  );
};
