"use client";

import { useId } from "react";
import { Check, HelpCircle, LockKeyhole, X } from "lucide-react";
import { useDemo } from "./demo-provider";
import { responseBlock } from "@/domain/permissions";
import { RESPONSE_LABELS } from "@/config/app";
import type { Event, Response } from "@/domain/model";

const options: { value: Response; label: string; icon: typeof Check }[] = [
  { value: "yes", label: "Ich komme", icon: Check },
  { value: "no", label: "Ich kann nicht", icon: X },
  { value: "maybe", label: "Vielleicht", icon: HelpCircle },
];
export function ResponsePicker({ event, direct = false }: { event: Event; direct?: boolean }) {
  const { user, now, run, message } = useDemo();
  const id = useId();
  const block = responseBlock(user, event, now);
  return <div className="response-picker">
    <div className="response-options" role="group" aria-label="Deine Rückmeldung" aria-describedby={block ? id : undefined}>
      {options.map(({ value, label, icon: Icon }) => <button
        key={value}
        type="button"
        disabled={!!block}
        aria-pressed={event.responses[user.id] === value}
        className={`button response-choice ${value} ${event.responses[user.id] === value ? "selected" : ""}`}
        onClick={() => run({ type: "respond", eventId: event.id, response: value })}
      ><Icon size={18} aria-hidden="true" />{direct ? label : RESPONSE_LABELS[value]}</button>)}
    </div>
    {block && <p className="lock-note" id={id}><LockKeyhole size={16} aria-hidden="true" />{block}</p>}
    {direct && message.startsWith("Nicht gespeichert:") && <p className="error" role="alert">{message}</p>}
  </div>;
}
