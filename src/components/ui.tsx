"use client";

import { type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { AppDialog } from "./app-dialog";
import type { Scope } from "@/domain/model";
import { useDemo } from "./demo-provider";
import { manageableScopes, scopeLabel } from "@/domain/permissions";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
export function Metric({ label, value, note, icon }: { label: string; value: ReactNode; note: string; icon: ReactNode }) {
  return <div className="metric card"><div className="metric-top"><span>{label}</span><span className="icon-tile">{icon}</span></div><div className="metric-value">{value}</div><span className="muted text-sm">{note}</span></div>;
}
export function Modal({ title, children, close, className = "" }: { title: string; children: ReactNode; close: () => void; className?: string }) {
  const { message } = useDemo();
  return <AppDialog title={title} close={close} className={className}>
    {children}{message.startsWith("Nicht gespeichert:") && <p className="error" role="alert">{message}</p>}
  </AppDialog>;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><ArrowUpRight size={28} /><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}
export function scopeValue(scope: Scope) { return scope.kind === "organization" ? "organization" : `${scope.kind}:${scope.id}`; }
export function parseScope(value: string): Scope {
  if (value === "organization") return { kind: "organization" };
  const [kind, ...id] = value.split(":");
  if (kind !== "unit" && kind !== "function") throw new Error("Unbekannter Bereich.");
  return { kind, id: id.join(":") };
}
export function ScopeSelect({ value, onChange, adminOnly = true, disabled = false }: { value: Scope; onChange: (scope: Scope) => void; adminOnly?: boolean; disabled?: boolean }) {
  const { state, user } = useDemo();
  const scopes: Scope[] = adminOnly ? manageableScopes(state, user) : [{ kind: "organization" }, ...state.units.map((u) => ({ kind: "unit" as const, id: u.id })), ...state.functions.map((f) => ({ kind: "function" as const, id: f.id }))];
  return <label>Bereich<select value={scopeValue(value)} disabled={disabled} onChange={(e) => onChange(parseScope(e.target.value))}>{scopes.map((s) => <option key={scopeValue(s)} value={scopeValue(s)}>{scopeLabel(state, s)}</option>)}</select></label>;
}
