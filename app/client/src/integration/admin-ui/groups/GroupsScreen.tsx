import React, { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Button,
  Input,
  SearchInput,
  Tab,
  TabPanel,
  Tabs,
  TabsList,
  Table,
  Tag,
  Text,
} from "@appsmith/ads";
import type { TableColumn } from "@appsmith/ads";
import { MarketplaceHttpError } from "../../marketplace";
import type {
  MarketplaceGroup,
  MarketplacePage,
  MarketplaceUser,
} from "../../marketplace";
import type { GroupAdminClient, GroupMember } from "./GroupAdminClient";
import "./groupsScreen.css";

export type GroupsView = "list" | "new" | "detail" | "members";

export type GroupsScreenClient = Pick<
  GroupAdminClient,
  | "getCurrentUser"
  | "listGroups"
  | "getGroup"
  | "createGroup"
  | "updateGroup"
  | "listMembers"
  | "addMember"
  | "updateMemberRole"
  | "removeMember"
>;

export interface GroupsScreenProps {
  client: GroupsScreenClient;
  view: GroupsView;
  groupId?: number;
  /** The admin shell may provide its already loaded identity. */
  currentUser?: MarketplaceUser;
  onNavigate?: (href: string) => void;
}

const PAGE_SIZE = 20;

function groupHref(id: number): string {
  return `/admin/groups/${id}`;
}

function errorMessage(error: unknown, action: string): string {
  if (error instanceof MarketplaceHttpError) {
    if (error.status === 401)
      return "Your session expired. Sign in and try again.";

    if (error.status === 403)
      return "You do not have permission for this action.";

    return `${action} failed (HTTP ${error.status}). ${error.responseText.slice(0, 180)}`.trim();
  }

  if (error instanceof Error)
    return `${action} failed: ${error.message.slice(0, 180)}`;

  return `${action} failed. Please try again.`;
}

function isGroupAdmin(user: MarketplaceUser, groupId: number): boolean {
  return (
    user.isSystemAdmin ||
    user.groupMemberships.some(
      (membership) =>
        membership.groupId === groupId &&
        membership.role.toLowerCase() === "admin",
    )
  );
}

function isSystemGroup(group: MarketplaceGroup): boolean {
  return group.creationSource.toLowerCase() === "system";
}

function sourceLabel(group: MarketplaceGroup): string {
  switch (group.creationSource.toLowerCase()) {
    case "system":
      return "Built in";
    case "external":
      return "Entra linked";
    default:
      return "Application";
  }
}

