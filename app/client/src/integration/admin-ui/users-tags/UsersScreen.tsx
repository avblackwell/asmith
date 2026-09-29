import React, { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, Input, SearchInput, Table, Tag, Text } from "@appsmith/ads";
import type { MarketplacePage, MarketplaceUser } from "../../marketplace";
import { AdminPager, adminError } from "./screenShared";
import type { AdminUsersTagsClient } from "./AdminUsersTagsClient";
import "./adminUsersTags.css";

export type UsersScreenClient = Pick<
  AdminUsersTagsClient,
  "getCurrentUser" | "listUsers" | "getUser" | "addUser"
>;

export interface UsersScreenProps {
  client: UsersScreenClient;
  /** Internal user_info.id from /admin/users/:id, when showing detail. */
  userId?: number | null;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function UserDetail({
  client,
  userId,
}: {
  client: UsersScreenClient;
  userId: number;
}): React.ReactElement {
  const [user, setUser] = useState<MarketplaceUser | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError("");
    setUser(null);
    void client
      .getUser(userId, controller.signal)
      .then(setUser)
      .catch((caught: unknown) => {
        if (!isAbort(caught)) setError(adminError(caught, "Load user"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [client, userId, revision]);

  return (
    <section aria-label="User details" className="admin-entity__content">
      <a className="admin-entity__back" href="/admin/users">
        ← All users
      </a>
      {loading && <p role="status">Loading user…</p>}
      {error && (
        <div
          className="admin-entity__notice admin-entity__notice--error"
          role="alert"
        >
          <p>{error}</p>
          <Button
            kind="secondary"
            onClick={() => setRevision((n) => n + 1)}
            size="sm"
          >
            Retry
          </Button>
        </div>
      )}
      {user && (
        <>
          <div className="admin-entity__heading">
            <div>
              <Text kind="heading-l" renderAs="h1">
                {user.username}
              </Text>
              <p>Application user ID {user.id}</p>
            </div>
            {user.isSystemAdmin && <Tag isClosable={false}>System admin</Tag>}
          </div>
          <div className="admin-entity__card">
            <Text kind="heading-s" renderAs="h2">
              Group memberships
            </Text>
            {user.groupMemberships.length === 0 ? (
              <p>No group memberships are recorded for this user.</p>
            ) : (
              <ul className="admin-entity__memberships">
                {user.groupMemberships.map((membership) => (
                  <li key={membership.groupId}>
                    <div>
                      <a href={`/admin/groups/${membership.groupId}`}>
                        {membership.groupName}
                      </a>
                      <small>Group ID {membership.groupId}</small>
                    </div>
                    <div className="admin-entity__membership-role">
                      <Tag isClosable={false}>{membership.role}</Tag>
                      {membership.addedBy && (
                        <small>Added by {membership.addedBy.username}</small>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="admin-entity__hint">
            User editing and deletion are awaiting backend support. Group
            membership is managed on each group’s Members page.
          </p>
        </>
      )}
    </section>
  );
}

function UserDirectory({
  client,
}: {
  client: UsersScreenClient;
}): React.ReactElement {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(0);
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState<MarketplacePage<MarketplaceUser> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError("");
    setPage(null);
    void client
      .listUsers(
        {
          cursor,
          limit: 20,
          search,
          sorts: [{ field: "username", descending }],
        },
        controller.signal,
      )
      .then(setPage)
      .catch((caught: unknown) => {
        if (!isAbort(caught)) setError(adminError(caught, "Load users"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [client, cursor, descending, revision, search]);

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setCursor(0);
    setSearch(input.trim());
  }

  async function submitUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const proposed = username.trim();

    if (!proposed || adding) return;

    setAdding(true);
    setAddError("");
    setSuccess("");
    try {
      const id = await client.addUser(proposed);
      // A successful HTTP status alone is not enough; confirm the record exists.
      const created = await client.getUser(id);

      setAddOpen(false);
      setUsername("");
      setSuccess(
        `Created ${created.username} (application user ID ${created.id}).`,
      );
      setCursor(0);
      setRevision((n) => n + 1);
    } catch (caught) {
      setAddError(adminError(caught, "Add user"));
    } finally {
      setAdding(false);
    }
  }

  const columns = [
    {
      title: "Username",
      dataIndex: "username",
      key: "username",
      render: (_: unknown, user: MarketplaceUser) => (
        <a href={`/admin/users/${user.id}`}>{user.username}</a>
      ),
    },
    { title: "Application ID", dataIndex: "id", key: "id" },
    {
      title: "Groups",
      dataIndex: "groupMemberships",
      key: "groups",
      render: (_: unknown, user: MarketplaceUser) =>
        user.groupMemberships.length,
    },
    {
      title: "Access",
      dataIndex: "isSystemAdmin",
      key: "access",
      render: (_: unknown, user: MarketplaceUser) =>
        user.isSystemAdmin ? "System admin" : "User",
    },
  ];

  return (
    <section aria-label="Users directory" className="admin-entity__content">
      <div className="admin-entity__heading">
        <div>
          <Text kind="heading-l" renderAs="h1">
            Users
          </Text>
          <p>Application accounts and their group memberships.</p>
        </div>
        <Button kind="primary" onClick={() => setAddOpen(true)} size="sm">
          Add user
        </Button>
      </div>
      <form className="admin-entity__toolbar" onSubmit={submitSearch}>
        <SearchInput
          onChange={setInput}
          placeholder="Search username or ID"
          value={input}
        />
        <Button kind="secondary" size="sm" type="submit">
          Search
        </Button>
        <label>
          Sort
          <select
            onChange={(event) => {
              setCursor(0);
              setDescending(event.target.value === "desc");
            }}
            value={descending ? "desc" : "asc"}
          >
            <option value="asc">Username A–Z</option>
            <option value="desc">Username Z–A</option>
          </select>
        </label>
        <Button
          kind="tertiary"
          onClick={() => setRevision((n) => n + 1)}
          size="sm"
          type="button"
        >
          Refresh
        </Button>
      </form>
      {success && (
        <p className="admin-entity__notice" role="status">
          {success}
        </p>
      )}
      {addOpen && (
        <form
          className="admin-entity__card admin-entity__form"
          onSubmit={(event) => void submitUser(event)}
        >
          <Text kind="heading-s" renderAs="h2">
            Add an application user
          </Text>
          <p>
            Enter the username that the person uses to sign in. This creates an
            application record; it does not invite them to Microsoft Entra.
          </p>
          <p className="admin-entity__notice">
            The current backend’s new-user path is known to fail. The form is
            ready for the backend fix, and any server error will appear here.
          </p>
          <Input
            isRequired
            label="Username"
            onChange={setUsername}
            value={username}
          />
          {addError && (
            <p
              className="admin-entity__notice admin-entity__notice--error"
              role="alert"
            >
              {addError}
            </p>
          )}
          <div className="admin-entity__actions">
            <Button
              isDisabled={adding || !username.trim()}
              kind="primary"
              size="sm"
              type="submit"
            >
              {adding ? "Adding…" : "Add user"}
            </Button>
            <Button
              isDisabled={adding}
              kind="secondary"
              onClick={() => {
                setAddOpen(false);
                setAddError("");
              }}
              size="sm"
              type="button"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      <div aria-busy={loading} className="admin-entity__table-wrap">
        {loading && <p role="status">Loading users…</p>}
        {error && (
          <div
            className="admin-entity__notice admin-entity__notice--error"
            role="alert"
          >
            <p>{error}</p>
            <Button
              kind="secondary"
              onClick={() => setRevision((n) => n + 1)}
              size="sm"
            >
              Retry
            </Button>
          </div>
        )}
        {!loading && !error && page && (
          <>
            <p className="admin-entity__count">{page.meta.totalItems} users</p>
            <Table<MarketplaceUser>
              columns={columns}
              data={page.data}
              emptyText="No users found."
              rowKey="id"
            />
            <AdminPager
              ariaLabel="User pages"
              busy={loading}
              meta={page.meta}
              onPage={setCursor}
            />
          </>
        )}
      </div>
    </section>
  );
}

export function UsersScreen({
  client,
  userId = null,
}: UsersScreenProps): React.ReactElement {
  const [currentUser, setCurrentUser] = useState<MarketplaceUser | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setCurrentUser(null);
    setError("");
    void client
      .getCurrentUser(controller.signal)
      .then(setCurrentUser)
      .catch((caught: unknown) => {
        if (!isAbort(caught)) setError(adminError(caught, "Load account"));
      });

    return () => controller.abort();
  }, [client, revision]);

  if (error) {
    return (
      <div
        className="admin-entity__notice admin-entity__notice--error"
        role="alert"
      >
        <p>{error}</p>
        <Button
          kind="secondary"
          onClick={() => setRevision((n) => n + 1)}
          size="sm"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!currentUser) return <p role="status">Loading account…</p>;

  if (!currentUser.isSystemAdmin) {
    return (
      <p className="admin-entity__notice" role="alert">
        User administration requires system administrator access.
      </p>
    );
  }

  return userId === null ? (
    <UserDirectory client={client} />
  ) : (
    <UserDetail client={client} userId={userId} />
  );
}
