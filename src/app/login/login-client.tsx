"use client";

import { ArrowLeftRight, Loader2, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { login, signup } from "@/actions/auth";
import { Button, ErrorText, Field, cls, inputCls } from "@/components/ui";

const demoAccounts = [
  { label: "Admin", email: "admin@acme.io", password: "admin1234" },
  { label: "Manager", email: "manager@acme.io", password: "manager1234" },
  { label: "Staff", email: "staff@acme.io", password: "staff1234" },
];

export default function LoginClient({ demoMode }: { demoMode: boolean }) {
  const [mode, setMode] = useState<"login" | "signup">("login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-violet-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
            <ArrowLeftRight size={20} />
          </div>
          <span className="text-xl font-bold tracking-tight">Acme Inventory</span>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-gray-900/5">
          {/* mode toggle */}
          <div className="mb-5 grid grid-cols-2 rounded-xl bg-gray-100 p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cls(
                  "rounded-lg py-1.5 text-sm font-medium transition-colors cursor-pointer",
                  mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {mode === "login" ? <LoginForm /> : <SignupForm onDone={() => setMode("login")} />}
        </div>

        {mode === "login" && demoMode && (
          <div className="mt-4 rounded-xl bg-white/60 p-4 text-center ring-1 ring-gray-900/5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Demo accounts</p>
            <div className="flex justify-center gap-2">
              {demoAccounts.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => {
                    const form = document.getElementById("login-form") as HTMLFormElement;
                    (form.elements.namedItem("email") as HTMLInputElement).value = a.email;
                    (form.elements.namedItem("password") as HTMLInputElement).value = a.password;
                    form.requestSubmit();
                  }}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 cursor-pointer"
                >
                  {a.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">One click signs you in with seeded credentials.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <>
      <h1 className="text-lg font-semibold">Welcome back</h1>
      <p className="mb-5 text-sm text-gray-500">Sign in to manage your inventory</p>
      <form action={action} className="space-y-4" id="login-form">
        <Field label="Email">
          <input name="email" type="email" required placeholder="you@company.com" className={inputCls} />
        </Field>
        <Field label="Password">
          <input name="password" type="password" required placeholder="••••••••" className={inputCls} />
        </Field>
        <ErrorText>{state?.error}</ErrorText>
        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2 size={15} className="animate-spin" />} Sign in
        </Button>
      </form>
    </>
  );
}

function SignupForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(signup, undefined);
  const [wantsAdmin, setWantsAdmin] = useState(false);

  // success message for a pending admin request
  if (state?.info) {
    return (
      <div className="space-y-4 py-2 text-center animate-slide-up">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
          <ShieldCheck size={24} />
        </div>
        <p className="text-sm font-semibold">Request submitted</p>
        <p className="text-sm text-gray-500">{state.info}</p>
        <Button variant="secondary" className="w-full" onClick={onDone}>Back to sign in</Button>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-lg font-semibold">Create your account</h1>
      <p className="mb-5 text-sm text-gray-500">Join the workspace in seconds</p>
      <form action={action} className="space-y-4">
        <Field label="Full name">
          <input name="name" required placeholder="Jordan Lee" className={inputCls} />
        </Field>
        <Field label="Email">
          <input name="email" type="email" required placeholder="you@company.com" className={inputCls} />
        </Field>
        <Field label="Password (min 8 characters)">
          <input name="password" type="password" required minLength={8} placeholder="••••••••" className={inputCls} />
        </Field>

        <input type="hidden" name="requestedRole" value={wantsAdmin ? "ADMIN" : "STAFF"} />
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-gray-50 p-3 ring-1 ring-inset ring-gray-200">
          <input
            type="checkbox"
            checked={wantsAdmin}
            onChange={(e) => setWantsAdmin(e.target.checked)}
            className="mt-0.5 accent-brand-600"
          />
          <span>
            <span className="block text-sm font-medium text-gray-800">Request admin access</span>
            <span className="block text-xs text-gray-500">
              An existing admin must approve your request before you can sign in. Without this, you join immediately as staff.
            </span>
          </span>
        </label>

        <ErrorText>{state?.error}</ErrorText>
        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2 size={15} className="animate-spin" />}
          {wantsAdmin ? "Submit admin request" : "Create account"}
        </Button>
      </form>
    </>
  );
}
