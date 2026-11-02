import { z } from "zod";

export const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("organization") }),
  z.object({ kind: z.literal("unit"), id: z.string().min(1) }),
  z.object({ kind: z.literal("function"), id: z.string().min(1) }),
]);
export const roleSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("GLOBAL_ADMIN") }),
  z.object({ role: z.literal("MEMBER") }),
  z.object({ role: z.literal("UNIT_ADMIN"), scopeId: z.string().min(1) }),
  z.object({ role: z.literal("FUNCTION_ADMIN"), scopeId: z.string().min(1) }),
]);
export const userSchema = z.object({
  id: z.string(), name: z.string(), email: z.string(),
  unitId: z.string(), functionIds: z.array(z.string()), roles: z.array(roleSchema),
  memberships: z.array(z.object({ unitId: z.string(), from: z.string(), until: z.string().optional() })),
});
export const eventSchema = z.object({
  id: z.string(), title: z.string().min(3).max(120), description: z.string().max(2000),
  type: z.enum(["regular", "special", "breathing", "training", "community", "other"]),
  startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), location: z.string().min(1).max(200),
  scope: scopeSchema, organizerId: z.string(), deadline: z.iso.datetime().optional(),
  status: z.enum(["scheduled", "cancelled"]),
  seriesId: z.string().optional(),
  recurrence: z.object({
    frequency: z.enum(["weekly", "biweekly", "monthly"]),
    total: z.number().int().min(1).max(52), index: z.number().int().min(1).max(52),
  }).optional(),
  roster: z.array(z.object({ userId: z.string(), unitId: z.string() })),
  responses: z.record(z.string(), z.enum(["yes", "no", "maybe"])),
  attendance: z.record(z.string(), z.enum(["present", "absent", "unknown"])),
  finalizedAt: z.iso.datetime().optional(),
});
export const documentSchema = z.object({
  id: z.string(), name: z.string().min(3).max(120), description: z.string().max(1000),
  url: z.string().url(), scope: scopeSchema, visibility: z.enum(["members", "admins"]),
});
export const stateSchema = z.object({
  version: z.literal(1), seedDate: z.string(),
  units: z.array(z.object({ id: z.string(), name: z.string().min(2) })).min(1),
  functions: z.array(z.object({ id: z.string(), name: z.string().min(2) })),
  users: z.array(userSchema).min(1), events: z.array(eventSchema), documents: z.array(documentSchema),
  audit: z.array(z.object({
    id: z.string(), at: z.iso.datetime(), actorId: z.string(),
    action: z.string(), targetId: z.string(), detail: z.string(),
  })),
});
export type Scope = z.infer<typeof scopeSchema>;
export type Role = z.infer<typeof roleSchema>;
export type User = z.infer<typeof userSchema>;
export type Event = z.infer<typeof eventSchema>;
export type DocumentArea = z.infer<typeof documentSchema>;
export type DemoState = z.infer<typeof stateSchema>;
export type Response = Event["responses"][string];
export type Attendance = Event["attendance"][string];
export type EventInput = Pick<Event, "title" | "description" | "type" | "startsAt" | "endsAt" | "location" | "scope" | "deadline">;
export type Repeat = "none" | "weekly" | "biweekly" | "monthly";
