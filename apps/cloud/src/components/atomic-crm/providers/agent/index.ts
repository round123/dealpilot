import { createAgentAuthProvider } from "./authProvider";
import { captureAgentToken, createAgentClient } from "./client";
import { createAgentCustomerOperations } from "./customerOperations";
import { createAgentDataProvider } from "./dataProvider";
import { createAgentImportOperations } from "./importService";
import { createAgentLocalDataOperations } from "./localDataService";

export function createAgentRuntime() {
  captureAgentToken();
  const client = createAgentClient();
  return {
    authProvider: createAgentAuthProvider(),
    dataProvider: createAgentDataProvider({ client }),
    customerOperations: createAgentCustomerOperations(client),
    importOperations: createAgentImportOperations(client),
    localDataOperations: createAgentLocalDataOperations(client),
  };
}

export { createAgentAuthProvider } from "./authProvider";
export {
  AGENT_TOKEN_STORAGE_KEY,
  captureAgentToken,
  clearAgentToken,
  createAgentClient,
  getAgentToken,
} from "./client";
export { createAgentCustomerOperations } from "./customerOperations";
export { createAgentDataProvider } from "./dataProvider";
export { createAgentImportOperations } from "./importService";
export { createAgentLocalDataOperations } from "./localDataService";
