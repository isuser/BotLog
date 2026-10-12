import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Botlog" };

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Sign in to Botlog</CardTitle>
          <CardDescription>A kanban task manager where AI is a teammate.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* The form reads ?next and ?error, which are only known at request time. */}
          <Suspense>
            <SignInForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