function Notice({
  children,
  kind = "info",
}: {
  children: React.ReactNode;
  kind?: "info" | "error" | "success";
}): React.ReactElement {
  return (
    <div
      className={`groups-screen__notice groups-screen__notice--${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

function PageControls({
  meta,
  onPage,
}: {
  meta: MarketplacePage<unknown>["meta"];
  onPage: (cursor: number) => void;
}): React.ReactElement | null {
  if (meta.previousCursor === null && meta.nextCursor === null) return null;

  return (
    <nav aria-label="Pages" className="groups-screen__pagination">
      <Button
        isDisabled={meta.previousCursor === null}
        kind="secondary"
        onClick={() => onPage(meta.previousCursor ?? 0)}
        size="sm"
      >
        Previous
      </Button>
      <span>
        Page {meta.currentPage} of {meta.totalPages}
      </span>
      <Button
        isDisabled={meta.nextCursor === null}
        kind="secondary"
        onClick={() => onPage(meta.nextCursor ?? 0)}
        size="sm"
      >
        Next
      </Button>
    </nav>
  );
}

function GroupList({
  client,
  user,
}: {
  client: GroupsScreenClient;
  user: MarketplaceUser;
}): React.ReactElement {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"name-asc" | "name-desc" | "members-desc">(
    "name-asc",
  );
  const [cursor, setCursor] = useState<number | undefined>();
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<MarketplacePage<MarketplaceGroup> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    void client
      .listGroups(
        {
          cursor,
          limit: PAGE_SIZE,
          search,
          sort:
            sort === "members-desc"
              ? { field: "member_count", descending: true }
              : { field: "name", descending: sort === "name-desc" },
        },
        controller.signal,
      )
      .then((result) => {
        if (!controller.signal.aborted) setPage(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(errorMessage(reason, "Loading groups"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [client, cursor, refresh, search, sort]);

  const columns: TableColumn<MarketplaceGroup>[] = [
    {
      title: "Group",
      dataIndex: "name",
      render: (_name, group) => (
        <div className="groups-screen__primary-cell">
          <a href={groupHref(group.id)}>{group.name}</a>
          <span>{group.description || "No description"}</span>
        </div>
      ),
    },
    {
      title: "Source",
      dataIndex: "creationSource",
      render: (_source, group) => (
        <Tag isClosable={false}>{sourceLabel(group)}</Tag>
      ),
    },
    { title: "Members", dataIndex: "memberCount" },
    {
      title: "",
      dataIndex: "id",
      render: (_id, group) => <a href={groupHref(group.id)}>View group</a>,
    },
  ];

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setCursor(undefined);
    setSearch(searchInput.trim());
  }

  return (
    <section aria-label="Manage groups" className="groups-screen">
      <div className="groups-screen__heading">
        <div>
          <Text kind="heading-xl" renderAs="h1">
            Groups
          </Text>
          <p>Manage application groups and the users in them.</p>
        </div>
        {user.isSystemAdmin && (
          <a className="groups-screen__primary-link" href="/admin/groups/new">
            Create group
          </a>
        )}
      </div>

      <form className="groups-screen__toolbar" onSubmit={submitSearch}>
        <SearchInput
          aria-label="Search groups"
          onChange={setSearchInput}
          placeholder="Search groups"
          value={searchInput}
        />
        <Button kind="primary" size="sm" type="submit">
          Search
        </Button>
        <label className="groups-screen__sort">
          Sort by
          <select
            onChange={(event) => {
              setCursor(undefined);
              setSort(event.target.value as typeof sort);
            }}
            value={sort}
          >
            <option value="name-asc">Name A to Z</option>
            <option value="name-desc">Name Z to A</option>
            <option value="members-desc">Most members</option>
          </select>
        </label>
        <Button
          kind="secondary"
          onClick={() => setRefresh((value) => value + 1)}
          size="sm"
          type="button"
        >
          Refresh
        </Button>
      </form>

      {loading && <p role="status">Loading groups…</p>}
      {error && (
        <Notice kind="error">
          <p>{error}</p>
          <Button
            kind="secondary"
            onClick={() => setRefresh((value) => value + 1)}
            size="sm"
          >
            Retry
          </Button>
        </Notice>
      )}
      {!loading && !error && page && (
        <>
          <p className="groups-screen__count">{page.meta.totalItems} groups</p>
          {page.data.length ? (
            <Table
              columns={columns}
              data={page.data}
              isSortable={false}
              rowKey="id"
            />
          ) : (
            <Notice>No groups found for this search.</Notice>
          )}
          <PageControls meta={page.meta} onPage={setCursor} />
        </>
      )}
    </section>
  );
}

function CreateGroupScreen({
  client,
  onNavigate,
}: {
  client: GroupsScreenClient;
  onNavigate?: (href: string) => void;
}): React.ReactElement {
  const [mode, setMode] = useState<"application" | "entra">("application");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [externalGroupId, setExternalGroupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    const trimmedExternalId = externalGroupId.trim();

    if (!trimmedName) {
      setError("Group name is required.");

      return;
    }

    if (mode === "entra" && !trimmedExternalId) {
      setError("Enter the Entra group object ID to record.");

      return;
    }

    setBusy(true);

    try {
      const id = await client.createGroup({
        name: trimmedName,
        description: description.trim(),
        ...(mode === "entra" ? { externalGroupId: trimmedExternalId } : {}),
      });

      setCreatedId(id);

      if (onNavigate) onNavigate(groupHref(id));
      else if (typeof window !== "undefined")
        window.location.assign(groupHref(id));
    } catch (reason) {
      setError(errorMessage(reason, "Creating group"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Create group"
      className="groups-screen groups-screen__form-page"
    >
      <a className="groups-screen__back" href="/admin/groups">
        ← Groups
      </a>
      <Text kind="heading-xl" renderAs="h1">
        Create group
      </Text>
      <p>Use a group to organize people and marketplace content.</p>

      <form
        className="groups-screen__form"
        onSubmit={(event) => void create(event)}
      >
        <fieldset className="groups-screen__mode">
          <legend>Group source</legend>
          <label>
            <input
              checked={mode === "application"}
              onChange={() => setMode("application")}
              type="radio"
              value="application"
            />
            Application managed
          </label>
          <label>
            <input
              checked={mode === "entra"}
              onChange={() => setMode("entra")}
              type="radio"
              value="entra"
            />
            Record an Entra group
          </label>
        </fieldset>

        {mode === "entra" && (
          <Notice>
            This stores the Entra group ID with the group. This backend does not
            import or synchronize its members yet.
          </Notice>
        )}
        <Input isRequired label="Group name" onChange={setName} value={name} />
        <Input
          label="Description"
          onChange={setDescription}
          renderAs="textarea"
          value={description}
        />
        {mode === "entra" && (
          <Input
            isRequired
            label="Entra group object ID"
            onChange={setExternalGroupId}
            value={externalGroupId}
          />
        )}
        {error && <Notice kind="error">{error}</Notice>}
        {createdId && (
          <Notice kind="success">
            Group created. <a href={groupHref(createdId)}>Open group</a>
          </Notice>
        )}
        <div className="groups-screen__actions">
          <Button isDisabled={busy} kind="primary" type="submit">
            {busy ? "Creating…" : "Create group"}
          </Button>
          <a href="/admin/groups">Cancel</a>
        </div>
      </form>
    </section>
  );
}

function GroupGeneral({
  canManage,
  client,
  group,
  onSaved,
}: {
  client: GroupsScreenClient;
  group: MarketplaceGroup;
  canManage: boolean;
  onSaved: () => void;
}): React.ReactElement {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const editable = canManage && !isSystemGroup(group);

  useEffect(() => {
    setName(group.name);
    setDescription(group.description || "");
  }, [group]);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (!name.trim()) {
      setError("Group name is required.");

      return;
    }

    setBusy(true);

    try {
      await client.updateGroup(group.id, {
        name: name.trim(),
        description: description.trim(),
      });
      setSaved(true);
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason, "Saving group"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Group general settings"
      className="groups-screen__section"
    >
      <Text kind="heading-m" renderAs="h2">
        General
      </Text>
      <div className="groups-screen__details">
        <div>
          <span>Source</span>
          <strong>{sourceLabel(group)}</strong>
        </div>
        <div>
          <span>Group ID</span>
          <strong>{group.id}</strong>
        </div>
        {group.externalGroupId && (
          <div>
            <span>Entra group object ID</span>
            <strong>{group.externalGroupId}</strong>
          </div>
        )}
      </div>
      {group.externalGroupId && (
        <Notice>
          The linked ID is stored here. Member import and synchronization are
          not active.
        </Notice>
      )}
      {isSystemGroup(group) && (
        <Notice>This built-in group is shown for reference.</Notice>
      )}
      <form
        className="groups-screen__form"
        onSubmit={(event) => void save(event)}
      >
        <Input
          isDisabled={!editable || busy}
          label="Group name"
          onChange={setName}
          value={name}
        />
        <Input
          isDisabled={!editable || busy}
          label="Description"
          onChange={setDescription}
          renderAs="textarea"
          value={description}
        />
        {error && <Notice kind="error">{error}</Notice>}
        {saved && <Notice kind="success">Group details saved.</Notice>}
        {editable && (
          <div className="groups-screen__actions">
            <Button isDisabled={busy} kind="primary" type="submit">
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}
      </form>
      {editable && (
        <div className="groups-screen__delete-pending">
          <Text kind="heading-s" renderAs="h3">
            Delete group
          </Text>
          <p>
            Group deletion is waiting for the backend to remove dependent
            assignments safely.
          </p>
          <Button isDisabled kind="secondary" size="sm">
            Delete group
          </Button>
        </div>
      )}
    </section>
  );
}

function GroupMembers({
  client,
  group,
  user,
}: {
  client: GroupsScreenClient;
  group: MarketplaceGroup;
  user: MarketplaceUser;
}): React.ReactElement {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<number | undefined>();
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<MarketplacePage<GroupMember> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [memberId, setMemberId] = useState("");
  const [newRole, setNewRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [busyMemberId, setBusyMemberId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null);
  const canManage = isGroupAdmin(user, group.id);
  const canMutate = canManage && !isSystemGroup(group);

  useEffect(() => {
    if (!canManage) return;

    const controller = new AbortController();

    setLoading(true);
    setError(null);
    void client
      .listMembers(
        group.id,
        { cursor, limit: PAGE_SIZE, search },
        controller.signal,
      )
      .then((result) => {
        if (!controller.signal.aborted) setPage(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(errorMessage(reason, "Loading members"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [canManage, client, cursor, group.id, refresh, search]);

  async function add(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    setActionSuccess(null);
    const id = Number(memberId);

    if (!/^[1-9]\d*$/.test(memberId.trim()) || !Number.isSafeInteger(id)) {
      setActionError(
        "Enter an existing application user ID as a positive integer.",
      );

      return;
    }

    setAdding(true);

    try {
      await client.addMember(group.id, id, newRole);
      setMemberId("");
      setActionSuccess("Member added.");
      setCursor(undefined);
      setRefresh((value) => value + 1);
    } catch (reason) {
      setActionError(errorMessage(reason, "Adding member"));
    } finally {
      setAdding(false);
    }
  }

  async function changeRole(
    member: GroupMember,
    role: "MEMBER" | "ADMIN",
  ): Promise<void> {
    if (member.role.toUpperCase() === role) return;

    setActionError(null);
    setActionSuccess(null);
    setBusyMemberId(member.user.id);

    try {
      await client.updateMemberRole(group.id, member.user.id, role);
      setActionSuccess(`Updated ${member.user.username}'s role.`);
      setRefresh((value) => value + 1);
    } catch (reason) {
      setActionError(errorMessage(reason, "Changing member role"));
      setRefresh((value) => value + 1);
    } finally {
      setBusyMemberId(null);
    }
  }

  async function remove(member: GroupMember): Promise<void> {
    setActionError(null);
    setActionSuccess(null);
    setBusyMemberId(member.user.id);

    try {
      await client.removeMember(group.id, member.user.id);
      setActionSuccess(`${member.user.username} removed.`);
      setPendingRemoval(null);
      setCursor(undefined);
      setRefresh((value) => value + 1);
    } catch (reason) {
      setActionError(errorMessage(reason, "Removing member"));
    } finally {
      setBusyMemberId(null);
    }
  }

  const columns: TableColumn<GroupMember>[] = [
    {
      title: "User",
      dataIndex: "user",
      render: (_user, member) => (
        <div className="groups-screen__primary-cell">
          <strong>{member.user.username}</strong>
          <span>Application user ID {member.user.id}</span>
        </div>
      ),
    },
    {
      title: "Role",
      dataIndex: "role",
      render: (_role, member) =>
        canMutate ? (
          <select
            aria-label={`Role for ${member.user.username}`}
            disabled={busyMemberId !== null}
            onChange={(event) =>
              void changeRole(member, event.target.value as "MEMBER" | "ADMIN")
            }
            value={member.role.toUpperCase()}
          >
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
          </select>
        ) : (
          <Tag isClosable={false}>
            {member.role.toLowerCase() === "admin" ? "Admin" : "Member"}
          </Tag>
        ),
    },
    {
      title: "Added by",
      dataIndex: "addedBy",
      render: (_addedBy, member) => member.addedBy?.username || "—",
    },
    {
      title: "",
      dataIndex: "user",
      render: (_user, member) =>
        canMutate &&
        (pendingRemoval === member.user.id ? (
          <div className="groups-screen__row-actions">
            <span>Remove this member?</span>
            <Button
              isDisabled={busyMemberId !== null}
              kind="secondary"
              onClick={() => void remove(member)}
              size="sm"
            >
              Confirm
            </Button>
            <Button
              kind="tertiary"
              onClick={() => setPendingRemoval(null)}
              size="sm"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            isDisabled={busyMemberId !== null}
            kind="tertiary"
            onClick={() => setPendingRemoval(member.user.id)}
            size="sm"
          >
            Remove
          </Button>
        )),
    },
  ];

  if (!canManage) {
    return (
      <section aria-label="Group members" className="groups-screen__section">
        <Notice>Only group administrators can view this member list.</Notice>
      </section>
    );
  }

  return (
    <section aria-label="Group members" className="groups-screen__section">
      <Text kind="heading-m" renderAs="h2">
        Members
      </Text>
      {group.externalGroupId && (
        <Notice>
          Membership shown here is stored in this application. Entra group
          members are not imported or synchronized yet.
        </Notice>
      )}
      {isSystemGroup(group) && (
        <Notice>
          Membership changes to built-in groups are unavailable here.
        </Notice>
      )}

      {canMutate && (
        <form
          className="groups-screen__add-member"
          onSubmit={(event) => void add(event)}
        >
          <Input
            label="Application user ID"
            onChange={setMemberId}
            type="number"
            value={memberId}
          />
          <label>
            Role
            <select
              onChange={(event) =>
                setNewRole(event.target.value as typeof newRole)
              }
              value={newRole}
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <Button isDisabled={adding} kind="primary" type="submit">
            {adding ? "Adding…" : "Add member"}
          </Button>
          <p>
            Use the numeric ID of an existing application user, not an Entra
            user or group ID.
            {user.isSystemAdmin && (
              <>
                {" "}
                <a href="/admin/users">Find users</a>
              </>
            )}
          </p>
        </form>
      )}

      {actionError && <Notice kind="error">{actionError}</Notice>}
      {actionSuccess && <Notice kind="success">{actionSuccess}</Notice>}
      <form
        className="groups-screen__toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setCursor(undefined);
          setSearch(searchInput.trim());
        }}
      >
        <SearchInput
          aria-label="Search members"
          onChange={setSearchInput}
          placeholder="Search members"
          value={searchInput}
        />
        <Button kind="primary" size="sm" type="submit">
          Search
        </Button>
        <Button
          kind="secondary"
          onClick={() => setRefresh((value) => value + 1)}
          size="sm"
          type="button"
        >
          Refresh
        </Button>
      </form>
      {loading && <p role="status">Loading members…</p>}
      {error && (
        <Notice kind="error">
          <p>{error}</p>
          <Button
            kind="secondary"
            onClick={() => setRefresh((value) => value + 1)}
            size="sm"
          >
            Retry
          </Button>
        </Notice>
      )}
      {!loading && !error && page && (
        <>
          <p className="groups-screen__count">{page.meta.totalItems} members</p>
          {page.data.length ? (
            <Table
              columns={columns}
              data={page.data}
              isSortable={false}
              rowKey={(member) => member.user.id}
            />
          ) : (
            <Notice>No members found for this search.</Notice>
          )}
          <PageControls meta={page.meta} onPage={setCursor} />
        </>
      )}
    </section>
  );
}

