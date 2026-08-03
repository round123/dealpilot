import { CRM } from "@/components/atomic-crm/root/CRM";
import {
  authProvider as demoAuthProvider,
  dataProvider as demoDataProvider,
} from "@/components/atomic-crm/providers/fakerest";
import { getCloudApiClient } from "@/components/atomic-crm/providers/apiClient";
import { createCloudCustomerImportOperations } from "@/components/atomic-crm/providers/cloudImportOperations";

const isDemoRuntime =
  import.meta.env.DEV &&
  import.meta.env.MODE === "demo" &&
  import.meta.env.VITE_IS_DEMO === "true";

const cloudImportOperations =
  !isDemoRuntime
    ? createCloudCustomerImportOperations(getCloudApiClient())
    : undefined;

/**
 * Application entry point
 *
 * Customize Atomic CRM by passing props to the CRM component:
 *  - companySectors
 *  - darkTheme
 *  - dealCategories
 *  - dealPipelineStatuses
 *  - dealStages
 *  - lightTheme
 *  - darkModeLogo / lightModeLogo
 *  - noteStatuses
 *  - taskTypes
 *  - title
 * ... as well as all the props accepted by shadcn-admin-kit's <Admin> component.
 *
 * Logos must be an imported asset, an absolute URL, or a data URI — never a
 * route-relative path like "./img/logo.png", which breaks on nested routes.
 *
 * @example
 * import logoDark from "./logo-dark.svg";
 * import logoLight from "./logo-light.svg";
 *
 * const App = () => (
 *    <CRM
 *       darkModeLogo={logoDark}
 *       lightModeLogo={logoLight}
 *       title="Acme CRM"
 *    />
 * );
 */
const App = () => {
  if (isDemoRuntime) {
    return (
      <CRM
        authProvider={demoAuthProvider}
        dataProvider={demoDataProvider}
        title="DealPilot"
      />
    );
  }

  return <CRM importOperations={cloudImportOperations} title="DealPilot" />;
};

export default App;
