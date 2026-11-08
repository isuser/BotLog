import { describe, expect, test } from "vitest";
import { actorName, agentLabel, agentRole, assigneeOptions, type Actor } from "./assignees";

const pedro = { id: "u1", name: "Pedro", email: "pedro@example.com" };
const bea = { id: "u2", name: "Bea", email: "bea@example.com" };
const mine = { id: "g1", name: "Claude", avatar: null, owner: { id: pedro.id, name: pedro.name } };
const beas = { id: "g2", name: "Botalicious", avatar: null, owner: { id: bea.id, name: bea.name } };
const shared = { shared: true, meId: pedro.id };
const solo = { shared: false, meId: pedro.id };

describe("agentRole and agentLabel", () => {
  test("show the owner only in shared projects", () => {
    expect(agentLabel(beas, shared)).toBe("Botalicious (Bea's agent)");
    expect(agentLabel(beas, solo)).toBe("Botalicious");
    expect(agentRole(beas.owner, shared)).toBe("Bea's agent");
    expect(agentRole(beas.owner, solo)).toBe("agent");
  });

  test("call the viewer's own agents theirs", () => {
    expect(agentLabel(mine, shared)).toBe("Claude (your agent)");
    expect(agentRole(mine.owner, shared)).toBe("your agent");
  });

  test("fall back when the owner or names are unknown", () => {
    expect(agentLabel({ name: "Bot", owner: null }, shared)).toBe("Bot");
    expect(agentLabel({ name: "", owner: { id: "u9", name: "" } }, shared)).toBe("Agent (a member's agent)");
  });
});

describe("actorName", () => {
  test("names people by name, else email, and agents by label", () => {
    expect(actorName({ type: "user", ...bea })).toBe("Bea");
    expect(actorName({ type: "user", ...bea, name: "" })).toBe("bea@example.com");
    expect(actorName({ type: "agent", ...beas }, shared)).toBe("Botalicious (Bea's agent)");
    expect(actorName({ type: "agent", ...beas })).toBe("Botalicious");
  });
});

describe("assigneeOptions", () => {
  const labels = (options: ReturnType<typeof assigneeOptions>) => options.map((o) => o.label);

  test("lists nobody, you, the other members, your agents, then everyone else's", () => {
    const options = assigneeOptions({
      me: pedro,
      members: [pedro, bea],
      agents: [beas, mine],
      current: null,
      context: shared,
    });
    expect(labels(options)).toEqual(["Unassigned", "Me", "Bea", "Claude (your agent)", "Botalicious (Bea's agent)"]);
    expect(options[4].actor).toEqual({ type: "agent", ...beas });
  });

  test("single-member projects list agents by name", () => {
    const options = assigneeOptions({ me: pedro, members: [pedro], agents: [mine], current: null, context: solo });
    expect(labels(options)).toEqual(["Unassigned", "Me", "Claude"]);
  });

  test("keeps the current assignee listed when it isn't an option", () => {
    const archived: Actor = { type: "agent", id: "g3", name: "Old bot", avatar: null, owner: bea };
    const options = assigneeOptions({ me: pedro, members: [pedro, bea], current: archived, context: shared });
    expect(labels(options)).toEqual(["Unassigned", "Old bot (Bea's agent)", "Me", "Bea"]);
  });

  test("works before the lists load", () => {
    expect(labels(assigneeOptions({ me: undefined, current: null, context: solo }))).toEqual(["Unassigned"]);
  });
});
