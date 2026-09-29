import React from "react";
import { Button, Text } from "@appsmith/ads";
import type { MarketplaceUser } from "../marketplace";
import { AdminShell } from "./AdminShell";
import { adminRouteFromPath } from "./routes";
import type { AdminRoute } from "./routes";
import { GroupAdminClient } from "./groups/GroupAdminClient";
import { GroupsScreen } from "./groups/GroupsScreen";
import { AdminUsersTagsClient } from "./users-tags/AdminUsersTagsClient";
import { UsersScreen } from "./users-tags/UsersScreen";
import { TagsScreen } from "./users-tags/TagsScreen";
import { OperationsScreen } from "./operations/OperationsScreen";

const groupClient = new GroupAdminClient();
const usersTagsClient = new AdminUsersTagsClient();

function canManageGroups(user: MarketplaceUser): boolean {
  return (
    user.isSystemAdmin ||
    user.groupMemberships.some(
      (membership) => membership.role.toLowerCase() === "admin",
    )
  );
}

function Overview({ user }: { user: MarketplaceUser }): React.ReactElement {
  return (
    <section>
      <Text kind="heading-xl" renderAs="h1">
        Administration
      </Text>
      <p>Manage the application areas available to your account.</p>
      <div className="admin-shell__overview-grid">
        {canManageGroups(user) && (
          <a className="admin-shell__overview-card" href="/admin/groups">
            <h2>Groups and members</h2>
            <p>Review group details, roles, and membership.</p>
          </a>
        )}
        {user.isSystemAdmin && (
          <>
            <a className="admin-shell__overview-card" href="/admin/users">
              <h2>Users</h2>
              <p>Browse application accounts and their group memberships.</p>
            </a>
            <a className="admin-shell__overview-card" href="/admin/tags">
              <h2>Marketplace tags</h2>
              <p>Create and maintain tags used to organize assets.</p>
            </a>
            <a className="admin-shell__overview-card" href="/admin/access">
              <h2>Access setup</h2>
              <p>Review the group assignment workflows awaiting backend routes.</p>
            </a>
          </>
        )}
        <a className="admin-shell__overview-card" href="/operations/sites">
          <h2>Sites</h2>
          <p>Browse the site directory and available test cells.</p>
        </a>
        <a className="admin-shell__overview-card" href="/operations/testcells">
          <h2>Test cells</h2>
          <p>Inspect current cell records and state.</p>
        </a>
        <a
          className="admin-shell__overview-card"
          href="/admin/universal-variables"
        >
          <h2>Universal variables</h2>
          <p>Inspect the variable catalog and available units.</p>
        </a>
      </div>
    </section>
  );
}

function AccessScreen(): React.ReactElement {
  return (
    <section>
      <Text kind="heading-xl" renderAs="h1">
        Access setup
      </Text>
      <p>
        Access is modeled through application groups, item assignments, and site
        and test-cell assignments.
      </p>
      <div className="admin-shell__pending" role="note">
        The backend stores these assignments but does not expose routes to add
        or remove them. The controls below will become available when those
        contracts are implemented.
      </div>
      <div className="admin-shell__overview-grid">
        {[
          {
            title: "Marketplace audience",
            description: "Choose a group or public visibility for an uploaded item.",
            action: "Assign item to group",
          },
          {
            title: "Site access",
            description: "Grant an application group access to a site.",
            action: "Assign site to group",
          },
          {
            title: "Test-cell access",
            description: "Grant an application group access to a test cell.",
            action: "Assign test cell to group",
          },
        ].map(({ action, description, title }) => (
          <div className="admin-shell__overview-card" key={action}>
            <h2>{title}</h2>
            <p>{description}</p>
            <Button isDisabled kind="secondary" size="sm">
              {action}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function RouteContent({
  route,
  user,
}: {
  route: AdminRoute;
  user: MarketplaceUser;
}): React.ReactElement {
  if (route.kind === "overview") return <Overview user={user} />;

  if (route.kind === "groups") {
    return (
      <GroupsScreen
        client={groupClient}
        currentUser={user}
        groupId={route.id}
        view={route.view}
      />
    );
  }

  if (route.kind === "users") {
    return <UsersScreen client={usersTagsClient} userId={route.id} />;
  }

  if (route.kind === "tags") return <TagsScreen client={usersTagsClient} />;
  if (route.kind === "access") return <AccessScreen />;

  if (route.kind === "sites" || route.kind === "testcells") {
    return <OperationsScreen id={route.id} kind={route.kind} />;
  }

  return <OperationsScreen id={route.id} kind="universal-variables" />;
}

/** Java-backed administration inside the copied Appsmith settings layout. */
export function AdminPage({
  pathname = window.location.pathname,
  user,
}: {
  pathname?: string;
  user: MarketplaceUser;
}): React.ReactElement {
  let route: AdminRoute;

  try {
    route = adminRouteFromPath(pathname);
  } catch {
    return (
      <section role="alert">
        <h1>Administration page not found</h1>
        <a href="/admin">Back to administration</a>
      </section>
    );
  }

  const allowed =
    (route.kind !== "users" && route.kind !== "access") ||
    user.isSystemAdmin;

  return (
    <AdminShell currentUser={user} section={route.kind}>
      {allowed ? (
        <RouteContent route={route} user={user} />
      ) : (
        <div className="admin-shell__error" role="alert">
          You need system administrator access to view this page.
        </div>
      )}
    </AdminShell>
  );
}