function GroupDetail({
  client,
  groupId,
  onNavigate,
  user,
  view,
}: {
  client: GroupsScreenClient;
  groupId: number;
  onNavigate?: (href: string) => void;
  user: MarketplaceUser;
  view: "detail" | "members";
}): React.ReactElement {
  const [group, setGroup] = useState<MarketplaceGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    void client
      .getGroup(groupId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setGroup(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(errorMessage(reason, "Loading group"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [client, groupId, refresh]);

  return (
    <section
      aria-label="Group detail"
      className="groups-screen groups-screen__detail-page"
    >
      <a className="groups-screen__back" href="/admin/groups">
        ← Groups
      </a>
      {loading && <p role="status">Loading group…</p>}
      {error && (
        <Notice kind="error">
          <p>{error}</p>
          <Button
            kind="secondary"
            onClick={() => setRefresh((value) => value + 1)}
            size="sm"
          >
            Retry
          </Button>
        </Notice>
      )}
      {!loading && !error && group && (
        <>
          <div className="groups-screen__heading">
            <div>
              <Text kind="heading-xl" renderAs="h1">
                {group.name}
              </Text>
              <p>{group.description || "No description provided."}</p>
            </div>
            <Tag isClosable={false}>{sourceLabel(group)}</Tag>
          </div>
          <Tabs
            className="groups-screen__tabs"
            onValueChange={(tab: string) => {
              const href =
                tab === "members"
                  ? `${groupHref(group.id)}/members`
                  : groupHref(group.id);

              if (onNavigate) onNavigate(href);
              else window.location.assign(href);
            }}
            value={view === "members" ? "members" : "general"}
          >
            <TabsList aria-label="Group settings">
              <Tab value="general">General</Tab>
              <Tab value="members">Members</Tab>
            </TabsList>
            <TabPanel value="general">
              {view === "detail" && (
                <GroupGeneral
                  canManage={isGroupAdmin(user, group.id)}
                  client={client}
                  group={group}
                  onSaved={() => setRefresh((value) => value + 1)}
                />
              )}
            </TabPanel>
            <TabPanel value="members">
              {view === "members" && (
                <GroupMembers client={client} group={group} user={user} />
              )}
            </TabPanel>
          </Tabs>
        </>
      )}
    </section>
  );
}

/** Admin content; the standalone admin shell owns navigation and page framing. */
export function GroupsScreen({
  client,
  currentUser,
  groupId,
  onNavigate,
  view,
}: GroupsScreenProps): React.ReactElement {
  const [loadedUser, setLoadedUser] = useState<MarketplaceUser | null>(
    currentUser || null,
  );
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (currentUser) {
      setLoadedUser(currentUser);

      return;
    }

    const controller = new AbortController();

    void client
      .getCurrentUser(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setLoadedUser(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setIdentityError(errorMessage(reason, "Loading account"));
      });

    return () => controller.abort();
  }, [client, currentUser, retry]);

  if (identityError) {
    return (
      <section className="groups-screen">
        <Notice kind="error">
          <p>{identityError}</p>
          <Button
            kind="secondary"
            onClick={() => {
              setIdentityError(null);
              setRetry((value) => value + 1);
            }}
            size="sm"
          >
            Retry
          </Button>
        </Notice>
      </section>
    );
  }

  if (!loadedUser)
    return (
      <p className="groups-screen" role="status">
        Loading account…
      </p>
    );

  if (view === "new") {
    return loadedUser.isSystemAdmin ? (
      <CreateGroupScreen client={client} onNavigate={onNavigate} />
    ) : (
      <section className="groups-screen">
        <Notice kind="error">
          Only system administrators can create groups.
        </Notice>
      </section>
    );
  }

  if (view === "list") {
    const canList =
      loadedUser.isSystemAdmin ||
      loadedUser.adminOfAnyGroup ||
      loadedUser.groupMemberships.some(
        (membership) => membership.role.toLowerCase() === "admin",
      );

    return canList ? (
      <GroupList client={client} user={loadedUser} />
    ) : (
      <section className="groups-screen">
        <Notice>
          Only group administrators can open the group management list.
        </Notice>
      </section>
    );
  }

  if (!groupId || !Number.isSafeInteger(groupId) || groupId < 1) {
    return (
      <section className="groups-screen">
        <Notice kind="error">Invalid group ID.</Notice>
      </section>
    );
  }

  return (
    <GroupDetail
      client={client}
      groupId={groupId}
      onNavigate={onNavigate}
      user={loadedUser}
      view={view}
    />
  );
}
