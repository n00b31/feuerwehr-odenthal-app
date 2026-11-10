"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { AppDialog } from "./app-dialog";

const query = "(max-width: 767px)";
function subscribe(change: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}
export function useMobileLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
export function MobileSheet({title,children,close,className="",closeDisabled=false}:{
  title:string;children:ReactNode;close:()=>void;className?:string;closeDisabled?:boolean;
}){
  return <AppDialog title={title} className={`mobile-sheet ${className}`} lockScroll close={close} closeDisabled={closeDisabled}>{children}</AppDialog>;
}

export function ResponsiveFilters({ children, summary, error }: {
  children: ReactNode; summary: string; error?: string;
}) {
  const mobile = useMobileLayout();
  const [open, setOpen] = useState(false);
  if (!mobile) return children;
  return <>
    <div className="mobile-filter-bar">
      <button className="button secondary" aria-label="Filter öffnen" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <SlidersHorizontal size={18} aria-hidden="true" />Filter
      </button>
      <span aria-label="Aktive Terminfilter">{summary}</span>
    </div>
    {open && <MobileSheet title="Terminfilter" close={() => setOpen(false)}>
      {children}
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className="button" onClick={() => setOpen(false)}>Filter übernehmen und schließen</button>
    </MobileSheet>}
  </>;
}
