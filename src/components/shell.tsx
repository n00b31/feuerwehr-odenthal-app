"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Flame, LayoutDashboard, CalendarDays, FolderOpen, ChartNoAxesCombined, UserRound, Settings2, ShieldCheck, Menu, X, ChevronDown, Radio, Moon, Sun } from "lucide-react";
import { useDemo } from "./demo-provider";
import { isAdmin } from "@/domain/permissions";
import { ROLE_LABELS } from "@/config/app";
import { dateLabel } from "@/domain/time";
import { PwaStatus } from "./pwa-status";

const navigation = [
  { href: "/", name: "Start", icon: LayoutDashboard },
  { href: "/termine", name: "Termine", icon: CalendarDays },
  { href: "/dokumente", name: "Dokumente", icon: FolderOpen },
  { href: "/statistik", name: "Statistik", icon: ChartNoAxesCombined },
  { href: "/profil", name: "Profil", icon: UserRound },
];
export function Shell({ children }: { children: ReactNode }) {
  const { state, user, now, message } = useDemo();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState(false);
  const unit = state.units.find((u) => u.id === user.unitId)!;
  const initials = user.name.split(" ").slice(0, 2).map((w) => w[0]).join("");
  function theme() {
    const next = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = next ? "dark" : "light";
    setDark(next);
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main">Zum Inhalt springen</a>
    <aside className={`sidebar ${menu ? "is-open" : ""}`}>
      <Link href="/" className="brand" onClick={() => setMenu(false)}><span className="brand-mark"><Flame size={28} strokeWidth={1.8} /></span><span>FEUERWEHR<strong>ODENTHAL</strong></span></Link>
      <div className="workspace-label">UNSER DIENST. UNSER TEAM.</div>
      <nav aria-label="Hauptnavigation">{navigation.map(({ href, name, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${pathname === href ? "active" : ""}`} onClick={() => setMenu(false)} aria-current={pathname === href ? "page" : undefined}><Icon size={20} />{name}{pathname === href && <span className="nav-indicator" />}</Link>)}
        {isAdmin(user) && <><div className="nav-divider" /><Link href="/administration" onClick={() => setMenu(false)} className={`nav-link ${pathname === "/administration" ? "active" : ""}`}><Settings2 size={20} />Administration</Link></>}
      </nav>
      <div className="sidebar-bottom"><span className="small-label"><Radio size={15} /> Gemeinsam einsatzbereit</span><p>Planen. Teilnehmen.<br />Zusammen weiterkommen.</p><div className="sidebar-unit"><ShieldCheck size={18} /><span>Einheit {unit.name}<small>Freiwillige Feuerwehr</small></span></div></div>
    </aside>
    {menu && <button className="menu-scrim" aria-label="Menü schließen" onClick={() => setMenu(false)} />}
    <div className="main-shell">
      <header className="topbar">
        <div className="topbar-title">
          <button className="icon-button mobile-menu" aria-label={menu ? "Menü schließen" : "Menü öffnen"} onClick={() => setMenu(!menu)}>{menu ? <X size={22} /> : <Menu size={22} />}</button>
          <span>Mitgliederportal <span className="muted">/</span> <strong>{unit.name}</strong></span>
        </div>
        <div className="topbar-actions">
          <span className="local-indicator"><i /> Lokal gespeichert</span>
          <button className="icon-button" onClick={theme} aria-label="Farbschema wechseln">{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
          <Link href="/profil" className="profile-link">
            <span className="avatar">{initials}</span>
            <span className="profile-name">{user.name}<small>{ROLE_LABELS[user.roles[0].role]}</small></span>
            <span className="sr-only"> Demo-Profil wechseln</span><ChevronDown size={16} />
          </Link>
        </div>
      </header>
      <div className="demo-strip"><span className="demo-tag">DEMO</span><span>Inoffiziell · nur Testdaten eingeben · <Link href="/profil">ungeschützter Profilwechsel</Link></span><span className="demo-date">{dateLabel(now.toISOString(), { weekday: "long", year: "numeric" })}</span></div>
      <main id="main" className="content" tabIndex={-1}><PwaStatus />{children}</main>
      <footer className="footer"><span>Feuerwehr Odenthal <span className="muted">· Gemeinsam für unsere Gemeinde.</span></span><span>Lokale Demo · Europe/Berlin · keine produktive Anmeldung</span></footer>
    </div>
    <nav className="bottom-nav" aria-label="Mobile Navigation">{navigation.map(({ href, name, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "active" : ""} aria-current={pathname === href ? "page" : undefined}><Icon size={21} /><span>{name}</span></Link>)}</nav>
    <div className={`toast ${message ? "visible" : ""}`} role="status" aria-live="polite" key={message}>{message}</div>
  </div>;
}
