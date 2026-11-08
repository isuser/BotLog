import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, test } from "vitest";
import { applyMigrations, as, createDb, createUser, one, type Claims } from "./harness";

const SHARED_PROJECTS = "20261107233751_shared_projects.sql";

let db: PGlite;
let counter = 0;

beforeAll(async () => {
  db = await createDb();
}, 30_000);

const human = (sub: string): Claims => ({ sub });
const token = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

async function newUser(prefix = "user") {
  return createUser(db, `${prefix}${++counter}@example.com`);
}

async function createProject(sub: string, key = "BOT") {
  return as(db, human(sub), (tx) =>
    one<{ id: string }>(tx, "insert into project (name, key) values ('Shared', $1) returning id", [key]),
  );
}

async function createAgent(sub: string) {
  return as(db, human(sub), async (tx) => {
    const agent = await one<{ id: string }>(tx, "insert into agent (name) values ('Bot') returning id");
    const key = await one<{ id: string }>(
      tx,
      "insert into api_key (agent_id, name, prefix, hash) values ($1, 'k', 'bl_abcd', $2) returning id",
      [agent.id, token()],
    );
    return { sub, agent_id: agent.id, api_key_id: key.id } satisfies Claims;
  });
}

const hashOf = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Creates an invite and returns its token; only the token's hash is stored. */
async function createInvite(claims: Claims, projectId: string, role = "member", raw = token()) {
  await as(db, claims, (tx) =>
    tx.query("insert into project_invite (project_id, token_hash, role) values ($1, $2, $3)", [projectId, hashOf(raw), role]),
  );
  return raw;
}

const accept = (claims: Claims, raw: string) =>
  as(db, claims, (tx) => one<{ project_id: string }>(tx, "select public.accept_project_invite($1) as project_id", [raw]));

/** Invites `userId` with `role` (as the owner) and accepts as them. */
async function addMember(ownerId: string, projectId: string, userId: string, role = "member") {
  await accept(human(userId), await createInvite(human(ownerId), projectId, role));
}

const count = (claims: Claims, sql: string, params: unknown[] = []) =>
  as(db, claims, async (tx) => (await one<{ n: number }>(tx, `select count(*)::int as n from (${sql}) x`, params)).n);

const run = (claims: Claims, sql: string, params: unknown[] = []) => as(db, claims, (tx) => tx.query(sql, params));

/** A project with an owner, an admin, a member and an outsider, each with an agent. */
async function world() {
  const owner = await newUser("owner");
  const admin = await newUser("admin");
  const member = await newUser("member");
  const outsider = await newUser("outsider");
  const project = await createProject(owner);
  await addMember(owner, project.id, admin, "admin");
  await addMember(owner, project.id, member, "member");
  return {
    owner,
    admin,
    member,
    outsider,
    projectId: project.id,
    ownerAgent: await createAgent(owner),
    adminAgent: await createAgent(admin),
    memberAgent: await createAgent(member),
    outsiderAgent: await createAgent(outsider),
  };
}

async function createTask(claims: Claims, projectId: string, extra: Record<string, unknown> = {}) {
  const cols = Object.keys(extra);
  return as(db, claims, (tx) =>
    one<{ id: string; version: number }>(
      tx,
      `insert into task (project_id, title, position${cols.map((c) => `, ${c}`).join("")})
       values ($1, 't', 'a0'${cols.map((_, i) => `, $${i + 2}`).join("")}) returning id, version`,
      [projectId, ...Object.values(extra)],
    ),
  );
}

