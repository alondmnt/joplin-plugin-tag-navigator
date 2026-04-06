/** Minimal mock of api/types for unit tests. */
export enum SettingItemType {
  Int = 1,
  String = 2,
  Bool = 3,
}

export enum ContentScriptType {
  MarkdownItPlugin = 'markdownItPlugin',
  CodeMirrorPlugin = 'codeMirrorPlugin',
}

export enum ToolbarButtonLocation {
  NoteToolbar = 'noteToolbar',
  EditorToolbar = 'editorToolbar',
}
