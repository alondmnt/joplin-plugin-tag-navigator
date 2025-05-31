import joplin from 'api';
import { SettingItemType } from 'api/types';
import { defTagRegex } from './parser';
import { escapeRegex } from './utils';

/**
 * Standard options for search panel settings
 */
export const STANDARD_SORT_OPTIONS = {
  modified: 'Modified',
  created: 'Created',
  title: 'Title',
  notebook: 'Notebook',
} as const;

export const STANDARD_ORDER_OPTIONS = {
  desc: 'Descending',
  asc: 'Ascending',
} as const;

export const STANDARD_GROUPING_OPTIONS = {
  heading: 'Group by heading / section',
  consecutive: 'Group consecutive lines',
  item: 'Split by item / paragraph',
} as const;

/**
 * Helper functions to get standard option keys
 */
export const getStandardSortKeys = (): string[] => Object.keys(STANDARD_SORT_OPTIONS);
export const getStandardOrderKeys = (): string[] => Object.keys(STANDARD_ORDER_OPTIONS);
export const getStandardGroupingKeys = (): string[] => Object.keys(STANDARD_GROUPING_OPTIONS);

/**
 * HTML comment markers for query sections
 */
export const queryStart = '<!-- itags-query-start -->';
export const queryEnd = '<!-- itags-query-end -->';
export const resultsStart = '<!-- itags-results-start -->';
export const resultsEnd = '<!-- itags-results-end -->';

/**
 * Configuration interface for tag processing and display
 */
export interface TagSettings {
  tagRegex: RegExp;        // Regular expression for matching tags
  excludeRegex: RegExp;    // Regular expression for excluding tags
  minCount: number;        // Minimum number of occurrences for a tag to be included
  colorTag: string;        // Tag for coloring the results in the search panel
  todayTagRegex: RegExp;   // Regex for today's date
  monthTagRegex: RegExp;   // Regex for month's date
  weekTagRegex: RegExp;    // Regex for week's date
  dateFormat: string;      // Format string for date tags
  monthFormat: string;     // Format string for month tags
  weekFormat: string;      // Format string for week tags
  weekStartDay: number;    // Day of week that starts the week (0=Sunday, 1=Monday, etc.)
  valueDelim: string;           // Character to assign a value to a tag
  spaceReplace: string;        // Character to replace spaces in tags
  tagPrefix: string;           // Prefix for converted Joplin tags
  ignoreHtmlNotes: boolean;    // Whether to ignore tags in HTML notes
  ignoreCodeBlocks: boolean;   // Whether to ignore tags in code blocks
  ignoreFrontMatter: boolean;  // Whether to ignore front matter fields as tags
  inheritTags: boolean;        // Whether to inherit tags from parent items
  nestedTags: boolean;         // Whether to support nested tag hierarchy
  fullNotebookPath: boolean;  // Whether to extract the full notebook path
}

export interface ResultSettings {
  resultSort: string;
  resultOrder: string;
  resultGrouping: string;
}

export interface NoteViewSettings {
  tableCase: string;           // Case formatting for table view
  tableColumns: number;        // Number of columns to show in the table view
  noteViewLocation: string;    // Location of results in the note view  
  noteViewColorTitles: boolean; // Whether to use color tags for titles in note view
  resultMarkerInNote: boolean;  // Whether to highlight filter results in the note view
  searchWithRegex: boolean;     // Whether to use regex for tag / note / content filtering
  updateViewOnOpen: boolean;    // Whether to update the view when opening a note
}

export interface ConversionSettings {
  tagPrefix: string;           // Prefix for converted Joplin tags
  spaceReplace: string;        // Character to replace spaces in converted Joplin tags
  listPrefix: string;          // Prefix for converted Joplin tags
  location: string;            // Location for converted Joplin tags
}

/**
 * Retrieves all tag-related settings
 * @returns TagSettings object containing all configuration
 */
