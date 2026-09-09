/**
 * Tests for indented (four-space) code blocks in the indexer, issue #46.
 *
 * The indexer's fence check is /^\s*```/, which cannot match an indented block,
 * so tags inside one were indexed even with `Ignore code blocks` on. A pasted
 * shell or C snippet therefore put junk in the tag list: a shebang alone yields
 * three tags, because nested tags split on '/'.
 *
 * The hazard in fixing it is that an indented code block and a paragraph
 * continuing a list item have the same shape line by line - a blank line, then
 * four spaces - and differ only by whether a list is open. Tags on indented
 * list content are core usage, so most of these cases exist to pin that they
 * keep being indexed.
 */
import { parseTagsLines } from '../src/parser';
import { TagSettings } from '../src/settings';
import { defTagRegex } from '../src/utils';

function settings(overrides: Partial<TagSettings> = {}): TagSettings {
  return {
    tagRegex: defTagRegex, excludeRegex: null, minCount: 1, colorTag: '#color=',
    todayTag: '#today', monthTag: '#month', weekTag: '#week',
    todayTagRegex: /(#today)([+-]?\d*)/g, monthTagRegex: /(#month)([+-]?\d*)/g,
    weekTagRegex: /(#week)([+-]?\d*)/g, dateFormat: '#yyyy-MM-dd',
    monthFormat: '#yyyy-MM', weekFormat: '#yyyy-MM-dd', weekStartDay: 0,
    valueDelim: '=', spaceReplace: '_', tagPrefix: '', ignoreHtmlNotes: true,
    ignoreCodeBlocks: true, ignoreFrontMatter: true, inheritTags: true,
    nestedTags: true, fullNotebookPath: false, middleMatter: false,
    includeNotebooks: [], excludeNotebooks: [], readBatchSize: 10,
    ...overrides,
  } as TagSettings;
}

const tags = (text: string, o: Partial<TagSettings> = {}) =>
  parseTagsLines(text, settings(o)).map((t: any) => t.tag);

describe('indented code blocks are not indexed', () => {
  it('skips a tag in an indented block after a paragraph', () => {
    expect(tags('para\n\n    #inindent\n')).toEqual([]);
  });

  it('skips a whole indented snippet, including its blank lines', () => {
    expect(tags('shell:\n\n    #!/bin/bash\n\n    #define MAX\n')).toEqual([]);
  });

  it('resumes indexing after the block ends', () => {
    expect(tags('para\n\n    #incode\n\nback to #prose\n')).toEqual(['#prose']);
  });

  it('leaves the realistic junk case with only the real tag', () => {
    const note = [
      'Here is some shell:', '',
      '    #!/bin/bash',
      '    # a normal comment',
      '    grep -c "#TODO" file.txt',
      '    #define MAX 10',
      '    #include <stdio.h>',
      '', 'and back to prose with #realtag',
    ].join('\n');
    expect(tags(note)).toEqual(['#realtag']);
  });

  it('indexes them again when the setting is off', () => {
    expect(tags('para\n\n    #inindent\n', { ignoreCodeBlocks: false })).toEqual(['#inindent']);
  });
});

describe('indented list content is still indexed', () => {
  it('indexes a nested list item', () => {
    expect(tags('- a\n    - #innested\n')).toContain('#innested');
  });

  it('indexes a deeply indented list item', () => {
    expect(tags('- a\n  - b\n        - #indeep\n')).toContain('#indeep');
  });

  it('indexes a paragraph continuing a list item', () => {
    expect(tags('- item\n\n    #incont\n')).toContain('#incont');
  });

  it('indexes a continuation under an ordered list item', () => {
    expect(tags('1. item\n\n    #inordered\n')).toContain('#inordered');
  });

  it('indexes indented content under a list using * and + markers', () => {
    expect(tags('* a\n\n    #instar\n')).toContain('#instar');
    expect(tags('+ a\n\n    #inplus\n')).toContain('#inplus');
  });

  it('treats an indented line as code again once the list has ended', () => {
    // A top-level paragraph closes the list, so what follows is code again.
    expect(tags('- item\n\nparagraph\n\n    #aftercode\n')).toEqual([]);
  });

  it('keeps the list open across a lazy continuation at the margin', () => {
    // CommonMark: a margin line straight after list content continues that
    // item's paragraph, so the list is still open and the indented block below
    // is list content, not code. Closing the list here loses the tag.
    expect(tags('- item\nlazy continuation\n\n    #tag\n')).toContain('#tag');
    expect(tags('- a\n- b\ntext at margin\n\n    #tag\n')).toContain('#tag');
  });

  it('closes the list at a new top-level block, not at a continuation', () => {
    // A margin line *after a blank* starts a new block and does close the list.
    expect(tags('- item\n\nparagraph\n\n    #aftercode\n')).toEqual([]);
  });

  it('indexes a lazy continuation with no blank line before it', () => {
    // Indented code cannot interrupt a paragraph, so this is still prose.
    expect(tags('some paragraph\n    #lazy\n')).toContain('#lazy');
  });
});

describe('shapes that only look like list markers', () => {
  it('does not mistake a thematic break for a list', () => {
    // `* * *` and `- - -` match a naive marker test, which would exempt the
    // rest of the note from code detection.
    expect(tags('para\n\n* * *\n\n    #incode\n')).toEqual([]);
    expect(tags('para\n\n- - -\n\n    #incode\n')).toEqual([]);
    expect(tags('para\n\n***\n\n    #incode\n')).toEqual([]);
  });

  it('does not let a marker-shaped first line cancel the block', () => {
    // A pasted snippet whose first line looks like a marker - numbered steps,
    // a diff hunk - would otherwise open no block, and the flag would then
    // stick and leak the rest of it.
    expect(tags('para\n\n    - #probe\n')).toEqual([]);
    expect(tags('steps:\n\n    1. setup\n    #include <x.h> #probe\n')).toEqual([]);
    expect(tags('diff:\n\n    - old #probe\n    + new\n')).toEqual([]);
  });

  it('still treats a real list marker as a list', () => {
    expect(tags('- a\n\n    #inlist\n')).toContain('#inlist');
    expect(tags('* a\n\n    #inlist\n')).toContain('#inlist');
  });
});

describe('tab indentation', () => {
  it('treats a tab as four columns, so tab-indented blocks are code', () => {
    expect(tags('para\n\n\t#tabbed\n')).toEqual([]);
  });

  it('still indexes tab-indented list content', () => {
    expect(tags('- item\n\n\t#tabbed\n')).toContain('#tabbed');
  });
});

describe('fenced blocks are unaffected', () => {
  it('still skips a fenced block', () => {
    expect(tags('para\n\n```\n#infence\n```\n')).toEqual([]);
  });

  it('still indexes a fenced block when the setting is off', () => {
    expect(tags('para\n\n```\n#infence\n```\n', { ignoreCodeBlocks: false })).toEqual(['#infence']);
  });

  it('does not treat an indented fence as an indented code block', () => {
    expect(tags('- item\n\n    ```\n    #innestedfence\n    ```\n')).toEqual([]);
  });
});