describe("membership", () => {
  test("creating a project makes the creator its only owner, and they can read it back", async () => {
    const owner = await newUser();
    const project = await createProject(owner);
    const members = await as(db, human(owner), async (tx) =>
      (await tx.query("select user_id, role from project_member where project_id = $1", [project.id])).rows,
    );
    expect(members).toEqual([{ user_id: owner, role: "owner" }]);

    // An agent creating a project makes its owner the owner.
    const agentOwner = await newUser();
    const agent = await createAgent(agentOwner);
    const viaAgent = await as(db, agent, (tx) =>
      one<{ id: string }>(tx, "insert into project (name, key) values ('A', 'AGT') returning id"),
    );
    expect(
      await one(db, "select user_id, role from project_member where project_id = $1", [viaAgent.id]),
    ).toEqual({ user_id: agentOwner, role: "owner" });
  });

  test("a second owner is impossible, even for the service role", async () => {
    const w = await world();
    await expect(
      db.query("update project_member set role = 'owner' where project_id = $1 and user_id = $2", [w.projectId, w.admin]),
    ).rejects.toThrow(/owner can't be changed/);
    await expect(
      db.query("insert into project_member (project_id, user_id, role) values ($1, $2, 'owner')", [w.projectId, w.outsider]),
    ).rejects.toThrow(/project_member_owner_idx/);
    await expect(
      db.query("delete from project_member where project_id = $1 and user_id = $2", [w.projectId, w.owner]),
    ).rejects.toThrow(/owner can't leave/);
  });

  test("clients can't add themselves or others as members", async () => {
    const w = await world();
    await expect(
      run(human(w.outsider), "insert into project_member (project_id, user_id) values ($1, $2)", [w.projectId, w.outsider]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      run(human(w.owner), "insert into project_member (project_id, user_id) values ($1, $2)", [w.projectId, w.outsider]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("project data per role", () => {
  test("owner, admin, member and their agents work in the project", async () => {
    const w = await world();
    const callers: Claims[] = [
      human(w.owner), human(w.admin), human(w.member), w.ownerAgent, w.adminAgent, w.memberAgent,
    ];
    for (const [i, claims] of callers.entries()) {
      expect(await count(claims, "select id from project where id = $1", [w.projectId])).toBe(1);
      const task = await createTask(claims, w.projectId);
      await as(db, claims, async (tx) => {
        await tx.query("insert into epic (project_id, title) values ($1, 'e')", [w.projectId]);
        const label = await one<{ id: string }>(
          tx, "insert into label (project_id, name) values ($1, $2) returning id", [w.projectId, `l${i}`],
        );
        await tx.query("insert into task_label (task_id, label_id) values ($1, $2)", [task.id, label.id]);
        await tx.query("insert into comment (task_id, body) values ($1, 'hi')", [task.id]);
        await tx.query("insert into attachment (task_id, file_name, content_type, size) values ($1, 'a.jpg', 'image/jpeg', 1)", [task.id]);
        const updated = await tx.query("update task set title = 'new' where id = $1 and version = $2", [task.id, task.version]);
        expect(updated.affectedRows).toBe(1);
      });
      expect(await count(claims, "select user_id from project_member where project_id = $1", [w.projectId])).toBe(3);
      expect(await count(claims, "select id from activity_log where project_id = $1", [w.projectId])).toBeGreaterThan(0);
    }

    // Columns are for people, as before.
    for (const [i, sub] of [w.owner, w.admin, w.member].entries()) {
      await run(human(sub), "insert into board_column (project_id, name, position) values ($1, $2, 'a1V')", [w.projectId, `Col ${i}`]);
    }
    await expect(
      run(w.memberAgent, "insert into board_column (project_id, name, position) values ($1, 'Bot col', 'a1W')", [w.projectId]),
    ).rejects.toThrow(/row-level security/);
  });

  test("non-members and their agents see nothing and write nothing", async () => {
    const w = await world();
    const task = await createTask(human(w.member), w.projectId);
    await run(human(w.member), "insert into comment (task_id, body) values ($1, 'hi')", [task.id]);
    await run(human(w.member), "insert into label (project_id, name) values ($1, 'x')", [w.projectId]);
    await run(human(w.member), "insert into epic (project_id, title) values ($1, 'e')", [w.projectId]);
    const attachment = await as(db, human(w.member), (tx) =>
      one<{ id: string }>(tx, "insert into attachment (task_id, file_name, content_type, size) values ($1, 'a.jpg', 'image/jpeg', 1) returning id", [task.id]),
    );
    await run(human(w.member), "insert into storage.objects (bucket_id, name) values ('attachments', $1)", [`${w.projectId}/${attachment.id}`]);

    for (const claims of [human(w.outsider), w.outsiderAgent]) {
      const queries: Record<string, string> = {
        project: "select id from project where id = $1",
        epic: "select id from epic where project_id = $1",
        task: "select id from task where project_id = $1",
        label: "select id from label where project_id = $1",
        task_label: "select task_id from task_label where project_id = $1",
        board_column: "select id from board_column where project_id = $1",
        comment: "select c.id from comment c where c.task_id in (select id from task where project_id = $1) or c.task_id is null",
        attachment: "select id from attachment where project_id = $1",
        activity_log: "select id from activity_log where project_id = $1",
        project_member: "select user_id from project_member where project_id = $1",
        project_invite: "select id from project_invite where project_id = $1",
      };
      for (const [table, sql] of Object.entries(queries)) {
        expect(await count(claims, sql, [w.projectId]), table).toBe(0);
      }
      expect(await count(claims, "select id from comment where task_id = $1", [task.id])).toBe(0);
      expect(await count(claims, "select name from storage.objects where bucket_id = 'attachments'")).toBe(0);

      await expect(createTask(claims, w.projectId)).rejects.toThrow(/row-level security|column not found/);
      await expect(run(claims, "insert into epic (project_id, title) values ($1, 'e')", [w.projectId])).rejects.toThrow(/row-level security/);
      await expect(run(claims, "insert into label (project_id, name) values ($1, 'y')", [w.projectId])).rejects.toThrow(/row-level security/);
      await expect(run(claims, "insert into comment (task_id, body) values ($1, 'x')", [task.id])).rejects.toThrow(/row-level security/);
      expect((await run(claims, "update task set title = 'x' where id = $1", [task.id])).affectedRows).toBe(0);
      expect((await run(claims, "update project set name = 'x' where id = $1", [w.projectId])).affectedRows).toBe(0);
    }
  });

  test("only the owner (or their agent) renames the project; admins also change its settings", async () => {
    const w = await world();
    const doneWindow = async () =>
      (await db.query<{ done_window_days: number }>("select done_window_days from project where id = $1", [w.projectId])).rows[0].done_window_days;

    // Members (and their agents) can't change the project at all.
    for (const claims of [human(w.member), w.memberAgent]) {
      expect((await run(claims, "update project set done_window_days = 3 where id = $1", [w.projectId])).affectedRows).toBe(0);
    }
    // Admins (and their agents) change settings like the Done window, but not the name or description.
    expect((await run(human(w.admin), "update project set done_window_days = 3 where id = $1", [w.projectId])).affectedRows).toBe(1);
    expect((await run(w.adminAgent, "update project set done_window_days = 4 where id = $1", [w.projectId])).affectedRows).toBe(1);
    expect(await doneWindow()).toBe(4);
    for (const claims of [human(w.admin), w.adminAgent]) {
      await expect(run(claims, "update project set name = 'Nope' where id = $1", [w.projectId])).rejects.toThrow(/Only the project owner/);
      await expect(run(claims, "update project set description = 'Nope' where id = $1", [w.projectId])).rejects.toThrow(/Only the project owner/);
    }

    expect((await run(human(w.owner), "update project set name = 'Renamed' where id = $1", [w.projectId])).affectedRows).toBe(1);
    expect((await run(w.ownerAgent, "update project set description = 'by bot' where id = $1", [w.projectId])).affectedRows).toBe(1);
    // Projects can't be deleted by clients at all.
    await expect(run(human(w.owner), "delete from project where id = $1", [w.projectId])).rejects.toThrow(/permission denied/);
  });
});

describe("profile columns", () => {
  test("clients read only id, email, name and timestamps; my_profile() has the caller's preferences", async () => {
    const w = await world();
    await expect(run(human(w.member), "select theme from profile where id = $1", [w.owner])).rejects.toThrow(/permission denied/);
    await expect(run(human(w.member), "select workspace_id from profile where id = $1", [w.member])).rejects.toThrow(/permission denied/);
    await expect(run(human(w.member), "select open_task_after_create from profile where id = $1", [w.member])).rejects.toThrow(/permission denied/);
    expect((await run(human(w.member), "select id, email, name from profile where id = $1", [w.owner])).rows).toHaveLength(1);

    const mine = (await run(human(w.member), "select * from my_profile()")).rows;
    expect(mine).toEqual([expect.objectContaining({ id: w.member, theme: "lime", open_task_after_create: true })]);
    // Agents get nothing.
    expect((await run(w.memberAgent, "select * from my_profile()")).rows).toEqual([]);
  });
});

describe("managing members", () => {
  const roleOf = async (projectId: string, userId: string) =>
    (await db.query<{ role: string }>("select role from project_member where project_id = $1 and user_id = $2", [projectId, userId])).rows[0]?.role;

  test("admins switch others between admin and member, never to or from owner", async () => {
    const w = await world();
    const setRole = (claims: Claims, userId: string, role: string) =>
      run(claims, "update project_member set role = $3 where project_id = $1 and user_id = $2", [w.projectId, userId, role]);

    expect((await setRole(human(w.admin), w.member, "admin")).affectedRows).toBe(1);
    expect(await roleOf(w.projectId, w.member)).toBe("admin");
    expect((await setRole(human(w.admin), w.member, "member")).affectedRows).toBe(1);
    expect((await setRole(human(w.owner), w.admin, "member")).affectedRows).toBe(1);
    expect((await setRole(human(w.owner), w.admin, "admin")).affectedRows).toBe(1);

    await expect(setRole(human(w.admin), w.member, "owner")).rejects.toThrow(/row-level security|owner can't be changed/);
    await expect(setRole(human(w.owner), w.admin, "owner")).rejects.toThrow(/row-level security|owner can't be changed/);
    expect((await setRole(human(w.admin), w.owner, "member")).affectedRows).toBe(0);
    expect((await setRole(human(w.owner), w.owner, "admin")).affectedRows).toBe(0);
    expect(await roleOf(w.projectId, w.owner)).toBe("owner");

    // Only the role can change.
    await expect(
      run(human(w.admin), "update project_member set user_id = $2 where project_id = $1 and user_id = $3", [w.projectId, w.outsider, w.member]),
    ).rejects.toThrow(/permission denied/);
  });

  test("members, agents and outsiders can't change roles or remove anyone", async () => {
    const w = await world();
    for (const claims of [human(w.member), w.memberAgent, w.adminAgent, w.ownerAgent, human(w.outsider)]) {
      expect((await run(claims, "update project_member set role = 'admin' where project_id = $1", [w.projectId])).affectedRows).toBe(0);
      expect((await run(claims, "delete from project_member where project_id = $1 and user_id <> $2", [w.projectId, claims.sub])).affectedRows).toBe(0);
    }
    expect(await roleOf(w.projectId, w.member)).toBe("member");
    expect(await roleOf(w.projectId, w.admin)).toBe("admin");
  });

  test("admins remove members and other admins, never the owner", async () => {
    const w = await world();
    const other = await newUser();
    await addMember(w.owner, w.projectId, other, "admin");
    const remove = (claims: Claims, userId: string) =>
      run(claims, "delete from project_member where project_id = $1 and user_id = $2", [w.projectId, userId]);

    expect((await remove(human(w.admin), w.owner)).affectedRows).toBe(0);
    expect((await remove(human(w.admin), w.member)).affectedRows).toBe(1);
    expect((await remove(human(w.admin), other)).affectedRows).toBe(1);
    expect(await roleOf(w.projectId, w.owner)).toBe("owner");
    expect(await count(human(w.member), "select id from task where project_id = $1", [w.projectId])).toBe(0);
    expect(await count(human(w.member), "select id from project where id = $1", [w.projectId])).toBe(0);
  });

  test("anyone but the owner can leave; their agents lose access with them", async () => {
    const w = await world();
    const leave = (claims: Claims) =>
      run(claims, "delete from project_member where project_id = $1 and user_id = $2", [w.projectId, claims.sub]);

    expect((await leave(w.memberAgent)).affectedRows).toBe(0);
    expect((await leave(human(w.member))).affectedRows).toBe(1);
    expect((await leave(human(w.admin))).affectedRows).toBe(1);
    expect((await leave(human(w.owner))).affectedRows).toBe(0);
    expect(await count(w.memberAgent, "select id from project where id = $1", [w.projectId])).toBe(0);
    expect(await count(w.ownerAgent, "select id from project where id = $1", [w.projectId])).toBe(1);
  });

  test("removing someone unassigns them and their agents from the project's tasks only", async () => {
    const w = await world();
    const mine = await createTask(human(w.member), w.projectId, { assignee_user_id: w.member });
    const botTask = await createTask(human(w.owner), w.projectId, { assignee_agent_id: w.memberAgent.agent_id });
    const ownerTask = await createTask(human(w.owner), w.projectId, { assignee_user_id: w.owner });
    // A task in the member's own project stays assigned.
    const ownProject = await createProject(w.member, "OWN");
    const elsewhere = await createTask(human(w.member), ownProject.id, { assignee_user_id: w.member });

    await run(human(w.admin), "delete from project_member where project_id = $1 and user_id = $2", [w.projectId, w.member]);

    const assignees = async (id: string) =>
      one<{ assignee_user_id: string | null; assignee_agent_id: string | null; version: number }>(
        db, "select assignee_user_id, assignee_agent_id, version from task where id = $1", [id],
      );
    expect(await assignees(mine.id)).toMatchObject({ assignee_user_id: null, assignee_agent_id: null, version: 2 });
    expect(await assignees(botTask.id)).toMatchObject({ assignee_user_id: null, assignee_agent_id: null });
    expect(await assignees(ownerTask.id)).toMatchObject({ assignee_user_id: w.owner });
    expect(await assignees(elsewhere.id)).toMatchObject({ assignee_user_id: w.member });

    // Logged as an update by the admin who removed them.
    const log = await as(db, human(w.owner), (tx) =>
      one<{ actor_type: string; user_id: string; action: string; changes: Record<string, unknown> }>(
        tx,
        "select actor_type, user_id, action, changes from activity_log where entity_id = $1 order by seq desc limit 1",
        [mine.id],
      ),
    );
    expect(log).toEqual({
      actor_type: "human",
      user_id: w.admin,
      action: "updated",
      changes: { assignee_user_id: { from: w.member, to: null } },
    });
  });

  test("leaving unassigns too, recorded as the person who left", async () => {
    const w = await world();
    const task = await createTask(human(w.member), w.projectId, { assignee_user_id: w.member });
    await run(human(w.member), "delete from project_member where project_id = $1 and user_id = $2", [w.projectId, w.member]);
    expect(await one(db, "select assignee_user_id from task where id = $1", [task.id])).toEqual({ assignee_user_id: null });
    expect(
      await one(db, "select user_id from activity_log where entity_id = $1 order by seq desc limit 1", [task.id]),
    ).toEqual({ user_id: w.member });
  });
});

describe("invites", () => {
  test("owners and admins create, list and revoke them; the hash stays hidden", async () => {
    const w = await world();
    for (const sub of [w.owner, w.admin]) {
      const hash = await createInvite(human(sub), w.projectId, "admin");
      const row = await as(db, human(sub), (tx) =>
        one<{ id: string; created_by: string; role: string; used_at: null; revoked_at: null }>(
          tx,
          "select id, created_by, role, used_at, revoked_at from project_invite where project_id = $1 order by created_at desc, id limit 1",
          [w.projectId],
        ),
      );
      expect(row).toMatchObject({ created_by: sub, role: "admin", used_at: null, revoked_at: null });
      expect(
        (await run(human(sub), "update project_invite set revoked_at = now() where id = $1", [row.id])).affectedRows,
      ).toBe(1);
      await expect(
        run(human(sub), "update project_invite set revoked_at = null where id = $1", [row.id]),
      ).rejects.toThrow(/can't be restored/);
      await expect(
        run(human(sub), "select token_hash from project_invite where id = $1", [row.id]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        run(human(sub), "select * from project_invite"),
      ).rejects.toThrow(/permission denied/);
      expect(hash).toHaveLength(64);
    }
  });

  test("invites never grant owner, and server-set columns can't be written", async () => {
    const w = await world();
    await expect(createInvite(human(w.owner), w.projectId, "owner")).rejects.toThrow(/check constraint/);
    await expect(
      run(human(w.owner), "insert into project_invite (project_id, token_hash, created_by) values ($1, $2, $3)", [w.projectId, token(), w.member]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      run(human(w.owner), "insert into project_invite (project_id, token_hash, used_at) values ($1, $2, now())", [w.projectId, token()]),
    ).rejects.toThrow(/permission denied/);
    await createInvite(human(w.owner), w.projectId);
    await expect(
      run(human(w.owner), "update project_invite set role = 'admin' where project_id = $1", [w.projectId]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      run(human(w.owner), "update project_invite set expires_at = now() + interval '1 year' where project_id = $1", [w.projectId]),
    ).rejects.toThrow(/permission denied/);
  });

  test("members, agents and outsiders can't create, see or revoke invites", async () => {
    const w = await world();
    await createInvite(human(w.owner), w.projectId);
    for (const claims of [human(w.member), w.memberAgent, w.adminAgent, w.ownerAgent, human(w.outsider)]) {
      await expect(createInvite(claims, w.projectId)).rejects.toThrow(/row-level security/);
      expect(await count(claims, "select id from project_invite where project_id = $1", [w.projectId])).toBe(0);
      expect((await run(claims, "update project_invite set revoked_at = now() where project_id = $1", [w.projectId])).affectedRows).toBe(0);
      await expect(run(claims, "delete from project_invite")).rejects.toThrow(/permission denied/);
    }
  });

  test("accepting joins with the invite's role and uses it up", async () => {
    const w = await world();
    const hash = await createInvite(human(w.admin), w.projectId, "admin");
    expect(await accept(human(w.outsider), hash)).toEqual({ project_id: w.projectId });

    expect(
      await one(db, "select role from project_member where project_id = $1 and user_id = $2", [w.projectId, w.outsider]),
    ).toEqual({ role: "admin" });
    const invite = await as(db, human(w.owner), (tx) =>
      one<{ used_by: string; used_at: string | null }>(tx, "select used_by, used_at from project_invite where project_id = $1 and used_by = $2", [w.projectId, w.outsider]),
    );
    expect(invite.used_by).toBe(w.outsider);
    expect(invite.used_at).not.toBeNull();
    expect(await count(human(w.outsider), "select id from project where id = $1", [w.projectId])).toBe(1);
    // Their agent now reaches the project too.
    expect(await count(w.outsiderAgent, "select id from task where project_id = $1", [w.projectId])).toBe(0);
    await expect(createTask(w.outsiderAgent, w.projectId)).resolves.toBeDefined();
  });

  test("accepting fails with a distinct error for each reason", async () => {
    const w = await world();
    const stranger = await newUser();
    const another = await newUser();

    await expect(accept(human(stranger), token())).rejects.toMatchObject({ code: "BLI01" });

    const used = await createInvite(human(w.owner), w.projectId);
    await accept(human(stranger), used);
    await expect(accept(human(another), used)).rejects.toMatchObject({ code: "BLI03" });

    const fresh = await createInvite(human(w.owner), w.projectId);
    await expect(accept(human(w.member), fresh)).rejects.toMatchObject({ code: "BLI05" });
    await expect(accept(human(w.owner), fresh)).rejects.toMatchObject({ code: "BLI05" });

    const revoked = await createInvite(human(w.owner), w.projectId);
    // Clients can't filter on the hash, so pick the row as the service would.
    await db.query("update project_invite set revoked_at = now() where token_hash = $1 and revoked_at is null", [hashOf(revoked)]);
    await expect(accept(human(another), revoked)).rejects.toMatchObject({ code: "BLI04" });

    const expired = await createInvite(human(w.owner), w.projectId);
    await db.transaction(async (tx) => {
      await tx.exec("set local session_replication_role = replica");
      await tx.query(
        "update project_invite set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where token_hash = $1",
        [hashOf(expired)],
      );
    });
    await expect(accept(human(another), expired)).rejects.toMatchObject({ code: "BLI02" });

    // Agents can't accept, even for their owner.
    await expect(accept(w.outsiderAgent, fresh)).rejects.toMatchObject({ code: "42501" });
    expect(await count(human(w.outsider), "select id from project where id = $1", [w.projectId])).toBe(0);
    await expect(accept(human(w.outsider), fresh)).resolves.toEqual({ project_id: w.projectId });
  });

  test("anon can't call the invite functions", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query("select public.accept_project_invite($1)", [token()]);
      }),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query("select * from public.preview_project_invite($1)", [token()]);
      }),
    ).rejects.toThrow(/permission denied/);
  });

  test("the preview shows the project, inviter and state to people holding the token", async () => {
    const w = await world();
    await run(human(w.owner), "update profile set name = 'Olivia' where id = $1", [w.owner]);
    const hash = await createInvite(human(w.owner), w.projectId, "admin");
    const preview = (claims: Claims, h = hash) =>
      as(db, claims, async (tx) => (await tx.query("select * from public.preview_project_invite($1)", [h])).rows);

    expect(await preview(human(w.outsider))).toEqual([
      expect.objectContaining({
        project_id: w.projectId,
        project_name: "Shared",
        project_key: "BOT",
        inviter_name: "Olivia",
        role: "admin",
        state: "valid",
        is_member: false,
      }),
    ]);
    expect(await preview(human(w.member))).toEqual([expect.objectContaining({ is_member: true })]);
    expect(await preview(human(w.outsider), token())).toEqual([]);
    await expect(preview(w.outsiderAgent)).rejects.toMatchObject({ code: "42501" });

    await accept(human(w.outsider), hash);
    expect(await preview(human(w.outsider))).toEqual([expect.objectContaining({ state: "used", is_member: true })]);

    // A dead invite shows only its state to people who aren't members.
    const revoked = await createInvite(human(w.owner), w.projectId);
    await run(human(w.owner), "update project_invite set revoked_at = now() where revoked_at is null and used_at is null");
    expect(await preview(human(await newUser()), revoked)).toEqual([
      { project_id: null, project_name: null, project_key: null, inviter_name: null, role: null, expires_at: null, state: "revoked", is_member: false },
    ]);
  });

  test("the stored hash doesn't work as a token", async () => {
    const w = await world();
    const raw = await createInvite(human(w.owner), w.projectId);
    await expect(accept(human(w.outsider), hashOf(raw))).rejects.toMatchObject({ code: "BLI01" });
    await expect(accept(human(w.outsider), "not a token")).rejects.toMatchObject({ code: "BLI01" });
  });

  test("expire within a week", async () => {
    const w = await world();
    const insert = (interval: string) =>
      run(human(w.owner), `insert into project_invite (project_id, token_hash, expires_at) values ($1, $2, now() + interval '${interval}')`, [
        w.projectId,
        token(),
      ]);
    await expect(insert("7 days")).resolves.toBeDefined();
    await expect(insert("7 days 1 minute")).rejects.toThrow(/project_invite_expiry/);
    await expect(insert("100 years")).rejects.toThrow(/project_invite_expiry/);
  });

  test("stop working when their creator is removed, leaves or is demoted", async () => {
    const w = await world();
    const open = async (raw: string) =>
      (await one<{ revoked: boolean }>(db, "select revoked_at is not null as revoked from project_invite where token_hash = $1", [hashOf(raw)])).revoked;

    // Removed.
    const byRemoved = await createInvite(human(w.admin), w.projectId, "admin");
    const byOwner = await createInvite(human(w.owner), w.projectId);
    await run(human(w.owner), "delete from project_member where project_id = $1 and user_id = $2", [w.projectId, w.admin]);
    expect(await open(byRemoved)).toBe(true);
    expect(await open(byOwner)).toBe(false);
    await expect(accept(human(w.admin), byRemoved)).rejects.toMatchObject({ code: "BLI04" });

    // Demoted.
    const second = await newUser();
    await addMember(w.owner, w.projectId, second, "admin");
    const byDemoted = await createInvite(human(second), w.projectId);
    await run(human(w.owner), "update project_member set role = 'member' where project_id = $1 and user_id = $2", [w.projectId, second]);
    expect(await open(byDemoted)).toBe(true);

    // Anything that slipped past the triggers is refused at accept time too.
    const third = await newUser();
    await addMember(w.owner, w.projectId, third, "admin");
    const slipped = await createInvite(human(third), w.projectId);
    await db.transaction(async (tx) => {
      await tx.exec("set local session_replication_role = replica");
      await tx.query("update project_member set role = 'member' where project_id = $1 and user_id = $2", [w.projectId, third]);
    });
    await expect(accept(human(await newUser()), slipped)).rejects.toMatchObject({ code: "BLI04" });
  });
});

describe("comments", () => {
  test("people delete their own comments and their own agents', not other members' agents'", async () => {
    const w = await world();
    const task = await createTask(human(w.owner), w.projectId);
    const comment = (claims: Claims) =>
      as(db, claims, (tx) => one<{ id: string }>(tx, "insert into comment (task_id, body) values ($1, 'x') returning id", [task.id]));
    const del = async (claims: Claims, id: string) =>
      (await run(claims, "delete from comment where id = $1", [id])).affectedRows;

    const byOwnerAgent = await comment(w.ownerAgent);
    const byMemberAgent = await comment(w.memberAgent);
    const byOwner = await comment(human(w.owner));
    expect(await del(human(w.member), byOwnerAgent.id)).toBe(0);
    expect(await del(human(w.member), byOwner.id)).toBe(0);
    expect(await del(human(w.member), byMemberAgent.id)).toBe(1);
    expect(await del(human(w.owner), byOwnerAgent.id)).toBe(1);
    expect(await del(human(w.owner), byOwner.id)).toBe(1);
  });
});

describe("assignees", () => {
  test("must be members of the task's project, or active agents owned by one", async () => {
    const w = await world();
    await expect(createTask(human(w.owner), w.projectId, { assignee_user_id: w.member })).resolves.toBeDefined();
    await expect(createTask(human(w.member), w.projectId, { assignee_user_id: w.owner })).resolves.toBeDefined();
    await expect(createTask(human(w.member), w.projectId, { assignee_agent_id: w.adminAgent.agent_id })).resolves.toBeDefined();
    await expect(createTask(w.memberAgent, w.projectId, { assignee_agent_id: w.ownerAgent.agent_id })).resolves.toBeDefined();

    await expect(createTask(human(w.owner), w.projectId, { assignee_user_id: w.outsider })).rejects.toThrow(/not a member of this project/);
    await expect(
      createTask(human(w.owner), w.projectId, { assignee_agent_id: w.outsiderAgent.agent_id }),
    ).rejects.toThrow(/not an active agent of a member/);

    // On update too, checked as the caller.
    const task = await createTask(human(w.member), w.projectId);
    await expect(
      run(human(w.member), "update task set assignee_user_id = $2 where id = $1", [task.id, w.outsider]),
    ).rejects.toThrow(/not a member of this project/);
    expect(
      (await run(human(w.member), "update task set assignee_agent_id = $2 where id = $1", [task.id, w.ownerAgent.agent_id])).affectedRows,
    ).toBe(1);

    await run(human(w.admin), "update agent set archived_at = now() where id = $1", [w.adminAgent.agent_id]);
    await expect(
      createTask(human(w.owner), w.projectId, { assignee_agent_id: w.adminAgent.agent_id }),
    ).rejects.toThrow(/not an active agent/);
  });
});

describe("visibility across workspaces", () => {
  test("co-members see each other's profile, agents and the project's workspace; nothing else", async () => {
    const w = await world();
    const ownerWs = (await one<{ workspace_id: string }>(db, "select workspace_id from profile where id = $1", [w.owner])).workspace_id;
    const outsiderWs = (await one<{ workspace_id: string }>(db, "select workspace_id from profile where id = $1", [w.outsider])).workspace_id;

    const ids = async (claims: Claims, sql: string) =>
      as(db, claims, async (tx) => (await tx.query<{ id: string }>(sql)).rows.map((r) => r.id).sort());

    for (const claims of [human(w.member), w.memberAgent]) {
      expect(await ids(claims, "select id from profile")).toEqual([w.owner, w.admin, w.member].sort());
      expect(await ids(claims, "select id from agent")).toEqual(
        [w.ownerAgent.agent_id, w.adminAgent.agent_id, w.memberAgent.agent_id].sort(),
      );
      const workspaces = await as(db, claims, async (tx) => (await tx.query<{ id: string }>("select id, name, handle from workspace")).rows);
      expect(workspaces.map((r) => r.id)).toContain(ownerWs);
      expect(workspaces.map((r) => r.id)).not.toContain(outsiderWs);
      // Only their own workspace's keys, never the owner's.
      expect(await ids(claims, "select id from api_key")).toEqual(claims.agent_id ? [] : [w.memberAgent.api_key_id]);
    }

    // Seeing isn't changing.
    expect((await run(human(w.member), "update workspace set name = 'x' where id = $1", [ownerWs])).affectedRows).toBe(0);
    expect((await run(human(w.member), "update profile set name = 'x' where id = $1", [w.owner])).affectedRows).toBe(0);
    expect((await run(human(w.member), "update agent set name = 'x' where id = $1", [w.ownerAgent.agent_id])).affectedRows).toBe(0);

    // The outsider sees only themselves.
    expect(await ids(human(w.outsider), "select id from profile")).toEqual([w.outsider]);
    expect(await ids(human(w.outsider), "select id from agent")).toEqual([w.outsiderAgent.agent_id]);
    expect(await ids(human(w.outsider), "select id from workspace")).toEqual([outsiderWs]);

    // Leaving ends it.
    await run(human(w.member), "delete from project_member where project_id = $1 and user_id = $2", [w.projectId, w.member]);
    expect(await ids(human(w.member), "select id from profile")).toEqual([w.member]);
    expect(await ids(human(w.member), "select id from agent")).toEqual([w.memberAgent.agent_id]);
  });
});

describe("deleting users", () => {
  test("an owner's projects go with them; members' rows go with them, other projects keep working", async () => {
    const w = await world();
    const memberProject = await createProject(w.member, "MEM");
    await addMember(w.member, memberProject.id, w.owner, "admin");
    const assigned = await createTask(human(w.owner), w.projectId, { assignee_user_id: w.member });
    await run(human(w.member), "insert into comment (task_id, body) values ($1, 'bye')", [assigned.id]);

    await db.query("delete from auth.users where id = $1", [w.member]);
    expect(await one(db, "select assignee_user_id from task where id = $1", [assigned.id])).toEqual({ assignee_user_id: null });
    expect(await one(db, "select count(*)::int as n from project_member where user_id = $1", [w.member])).toEqual({ n: 0 });
    expect(await one(db, "select count(*)::int as n from project where id = $1", [memberProject.id])).toEqual({ n: 0 });
    expect(await count(human(w.owner), "select user_id from project_member where project_id = $1", [w.projectId])).toBe(2);
    await expect(createTask(human(w.admin), w.projectId)).resolves.toBeDefined();

    await db.query("delete from auth.users where id = $1", [w.owner]);
    expect(await one(db, "select count(*)::int as n from project where id = $1", [w.projectId])).toEqual({ n: 0 });
    expect(await one(db, "select count(*)::int as n from project_member where project_id = $1", [w.projectId])).toEqual({ n: 0 });
  });
});

describe("workspace handles", () => {
  const handleOf = async (email: string) => {
    const id = await createUser(db, email);
    return (await one<{ handle: string }>(
      db, "select w.handle from workspace w join profile p on p.workspace_id = w.id where p.id = $1", [id],
    )).handle;
  };

  test("come from the email, sanitized", async () => {
    expect(await handleOf("Jane.Doe+Work@example.com")).toBe("jane-doe-work");
    expect(await handleOf("--__weird..name__--@example.com")).toBe("weird-name");
    expect(await handleOf("x@example.com")).toBe("x-user");
    expect(await handleOf("___@example.com")).toBe("user");
    expect(await handleOf(`${"a".repeat(28)}-bc-def@example.com`)).toBe(`${"a".repeat(28)}-b`);
    expect(await handleOf(`${"b".repeat(29)}-c@example.com`)).toBe("b".repeat(29));
  });

  test("clashes and reserved words get a number", async () => {
    expect(await handleOf("sam@one.com")).toBe("sam");
    expect(await handleOf("sam@two.com")).toBe("sam2");
    expect(await handleOf("SAM@three.com")).toBe("sam3");
    expect(await handleOf("admin@example.com")).toBe("admin2");
    expect(await handleOf("help@example.com")).toBe("help2");
    const long = "c".repeat(30);
    expect(await handleOf(`${long}@one.com`)).toBe(long);
    expect(await handleOf(`${long}@two.com`)).toBe(`${"c".repeat(29)}2`);
  });

  test("people change their own, within the format, unique ignoring case; agents can't", async () => {
    const a = await createUser(db, `handle-a${++counter}@example.com`);
    const b = await createUser(db, `handle-b${++counter}@example.com`);
    const wsOf = async (id: string) =>
      (await one<{ workspace_id: string }>(db, "select workspace_id from profile where id = $1", [id])).workspace_id;
    const setHandle = (claims: Claims, handle: string) => run(claims, "update workspace set handle = $1", [handle]);

    const name = `team-${counter}`;
    expect((await setHandle(human(a), name)).affectedRows).toBe(1);
    expect(await one(db, "select handle from workspace where id = $1", [await wsOf(a)])).toEqual({ handle: name });
    await expect(setHandle(human(b), name)).rejects.toThrow(/workspace_handle_idx/);

    for (const bad of ["a", "-ab", "ab-", "a_b", "Ab", "a b", "x".repeat(31), ""]) {
      await expect(setHandle(human(b), bad), bad).rejects.toThrow(/workspace_handle_format/);
    }
    for (const reserved of ["admin", "api", "botlog", "settings", "invite", "www"]) {
      await expect(setHandle(human(b), reserved), reserved).rejects.toThrow(/workspace_handle_not_reserved/);
    }
    // Case-insensitive uniqueness is enforced by the index, whatever the format allows.
    const { rows } = await db.query<{ indexdef: string }>("select indexdef from pg_indexes where indexname = 'workspace_handle_idx'");
    expect(rows[0].indexdef).toMatch(/UNIQUE INDEX .* \(lower\(handle\)\)/);

    const agent = await createAgent(b);
    expect((await setHandle(agent, `bot-${counter}`)).affectedRows).toBe(0);
    await expect(run(human(b), "update workspace set id = gen_random_uuid()")).rejects.toThrow(/permission denied/);
  });
});

describe("backfill on existing data", () => {
  test("projects get their workspace's people as owner and members; workspaces get handles", async () => {
    const old = await createDb({ before: SHARED_PROJECTS });
    const insertUser = async (email: string) =>
      (await one<{ id: string }>(old, "insert into auth.users (email) values ($1) returning id", [email])).id;
    const asUser = (sub: string, sql: string, params: unknown[] = []) =>
      old.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub })]);
        await tx.exec("set local role authenticated");
        return tx.query<{ id: string }>(sql, params);
      });

    const solo = await insertUser("Solo.Person@example.com");
    const soloProject = (await asUser(solo, "insert into project (name, key) values ('S', 'SOLO') returning id")).rows[0].id;
    await asUser(solo, "insert into task (project_id, title, position, assignee_user_id) values ($1, 't', 'a0', $2)", [soloProject, solo]);
    const clash = await insertUser("solo.person@other.com");
    const reserved = await insertUser("admin@example.com");

    // A workspace with two people (not possible through sign-up today): the earliest owns.
    const first = await insertUser("first@example.com");
    const ws = (await one<{ workspace_id: string }>(old, "select workspace_id from profile where id = $1", [first])).workspace_id;
    const second = (await one<{ id: string }>(old, "insert into auth.users (id, email) values (gen_random_uuid(), 'second@example.com') returning id")).id;
    // Move the second person's profile into the first's workspace (their own gets cleaned up).
    await old.query("update profile set workspace_id = $1, created_at = now() + interval '1 minute' where id = $2", [ws, second]);
    await old.query("delete from workspace w where not exists (select 1 from profile p where p.workspace_id = w.id)");
    const sharedProject = (await asUser(first, "insert into project (name, key) values ('T', 'TEAM') returning id")).rows[0].id;

    await applyMigrations(old, { from: SHARED_PROJECTS });

    const members = (await old.query("select project_id, user_id, role from project_member order by role, user_id")).rows;
    expect(members).toEqual(
      expect.arrayContaining([
        { project_id: soloProject, user_id: solo, role: "owner" },
        { project_id: sharedProject, user_id: first, role: "owner" },
        { project_id: sharedProject, user_id: second, role: "member" },
      ]),
    );
    expect(members).toHaveLength(3);

    const handleOf = async (id: string) =>
      (await one<{ handle: string }>(old, "select w.handle from workspace w join profile p on p.workspace_id = w.id where p.id = $1", [id])).handle;
    expect(await handleOf(solo)).toBe("solo-person");
    expect(await handleOf(clash)).toBe("solo-person2");
    expect(await handleOf(reserved)).toBe("admin2");
    expect(await handleOf(second)).toBe("first");

    // Existing data stays reachable for its people, and assignments stay valid.
    const tasks = await asUser(solo, "select id from task where project_id = $1", [soloProject]);
    expect(tasks.rows).toHaveLength(1);
    const teamTask = await asUser(second, "insert into task (project_id, title, position, assignee_user_id) values ($1, 't', 'a0', $2) returning id", [sharedProject, first]);
    expect(teamTask.rows).toHaveLength(1);
    await old.close();
  }, 60_000);
});
