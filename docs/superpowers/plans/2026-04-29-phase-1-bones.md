# Phase 1 — Bones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the new `finance-v2` Next.js app with Supabase auth, an empty protected dashboard, tests, and a deployed Vercel preview — so Sean can log in and see "hello world."

**Architecture:** Next.js 16 App Router + TypeScript strict + Tailwind + shadcn/ui. Supabase auth via `@supabase/ssr` (browser, server, middleware clients). Auth-protected dashboard route. Vitest for unit tests, Playwright for one E2E smoke. Deployed to Vercel under a new project.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, `@supabase/supabase-js`, `@supabase/ssr`, Vitest, React Testing Library, Playwright, Vercel.

**Spec reference:** `/home/seanm/Projects/finance/docs/superpowers/specs/2026-04-29-finance-app-rebuild-design.md` § 11 Phase 1.

---

## Pre-flight context

**Working directory for this phase:** `/home/seanm/Projects/finance-v2/` (does not exist yet — Task 1 creates it).

**Existing Supabase project (kept):** `caahbpkqfgwkdyobfbpe.supabase.co` — same project as v1.0. Sean & Jenny already have user accounts. We're reusing auth; schema work happens in Phase 2.

**Existing Vercel account:** Sean is logged in via Vercel CLI. New project will be created during Task 10.

**This phase ships when:** Sean and Jenny can navigate to the deployed URL, log in with their existing email/password, see a placeholder dashboard, log out, and the entire flow has automated tests proving it works.

**This phase deliberately does NOT include:** any v2 schema, any business logic, any styling polish beyond shadcn defaults, any AI features, any service-account UI. Just the bones.

---

## File Structure

```
finance-v2/
├── .env.local                          # Supabase URL + anon key (gitignored)
├── .env.example                        # Template, committed
├── .gitignore
├── README.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── vitest.config.ts
├── playwright.config.ts
├── components.json                     # shadcn config
├── middleware.ts                       # Auth protection at edge
├── app/
│   ├── layout.tsx                      # Root layout
│   ├── page.tsx                        # Marketing/redirect page
│   ├── globals.css                     # Tailwind imports
│   ├── login/
│   │   └── page.tsx                    # Login form
│   ├── dashboard/
│   │   └── page.tsx                    # Protected empty dashboard
│   └── auth/
│       ├── callback/route.ts           # Supabase auth callback
│       └── logout/route.ts             # POST → sign out → redirect
├── lib/
│   └── supabase/
│       ├── client.ts                   # Browser client
│       ├── server.ts                   # Server Component client
│       └── middleware.ts               # Edge middleware client
├── components/
│   └── ui/
│       ├── button.tsx                  # shadcn
│       └── card.tsx                    # shadcn
├── tests/
│   ├── unit/
│   │   └── supabase-client.test.ts     # Smoke test for client utility
│   └── e2e/
│       └── login.spec.ts               # Playwright login flow smoke
└── docs/
    └── PHASE-1-COMPLETE.md             # Marker doc written at the end
```

**Why this structure:**
- `app/` follows Next.js 16 App Router conventions (must be at root).
- `lib/supabase/` isolates Supabase plumbing — Phase 2+ will add `lib/db/` for schema queries, keeping concerns split.
- `components/ui/` is shadcn's default location.
- `tests/` is split into `unit/` (Vitest) and `e2e/` (Playwright) so each runner targets its own folder.
- Files are small and single-purpose; Phase 1 has no file > 100 lines except generated config.

---

## Task 1: Create the project directory and initialise Next.js 16

**Files:**
- Create: `/home/seanm/Projects/finance-v2/` (entire directory tree from `create-next-app`)
- Create: `/home/seanm/Projects/finance-v2/.gitignore` (auto-created by Next.js, verify)
- Create: `/home/seanm/Projects/finance-v2/.git/` (Next.js initialises git automatically)

- [ ] **Step 1: Verify the parent directory exists and target does not**

