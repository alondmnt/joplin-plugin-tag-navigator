export const RELEASE_NOTES = {
    version: "v2.4.0",
    notes: `Inline Tag Navigator v2.4.0

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
`};