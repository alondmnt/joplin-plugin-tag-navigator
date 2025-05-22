# ☸️ Inline Tag Navigator

[![DOI](https://zenodo.org/badge/753598497.svg)](https://zenodo.org/doi/10.5281/zenodo.10701718) ![downloads](https://img.shields.io/badge/dynamic/json?color=brightgreen&label=downloads&query=%24.totalDownloads&url=https%3A%2F%2Fjoplin-plugin-downloads.vercel.app%2Fapi%3Fplugin%3Djoplin.plugin.alondmnt.tag-navigator)

Type inline #tags or front matter in the note editor. View your tagged paragraphs and tasks / TODOs in a search panel, or in a generated note. Build a table view / database from notes and tags. Convert between Obsidian tags and Joplin tags.

[Community discussion thread](https://discourse.joplinapp.org/t/plugin-inline-tag-navigator-v0-8-0-2024-06-26/35726)

[Release notes](CHANGELOG.md)

- [Features](#features)
- [Demos](#demos)
- [Tips](#tips)
- [Companion plugins](#companion-plugins)
- [Motivation](#motivation)
- [Objectives](#objectives)

## Features

This plugin adds inline tag support (such as #inline-tag) to [Joplin](https://joplinapp.org) in five ways:

1. It adds a panel for searching and viewing tagged paragraphs across all your notes. ([video](https://www.youtube.com/watch?v=im0zjQFoXb0))
    - **Search queries**: Search tags using logical operators (AND, OR, NOT), and using free text in the note, title, or notebook name / path.
    - **Save search queries** in notes and sync them across device. ([video](https://www.youtube.com/watch?v=GuzCwYxyYZ0))
    - **Tag-by-notes:** Search for links or [[wikilinks]] to notes (including backlinks to the current note).
    - **Tag in front matter:** All Markdown front matter fields can be treated as tags. ([video](https://www.youtube.com/watch?v=L3zHletRk54), [tips](#front-matter-tags))
    - **Edit tags:** Add, replace and remove inline tags via the panel context menu (right-click on a tag).
    - **Insert tags** from the panel into the note editor. ([tips](#tag-insertion))
    - **Toggle checkboxes** / TODOs from the panel, including [[x]it! style](https://xit.jotaen.net) checkboxes (click, or right-click for 6 task states). ([tips](#inline-todos))
    - **Nested tags** hierarchy: Search parent tags to find the locations of their children. Example: #parent/child. ([video](https://www.youtube.com/watch?v=h-HdX7npbIw))
    - **Tag values**: Assign values to tags. Example: #tag=value. ([tips](#tag-values))
    - **Tag ranges**: Search for a range of tags, according to their lexicographic order. Example: #2024/07 -> #2024/08. ([tips](#tag-ranges))
    - **Today's date**: Search tags by today's date. Examples: #today, #today+1 (tomorrow), #today-10 (ten days ago). ([tips](#tag-ranges))
    - **Colour tags**: Use colour tags to highlight results in the search panel. Example: #color=red. ([tips](#colour-tags))
2. It can generate a note with all tagged paragaraphs that match a saved query (dynamically updated). ([video](https://www.youtube.com/watch?v=GuzCwYxyYZ0))
    - Save a query in a note, and switch note view on: `Tools --> Tag Navigator --> Toggle search results display in note` .
    - Display results:
        - In a sections (similarly to the the panel).
        - In a table / database. ([video](https://www.youtube.com/watch?v=L3zHletRk54), [tips](#table-views))
        - In a kanban board. ([tips](#kanban-views))
3. It adds a panel for quickly navigating between inline tags that appear in the current note, or in all notes ([video](https://www.youtube.com/watch?v=h-HdX7npbIw)).
4. It can convert your existing inline tags to native Joplin tags, so that they are accessible using Joplin's built-in tag search.
5. It can convert your existing native Joplin tags to inline tags, so that they are accessible using inline tag search (this plugin). ([tips](#converting-joplin-tags))

After installing the plugin, check the commands listed under `Tag Navigator` in the `Tools` menu, as well as the corresponding settings section.

## Demos

- [Inline tag search](#inline-tag-search)
- [Saved search queries](#saved-search-queries)
- [Table view / database](#table-view--database)
- [Navigation panel](#navigation-panel)
- [Tag insertion](#tag-insertion)

### Inline tag search

<img src="img/tag-navigator-search.gif" width="80%" title="search panel demo">

### Saved search queries

<img src="img/tag-navigator-queries.gif" width="80%" title="saved search queries demo">

### Table view / database

<img src="img/tag-navigator-table.gif" width="80%" title="table view demo">

### Navigation panel

<img src="img/tag-navigator-panel.gif" width="80%" title="navigation panel demo">

## Tips

- [Troubleshooting](#troubleshooting)
- [Custom tag definitions](#custom-tag-definitions)
- [Tag insertion](#tag-insertion)
- [Tag ranges](#tag-ranges)
- [Tag values](#tag-values)
- [Front matter tags](#front-matter-tags)
- [Table views](#table-views)
- [Kanban views](#kanban-views)
- [Filtering results](#filtering-results)
- [Inline TODOs](#inline-todos)
- [Colour tags](#colour-tags)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Converting Joplin tags](#converting-joplin-tags)

### Troubleshooting

- If any of the actions on note results does not work (toggling checkboxes, editing tags), this is usually resolved by a database update (Ctrl+Shift+D).

### Custom tag definitions

- The definition of a "tag" can be adjusted with user-defined regular expressions (see the advanced setting `Tag regex`).
    - Example: Every word in the text may be defined as a tag using a custom regex such as `[A-Za-z0-9]+[\w]*`.
- You may also define an exclusion rule to ignore certain tags (see the advanced setting `Exclude regex`).
    - Example: Numeric (`#123`) or hexanumeric (`#C0FF1E`) tags can be filtered using an exclusion regex such as `#(\d+|[a-fA-F0-9]{6})$`.

### Tag insertion

- You may insert a tag into the note editor by:
    - Starting to type a tag in the search panel, and pressing `Shift+Enter`.
    - Right-clicking on a tag in the search panel, and selecting `Insert tag`.

### Tag ranges

- Tag ranges can be used to search for a range of tags, according to their lexicographic order.
    - Example: `#2024/07 -> #2024/08` will search for all tags starting with `#2024/07` and up to `#2024/08` (inclusive, i.e., returning two months).
- You may also use ranges with the `*` wildcard to search for tags starting with a certain prefix or ending with a suffix.
    - Example: `#prefix* ->` will search for all tags starting with `#prefix`.
    - Example: `*suffix ->` will search for all tags ending with `suffix`.
- Tag ranges can be inserted using the "Tag range" input boxes, or by right-clicking on a tag in the query area, and selecting `Edit query`.
    - Example: Edit a tag or tag range and type `#prefix* ->` to search for all tags starting with `#prefix`.
    - If you type only `#prefix`, the query will be converted to a standard tag search (matching only the tag `#prefix`).
- Tag ranges can be used to search for tags by today's date.
    - Example: `#today ->` will search for all tags starting with `#today`.
    - Example: `#today -> #today+1` will search for all tags starting with `#today` and up to `#today+1` (inclusive, i.e., returning two days).

### Tag values

Tag values are a bit similar to nested tags as multiple parts of the tag are treated separately, but are distinct from them as explained below.

- Nested tags like `#parent/child` are shown as two separate tags in panels: `#parent` and `#parent/child`.
- Tag values like `#parent=value` are shown as a single tag in panels: `#parent`.
    - This is useful when you wish to assign many different values to a single tag, and prefer to avoid displaying all of them.
- As with nested tags, you may search for `#parent`, and may also search for `#parent=value`, or use tag ranges.
    - In order to search for a tag value, right-click on a tag in the query area, and select `Edit query`.
    - You may then add the `=` operator to the tag, and enter the value you would like to search for.
- The value operator can be customised in the plugin settings.
- It should also be noted that while nested tags are widely used in note apps, tag values are less common.

### Front matter tags

For example, the following YAML front matter, when inserted at the top of the note:

```yaml
---
nested: tag with spaces
arrayed: [v1, v2, v3]
tags:
  - tag1
  - tag2
---
```

will be converted to the following inline tags and values:

```text
#nested=tag_with_spaces
#arrayed=v1
#arrayed=v2
#arrayed=v3
#tag1
#tag2
#frontmatter
```

These tags will be accessible in the search panel / notes / tables like standard inline tags. The last tag is `#frontmatter` and is used to indicate that the tags were extracted from the front matter section of the note.

### Table views

- To enable table view, start by [saving a query](#saved-search-queries). Next, select `Tools --> Tag Navigator --> Toggle search results display in note` (or the corresponding toolbar button) until the saved query shows the property `"displayInNote": "table"` and a table appears.
- Quickly add new entries to the table by clicking on `New table entry note` in the context menu, toolbar, or Tag Navigator menu.
    - The new note will contain a [front matter](#front-matter-tags) template with properties for each column.
- Tables can be customised using the following settings:
    - `Note view: Table view columns`: Set the default number of columns (most common ones) to display in the table view.
    - `Search: Extract the full notebook path`: Enable this to display the notebook path in the table view, and to allow [filtering results](#filtering-results) by this path.
    - `Note view: Note view: Tag case in table view`: Set to "Title Case" / "lowercase".
- Tables can be customised per note using the saved query, by adding an `options` field with any of the following properties:
    - `includeCols`
        - a comma-separated list of columns (tags / properties) to display in the table view
        - can be used to slice the table columns, sort them, or add "modified" / "created" timestamps
    - `excludeCols`
        - a comma-separated list of columns to remove from the table view (even though these properties exist in the listed notes)
    - `sortBy`
        - a comma-separated list of columns to sort the table by
    - `sortOrder`
        - a comma-separated list of the words "ascending" / "descending" (or "desc", "descend", etc.) corresponding to the columns in the `sortBy` field
    - Example for a saved query:

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

### Kanban views

- To enable kanban view, start by [saving a query](#saved-search-queries). Next, select `Tools --> Tag Navigator --> Toggle search results display in note` (or the corresponding toolbar button) until the saved query shows the property `"displayInNote": "kanban"` and a kanban board appears.
- The kanban board organises tasks by their checkbox state:
    - `- [ ]` Open tasks
    - `- [@]` Ongoing tasks 
    - `- [?]` Tasks in question
    - `- [!]` Blocked tasks
    - `- [x]` Done tasks
    - `- [~]` Obsolete tasks
- The kanban note is read only.
    - Tasks can be moved between states by clicking on the checkbox in the search panel.
    - Like other note views, it updates automatically as you modify tasks in your notes.
        - When you open the kanban note;
        - Or when you press `Note view: Refresh` (Ctrl + Shift + R).
- You may use the [YesYouKan](https://joplinapp.org/plugins/plugin/org.joplinapp.plugins.YesYouKan/) plugin to visualise the note as a kanban board.

### Filtering results

- Text entered in the results filter (on the panel or in a saved query) can be used to search within title of the notes, their notebook name / path, or the content of the displayed results.
- To gain more control over filtering by notebook, you may enable the setting `Search: Extract the full notebook path`.
    - Example: Limit results to a notebook that appears in the top level by searching for `|/topNotebook`.
    - Example: Search for `topNotebook/childNotebook` to show only results from childNotebook.
- You may enable `Search: Use regex for tag / note / content filtering` to filter using regular expressions.

### Inline TODOs

- Filter results by pending tasks (`"- [ ]"`) or ones done (`"- [x]"`).
- Add support for [additional tags](https://github.com/CalebJohn/joplin-inline-todo?tab=readme-ov-file#confluence-style) for @mentions, +projects and //due-dates using a custom tag regex such as `(?<=^|\s)([#@+]|\/\/)([^\s#@+'",.()\[\]:;\?\\]+)`.
- Supported additional checkbox styles (inspired by `[x]it!`).
    - Set any of them to done by clicking the checkbox in the search panel.

![custom checkboxes](img/checkboxes.png)

- Toggle between all states by right-clicking on a checkbox.

![checkbox commands](img/checkboxes-commands.png)

- You may increase the checkbox size on smaller screens by setting `Search: Panel style` with the CSS `.itags-search-checkbox { width: 18px; height: 18px; font-size: 18px }` (adjust as needed).
- Furthermore, every checkbox in the text (even ones that are not tagged by any inline #tag) may be defined as a tag using a custom regex such as `(?<=^|\s)(#([^\s#'",.()\[\]:;\?\\]+)|(\-\s\[[x\s@\?!~]\]))`.
    - You may then use queries to search for tag-tasks based on their state (`- [ ]`, `- [x]`, `- [@]`, ...).

### Colour tags

- Colour tags can be used to highlight results in the search panel, e.g., according to their priority.
    - Example: `#color=MediumSeaGreen`, `#color=#008080` or `#color=rgb(0, 128, 128)`.
    - HTML colour names are supported.
- You may customise the colour tag in the plugin settings.
    - Example: Set it to be `#priority/`, and then tag by `#priority/red`.
- You may select whether to paint the background or the border of the results with the selected colour.
- Set the colour of an entire note by tagging one of its first 2 lines with the colour tag.
- Different sections of the same note may be tagged with different colours. They will be displayed separately in the panel (see an example below).

![colour tags](img/tag-navigator-colours.png)

### Keyboard shortcuts

- Default command shortcuts
    - These can be set up in Joplin's keyboard shortcut settings.

| Key | Action |
| --- | ------ |
| Ctrl + Shift + T | Toggle search panel |
| Ctrl + Shift + I | Focus on search panel (search tag / insert tag) |
| Ctrl + Shift + R | Refresh the current note view |
| Ctrl + Shift + D | Update tag database |
| Ctrl + Shift + L | Load search query from current note |

- Tag / note filter (search panel) shortcuts

| Key | Action |
| --- | ------ |
| Enter | Add tag(s) / note to query / note (see config) |
| Shift + Enter | Insert first tag to note |
| 2nd Enter | Search notes based on current query |
| Delete | Remove last added tag / note from query |
| Esc | Clear the filter (display all tags / notes) |
| 2nd Esc | Return to note editor |
| Arrow-Down | Toggle negation of last tag / note in query |
| Arrow-Up | Toggle last operator AND <--> OR |

### Converting Joplin tags

1. It is recommended (as for any other plugin), before converting all notes:
    - Test a few individual notes (one command above the all-note conversion).
    - Backup your note database.
2. If you would like organise your tags hierarchically (using nested tags) rename your Joplin tags first, before the conversion.
    - Example: `#child` -> `#parent/child`
    - You may also choose to rename your inline tags after the conversion, using the plugin's `Replace all` command. However, this will create a divergence between your inline and Joplin tags.
3. Select your preferred conversion settings.
    - Converted inline tags will appear at the top / bottom depending on the `Location` advanced setting.
    - Converted inline tags will have the prefix # depending on the `Tag prefix` advanced setting.
    - The list of converted inline tags will begin with the text 'tags: ' depending on the `List prefix` advanced setting.
    - Spaces in Joplin tags will be converted to inline tags depending on the `Space replacement` advanced setting. When converting inline tags back to Joplin spaces will be introduced back to tags. For example: [Joplin: `tag with space`] -> [inline: `#tag_with_space`] -> [Joplin: `tag with space`]
4. After the conversion all Joplin tags remain assigned to their notes. They are not deleted, and only a single line of text is added to each note.

## Companion plugins

- The excellent [Inline Tags](https://github.com/roman-r-m/joplin-inline-tags-plugin) plugin can autocomplete tags while typing.
- You can highlight tags in the Markdown editor using [Rich Markdown](https://github.com/CalebJohn/joplin-rich-markdown) (version ≥ 0.14).
    - In `Joplin settings --> Rich Markdown --> Advanced Settings --> Custom classes JSON` enter:
    ```
    [{"name": "rm-tag", "regex": "(?<=^|\\s)#([^\\s#'\",.()\\[\\]:;\\?\\\\]+)"}]
    ```
    - In `Joplin settings --> Appearance --> Custom stylesheet for Joplin-wide app styles` add the following to the style sheet:
    ```
    div.CodeMirror .cm-rm-tag {
        background-color: #7698b3;
        color: white !important;
        padding: 0em 2px;
        border-radius: 5px;
        display: inline;
    }
    ```
    - On the mobile app, since it is impossible to edit the stylesheet, one could install this [Rich Markdown fork](https://github.com/alondmnt/joplin-rich-markdown/releases/tag/v0.15-mobile-style-v4) (with predefined support for tags and checkboxes) or instead define the name of the tag class to be `"name": "searchMatch"`. This will use the same highlighting style as Joplin search results.

## Motivation

- Notes are arguably the atomic blocks of information in [Joplin](https://joplinapp.org). They can be linked to, tagged, and come up in search results. Joplin is optimised for this, and these features are pretty efficient.
- However, among 100s-1000s of long-form notes (that are hardly "atomic"), it remains challenging to find a small piece of information, idea, or memory.
- Tags can be especially helpful in distinguishing between the content of a text (what it's about) and its form or function (what type of text it is or what purpose it serves). The first is more easily captured by traditional or [semantic search](https://github.com/alondmnt/joplin-plugin-jarvis). The latter can be conveniently captured by tags, such as #concept, #plan, #memory, #realisation, #idea, #review, #bug, #feature, and others.
- I'd like to experiment here with information retrieval from single paragraphs, or outline items, as atomic blocks of information, using inline tags.

## Objectives

1. Be able to tag and efficiently search single paragraphs among all notes, using tags and free text.
2. Browse the entire content of these paragraphs without having to open each note.
3. Make this accessible and user-friendly.