Run:
```bash
ls /home/seanm/Projects/ | grep -E "^finance"
```
Expected: shows `finance` (the legacy project). Does NOT show `finance-v2`. If `finance-v2` exists, stop and check with Sean before proceeding.

- [ ] **Step 2: Run the Next.js scaffold**

Run:
```bash
cd /home/seanm/Projects && npx create-next-app@latest finance-v2 \
  --typescript \
  --tailwind \
  --app \
  --src-dir=false \
  --import-alias='@/*' \
  --turbopack \
  --use-npm \
  --no-eslint \
  --yes
```
Expected: `Success! Created finance-v2 at /home/seanm/Projects/finance-v2`. Takes ~30–60 seconds. Initialises git automatically.

- [ ] **Step 3: Verify the scaffold**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && ls -la && cat package.json | grep '"next"'
```
Expected: directory contains `app/`, `package.json`, `tsconfig.json`, `tailwind.config.ts`, `.gitignore`, `.git/`. The `next` dependency line shows `^16.` or `16.x.x`.

- [ ] **Step 4: Verify the dev server starts**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && timeout 15 npm run dev
```
Expected: prints `▲ Next.js 16.x.x` and `- Local: http://localhost:3000` within ~5 seconds. The `timeout 15` kills it after 15 seconds — that's fine, we just want to confirm boot.

- [ ] **Step 5: Initial commit**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git add -A && git commit -m "chore: initial Next.js 16 scaffold"
```
Expected: commit succeeds. Verify with `git log --oneline` showing one commit.

---

## Task 2: Configure TypeScript strict mode and add a `README.md`

**Files:**
- Modify: `/home/seanm/Projects/finance-v2/tsconfig.json`
- Create: `/home/seanm/Projects/finance-v2/README.md`

- [ ] **Step 1: Open `tsconfig.json` and tighten strict settings**

Replace `tsconfig.json` with:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Verify TypeScript still compiles**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && npx tsc --noEmit
```
Expected: no output (success). If errors appear about unused locals in scaffolded files (`page.tsx`), delete or use the unused symbols and re-run until clean.

- [ ] **Step 3: Create README**

Create `/home/seanm/Projects/finance-v2/README.md`:
```markdown
# Finance v2

Personal finance PWA for Sean & Jenny. Health-monitor first, autopilot foundation.

See [the design spec](../finance/docs/superpowers/specs/2026-04-29-finance-app-rebuild-design.md) for the full vision.

## Local dev

```
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open http://localhost:3000.

## Tests

- `npm test` — Vitest unit tests
- `npm run test:e2e` — Playwright E2E

## Deploy

Pushes to `main` auto-deploy via Vercel.
```

- [ ] **Step 4: Commit**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git add tsconfig.json README.md && git commit -m "chore: tighten TS strict, add README"
```

---

## Task 3: Install and configure shadcn/ui with Button + Card

**Files:**
- Create: `/home/seanm/Projects/finance-v2/components.json` (shadcn config)
- Create: `/home/seanm/Projects/finance-v2/components/ui/button.tsx`
- Create: `/home/seanm/Projects/finance-v2/components/ui/card.tsx`
- Create: `/home/seanm/Projects/finance-v2/lib/utils.ts` (shadcn helper)
- Modify: `/home/seanm/Projects/finance-v2/app/globals.css`

- [ ] **Step 1: Run the shadcn init**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && npx shadcn@latest init -d
```
Expected: creates `components.json`, `lib/utils.ts`, updates `app/globals.css` with CSS variables, adds dependencies (`clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`).

- [ ] **Step 2: Add Button and Card components**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && npx shadcn@latest add button card
```
Expected: creates `components/ui/button.tsx` and `components/ui/card.tsx`.

- [ ] **Step 3: Verify components import**

Create `/home/seanm/Projects/finance-v2/app/page.tsx`:
```tsx
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>Finance v2</CardTitle>
        </CardHeader>
        <CardContent>
          <Button>Hello</Button>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Verify the dev server renders the components**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && timeout 10 npm run dev
```
In another terminal: `curl -s http://localhost:3000 | grep -o "Finance v2"`
Expected: prints `Finance v2`.

