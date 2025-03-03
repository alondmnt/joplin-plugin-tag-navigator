import joplin from 'api';
import { SettingItemType } from 'api/types';
import { defTagRegex } from './parser';
import { escapeRegex } from './utils';

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
  todayTagRegex: RegExp; // Regex for today's date
  dateFormat: string;      // Format string for date tags
  ignoreHtmlNotes: boolean;    // Whether to ignore tags in HTML notes
  ignoreCodeBlocks: boolean;   // Whether to ignore tags in code blocks
  ignoreFrontMatter: boolean;  // Whether to ignore front matter fields as tags
  inheritTags: boolean;        // Whether to inherit tags from parent items
  nestedTags: boolean;         // Whether to support nested tag hierarchy
  spaceReplace: string;        // Character to replace spaces in tags
  valueDelim: string;           // Character to assign a value to a tag
  tagPrefix: string;           // Prefix for converted Joplin tags
  tableCase: string;           // Case formatting for table view
}

/**
 * Retrieves the configured tag regex pattern
 * @returns RegExp pattern for matching tags
 */
export async function getTagRegex(): Promise<RegExp> {
  const userRegex = await joplin.settings.value('itags.tagRegex');
  return userRegex ? new RegExp(userRegex, 'g') : defTagRegex;
}

/**
 * Retrieves all tag-related settings
 * @returns TagSettings object containing all configuration
 */
export async function getTagSettings(): Promise<TagSettings> {
  const tagRegex = await getTagRegex();
  const excludeRegexString = await joplin.settings.value('itags.excludeRegex');
  const excludeRegex = excludeRegexString ? new RegExp(excludeRegexString, 'g') : null;
  
  let todayTag = (await joplin.settings.value('itags.todayTag')).toLowerCase();
  if (todayTag.length == 0) {
    todayTag = '#today';  // Ensure default value
  }
  const todayTagRegex = new RegExp(`(${escapeRegex(todayTag)})([+-]?\\d*)`, 'g');
  const valueDelim = await joplin.settings.value('itags.valueDelim');

  return {
    tagRegex,
    excludeRegex,
    todayTagRegex,
    dateFormat: await joplin.settings.value('itags.dateFormat'),
    ignoreHtmlNotes: await joplin.settings.value('itags.ignoreHtmlNotes'),
    ignoreCodeBlocks: await joplin.settings.value('itags.ignoreCodeBlocks'),
    ignoreFrontMatter: await joplin.settings.value('itags.ignoreFrontMatter'),
    inheritTags: await joplin.settings.value('itags.inheritTags'),
    nestedTags: await joplin.settings.value('itags.nestedTags'),
    spaceReplace: await joplin.settings.value('itags.spaceReplace'),
    valueDelim: valueDelim ? valueDelim : '=',
    tagPrefix: await joplin.settings.value('itags.tagPrefix'),
    tableCase: await joplin.settings.value('itags.tableCase')
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
    'itags.resultSort': {
      value: 'modified',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      label: 'Search: Result sort by',
      isEnum: true,
      options: {
        modified: 'Modified',
        created: 'Created',
        title: 'Title',
        notebook: 'Notebook',
      }
    },
    'itags.resultOrder': {
      value: 'desc',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      label: 'Search: Result sort order',
      isEnum: true,
      options: {
        desc: 'Descending',
        asc: 'Ascending',
      }
    },
    'itags.resultToggle': {
      value: false,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Collapse results',
    },
    'itags.resultMarker': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Highlight results',
    },
    'itags.colorTodos': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Colorise todos in results',
      description: 'Supporting [x]it! style todos.'
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
    'itags.dateFormat': {
      value: '#yyyy-MM-dd',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Date tags: Date format',
      description: 'Format for date tags. Default: #yyyy-MM-dd. See https://date-fns.org/docs/format for options.',
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
  });
}