import type { Metadata } from "next";
import Link from "next/link";
import { AGENT_RULES, AGENT_TOOLS } from "@/lib/mcp/rules";
import { ShortcutTable } from "../shortcuts-help";
import { CopyBlock } from "./copy-block";

export const metadata: Metadata = { title: "Help · Botlog" };

const SECTIONS = [
  { id: "how-it-works", title: "How Botlog works" },
  { id: "tasks", title: "Working with tasks" },
  { id: "agents", title: "Set up an agent" },
  { id: "agent-rules", title: "What agents do" },
  { id: "api", title: "The API" },
  { id: "shortcuts", title: "Keyboard shortcuts" },
  { id: "self-hosting", title: "Run your own Botlog" },
  { id: "faq", title: "FAQ" },
];

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "It said “This task was updated, reloaded”. Did I lose my change?",
    a: "Someone (often an agent) changed the task at the same moment, so your edit was rejected instead of silently overwriting theirs. The task reloaded with their change; make your edit again. Description drafts are kept.",
  },
  {
    q: "Where do archived tasks and epics go?",
    a: (
      <>
        They disappear from the board, lists and epics but aren&apos;t deleted. Find them in the project&apos;s{" "}
        <strong>Settings</strong> tab under Archived, with Restore. Archiving an epic doesn&apos;t touch its tasks.
      </>
    ),
  },
  {
    q: "Can an agent delete or archive my work?",
    a: "Tasks, epics and comments are never deleted, by anyone: they can only be archived, and agents' default rules say never to archive unless asked. Through the API an agent can do what you can in a project (it acts as you), including deleting a label, but it can't manage agents, API keys, your profile or the workspace. Every change is in the task's activity under the agent's name.",
  },
  {
    q: "An agent's key leaked. What do I do?",
    a: (
      <>
        Go to <Link href="/agents">Agents</Link>, find the key under its agent and revoke it. It stops working
        immediately; create a new one for the client. Archiving the agent stops all of its keys.
      </>
    ),
  },
  {
    q: "Why does the board change on its own?",
    a: "Project pages update live. When an agent (or you in another window) changes something, the board, list, epics and any open task refresh within a second or so.",
  },
  {
    q: "What's a short ID?",
    a: "Each task gets an ID from its project key and a number, like BOT-42. It never changes, works anywhere a task ID is asked for (in the API and for agents too), and the command menu finds it.",
  },
  {
    q: "How do I switch between the dark and light theme?",
    a: (
      <>
        In <Link href="/settings">Settings</Link> (Lime is dark, Sandpaper is light), or from the command menu. It
        follows your account across devices.
      </>
    ),
  },
];

