import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyBlock } from "../copy-block";

export const metadata: Metadata = { title: "Self-hosting · Botlog" };

const SECTIONS = [
  { id: "overview", title: "What you're running" },
  { id: "code", title: "1. Get the code" },
  { id: "supabase", title: "2. Set up Supabase" },
  { id: "env", title: "3. Environment" },
  { id: "run", title: "4. Run it" },
  { id: "https", title: "5. HTTPS" },
  { id: "google", title: "Google sign-in" },
  { id: "people", title: "Adding people" },
  { id: "cleanup", title: "Image cleanup" },
  { id: "backups", title: "Backups" },
  { id: "updates", title: "Updates" },
  { id: "troubleshooting", title: "Troubleshooting" },
];

const ENV: { name: string; required: boolean; what: React.ReactNode }[] = [
  { name: "NEXT_PUBLIC_SITE_URL", required: true, what: "Your Botlog address, like https://botlog.example.com." },
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    what: "Your Supabase project URL (Project Settings → API Keys). Compiled into the build.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    required: true,
    what: (
      <>
        The publishable key (<code>sb_publishable_…</code>). Safe in the browser; access rules protect the data.
        Compiled into the build.
      </>
    ),
  },
  {
    name: "SUPABASE_SECRET_KEY",
    required: true,
    what: (
      <>
        The secret key (<code>sb_secret_…</code>). Server only, never a <code>NEXT_PUBLIC_</code> name. Botlog uses it
        only to look up agent API keys.
      </>
    ),
  },
  {
    name: "SUPABASE_JWT_SIGNING_KEY",
    required: true,
    what: "The private JWT signing key (see step 2), as one line. Botlog signs short-lived tokens with it for agent requests. Server only.",
  },
  {
    name: "ALLOWED_EMAILS",
    required: true,
    what: "Comma-separated emails that may sign in. Leave empty only if you mean to run a public instance.",
  },
  {
    name: "GOOGLE_SIGN_IN",
    required: false,
    what: (
      <>
        <code>true</code> shows <strong>Continue with Google</strong> on the sign-in page. Set up Google first (see{" "}
        <a href="#google">Google sign-in</a>).
      </>
    ),
  },
  { name: "RATE_LIMIT_API_KEY_PER_MINUTE", required: false, what: "Requests a minute per agent API key. Default 120." },
  { name: "RATE_LIMIT_USER_PER_MINUTE", required: false, what: "Requests a minute per person. Default 600." },
  {
    name: "CRON_SECRET",
    required: false,
    what: (
      <>
        Turns on the daily image cleanup (see <a href="#cleanup">Image cleanup</a>). Any long random string, like the
        output of <code>openssl rand -hex 32</code>.
      </>
    ),
  },
];

