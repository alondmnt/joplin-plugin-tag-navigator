import type { ContentScriptContext, MarkdownEditorContentScriptModule } from 'api/types';
import { EditorView } from '@codemirror/view';

// Content script module for editor commands
export default (context: ContentScriptContext): MarkdownEditorContentScriptModule => {
  return {
    plugin: (editorControl: any) => {
      if (!editorControl.cm6) { return; }

      // Get current line content and position
      editorControl.registerCommand('getCurrentLine', () => {
        const editor: EditorView = editorControl.editor;
        const state = editor.state;
        const cursor = state.selection.main.head;
        
        // Get the line number (0-based)
        const line = state.doc.lineAt(cursor);
        
        return {
          lineNumber: line.number - 1, // Convert to 0-based for consistency with plugin
          lineContent: line.text,
          cursorPosition: cursor,
          lineStart: line.from,
          lineEnd: line.to
        };
      });

      // Replace content in the current line
      editorControl.registerCommand('replaceCurrentLine', (newContent: string) => {
        const editor: EditorView = editorControl.editor;
        const state = editor.state;
        const cursor = state.selection.main.head;
        const line = state.doc.lineAt(cursor);

        // Calculate cursor position within the line
        const cursorPosInLine = cursor - line.from;
        
        // Replace the entire line with new content
        const transaction = state.update({
          changes: {
            from: line.from,
            to: line.to,
            insert: newContent
          },
          // Maintain cursor position relative to line, but don't go beyond new line length
          selection: {
            anchor: line.from + Math.min(cursorPosInLine, newContent.length)
          }
        });

        editor.dispatch(transaction);
        editor.focus();
        
        return {
          success: true,
          newLineNumber: line.number - 1,
          newContent: newContent
        };
      });

      // Get multiple lines content (for selection ranges)
      editorControl.registerCommand('getSelectedLines', () => {
        const editor: EditorView = editorControl.editor;
        const state = editor.state;
        const selection = state.selection.main;
        
        // Get start and end line numbers
        const startLine = state.doc.lineAt(selection.from);
        const endLine = state.doc.lineAt(selection.to);
        
        const lines = [];
        for (let i = startLine.number; i <= endLine.number; i++) {
          const line = state.doc.line(i);
          lines.push({
            lineNumber: i - 1, // Convert to 0-based
            lineContent: line.text,
            lineStart: line.from,
            lineEnd: line.to
          });
        }
        
        return {
          lines: lines,
          selectionStart: selection.from,
          selectionEnd: selection.to
        };
      });

      // Replace content in multiple lines
      editorControl.registerCommand('replaceSelectedLines', (newLines: string[]) => {
        const editor: EditorView = editorControl.editor;
        const state = editor.state;
        const selection = state.selection.main;
        
        // Get start and end line numbers
        const startLine = state.doc.lineAt(selection.from);
        const endLine = state.doc.lineAt(selection.to);
        
        // Build the replacement text
        const newContent = newLines.join('\n');
        
        // Replace from start of first line to end of last line
        const transaction = state.update({
          changes: {
            from: startLine.from,
            to: endLine.to,
            insert: newContent
          },
          // Position cursor at the end of the replacement
          selection: {
            anchor: startLine.from + newContent.length
          }
        });

        editor.dispatch(transaction);
        editor.focus();
        
        return {
          success: true,
          startLineNumber: startLine.number - 1,
          endLineNumber: endLine.number - 1,
          newContent: newContent
        };
      });
    },
  };
}; 