import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getBagUsePurposes,
  hasResidentialUsePurpose
} from '../../src/shared/bag.js';

describe('BAG use purposes', () => {
  it('normalizes comma-separated and array values', () => {
    assert.deepEqual(
      getBagUsePurposes([' Woonfunctie, winkelfunctie ', 'kantoorfunctie']),
      ['woonfunctie', 'winkelfunctie', 'kantoorfunctie']
    );
  });

  it('accepts residential and mixed-use objects', () => {
    assert.equal(hasResidentialUsePurpose('woonfunctie'), true);
    assert.equal(hasResidentialUsePurpose('winkelfunctie,woonfunctie'), true);
  });

  it('rejects objects without a residential use purpose', () => {
    assert.equal(hasResidentialUsePurpose('winkelfunctie,kantoorfunctie'), false);
    assert.equal(hasResidentialUsePurpose(null), false);
  });
});
