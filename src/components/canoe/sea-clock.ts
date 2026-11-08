/** One browser clock for every visible sea; no work is scheduled while hidden. */
const clients = new Set<(now: number) => void>();
let frame = 0;
let last = 0;
let slowUntil = 0;
function tick(now: number) {
  frame = 0;
  if (document.hidden || !clients.size) return;
  if (now - last >= (now < slowUntil ? 1000 / 30 : 0) - 0.5) {
    const start = performance.now();
    clients.forEach(render => render(now));
    if (performance.now() - start > 12 || (last && now - last > 40)) slowUntil = now + 2000;
    last = now;
  }
  frame = requestAnimationFrame(tick);
}
function wake() {
  if (!document.hidden && clients.size && !frame) frame = requestAnimationFrame(tick);
  if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; last = 0; }
}
export function subscribeSea(render: (now: number) => void) {
  if (!clients.size) document.addEventListener('visibilitychange', wake);
  clients.add(render);
  wake();
  return () => {
    clients.delete(render);
    if (!clients.size) {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      document.removeEventListener('visibilitychange', wake);
    }
  };
}