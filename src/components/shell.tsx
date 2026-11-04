"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu, Moon, Sun } from "lucide-react";
import { useDemo } from "./demo-provider";
import { isAdmin } from "@/domain/permissions";
import { ROLE_LABELS } from "@/config/app";
import { PwaStatus } from "./pwa-status";
import { BrandLogo } from "./branding";
import { SidebarNavigation, BottomNavigation } from "./navigation";
import { useTheme } from "./theme-provider";
import { Modal } from "./ui";

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
    <BottomNavigation pathname={pathname} />
    <div className={`toast ${message ? "visible" : ""}`} role="status" aria-live="polite" key={message}>{message}</div>
  </div>;
}

function SidebarContent({ close }: { close?: () => void }) {
  const { state, user } = useDemo();
  const pathname = normalizedPath(usePathname());
  const unit = state.units.find((item) => item.id === user.unitId)!;
  return <SidebarNavigation pathname={pathname} unitName={unit.name} admin={isAdmin(user)} close={close} />;
}
