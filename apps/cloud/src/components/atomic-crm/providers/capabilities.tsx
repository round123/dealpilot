/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";

export interface CrmProviderCapabilities {
  accountDeletion: boolean;
  contacts: {
    extendedProfile: boolean;
    status: boolean;
    tags: boolean;
    tasks: boolean;
    notes: boolean;
    merge: boolean;
    reassignCompany: boolean;
    maxEmailAddresses: number | null;
    maxPhoneNumbers: number | null;
  };
  deals: {
    notes: boolean;
  };
}

export const FULL_CRM_CAPABILITIES: CrmProviderCapabilities = Object.freeze({
  accountDeletion: false,
  contacts: Object.freeze({
    extendedProfile: true,
    status: true,
    tags: true,
    tasks: true,
    notes: true,
    merge: true,
    reassignCompany: true,
    maxEmailAddresses: null,
    maxPhoneNumbers: null,
  }),
  deals: Object.freeze({ notes: true }),
});

export const AGENT_CRM_CAPABILITIES: CrmProviderCapabilities = Object.freeze({
  accountDeletion: false,
  contacts: Object.freeze({
    extendedProfile: false,
    status: false,
    tags: false,
    tasks: false,
    notes: false,
    merge: false,
    reassignCompany: false,
    maxEmailAddresses: 1,
    maxPhoneNumbers: 1,
  }),
  deals: Object.freeze({ notes: false }),
});

export const SUPABASE_CRM_CAPABILITIES: CrmProviderCapabilities = Object.freeze(
  {
    ...FULL_CRM_CAPABILITIES,
    accountDeletion: true,
  },
);

const CrmProviderCapabilitiesContext = createContext(FULL_CRM_CAPABILITIES);

export const CrmProviderCapabilitiesProvider = ({
  capabilities,
  children,
}: {
  capabilities?: CrmProviderCapabilities;
  children: ReactNode;
}) => (
  <CrmProviderCapabilitiesContext.Provider
    value={capabilities ?? FULL_CRM_CAPABILITIES}
  >
    {children}
  </CrmProviderCapabilitiesContext.Provider>
);

export function useCrmProviderCapabilities() {
  return useContext(CrmProviderCapabilitiesContext);
}