- [ ] **Step 5: Commit**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git add -A && git commit -m "feat: add shadcn/ui with button + card"
```

---

## Task 4: Wire up Supabase clients (browser, server, middleware)

**Files:**
- Create: `/home/seanm/Projects/finance-v2/.env.example`
- Create: `/home/seanm/Projects/finance-v2/.env.local` (gitignored)
- Create: `/home/seanm/Projects/finance-v2/lib/supabase/client.ts`
- Create: `/home/seanm/Projects/finance-v2/lib/supabase/server.ts`
- Create: `/home/seanm/Projects/finance-v2/lib/supabase/middleware.ts`

- [ ] **Step 1: Install Supabase packages**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && npm install @supabase/supabase-js @supabase/ssr
```
Expected: both packages added to `package.json`.

- [ ] **Step 2: Create `.env.example`**

Create `/home/seanm/Projects/finance-v2/.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 3: Create `.env.local` with the existing project's values**

The existing v1 Supabase project URL is `https://caahbpkqfgwkdyobfbpe.supabase.co`. The anon key is in the v1 app — Sean needs to fetch it from the Supabase dashboard (Settings → API → `anon` `public` key). Ask Sean to paste the anon key, then create:

```
NEXT_PUBLIC_SUPABASE_URL=https://caahbpkqfgwkdyobfbpe.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste from Sean>
```

If Sean is unavailable, pause this task and ask. Do NOT commit `.env.local`.

- [ ] **Step 4: Verify `.env.local` is gitignored**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git check-ignore .env.local
```
Expected: prints `.env.local` (confirming it's ignored).

- [ ] **Step 5: Create the browser client**

Create `/home/seanm/Projects/finance-v2/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 6: Create the server client**

Create `/home/seanm/Projects/finance-v2/lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — cookies can't be set here.
            // Middleware handles cookie refresh on every request.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 7: Create the middleware client**

Create `/home/seanm/Projects/finance-v2/lib/supabase/middleware.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = request.nextUrl.pathname.startsWith("/dashboard");
  const isLogin = request.nextUrl.pathname.startsWith("/login");

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isLogin && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 8: Commit**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git add .env.example lib/supabase/ package.json package-lock.json && git commit -m "feat: wire Supabase browser/server/middleware clients"
```

---

## Task 5: Add the auth middleware at the project root

**Files:**
- Create: `/home/seanm/Projects/finance-v2/middleware.ts`

- [ ] **Step 1: Create the root middleware**

Create `/home/seanm/Projects/finance-v2/middleware.ts`:
```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify dev server still boots**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && timeout 10 npm run dev
```
Expected: server starts. No middleware errors in the output.

- [ ] **Step 4: Commit**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git add middleware.ts && git commit -m "feat: enable auth middleware on protected routes"
```

---

## Task 6: Build the login page

**Files:**
- Create: `/home/seanm/Projects/finance-v2/app/login/page.tsx`

- [ ] **Step 1: Create the login page**

Create `/home/seanm/Projects/finance-v2/app/login/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Finance v2</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-md border px-3 py-2"
              data-testid="email-input"
            />
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="rounded-md border px-3 py-2"
              data-testid="password-input"
            />
            {error && (
              <p className="text-sm text-red-600" data-testid="login-error">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting} data-testid="login-submit">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && timeout 10 npm run dev
```
In another terminal: `curl -s http://localhost:3000/login | grep -o "Sign in to Finance v2"`
Expected: prints `Sign in to Finance v2`.

