"use client";

import {
  ArrowLeftRight, ArrowRight, Building2, Check, FileSpreadsheet,
  Loader2, Package, PartyPopper, SkipForward, Upload, Warehouse,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  completeOnboarding, onboardingCompany, onboardingFirstItem,
  onboardingImportCsv, onboardingWarehouse,
} from "@/actions/onboarding";
import { Button, ErrorText, Field, cls, inputCls } from "@/components/ui";

const CURRENCIES = [
  { code: "USD", symbol: "$" }, { code: "EUR", symbol: "€" }, { code: "GBP", symbol: "£" },
  { code: "INR", symbol: "₹" }, { code: "JPY", symbol: "¥" }, { code: "AUD", symbol: "A$" },
];
const BUSINESS_TYPES = ["Retail", "Wholesale / distribution", "E-commerce", "Manufacturing", "Services", "Other"];

const STEPS = ["Company", "Warehouse", "Items", "Done"] as const;

export default function OnboardingWizard({
  userName, org, hasWarehouse, hasProducts,
}: {
  userName: string;
  org: { name: string; businessType: string; currency: string; currencySymbol: string; timezone: string };
  hasWarehouse: boolean;
  hasProducts: boolean;
}) {
  // skip the warehouse step if one already exists
  const [step, setStep] = useState(0);
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-violet-50 p-4">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
            <ArrowLeftRight size={20} />
          </div>
          <span className="text-xl font-bold tracking-tight">Acme Inventory</span>
        </div>

        {/* progress indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={cls(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors",
                i < step ? "bg-emerald-500 text-white" : i === step ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-500"
              )}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span className={cls("hidden text-xs font-medium sm:block", i === step ? "text-gray-800" : "text-gray-400")}>{label}</span>
              {i < STEPS.length - 1 && <div className={cls("h-px w-6", i < step ? "bg-emerald-400" : "bg-gray-200")} />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-gray-900/5 animate-slide-up" key={step}>
          {step === 0 && <CompanyStep userName={userName} org={org} onDone={next} />}
          {step === 1 && <WarehouseStep alreadyHas={hasWarehouse} onDone={next} />}
          {step === 2 && <ItemsStep alreadyHas={hasProducts} onDone={next} />}
          {step === 3 && <FinishStep />}
        </div>
      </div>
    </div>
  );
}

function CompanyStep({
  userName, org, onDone,
}: {
  userName: string;
  org: { name: string; businessType: string; currency: string; currencySymbol: string; timezone: string };
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(onboardingCompany, undefined);
  useEffect(() => { if (state?.success) onDone(); }, [state, onDone]);

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Building2 size={19} /></div>
        <div>
          <h1 className="text-lg font-semibold">Welcome, {userName.split(" ")[0]} 👋</h1>
          <p className="text-sm text-gray-500">Tell us about your company</p>
        </div>
      </div>
      <form action={action} className="space-y-4">
        <Field label="Company name">
          <input name="name" required defaultValue={org.name} placeholder="Acme Supply Co." className={inputCls} />
        </Field>
        <Field label="Business type">
          <select name="businessType" defaultValue={org.businessType} className={inputCls}>
            <option value="">Choose…</option>
            {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Currency">
            <select name="currency" defaultValue={org.currency} className={inputCls}
              onChange={(e) => {
                const c = CURRENCIES.find((x) => x.code === e.target.value);
                const el = document.querySelector<HTMLInputElement>("input[name=currencySymbol]");
                if (c && el) el.value = c.symbol;
              }}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </Field>
          <Field label="Symbol">
            <input name="currencySymbol" required defaultValue={org.currencySymbol} className={inputCls} />
          </Field>
          <Field label="Timezone">
            <input name="timezone" required defaultValue={org.timezone} className={inputCls} />
          </Field>
        </div>
        <ErrorText>{state?.error}</ErrorText>
        <Button type="submit" disabled={pending} className="w-full">
          {pending && <Loader2 size={15} className="animate-spin" />} Continue <ArrowRight size={15} />
        </Button>
      </form>
    </>
  );
}

function WarehouseStep({ alreadyHas, onDone }: { alreadyHas: boolean; onDone: () => void }) {
  const [state, action, pending] = useActionState(onboardingWarehouse, undefined);
  useEffect(() => { if (state?.success) onDone(); }, [state, onDone]);

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Warehouse size={19} /></div>
        <div>
          <h1 className="text-lg font-semibold">Your first warehouse</h1>
          <p className="text-sm text-gray-500">Where will your stock live?</p>
        </div>
      </div>
      {alreadyHas && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          You already have at least one warehouse — you can skip this step or add another.
        </p>
      )}
      <form action={action} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Code">
            <input name="code" required placeholder="MAIN" className={inputCls} />
          </Field>
          <Field label="Name" className="col-span-2">
            <input name="name" required placeholder="Main Warehouse" className={inputCls} />
          </Field>
        </div>
        <Field label="Address (optional)">
          <input name="address" placeholder="500 Harbor Blvd, Oakland, CA" className={inputCls} />
        </Field>
        <ErrorText>{state?.error}</ErrorText>
        <div className="flex gap-2">
          {alreadyHas && (
            <Button type="button" variant="secondary" onClick={onDone} className="flex-1">
              <SkipForward size={14} /> Skip
            </Button>
          )}
          <Button type="submit" disabled={pending} className="flex-1">
            {pending && <Loader2 size={15} className="animate-spin" />} Add warehouse <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </>
  );
}

function ItemsStep({ alreadyHas, onDone }: { alreadyHas: boolean; onDone: () => void }) {
  const [mode, setMode] = useState<"pick" | "manual" | "csv">("pick");
  const [state, action, pending] = useActionState(onboardingFirstItem, undefined);
  const [csvResult, setCsvResult] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [importing, startImport] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state?.success) onDone(); }, [state, onDone]);

  const handleCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      startImport(async () => {
        setCsvError(null);
        const res = await onboardingImportCsv(String(reader.result ?? ""));
        if (res.error) setCsvError(res.error);
        else { setCsvResult(`Imported ${res.imported} item(s).`); setTimeout(onDone, 1200); }
      });
    };
    reader.readAsText(file);
  };

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Package size={19} /></div>
        <div>
          <h1 className="text-lg font-semibold">Add your items</h1>
          <p className="text-sm text-gray-500">Start with one item, import a CSV, or skip for now</p>
        </div>
      </div>

      {alreadyHas && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Your catalog already has items (demo data is loaded) — feel free to skip.
        </p>
      )}

      {mode === "pick" && (
        <div className="space-y-2">
          <button onClick={() => setMode("manual")}
            className="flex w-full items-center gap-3 rounded-xl p-4 text-left ring-1 ring-gray-200 hover:bg-gray-50 hover:ring-brand-300 cursor-pointer">
            <Package size={20} className="text-brand-600" />
            <span>
              <span className="block text-sm font-semibold">Add an item manually</span>
              <span className="block text-xs text-gray-500">Name, SKU, price and opening stock</span>
            </span>
          </button>
          <button onClick={() => setMode("csv")}
            className="flex w-full items-center gap-3 rounded-xl p-4 text-left ring-1 ring-gray-200 hover:bg-gray-50 hover:ring-brand-300 cursor-pointer">
            <FileSpreadsheet size={20} className="text-emerald-600" />
            <span>
              <span className="block text-sm font-semibold">Import from CSV / Excel</span>
              <span className="block text-xs text-gray-500">Header: name, sku, category, costPrice, sellingPrice, openingStock</span>
            </span>
          </button>
          <button onClick={onDone}
            className="flex w-full items-center gap-3 rounded-xl p-4 text-left ring-1 ring-gray-200 hover:bg-gray-50 cursor-pointer">
            <SkipForward size={20} className="text-gray-400" />
            <span>
              <span className="block text-sm font-semibold">Skip for now</span>
              <span className="block text-xs text-gray-500">You can add items any time from the Items page</span>
            </span>
          </button>
        </div>
      )}

      {mode === "manual" && (
        <form action={action} className="space-y-4">
          <Field label="Item name">
            <input name="name" required placeholder="Wireless Headphones" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU"><input name="sku" required placeholder="SKU-001" className={inputCls} /></Field>
            <Field label="Opening stock"><input name="openingStock" type="number" min="0" defaultValue={0} className={inputCls} /></Field>
            <Field label="Cost price"><input name="costPrice" type="number" step="0.01" min="0" defaultValue={0} className={inputCls} /></Field>
            <Field label="Selling price"><input name="sellingPrice" type="number" step="0.01" min="0" required className={inputCls} /></Field>
          </div>
          <ErrorText>{state?.error}</ErrorText>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode("pick")} className="flex-1">Back</Button>
            <Button type="submit" disabled={pending} className="flex-1">
              {pending && <Loader2 size={15} className="animate-spin" />} Add item <ArrowRight size={15} />
            </Button>
          </div>
        </form>
      )}

      {mode === "csv" && (
        <div className="space-y-4">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-8 text-center hover:border-brand-400 hover:bg-brand-50/30 cursor-pointer"
          >
            {importing ? <Loader2 size={24} className="animate-spin text-brand-600" /> : <Upload size={24} className="text-gray-400" />}
            <span className="text-sm font-medium text-gray-700">{importing ? "Importing…" : "Choose a .csv file"}</span>
            <span className="text-xs text-gray-400">name, sku, category, costPrice, sellingPrice, openingStock</span>
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])} />
          {csvResult && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{csvResult}</p>}
          <ErrorText>{csvError}</ErrorText>
          <Button type="button" variant="secondary" onClick={() => setMode("pick")} className="w-full">Back</Button>
        </div>
      )}
    </>
  );
}

function FinishStep() {
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-4 py-4 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <PartyPopper size={28} />
      </div>
      <h1 className="text-lg font-semibold">You’re all set!</h1>
      <p className="mx-auto max-w-sm text-sm text-gray-500">
        Your workspace is configured. Head to the dashboard to see stock levels, create orders and invite your team.
      </p>
      <Button
        disabled={pending}
        onClick={() => startTransition(async () => { await completeOnboarding(); })}
        className="w-full"
      >
        {pending && <Loader2 size={15} className="animate-spin" />} Go to dashboard <ArrowRight size={15} />
      </Button>
    </div>
  );
}
