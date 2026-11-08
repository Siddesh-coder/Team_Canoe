export const DAY = 86_400_000;
export const SIMULATED = "Reminders are simulated in this prototype.";
export function getReminders(createdAt: string, now: number | Date = Date.now()) {
  const start = Date.parse(createdAt);
  const current = Number(now);
  const age = Math.max(0, current - start);
  const stage = age >= 10 * DAY ? 4 : age >= 7 * DAY ? 3 : age >= 3 * DAY ? 2 : 1;
  const sentAt = [0, 3, 7].filter((d) => age >= d * DAY).map((d) => new Date(start + d * DAY).toISOString());
  return { stage, sentAt, nextAt: stage === 4 ? null : new Date(start + (stage === 1 ? 3 : stage === 2 ? 7 : 10) * DAY).toISOString(), handoverAt: new Date(start + 10 * DAY).toISOString(), overdue: age >= 10 * DAY };
}