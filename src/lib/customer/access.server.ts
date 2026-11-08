import { getCookie, setCookie, getRequest } from "@tanstack/react-start/server";
export async function grantClaim(id: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id));
  const token = Array.from(new Uint8Array(signature), (n) => n.toString(16).padStart(2, "0")).join("");
  setCookie(`canoe-claim-${id}`, token, { httpOnly: true, sameSite: "lax", secure: getRequest().url.startsWith("https:"), path: "/", maxAge: 60 * 60 * 24 * 90 });
}
export async function hasClaimAccess(id: string, secret: string) {
  const token = getCookie(`canoe-claim-${id}`);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = new Uint8Array(token.match(/../g)?.map((s) => parseInt(s, 16)) ?? []);
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(id));
}