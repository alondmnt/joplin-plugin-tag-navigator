/**
 * Input validation utilities for the Tag Navigator plugin
 * Provides comprehensive validation for user inputs to prevent security vulnerabilities
 */
import { getStandardGroupingKeys } from './settings';

/**
 * Configuration for validation limits
 */
export const VALIDATION_LIMITS = {
  // String length limits
  MAX_TAG_LENGTH: 200,
  MAX_QUERY_LENGTH: 10000,
  MAX_FILTER_LENGTH: 1000,
  MAX_SETTING_VALUE_LENGTH: 500,
  MAX_NOTE_ID_LENGTH: 100,  // Can also be a note title
  MAX_FIELD_NAME_LENGTH: 50,
  
  // Array limits
  MAX_QUERY_GROUPS: 50,
  MAX_TAGS_PER_GROUP: 100,
  
  // Regex limits
  MAX_REGEX_LENGTH: 500,
  REGEX_TIMEOUT_MS: 1000,
} as const;

/**
 * Allowed setting field names to prevent arbitrary setting manipulation
 */
export const ALLOWED_SETTING_FIELDS = new Set([
  'resultSort',
  'resultOrder', 
  'resultGrouping',
  'resultToggle',
  'showQuery',
  'expandedTagList',
  'showTagRange',
  'showNotes',
  'showResultFilter',
  'filter'
]);

/**
 * Allowed message names to prevent arbitrary command execution
 */
export const ALLOWED_MESSAGE_NAMES = new Set([
  'searchQuery',
  'insertTag',
  'openNote',
  'setCheckBox',
  'addTag',
  'replaceTag',
  'replaceAll',
  'removeTag',
  'removeAll',
  'updateSetting',
  'saveQuery',
  'loadSavedQuery',
  'updateNoteState',
  'resetToGlobalSettings',
  'clearQuery',
  'focusEditor',
  'showSortDialog',
  'showWarning',
  'initPanel'
]);

/**
 * Valid result sort options
 */
export const VALID_SORT_OPTIONS = new Set([
  'modified',
  'created', 
  'title',
  'notebook',
  'custom'
]);

/**
 * Valid result order options
 */
export const VALID_ORDER_OPTIONS = new Set([
  'asc',
  'desc'
]);

/**
 * Valid result grouping options — derived from settings to stay in sync
 */
export const VALID_GROUPING_OPTIONS = new Set(getStandardGroupingKeys());

/**
 * Validation error class for input validation failures
 */
