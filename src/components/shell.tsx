"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, CalendarDays, FolderOpen, ChartNoAxesCombined, UserRound, Settings2, ShieldCheck, Menu, Moon, Sun } from "lucide-react";
import { useDemo } from "./demo-provider";
import { isAdmin } from "@/domain/permissions";
import { ROLE_LABELS } from "@/config/app";
import { PwaStatus } from "./pwa-status";
import { BrandFlame, BrandLogo } from "./branding";
import { useTheme } from "./theme-provider";
import { Modal } from "./ui";

const navigation = [
  { href: "/", name: "Start", icon: LayoutDashboard },
  { href: "/termine", name: "Termine", icon: CalendarDays },
  { href: "/dokumente", name: "Dokumente", icon: FolderOpen },
  { href: "/statistik", name: "Statistik", icon: ChartNoAxesCombined },
  { href: "/profil", name: "Profil", icon: UserRound },
];
const normalizedPath = (path: string) => path.replace(/\/+$/, "") || "/";
export function Shell({ children }: { children: ReactNode }) {
  const { state, user, message } = useDemo();
  const { resolved, setPreference, error } = useTheme();
  const pathname = normalizedPath(usePathname());
  const [menu, setMenu] = useState(false);
  const unit = state.units.find((u) => u.id === user.unitId)!;
  const initials = user.name.split(" ").slice(0, 2).map((w) => w[0]).join("");
  return <div className="app-shell">
    <a className="skip-link" href="#main">Zum Inhalt springen</a>
    <aside className="sidebar"><SidebarContent /></aside>
    {menu && <Modal title="Navigation" close={() => setMenu(false)} className="drawer"><SidebarContent close={() => setMenu(false)} /></Modal>}
    <div className="main-shell">
      <header className="topbar">
        <div className="topbar-title">
          <button className="icon-button mobile-menu" aria-label="Menü öffnen" aria-haspopup="dialog" aria-expanded={menu} onClick={() => setMenu(true)}><Menu size={22} /></button>
          <Link href="/" className="header-brand"><BrandLogo /></Link>
          <span className="header-context">Mitgliederbereich<strong>{unit.name}</strong></span>
        </div>
        <div className="topbar-actions">
          <button className="icon-button theme-toggle" onClick={() => setPreference(resolved === "dark" ? "light" : "dark")} aria-label="Farbschema wechseln">{resolved === "dark" ? <Sun size={20} /> : <Moon size={20} />}</button>
          <Link href="/profil" className="profile-link">
            <span className="avatar">{initials}</span>
            <span className="profile-name">{user.name}<small>{ROLE_LABELS[user.roles[0].role]}</small></span>
            <span className="sr-only"> Demo-Profil wechseln</span>
          </Link>
        </div>
      </header>
      <div className="demo-strip"><span className="demo-tag">DEMO</span><span>Inoffiziell · nur Testdaten · <Link href="/profil">Profilwechsel ohne Anmeldung</Link></span></div>
      <main id="main" className="content" tabIndex={-1}><PwaStatus />{error && <p className="notice error" role="alert">{error}</p>}{children}</main>
      <footer className="footer"><span>Feuerwehr Odenthal · Gemeinsam einsatzbereit.</span><span>Lokale Demo · Europe/Berlin</span></footer>
    </div>
    <nav className="bottom-nav" aria-label="Mobile Navigation">{navigation.map(({ href, name, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "active" : ""} aria-current={pathname === href ? "page" : undefined}><span className="nav-icon"><Icon size={21} aria-hidden="true" /></span><span>{name}</span></Link>)}</nav>
    <div className={`toast ${message ? "visible" : ""}`} role="status" aria-live="polite" key={message}>{message}</div>
  </div>;
}

function SidebarContent({ close }: { close?: () => void }) {
  const { state, user } = useDemo();
  const pathname = normalizedPath(usePathname());
  const unit = state.units.find((item) => item.id === user.unitId)!;
  return <>
    <Link href="/" className="brand" onClick={close}><BrandFlame /><span><strong>Mein Dienst</strong><small>Feuerwehr Odenthal</small></span></Link>
    <span className="workspace-label">MITGLIEDERBEREICH</span>
    <nav aria-label="Hauptnavigation">{navigation.map(({ href, name, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${pathname === href ? "active" : ""}`} onClick={close} aria-current={pathname === href ? "page" : undefined}><Icon size={20} aria-hidden="true" />{name}</Link>)}
      {isAdmin(user) && <><div className="nav-divider" /><Link href="/administration" onClick={close} aria-current={pathname === "/administration" ? "page" : undefined} className={`nav-link ${pathname === "/administration" ? "active" : ""}`}><Settings2 size={20} aria-hidden="true" />Administration</Link></>}
    </nav>
    <div className="sidebar-bottom"><div className="sidebar-unit"><ShieldCheck size={20} aria-hidden="true" /><span>Einheit {unit.name}<small>Freiwillige Feuerwehr</small></span></div><p>Gemeinsam für unsere Gemeinde.</p></div>
  </>;
}
