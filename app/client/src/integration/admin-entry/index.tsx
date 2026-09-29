import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { ThemeProvider } from "styled-components";
import { Button, Text } from "@appsmith/ads";
import { lightTheme } from "selectors/themeSelectors";
import {
  MarketplaceClient,
  MarketplaceHttpError,
} from "integration/marketplace";
import type { MarketplaceUser } from "integration/marketplace";
import { AdminShell } from "integration/admin-ui/AdminShell";
import { GroupAdminClient, GroupsScreen } from "integration/admin-ui/groups";
import {
  AdminUsersTagsClient,
  TagsScreen,
  UsersScreen,
} from "integration/admin-ui/users-tags";
import { OperationsScreen } from "integration/admin-ui/operations";
import { adminRouteFromPath } from "./routes";
import type { AdminRoute } from "./routes";

const marketplaceClient = new MarketplaceClient();
const groupClient = new GroupAdminClient();
const usersTagsClient = new AdminUsersTagsClient();

function hasGroupAdminRole(user: MarketplaceUser): boolean {
  return user.groupMemberships.some(
    (membership) => membership.role.toLowerCase() === "admin",
  );
}

function sessionMessage(error: unknown): string {
  if (error instanceof MarketplaceHttpError && error.status === 401) {
    return "Your session expired. Sign in and reload this page.";
  }

  if (error instanceof MarketplaceHttpError) {
    return `Unable to load your account (HTTP ${error.status}).`;
  }

  return error instanceof Error
    ? error.message
    : "Unable to load your account.";
}

function Overview({ user }: { user: MarketplaceUser }): React.ReactElement {
  const canManageGroups = user.isSystemAdmin || hasGroupAdminRole(user);

  return (
    <section>
      <Text kind="heading-xl" renderAs="h1">
        Administration
      </Text>
      <p>Manage the application areas available to your account.</p>
      <div className="admin-shell__overview-grid">
        {canManageGroups && (
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
              <p>
                Review the group assignment workflows awaiting backend routes.
              </p>
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
        <div className="admin-shell__overview-card">
          <h2>Marketplace audience</h2>
          <p>Choose a group or public visibility for an uploaded item.</p>
          <Button isDisabled kind="secondary" size="sm">
            Assign item to group
          </Button>
        </div>
        <div className="admin-shell__overview-card">
          <h2>Site access</h2>
          <p>Grant an application group access to a site.</p>
          <Button isDisabled kind="secondary" size="sm">
            Assign site to group
          </Button>
        </div>
        <div className="admin-shell__overview-card">
          <h2>Test-cell access</h2>
          <p>Grant an application group access to a test cell.</p>
          <Button isDisabled kind="secondary" size="sm">
            Assign test cell to group
          </Button>
        </div>
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

function AdminPage({ route }: { route: AdminRoute }): React.ReactElement {
  const [user, setUser] = useState<MarketplaceUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setError(null);
    void marketplaceClient
      .getCurrentUser(controller.signal)
      .then((nextUser) => {
        if (!controller.signal.aborted) setUser(nextUser);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(sessionMessage(reason));
      });

    return () => controller.abort();
  }, [retry]);

  if (!user) {
    return (
      <div className="admin-shell">
        <div className="admin-shell__content">
          {error ? (
            <div className="admin-shell__error" role="alert">
              <p>{error}</p>
              <Button
                kind="secondary"
                onClick={() => setRetry((value) => value + 1)}
                size="sm"
              >
                Retry
              </Button>
            </div>
          ) : (
            <p role="status">Loading administration…</p>
          )}
        </div>
      </div>
    );
  }

  const section = route.kind === "groups" ? "groups" : route.kind;
  const allowed =
    (route.kind !== "users" && route.kind !== "access") || user.isSystemAdmin;

  return (
    <AdminShell currentUser={user} section={section}>
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

/** Standalone admin entry; it never starts Appsmith workspace or settings sagas. */
export function startAdmin(root: HTMLElement): void {
  const route = adminRouteFromPath(window.location.pathname);

  ReactDOM.render(
    <ThemeProvider theme={lightTheme}>
      <AdminPage route={route} />
    </ThemeProvider>,
    root,
  );
}
