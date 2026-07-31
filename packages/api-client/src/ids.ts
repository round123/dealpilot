import { z } from "zod";

export type EntityId<Entity extends string> = string & {
  readonly __entityId: Entity;
};

export type UserId = EntityId<"User">;
export type CustomerId = EntityId<"Customer">;
export type ContactId = EntityId<"Contact">;
export type SocialAccountId = EntityId<"SocialAccount">;
export type DealId = EntityId<"Deal">;
export type FollowUpId = EntityId<"FollowUp">;
export type ReminderId = EntityId<"Reminder">;
export type DealRiskId = EntityId<"DealRisk">;
export type DealMilestoneId = EntityId<"DealMilestone">;

export function toEntityId<Entity extends string>(
  value: string,
): EntityId<Entity> {
  return value as EntityId<Entity>;
}

export function entityIdSchema<Entity extends string>(_entity: Entity) {
  return z
    .string()
    .uuid()
    .transform((value) => toEntityId<Entity>(value));
}

export const UserIdSchema = entityIdSchema("User");
export const CustomerIdSchema = entityIdSchema("Customer");
export const ContactIdSchema = entityIdSchema("Contact");
export const SocialAccountIdSchema = entityIdSchema("SocialAccount");
export const DealIdSchema = entityIdSchema("Deal");
export const FollowUpIdSchema = entityIdSchema("FollowUp");
export const ReminderIdSchema = entityIdSchema("Reminder");
export const DealRiskIdSchema = entityIdSchema("DealRisk");
export const DealMilestoneIdSchema = entityIdSchema("DealMilestone");
