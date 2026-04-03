import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/core/event-bus';

describe('EventBus', () => {
  it('should call listeners when an event is emitted', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('engine:ready', handler);

    bus.emit('engine:ready');

    expect(handler).toHaveBeenCalledOnce();
  });

  it('should pass payload to listeners', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('queue:removed', handler);

    bus.emit('queue:removed', 'action-123');

    expect(handler).toHaveBeenCalledWith('action-123');
  });

  it('should unsubscribe via returned function', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.on('engine:ready', handler);

    unsub();
    bus.emit('engine:ready');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should unsubscribe via off()', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('engine:ready', handler);

    bus.off('engine:ready', handler);
    bus.emit('engine:ready');

    expect(handler).not.toHaveBeenCalled();
  });

  it('should support multiple listeners', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('engine:ready', h1);
    bus.on('engine:ready', h2);

    bus.emit('engine:ready');

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('should not break if a listener throws', () => {
    const bus = new EventBus();
    bus.on('engine:ready', () => {
      throw new Error('boom');
    });
    const h2 = vi.fn();
    bus.on('engine:ready', h2);

    bus.emit('engine:ready');

    expect(h2).toHaveBeenCalledOnce();
  });

  it('should remove all listeners for an event', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('engine:ready', h1);
    bus.on('engine:destroyed', h2);

    bus.removeAllListeners('engine:ready');
    bus.emit('engine:ready');
    bus.emit('engine:destroyed');

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('should remove all listeners when no event specified', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('engine:ready', h1);
    bus.on('engine:destroyed', h2);

    bus.removeAllListeners();
    bus.emit('engine:ready');
    bus.emit('engine:destroyed');

    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('should report correct listener count', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('engine:ready')).toBe(0);

    const unsub = bus.on('engine:ready', vi.fn());
    expect(bus.listenerCount('engine:ready')).toBe(1);

    unsub();
    expect(bus.listenerCount('engine:ready')).toBe(0);
  });
});
