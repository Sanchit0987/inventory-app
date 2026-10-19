import { redirect } from "next/navigation";

// legacy route — invoices now live under Sales
export default function InvoicesRedirect() {
  redirect("/sales?tab=invoices");
}
