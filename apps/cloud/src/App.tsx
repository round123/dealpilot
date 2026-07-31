import { CRM } from "@/components/atomic-crm/root/CRM";
import {
  authProvider as demoAuthProvider,
  dataProvider as demoDataProvider,
} from "@/components/atomic-crm/providers/fakerest";
import { createAgentRuntime } from "@/components/atomic-crm/providers/agent";
import { getCloudApiClient } from "@/components/atomic-crm/providers/apiClient";
import { createCloudCustomerImportOperations } from "@/components/atomic-crm/providers/cloudImportOperations";

const agentRuntime =
  import.meta.env.VITE_DATA_BACKEND === "agent"
    ? createAgentRuntime()
    : undefined;

const cloudImportOperations =
  import.meta.env.VITE_DATA_BACKEND !== "agent" &&
  import.meta.env.VITE_IS_DEMO !== "true"
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
  if (agentRuntime) {
    return (
      <CRM
        authProvider={agentRuntime.authProvider}
        customerOperations={agentRuntime.customerOperations}
        dataProvider={agentRuntime.dataProvider}
        importOperations={agentRuntime.importOperations}
        localDataOperations={agentRuntime.localDataOperations}
        title="DealPilot"
      />
    );
  }

  if (import.meta.env.VITE_IS_DEMO === "true") {
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