- [ ] **Step 3: Commit**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git add app/login/page.tsx && git commit -m "feat: add login page with Supabase auth"
```

---

## Task 7: Build the empty dashboard page (server-rendered, auth-required)

**Files:**
- Create: `/home/seanm/Projects/finance-v2/app/dashboard/page.tsx`

- [ ] **Step 1: Create the dashboard page**

Create `/home/seanm/Projects/finance-v2/app/dashboard/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md" data-testid="dashboard-card">
        <CardHeader>
          <CardTitle>Welcome to Finance v2</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p data-testid="user-email">Signed in as {user.email}</p>
          <p className="text-sm text-muted-foreground">
            Bones phase complete. The real dashboard arrives in Phase 4.
          </p>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className="text-sm underline"
              data-testid="logout-button"
            >
              Sign out
            </button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git add app/dashboard/page.tsx && git commit -m "feat: add protected empty dashboard page"
```

---

## Task 8: Add the logout route

**Files:**
- Create: `/home/seanm/Projects/finance-v2/app/auth/logout/route.ts`

- [ ] **Step 1: Create the logout handler**

Create `/home/seanm/Projects/finance-v2/app/auth/logout/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
```

- [ ] **Step 2: Verify TypeScript**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git add app/auth/logout/route.ts && git commit -m "feat: add logout route"
```

---

## Task 9: Replace the home page with a redirect

**Files:**
- Modify: `/home/seanm/Projects/finance-v2/app/page.tsx`

- [ ] **Step 1: Replace home page with auth-aware redirect**

Replace `/home/seanm/Projects/finance-v2/app/page.tsx` with:
```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/dashboard" : "/login");
}
```

- [ ] **Step 2: Manual smoke check**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && timeout 10 npm run dev
```
In another terminal:
```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/
```
Expected: a 307 or 308 redirect to either `/login` or `/dashboard` (depending on session cookie state — for an unauthenticated curl, expect `/login`).

- [ ] **Step 3: Commit**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git add app/page.tsx && git commit -m "feat: home page redirects based on auth state"
```

---

## Task 10: Set up Vitest and write a unit test for the Supabase client utility

**Files:**
- Create: `/home/seanm/Projects/finance-v2/vitest.config.ts`
- Create: `/home/seanm/Projects/finance-v2/tests/unit/supabase-client.test.ts`
- Modify: `/home/seanm/Projects/finance-v2/package.json` (add `test` script)

- [ ] **Step 1: Install Vitest and supporting packages**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```
Expected: dev dependencies added to `package.json`.

- [ ] **Step 2: Create `vitest.config.ts`**

Create `/home/seanm/Projects/finance-v2/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 3: Add the test script to `package.json`**

Open `/home/seanm/Projects/finance-v2/package.json` and add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```
Make sure JSON commas remain valid.

- [ ] **Step 4: Write the failing test**

Create `/home/seanm/Projects/finance-v2/tests/unit/supabase-client.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("createClient (browser)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  });

  it("returns a client object with auth.signInWithPassword", async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const client = createClient();
    expect(client).toBeDefined();
    expect(typeof client.auth.signInWithPassword).toBe("function");
  });
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && npm test
```
Expected: `1 passed`. If the test fails because of an env-stub timing issue, switch to setting `process.env` directly at the top of the file before any import, then re-run.

- [ ] **Step 6: Commit**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git add vitest.config.ts tests/unit/ package.json package-lock.json && git commit -m "test: vitest setup + Supabase client smoke test"
```

---

## Task 11: Set up Playwright and write the login E2E smoke test

**Files:**
- Create: `/home/seanm/Projects/finance-v2/playwright.config.ts`
- Create: `/home/seanm/Projects/finance-v2/tests/e2e/login.spec.ts`
- Modify: `/home/seanm/Projects/finance-v2/package.json` (add `test:e2e` script)

- [ ] **Step 1: Install Playwright**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && npm install -D @playwright/test && npx playwright install chromium
```
Expected: Chromium downloaded, package installed.

- [ ] **Step 2: Create `playwright.config.ts`**

Create `/home/seanm/Projects/finance-v2/playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [ ] **Step 3: Add the E2E script**

Add to `/home/seanm/Projects/finance-v2/package.json` `"scripts"`:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Write the login flow E2E**

