"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Icon } from "@/components/icon";
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
  accentClass,
}: {
  children: React.ReactNode;
  navItems: NavItem[];
  userName: string;
  roleLabel: string;
  accentClass: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function uitloggen() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-5 py-5">
          <div
            className={clsx(
              "flex h-10 w-10 items-center justify-center rounded-xl text-white",
              accentClass
            )}
          >
            <Icon name="book-open" size={22} />
          </div>
          <div>
            <p className="text-base font-semibold leading-tight text-slate-900">Dendron</p>
            <p className="text-xs text-slate-500">{roleLabel}</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2 md:py-4">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <Icon name={item.icon} size={20} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-4">
          <span className="truncate text-sm font-medium text-slate-700">{userName}</span>
          <button
            onClick={uitloggen}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <Icon name="logout" size={16} />
            Uitloggen
          </button>
        </div>
      </aside>

      <main className="flex-1 bg-slate-50 px-4 py-6 sm:px-6 md:px-10 md:py-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
