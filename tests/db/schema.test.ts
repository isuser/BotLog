import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, test } from "vitest";
import { as, createDb, createUser, one } from "./harness";

let db: PGlite;
let counter = 0;

beforeAll(async () => {
  db = await createDb();
}, 30_000);

/** A signed-in user with their own workspace, plus one project in it. */
async function setup(key = "BOT") {
  const n = ++counter;
  const userId = await createUser(db, `user${n}@example.com`);
  const project = await as(db, { sub: userId }, (tx) =>
    one<{ id: string }>(
      tx,
      "insert into project (name, key) values ('Botlog', $1) returning id",
      [key],
    ),
  );
  return { userId, projectId: project.id };
}

async function createTask(sub: string, projectId: string, title = "Task") {
  return as(db, { sub }, (tx) =>
    one<{ id: string; number: number; version: number }>(
      tx,
      "insert into task (project_id, title, position) values ($1, $2, 'a0') returning id, number, version",
      [projectId, title],
    ),
  );
}

/** An agent owned by `sub` with one API key; returns the claims an agent token carries. */
async function createAgent(sub: string) {
  return as(db, { sub }, async (tx) => {
    const agent = await one<{ id: string }>(
      tx,
      "insert into agent (name) values ('Code bot') returning id",
    );
    const key = await one<{ id: string }>(
      tx,
      `insert into api_key (agent_id, name, prefix, hash)
       values ($1, 'laptop', 'bl_abcd', $2) returning id`,
      [agent.id, Math.random().toString(16).slice(2).padEnd(64, "0")],
    );
    return { sub, agent_id: agent.id, api_key_id: key.id };
  });
}

describe("new users", () => {
  test("get their own workspace and profile", async () => {
    const userId = await createUser(db, "ada.lovelace@example.com");
    const profile = await as(db, { sub: userId }, (tx) =>
      one<{ email: string; name: string; workspace_id: string }>(tx, "select * from profile"),
    );
    expect(profile).toMatchObject({ email: "ada.lovelace@example.com", name: "ada.lovelace" });

    const workspaces = await as(db, { sub: userId }, (tx) => tx.query("select id from workspace"));
    expect(workspaces.rows).toEqual([{ id: profile.workspace_id }]);
  });

  test("deleting a user deletes their workspace and everything in it", async () => {
    const { userId, projectId } = await setup();
    const claims = await createAgent(userId);
    const { workspace_id } = await one<{ workspace_id: string }>(
      db,
      "select workspace_id from profile where id = $1",
      [userId],
    );
    await as(db, { sub: userId }, async (tx) => {
      const task = await one<{ id: string }>(
        tx,
        "insert into task (project_id, title, position, assignee_user_id) values ($1, 't', 'a0', $2) returning id",
        [projectId, userId],
      );
      const label = await one<{ id: string }>(tx, "insert into label (project_id, name) values ($1, 'x') returning id", [projectId]);
      await tx.query("insert into task_label (task_id, label_id) values ($1, $2)", [task.id, label.id]);
      await tx.query("insert into comment (task_id, body) values ($1, 'hi')", [task.id]);
    });
    await as(db, claims, (tx) =>
      tx.query("insert into comment (task_id, body) select id, 'from agent' from task where project_id = $1", [projectId]),
    );

    await db.query("delete from auth.users where id = $1", [userId]);

    const left = await one<Record<string, number>>(
      db,
      `select
         (select count(*)::int from workspace where id = $1) as workspaces,
         (select count(*)::int from project where workspace_id = $1) as projects,
         (select count(*)::int from agent where workspace_id = $1) as agents,
         (select count(*)::int from api_key where workspace_id = $1) as keys,
         (select count(*)::int from activity_log where workspace_id = $1) as activity`,
      [workspace_id],
    );
    expect(left).toEqual({ workspaces: 0, projects: 0, agents: 0, keys: 0, activity: 0 });
  });
});

