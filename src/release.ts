export const RELEASE_NOTES = {
    version: "v2.11.1",
    notes: `v2.11.1:
- added: inline checkbox highlighting in the Markdown editor - the six task states, including [@], [?], [!] and [~], which Joplin does not render
- added: the class itags-checkbox, and one per state, to style task markers in the editor and the search panel from one place
- note: 'Inline tags: Style' is now 'Inline tags and checkboxes: Style', and takes CSS for tags and task markers alike

v2.11.0:
- added: inline tag highlighting in the Markdown editor, built in - no longer needs Rich Markdown
- added: setting 'Inline tags: Style' and the class itags-tag, to style tags in the editor, preview and search panel from one place. This is the only way to restyle tags on mobile
- fixed: tags inside indented (four-space) code blocks are no longer indexed. Turn off 'Ignore code blocks' to index them again

If you currently highlight tags with Rich Markdown, remove its rm-tag custom class and stylesheet rule, or turn off 'Inline tags: Highlight in editor' - otherwise both will style the same tags.
`};
