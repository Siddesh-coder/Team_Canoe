import { createContext } from "react";
import type { DemoRole, DemoSession } from "@/lib/demo-role/logic";

type SessionContextValue = {
  session: DemoSession | null;
  ready: boolean;
  signIn: (role: DemoRole, name?: string) => void;
  signOut: () => void;
};

export const DemoSessionContext = createContext<SessionContextValue | null>(null);