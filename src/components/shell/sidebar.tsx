"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  ChevronLeft,
  KanbanSquare,
  Moon,
  Sun,
  Sunrise,
  Trophy,
  Users,
} from "lucide-react";
import type { Profile, UserRole } from "@/lib/types";
import { avatarTint, initials } from "@/lib/format";
import { SignOutButton } from "./sign-out-button";
import { NotificationBell } from "./notification-bell";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string }>;
  roles: UserRole[];
}

const NAV: NavItem[] = [
  { href: "/board", label: "Work", icon: KanbanSquare, roles: ["admin", "strategist", "designer"] },
  { href: "/my-day", label: "My Day", icon: Sunrise, roles: ["designer"] },
  { href: "/analytics", label: "Analytics", icon: BarChart3, roles: ["admin", "strategist"] },
  { href: "/scorecards", label: "Scorecards", icon: Trophy, roles: ["admin", "designer"] },
  { href: "/brands", label: "Brands", icon: Building2, roles: ["admin", "strategist"] },
  { href: "/team", label: "Team", icon: Users, roles: ["admin"] },
];

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  strategist: "Strategist",
  designer: "Designer",
};

export function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    setCollapsed(localStorage.getItem("ctms-rail") === "1");
    setTheme((localStorage.getItem("ctms-theme") as "dark" | "light") ?? "light");
  }, []);

  function toggleRail() {
    setCollapsed((value) => {
      localStorage.setItem("ctms-rail", value ? "0" : "1");
      return !value;
    });
  }

  function toggleTheme() {
    setTheme((value) => {
      const nextTheme = value === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", nextTheme);
      localStorage.setItem("ctms-theme", nextTheme);
      return nextTheme;
    });
  }

  const items = NAV.filter((item) => item.roles.includes(profile.role));

  return (
    <nav
      data-collapsed={collapsed}
      className="flex shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface)] transition-[width] duration-200 ease-[var(--ease-out-quick)]"
      style={{ width: collapsed ? 60 : 224 }}
    >
      <div className="flex h-14 items-center gap-2.5 px-4">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[13px] font-bold text-white"
          style={{ background: "var(--color-accent)" }}
        >
          C
        </span>
        {!collapsed && (
          <span className="truncate text-[14px] font-semibold tracking-tight">Creative TMS</span>
        )}
      </div>

      <ul className="mt-2 flex-1 space-y-0.5 px-2.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] transition-colors ${
                  active
                    ? "bg-[var(--color-surface-3)] font-medium text-[var(--color-ink)]"
                    : "text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                }`}
              >
                <span className="shrink-0" style={{ color: active ? "var(--color-accent)" : undefined }}>
                  <Icon size={16} />
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="space-y-2 border-t border-[var(--color-line)] p-2.5">
        <Link
          href="/profile"
          title="Your profile"
          className="flex items-center gap-2 rounded-[var(--radius-md)] px-1.5 py-1.5 transition-colors hover:bg-[var(--color-surface-2)]"
        >
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
              style={{ background: avatarTint(profile.id) }}
            >
              {initials(profile.full_name, profile.email)}
            </span>
          )}
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium leading-tight">
                {profile.full_name || profile.email.split("@")[0]}
              </p>
              <p className="text-[11px] leading-tight text-[var(--color-ink-3)]">
                {ROLE_LABEL[profile.role]}
              </p>
            </div>
          )}
        </Link>

        {!collapsed && (
          <div className="flex justify-end px-1.5">
            <SignOutButton />
          </div>
        )}

        <div className={`flex gap-1 ${collapsed ? "flex-col" : ""}`}>
          <NotificationBell collapsed={collapsed} />
          <button
            onClick={toggleTheme}
            title="Switch theme"
            aria-label="Switch theme"
            className="grid h-7 flex-1 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            onClick={toggleRail}
            title={collapsed ? "Expand" : "Collapse"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="grid h-7 flex-1 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
          >
            <ChevronLeft
              size={14}
              style={{ transform: collapsed ? "rotate(180deg)" : undefined, transition: "transform .2s" }}
            />
          </button>
          {collapsed && <SignOutButton />}
        </div>
      </div>
    </nav>
  );
}