export async function getTagSettings(): Promise<TagSettings> {
  const settings = await joplin.settings.values([
    'itags.tagRegex',
    'itags.excludeRegex',
    'itags.minCount',
    'itags.colorTag',
    'itags.todayTag', 
    'itags.monthTag',
    'itags.weekTag',
    'itags.dateFormat',
    'itags.monthFormat',
    'itags.weekFormat',
    'itags.weekStartDay',
    'itags.valueDelim',
    'itags.tagPrefix',
    'itags.spaceReplace',
    'itags.ignoreHtmlNotes',
    'itags.ignoreCodeBlocks',
    'itags.ignoreFrontMatter',
    'itags.inheritTags',
    'itags.nestedTags',
    'itags.tableNotebookPath',
  ]);
  const tagRegex = settings['itags.tagRegex'] ? new RegExp(settings['itags.tagRegex'] as string, 'g') : defTagRegex;
  const excludeRegex = settings['itags.excludeRegex'] ? new RegExp(settings['itags.excludeRegex'] as string, 'g') : null;

  let todayTag = (settings['itags.todayTag'] as string).trim().toLowerCase();
  if (todayTag.length == 0) {
    todayTag = '#today';  // Ensure default value
  }
  const todayTagRegex = new RegExp(`(${escapeRegex(todayTag)})([+-]?\\d*)`, 'g');

  let monthTag = (settings['itags.monthTag'] as string).trim().toLowerCase();
  if (monthTag.length == 0) {
    monthTag = '#month';  // Ensure default value
  }
  const monthTagRegex = new RegExp(`(${escapeRegex(monthTag)})([+-]?\\d*)`, 'g');

  let weekTag = (settings['itags.weekTag'] as string).trim().toLowerCase();
  if (weekTag.length == 0) {
    weekTag = '#week';  // Ensure default value
  }
  const weekTagRegex = new RegExp(`(${escapeRegex(weekTag)})([+-]?\\d*)`, 'g');

  return {
    tagRegex,
    excludeRegex,
    minCount: settings['itags.minCount'] as number || 1,
    colorTag: settings['itags.colorTag'] as string || '#color=',
    todayTagRegex,
    monthTagRegex,
    weekTagRegex,
    dateFormat: settings['itags.dateFormat'] as string || '#yyyy-MM-dd',
    monthFormat: settings['itags.monthFormat'] as string || '#yyyy-MM',
    weekFormat: settings['itags.weekFormat'] as string || '#yyyy-MM-dd',
    weekStartDay: parseInt(settings['itags.weekStartDay'] as string) || 0,
    valueDelim: settings['itags.valueDelim'] as string || '=',
    tagPrefix: settings['itags.tagPrefix'] as string || '#',
    spaceReplace: settings['itags.spaceReplace'] as string || '_',
    ignoreHtmlNotes: settings['itags.ignoreHtmlNotes'] as boolean,
    ignoreCodeBlocks: settings['itags.ignoreCodeBlocks'] as boolean,
    ignoreFrontMatter: settings['itags.ignoreFrontMatter'] as boolean,
    inheritTags: settings['itags.inheritTags'] as boolean,
    nestedTags: settings['itags.nestedTags'] as boolean,
    fullNotebookPath: settings['itags.tableNotebookPath'] as boolean,
  };
}

export async function getResultSettings(): Promise<ResultSettings> {
  const settings = await joplin.settings.values([
    'itags.resultSort',
    'itags.resultOrder',
    'itags.resultGrouping',
  ]);
  return {
    resultSort: settings['itags.resultSort'] as string || 'modified',
    resultOrder: settings['itags.resultOrder'] as string || 'desc',
    resultGrouping: settings['itags.resultGrouping'] as string || 'heading',
  };
}

