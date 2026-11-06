import { z } from "zod";

export const releaseSchema = z.object({
  format: z.literal(1),
  version: z.string().min(1).max(40),
  buildId: z.string().regex(/^[A-Za-z0-9._-]{1,160}$/),
  gitSha: z.string().regex(/^[a-f0-9]{40}$/),
  sourceDirty: z.boolean(),
  mode: z.enum(["demo", "supabase-dev"]),
  basePath: z.string().regex(/^(?:\/[A-Za-z0-9_-]+)*$/),
  builtAt: z.iso.datetime(),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  runId: z.string().regex(/^\d+$/).nullable(),
  runAttempt: z.string().regex(/^\d+$/).nullable(),
});
export type Release = z.infer<typeof releaseSchema>;

export const currentRelease = process.env.NEXT_PUBLIC_RELEASE
  ? releaseSchema.parse(JSON.parse(process.env.NEXT_PUBLIC_RELEASE)) : null;

export function readAvailableRelease(value: unknown, current: Release) {
  const release = releaseSchema.parse(value);
  if (release.repository !== current.repository || release.basePath !== current.basePath || release.mode !== current.mode) {
    throw new Error("Versionsnachweis gehört nicht zu dieser Anwendung.");
  }
  return release.buildId === current.buildId ? null : release;
}

export function releaseUrl(href: string, buildId: string) {
  const url = new URL(href);
  url.searchParams.set("_ff_release", buildId);
  return url.href;
}
