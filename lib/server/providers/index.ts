import type { ArabicProvider } from "../arabicUnified";
import { arabseed } from "./arabseed";
import { faselhd } from "./faselhd";
import { topcinema } from "./topcinema";
import { wecima } from "./wecima";

export const PROVIDERS: Record<string, ArabicProvider> = {
  arabseed,
  faselhd,
  topcinema,
  wecima,
};

export function enabledProviders(): ArabicProvider[] {
  return Object.values(PROVIDERS).filter((p) => p.enabled());
}

export { arabseed, faselhd, topcinema, wecima };