export async function getNoteViewSettings(): Promise<NoteViewSettings> {
  const settings = await joplin.settings.values([
    'itags.tableCase',
    'itags.tableColumns',
    'itags.noteViewLocation',
    'itags.noteViewColorTitles',
    'itags.resultMarkerInNote',
    'itags.searchWithRegex',
    'itags.updateViewOnOpen',
  ]);
  return {
    tableCase: settings['itags.tableCase'] as string || 'title',
    tableColumns: settings['itags.tableColumns'] as number || 10,
    noteViewLocation: settings['itags.noteViewLocation'] as string || 'before',
    noteViewColorTitles: settings['itags.noteViewColorTitles'] as boolean,
    resultMarkerInNote: settings['itags.resultMarkerInNote'] as boolean,
    searchWithRegex: settings['itags.searchWithRegex'] as boolean,
    updateViewOnOpen: settings['itags.updateViewOnOpen'] as boolean,
  };
}

export async function getConversionSettings(): Promise<ConversionSettings> {
  const settings = await joplin.settings.values([
    'itags.tagPrefix',
    'itags.spaceReplace',
    'itags.listPrefix',
    'itags.location',
  ]);
  return {
    tagPrefix: settings['itags.tagPrefix'] as string || '#',
    spaceReplace: settings['itags.spaceReplace'] as string || '_',
    listPrefix: settings['itags.listPrefix'] as string || 'tags: ',
    location: settings['itags.location'] as string || 'top',
  };
}

/**
 * Registers all plugin settings with Joplin
 * Configures settings section and individual setting items
 */
