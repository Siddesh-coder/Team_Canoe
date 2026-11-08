import { createContext } from "react";
import type { SiteToolsContextValue } from "./SiteTools";

export const SiteToolsContext = createContext<SiteToolsContextValue | null>(null);