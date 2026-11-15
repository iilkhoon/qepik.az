"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Info, X } from "lucide-react";
import type { CatalogSlice } from "../lib/catalog-query";
import { api, errorMessage } from "./ui";
import type { Act, Session } from "./types";
import Admin from "./admin";
import { SIGN_IN_PATH } from "./auth-headers";

// Standalone frame for /admin: it owns the session, toast and catalog refresh the panel needs.
export default function AdminShell({ initialCatalog }: { initialCatalog: CatalogSlice }) {
  const [c, setC] = useState(initialCatalog),
    [session, setSession] = useState<Session>({ user: null, admin: false, needsSetup: false }),
    [toast, setToast] = useState("");
  const refresh = async () => {
    try {
      const [s, next] = await Promise.all([
        api<Session>("session"),
        api<CatalogSlice>("catalog?path=/admin"),
      ]);
      setSession(s);
      setC(next);
    } catch (e) {
      setToast(errorMessage(e));
    }
  };
  useEffect(() => {
    api<Session>("session").then(setSession, (e) => setToast(errorMessage(e)));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const act: Act = async (fn, msg) => {
    try {
      await fn();
      if (msg) setToast(msg);
      return true;
    } catch (e) {
      setToast(errorMessage(e));
      return false;
    }
  };
  const needUser = () => {
    if (session.user) return true;
    window.location.assign(SIGN_IN_PATH + "?return_to=/admin");
    return false;
  };
  return (
    <div>
      <header className="header">
        <div className="shell header-main">
          <a className="logo" aria-label="Qəpik ana səhifə" href="/">
            <img className="brand-mark" src="/favicon.svg" alt="" width={42} height={42} />
            <img className="logo-word" src="/logo-word.svg" alt="qəpik" width={110} height={52} />
          </a>
          <a className="outline-button" href="/">
            <ArrowLeft size={16} /> Sayta qayıt
          </a>
        </div>
      </header>
      <main className="shell main-content" id="main-content">
        <Admin
          c={c}
          session={session}
          refresh={refresh}
          toast={setToast}
          act={act}
          needUser={needUser}
        />
      </main>
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          {toast}
          <button className="icon-button" aria-label="Bağla" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