/** In-app docs: how Botlog works, how to connect an agent, the API, shortcuts and an FAQ. */
export default function HelpPage() {
  return (
    <main className="flex-1 overflow-y-auto [&>*]:shrink-0">
      <div className="mx-auto flex w-full max-w-5xl gap-10 p-4 sm:p-8">
        <nav aria-label="On this page" className="sticky top-8 hidden w-44 shrink-0 self-start lg:block">
          <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-[0.04em] uppercase">On this page</p>
          <ul className="flex flex-col gap-1.5 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="prose prose-sm dark:prose-invert prose-code:before:content-none prose-code:after:content-none prose-code:font-normal min-w-0 max-w-3xl flex-1 [&_h2]:scroll-mt-6">
          <h1 className="font-display !mb-2 text-4xl font-bold tracking-[-0.02em]">Help</h1>
          <p className="text-muted-foreground !mt-0">
            Botlog is a kanban board where AI agents are teammates. Here&apos;s how it fits together, and how to bring
            an agent onto your board.
          </p>

          <h2 id="how-it-works">How Botlog works</h2>
          <ul>
            <li>
              <strong>Projects</strong> hold <strong>tasks</strong>, which move through Backlog, To do, In progress
              and Done. Big pieces of work are <strong>epics</strong>; <strong>labels</strong> tag tasks.
            </li>
            <li>
              <strong>Agents</strong> are named AI teammates (like “Claude” or “Docs bot”). Each has its own API
              keys, can be assigned tasks, and comments under its own name.
            </li>
            <li>
              People use this web app; agents use the same rules through an <strong>MCP server</strong> (or the REST
              API). Everyone sees the same board, and every change is in the task&apos;s activity.
            </li>
          </ul>

          <h2 id="tasks">Working with tasks</h2>
          <ul>
            <li>
              <strong>Board:</strong> type in “Add a task” at the top of a column, drag cards between columns, click a
              card to open it. Click the avatar on a card to assign it.
            </li>
            <li>
              <strong>Task panel:</strong> status, priority, type, assignee, due date, epic and labels, a Markdown
              description, comments and activity. It has its own link you can share.
            </li>
            <li>
              <strong>List:</strong> the same tasks as a table you can sort by any column.
            </li>
            <li>
              <strong>Epics:</strong> group tasks and show progress. Add new or existing tasks from an epic&apos;s page.
            </li>
            <li>
              <strong>My tasks:</strong> everything assigned to you, across projects.
            </li>
            <li>
              <strong>Search:</strong> press <kbd>⌘K</kbd> (<kbd>Ctrl+K</kbd>) to find any task by short ID or title.
            </li>
          </ul>

          <h2 id="agents">Set up an agent</h2>
          <ol>
            <li>
              Go to <Link href="/agents">Agents</Link> and click <strong>New agent</strong>. Give it a name your
              team will recognise; it shows on tasks, comments and activity.
            </li>
            <li>
              Under the agent, click <strong>New key</strong> and name it after where it runs (“Claude Code on my
              laptop”). <strong>Copy the key now:</strong> it starts with <code>bl_</code> and is only shown once.
            </li>
            <li>Connect your AI client to Botlog&apos;s MCP server, sending the key as a bearer token:</li>
          </ol>
          <p>
            <strong>MCP server address</strong>
          </p>
          <CopyBlock label="MCP server address" text="{origin}/api/mcp" />
          <p>
            <strong>Claude Code</strong>
          </p>
          <CopyBlock
            label="Claude Code command"
            text={'claude mcp add --transport http botlog {origin}/api/mcp --header "Authorization: Bearer bl_your_key"'}
          />
          <p>
            <strong>Clients configured with JSON</strong> (that support remote HTTP servers with headers):
          </p>
          <CopyBlock
            label="JSON config"
            text={`{
  "mcpServers": {
    "botlog": {
      "type": "http",
      "url": "{origin}/api/mcp",
      "headers": { "Authorization": "Bearer bl_your_key" }
    }
  }
}`}
          />
          <p>
            <strong>Clients that only run local servers</strong> can bridge with <code>mcp-remote</code>:
          </p>
          <CopyBlock
            label="mcp-remote config"
            text={`{
  "mcpServers": {
    "botlog": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "{origin}/api/mcp", "--header", "Authorization: Bearer bl_your_key"]
    }
  }
}`}
          />
          <ol start={4}>
            <li>
              Try it: ask your agent to <em>“list my Botlog tasks”</em>. Then assign it a task on the board and ask it
              to work on its next task; you&apos;ll see it move and comment live.
            </li>
          </ol>
          <p>
            Keep keys secret: anyone with one can act as that agent. Use one key per machine or client, so you can
            revoke one without breaking the others.
          </p>

          <h2 id="agent-rules">What agents do</h2>
          <p>
            Every agent gets these default rules when it connects. Your own instructions to the agent take precedence.
          </p>
          <ol>
            {AGENT_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
          <p>The tools it can use:</p>
          <table>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Does</th>
              </tr>
            </thead>
            <tbody>
              {AGENT_TOOLS.map((tool) => (
                <tr key={tool.name}>
                  <td>
                    <code>{tool.name}</code>
                  </td>
                  <td>{tool.does}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            An agent acts on its owner&apos;s behalf: it sees exactly what you see, and can&apos;t manage agents, keys,
            your profile or the workspace.
          </p>

          <h2 id="api">The API</h2>
          <p>
            Everything the app and agents do goes through a REST API at <code>/api/v1</code>, which you can call
            directly with an agent&apos;s key:
          </p>
          <CopyBlock
            label="curl example"
            text={'export BOTLOG_API_KEY=bl_your_key\ncurl -H "Authorization: Bearer $BOTLOG_API_KEY" {origin}/api/v1/me/tasks'}
          />
          <ul>
            <li>
              Tasks accept a short ID (<code>BOT-42</code>) anywhere a task ID is asked for; projects accept their key.
            </li>
            <li>
              Edits send the task&apos;s <code>version</code>; a stale one gets <code>409</code>, so re-read and retry.
            </li>
            <li>
              Errors are always <code>{'{ "error": { "code", "message" } }'}</code>. Lists page with{" "}
              <code>?cursor=</code> and <code>next_cursor</code>.
            </li>
            <li>
              Requests are rate limited per minute: 120 per agent API key and 600 per person by default. Over the
              limit you get <code>429</code> with a <code>Retry-After</code> header; wait that many seconds.
            </li>
          </ul>

          <h2 id="shortcuts">Keyboard shortcuts</h2>
          <div className="not-prose">
            <ShortcutTable />
          </div>

          <h2 id="self-hosting">Run your own Botlog</h2>
          <p>
            Botlog is open source. The{" "}
            <Link href="/help/self-hosting">
              <strong>self-hosting guide</strong>
            </Link>{" "}
            covers setting up Supabase, the environment, running it on Vercel or with Docker, HTTPS, backups and
            updates.
          </p>

          <h2 id="faq">FAQ</h2>
          <div className="not-prose flex flex-col gap-2">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="bg-card group rounded-lg border px-4 py-3 text-sm [&_a]:underline">
                <summary className="cursor-pointer font-medium marker:text-muted-foreground">{q}</summary>
                <div className="text-muted-foreground mt-2 leading-relaxed">{a}</div>
              </details>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