Create `/home/seanm/Projects/finance-v2/tests/e2e/login.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? "";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? "";

test.skip(!TEST_EMAIL || !TEST_PASSWORD, "TEST_USER_EMAIL/PASSWORD not set");

test("unauthenticated user is redirected to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId("email-input")).toBeVisible();
});

test("login with valid credentials lands on /dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("email-input").fill(TEST_EMAIL);
  await page.getByTestId("password-input").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("dashboard-card")).toBeVisible();
  await expect(page.getByTestId("user-email")).toContainText(TEST_EMAIL);
});

test("logout returns user to /login", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("email-input").fill(TEST_EMAIL);
  await page.getByTestId("password-input").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByTestId("logout-button").click();
  await expect(page).toHaveURL(/\/login$/);
});
```

- [ ] **Step 5: Run E2E (will skip until credentials are provided)**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && npm run test:e2e
```
Expected without env: `3 skipped`. That's fine — no test user provisioned yet.

- [ ] **Step 6: Provision a real test run (Sean executes)**

Tell Sean: "Run the full E2E once with your real Supabase credentials to confirm login works end-to-end:"
```bash
cd /home/seanm/Projects/finance-v2 && \
  TEST_USER_EMAIL="<your email>" TEST_USER_PASSWORD="<your password>" \
  npm run test:e2e
```
Expected: `3 passed`. If it fails, debug before continuing.

- [ ] **Step 7: Commit**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git add playwright.config.ts tests/e2e/ package.json package-lock.json && git commit -m "test: add Playwright E2E for login flow"
```

---

## Task 12: Add `.env.local` template safety + gitignore audit

**Files:**
- Verify: `/home/seanm/Projects/finance-v2/.gitignore`

- [ ] **Step 1: Confirm `.env.local` is ignored and not staged**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git ls-files | grep -E "\.env\.local$"
```
Expected: empty output (file is NOT tracked). If anything is returned, stop and run `git rm --cached .env.local` then commit.

- [ ] **Step 2: Confirm `.gitignore` includes the standard entries**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && grep -E "^\.env\*?\.local$|^\.env\.local$|^\.env\*$|node_modules" .gitignore
```
Expected: at least `node_modules` and `.env*.local` (or `.env.local`) appear. Next.js's scaffold includes these by default, but verify.

---

## Task 13: Deploy to Vercel under a new project

**Files:**
- Create: `/home/seanm/Projects/finance-v2/.vercel/project.json` (created by `vercel link`)

- [ ] **Step 1: Sean runs the link + first deploy**

