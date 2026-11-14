// The admin panel keeps the earlier stylesheet set; the storefront uses app/v2.css only.
import "../../design.css";
import "../../pages.css";
import "../../responsive.css";
import "../../commerce.css";
import "../../home.css";
import "../../matching.css";
import "../../production.css";
import "../../theme.css";

export const metadata = { title: "Admin paneli | Qəpik", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
