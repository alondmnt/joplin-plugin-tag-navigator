# Inline Tag Navigator

This plugin adds inline tag support (such as #inline-tag) to [Joplin](https://joplinapp.org) in two ways:

- It adds a panel for navigating between inline tags that appear in the current note
- It can convert your existing inline tags to native Joplin tags, so that they are accessible using tag search
    - To convert a single note, use `Tools-->Tag Navigator-->Convert note's inline tags to Joplin tags`
    - To convert all notes, use `Tools-->Tag Navigator-->Convert all notes' inline tags to Joplin tags`
    - To periodically convert all notes, define the update period in `Settings-->Tag Navigator-->Periodic update (minutes)`

![tag-navigator demo](img/tag-navigator.gif)

## Companion plugins

- The excellent [Inline Tags](https://github.com/roman-r-m/joplin-inline-tags-plugin) plugin can help you add tags on the fly
- I created a fork for the [Rich Markdown](https://github.com/alondmnt/joplin-rich-markdown) plugin and updated the "Stylish" style to highlight inline tags in notes ([download](https://github.com/alondmnt/joplin-rich-markdown/releases/download/cm-rm-tag/plugin.calebjohn.rich-markdown.jpl))