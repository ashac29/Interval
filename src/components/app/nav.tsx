"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, Package, ShoppingBag, Sun, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/plan", label: "Plan", icon: CalendarRange },
  { href: "/supply", label: "Supply", icon: Package },
  { href: "/account", label: "Account", icon: UserRound },
] as const;

const active = (path: string, href: string) => path === href || path.startsWith(href + "/");

export function SidebarNav() {
  const path = usePathname();
  const items = [...ITEMS.slice(0, 3), { href: "/shop", label: "Shop", icon: ShoppingBag }, ITEMS[3]];
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active(path, href) ? "page" : undefined}
          className={cn("flex items-center gap-3 rounded-full px-4 py-2.5 text-[0.95rem] font-medium transition-colors", active(path, href) ? "bg-espresso text-cream" : "text-taupe-strong hover:bg-cream-deep hover:text-espresso")}
        >
          <Icon className="size-[1.1rem]" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const on = active(path, href);
          return (
            <li key={href}>
              <Link href={href} aria-current={on ? "page" : undefined} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium", on ? "text-espresso" : "text-taupe-strong")}>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", on && "bg-espresso text-cream")}>
                  <Icon className="size-[1.15rem]" aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
