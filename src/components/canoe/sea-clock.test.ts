import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeSea } from './sea-clock';

const stops: (() => void)[] = [];
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.restoreAllMocks(); });
describe('Shared sea clock', () => {
  it('uses one animation request for two visible instances', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    stops.push(subscribeSea(vi.fn()), subscribeSea(vi.fn()));
    expect(raf).toHaveBeenCalledTimes(1);
  });
  it('does not start a loop while the tab is hidden', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    stops.push(subscribeSea(vi.fn()));
    expect(raf).not.toHaveBeenCalled();
  });
  it('cancels the loop when the last visible scene leaves', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(7);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const stop = subscribeSea(vi.fn()); stop();
    expect(cancel).toHaveBeenCalledWith(7);
  });
});