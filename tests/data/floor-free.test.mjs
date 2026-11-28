// Every green floor lists at least one free apartment; every other floor lists none under the free chip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freeOnFloor, floorIsGreen, listedOnFloor } from '../../src/floor-match.js';

const doc = JSON.parse(readFileSync(new URL('../../public/data/apartments.json', import.meta.url), 'utf8'));
const FREE = new Set(['available']);

test('green floors and the free list are the same predicate', () => {
  const report = {};
  for (const block of ['I', 'II', 'III']) {
    let green = 0;
    let freeApts = 0;
    for (let floor = 6; floor <= 36; floor++) {
      const free = freeOnFloor(doc.apartments, block, floor);
      const isGreen = floorIsGreen(doc.apartments, block, floor);
      const listed = listedOnFloor(doc.apartments, block, floor, FREE);
      assert.equal(isGreen, free.length > 0, `${block} floor ${floor} highlight`);
      assert.equal(listed.length, free.length, `${block} floor ${floor} list`);
      if (isGreen) {
        assert.ok(listed.length >= 1, `${block} floor ${floor} green but empty`);
        green += 1;
        freeApts += listed.length;
      } else {
        assert.equal(listed.length, 0, `${block} floor ${floor} not green but listed free`);
      }
      // String floor numbers must match the numeric ones. A "36" click cannot miss floor 36.
      assert.equal(freeOnFloor(doc.apartments, block, String(floor)).length, free.length);
    }
    report[block] = { greenFloors: green, freeApartments: freeApts };
  }
  assert.deepEqual(report, {
    I: { greenFloors: 14, freeApartments: 25 },
    II: { greenFloors: 8, freeApartments: 40 },
    III: { greenFloors: 28, freeApartments: 293 },
  });
  console.log(JSON.stringify(report));
});
