"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X, ArrowUpRight } from "lucide-react";
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
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }} aria-labelledby="modal-title">
    <header className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={close} aria-label="Dialog schließen"><X size={20} /></button></header>
    <div className="modal-body">{children}{message.startsWith("Nicht gespeichert:") && <p className="error" role="alert">{message}</p>}</div>
  </dialog>;
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