describe("set_task_labels", () => {
  async function labelsOf(sub: string, taskId: string) {
    return as(db, { sub }, async (tx) =>
      (await tx.query<{ name: string }>(
        "select l.name from task_label tl join label l on l.id = tl.label_id where tl.task_id = $1 order by l.name",
        [taskId],
      )).rows.map((r) => r.name),
    );
  }

  async function makeLabels(sub: string, projectId: string, ...names: string[]) {
    return as(db, { sub }, async (tx) => {
      const ids: string[] = [];
      for (const name of names) {
        ids.push((await one<{ id: string }>(tx, "insert into label (project_id, name) values ($1, $2) returning id", [projectId, name])).id);
      }
      return ids;
    });
  }

  const setLabels = (sub: string, taskId: string, version: number, ids: string[]) =>
    as(db, { sub }, (tx) =>
      one<{ v: number | null }>(tx, "select public.set_task_labels($1, $2, $3::uuid[]) as v", [taskId, version, ids]),
    );

  test("replaces the labels and bumps the version, logging each change", async () => {
    const { userId, projectId } = await setup();
    const task = await createTask(userId, projectId);
    const [a, b, c] = await makeLabels(userId, projectId, "a", "b", "c");

    expect((await setLabels(userId, task.id, 1, [a, b, b])).v).toBe(2);
    expect(await labelsOf(userId, task.id)).toEqual(["a", "b"]);
    expect((await setLabels(userId, task.id, 2, [b, c])).v).toBe(3);
    expect(await labelsOf(userId, task.id)).toEqual(["b", "c"]);

    const actions = await as(db, { sub: userId }, async (tx) =>
      (await tx.query<{ action: string }>(
        "select action from activity_log where entity_id = $1 and action like 'label%' order by seq",
        [task.id],
      )).rows.map((r) => r.action),
    );
    expect(actions).toEqual(["label_added", "label_added", "label_removed", "label_added"]);
  });

  test("returns null and changes nothing for a stale version", async () => {
    const { userId, projectId } = await setup();
    const task = await createTask(userId, projectId);
    const [a] = await makeLabels(userId, projectId, "a");
    expect((await setLabels(userId, task.id, 7, [a])).v).toBeNull();
    expect(await labelsOf(userId, task.id)).toEqual([]);
  });

  test("rejects labels from another project, and other workspaces' tasks are invisible", async () => {
    const owner = await setup();
    const task = await createTask(owner.userId, owner.projectId);
    const other = await setup();
    const [foreign] = await makeLabels(other.userId, other.projectId, "theirs");
    const [mine] = await makeLabels(owner.userId, owner.projectId, "mine");

    await expect(setLabels(owner.userId, task.id, 1, [foreign])).rejects.toThrow(/foreign key/);
    expect((await setLabels(other.userId, task.id, 1, [])).v).toBeNull();
    expect((await setLabels(owner.userId, task.id, 1, [mine])).v).toBe(2);
  });
});

describe("realtime", () => {
  test("publishes only activity_log and task, never secrets or profiles", async () => {
    const tables = (
      await db.query<{ tablename: string }>(
        "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename",
      )
    ).rows.map((r) => r.tablename);
    // Not board_column: its changes reach boards through activity_log, which RLS filters.
    expect(tables).toEqual(["activity_log", "task"]);
  });

  test("keeps the default replica identity, so update and delete events carry only the key", async () => {
    // Realtime doesn't apply RLS to DELETE events: with the default identity they hold just
    // the row's UUID. `replica identity full` would put whole old rows in those events.
    const identities = (
      await db.query<{ relname: string; relreplident: string }>(
        "select relname, relreplident from pg_class where oid in ('public.task'::regclass, 'public.activity_log'::regclass) order by relname",
      )
    ).rows;
    expect(identities).toEqual([
      { relname: "activity_log", relreplident: "d" },
      { relname: "task", relreplident: "d" },
    ]);
  });
});

describe("rate limits", () => {
  const hit = (claims: Parameters<typeof as>[1]) =>
    as(db, claims, (tx) => one<{ hits: number; reset_at: string }>(tx, "select * from public.hit_rate_limit()"));

  test("count per user, and per API key for agents, in their own buckets", async () => {
    const { userId } = await setup();
    const claims = await createAgent(userId);

    expect((await hit({ sub: userId })).hits).toBe(1);
    expect((await hit({ sub: userId })).hits).toBe(2);
    // The agent acts as its owner but has its own allowance.
    expect((await hit(claims)).hits).toBe(1);
    const other = await setup();
    expect((await hit({ sub: other.userId })).hits).toBe(1);
  });

  test("callers can't pick their own window to reset the count", async () => {
    const { userId } = await setup();
    await hit({ sub: userId });
    await expect(
      as(db, { sub: userId }, (tx) => tx.query("select * from public.hit_rate_limit(1)")),
    ).rejects.toThrow(/function public.hit_rate_limit\(integer\) does not exist/);
    expect((await hit({ sub: userId })).hits).toBe(2);
  });

  test("the window resets on a whole minute", async () => {
    const { userId } = await setup();
    const { reset_at } = await hit({ sub: userId });
    const reset = new Date(reset_at);
    expect(reset.getUTCSeconds()).toBe(0);
    expect(reset.getTime() - Date.now()).toBeLessThanOrEqual(60_000);
  });

  test("clients can't read or change the counters directly", async () => {
    const { userId } = await setup();
    await expect(as(db, { sub: userId }, (tx) => tx.query("select * from private.rate_limit"))).rejects.toThrow(/permission denied/);
    await expect(as(db, { sub: "" }, (tx) => tx.query("select * from public.hit_rate_limit()"))).rejects.toThrow(/not signed in|permission denied|invalid input/);
  });

  test("title search has a trigram index", async () => {
    const { rows } = await db.query<{ indexdef: string }>("select indexdef from pg_indexes where indexname = 'task_title_trgm_idx'");
    expect(rows[0]?.indexdef).toMatch(/gin.*gin_trgm_ops/);
  });
});

