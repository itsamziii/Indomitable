import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PartitionShards } from '../src/Util.ts';

const SHARD_COUNTS = [ 1, 2, 3, 4, 5, 8, 10, 12, 16, 32, 64, 100 ];
const CLUSTER_COUNTS = Array.from({ length: 16 }, (_, index) => index + 1);

// Indomitable clamps clusterCount down to shardCount before partitioning, so only those pairs matter
const LAYOUTS: [ number, number ][] = SHARD_COUNTS
    .flatMap(shardCount => CLUSTER_COUNTS
        .filter(clusterCount => clusterCount <= shardCount)
        .map(clusterCount => [ shardCount, clusterCount ] as [ number, number ]));

// Layouts the old Math.round based chunking got wrong, dropping the trailing shard(s) entirely
const KNOWN_BROKEN: [ number, number ][] = [ [ 10, 3 ], [ 16, 3 ], [ 16, 5 ], [ 32, 5 ], [ 64, 3 ], [ 100, 3 ] ];

test('every shard is assigned to exactly one cluster', () => {
    for (const [ shardCount, clusterCount ] of LAYOUTS) {
        const partitions = PartitionShards(shardCount, clusterCount);
        const assigned = partitions.flat();
        assert.deepEqual(
            [ ...assigned ].sort((a, b) => a - b),
            [ ...Array(shardCount).keys() ],
            `expected every shard exactly once for ${shardCount} shard(s) across ${clusterCount} cluster(s)`
        );
        assert.equal(new Set(assigned).size, shardCount, `duplicate shard for ${shardCount}/${clusterCount}`);
    }
});

test('produces exactly clusterCount groups and none is undefined or empty', () => {
    for (const [ shardCount, clusterCount ] of LAYOUTS) {
        const partitions = PartitionShards(shardCount, clusterCount);
        assert.equal(partitions.length, clusterCount, `wrong group count for ${shardCount}/${clusterCount}`);
        for (let id = 0; id < clusterCount; id++) {
            assert.ok(Array.isArray(partitions[id]), `cluster ${id} got a non array for ${shardCount}/${clusterCount}`);
            assert.ok(partitions[id]!.length > 0, `cluster ${id} got no shards for ${shardCount}/${clusterCount}`);
        }
    }
});

test('each group is a contiguous ascending range and the groups follow each other in order', () => {
    for (const [ shardCount, clusterCount ] of LAYOUTS) {
        const partitions = PartitionShards(shardCount, clusterCount);
        let expected = 0;
        for (let id = 0; id < clusterCount; id++) {
            const partition = partitions[id]!;
            assert.equal(partition[0], expected, `cluster ${id} does not start where the previous one ended for ${shardCount}/${clusterCount}`);
            for (let index = 0; index < partition.length; index++)
                assert.equal(partition[index], expected + index, `cluster ${id} is not contiguous for ${shardCount}/${clusterCount}`);
            expected += partition.length;
        }
        assert.equal(expected, shardCount);
    }
});

test('group sizes differ by at most one, with the bigger groups first', () => {
    for (const [ shardCount, clusterCount ] of LAYOUTS) {
        const sizes = PartitionShards(shardCount, clusterCount).map(partition => partition.length);
        assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `unbalanced sizes ${sizes.join(', ')} for ${shardCount}/${clusterCount}`);
        for (let id = 1; id < sizes.length; id++)
            assert.ok(sizes[id]! <= sizes[id - 1]!, `smaller group placed before a bigger one for ${shardCount}/${clusterCount}`);

        const base = Math.floor(shardCount / clusterCount);
        const remainder = shardCount % clusterCount;
        assert.deepEqual(sizes, Array.from({ length: clusterCount }, (_, id) => base + (id < remainder ? 1 : 0)));
    }
});

test('does not drop shards on the layouts the old chunking broke', () => {
    for (const [ shardCount, clusterCount ] of KNOWN_BROKEN) {
        const partitions = PartitionShards(shardCount, clusterCount);
        assert.equal(partitions.length, clusterCount, `wrong group count for ${shardCount}/${clusterCount}`);
        assert.equal(
            partitions.reduce((total, partition) => total + partition.length, 0),
            shardCount,
            `shards were dropped for ${shardCount}/${clusterCount}`
        );
        // the highest shard id must always be spawned, it is the one the old code silently lost
        assert.ok(partitions.at(-1)!.includes(shardCount - 1), `shard ${shardCount - 1} was never spawned for ${shardCount}/${clusterCount}`);
    }
});

test('known layouts partition into the expected ranges', () => {
    assert.deepEqual(PartitionShards(10, 3), [ [ 0, 1, 2, 3 ], [ 4, 5, 6 ], [ 7, 8, 9 ] ]);
    assert.deepEqual(PartitionShards(16, 5), [ [ 0, 1, 2, 3 ], [ 4, 5, 6 ], [ 7, 8, 9 ], [ 10, 11, 12 ], [ 13, 14, 15 ] ]);
    assert.deepEqual(PartitionShards(1, 1), [ [ 0 ] ]);
    assert.deepEqual(PartitionShards(4, 4), [ [ 0 ], [ 1 ], [ 2 ], [ 3 ] ]);
    assert.deepEqual(PartitionShards(4, 2), [ [ 0, 1 ], [ 2, 3 ] ]);
});

test('degrades gracefully outside the clamped range', () => {
    // reconfigure() does not clamp clusterCount, so surplus clusters get an empty list, never undefined
    assert.deepEqual(PartitionShards(2, 4), [ [ 0 ], [ 1 ], [], [] ]);
    assert.deepEqual(PartitionShards(0, 2), [ [], [] ]);
    assert.deepEqual(PartitionShards(4, 0), []);
});
