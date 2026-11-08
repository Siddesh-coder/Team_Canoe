import { useEffect, useState } from "react";
import { DAY } from "./reminders";
const KEY = "canoe-demo-time";
type Clock = { real: number; virtual: number };
function storedClock(): Clock | null { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } }
export function setDemoTime(enabled: boolean) {
  try { if (enabled) localStorage.setItem(KEY, JSON.stringify({ real: Date.now(), virtual: Date.now() })); else localStorage.removeItem(KEY); } catch { /* optional storage */ }
  window.dispatchEvent(new Event("canoe-clock"));
}
export function clockNow(c: Clock | null, realNow: number) { return c ? c.virtual + (realNow - c.real) * DAY / 10_000 : realNow; }
export function customerNow() { return clockNow(storedClock(), Date.now()); }
export function useCustomerClock() {
  const [now, setNow] = useState(Date.now());
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    const tick = () => { setNow(customerNow()); setDemo(!!storedClock()); };
    tick(); const timer = setInterval(tick, 1000); window.addEventListener("canoe-clock", tick); window.addEventListener("storage", tick);
    return () => { clearInterval(timer); window.removeEventListener("canoe-clock", tick); window.removeEventListener("storage", tick); };
  }, []);
  return { now, demo };
}