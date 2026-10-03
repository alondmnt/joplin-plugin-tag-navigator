/**
 * Tests that `created` / `modified` sorting follows Joplin's user-facing dates
 * (user_created_time / user_updated_time), not the internal timestamps. Issue #60.
 */
import { sortResults, SortableItem } from '../src/search';
import { TagSettings } from '../src/settings';

const tagSettings = { tagPrefix: '#', valueDelim: '=' } as TagSettings;
const resultSettings = { resultSort: 'modified', resultOrder: 'desc' };

/** A result whose internal times disagree with its user-facing times. */
function item(id: string, internal: number, user: number): SortableItem {
  return {
    externalId: id, title: id, color: '', lineNumbers: [[0]],
    createdTime: internal, updatedTime: internal,
    userCreatedTime: user, userUpdatedTime: user,
  };
}

describe('sortResults user-facing dates', () => {
  // Note B was created later (internal) but backdated by the user to the previous day.
  const a = item('A', 100, 200);
  const b = item('B', 300, 100);

  test('created sorts by user_created_time', () => {
    const out = sortResults([b, a], { sortBy: 'created', sortOrder: 'desc' }, tagSettings, resultSettings);
    expect(out.map(r => r.externalId)).toEqual(['A', 'B']);
  });

  test('modified sorts by user_updated_time', () => {
    const out = sortResults([b, a], { sortBy: 'modified', sortOrder: 'desc' }, tagSettings, resultSettings);
    expect(out.map(r => r.externalId)).toEqual(['A', 'B']);
  });
});
