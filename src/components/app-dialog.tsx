"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function AppDialog({ title, children, close, className = "" }: {
  title: string; children: ReactNode; close: () => void; className?: string;
}) {
  const titleId = useId();
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
  return <dialog ref={ref} className={`modal ${className}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <header className="modal-header"><h2 id={titleId}>{title}</h2>
      <button className="icon-button" onClick={close} aria-label="Dialog schließen"><X size={20} /></button>
    </header><div className="modal-body">{children}</div>
  </dialog>;
}
