import type { Identifier, RaRecord } from "ra-core";
import type { ComponentType } from "react";
import type { DealStage as DealStageValue } from "@dealpilot/api-client";

import type {
  COMPANY_CREATED,
  CONTACT_CREATED,
  CONTACT_NOTE_CREATED,
  DEAL_CREATED,
  DEAL_NOTE_CREATED,
} from "./consts";

export type SignUpData = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

export type SalesFormData = {
  avatar?: string;
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  administrator: boolean;
  disabled: boolean;
};

export type Sale = {
  first_name: string;
  last_name: string;
  administrator: boolean;
  avatar?: RAFile;
  disabled?: boolean;
  user_id: string;

  /**
   * This is a copy of the user's email, to make it easier to handle by react admin
   * DO NOT UPDATE this field directly, it should be updated by the backend
   */
  email: string;

  /**
   * This is used by the fake rest provider to store the password
   * DO NOT USE this field in your code besides the fake rest provider
   * @deprecated
   */
  password?: string;
} & Pick<RaRecord, "id">;

export type Company = {
  name: string;
  company: string | null;
  logo: RAFile;
  sector: string;
  size: 1 | 10 | 50 | 250 | 500;
  linkedin_url: string;
  website: string;
  phone_number: string;
  address: string;
  zipcode: string;
  city: string;
  state_abbr: string;
  sales_id?: Identifier;
  created_at: string;
  description: string;
  revenue: string;
  tax_identifier: string;
  country: string;
  source: string | null;
  grade: "A" | "B" | "C";
  status: "active" | "inactive";
  deleted_at: string | null;
  updated_at: string;
  context_links?: string[];
  nb_contacts?: number;
  nb_deals?: number;
} & Pick<RaRecord, "id">;

export type EmailAndType = {
  email: string;
  type: "Work" | "Home" | "Other";
};

export type PhoneNumberAndType = {
  number: string;
  type: "Work" | "Home" | "Other";
};

export type Contact = {
  first_name: string;
  last_name: string;
  title: string;
  company_id?: Identifier | null;
  email_jsonb: EmailAndType[];
  avatar?: Partial<RAFile>;
  linkedin_url?: string | null;
  first_seen: string;
  last_seen: string;
  has_newsletter: boolean;
  tags: number[];
  gender: string;
  sales_id?: Identifier;
  status: string;
  background: string;
  phone_jsonb: PhoneNumberAndType[];
  nb_tasks?: number;
  company_name?: string;
} & Pick<RaRecord, "id">;

export type ContactNote = {
  contact_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  status: string;
  attachments?: AttachmentNote[];
} & Pick<RaRecord, "id">;

export type Deal = {
  name: string;
  company_id: Identifier;
  contact_ids: Identifier[];
  category: string;
  stage: DealStageValue;
  description: string;
  amount: number;
  currency?: string;
  probability?: number | null;
  grade?: "S" | "A" | "B" | "C";
  close_reason?: string | null;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  expected_closing_date: string;
  sales_id: Identifier;
  index: number;
} & Pick<RaRecord, "id">;

export type DealNote = {
  deal_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  attachments?: AttachmentNote[];

  // This is defined for compatibility with `ContactNote`
  status?: undefined;
} & Pick<RaRecord, "id">;

export type Tag = {
  id: number;
  name: string;
  color: string;
};

export type Task = {
  contact_id: Identifier;
  type: string;
  text: string;
  due_date: string;
  done_date?: string | null;
  sales_id?: Identifier;
} & Pick<RaRecord, "id">;

export type SocialAccount = {
  owner_user_id?: Identifier;
  company_id: Identifier;
  contact_id?: Identifier | null;
  platform: string;
  raw_identifier: string;
  normalized_identifier: string;
  manually_bound: boolean;
  created_at: string;
  updated_at: string;
} & Pick<RaRecord, "id">;

export type FollowUp = {
  owner_user_id?: Identifier;
  company_id: Identifier;
  deal_id?: Identifier | null;
  type: "call" | "email" | "chat" | "visit" | "note" | "message";
  note?: string | null;
  message_body?: string | null;
  message_direction?: "inbound" | "outbound" | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
} & Pick<RaRecord, "id">;

export type Reminder = {
  owner_user_id?: Identifier;
  company_id: Identifier;
  deal_id?: Identifier | null;
  type: "fixed_time" | "waiting_reply" | "paused";
  status:
    | "pending"
    | "completed"
    | "snoozed"
    | "ignored"
    | "overdue"
    | "replied";
  due_at: string;
  priority: "low" | "normal" | "high" | "urgent";
  last_notified_at?: string | null;
  snooze_until?: string | null;
  resolution?: string | null;
  deletion_event_id?: string | null;
  created_at: string;
  updated_at: string;
} & Pick<RaRecord, "id">;

export type DealRisk = {
  owner_user_id?: Identifier;
  deal_id: Identifier;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "handling" | "resolved" | "ignored";
  handled_at?: string | null;
  created_at: string;
  updated_at: string;
} & Pick<RaRecord, "id">;

export type DealMilestone = {
  owner_user_id?: Identifier;
  deal_id: Identifier;
  name: string;
  due_date: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
} & Pick<RaRecord, "id">;

export type ActivityCompanyCreated = {
  type: typeof COMPANY_CREATED;
  company_id: Identifier;
  company: Company;
  sales_id: Identifier;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactCreated = {
  type: typeof CONTACT_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  contact: Contact;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactNoteCreated = {
  type: typeof CONTACT_NOTE_CREATED;
  sales_id?: Identifier;
  contactNote: ContactNote;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityDealCreated = {
  type: typeof DEAL_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  deal: Deal;
  date: string;
};

export type ActivityDealNoteCreated = {
  type: typeof DEAL_NOTE_CREATED;
  sales_id?: Identifier;
  dealNote: DealNote;
  date: string;
};

export type Activity = RaRecord &
  (
    | ActivityCompanyCreated
    | ActivityContactCreated
    | ActivityContactNoteCreated
    | ActivityDealCreated
    | ActivityDealNoteCreated
  );

export interface RAFile {
  src: string;
  title: string;
  path?: string;
  rawFile: File;
  type?: string;
}

export type AttachmentNote = RAFile;

export interface LabeledValue {
  value: string;
  label: string;
}

export type DealStage = LabeledValue & { value: DealStageValue };

export interface NoteStatus extends LabeledValue {
  color: string;
}

export interface ContactGender {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}
