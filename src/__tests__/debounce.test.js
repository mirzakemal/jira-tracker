import { describe, it, expect, vi } from 'vitest';
import { debounce, throttle } from '../utils/debounce.js';

describe('debounce', () => {
  it('delays execution until wait time passes', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('cancels previous call when invoked again before wait', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('passes arguments to the function', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('test', 42);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('test', 42);

    vi.useRealTimers();
  });

  it('uses default wait of 300ms', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn);

    debounced();
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

describe('throttle', () => {
  it('executes immediately on first call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('ignores calls within wait period', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('allows call after wait period', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    vi.advanceTimersByTime(100);
    throttled();

    expect(fn).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('passes arguments to the function', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('hello', 123);
    expect(fn).toHaveBeenCalledWith('hello', 123);

    vi.useRealTimers();
  });

  it('uses default wait of 300ms', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn);

    throttled();
    vi.advanceTimersByTime(299);
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
