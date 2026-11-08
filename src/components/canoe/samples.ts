export type SampleDoc =
  | { id: string; kind: "quote"; title: string; issuer: string; items: { label: string; eur: number }[]; total: number; itemized?: boolean }
  | { id: string; kind: "police_report"; title: string; issuer: string; reference: string; date: string };

export const SAMPLES: SampleDoc[] = [
  {
    id: "quote-a", kind: "quote", title: "Repair quote", issuer: "Hollerbach Garage",
    items: [ { label: "Rear bumper, replace", eur: 620 }, { label: "Paint & blend", eur: 380 }, { label: "Labour, 2.5 h", eur: 240 } ],
    total: 1240,
  },
  {
    id: "quote-b", kind: "quote", title: "Repair quote", issuer: "Voltwerk EV Service",
    items: [ { label: "Front left wing", eur: 690 }, { label: "High-voltage check", eur: 410 }, { label: "Paint", eur: 450 }, { label: "Labour, 3 h", eur: 300 } ],
    total: 1850,
  },
  { id: "quote-t", kind: "quote", title: "Repair estimate", issuer: "Autohaus Brandl", items: [], total: 980, itemized: false },
  { id: "report-c", kind: "police_report", title: "Incident report", issuer: "Police station Mitte", reference: "IR-2026-118204", date: "2 Nov 2026" },
];

export const sampleById = (id: string) => SAMPLES.find((s) => s.id === id);
export const eur = (n: number) => `€${n.toLocaleString("en-IE")}`;

/** Missing mode: show the case's stored total so the upload doesn't create a fake amount conflict. */
export function withTotal(doc: SampleDoc, total: number | undefined): SampleDoc {
  if (doc.kind !== "quote" || total == null || !(total > 0) || doc.total === total) return doc;
  if (!doc.items.length) return { ...doc, total };
  const items = doc.items.map((i) => ({ ...i, eur: Math.round((i.eur * total) / doc.total) }));
  const diff = total - items.reduce((a, i) => a + i.eur, 0);
  items[items.length - 1] = { ...items[items.length - 1]!, eur: items[items.length - 1]!.eur + diff };
  return { ...doc, items, total };
}
