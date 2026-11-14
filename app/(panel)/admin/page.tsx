import { catalogSlice, DEFAULT_CITY } from "../../../lib/catalog-query";
import { publicCatalog } from "../../../lib/public-data";
import AdminShell from "../../admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const slice = catalogSlice(await publicCatalog(), { path: "/admin", city: DEFAULT_CITY });
  return <AdminShell initialCatalog={slice} />;
}
