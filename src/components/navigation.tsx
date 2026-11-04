"use client";

import Link from "next/link";
import { LayoutDashboard, CalendarDays, FolderOpen, ChartNoAxesCombined, UserRound, Settings2, ShieldCheck } from "lucide-react";
import { BrandFlame, BrandLogo } from "./branding";

export const navigation = [
  { href: "/", name: "Start", icon: LayoutDashboard },
  { href: "/termine", name: "Termine", icon: CalendarDays },
  { href: "/dokumente", name: "Dokumente", icon: FolderOpen },
  { href: "/statistik", name: "Statistik", icon: ChartNoAxesCombined },
  { href: "/profil", name: "Profil", icon: UserRound },
];
const administration = { href: "/administration", name: "Administration", icon: Settings2 };

export function SidebarNavigation({ pathname, unitName, admin, close, logo = false }: {
  pathname: string; unitName: string; admin: boolean; close?: () => void; logo?: boolean;
}) {
  return <>
    <Link href="/" className="brand" onClick={close}>{logo ? <BrandLogo /> : <><BrandFlame /><span><strong>Mein Dienst</strong><small>Feuerwehr Odenthal</small></span></>}</Link>
    <span className="workspace-label">MITGLIEDERBEREICH</span>
    <nav aria-label="Hauptnavigation">{[...navigation, ...(admin ? [administration] : [])].map(({ href, name, icon: Icon }) =>
      <Link key={href} href={href} onClick={close} aria-current={pathname === href ? "page" : undefined}
        className={`nav-link ${pathname === href ? "active" : ""}`}><Icon size={20} aria-hidden="true" />{name}</Link>)}</nav>
    <div className="sidebar-bottom"><div className="sidebar-unit"><ShieldCheck size={20} aria-hidden="true" /><span>Einheit {unitName}<small>Freiwillige Feuerwehr</small></span></div><p>Gemeinsam für unsere Gemeinde.</p></div>
  </>;
}

export function BottomNavigation({ pathname, admin = false }: { pathname: string; admin?: boolean }) {
  return <nav className="bottom-nav" aria-label="Mobile Navigation">{[...navigation, ...(admin ? [administration] : [])].map(({ href, name, icon: Icon }) =>
    <Link key={href} href={href} className={pathname === href ? "active" : ""} aria-current={pathname === href ? "page" : undefined}>
      <span className="nav-icon"><Icon size={21} aria-hidden="true" /></span><span>{name}</span></Link>)}</nav>;
}
