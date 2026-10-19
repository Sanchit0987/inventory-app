import { redirect } from "next/navigation";

// legacy route — warehouses now live under Inventory
export default function WarehousesRedirect() {
  redirect("/inventory?tab=warehouses");
}
