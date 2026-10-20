import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BotlogMark } from "@/components/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { googleSignInEnabled } from "@/lib/auth/google";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Botlog" };

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <BotlogMark className="mb-2 size-10" />
          <CardTitle className="font-display text-2xl font-bold tracking-[-0.02em]">Sign in to Botlog</CardTitle>
          <CardDescription>A kanban task manager where AI is a teammate.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* The form reads ?next and ?error, and GOOGLE_SIGN_IN, which are only known at request time. */}
          <Suspense>
            <SignInOptions />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

async function SignInOptions() {
  // Read the env at request time, so a Docker image honours GOOGLE_SIGN_IN set at run time.
  await connection();
  return <SignInForm google={googleSignInEnabled()} />;
}
