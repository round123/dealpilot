import { createContext, useContext, type ReactNode } from "react";

import { cloudCustomerOperations } from "./cloudCustomerOperations";
import type { CustomerOperations } from "./customerOperations";

const CustomerOperationsContext = createContext<CustomerOperations>(
  cloudCustomerOperations,
);

export const CustomerOperationsProvider = ({
  operations,
  children,
}: {
  operations: CustomerOperations;
  children: ReactNode;
}) => (
  <CustomerOperationsContext.Provider value={operations}>
    {children}
  </CustomerOperationsContext.Provider>
);

// Provider and hook intentionally share the same private context.
// eslint-disable-next-line react-refresh/only-export-components
export const useCustomerOperations = () =>
  useContext(CustomerOperationsContext);