Tell Sean to run (he's logged into Vercel CLI already; this command is interactive):
```bash
cd /home/seanm/Projects/finance-v2 && vercel
```
Answer the prompts:
- Set up and deploy? **Yes**
- Which scope? **<Sean's personal account>**
- Link to existing project? **No**
- Project name? **finance-v2**
- Directory? **./** (default)
- Override settings? **No**

Expected: prints `🔗 Linked to <scope>/finance-v2` and a preview deploy URL.

- [ ] **Step 2: Add the Supabase env vars to Vercel**

Sean runs:
```bash
cd /home/seanm/Projects/finance-v2 && \
  vercel env add NEXT_PUBLIC_SUPABASE_URL production && \
  vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
```
He'll be prompted to paste each value. Repeat for `preview` and `development` environments if desired (use `--target preview` etc. or run again with the different target).

Alternatively (one-shot):
```bash
echo "https://caahbpkqfgwkdyobfbpe.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL production preview development
echo "<paste anon key>" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production preview development
```

- [ ] **Step 3: Promote to production**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && vercel --prod
```
Expected: prints production URL like `https://finance-v2.vercel.app` (or with Sean's username/scope) and the build succeeds.

- [ ] **Step 4: Smoke-test the deployed site**

Sean opens the production URL in a browser. Verify:
- Hitting `/` redirects to `/login`.
- Login form renders.
- Logging in with his Supabase account redirects to `/dashboard`.
- Dashboard shows his email and a "Sign out" link.
- "Sign out" returns to `/login`.

If any step fails, debug locally first; production likely has the same bug. Common issues: env vars missing on Vercel (re-check `vercel env ls`), redirect URLs misconfigured in Supabase Auth settings (Supabase Dashboard → Authentication → URL Configuration → add the production URL to allowed redirect URLs).

- [ ] **Step 5: Commit `.vercel/project.json`**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git add .vercel/project.json && git commit -m "chore: link Vercel project finance-v2"
```

Note: `.vercel/project.json` only contains the org and project ID, not secrets — safe to commit.

---

## Task 14: Mark Phase 1 complete

**Files:**
- Create: `/home/seanm/Projects/finance-v2/docs/PHASE-1-COMPLETE.md`

- [ ] **Step 1: Write the completion marker**

Create `/home/seanm/Projects/finance-v2/docs/PHASE-1-COMPLETE.md`:
```markdown
# Phase 1 — Bones — Complete

**Date completed:** <fill in YYYY-MM-DD when this is committed>

## What ships
- Next.js 16 + TypeScript strict + Tailwind + shadcn/ui scaffold
- Supabase auth wired (browser + server + middleware clients)
- `/login` page with email/password sign-in
- `/dashboard` page protected by middleware
- `/auth/logout` POST route
- Vitest unit test for the Supabase client utility
- Playwright E2E for the full login → dashboard → logout flow
- Deployed to Vercel at: <production URL>

## What's deferred
- v2 schema (Phase 2)
- Akahu bank feeds (Phase 3)
- Health score, dashboard widgets (Phase 4)
- All other features per the design spec

## Verified by Sean
- [ ] Sean can log in at the production URL
- [ ] Jenny can log in at the production URL
- [ ] Logout works
- [ ] Tests pass: `npm test && TEST_USER_EMAIL=… TEST_USER_PASSWORD=… npm run test:e2e`
```

- [ ] **Step 2: Commit**

Run:
```bash
cd /home/seanm/Projects/finance-v2 && git add docs/PHASE-1-COMPLETE.md && git commit -m "docs: mark Phase 1 (Bones) complete"
```

- [ ] **Step 3: Push to origin (after Sean creates the GitHub remote)**

Sean creates a new GitHub repo named `finance-v2`. Then:
```bash
cd /home/seanm/Projects/finance-v2 && \
  git remote add origin git@github.com:seanmason-code/finance-v2.git && \
  git push -u origin main
```

If Sean has already linked Vercel to this repo via the Git integration during Task 13, pushing to `main` will auto-deploy production.

---

## Self-review of this plan

**Spec coverage check (against §11 Phase 1):**
- "New project scaffolded" — Tasks 1, 2, 3
- "Next.js + Supabase + auth working" — Tasks 4, 5, 6
- "Empty schema" — n/a Phase 1; deferred to Phase 2 (the spec says empty)
- "Login → empty dashboard" — Tasks 6, 7, 9
- "Sean can log in. Nothing else." — Verified in Tasks 11 & 13
✓ Coverage complete.

**Placeholder scan:** No TBDs, no "implement later," all code blocks present, all commands have expected output. ✓

**Type / name consistency:** `createClient` is the exported function from all three Supabase utility files (browser, server, middleware) — same name, different return types based on context. This is intentional and matches the official Supabase SSR pattern. Test file imports from `@/lib/supabase/client` (the browser version). ✓

**Scope check:** Plan is scoped to scaffolding only. No business logic, no schema, no styling beyond shadcn defaults. ✓

---

## Done definition for Phase 1

Phase 1 is complete when ALL of the following are true:

1. The new repo `~/Projects/finance-v2/` exists and is committed.
2. `npm run dev` starts the app on `localhost:3000` with no errors.
3. `npm test` passes (Vitest).
4. `TEST_USER_EMAIL=… TEST_USER_PASSWORD=… npm run test:e2e` passes (Playwright, 3 tests).
5. The production Vercel URL is live and Sean has logged in successfully.
6. Jenny has logged in successfully.
7. `docs/PHASE-1-COMPLETE.md` is committed and the verified checkboxes are ticked.

Phase 2 begins **only after** all 7 are true.
