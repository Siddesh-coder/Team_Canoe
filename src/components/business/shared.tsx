import { Link } from '@tanstack/react-router';
import { Wordmark } from '@/components/canoe/brand';
import type { ReactNode } from 'react';
import { SessionHeader } from '@/components/demo-role/DemoSession';
export function BusinessShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen pb-32"><header className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-5 pt-5 md:px-8"><div className="flex flex-wrap items-center gap-4"><Wordmark /><nav className="flex flex-wrap gap-4 font-mono text-[11px] uppercase text-stone"><Link to="/review">Review</Link><Link to="/policy">Policy</Link><Link to="/business" className="text-ink">Business</Link></nav></div><SessionHeader /></header><main className="mx-auto max-w-[1280px] px-5 md:px-8">{children}</main></div>;
}
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-10 border-t border-stone/25 pt-6"><h2 className="font-display text-2xl">{title}</h2><div className="mt-4">{children}</div></section>;
}
export function Stat({ label, value, accent = false }: { label: string; value: ReactNode; accent?: boolean }) {
  return <div className="card-calm p-5"><p className="eyebrow">{label}</p><p className={`mt-2 font-display text-4xl ${accent ? 'text-cedar' : 'text-ink'}`}>{value}</p></div>;
}
export const percent = (n: number | null | undefined) => n == null ? '-' : `${(n * 100).toFixed(1)}%`;
export const money = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
export const when = (s: string | null) => s ? new Date(s).toLocaleString('en-GB') : '-';
export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
export function CaseLink({ id }: { id: string }) { return <Link className="font-mono text-xs text-cedar underline underline-offset-2" to="/review/$caseId" params={{ caseId: id }}>{id}</Link>; }