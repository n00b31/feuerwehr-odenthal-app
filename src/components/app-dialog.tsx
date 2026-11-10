"use client";

import { createContext, useContext, useEffect, useId, useRef, type ReactNode,type CSSProperties } from "react";
import { X } from "lucide-react";

export const AppDialogVisibility = createContext(true);
let scrollLocks=0;
let originalOverflow="";

export function AppDialog({ title, children, close, className = "", lockScroll=false, closeDisabled=false,style }: {
  title: string; children: ReactNode; close: () => void; className?: string; lockScroll?:boolean;closeDisabled?:boolean;style?:CSSProperties;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const visible = useContext(AppDialogVisibility);
  useEffect(() => {
    if (!visible) return;
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    if(lockScroll && scrollLocks++===0){originalOverflow=document.body.style.overflow;document.body.style.overflow="hidden";}
    return () => {
      dialog?.close();
      if(lockScroll && --scrollLocks===0)document.body.style.overflow=originalOverflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [visible,lockScroll]);
  return visible ? <dialog ref={ref} className={`modal ${className}`} style={style} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); if(!closeDisabled)close(); }}
    onClick={(event) => { if (!closeDisabled && event.target === event.currentTarget) close(); }}>
    <div className="modal-header"><h2 id={titleId}>{title}</h2>
      <button className="icon-button" disabled={closeDisabled} onClick={close} aria-label="Dialog schließen"><X size={20} /></button>
    </div><div className="modal-body">{children}</div>
  </dialog> : null;
}
