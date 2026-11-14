"use client";
import { createContext, useContext } from "react";
import type { Offer, Product } from "../../lib/catalog";
import type { CatalogSlice } from "../../lib/catalog-query";
import type { Act, Personal, Session } from "../types";

export type ModalState =
  | { type: "city" }
  | { type: "alert"; p: Product }
  | { type: "info"; topic: string }
  | null;

export type Filters = {
  brand: string;
  store: string;
  min: string;
  max: string;
  sort: string;
  real: boolean;
  stock: boolean;
};
export const emptyFilters: Filters = {
  brand: "",
  store: "",
  min: "",
  max: "",
  sort: "popular",
  real: false,
  stock: false,
};

export type Shop = {
  c: CatalogSlice;
  city: string;
  path: string;
  session: Session;
  personal: Personal;
  comp: string[];
  busy: boolean;
  act: Act;
  refresh: () => Promise<void>;
  nav: (to: string) => void;
  needUser: () => boolean;
  favorite: (p: Product) => void;
  compare: (p: Product) => void;
  alert: (p: Product) => void;
  setToast: (message: string) => void;
  openModal: (modal: ModalState) => void;
  isFavorite: (id: string) => boolean;
};

export const ShopContext = createContext<Shop | null>(null);
export function useShop() {
  const shop = useContext(ShopContext);
  if (!shop) throw new Error("ShopContext is missing");
  return shop;
}

// Smallest monthly instalment any store lists for the offers given.
export function cheapestCredit(offers: Offer[]) {
  return offers
    .flatMap((o) =>
      o.installmentOptions?.length
        ? o.installmentOptions.map((x) => ({
            months: x.months,
            monthly: x.monthly || x.total / x.months,
          }))
        : o.months > 0 && o.installmentTotal > 0
          ? [{ months: o.months, monthly: o.installmentTotal / o.months }]
          : [],
    )
    .filter((x) => x.months > 0 && x.monthly > 0)
    .sort((a, b) => a.monthly - b.monthly)[0];
}

// "3 dəq əvvəl", "2 saat əvvəl", "dünən"; older checks show the date instead.
export function agoText(iso: string, now: number) {
  const diff = now - Date.parse(iso);
  if (!Number.isFinite(diff)) return "";
  const min = Math.max(1, Math.round(diff / 60000));
  if (min < 60) return min + " dəq əvvəl";
  const hours = Math.round(min / 60);
  if (hours < 24) return hours + " saat əvvəl";
  const days = Math.round(hours / 24);
  if (days === 1) return "dünən";
  if (days < 30) return days + " gün əvvəl";
  return "";
}
