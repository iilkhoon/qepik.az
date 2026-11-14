import { cookies } from "next/headers";
import { accountForToken, SESSION_COOKIE } from "../lib/accounts";

// The signed-in account, resolved from the session cookie against the site's own database.
export type User = {
  userId: string;
  displayName: string;
  email: string;
  phone?: string | null;
  city?: string | null;
};

export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const account = await accountForToken(token);
  if (!account) return null;
  return {
    userId: account.id,
    email: account.email,
    displayName: account.name,
    phone: account.phone,
    city: account.city,
  };
}
