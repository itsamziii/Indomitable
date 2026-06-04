export declare interface AsyncQueueWaitOptions {
    signal?: AbortSignal | undefined;
}

interface Deferred {
    promise: Promise<void>;
    resolve: () => void;
    reject: (reason?: unknown) => void;
    settled: boolean;
}

export class AsyncQueue {
    private readonly queue: Deferred[];
    constructor() {
        this.queue = [];
    }

    public get remaining(): number {
        return this.queue.length;
    }

    public wait({ signal }: AsyncQueueWaitOptions): Promise<void> {
        const deferred = { settled: false } as Deferred;
        deferred.promise = new Promise<void>((resolve, reject) => {
            deferred.resolve = () => {
                deferred.settled = true; resolve(); 
            };
            deferred.reject = (reason?: unknown) => {
                deferred.settled = true; reject(reason); 
            };
        });

        const wasEmpty = this.queue.length === 0;
        this.queue.push(deferred);

        // First in line acquires the lock immediately
        if (wasEmpty) deferred.resolve();

        if (signal) {
            const listener = () => {
                // The front of the queue always holds the lock (already settled),
                // so an abort can only ever remove a still-waiting entry
                if (deferred.settled) return;
                const index = this.queue.indexOf(deferred);
                if (index === -1) return;
                this.queue.splice(index, 1);
                deferred.reject(new Error('The identify request was aborted'));
            };
            signal.addEventListener('abort', listener, { once: true });
            deferred.promise
                .catch(() => null)
                .finally(() => signal.removeEventListener('abort', listener));
        }

        return deferred.promise;
    }

    public shift(): void {
        this.queue.shift();
        if (this.queue.length) this.queue[0].resolve();
    }
}
