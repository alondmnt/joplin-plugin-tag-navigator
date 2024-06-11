import joplin from 'api';
import { SettingItemType } from 'api/types';
import { defTagRegex } from './parser';

export const queryStart = '<!-- itags-query-start -->';
export const queryEnd = '<!-- itags-query-end -->';
export const resultsStart = '<!-- itags-results-start -->';
export const resultsEnd = '<!-- itags-results-end -->';

export interface TagSettings {
  tagRegex: RegExp;
  excludeRegex: RegExp;
  ignoreHtmlNotes: boolean;
  ignoreCodeBlocks: boolean;
  inheritTags: boolean;
}

export async function getTagRegex(): Promise<RegExp> {
  const userRegex = await joplin.settings.value('itags.tagRegex');
  return userRegex ? new RegExp(userRegex, 'g') : defTagRegex;
}

export async function getTagSettings(): Promise<TagSettings> {
  const tagRegex = await getTagRegex();
  const excludeRegexString = await joplin.settings.value('itags.excludeRegex');
  const excludeRegex = excludeRegexString ? new RegExp(excludeRegexString, 'g') : null;
  const ignoreHtmlNotes = await joplin.settings.value('itags.ignoreHtmlNotes');
  const ignoreCodeBlocks = await joplin.settings.value('itags.ignoreCodeBlocks');
  const inheritTags = await joplin.settings.value('itags.inheritTags');

  return {tagRegex, excludeRegex, ignoreHtmlNotes, ignoreCodeBlocks, inheritTags};
}

export async function registerSettings() {
  await joplin.settings.registerSection('itags', {
    label: 'Tag Navigator',
    iconName: 'fas fa-dharmachakra',
  });
  await joplin.settings.registerSettings({
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
    'itags.inheritTags': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Tag inheritance',
      description: 'Inherit tags from parent items.',
    },
    'itags.periodicDBUpdate': {
      value: 5,
      type: SettingItemType.Int,
      minimum: 0,
      maximum: 120,
      section: 'itags',
      public: true,
      label: 'Search: Periodic inline tags DB update (minutes)',
      description: 'Periodically update the inline tags database (requires restart). Set to 0 to disable periodic updates.',
    },
    'itags.updateAfterSync': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Update inline tags DB after sync',
    },
    'itags.periodicNoteUpdate': {
      value: true,
      type: SettingItemType.Bool,
      section: 'itags',
      public: true,
      label: 'Search: Periodic update of results display in notes',
      description: 'You may disable this on a Joplin client to avoid conflicts with another client. The same time interval as above applies.'
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
    'itags.resultSort': {
      value: 'modified',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      label: 'Search: Sort by',
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
      label: 'Search: Sort order',
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
      label: 'Search: Colorize todos in results',
      description: 'Supporting [x]it! style todos.'
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
      section: 'itags',
      public: true,
      label: 'Periodic tag conversion (minutes)',
      description: 'Periodically convert all notes to Joplin tags (requires restart). Set to 0 to disable periodic updates.',
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
    'itags.minCount': {
      value: 1,
      type: SettingItemType.Int,
      minimum: 1,
      maximum: 20,
      section: 'itags',
      public: true,
      label: 'Minimum tag count',
      description: 'Minimum number of occurrences for a tag to be included.',
    },
    'itags.tagPrefix': {
      value: '#',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Tag prefix',
      description: 'Prefix for converted Joplin tags.',
    },
    'itags.listPrefix': {
      value: 'tags: ',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'List prefix',
      description: 'How the line with converted Joplin tags should begin (at least 3 chars long).',
    },
    'itags.location': {
      value: 'top',
      type: SettingItemType.String,
      section: 'itags',
      public: true,
      advanced: true,
      label: 'Location',
      description: 'Location for converted Joplin tags.',
      isEnum: true,
      options: {
        top: 'Top',
        bottom: 'Bottom',
      }
    },
  });
}