describe("profile", () => {
  test("defaults to the Lime theme and lets its owner change theme and name", async () => {
    const { userId } = await setup();
    const updated = await as(db, { sub: userId }, (tx) =>
      one<{ theme: string; name: string }>(
        tx,
        "update profile set theme = 'sandpaper', name = 'Ada' where id = $1 returning theme, name",
        [userId],
      ),
    );
    expect(updated).toEqual({ theme: "sandpaper", name: "Ada" });

    const fresh = await setup();
    const profile = await as(db, { sub: fresh.userId }, (tx) => one<{ theme: string }>(tx, "select theme from profile"));
    expect(profile.theme).toBe("lime");
  });

  test("only accepts known themes", async () => {
    const { userId } = await setup();
    await expect(
      as(db, { sub: userId }, (tx) => tx.query("update profile set theme = 'neon' where id = $1", [userId])),
    ).rejects.toThrow(/profile_theme_check/);
  });

  test("can't be changed by other users or by agents", async () => {
    const owner = await setup();
    const other = await setup();
    const claims = await createAgent(owner.userId);
    const changed = await as(db, { sub: other.userId }, async (tx) =>
      (await tx.query("update profile set theme = 'sandpaper' where id = $1", [owner.userId])).affectedRows,
    );
    const byAgent = await as(db, claims, async (tx) =>
      (await tx.query("update profile set theme = 'sandpaper'")).affectedRows,
    );
    expect({ changed, byAgent }).toEqual({ changed: 0, byAgent: 0 });
  });
});

