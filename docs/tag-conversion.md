# Tag Conversion

Conversion connects inline tags to Joplin's note-level tags. The converter uses
the existing parser to identify inline tags and keeps conversion history in
per-note Joplin user data when `Tag conversion tracking` is enabled.

## Prefix Recognition

`hasInlineTagPrefix` in `src/utils.ts` implements the existing frontmatter rule:
test a candidate with the configured `Tag regex`, resetting its position before
each test. Reverse conversion applies space replacement before detection, so a
Joplin name such as `@alice smith` becomes `@alice_smith`. A recognised tag keeps
its prefix; an unrecognised name receives the configured `Tag prefix`.

Frontmatter parsing uses this detection while retaining its existing lowercase
and whitespace normalisation. Reverse conversion uses `formatInlineTag` for
generated text, duplicate checks and tracked removal. No fixed list of prefixes
or additional settings is needed.

Joplin names that produce the same inline representation (such as `alice` and
`#alice`) share one emitted tag. Tracking retains it while either association exists.

## Reverse Conversion

With tracking off, the converter rebuilds managed tag-list lines from the current
Joplin tags, omitting tags already represented elsewhere in the note. With
tracking on, it adds missing tags and removes previously tracked tags from
managed tag-list lines when their Joplin associations disappear.

Tracking checks for missing inline tags after removal. This preserves a native
parent tag when removing its child also removes the parent's inferred occurrence.
Duplicate checks also account for a `List prefix` without trailing whitespace;
the written prefix retains its configured form.

A managed line begins with `List prefix`, followed by an empty payload, the
configured prefix, or a regex-recognised tag at the start of the payload. A
matching tag later in a YAML value does not make the line a managed list.
Removal matches complete formatted tags, preserving longer names and inline tags
in ordinary body text. New lists are inserted after leading YAML frontmatter.

Existing conversion history remains a list of Joplin tag names. This fix does
not migrate previously generated malformed tags or change synchronisation policy.
