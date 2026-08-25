"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { Icon } from "@/components/icon";
import { Logo } from "@/components/logo";
import { NavLinkStatus } from "@/components/nav-link-status";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export function NavShell({
  children,
  navItems,
  userName,
  roleLabel,
  canvasClassName = "bg-slate-50",
  bottomNav,
}: {
  children: React.ReactNode;
  navItems: NavItem[];
  userName: string;
  roleLabel: string;
  /** Achtergrond van het scherm zelf - kind-omgeving krijgt een zachte, speelse tint. */
  canvasClassName?: string;
  /** Duimvriendelijke navigatiebalk onderaan op mobiel, met eventueel een uitgelicht 'snel toevoegen'-knopje in het midden. */
  bottomNav?: {
    items: [NavItem, NavItem, NavItem, NavItem];
    quickAdd?: { href: string; label: string; icon: string };
  };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [uitloggenBezig, setUitloggenBezig] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Menu dicht bij het navigeren naar een andere pagina - anders blijft het
  // openstaan boven de nieuwe pagina. State aanpassen tijdens het renderen
  // (i.p.v. in een effect) is hier het aanbevolen patroon voor "reset state
  // when a prop changes" - zie https://react.dev/learn/you-might-not-need-an-effect.
  const [vorigePathname, setVorigePathname] = useState(pathname);
  if (pathname !== vorigePathname) {
    setVorigePathname(pathname);
    setMenuOpen(false);
  }

  async function uitloggen() {
    setUitloggenBezig(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function isActief(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      <aside className="w-full shrink-0 border-b border-slate-200 bg-white md:flex md:w-64 md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-3 px-5 py-4 md:py-5">
          <div className="flex items-center gap-3">
            <Logo size="sm" withWordmark={false} />
            <div>
              <p className="font-heading text-base font-bold leading-tight text-slate-900">Dendron</p>
              <p className="text-xs text-slate-500">{roleLabel}</p>
            </div>
          </div>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 md:hidden"
            aria-label={menuOpen ? "Menu sluiten" : "Menu openen"}
            aria-expanded={menuOpen}
          >
            <Icon name={menuOpen ? "close" : "menu"} size={24} />
          </button>
        </div>

        <div className={clsx("flex-col", menuOpen ? "flex" : "hidden", "md:flex md:flex-1")}>
          <nav className="flex flex-col gap-1 px-3 py-2 md:flex-1 md:py-4">
            {navItems.map((item) => {
              const active = isActief(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-colors active:scale-[0.98]",
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200"
                  )}
                >
                  <NavLinkStatus icon={item.icon} size={20} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-4">
            <span className="truncate text-sm font-medium text-slate-700">{userName}</span>
            <button
              onClick={uitloggen}
              disabled={uitloggenBezig}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
            >
              <Icon name={uitloggenBezig ? "loader" : "logout"} size={16} className={uitloggenBezig ? "animate-spin" : undefined} />
              {uitloggenBezig ? "Bezig..." : "Uitloggen"}
            </button>
          </div>
        </div>
      </aside>

      <main
        className={clsx(
          "flex-1 px-4 py-6 sm:px-6 md:px-10 md:py-10",
          canvasClassName,
          bottomNav && "pb-40 md:pb-10"
        )}
      >
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>

      {bottomNav && (
        <nav
          aria-label="Snelle navigatie"
          // Extra hoog boven de onderrand (i.p.v. de gebruikelijke ~12px) -
          // Netlify plaatst op dit soort projecten zelf een "Powered by
          // Netlify"-badge rechtsonder, die anders precies over de rechter
          // navigatie-iconen heen valt.
          className="fixed inset-x-3 bottom-16 z-30 flex items-center justify-between gap-1 rounded-full bg-white/95 px-2 py-1.5 shadow-[0_10px_30px_-8px_rgba(15,23,42,0.28)] ring-1 ring-slate-900/5 backdrop-blur md:hidden"
        >
          {bottomNav.items.slice(0, 2).map((item) => (
            <BottomNavItem key={item.href} item={item} actief={isActief(item.href)} />
          ))}

          {bottomNav.quickAdd && (
            <Link
              href={bottomNav.quickAdd.href}
              aria-label={bottomNav.quickAdd.label}
              className="-mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_8px_20px_-4px_rgba(244,63,94,0.6)] transition-transform active:scale-95"
            >
              <Icon name={bottomNav.quickAdd.icon} size={26} />
            </Link>
          )}

          {bottomNav.items.slice(2, 4).map((item) => (
            <BottomNavItem key={item.href} item={item} actief={isActief(item.href)} />
          ))}
        </nav>
      )}
    </div>
  );
}

function BottomNavItem({ item, actief }: { item: NavItem; actief: boolean }) {
  return (
    <Link
      href={item.href}
      className={clsx(
        "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-1 py-2 text-[11px] font-semibold transition-colors",
        actief ? "text-rose-600" : "text-slate-400 hover:text-slate-600"
      )}
    >
      <Icon name={item.icon} size={22} className={actief ? "text-rose-600" : undefined} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