describe("workspace isolation", () => {
  test("users cannot see or write another workspace's data", async () => {
    const a = await setup();
    const b = await setup();
    await createTask(a.userId, a.projectId);

    const seen = await as(db, { sub: b.userId }, async (tx) => ({
      projects: (await tx.query("select id from project")).rows.length,
      tasks: (await tx.query("select id from task where project_id = $1", [a.projectId])).rows.length,
      profiles: (await tx.query("select id from profile where id = $1", [a.userId])).rows.length,
      activity: (await tx.query("select id from activity_log where project_id = $1", [a.projectId])).rows.length,
    }));
    expect(seen).toEqual({ projects: 1, tasks: 0, profiles: 0, activity: 0 });

    // The task's column is looked up first, and another workspace's columns are invisible.
    await expect(createTask(b.userId, a.projectId)).rejects.toThrow(/row-level security|column not found/);

    const updated = await as(db, { sub: b.userId }, (tx) =>
      tx.query("update project set name = 'hacked' where id = $1", [a.projectId]),
    );
    expect(updated.affectedRows).toBe(0);
  });

  test("anon has no access at all", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query("select * from task");
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("short IDs", () => {
  test("numbers count up per project and are never reused", async () => {
    const { userId, projectId } = await setup();
    const first = await createTask(userId, projectId);
    const second = await createTask(userId, projectId);
    expect([first.number, second.number]).toEqual([1, 2]);

    await as(db, { sub: userId }, (tx) =>
      tx.query("update task set archived_at = now() where id = $1", [second.id]),
    );
    expect((await createTask(userId, projectId)).number).toBe(3);

    const other = await as(db, { sub: userId }, (tx) =>
      one<{ id: string }>(tx, "insert into project (name, key) values ('Other', 'OTH') returning id"),
    );
    expect((await createTask(userId, other.id)).number).toBe(1);
  });

  test("project keys are unique per workspace and validated", async () => {
    const { userId } = await setup("DUP");
    await expect(
      as(db, { sub: userId }, (tx) => tx.query("insert into project (name, key) values ('x', 'DUP')")),
    ).rejects.toThrow(/duplicate key/);
    for (const key of ["bad-key", "ABCDE", "A", "1AB"]) {
      await expect(
        as(db, { sub: userId }, (tx) => tx.query("insert into project (name, key) values ('x', $1)", [key])),
      ).rejects.toThrow(/check constraint/);
    }
    await expect(
      as(db, { sub: userId }, (tx) => tx.query("insert into project (name, key) values ('x', 'AB12')")),
    ).resolves.toBeDefined();
    // Another workspace can use the same key.
    await expect(setup("DUP")).resolves.toBeDefined();
  });

  test("clients cannot change project keys, counters or task numbers", async () => {
    const { userId, projectId } = await setup();
    const task = await createTask(userId, projectId);
    for (const sql of [
      "update project set key = 'NEW'",
      "update project set task_counter = 0",
      `update task set number = 99 where id = '${task.id}'`,
      `update task set version = 99 where id = '${task.id}'`,
    ]) {
      await expect(as(db, { sub: userId }, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
  });
});

describe("tasks", () => {
  test("version goes up on every change and stale updates match nothing", async () => {
    const { userId, projectId } = await setup();
    const task = await createTask(userId, projectId);
    expect(task.version).toBe(1);

    const update = (version: number, title: string) =>
      as(db, { sub: userId }, (tx) =>
        tx.query<{ version: number }>(
          "update task set title = $1 where id = $2 and version = $3 returning version",
          [title, task.id, version],
        ),
      );

    expect((await update(1, "First edit")).rows).toEqual([{ version: 2 }]);
    // A second client still holding version 1 gets no rows back -> API answers 409.
    expect((await update(1, "Stale edit")).rows).toEqual([]);
  });

  test("tasks cannot be deleted, only archived", async () => {
    const { userId, projectId } = await setup();
    const task = await createTask(userId, projectId);
    await expect(
      as(db, { sub: userId }, (tx) => tx.query("delete from task where id = $1", [task.id])),
    ).rejects.toThrow(/permission denied/);
  });

  test("a task's epic must be in the same project", async () => {
    const { userId, projectId } = await setup();
    const other = await setup();
    const epicId = await as(db, { sub: other.userId }, async (tx) =>
      (await one<{ id: string }>(tx, "insert into epic (project_id, title) values ($1, 'Epic') returning id", [other.projectId])).id,
    );
    await expect(
      as(db, { sub: userId }, (tx) =>
        tx.query("insert into task (project_id, title, position, epic_id) values ($1, 't', 'a0', $2)", [projectId, epicId]),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  test("assignees: one at most, and only from the same workspace", async () => {
    const { userId, projectId } = await setup();
    const outsider = await setup();
    const claims = await createAgent(userId);

    const insert = (cols: string, values: unknown[]) =>
      as(db, { sub: userId }, (tx) =>
        tx.query(
          `insert into task (project_id, title, position, ${cols}) values ($1, 't', 'a0', ${values.map((_, i) => `$${i + 2}`).join(", ")})`,
          [projectId, ...values],
        ),
      );

    await expect(insert("assignee_user_id", [userId])).resolves.toBeDefined();
    await expect(insert("assignee_agent_id", [claims.agent_id])).resolves.toBeDefined();
    await expect(insert("assignee_user_id, assignee_agent_id", [userId, claims.agent_id])).rejects.toThrow(/task_single_assignee/);
    await expect(insert("assignee_user_id", [outsider.userId])).rejects.toThrow(/not in this workspace/);

    await as(db, { sub: userId }, (tx) =>
      tx.query("update agent set archived_at = now() where id = $1", [claims.agent_id]),
    );
    await expect(insert("assignee_agent_id", [claims.agent_id])).rejects.toThrow(/not an active agent/);
  });

  test("done_at is set when a task moves to Done, kept while it stays, cleared when it leaves", async () => {
    const { userId, projectId } = await setup();
    const task = await createTask(userId, projectId);
    const run = (sql: string) =>
      as(db, { sub: userId }, (tx) => one<{ done_at: string | null }>(tx, `${sql} where id = $1 returning done_at`, [task.id]));

    expect((await run("update task set title = 'x'")).done_at).toBeNull();
    const done = (await run("update task set status = 'done'")).done_at;
    expect(done).not.toBeNull();
    expect((await run("update task set title = 'y'")).done_at).toEqual(done);
    expect((await run("update task set status = 'todo'")).done_at).toBeNull();

    const created = await as(db, { sub: userId }, (tx) =>
      one<{ done_at: string | null }>(
        tx,
        "insert into task (project_id, title, position, status) values ($1, 't', 'a0', 'done') returning done_at",
        [projectId],
      ),
    );
    expect(created.done_at).not.toBeNull();
  });

  test("done_at can't be set by clients", async () => {
    const { userId, projectId } = await setup();
    const task = await createTask(userId, projectId);
    await expect(
      as(db, { sub: userId }, (tx) => tx.query("update task set done_at = now() where id = $1", [task.id])),
    ).rejects.toThrow(/permission denied/);
  });

  test("moving to Done is logged as a move, without done_at", async () => {
    const { userId, projectId } = await setup();
    const task = await createTask(userId, projectId);
    await as(db, { sub: userId }, (tx) => tx.query("update task set status = 'done' where id = $1", [task.id]));
    const entry = await as(db, { sub: userId }, (tx) =>
      one<{ action: string; changes: Record<string, unknown> }>(
        tx,
        "select action, changes from activity_log where entity_id = $1 order by seq desc limit 1",
        [task.id],
      ),
    );
    expect(entry.action).toBe("moved");
    expect(Object.keys(entry.changes).sort()).toEqual(["column_id", "status"]);
  });
});

describe("projects", () => {
  test("done_window_days defaults to 14 and stays between 1 and 365", async () => {
    const { userId, projectId } = await setup();
    const set = (days: number) =>
      as(db, { sub: userId }, (tx) =>
        one<{ done_window_days: number }>(
          tx,
          "update project set done_window_days = $1 where id = $2 returning done_window_days",
          [days, projectId],
        ),
      );
    const current = await as(db, { sub: userId }, (tx) =>
      one<{ done_window_days: number }>(tx, "select done_window_days from project where id = $1", [projectId]),
    );
    expect(current.done_window_days).toBe(14);
    expect((await set(30)).done_window_days).toBe(30);
    await expect(set(0)).rejects.toThrow(/check constraint/);
    await expect(set(366)).rejects.toThrow(/check constraint/);
  });
});

describe("labels", () => {
  test("names are unique per project, ignoring case", async () => {
    const { userId, projectId } = await setup();
    const add = (name: string) =>
      as(db, { sub: userId }, (tx) => tx.query("insert into label (project_id, name) values ($1, $2)", [projectId, name]));
    await add("Backend");
    await expect(add("backend")).rejects.toThrow(/duplicate key/);
  });

  test("a task can only get labels from its own project", async () => {
    const { userId, projectId } = await setup();
    const task = await createTask(userId, projectId);
    const otherProject = await as(db, { sub: userId }, (tx) =>
      one<{ id: string }>(tx, "insert into project (name, key) values ('Other', 'OTH') returning id"),
    );
    const label = await as(db, { sub: userId }, (tx) =>
      one<{ id: string }>(tx, "insert into label (project_id, name) values ($1, 'ui') returning id", [otherProject.id]),
    );
    await expect(
      as(db, { sub: userId }, (tx) =>
        tx.query("insert into task_label (task_id, label_id) values ($1, $2)", [task.id, label.id]),
      ),
    ).rejects.toThrow(/foreign key/);
  });
});

describe("comments", () => {
  type Claims = { sub: string; agent_id?: string; api_key_id?: string };

  const addComment = (claims: Claims, taskId: string, body: string) =>
    as(db, claims, (tx) =>
      one<{ id: string }>(tx, "insert into comment (task_id, body) values ($1, $2) returning id", [taskId, body]),
    );
  const edit = (claims: Claims, id: string, body: string) =>
    as(db, claims, async (tx) => (await tx.query("update comment set body = $2 where id = $1", [id, body])).affectedRows);
  const remove = (claims: Claims, id: string) =>
    as(db, claims, async (tx) => (await tx.query("delete from comment where id = $1", [id])).affectedRows);

  async function scene() {
    const { userId, projectId } = await setup();
    const agent = await createAgent(userId);
    const task = await createTask(userId, projectId);
    const mine = await addComment({ sub: userId }, task.id, "From me");
    const agents = await addComment(agent, task.id, "From the agent");
    return { userId, agent, task, mine, agents };
  }

  test("only the author can edit, and edits bump updated_at", async () => {
    const { userId, agent, mine, agents } = await scene();
    const outsider = await setup();

    expect(await edit({ sub: userId }, agents.id, "Hijacked")).toBe(0);
    expect(await edit(agent, mine.id, "Hijacked")).toBe(0);
    expect(await edit({ sub: outsider.userId }, mine.id, "Hijacked")).toBe(0);

    expect(await edit({ sub: userId }, mine.id, "From me, edited")).toBe(1);
    expect(await edit(agent, agents.id, "From the agent, edited")).toBe(1);

    const rows = await as(db, { sub: userId }, async (tx) =>
      (await tx.query<{ body: string; edited: boolean }>("select body, updated_at > created_at as edited from comment order by created_at")).rows,
    );
    expect(rows).toEqual([
      { body: "From me, edited", edited: true },
      { body: "From the agent, edited", edited: true },
    ]);
  });

  test("cannot change anything but the body", async () => {
    const { userId, mine } = await scene();
    await expect(
      as(db, { sub: userId }, (tx) => tx.query("update comment set author_user_id = null where id = $1", [mine.id])),
    ).rejects.toThrow(/permission denied/);
  });

  test("people delete their own and agents' comments; agents delete none", async () => {
    const { userId, agent, mine, agents } = await scene();
    const outsider = await setup();

    expect(await remove(agent, agents.id)).toBe(0);
    expect(await remove(agent, mine.id)).toBe(0);
    expect(await remove({ sub: outsider.userId }, mine.id)).toBe(0);

    expect(await remove({ sub: userId }, agents.id)).toBe(1);
    expect(await remove({ sub: userId }, mine.id)).toBe(1);
  });

  test("edits and deletions are logged on the task, without the text", async () => {
    const { userId, task, mine } = await scene();
    await edit({ sub: userId }, mine.id, "From me"); // unchanged: not logged
    await edit({ sub: userId }, mine.id, "Secret: hunter2");
    await remove({ sub: userId }, mine.id);

    const log = await as(db, { sub: userId }, async (tx) =>
      (await tx.query<{ action: string; changes: unknown }>(
        "select action, changes from activity_log where entity_type = 'task' and entity_id = $1 order by seq",
        [task.id],
      )).rows,
    );
    expect(log.map((e) => e.action)).toEqual(["created", "commented", "commented", "comment_edited", "comment_deleted"]);
    expect(log.slice(3).map((e) => e.changes)).toEqual([{ comment_id: mine.id }, { comment_id: mine.id }]);
  });
});

describe("agents", () => {
  test("act with their owner's access and are recorded as the comment author", async () => {
    const { userId, projectId } = await setup();
    const claims = await createAgent(userId);
    const task = await createTask(userId, projectId);

    const comment = await as(db, claims, (tx) =>
      one<{ author_user_id: string | null; author_agent_id: string }>(
        tx,
        "insert into comment (task_id, body) values ($1, 'Done') returning author_user_id, author_agent_id",
        [task.id],
      ),
    );
    expect(comment).toEqual({ author_user_id: null, author_agent_id: claims.agent_id });
  });

  test("cannot forge a comment author", async () => {
    const { userId, projectId } = await setup();
    const task = await createTask(userId, projectId);
    await expect(
      as(db, { sub: userId }, (tx) =>
        tx.query("insert into comment (task_id, body, author_user_id) values ($1, 'x', $2)", [task.id, userId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  test("cannot manage agents, API keys or the profile", async () => {
    const { userId } = await setup();
    const claims = await createAgent(userId);

    await expect(
      as(db, claims, (tx) => tx.query("insert into agent (name) values ('Rogue')")),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(db, claims, (tx) =>
        tx.query("insert into api_key (agent_id, name, prefix, hash) values ($1, 'x', 'bl_xxxx', $2)", [claims.agent_id, "f".repeat(64)]),
      ),
    ).rejects.toThrow(/row-level security/);

    const changed = await as(db, claims, async (tx) => ({
      agents: (await tx.query("update agent set name = 'Rogue', archived_at = now()")).affectedRows,
      keys: (await tx.query("update api_key set revoked_at = now()")).affectedRows,
      profile: (await tx.query("update profile set name = 'x'")).affectedRows,
      visibleKeys: (await tx.query("select id from api_key")).rows.length,
    }));
    expect(changed).toEqual({ agents: 0, keys: 0, profile: 0, visibleKeys: 0 });
  });

  test("users cannot create keys for agents they don't own", async () => {
    const owner = await setup();
    const claims = await createAgent(owner.userId);
    const other = await setup();
    await expect(
      as(db, { sub: other.userId }, (tx) =>
        tx.query("insert into api_key (agent_id, name, prefix, hash) values ($1, 'x', 'bl_xxxx', $2)", [claims.agent_id, "e".repeat(64)]),
      ),
    ).rejects.toThrow();
  });
});

describe("api keys", () => {
  test("the hash is never readable by clients", async () => {
    const { userId } = await setup();
    await createAgent(userId);
    await expect(
      as(db, { sub: userId }, (tx) => tx.query("select hash from api_key")),
    ).rejects.toThrow(/permission denied/);
    const visible = await as(db, { sub: userId }, (tx) => tx.query("select id, prefix from api_key"));
    expect(visible.rows).toHaveLength(1);
  });

  test("revoked keys stay revoked", async () => {
    const { userId } = await setup();
    const { api_key_id } = await createAgent(userId);
    await as(db, { sub: userId }, (tx) => tx.query("update api_key set revoked_at = now() where id = $1", [api_key_id]));
    await expect(
      as(db, { sub: userId }, (tx) => tx.query("update api_key set revoked_at = null where id = $1", [api_key_id])),
    ).rejects.toThrow(/cannot be restored/);
  });
});

describe("activity log", () => {
  type Entry = {
    action: string;
    actor_type: string;
    user_id: string | null;
    agent_id: string | null;
    api_key_id: string | null;
    changes: Record<string, unknown>;
  };

  const taskActivity = (sub: string, taskId: string) =>
    as(db, { sub }, async (tx) =>
      (await tx.query<Entry>(
        `select action, actor_type, user_id, agent_id, api_key_id, changes
         from activity_log where entity_type = 'task' and entity_id = $1 order by seq`,
        [taskId],
      )).rows,
    );

  test("records human and AI changes with the agent and key used", async () => {
    const { userId, projectId } = await setup();
    const claims = await createAgent(userId);
    const task = await createTask(userId, projectId, "Write docs");

    await as(db, claims, async (tx) => {
      await tx.query("update task set status = 'in_progress' where id = $1", [task.id]);
      await tx.query("update task set position = 'a5' where id = $1", [task.id]);
      await tx.query("update task set title = 'Write the docs' where id = $1", [task.id]);
      await tx.query("insert into comment (task_id, body) values ($1, 'Started')", [task.id]);
    });
    await as(db, { sub: userId }, (tx) =>
      tx.query("update task set archived_at = now() where id = $1", [task.id]),
    );

    const log = await taskActivity(userId, task.id);
    expect(log.map((e) => [e.action, e.actor_type])).toEqual([
      ["created", "human"],
      ["moved", "ai"],
      // The position-only reorder is not logged.
      ["updated", "ai"],
      ["commented", "ai"],
      ["archived", "human"],
    ]);

    const moved = log[1];
    expect(moved).toMatchObject({
      user_id: userId,
      agent_id: claims.agent_id,
      api_key_id: claims.api_key_id,
      changes: { status: { from: "backlog", to: "in_progress" } },
    });
    expect(log[2].changes).toEqual({ title: { from: "Write docs", to: "Write the docs" } });
  });

  test("records label changes on the task", async () => {
    const { userId, projectId } = await setup();
    const task = await createTask(userId, projectId);
    await as(db, { sub: userId }, async (tx) => {
      const label = await one<{ id: string }>(tx, "insert into label (project_id, name) values ($1, 'bug') returning id", [projectId]);
      await tx.query("insert into task_label (task_id, label_id) values ($1, $2)", [task.id, label.id]);
      await tx.query("delete from task_label where task_id = $1", [task.id]);
    });
    const actions = (await taskActivity(userId, task.id)).map((e) => e.action);
    expect(actions).toEqual(["created", "label_added", "label_removed"]);
  });

  test("clients cannot write to it", async () => {
    const { userId, projectId } = await setup();
    await expect(
      as(db, { sub: userId }, (tx) =>
        tx.query(
          "insert into activity_log (workspace_id, entity_type, entity_id, actor_type, action) select workspace_id, 'project', $1, 'human', 'x' from project where id = $1",
          [projectId],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("board columns", () => {
  type Column = { id: string; kind: string; name: string; counts_as: string; position: string; hidden: boolean };

  const columns = (sub: string, projectId: string) =>
    as(db, { sub }, async (tx) =>
      (await tx.query<Column>("select * from board_column where project_id = $1 order by position", [projectId])).rows,
    );
  const builtin = async (sub: string, projectId: string, kind: string) =>
    (await columns(sub, projectId)).find((c) => c.kind === kind)!;
  const addColumn = (sub: string, projectId: string, name: string, position: string, countsAs = "in_progress") =>
    as(db, { sub }, (tx) =>
      one<Column>(
        tx,
        "insert into board_column (project_id, name, counts_as, position) values ($1, $2, $3, $4) returning *",
        [projectId, name, countsAs, position],
      ),
    );
  const taskRow = (sub: string, id: string) =>
    as(db, { sub }, (tx) =>
      one<{ column_id: string; status: string; done_at: string | null; version: number }>(
        tx,
        "select column_id, status, done_at, version from task where id = $1",
        [id],
      ),
    );
  const update = (sub: string, sql: string, params: unknown[]) => as(db, { sub }, (tx) => tx.query(sql, params));

  test("every project starts with Backlog, To do, In progress and Done, and new tasks go to Backlog", async () => {
    const { userId, projectId } = await setup();
    expect((await columns(userId, projectId)).map((c) => [c.kind, c.name, c.counts_as, c.hidden])).toEqual([
      ["backlog", "Backlog", "backlog", false],
      ["todo", "To do", "todo", false],
      ["in_progress", "In progress", "in_progress", false],
      ["done", "Done", "done", false],
    ]);
    const task = await createTask(userId, projectId);
    const backlog = await builtin(userId, projectId, "backlog");
    expect(await taskRow(userId, task.id)).toMatchObject({ column_id: backlog.id, status: "backlog" });
  });

  test("moving to a column sets the status; setting a status moves to its column", async () => {
    const { userId, projectId } = await setup();
    const review = await addColumn(userId, projectId, "In review", "a2V");
    const task = await createTask(userId, projectId);

    await update(userId, "update task set column_id = $1 where id = $2", [review.id, task.id]);
    expect(await taskRow(userId, task.id)).toMatchObject({ column_id: review.id, status: "in_progress" });

    // Same status, so it stays in its custom column; another status moves it.
    await update(userId, "update task set title = 'Renamed' where id = $1", [task.id]);
    expect((await taskRow(userId, task.id)).column_id).toBe(review.id);
    await update(userId, "update task set status = 'done' where id = $1", [task.id]);
    const done = await builtin(userId, projectId, "done");
    expect(await taskRow(userId, task.id)).toMatchObject({ column_id: done.id, status: "done" });
    expect((await taskRow(userId, task.id)).done_at).not.toBeNull();

    // A status that doesn't match the column is overruled by the column.
    await update(userId, "update task set column_id = $1, status = 'todo' where id = $2", [review.id, task.id]);
    expect(await taskRow(userId, task.id)).toMatchObject({ column_id: review.id, status: "in_progress", done_at: null });
  });

  test("a status move into a hidden built-in goes to the first visible column counting as it", async () => {
    const { userId, projectId } = await setup();
    const inProgress = await builtin(userId, projectId, "in_progress");
    await update(userId, "update board_column set hidden = true where id = $1", [inProgress.id]);
    const task = await createTask(userId, projectId);

    // No visible column counts as In progress: the hidden one takes it (and shows while it has tasks).
    await update(userId, "update task set status = 'in_progress' where id = $1", [task.id]);
    expect((await taskRow(userId, task.id)).column_id).toBe(inProgress.id);

    const doing = await addColumn(userId, projectId, "Doing", "a2V");
    const later = await addColumn(userId, projectId, "Later", "a2X");
    expect(later.position > doing.position).toBe(true);
    await update(userId, "update task set status = 'todo' where id = $1", [task.id]);
    await update(userId, "update task set status = 'in_progress' where id = $1", [task.id]);
    expect((await taskRow(userId, task.id)).column_id).toBe(doing.id);
  });

  test("built-ins keep their names and place, and only empty To do / In progress can be hidden", async () => {
    const { userId, projectId } = await setup();
    const [backlog, todo, , done] = await columns(userId, projectId);
    await expect(update(userId, "update board_column set name = 'Ready' where id = $1", [todo.id])).rejects.toThrow(
      /keep their name/,
    );
    await expect(update(userId, "update board_column set position = 'a9' where id = $1", [done.id])).rejects.toThrow(
      /first and last/,
    );
    await expect(update(userId, "update board_column set hidden = true where id = $1", [backlog.id])).rejects.toThrow(
      /board_column_hidden/,
    );
    await expect(addColumn(userId, projectId, "After done", "a4")).rejects.toThrow(/between Backlog and Done/);
    await expect(addColumn(userId, projectId, "Before backlog", "Zz")).rejects.toThrow(/between Backlog and Done/);
    await expect(addColumn(userId, projectId, "Shipped", "a2V", "done")).rejects.toThrow(/board_column_counts_as/);
    await expect(addColumn(userId, projectId, "to DO", "a2V")).rejects.toThrow(/board_column_name_idx/);

    const task = await createTask(userId, projectId);
    await update(userId, "update task set status = 'todo' where id = $1", [task.id]);
    await expect(update(userId, "update board_column set hidden = true where id = $1", [todo.id])).rejects.toThrow(
      /Only an empty column/,
    );
    await update(userId, "update task set archived_at = now() where id = $1", [task.id]);
    await update(userId, "update board_column set hidden = true where id = $1", [todo.id]);
    // Reordering To do among the other columns is fine.
    await update(userId, "update board_column set position = 'a2V' where id = $1", [todo.id]);
  });

  test("changing what a custom column counts as changes its tasks' status", async () => {
    const { userId, projectId } = await setup();
    const ready = await addColumn(userId, projectId, "Ready", "a2V");
    const task = await createTask(userId, projectId);
    await update(userId, "update task set column_id = $1 where id = $2", [ready.id, task.id]);
    await update(userId, "update board_column set counts_as = 'todo' where id = $1", [ready.id]);
    expect(await taskRow(userId, task.id)).toMatchObject({ column_id: ready.id, status: "todo" });
  });

  test("deleting a custom column moves its tasks first; built-ins can't be deleted", async () => {
    const { userId, projectId } = await setup();
    const review = await addColumn(userId, projectId, "Review", "a2V");
    const task = await createTask(userId, projectId);
    await update(userId, "update task set column_id = $1 where id = $2", [review.id, task.id]);
    const done = await builtin(userId, projectId, "done");

    const remove = (columnId: string, moveTo: string | null) =>
      update(userId, "select public.delete_board_column($1, $2)", [columnId, moveTo]);
    await expect(remove(review.id, null)).rejects.toThrow(/move_to must be another column/);
    await expect(remove(review.id, review.id)).rejects.toThrow(/move_to must be another column/);
    await expect(remove(done.id, review.id)).rejects.toThrow(/can't be deleted/);
    await expect(update(userId, "delete from board_column where id = $1", [done.id])).resolves.toMatchObject({
      affectedRows: 0,
    });

    await remove(review.id, done.id);
    expect(await taskRow(userId, task.id)).toMatchObject({ column_id: done.id, status: "done" });
    expect((await columns(userId, projectId)).map((c) => c.name)).toEqual(["Backlog", "To do", "In progress", "Done"]);
  });

  test("agents move tasks between columns but can't manage columns", async () => {
    const { userId, projectId } = await setup();
    const review = await addColumn(userId, projectId, "Review", "a2V");
    const agent = await createAgent(userId);
    const task = await createTask(userId, projectId);

    await as(db, agent, (tx) => tx.query("update task set column_id = $1 where id = $2", [review.id, task.id]));
    expect((await taskRow(userId, task.id)).column_id).toBe(review.id);

    await expect(
      as(db, agent, (tx) =>
        tx.query("insert into board_column (project_id, name, position) values ($1, 'Bot column', 'a2X')", [projectId]),
      ),
    ).rejects.toThrow(/row-level security/);
    const renamed = await as(db, agent, (tx) =>
      tx.query("update board_column set name = 'Hacked' where id = $1", [review.id]),
    );
    expect(renamed.affectedRows).toBe(0);
    // A valid move, but the delete is refused, so the task move rolls back with it.
    const done = await builtin(userId, projectId, "done");
    await expect(
      as(db, agent, (tx) => tx.query("select public.delete_board_column($1, $2)", [review.id, done.id])),
    ).rejects.toThrow(/don't have access/);
    expect((await taskRow(userId, task.id)).column_id).toBe(review.id);
  });

  test("column changes are logged on the project, deletions included", async () => {
    const { userId, projectId } = await setup();
    const review = await addColumn(userId, projectId, "Review", "a2V");
    await update(userId, "update board_column set name = 'QA' where id = $1", [review.id]);
    const done = await builtin(userId, projectId, "done");
    await update(userId, "select public.delete_board_column($1, $2)", [review.id, done.id]);
    const entries = await as(db, { sub: userId }, async (tx) =>
      (
        await tx.query<{ action: string; changes: Record<string, unknown> }>(
          "select action, changes from activity_log where entity_type = 'board_column' and entity_id = $1 order by seq",
          [review.id],
        )
      ).rows,
    );
    expect(entries.map((e) => e.action)).toEqual(["created", "updated", "deleted"]);
    expect(entries[2].changes).toEqual({ name: "QA" });
  });

  test("deleted columns' tasks can't go to a hidden column or another project's", async () => {
    const a = await setup();
    const b = await setup("OTB");
    const review = await addColumn(a.userId, a.projectId, "Review", "a2V");
    const todo = await builtin(a.userId, a.projectId, "todo");
    await update(a.userId, "update board_column set hidden = true where id = $1", [todo.id]);
    const remove = (sub: string, columnId: string, moveTo: string) =>
      update(sub, "select public.delete_board_column($1, $2)", [columnId, moveTo]);

    await expect(remove(a.userId, review.id, todo.id)).rejects.toThrow(/move_to is hidden/);
    const otherDone = await builtin(b.userId, b.projectId, "done");
    await expect(remove(a.userId, review.id, otherDone.id)).rejects.toThrow(/another column in this project/);
    // Another workspace can't see the column at all.
    await expect(remove(b.userId, review.id, otherDone.id)).rejects.toThrow(/column not found/);
    await expect(update(b.userId, "delete from board_column where id = $1", [review.id])).resolves.toMatchObject({
      affectedRows: 0,
    });
    expect((await columns(a.userId, a.projectId)).map((c) => c.name)).toContain("Review");
  });

  test("columns stay inside their workspace and project", async () => {
    const a = await setup();
    const b = await setup("OTH");
    const aColumns = await columns(a.userId, a.projectId);
    expect(await columns(b.userId, a.projectId)).toEqual([]);

    // A task can't sit in a column of another project, even in the same workspace.
    const other = await as(db, { sub: a.userId }, (tx) =>
      one<{ id: string }>(tx, "insert into project (name, key) values ('Other', 'OT2') returning id"),
    );
    const otherTodo = await builtin(a.userId, other.id, "todo");
    const task = await createTask(a.userId, a.projectId);
    await expect(
      update(a.userId, "update task set column_id = $1 where id = $2", [otherTodo.id, task.id]),
    ).rejects.toThrow(/column not found/);
    await expect(
      update(b.userId, "update board_column set name = 'Mine' where id = $1", [aColumns[1].id]),
    ).resolves.toMatchObject({ affectedRows: 0 });
  });
});
