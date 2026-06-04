import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncQueue } from '../src/concurrency/AsyncQueue.ts';

const settled = (promise: Promise<unknown>): Promise<'resolved' | 'rejected'> =>
    promise.then(() => 'resolved' as const, () => 'rejected' as const);

const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

test('grants the lock immediately when the queue is empty', async () => {
    const queue = new AsyncQueue();
    await queue.wait({});
    assert.equal(queue.remaining, 1);
    queue.shift();
    assert.equal(queue.remaining, 0);
});

test('grants locks in FIFO order', async () => {
    const queue = new AsyncQueue();
    const order: string[] = [];

    const a = queue.wait({});
    const b = queue.wait({});
    const c = queue.wait({});

    await a;
    order.push('a');
    queue.shift();

    await b;
    order.push('b');
    queue.shift();

    await c;
    order.push('c');
    queue.shift();

    assert.deepEqual(order, [ 'a', 'b', 'c' ]);
    assert.equal(queue.remaining, 0);
});

test('aborting a queued waiter rejects only that waiter', async () => {
    const queue = new AsyncQueue();
    const controller = new AbortController();

    const a = queue.wait({});
    const b = queue.wait({ signal: controller.signal });

    await a; // holder
    controller.abort();

    assert.equal(await settled(b), 'rejected');
    assert.equal(queue.remaining, 1); // only the holder remains
});

test('aborting a mid-queue waiter does not strand its successor', async () => {
    const queue = new AsyncQueue();
    const controller = new AbortController();

    const a = queue.wait({});                       // holder
    const b = queue.wait({ signal: controller.signal });
    const c = queue.wait({});                       // queued behind b

    await a;
    controller.abort();                             // b leaves the queue

    // c must still wait behind the holder, not jump ahead
    let cGranted = false;
    void c.then(() => {
        cGranted = true; 
    });
    await tick();
    assert.equal(cGranted, false);

    queue.shift();                                  // holder releases
    await c;                                         // c now acquires
    assert.equal(cGranted, true);
    assert.equal(queue.remaining, 1);
});

test('aborting after the lock is acquired is a no-op', async () => {
    const queue = new AsyncQueue();
    const controller = new AbortController();

    const a = queue.wait({ signal: controller.signal });

    await a;                // already acquired
    controller.abort();     // too late; the holder keeps the lock

    assert.equal(await settled(a), 'resolved');
    queue.shift();
    assert.equal(queue.remaining, 0);
});