export async function registerSettings(): Promise<void> {
  await joplin.settings.registerSection('itags', {
    label: 'Tag Navigator',
    iconName: 'fas fa-dharmachakra',
  });

  await joplin.settings.registerSettings({
    'itags.releaseNotes': {
      value: '',
      type: SettingItemType.String,
      section: 'itags',
      public: false,
      label: 'Release notes',
      description: 'Keeps track of the last release notes that were shown to the user.',
    },
    'itags.ignoreHtmlNotes': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Ignore HTML notes',
      description: 'Ignore inline tags in HTML notes.',
    },
    'itags.ignoreCodeBlocks': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Ignore code blocks',
      description: 'Ignore inline tags in code blocks.',
    },
    'itags.ignoreFrontMatter': {
      value: false,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Ignore front matter',
      description: 'Front matter fields are treated as tags by default.',
    },
    'itags.inheritTags': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Tag inheritance',
      description: 'Inherit tags from parent items, from headings, and from YAML front matter.',
    },
    'itags.nestedTags': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Nested tag hierarchy',
      description: 'Support nested tags in the form of #parent/child (up to infinite nesting levels).',
    },
    'itags.periodicDBUpdate': {
      value: 0,
      type: SettingItemType.Int,
      minimum: 0,
      maximum: 120,
      step: 5,
      section: 'itags',
      public: true,
      label: 'Database: Periodic inline tags DB update (minutes)',
      description: 'Periodically update the inline tags database. Set to 0 to disable periodic updates. (Requires restart)',
    },
    'itags.updateAfterSync': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Database: Update inline tags DB after sync',
    },
    'itags.periodicNoteUpdate': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Database: Periodic update of tag search view in notes',
      description: 'You may disable this on a Joplin client to avoid conflicts with another client. The same time interval as above applies.'
    },
    'itags.navPanelScope': {
      value: 'global',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      label: 'Navigation: Panel scope',
      description: 'Navigation: Show all tags, or tags in the current note. Default: All tags.',
      isEnum: true,
      options: {
        global: 'All tags',
        note: 'Note tags',
      }
    },
    'itags.navPanelSort': {
      value: 'name',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      label: 'Navigation: Tag sort by',
      isEnum: true,
      options: {
        name: 'Name',
        count: 'Count',
      }
    },
    'itags.navPanelStyle': {
      value: '',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Navigation: Panel style',
      description: 'Custom CSS for the navigation panel (toggle panel or restart app).',
    },
    'itags.waitForNote': {
      value: 1000,
      type: SettingItemType.Int,
      minimum: 0,
      maximum: 10000,
      step: 100,
      section: 'itags',
      public: true,
      label: 'Search: Wait for note period (ms)',
      description: 'Wait period for the note to be opened before scrolling to the tag. Default: 1000.',
    },
    'itags.toggleEditor': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: (Mobile app) Open notes in edit mode',
      description: 'Editor is required for scrolling to the correct line in the note.',
    },
    'itags.selectMultiTags': {
      value: 'first',
      type: SettingItemType.String,
      isEnum: true,
      section: 'itags',
      public: true,
      label: 'Search: When multiple tags are matched:',
      description: 'Add the first / all / none from the list of tags to the search query when Enter is pressed',
      options: {
        first: 'Add first to query',
        all: 'Add all to query',
        none: 'Add none to query',
        insert: 'Insert first in editor',
      }
    },
    'itags.searchWithRegex': {
      value: false,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Use regex for tag / note / content filtering',
    },
    'itags.tableNotebookPath': {
      value: false,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Extract the full notebook path',
      description: 'The full path can be used to filter results, and will also be shown in the table view.'
    },
    'itags.showQuery': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Show tag list and search query section',
    },
    'itags.expandedTagList': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Show expanded tag list',
    },
    'itags.showTagRange': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Show tag range section',
    },
    'itags.showNotes': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Show note mentions section',
    },
    'itags.showResultFilter': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Show results filter section',
    },
    'itags.tagSort': {
      value: 'name',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      label: 'Search: Tag sort by',
      isEnum: true,
      options: {
        name: 'Name',
        count: 'Count',
      }
    },
    'itags.resultGrouping': {
      value: 'heading',
      public: true,
      type: SettingItemType.String,
      isEnum: true,
      section: 'itags',
      label: 'Search: Result grouping',
      description: 'Each group is shown as a section within a note in the search results. Groups can be filtered and sorted.',
      options: STANDARD_GROUPING_OPTIONS
    },
    'itags.resultSort': {
      value: 'modified',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      label: 'Search: Result sort by',
      isEnum: true,
      options: STANDARD_SORT_OPTIONS
    },
    'itags.resultOrder': {
      value: 'desc',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      label: 'Search: Result sort order',
      isEnum: true,
      options: STANDARD_ORDER_OPTIONS
    },
    'itags.resultToggle': {
      value: false,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Collapse results',
    },
    'itags.colorTodos': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Colorise todos in results',
      description: 'Supporting [x]it! style todos.'
    },
    'itags.resultMarker': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Highlight filter / tag results',
    },
    'itags.resultMarkerInNote': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Note view: Highlight filter results',
    },
    'itags.noteViewColorTitles': {
      value: false,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Note view: Display colors',
      description: 'Use color tags for titles in note view.',
    },
    'itags.updateViewOnOpen': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Note view: Update view when opening note',
    },
    'itags.noteViewLocation': {
      value: 'before',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      label: 'Note view: Location of results',
      isEnum: true,
      options: {
        before: 'Before the query',
        after: 'After the query',
      }
    },
    'itags.tableColumns': {
      value: 10,
      type: SettingItemType.Int,
      minimum: 0,
      maximum: 20,
      step: 1,
      section: 'itags',
      public: true,
      label: 'Note view: Table view columns',
      description: 'Number of columns to show in the table view. Set to 0 to show all.',
    },
    'itags.tableCase': {
      value: 'title',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      label: 'Note view: Tag case in table view',
      isEnum: true,
      options: {
        title: 'Title Case',
        lower: 'lowercase',
      }
    },
    'itags.searchPanelStyle' : {
      value: '',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Search: Panel style',
      description: 'Custom CSS for the search panel (toggle panel or restart app).',
    },
    'itags.periodicConversion': {
      value: 0,
      type: SettingItemType.Int,
      minimum: 0,
      maximum: 120,
      step: 5,
      section: 'itags',
      public: true,
      label: 'Periodic tag conversion (minutes)',
      description: 'Periodically convert all notes to Joplin tags. Set to 0 to disable periodic updates. (Requires restart)',
    },
    'itags.enableTagTracking': {
      value: false,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Tag conversion tracking',
      description: 'Track converted tags for intelligent cleanup when removing / modifying inline tags.',
    },
    'itags.tagRegex': {
      value: '',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Tag regex',
      description: 'Custom regex to match tags. Leave empty to use the default regex.',
    },
    'itags.excludeRegex': {
      value: '',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Exclude regex',
      description: 'Custom regex to exclude tags. Leave empty to not exclude any.',
    },
    'itags.todayTag': {
      value: '#today',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Date tags: Today',
      description: 'Use this tag to tag or find notes relative to today\'s date. Usage: #today, #today+1, #today-5',
    },
    'itags.monthTag': {
      value: '#month',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Date tags: Month',
      description: 'Use this tag to tag or find notes relative to the current month. Usage: #month, #month+1, #month-5',
    },
    'itags.weekTag': {
      value: '#week',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Date tags: Week',
      description: 'Use this tag to tag or find notes relative to the current week. Usage: #week, #week+1, #week-5',
    },
    'itags.dateFormat': {
      value: '#yyyy-MM-dd',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Date tags: Date format',
      description: 'Format for date tags. Default: #yyyy-MM-dd. See https://date-fns.org/docs/format for options.',
    },
    'itags.monthFormat': {
      value: '#yyyy-MM',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Date tags: Month format',
      description: 'Format for month tags. Default: #yyyy-MM. See https://date-fns.org/docs/format for options.',
    },
    'itags.weekFormat': {
      value: '#yyyy-MM-dd',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Date tags: Week format',
      description: 'Format for week tags. Default: #yyyy-MM-dd. See https://date-fns.org/docs/format for options.',
    },
    'itags.weekStartDay': {
      value: 0,
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      label: 'Date tags: Week start day',
      description: 'Day of week that starts the week. Default: Sunday.',
      isEnum: true,
      options: {
        '0': 'Sunday',
        '1': 'Monday',
        '2': 'Tuesday',
        '3': 'Wednesday',
        '4': 'Thursday',
        '5': 'Friday',
        '6': 'Saturday',
      }
    },
    'itags.colorTag': {
      value: '#color=',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Color tag',
      description: 'Tag to use for coloring the results in the search panel. HTML colors are supported. Default: #color=. Example: #color=DarkSeaGreen, or #color=rgb(143, 188, 139)',
    },
    'itags.resultColorProperty': {
      value: 'border',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Search: Use color to set result:',
      isEnum: true,
      options: {
        border: 'Border',
        background: 'Background',
      }
    },
    'itags.minCount': {
      value: 1,
      type: SettingItemType.Int,
      minimum: 1,
      maximum: 20,
      step: 1,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Minimum tag count',
      description: 'Minimum number of occurrences for a tag to be included. Default: 1.',
    },
    'itags.valueDelim': {
      value: '=',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Tag value delimiter',
      description: 'Character to assign a value to a tag. Default: =. Example: #tag=value',
    },
    'itags.tagPrefix': {
      value: '#',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Tag prefix',
      description: 'Prefix for converted Joplin tags. Default: #.',
    },
    'itags.spaceReplace': {
      value: '_',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Space replacement',
      description: 'Character to replace spaces in converted Joplin tags. Default: _.',
    },
    'itags.listPrefix': {
      value: 'tags: ',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'List prefix',
      description: 'How the line with converted Joplin tags should begin (at least 3 chars long). Default: "tags: ".',
    },
    'itags.location': {
      value: 'top',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Location',
      description: 'Location for converted Joplin tags. Default: top.',
      isEnum: true,
      options: {
        top: 'Top',
        bottom: 'Bottom',
      }
    },
    'itags.toolbarToggleNoteView': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Toolbar: Toggle note view button',
      description: '(Requires restart)',
    },
    'itags.toolbarRefreshNoteView': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Toolbar: Refresh note view button',
      description: '(Requires restart)',
    },
    'itags.toolbarNewTableEntry': {
      value: false,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Toolbar: New table entry button',
      description: '(Requires restart)',
    },
    'itags.toolbarReplaceDateTags': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Toolbar: Replace date tags button',
      description: '(Requires restart)',
    },
  });
}