/** How to run your own Botlog: Supabase setup, environment, Vercel or Docker, HTTPS, backups and updates. */
export default function SelfHostingPage() {
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
          <Link href="/help" className="text-muted-foreground hover:text-foreground !no-underline flex w-fit items-center gap-1.5 text-sm">
            <ArrowLeftIcon className="size-4" /> Help
          </Link>
          <h1 className="font-display !mt-4 !mb-2 text-4xl font-bold tracking-[-0.02em]">Self-hosting</h1>
          <p className="text-muted-foreground !mt-0">
            Botlog is open source (MIT). This is how to run your own copy, on Vercel or anywhere Docker runs.
          </p>

          <h2 id="overview">What you&apos;re running</h2>
          <ul>
            <li>
              <strong>The app:</strong> one Next.js server with the web app, the REST API (<code>/api/v1</code>) and the
              MCP server for agents (<code>/api/mcp</code>).
            </li>
            <li>
              <strong>A Supabase project:</strong> Postgres, sign-in and realtime. Supabase Cloud (the free tier is
              enough to start) or Supabase&apos;s own self-hosted Docker setup both work.
            </li>
          </ul>
          <p>
            You need Node 24 and pnpm (or Docker), the Supabase CLI (it comes with <code>pnpm install</code>), and a
            domain with HTTPS.
          </p>

          <h2 id="code">1. Get the code</h2>
          <CopyBlock
            label="clone commands"
            text={`git clone https://github.com/isuser/BotLog.git botlog
cd botlog
pnpm install
cp .env.example .env    # .env.local if you'll run it with pnpm instead of Docker`}
          />

          <h2 id="supabase">2. Set up Supabase</h2>
          <ol>
            <li>
              <strong>Create a project</strong> and, under Authentication → Sign In / Providers, turn off{" "}
              <strong>Allow new users to sign up</strong>. Accounts are created by you (step 5).
            </li>
            <li>
              <strong>Copy its keys</strong> (Project Settings → API Keys) into your env file: the project URL, the
              publishable key and the secret key.
            </li>
            <li>
              <strong>Add a signing key for agents.</strong> Agent requests are signed by Botlog with a key Supabase
              trusts. Generate one, import it in Project Settings → JWT Keys as a standby key, then rotate to it:
            </li>
          </ol>
          <CopyBlock label="signing key command" text="pnpm exec supabase gen signing-key --algorithm ES256" />
          <p>
            Paste the whole key (the JSON it prints) as one line into <code>SUPABASE_JWT_SIGNING_KEY</code>. On
            self-hosted Supabase that uses a shared JWT secret, put that secret there instead.
          </p>
          <ol start={4}>
            <li>
              <strong>Apply the database migrations</strong> (tables, access rules, realtime, and the private{" "}
              <code>attachments</code> Storage bucket for images). Link the CLI to your project and push:
            </li>
          </ol>
          <CopyBlock
            label="migration commands"
            text={`pnpm exec supabase link --project-ref your-project-ref
pnpm exec supabase db push`}
          />
          <p>
            For self-hosted Supabase, use <code>pnpm exec supabase db push --db-url postgres://…</code> with your
            database&apos;s connection string.
          </p>
          <ol start={5}>
            <li>
              <strong>Create your account</strong> under Authentication → Users → Add user, with Auto confirm on.
              Do this after the migrations: they set up a workspace for each new user. Put the same email in{" "}
              <code>ALLOWED_EMAILS</code>.
            </li>
            <li>
              <strong>Set the Site URL</strong> (Authentication → URL Configuration) to your Botlog address.
            </li>
          </ol>

          <h2 id="env">3. Environment</h2>
          <table>
            <thead>
              <tr>
                <th>Variable</th>
                <th>What it is</th>
              </tr>
            </thead>
            <tbody>
              {ENV.map((v) => (
                <tr key={v.name}>
                  <td>
                    <code>{v.name}</code>
                    {!v.required && <span className="text-muted-foreground block text-xs">optional</span>}
                  </td>
                  <td>{v.what}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Never commit env files. The <code>NEXT_PUBLIC_</code> values are compiled into the app, so change them
            and you rebuild; the rest are read when the server starts.
          </p>

          <h2 id="run">4. Run it</h2>
          <p>
            <strong>Vercel:</strong> import the repository, set Node.js to 24.x, add the variables above, and deploy.
            Every push to <code>main</code> redeploys.
          </p>
          <p>
            <strong>Docker Compose:</strong> with your <code>.env</code> filled in, build and start it. It listens on
            port 3000 on this machine only (<code>127.0.0.1</code>), for the HTTPS proxy in step 5.
          </p>
          <CopyBlock label="docker compose command" text="docker compose up -d --build" />
          <p>
            <strong>Plain Node:</strong> build the standalone server and start it with your env loaded.
          </p>
          <CopyBlock
            label="node commands"
            text={`pnpm build
cp -r .next/static .next/standalone/.next/
rm -f .next/standalone/.env*    # the build copies env files in; keep secrets out of it
node --env-file=.env .next/standalone/server.js`}
          />
          <p>
            Next.js copies <code>.env</code> files into <code>.next/standalone</code> when it builds. Remove them (as
            above) before copying that folder anywhere, so your secret keys don&apos;t travel with it.
          </p>

          <h2 id="https">5. HTTPS</h2>
          <p>
            Put the app behind a reverse proxy that handles HTTPS. With{" "}
            <a href="https://caddyserver.com">Caddy</a>, this is the whole config (it gets the certificate for you):
          </p>
          <CopyBlock label="Caddyfile" text={`botlog.example.com {
  reverse_proxy localhost:3000
}`} />
          <p>
            Keep port 3000 private to the machine (Docker Compose already binds it to <code>127.0.0.1</code>), so
            nothing reaches Botlog without HTTPS. Sign-in cookies need HTTPS. The proxy must pass the original{" "}
            <code>Host</code> header through (Caddy does; on nginx add <code>proxy_set_header Host $host;</code>), or
            Google sign-in sends people back to the wrong address. Realtime connects from the browser straight to Supabase, so the proxy doesn&apos;t
            need websockets. Then open your address, sign in, and{" "}
            <Link href="/help#agents">set up an agent</Link>.
          </p>

          <h2 id="google">Google sign-in (optional)</h2>
          <p>
            Lets people sign in with their Google account instead of a password. It&apos;s free and needs no email
            setup. With sign-ups off in Supabase, only people who already have a Botlog account (and are in{" "}
            <code>ALLOWED_EMAILS</code>) get in; Google is just another way to prove who they are. It trusts whoever
            controls the Google account with that email, so only use it for addresses that really are the
            person&apos;s Google account (Gmail or their own Google Workspace).
          </p>
          <ol>
            <li>
              In <a href="https://console.cloud.google.com">Google Cloud</a>, create a project, open{" "}
              <strong>Google Auth Platform</strong> and click Get started: your app name, a support email,
              audience <strong>External</strong>.
            </li>
            <li>
              Under <strong>Audience</strong>, leave it in Testing and add everyone who will sign in as a test user
              (up to 100). The test-user list works as a second allowlist. Publishing instead needs a home page and
              privacy policy on a verified domain.
            </li>
            <li>
              Under <strong>Clients</strong>, create a <strong>Web application</strong> client. Authorized redirect
              URI: your Supabase callback,{" "}
              <code>https://your-project-ref.supabase.co/auth/v1/callback</code>. Copy the client ID and secret.
            </li>
            <li>
              In Supabase, under Authentication → Sign In / Providers → <strong>Google</strong>, turn it on and paste
              the client ID and secret. Leave <strong>Allow new users to sign up</strong> (on the same page, under
              User Signups) off.
            </li>
            <li>
              Under Authentication → URL Configuration → <strong>Redirect URLs</strong>, add{" "}
              <code>https://botlog.example.com/auth/callback</code> (your address).
            </li>
            <li>
              Set <code>GOOGLE_SIGN_IN=true</code> and redeploy. Setting it back to <code>false</code> turns Google
              sign-in off again.
            </li>
          </ol>
          <p>
            Google&apos;s screen names your Supabase project address rather than Botlog, and may warn that the app
            isn&apos;t verified while it&apos;s in Testing; that&apos;s expected.
          </p>

          <h2 id="people">Adding people</h2>
          <p>
            Each account gets its own workspace; people don&apos;t see each other&apos;s projects. To let someone in:
          </p>
          <ol>
            <li>
              Add their email to <code>ALLOWED_EMAILS</code> and redeploy (env changes only apply to a new
              deployment).
            </li>
            <li>
              In Supabase, go to Authentication → Users → <strong>Add user</strong> with that email and Auto confirm
              on. With Google sign-in, use their Google email and any long random password (they won&apos;t need
              it), and add them as a test user in Google Cloud; they then use <strong>Continue with Google</strong>.
              Without it, set a password and send it to them privately.
            </li>
          </ol>

          <h2 id="cleanup">Image cleanup</h2>
          <p>
            Images are linked from descriptions and comments, so removing one from the text, or deleting a comment,
            leaves its file in Storage. A cleanup deletes images that no description or comment links to any more
            and that were uploaded over a day ago (archived tasks keep theirs; links in epic and project descriptions
            count too). It runs when something calls{" "}
            <code>/api/cron/attachment-cleanup</code> with <code>CRON_SECRET</code>; without the variable it&apos;s
            off and files just take up space.
          </p>
          <ul>
            <li>
              <strong>Vercel:</strong> add <code>CRON_SECRET</code> to the project&apos;s environment variables and
              redeploy. <code>vercel.json</code> already schedules it every day at 04:00 UTC, and Vercel sends the
              secret.
            </li>
            <li>
              <strong>Docker or Node:</strong> set <code>CRON_SECRET</code> and schedule the request yourself, for
              example with a crontab line on the host:
            </li>
          </ul>
          <CopyBlock
            label="cleanup crontab line"
            text={`0 4 * * * curl -fsS -H "Authorization: Bearer your-cron-secret" https://botlog.example.com/api/cron/attachment-cleanup`}
          />

          <h2 id="backups">Backups</h2>
          <ul>
            <li>
              <strong>Database:</strong> Supabase Cloud backs up paid projects daily. On any plan (and self-hosted),
              dump it on a schedule with the CLI and keep the files somewhere else:
            </li>
          </ul>
          <CopyBlock
            label="backup commands"
            text={`pnpm exec supabase db dump --linked -f schema.sql
pnpm exec supabase db dump --linked --data-only -f data.sql`}
          />
          <ul>
            <li>
              <strong>Per project:</strong> a project&apos;s Settings tab has <strong>Download export</strong>: one JSON
              file with its epics, labels, tasks, comments and a list of its images (not the image files). Handy for
              keeping or moving your work; it isn&apos;t a database restore.
            </li>
            <li>
              <strong>Images:</strong> they live in Supabase Storage (the private <code>attachments</code> bucket), which
              database dumps don&apos;t include. Back the bucket up separately if you need the files. Each image is at
              most 2 MB; Supabase&apos;s free plan includes 1 GB of Storage.
            </li>
          </ul>

          <h2 id="updates">Updates</h2>
          <ol>
            <li>
              Pull the new version: <code>git pull</code>, then <code>pnpm install</code>.
            </li>
            <li>
              Apply new migrations: <code>pnpm exec supabase db push</code>. Check the release notes first if a
              migration changes or removes something.
            </li>
            <li>
              Rebuild and restart: <code>docker compose up -d --build</code>, or push to redeploy on Vercel.
            </li>
          </ol>

          <h2 id="troubleshooting">Troubleshooting</h2>
          <ul>
            <li>
              <strong>Can&apos;t sign in:</strong> the email must be in <code>ALLOWED_EMAILS</code> and the user must
              exist (and be confirmed) in Supabase.
            </li>
            <li>
              <strong>“There&apos;s no Botlog account for that Google account”:</strong> create the user first
              (Adding people), with the same email as their Google account.
            </li>
            <li>
              <strong>Google says “Access blocked” or the app is in testing:</strong> add their Google email as a test
              user under Google Auth Platform → Audience.
            </li>
            <li>
              <strong>Google sign-in ends on Supabase&apos;s page or the home page without signing in:</strong>{" "}
              <code>/auth/callback</code> on your address is missing from Supabase&apos;s Redirect URLs, or the
              Google client&apos;s redirect URI isn&apos;t your Supabase callback.
            </li>
            <li>
              <strong>Agents get errors on every request:</strong> the signing key isn&apos;t trusted yet. Check it was
              imported and rotated in (step 2.3) and that the env value is the same key, on one line.
            </li>
            <li>
              <strong>The board doesn&apos;t update live:</strong> the migrations weren&apos;t all applied (they turn
              on realtime). Run <code>supabase db push</code> again.
            </li>
            <li>
              <strong>“Too many requests” (429):</strong> raise the rate limits in the environment if your agents
              legitimately need more.
            </li>
          </ul>
        </article>
      </div>
    </main>
  );
}
