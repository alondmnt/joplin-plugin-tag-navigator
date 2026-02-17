# [v2.9.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.9.0)

- added: 'no grouping' mode for paragraph-level cross-note sorting
- added: search tag at cursor from editor context menu (FR #35)
- added: extend query from editor context menu (FR #35)
- added: cmd/ctrl+click to extend query from nav panel (FR #35)
- added: saved queries: `limit` option
- added: saved queries: column rename syntax in `includeCols` (e.g., `col:Display Name`)
- added: settings: hide tag prefix in navigation panel (by @zerg-zerg, #33)
- added: settings: auto-open search panel on saved query load (by @zerg-zerg, #34)
- added: settings: nav/search panel visibility
- improved: parallelise note content fetching in batches (see settings)
- improved: numeric-aware comparison in tag range filtering
- improved: prettify saved query JSON in note body
- fixed: separate loadQuery parsing from DB reconciliation (thanks to @zerg-zerg, #31)
- fixed: guard unnecessary writes during periodic tag conversion (#35)
- fixed: send query and results when toggling search panel visible

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.8.0...v2.9.0

---

# [v2.8.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.8.0)
*Released on 2026-02-04T22:40:59Z*

- added: saved queries dropdown to search pane (see screenshot)
- added: auto-load saved queries setting

<p><img width="447" height="92" alt="image" src="https://github.com/user-attachments/assets/849d068e-def7-4444-8f5c-9ecfffd1a424" /></p>

<p><img width="447" height="100" alt="image" src="https://github.com/user-attachments/assets/fb76fcae-44fa-4b94-9293-76e5a1e3f87a" /></p>

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.7.4...v2.8.0

---

# [v2.7.4](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.7.4)
*Released on 2026-02-02T23:42:16Z*

- fixed: escape square brackets in Tag regex setting example (fixes #30)

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.7.3...v2.7.4

---

# [v2.7.3](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.7.3)
*Released on 2026-01-17T00:00:25Z*

- fixed: preserve nested tag separator in new table entries (closes #28)

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.7.2...v2.7.3

---

# [v2.7.2](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.7.2)
*Released on 2025-12-26T11:04:52Z*

- improved: preserve context expansion state when updating search results

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.7.1...v2.7.2

---

# [v2.7.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.7.1)
*Released on 2025-12-23T04:56:49Z*

- improved: render Markdown highlighting
- improved: allow color and style attributes in HTML sanitization

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.7.0...v2.7.1

---

# [v2.7.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.7.0)
*Released on 2025-12-19T12:18:41Z*

- added: context expansion for search results
  - click ↑ next to results to view more from the note (up to 3 expansion steps)
  - customise length in the settings
- added: CSS styling for core and context lines
- added: search status panel messages
- added: HTML sanitisation for search results
- improved: settings descriptions with examples
- improved: panel and dialog styling

### standard result display
<img width="443" alt="core" src="https://github.com/user-attachments/assets/7880e6c6-0a97-4ed9-823b-d7b88ea60739" />

### expanded context display
<img width="443" alt="expanded" src="https://github.com/user-attachments/assets/899690d0-7bb3-4968-9d5d-a6d126d8f00e" />

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.6.3...v2.7.0

---

# [v2.6.3](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.6.3)
*Released on 2025-11-14T01:07:54Z*

- added: nested tag support for date tags (FR #24)
- improved: memory management

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.6.2...v2.6.3

---

# [v2.6.2](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.6.2)
*Released on 2025-10-08T13:16:33Z*

- fixed: mermaid rendering on mobile
- improved: tag preview rendering at the token level
- improved: tag preview rendering skips certain joplin text tokens
- refactor: inline CSS styles for front matter and tag rendering

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.6.1...v2.6.2

---

# [v2.6.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.6.1)
*Released on 2025-09-29T12:08:36Z*

- improved: MD preview tag rendering supports custom regexes
- improved: search panel tag rendering with separate CSS classes for each tag prefix
- fixed: search panel toggling

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.6.0...v2.6.1

---

# [v.2.6.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.6.0)
*Released on 2025-09-23T12:21:48Z*

- added: render tags in the Markdown preview (see settings)
- added: render front matter in the Markdown preview (see settings)
- added: highlight front matter in the Markdown editor (see settings)
- fixed: front matter parsing logic

### Markdown editor
<img width="671" height="298" src="https://github.com/user-attachments/assets/90c00cd4-afa1-43db-a928-7d969c42a770" />

### Markdown preview
<img width="673" height="286" src="https://github.com/user-attachments/assets/91139881-f73f-4477-b073-8c4f120309c9" />



**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.5.9...v2.6.0

---

# [v2.5.9](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.5.9)
*Released on 2025-09-17T13:18:37Z*

- added: setting: notebook inclusion in database

---

# [v2.5.8](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.5.8)
*Released on 2025-08-19T21:46:29Z*

- added: setting: `Database: Exclude notebooks` by notebook ID (#22)
- added: commands: Exclude / Include notebook (#22)
- improved: search results filter with exclusion patterns, beginning with `!` (#22)
- fixed: show quick open arrow when highlighting note titles

---

# [v2.5.7](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.5.7)
*Released on 2025-08-06T20:19:42Z*

- added: toggle navigation panel keyboard shortcut

---

# [v2.5.6](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.5.6)
*Released on 2025-07-30T14:19:16Z*

- fixed: ensure that date tags are evaluated at least at daily frequency
- fixed: reset regex state during front matter tag parsing
- fixed: skip front matter blocks during inline tag parsing
- improved: use the `keywords` front matter field for inline tags

---

# [v2.5.5](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.5.5)
*Released on 2025-07-12T00:55:28Z*

- fixed: improve JSON query loading with enhanced format handling
- fixed: apply sorting after note edits

---

# [v2.5.4](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.5.4)
*Released on 2025-07-11T12:51:00Z*

- fixed: hide query but not the following text (#21)

---

# [v2.5.3](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.5.3)
*Released on 2025-07-11T12:28:16Z*

- added: setting: middle matter support (#20)

---

# [v.2.5.2](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.5.2)
*Released on 2025-07-10T13:04:47Z*

- fixed: regex safety check (#19)

---

# [v2.5.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.5.1)
*Released on 2025-07-04T05:40:59Z*

- fixed: regression: open links with >50 chars URLs
- improved: convert joplin tags to inline tags skips existing inline tags in body
- improved: settings labels

---

# [v2.5.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.5.0)
*Released on 2025-06-22T14:21:54Z*

- added: kanban view for all tasks in the search results based on checkbox state
    - including [YesYouKan](https://github.com/joplin/plugin-yesyoukan) support
- added: sort by tags now works across all note views and the panel display, with an interactive sort dialog
- added: repeating customisable date tags #week and #month for recurring scheduling
- added: command to replace relative dates with absolute dates in current / selected line. `#today -> #2025-06-22`
- added: syntax highlighting for code blocks and frontmatter in the panel
- added: setting: `Tag conversion tracking` to maintain consistency between Joplin tags and inline tags during conversions (#18)
- added: settings to control which toolbar commands are visible
- improved: saved queries are hidden in the markdown preview (#9)
- improved: result grouping can be defined in queries and selected in the panel context menu (click on note titles)
- improved: panel state preservation
- improved: memory management and security
- fixed: legacy checkbox interaction behaviour

[Tag sorting demo](https://www.youtube.com/watch?v=HvunHOc2zlM)

[Kanban view demo](https://www.youtube.com/watch?v=e7HhQJjpEJg)

---

# [v2.4.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.4.0)
*Released on 2025-05-15T12:06:52Z*

this release improves the navigation and display of search results.

- added: 'Search: Result grouping' setting, which determines how results are split into sections: group by heading (default); group consecutive lines (legacy behaviour); split at each item / paragraph. grouping affects the behaviour of search filters
- added: separate settings 'Note view: Highlight filter results' and 'Search: Highlight filter / tag results'
- added: 'Search: Wait for note period (ms)' setting, that you may decrease to scroll faster to note lines
- added: quick link (arrow) to the first result in each note
- added: 'Note view: Display colors' setting, to use color tags for titles in note view
- improved: a click on any line in the result list scrolls to that line in the note
- improved: expanded/collapsed state preserved on mobile
- improved: on mobile, dismiss the plugin panel when opening a note
- improved: tag ranges logic
- improved: render soft line breaks as hard line breaks
- improved: update the note view when saving a query
- improved: open external links, and links to note headings
- improved: support wikilinks to zettel IDs or first word in title
- fixed: tag parsing in the beginning of a line

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.3.2...v2.4.0

---

# [v2.3.2](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.3.2)
*Released on 2025-03-24T19:28:02Z*

- fixed: release notes freeze when Joplin starts minimised
- improved: command descriptions
- improved: command order in 'Tag Navigator' sub-menu
- added: Note sub-menu 'Convert all notes'
- added: Note sub-menu 'Convert current note'
- improved: error handling when editor is unavailable

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.3.1...v2.3.2

---

# [v2.3.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.3.1)
*Released on 2025-03-16T13:05:40Z*

- fixed: disable js-yaml type parsing in front matter
- fixed: clear result count with the rest of the panel

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.3.0...v2.3.1

---

# [v2.3.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.3.0)
*Released on 2025-03-03T13:53:14Z*

- new: release notes dialog
- improved: tag parsing regex to support multilingual tag names
    - if you are using a custom regex, consider updating it based on the README
- improved: support filtering results with regex in note views (when setting is enabled)
- fixed: regression: convert all notes to joplin tags
- fixed: removed extra slash from notebook path
- fixed: escape regex characters in note view highlights
- fixed: escape regex characters in table processing

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.2.0...v2.3.0

---

# [v2.2.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.2.0)
*Released on 2025-02-22T05:44:12Z*

- new: convert front matter tags to Joplin tags
- new: display front matter tags in note tags navigation panel
- new: filter results by notebook name / path (ref #7)
- new: setting: `Note view: Location of results` (ref #9)
    - default: before query
- improved: notebook path setting description and placement
- improved: remove result count from note view (ref #8)
- fixed: find saved query on first line of note (ref #11)

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.1.4...v2.2.0

---

# [v2.1.4](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.1.4)
*Released on 2025-02-20T11:12:55Z*

- fixed: handle empty tags during conversion to joplin tags
- fixed: handle joplin tag pagination during conversion to joplin tags
- improved: optimise joplin tag retrieval during conversion to joplin tags

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.1.3...v2.1.4

---

# [v2.1.3](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.1.3)
*Released on 2025-02-17T13:02:36Z*

- new: use shift+enter to insert tag
- new: `Insert tag` command in panel context menu
- improved: confirmation dialog before converting all notes

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.1.2...v2.1.3

---

# [v2.1.2](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.1.2)
*Released on 2025-02-15T00:49:41Z*

- fixed: table view: display correctly tags with a prefix matching another tag

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.1.1...v2.1.2

---

# [v2.1.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.1.1)
*Released on 2025-02-13T11:56:02Z*

- improved: sort results tie break by line numbers always in ascending order

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.1.0...v2.1.1

---

# [v2.1.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.1.0)
*Released on 2025-02-11T01:06:02Z*

- added: color tag (see screenshot)
    - Example: `#color=DeepSeaGreen`, `#color=#008080` or `#color=rgb(0, 128, 128)`.
    - Set the colour of an entire note by tagging one of its first 2 lines with the colour tag.
    - Different sections of the same note may be tagged with different colours. They will be displayed separately in the panel (see an example below).
    - added: setting: Color tag
    - added: setting: Search: Use color to set result: border / background
- added: context menu command: show / hide search query section
- added: context menu command: expand tag list
- improved: most settings do not require restart
- improved: support tag negation in edit query
- fixed: conversion to and from tag range in edit query command
- fixed: regression: add note mentions from dropdown
- fixed: distinguish between duplicate tags in edit query

<img width="320" alt="tag-navigator-colours" src="https://github.com/user-attachments/assets/355cc83b-b7fe-4431-9f23-e9f25c383c38" />

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v2.0.1...v2.1.0

---

# [v2.0.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.0.1)
*Released on 2025-01-26T12:38:10Z*

- fixed: regression: handle deleted notes in database update

---

# [v2.0.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v2.0.0)
*Released on 2025-01-26T11:48:07Z*

- added: [tag values](https://github.com/alondmnt/joplin-plugin-tag-navigator?tab=readme-ov-file#tag-values)
    - example: `#tag=value`
- added: setting: `Tag value delimiter`
- added: [command: `Edit query`](https://github.com/alondmnt/joplin-plugin-tag-navigator?tab=readme-ov-file#tag-ranges)
- added: setting: `Search: (Mobile app) Open notes in edit mode`
- added: [suffix / prefix tag range search with wildcard *](https://github.com/alondmnt/joplin-plugin-tag-navigator?tab=readme-ov-file#tag-ranges)
- added: display tag count in panel
- improved: [use tag values to refer to front matter fields](https://github.com/alondmnt/joplin-plugin-tag-navigator?tab=readme-ov-file#front-matter-tags)
- improved: incremental database updates based on notes' modified time
- improved: set cursor and focus on editor on open note
- improved: clear tag filter after selecting a tag
- improved: replace spaces in range fields
- improved: default setting: periodicDBUpdate 5 -> 0 (update DB only after sync)

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v1.5.1...v2.0.0

---

# [v1.5.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v1.5.1)
*Released on 2024-12-31T01:10:07Z*

- fixed: reset currentTableColumns on every note selection
- fixed: update currentTableColumns after refreshNoteView

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v1.5.0...v1.5.1

---

# [v1.5.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v1.5.0)
*Released on 2024-12-30T22:57:37Z*

## added
- new: toolbar / context menu command `New table entry note`
    - creates a new note with a template of properties based on the current table view

<img width="355" alt="image" src="https://github.com/user-attachments/assets/24c9a43e-b8ff-4af6-94d1-412a2d768af0" />

- new: `options` JSON field in saved queries
    - `includeCols`
        - a comma-separated list of columns (tags / properties) to display in the table view
        - can be used to slice the table columns, sort them, or add "modified" / "created" timestamps
    - `excludeCols`
        - a comma-separated list of columns to remove from the table view (even though these properties exist in the listed notes)
    - `sortBy`
        - a comma-separated list of columns to sort the table by
    - `sortOrder`
        - a comma-separated list of the words "ascending" / "descending" (or "desc", "descend", etc.) corresponding to the columns in the `sortBy` field
    - example:

```json
{
  "query": [
    [
      {
        "tag": "#artist",
        "negated": false
      }
    ]
  ],
  "filter": "",
  "displayInNote": "table",
  "options": {
    "includeCols": "title, artist, country, year, modified",
    "excludeCols": "notebook, line",
    "sortBy": "year",
    "sortOrder": "asc"
  }
}
```

- new: display result count in panel and note view
- new: setting: `Note view: Show notebook path in table view`
    - including parent notebooks
- new: setting: `Note view: Tag case in table view`
    - Title Case / lowercase
- new: setting: `Note view: Update view when opening note`
    - disabling this may help slower mobile clients
- new: toolbar command `Refresh tag search view in note`
    - update the displayed results without initiating a complete tag database update

## fixed
- fixed: show inherited tags in table view
- fixed: remove empty notes from note view
- fixed: clear results in note view on empty search
- fixed: do not format tags in code blocks (or front matter) in search panel
- fixed: error in table view when filtering results

## improved
- front matter
    - improved: use `js-yaml` as the preferred yaml parser, fallback to legacy parser
    - improved: add error handling and validation to front matter parsing
    - improved: front matter tags support custom regex and prefixes such as @, +
    - improved: lower case front matter tags
    - improved: remove `#frontmatter` tag from table view
- panel
    - improved: position context menu while avoiding overflow
- note view
    - improved: format saved queries as JSON code blocks in notes
    - improved: sort table view columns by number of notes each tag appears in
    - improved: table format column alignment

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v1.4.3...v1.5.0

---

# [v1.4.3](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v1.4.3)
*Released on 2024-12-20T04:10:03Z*

- new: inline tags inherit from headings

example:
```markdown
# trip to USA #recipe

clam chowder #soup
```
the last line will be tagged by `#soup` and `#recipe`.

- new: inline tags inherit from first 2 lines of note

example:
```markdown
tags: #recipe

chop suey #chinese
```
the last line will be tagged by `#chinese` and `#recipe`.

- new: inline tags inherit front matter tags

example:
```yaml
---
tags:
  - song
---

chop suey! #greatest
```
the last line will be tagged by `#greatest` and `#song`.

- fixed: respect the tagPrefix setting for `#frontmatter` tag

---

# [v1.4.2](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v1.4.2)
*Released on 2024-12-19T12:34:40Z*

- new: inline tags inherit from headings
- new: inline tags inherit from first 2 lines of note
- new: inline tags inherit front matter tags
- fixed: respect the tagPrefix setting for `#frontmatter` tag
- improved: clearObjectReferences
- improved: settings description

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v1.4.1...v1.4.2

---

# [v1.4.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v1.4.1)
*Released on 2024-12-13T04:38:45Z*

- added: `#frontmatter` tag automatically added to front matter sections

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v1.4.0...v1.4.1

---

# [v1.4.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v1.4.0)
*Released on 2024-12-12T12:01:34Z*

- added: front matter support
    - front matter fields are treated as tags

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v1.3.0...v1.4.0

---

# [v1.3.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v1.3.0)
*Released on 2024-12-09T03:47:21Z*

- added: table view (data view / database)

<img width="100%" alt="tag-navigator-tableview" src="https://github.com/user-attachments/assets/6d3c57b5-4bbc-496e-8711-3c3fcbcd6c8b">

![tag-navigator-tableview](https://github.com/user-attachments/assets/4d4dc204-0152-4c29-a518-a7efc69cef78)

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v1.2.2...v1.3.0

---

# [v1.2.2](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v1.2.2)
*Released on 2024-08-23T01:07:48Z*

- new: setting `Space replacement`: Character to replace spaces in converted Joplin tags. Default: "_".
- improve: insert tag without leading space.
- improve: sections appear instead of disappear on panel init.

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v1.2.1...v1.2.2

---

# [v1.2.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v1.2.1)
*Released on 2024-08-16T01:47:57Z*

- new: insert tags into the note editor (Markdown / Rich Text) with auto-completion
    - in the settings, set `Search: When multiple tags are matched:` to `Insert first in editor`, and follow these steps:
    1. press `Ctrl+Shift+I` to change focus to the tag search panel.
    2. type part of a tag.
    3. press `Enter` to insert the first tag at the current cursor position, and return to the editor.
    4. or, press `Esc` to return to the note editor.
    - this also works on mobile, if the note editor is open.

<img src="https://github.com/user-attachments/assets/fb64c815-7d67-4a9e-a6c9-0a396e87ec72" width="80%" title="insert tag demo">

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v1.2.0...v1.2.1

---

# [v1.2.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v1.2.0)
*Released on 2024-08-15T13:16:50Z*

- navigation panel
    - new: navigation panel view of all tags, with nested tags support (see video)
- misc fixes & improvements
    - improve: display tooltip for note title in query
    - fix: tag name sort to be locale aware
    - fix: open range queries
    - fix: save over badly formatted queries

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v1.1.0...v1.2.0

<a href="https://www.youtube.com/watch?v=h-HdX7npbIw"><img src="https://img.youtube.com/vi/h-HdX7npbIw/hqdefault.jpg" width="80%" title="navidation panel demo"></a>

---

# [v1.1.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v1.1.0)
*Released on 2024-07-20T00:41:27Z*

- commands
    - new: toggle task checkboxes between 6 different states via a context menu. **(see screenshot)**
        - open, in question, ongoing, blocked, obsolete, done
    - new: note toolbar button to load query from a note, which is available on mobile in the 3-dot note menu.
    - new: editor toolbar button to toggle note view, which is available on mobile on the editor toolbar.
- note mentions
    - new: wikilinks can open notes from the panel.
    - fix: regression in wikilink search.
    - fix: add notes to query by title *and* ID to handle notes with duplicate titles.
    - improve: search only by note ID when available to handle notes with duplicate titles.
- misc fixes & improvements
    - fix: remove empty notes from note view.
    - fix: avoid multiple context menus.
    - improve: content margins style.

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v1.0.0...v1.1.0

<img width="268" alt="image" src="https://github.com/user-attachments/assets/0941d234-1120-40b0-9193-ec4bdf400688">

---

# [v1.0.0 🎉](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v1.0.0)
*Released on 2024-07-13T09:28:15Z*

- enhanced tag search
    - **nested tags / tag hierarchy:** this feature request has been [floating](https://discourse.joplinapp.org/t/gsoc-idea-hierarchical-tags/6335) [around](https://discourse.joplinapp.org/t/plugin-request-tags-hierarchy/14132) for [some time](https://discourse.joplinapp.org/t/managing-lots-of-notes/15153). when using nested tags like `#parent/child`, searching for `#parent` will bring up all its child tags as well (including `#parent/child`, `#parent/child2`, etc.). this format / style is common in many note apps such as [Bear](https://bear.app/faq/how-to-use-tags-in-bear/#nested-tags), [Obsidian](https://help.obsidian.md/Editing+and+formatting/Tags#Nested+tags), [Notable](https://notable.app/#more-features), [Foam](https://github.com/foambubble/foam/issues/614), [Amplenote](https://www.amplenote.com/help/organizing_notes_tags#How_do_nested%2Fhierarchical_tags_work%3F_How_can_I_manage_multiple_projects_with_them%3F), and allows one to group tags by projects and contexts. you may use the `Replace All` command to rename your existing tags and turn them into nested tags.
        - example: when date tagging using the following format `#2024/07/13`, searching for `#2024` will return all dates from 2024, and searching for `#2024/07` will return all dates from July 2024.
- new commands
    - show / hide panel sections (tag ranges, note mentions, results filters) by right-clicking anywhere on the panel.
    - edit tags also by right-clicking on the tag list or the search query.
- new settings
    - `Search: When multiple tags are matched, select`: "First" / "All" (behaviour in v0.8.0) / "None" (behaviour before v0.8.0).
        - example: when selecting "All" here, and selecting `Search: Use regex for tag / note / content filtering`, you could come up with filter patterns to add multiple tags at once to the query and search for all of them.
    - `Search: Tag sort by`: "Name" / "Count".
        - example: when selecting "Count" here and "First" in the setting above, the most popular tag will be selected by default when pressing Enter in the query builder.
- misc fixes
    - toggle checklist items with markdown formatting.
    - case insensitive tag ranges.
    - case insensitive tag replace / remove all.
    - checkbox style.

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.8.0...v1.0.0

---

# [v0.8.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.8.0)
*Released on 2024-06-26T00:50:35Z*

- enhanced tag search
    - new: tag range queries **(see screenshot)**
        - check the Enter, Esc, ArrowUp key presses while editing ranges in the panel
    - new: `#today` date tag, with support for date arithmetic (e.g., `#today+1`)
        - this special tag can be used both to tag and to search **(see screenshot)**
    - new: Enter key press can add multi-tags to query
    - new: optional regex support in filters
- enhanced tag editing **(see screenshot)**
    - new: context menu command `Replace all` to edit all instances of a tag
    - new: context menu command `Remove all` to remove all instances of a tag
- other
    - new: follow links to notes from the panel
- new settings
    - new: Search: Use regex for tag / note / content filtering
    - new: Search: Show tag range section
    - new: Date tags: Today
        - customise the `#today` tag
    - new: Date tags: Date format
- misc fixes & improvements
    - fix: skip note when tag conversion fails
    - improve: default tag regex (stop at quotation marks)
    - fix: update database and tag list while editing notes
    - improve: results highlighting
    - fix: toggle checklist items with markdown formatting
    - fix: load results filter on load query command
    - improve: more compact panel UX

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.7.4...v0.8.0

**image 1: tag ranges**
<img width="389" alt="image" src="https://github.com/alondmnt/joplin-plugin-tag-navigator/assets/17462125/30454be1-e09d-413e-a48c-6b3321ce99d6">

**image 2: date tags & date ranges**
note how `#today` is used to tag a paragraph, and to search for dates
<img width="391" alt="image" src="https://github.com/alondmnt/joplin-plugin-tag-navigator/assets/17462125/ea651ddf-3598-4146-b56e-3cfeb2e18a87">

**image 3: new tag editing commands**
<img width="141" alt="image" src="https://github.com/alondmnt/joplin-plugin-tag-navigator/assets/17462125/c55c028d-690d-4f6b-8ea6-45f53f1ecba5">

---

# [v0.7.4](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.7.4)
*Released on 2024-05-23T03:30:23Z*

- various fixes to improve plugin stability and reduce its footprint considerably
- new: blocked-task style checkbox `- [!]` (not officially part of the `[x]it!` specs)
- improve: set a constant level for headings (h3) rendered on the panel
- fix: AND logic for empty tags

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.7.3...v0.7.4

---

# [v0.7.3](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.7.3)
*Released on 2024-05-14T12:46:49Z*

- new: tag context menu commands `Search tag` and `Extend query` (see screenshot)

<img width="369" alt="image" src="https://github.com/alondmnt/joplin-plugin-tag-navigator/assets/17462125/ec3cfe6b-f49e-4505-be10-9c61c8e0b238">

---

# [v0.7.2](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.7.2)
*Released on 2024-05-12T12:53:29Z*

- fix: regression in tag exclusion regex
- fix: regression in updating CSS on panel toggle
- fix: update tags / notes lists on db update
- improve: checkbox + tag spacing style

---

# [v0.7.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.7.1)
*Released on 2024-05-11T14:38:55Z*

- fix: load search filter more robustly and preserve its value when toggling the panel
- improve: checkbox style for easier customization
    - you may increase the size of checkboxes by entering in the `Search: Panel style` setting: `.itags-search-checkbox { width: 15px; height: 15px; font-size: 15px }` (requires restart)

---

# [v0.7.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.7.0)
*Released on 2024-05-10T02:47:44Z*

- new: mobile app support (#2)
    - this includes many changes and improvements under the hood, that may also improve the desktop experience.
    - all features should be supported. scroll to line works when the editor is open.
- new: [[x]it! style](https://xit.jotaen.net/) TODOs **(see screenshot)**
    - it's not a complete implementation, but adds support for the 5 types of checkboxes.
    - I first learned about this text format on the [Inline TODOs](https://github.com/CalebJohn/joplin-inline-todo?tab=readme-ov-file#roadmap) plugin repo!
- new: settings
    - `Search: Colorize todos in results`: toggle custom checkboxes (and `[x]it!` support) on / off.
    - `Search: Update inline tags DB after sync`
    - `Search: Periodic update of results display in notes`: you may disable this on a Joplin client to avoid conflicts with another client. the same time interval as above applies.
    - `Search: Show note mentions section` and `Search: Show results filter section`: hide elements on the panel, for a better mobile / small screen experience.
- misc improvements
    - skip conflict notes
    - remove saved query from note when saving an empty query
    - respect user sort choice after panel hide
- misc fixes
    - remove tag command supports tags with special chars
    - checkbox toggle next to links and inline code
    - avoid updating note when nothing changed
    - word-wrapping in search results

Tips on setting tag highlighting in the mobile editor appear [here](https://github.com/alondmnt/joplin-plugin-tag-navigator?tab=readme-ov-file#companion-plugins).

**Screenshot: [x]it! TODOs**
<img width="295px" src="https://github.com/alondmnt/joplin-plugin-tag-navigator/assets/17462125/afdd0b7a-489a-406d-a28d-930b980db5e6)"></img>

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.6.3...v0.7.0

---

# [v0.6.3](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.6.3)
*Released on 2024-04-26T09:21:57Z*

- fix: update note view only if changed
- improve: note view link to origin format

---

# [v0.6.2](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.6.2)
*Released on 2024-04-25T22:31:12Z*

- new: link to origin in note view

---

# [v0.6.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.6.1)
*Released on 2024-04-25T05:20:10Z*

- new: command to toggle note view

---

# [v0.6.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.6.0)
*Released on 2024-04-24T15:04:13Z*

- new: search results can be displayed in auto-generated notes
- improve: saved query in JSON format
- improve: scroll to exact line

<img width="70%" alt="Screenshot 2024-04-25 at 0 59 57" src="https://github.com/alondmnt/joplin-plugin-tag-navigator/assets/17462125/7a98dcf8-f758-4630-b8b7-0da7379e43ca">

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.5.1...v0.6.0

---

# [v0.5.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.5.1)
*Released on 2024-04-15T14:29:17Z*

- fix: empty list prefix case

---

# [v0.5.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.5.0)
*Released on 2024-04-13T12:05:12Z*

- new: commands to convert Joplin tags to inline tags
- new: auto refresh of inline tags in the currently edited note

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.4.1...v0.5.0

---

# [v0.4.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.4.1)
*Released on 2024-03-29T04:42:21Z*

- fix: CM6 / CM5 script loading logic
- fix: style, single line queries to avoid truncated results

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.4.0...v0.4.1

---

# [v0.4.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.4.0)
*Released on 2024-03-25T13:24:25Z*

- new: tag context menu, with Add, Rename & Remove commands
- new: loadQuery command for saved search queries
- new: CodeMirror 6 support
- improve: apply tag inheritance to note mentions / links
- improve: tag parser

<img width="324" alt="context-menu" src="https://github.com/alondmnt/joplin-plugin-tag-navigator/assets/17462125/c7d8e50a-887b-4b06-be22-f56b8357981e">

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.3.0...v0.4.0

---

# [v0.3.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.3.0)
*Released on 2024-03-17T10:37:21Z*

- new: tag by notes
    - search for links or [[wikilinks]] to notes that appear in paragraphs
    - you may display backlinks to the current note
- new: tag inheritance
    - child outline items inherit tags from their parent items
- improve: search filters
    - multiple-word filter: search each word independently, or a complete "quoted phrase"
    - search any combination of the note title and the paragraph text
- various ux / style improvements and fixes

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.2.3...v0.3.0

---

# [v0.2.3](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.2.3)
*Released on 2024-02-27T23:38:03Z*

- new: setting ignoreCodeBlocks
- new: setting minCount
- fix: don't update results if queries don't match

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.2.2...v0.2.3

---

# [v0.2.2](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.2.2)
*Released on 2024-02-27T13:27:41Z*

- new: saved searches
    - you can now save search queries in notes
    - each note can contain a single query
    - once a note is opened, if it has an embedded query the results will appear in the tag search panel
    - you may use notes as "search bookmarks" (for example, using the [Favorites plugin](https://discourse.joplinapp.org/t/notebook-note-to-do-tag-search-favorites-plugin/14049)), or you may store relevant search queries next to the content of regular notes (e.g., project notes)
    - these saved searches will sync with the notes

https://youtu.be/xIBZl2Ala9A

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.2.1...v0.2.2

---

# [v0.2.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.2.1)
*Released on 2024-02-25T23:37:51Z*

- new: setting ignoreHtmlNotes
    - this setting avoids processing of HTML notes (which tend to contain many false positive tags) by default

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.2.0...v0.2.1

---

# [v0.2.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.2.0)
*Released on 2024-02-25T08:33:10Z*

- a new (inline) tag search system via a dedicated panel

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.1.3...v0.2.0

---

# [v0.1.3](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.1.3)
*Released on 2024-02-14T14:03:00Z*

- fix: parsing after newline

---

# [v0.1.2](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.1.2)
*Released on 2024-02-12T12:59:24Z*

- fix: serialized all-note conversion

---

# [v0.1.1](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.1.1)
*Released on 2024-02-10T06:13:32Z*

- improve: tag parser, require preceding whitespace
- new: settings tagRegex, excludeRegex
- new: keyboard shortcuts

**Full Changelog**: https://github.com/alondmnt/joplin-plugin-tag-navigator/compare/v0.1.0...v0.1.1

---

# [v0.1.0](https://github.com/alondmnt/joplin-plugin-tag-navigator/releases/tag/v0.1.0)
*Released on 2024-02-06T13:57:31Z*

first release.

- convert your existing inline tags to native Joplin tags
- panel for navigating between inline tags that appear in the current note

---
