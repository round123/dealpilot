export interface ReminderStatusAttempt<Data> {
  action: string;
  data: Data;
  idempotencyKey: string;
}

export function createReminderStatusAttemptStore<Data>(
  generateKey: () => string = () => crypto.randomUUID(),
) {
  let pending: ReminderStatusAttempt<Data> | undefined;

  return {
    get(action: string, createData: () => Data): ReminderStatusAttempt<Data> {
      if (pending?.action === action) return pending;
      pending = { action, data: createData(), idempotencyKey: generateKey() };
      return pending;
    },
    complete(): void {
      pending = undefined;
    },
  };
}
