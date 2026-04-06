/** Minimal mock of the Joplin plugin API for unit tests. */
const joplin = {
  data: {
    get: jest.fn(),
    put: jest.fn(),
  },
  settings: {
    value: jest.fn(),
    values: jest.fn(),
    setValue: jest.fn(),
    onChange: jest.fn(),
    registerSettings: jest.fn(),
    registerSection: jest.fn(),
  },
  views: {
    panels: {
      create: jest.fn(),
      show: jest.fn(),
      hide: jest.fn(),
      visible: jest.fn(),
      onMessage: jest.fn(),
      postMessage: jest.fn(),
    },
    dialogs: {
      showMessageBox: jest.fn(),
    },
    toolbarButtons: {
      create: jest.fn(),
    },
  },
  workspace: {
    selectedNote: jest.fn(),
    onNoteChange: jest.fn(),
    onNoteSelectionChange: jest.fn(),
    onSyncComplete: jest.fn(),
  },
  commands: {
    register: jest.fn(),
    execute: jest.fn(),
  },
  contentScripts: {
    register: jest.fn(),
  },
  plugins: {
    register: jest.fn(),
  },
};

export default joplin;
