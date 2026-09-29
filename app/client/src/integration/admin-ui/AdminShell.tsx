import React from "react";
import type { ReactNode } from "react";
import type { MarketplaceUser } from "integration/marketplace";
import {
  AdminSettingsContent,
  AdminSettingsFrame,
  AdminSettingsNavigation,
} from "pages/AdminSettings/SettingsLayout";
import type { AdminSettingsNavSection } from "pages/AdminSettings/SettingsLayout";
import "./adminShell.css";

export type AdminSection =
  | "overview"
  | "groups"
  | "users"
  | "tags"
  | "sites"
  | "testcells"
  | "universal-variables"
  | "access";

interface AdminShellProps {
  children: ReactNode;
  currentUser: MarketplaceUser;
  section: AdminSection;
}

function isGroupAdmin(user: MarketplaceUser): boolean {
  return user.groupMemberships.some(
    (membership) => membership.role.toLowerCase() === "admin",
  );
}

const sectionHref: Record<AdminSection, string> = {
  overview: "/admin",
  groups: "/admin/groups",
  users: "/admin/users",
  tags: "/admin/tags",
  access: "/admin/access",
  sites: "/operations/sites",
  testcells: "/operations/testcells",
  "universal-variables": "/admin/universal-variables",
};

export function AdminShell({
  children,
  currentUser,
  section,
}: AdminShellProps): React.ReactElement {
  const canManageGroups =
    currentUser.isSystemAdmin || isGroupAdmin(currentUser);
  const sections: AdminSettingsNavSection[] = [
    {
      title: "Administration",
      items: [
        { title: "Overview", slug: "overview", icon: "settings-line" },
        ...(canManageGroups
          ? [{ title: "Groups", slug: "groups", icon: "user-3-line" }]
          : []),
        ...(currentUser.isSystemAdmin
          ? [
              { title: "Users", slug: "users", icon: "user-settings-line" },
              {
                title: "Marketplace tags",
                slug: "tags",
                icon: "file-list-2-line",
              },
              {
                title: "Access setup",
                slug: "access",
                icon: "shield-user-line",
              },
            ]
          : []),
      ],
    },
    {
      title: "Operations",
      items: [
        { title: "Sites", slug: "sites", icon: "map-pin-5-line" },
        { title: "Test cells", slug: "testcells", icon: "equalizer-line" },
        {
          title: "Universal variables",
          slug: "universal-variables",
          icon: "file-list-2-line",
        },
      ],
    },
  ];

  return (
    <div className="admin-shell">
      <header className="admin-shell__topbar">
        <a className="admin-shell__brand" href="/marketplace">
          <span aria-hidden="true" className="admin-shell__brand-mark">
            ▦
          </span>
          Operator Display
        </a>
        <nav aria-label="Main navigation" className="admin-shell__topnav">
          <a href="/marketplace">Marketplace</a>
          <a href="/workspace">Dashboards &amp; drafts</a>
          <a aria-current="page" href="/admin">
            Administration
          </a>
        </nav>
      </header>
      <AdminSettingsFrame className="admin-shell__layout">
        <AdminSettingsNavigation
          ariaLabel="Administration sections"
          currentCategory={section}
          hrefForCategory={(item) => sectionHref[item.slug as AdminSection]}
          sections={sections}
        />
        <AdminSettingsContent
          className="admin-shell__content"
          id="admin-content"
        >
          {children}
        </AdminSettingsContent>
      </AdminSettingsFrame>
    </div>
  );
}