export class ValidationError extends Error {
  constructor(message: string, public field?: string, public value?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates and sanitizes a string input
 * @param value - Input value to validate
 * @param fieldName - Name of the field being validated
 * @param maxLength - Maximum allowed length
 * @param required - Whether the field is required
 * @returns Sanitized string value
 */
export function validateString(
  value: any, 
  fieldName: string, 
  maxLength: number = VALIDATION_LIMITS.MAX_SETTING_VALUE_LENGTH,
  required: boolean = false
): string {
  // Handle null/undefined
  if (value == null) {
    if (required) {
      throw new ValidationError(`${fieldName} is required`, fieldName, value);
    }
    return '';
  }

  // Convert to string
  const strValue = String(value);

  // Check length
  if (strValue.length > maxLength) {
    throw new ValidationError(
      `${fieldName} exceeds maximum length of ${maxLength} characters`, 
      fieldName, 
      value
    );
  }

  // Remove any null bytes and control characters (except newlines and tabs)
  const sanitized = strValue.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
}

/**
 * Validates a tag string
 * @param tag - Tag value to validate
 * @param fieldName - Name of the field being validated
 * @returns Sanitized tag string
 */
export function validateTag(tag: any, fieldName: string = 'tag'): string {
  const sanitized = validateString(tag, fieldName, VALIDATION_LIMITS.MAX_TAG_LENGTH);
  
  // Additional tag-specific validation
  if (sanitized.length > 0) {
    // Remove leading/trailing whitespace
    const trimmed = sanitized.trim();
    
    // Check for potentially dangerous patterns
    if (trimmed.includes('<script') || trimmed.includes('javascript:')) {
      throw new ValidationError(`${fieldName} contains potentially dangerous content`, fieldName, tag);
    }
    
    return trimmed;
  }
  
  return sanitized;
}

/**
 * Validates a note external ID
 * @param externalId - External ID to validate
 * @returns Sanitized external ID
 */
export function validateExternalId(externalId: any): string {
  const sanitized = validateString(externalId, 'externalId', VALIDATION_LIMITS.MAX_NOTE_ID_LENGTH);
  
  // External IDs should only contain alphanumeric characters, hyphens, and colons
  if (sanitized && !/^[a-zA-Z0-9.%:/-]+$/.test(sanitized)) {
    throw new ValidationError('Invalid external ID format', 'externalId', externalId);
  }
  
  return sanitized;
}

/**
 * Validates a line number
 * @param line - Line number to validate
 * @returns Validated line number
 */
export function validateLineNumber(line: any): number {
  const num = Number(line);
  
  if (!Number.isInteger(num) || num < -1 || num > 1000000) {
    throw new ValidationError('Invalid line number', 'line', line);
  }
  
  return num;
}

/**
 * Validates a query structure
 * @param query - Query to validate
 * @returns Validated query structure
 */
export function validateQuery(query: any): any[][] {
  if (!Array.isArray(query)) {
    throw new ValidationError('Query must be an array', 'query', query);
  }
  
  if (query.length > VALIDATION_LIMITS.MAX_QUERY_GROUPS) {
    throw new ValidationError(
      `Query cannot have more than ${VALIDATION_LIMITS.MAX_QUERY_GROUPS} groups`, 
      'query', 
      query
    );
  }
  
  const validatedQuery = query.map((group, groupIndex) => {
    if (!Array.isArray(group)) {
      throw new ValidationError(`Query group ${groupIndex} must be an array`, 'query', query);
    }
    
    if (group.length > VALIDATION_LIMITS.MAX_TAGS_PER_GROUP) {
      throw new ValidationError(
        `Query group ${groupIndex} cannot have more than ${VALIDATION_LIMITS.MAX_TAGS_PER_GROUP} items`,
        'query',
        query
      );
    }
    
    return group.map((item, itemIndex) => {
      if (typeof item !== 'object' || item === null) {
        throw new ValidationError(
          `Query group ${groupIndex} item ${itemIndex} must be an object`,
          'query',
          query
        );
      }
      
      const validatedItem: any = {};
      
      // Validate tag
      if ('tag' in item) {
        validatedItem.tag = validateTag(item.tag, `query.group[${groupIndex}].item[${itemIndex}].tag`);
      }
      
      // Validate title and externalId for note references
      if ('title' in item) {
        validatedItem.title = validateString(
          item.title, 
          `query.group[${groupIndex}].item[${itemIndex}].title`,
          VALIDATION_LIMITS.MAX_TAG_LENGTH
        );
      }
      
      if ('externalId' in item) {
        validatedItem.externalId = validateExternalId(item.externalId);
      }
      
      // Validate range values
      if ('minValue' in item) {
        validatedItem.minValue = validateTag(
          item.minValue, 
          `query.group[${groupIndex}].item[${itemIndex}].minValue`
        );
      }
      
      if ('maxValue' in item) {
        validatedItem.maxValue = validateTag(
          item.maxValue, 
          `query.group[${groupIndex}].item[${itemIndex}].maxValue`
        );
      }
      
      // Validate negated flag
      if ('negated' in item) {
        validatedItem.negated = Boolean(item.negated);
      }
      
      return validatedItem;
    });
  });
  
  return validatedQuery;
}

/**
 * Validates a setting field name
 * @param field - Field name to validate
 * @returns Validated field name
 */
export function validateSettingField(field: any): string {
  const sanitized = validateString(field, 'field', VALIDATION_LIMITS.MAX_FIELD_NAME_LENGTH, true);
  
  if (!ALLOWED_SETTING_FIELDS.has(sanitized)) {
    throw new ValidationError(`Invalid setting field: ${sanitized}`, 'field', field);
  }
  
  return sanitized;
}

/**
 * Validates a message name
 * @param name - Message name to validate
 * @returns Validated message name
 */
export function validateMessageName(name: any): string {
  const sanitized = validateString(name, 'name', VALIDATION_LIMITS.MAX_FIELD_NAME_LENGTH, true);
  
  if (!ALLOWED_MESSAGE_NAMES.has(sanitized)) {
    throw new ValidationError(`Invalid message name: ${sanitized}`, 'name', name);
  }
  
  return sanitized;
}

/**
 * Validates a filter string
 * @param filter - Filter string to validate
 * @returns Validated filter string
 */
export function validateFilter(filter: any): string {
  return validateString(filter, 'filter', VALIDATION_LIMITS.MAX_FILTER_LENGTH);
}

/**
 * Validates a sort option
 * @param sortBy - Sort option to validate
 * @returns Validated sort option
 */
export function validateSortBy(sortBy: any): string {
  const sanitized = validateString(sortBy, 'sortBy', VALIDATION_LIMITS.MAX_SETTING_VALUE_LENGTH);
  
  // For standard options, check against allowed values
  if (sanitized && VALID_SORT_OPTIONS.has(sanitized)) {
    return sanitized;
  }
  
  // For custom sort options, validate as a comma-separated list of tag names
  if (sanitized) {
    const tags = sanitized.split(',').map(tag => tag.trim());
    for (const tag of tags) {
      if (tag.length > 0) {
        validateTag(tag, 'sortBy.tag');
      }
    }
    return sanitized;
  }
  
  return 'modified'; // Default fallback
}

/**
 * Validates a sort order option
 * @param sortOrder - Sort order to validate
 * @returns Validated sort order
 */
export function validateSortOrder(sortOrder: any): string {
  const sanitized = validateString(sortOrder, 'sortOrder', VALIDATION_LIMITS.MAX_SETTING_VALUE_LENGTH);
  
  if (!sanitized) {
    return 'desc'; // Default fallback
  }
  
  // Handle comma-separated values
  const orders = sanitized.split(',').map(order => order.trim().toLowerCase());
  
  for (const order of orders) {
    if (order.length > 0 && !order.startsWith('a') && !order.startsWith('d')) {
      throw new ValidationError(`Invalid sort order: ${order}. Must be 'asc' or 'desc'`, 'sortOrder', sortOrder);
    }
  }
  
  return sanitized;
}

/**
 * Validates a grouping option
 * @param grouping - Grouping option to validate
 * @returns Validated grouping option
 */
export function validateGrouping(grouping: any): string {
  const sanitized = validateString(grouping, 'resultGrouping', VALIDATION_LIMITS.MAX_SETTING_VALUE_LENGTH);
  
  if (!sanitized || !VALID_GROUPING_OPTIONS.has(sanitized)) {
    return 'heading'; // Default fallback
  }
  
  return sanitized;
}

/**
 * Validates a JSON string and parses it safely
 * @param jsonString - JSON string to validate and parse
 * @param fieldName - Name of the field being validated
 * @param maxLength - Maximum allowed string length before parsing
 * @returns Parsed JSON object
 */
export function validateAndParseJSON(
  jsonString: any, 
  fieldName: string, 
  maxLength: number = VALIDATION_LIMITS.MAX_QUERY_LENGTH
): any {
  const sanitized = validateString(jsonString, fieldName, maxLength, true);
  
  try {
    return JSON.parse(sanitized);
  } catch (error) {
    throw new ValidationError(`Invalid JSON in ${fieldName}: ${error.message}`, fieldName, jsonString);
  }
}

/**
 * Validates a panel message completely
 * @param message - Message object to validate
 * @returns Validated message object
 */
export function validatePanelMessage(message: any): any {
  if (typeof message !== 'object' || message === null) {
    throw new ValidationError('Message must be an object', 'message', message);
  }
  
  const validated: any = {};
  
  // Validate message name
  if ('name' in message) {
    validated.name = validateMessageName(message.name);
  }
  
  // Validate optional fields based on message type
  if ('query' in message) {
    const queryData = validateAndParseJSON(message.query, 'query');
    validated.query = validateQuery(queryData);
  }
  
  if ('filter' in message) {
    validated.filter = validateFilter(message.filter);
  }
  
  if ('tag' in message) {
    validated.tag = validateTag(message.tag);
  }
  
  if ('oldTag' in message) {
    validated.oldTag = validateTag(message.oldTag, 'oldTag');
  }
  
  if ('newTag' in message) {
    validated.newTag = validateTag(message.newTag, 'newTag');
  }
  
  if ('externalId' in message) {
    if (message.externalId.startsWith('http')) {
      validated.externalId = message.externalId;
    } else {
      validated.externalId = validateExternalId(message.externalId);
    }
  }
  
  if ('line' in message) {
    validated.line = validateLineNumber(message.line);
  }
  
  if ('text' in message) {
    validated.text = validateString(message.text, 'text', VALIDATION_LIMITS.MAX_QUERY_LENGTH);
  }
  
  if ('field' in message) {
    validated.field = validateSettingField(message.field);
  }
  
  if ('value' in message) {
    // Validate value based on field type
    if (validated.field === 'resultSort') {
      validated.value = validateSortBy(message.value);
    } else if (validated.field === 'resultOrder') {
      validated.value = validateSortOrder(message.value);
    } else if (validated.field === 'resultGrouping') {
      validated.value = validateGrouping(message.value);
    } else if (validated.field === 'filter') {
      validated.value = validateFilter(message.value);
    } else {
      // For boolean and other settings
      validated.value = message.value;
    }
  }
  
  if ('source' in message) {
    validated.source = validateString(message.source, 'source', 10);
  }
  
  if ('target' in message) {
    validated.target = validateString(message.target, 'target', 10);
  }
  
  if ('noteState' in message) {
    const noteStateData = validateAndParseJSON(message.noteState, 'noteState', 10000);
    validated.noteState = noteStateData;
  }
  
  if ('currentSortBy' in message) {
    validated.currentSortBy = validateSortBy(message.currentSortBy);
  }
  
  if ('currentSortOrder' in message) {
    validated.currentSortOrder = validateSortOrder(message.currentSortOrder);
  }

  if ('message' in message) {
    validated.message = validateString(message.message, 'message', VALIDATION_LIMITS.MAX_SETTING_VALUE_LENGTH);
  }

  if ('mode' in message) {
    const mode = validateString(message.mode, 'mode', 10);
    if (['dnf', 'cnf'].includes(mode)) {
      validated.mode = mode;
    }
  }

  return validated;
}
