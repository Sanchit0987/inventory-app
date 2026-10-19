import { redirect } from "next/navigation";

// legacy route — products are now Items
export default function ProductsRedirect() {
  redirect("/items");
}
