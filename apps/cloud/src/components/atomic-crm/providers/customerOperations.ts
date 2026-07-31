import type {
  Customer,
  CustomerDetail,
  CustomerMergeChoices,
  CustomerSummary,
  ListResult,
} from "@dealpilot/api-client";

export interface CustomerOperationOptions {
  signal?: AbortSignal;
}

export interface CustomerListOptions extends CustomerOperationOptions {
  page: number;
  perPage: number;
}

export interface CustomerMergeCandidateOptions extends CustomerListOptions {
  sourceId: Customer["id"];
  search: string;
}

export interface CustomerOperations {
  getCustomerDetail(
    id: Customer["id"],
    options?: CustomerOperationOptions,
  ): Promise<CustomerDetail>;
  listMergeCandidates(
    options: CustomerMergeCandidateOptions,
  ): Promise<ListResult<CustomerSummary>>;
  listDeletedCustomers(
    options: CustomerListOptions,
  ): Promise<ListResult<Customer>>;
  softDeleteCustomer(
    id: Customer["id"],
    options?: CustomerOperationOptions,
  ): Promise<Customer>;
  restoreCustomer(
    id: Customer["id"],
    options?: CustomerOperationOptions,
  ): Promise<Customer>;
  mergeCustomers(
    source: Customer,
    target: CustomerSummary,
    choices: CustomerMergeChoices,
    options?: CustomerOperationOptions,
  ): Promise<Customer>;
}
