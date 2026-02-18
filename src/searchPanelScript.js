let queryGroups = []; // Array of Sets
// each set is a group of tags combined with "AND"
// sets are combined with "OR"
let allTags = [];
let allNotes = [];
let results = [];
let noteState = {}; // Global state to track collapsed/expanded state of notes

// Standard sort values used throughout the script
const STANDARD_SORT_VALUES = ['modified', 'created', 'title', 'text', 'notebook', 'custom'];

const noteIdRegex = /([a-zA-Z0-9]{32})/; // Matches noteId

let tagFilter;
let tagCount;
let tagInputArea;
let tagClear;
let saveQuery;
let tagSearch;
let tagList;
let tagRangeArea;
let tagRangeMin;
let tagRangeMax;
let tagRangeAdd;
let noteArea;
let noteList;
let noteFilter;
let queryContainer;
let queryArea;
let savedQueriesDropdown;
let allSavedQueries = [];
let resultFilterArea;
let resultFilter;
let resultCount;
let resultSort;
let resultOrder;
let resultToggle;
let resultsArea;
let resultToggleState = null; // Will be set when settings are received
let resultOrderState = 'desc';
let lastMessage = null; // Store the last message from the main process
let resultMarker = true;
let selectMultiTags = 'first';
let searchWithRegex = false;
let spaceReplace = '_';
let tagPrefix = '#';
let valueDelim = '=';
let dropdownIsOpen = false;
let resultColorProperty = 'border';
let resultGrouping = 'heading'; // Current result grouping setting
let sectionExpandLevel = {};  // Maps "noteId|color|sectionIndex" -> level (0-3)
let isSearching = false;  // True while waiting for search results

let domInitialized = false;
let initializingDom = false;
const pendingMessages = [];

const eventListenersMap = new WeakMap();  // Map to store event listeners and clear them later

function isElementAttached(element) {
    return !!(element && element instanceof Element && document.body.contains(element));
}

function flushPendingMessages() {
    if (!pendingMessages.length) {
        return;
    }
    const messages = pendingMessages.splice(0, pendingMessages.length);
    for (const message of messages) {
        processPanelMessage(message);
    }
}

function ensurePanelReady() {
    if (domInitialized && isElementAttached(tagFilter) && isElementAttached(resultFilterArea)) {
        return true;
    }
    initPanel(true);
    return domInitialized && isElementAttached(tagFilter) && isElementAttached(resultFilterArea);
}

function initPanel(force = false) {
    if (initializingDom) {
        return;
    }

    const needsInit = force || !domInitialized || !isElementAttached(tagFilter) || !isElementAttached(resultFilterArea);
    if (!needsInit) {
        return;
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => initPanel(force), { once: true });
        return;
    }

    initializingDom = true;

    tagFilter = document.getElementById('itags-search-tagFilter');
    tagInputArea = document.getElementById('itags-search-inputTagArea');
    tagClear = document.getElementById('itags-search-tagClear');
    saveQuery = document.getElementById('itags-search-saveQuery');
    tagSearch = document.getElementById('itags-search-tagSearch');
    tagList = document.getElementById('itags-search-tagList');
    tagRangeArea = document.getElementById('itags-search-tagRangeArea');
    tagRangeMin = document.getElementById('itags-search-tagRangeMin');
    tagRangeMax = document.getElementById('itags-search-tagRangeMax');
    tagRangeAdd = document.getElementById('itags-search-tagRangeAdd');
    noteArea = document.getElementById('itags-search-inputNoteArea');
    noteList = document.getElementById('itags-search-noteList');
    noteFilter = document.getElementById('itags-search-noteFilter');
    queryContainer = document.getElementById('itags-search-queryContainer');
    queryArea = document.getElementById('itags-search-queryArea');
    savedQueriesDropdown = document.getElementById('itags-search-savedQueries');
    resultFilterArea = document.getElementById('itags-search-inputResultArea');
    resultFilter = document.getElementById('itags-search-resultFilter');
    resultSort = document.getElementById('itags-search-resultSort');
    resultOrder = document.getElementById('itags-search-resultOrder');
    resultToggle = document.getElementById('itags-search-resultToggle');
    resultsArea = document.getElementById('itags-search-resultsArea');

    if (!tagFilter || !tagInputArea || !tagClear || !saveQuery || !tagSearch || !tagList ||
        !tagRangeArea || !tagRangeMin || !tagRangeMax || !tagRangeAdd || !noteArea || !noteList ||
        !noteFilter || !queryContainer || !queryArea || !savedQueriesDropdown || !resultFilterArea || !resultFilter || !resultSort ||
        !resultOrder || !resultToggle || !resultsArea) {
        initializingDom = false;
        domInitialized = false;
        console.warn('Tag Navigator: Search panel DOM not ready for initialization.');
        return;
    }

    if (!tagCount) {
        tagCount = document.createElement('div');
        tagCount.classList.add('itags-search-resultCount');
        tagCount.style.display = 'none';
    }
    if (tagFilter.parentNode && tagCount.parentNode !== tagFilter.parentNode) {
        tagFilter.parentNode.appendChild(tagCount);
    }

    if (!resultCount) {
        resultCount = document.createElement('div');
        resultCount.classList.add('itags-search-resultCount');
        resultCount.style.display = 'none';
    }
    if (resultFilterArea && resultCount.parentNode !== resultFilterArea) {
        resultFilterArea.appendChild(resultCount);
    }

    resultToggleState = null;
    resultOrderState = 'desc';

    registerEventHandlers();

    domInitialized = true;
    initializingDom = false;

    updateTagList();
    if (tagFilter) {
        tagFilter.focus();
    }

    webviewApi.postMessage({
        name: 'initPanel',
    });

    flushPendingMessages();
}

// Add this secure HTML handling function near the top of the file, after the existing helper functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// DOMPurify sanitization config - whitelist of allowed tags and attributes
const SANITIZE_CONFIG = {
    ALLOWED_TAGS: [
        // Structure
        'div', 'span', 'p', 'br', 'hr',
        // Headings
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        // Text formatting
        'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'code', 'pre', 'font',
        // Lists
        'ul', 'ol', 'li',
        // Links
        'a',
        // Task lists (markdown-it-task-lists)
        'input',
        // Tables
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        // Details/summary
        'details', 'summary',
        // Buttons
        'button',
        // Blockquotes
        'blockquote'
    ],
    ALLOWED_ATTR: [
        'class', 'href', 'title', 'type', 'checked', 'disabled', 'color', 'style'
    ],
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
};

/**
 * Sanitize HTML content using DOMPurify to prevent XSS attacks.
 * @param {string} html - The HTML string to sanitize
 * @returns {string} - Sanitized HTML string
 */
function sanitizeHTML(html) {
    if (typeof DOMPurify === 'undefined') {
        console.warn('DOMPurify not loaded, skipping sanitization');
        return html;
    }
    return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

function safeSetInnerHTML(element, htmlContent) {
    // Sanitize HTML content before parsing
    const sanitized = sanitizeHTML(htmlContent);

    // Create a temporary container to parse the HTML safely
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = sanitized;

    // Clear the target element
    element.innerHTML = '';

    // Move all nodes from temp container to target element
    while (tempDiv.firstChild) {
        element.appendChild(tempDiv.firstChild);
    }
}

function highlightText(text, searchTerms, className = 'itags-search-renderedFilter') {
    if (!searchTerms || searchTerms.length === 0) {
        return escapeHtml(text);
    }
    
    // Validate and sanitize className to prevent XSS
    const safeClassName = (className || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeClassName) {
        return escapeHtml(text);
    }
    
    // Escape HTML in the text first
    let escapedText = escapeHtml(text);
    
    // Create a safe regex pattern for highlighting
    const safeTerms = searchTerms
        .filter(term => term && typeof term === 'string' && term.length > 0)
        .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // Escape regex special characters
    
    if (safeTerms.length === 0) {
        return escapedText;
    }
    
    // Apply highlighting with properly escaped terms
    const highlightRegex = new RegExp(`(${safeTerms.join('|')})`, 'gi');
    return escapedText.replace(highlightRegex, `<mark class="${safeClassName}">$1</mark>`);
}

function highlightTextInHTML(htmlContent, searchTerms, className = 'itags-search-renderedFilter') {
    if (!searchTerms || searchTerms.length === 0 || !htmlContent) {
        return htmlContent;
    }
    
    // Validate and sanitize className to prevent XSS
    const safeClassName = (className || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeClassName) {
        return htmlContent;
    }
    
    // Validate and filter search terms
    const safeTerms = searchTerms
        .filter(term => term && typeof term === 'string' && term.length > 0 && term.length <= 100) // Limit term length
        .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // Escape regex special characters
    
    if (safeTerms.length === 0) {
        return htmlContent;
    }
    
    try {
        // Use negative lookbehind and lookahead to avoid highlighting inside HTML tags
        // This regex matches the terms only when they're not inside HTML tag attributes or tag names
        const highlightRegex = new RegExp(`(?<!<[^>]*)(${safeTerms.join('|')})(?![^<]*>)`, 'gi');
        
        // Additional safety: escape any captured content to prevent XSS
        return htmlContent.replace(highlightRegex, (match, capturedTerm) => {
            const escapedTerm = escapeHtml(capturedTerm);
            return `<mark class="${safeClassName}">${escapedTerm}</mark>`;
        });
    } catch (error) {
        // If regex fails (e.g., due to lookbehind not being supported), fall back to safe mode
        console.warn('Advanced regex highlighting failed, falling back to simple mode:', error);
        return htmlContent;
    }
}

// Listen for messages from the main process
webviewApi.onMessage((message) => {
    // Store the message for later access
    lastMessage = message;

    if (!ensurePanelReady()) {
        pendingMessages.push(message);
        return;
    }

    processPanelMessage(message);
});

function processPanelMessage(message) {
    if (message.message.name === 'updateTagData') {
        allTags = JSON.parse(message.message.tags);
        updateTagList();

    } else if (message.message.name === 'updateNoteData') {
        allNotes = JSON.parse(message.message.notes);
        updateNoteList();
        // Update saved queries dropdown if data is provided
        if (message.message.savedQueries) {
            allSavedQueries = JSON.parse(message.message.savedQueries);
            updateSavedQueriesDropdown();
        }

    } else if (message.message.name === 'updateQuery') {
        let queryGroupsCand = [];
        try {
            queryGroupsCand = JSON.parse(message.message.query);
        } catch (e) {
            console.error('Failed to parse saved query:', message.message.query, e);
        }
        queryGroups = queryGroupsCand;
        if (resultFilter) {
            resultFilter.value = message.message.filter ? message.message.filter : '';
        }
        updateQueryArea();
        sendSearchMessage();

    } else if (message.message.name === 'updateSettings') {
        updatePanelSettings(message);

    } else if (message.message.name === 'updateResults') {
        isSearching = false;
        try {
            results = JSON.parse(message.message.results);
        } catch (e) {
            console.error('Failed to parse results:', message.message.results, e);
        }

        // Clear note state for results that are no longer present
        clearNoteStateForNewResults();

        // Clear context expansion state for results no longer present
        clearSectionExpandStateForNewResults();

        // Always clean up dropdown first, then set sort value if provided
        // Remove any custom options that are not in the standard list
        for (let i = resultSort.options.length - 1; i >= 0; i--) {
            const option = resultSort.options[i];
            if (!STANDARD_SORT_VALUES.includes(option.value)) {
                resultSort.removeChild(option);
            }
        }

        if (message.message.sortBy) {
            // If sortBy is not in the standard options, add it as a custom option
            if (!Array.from(resultSort.options).some(option => option.value === message.message.sortBy)) {
                const option = document.createElement('option');
                option.value = message.message.sortBy;
                option.text = message.message.sortBy;
                resultSort.add(option);
            }
            resultSort.value = message.message.sortBy;
            // Update the data-prev-value attribute to keep it in sync
            resultSort.setAttribute('data-prev-value', message.message.sortBy);
        }

        // Set sort order if provided
        if (message.message.sortOrder) {
            updateResultOrderDisplay(message.message.sortOrder);
        }

        // Ensure resultToggleState is initialized before updating results
        if (resultToggleState === null) {
            // If settings haven't been received yet, request them
            webviewApi.postMessage({
                name: 'initPanel'
            });
            return; // Don't update results until settings are received
        }

        updateResultsArea();
    } else if (message.message.name === 'focusTagFilter') {
        if (tagFilter) {
            tagFilter.focus();
        }

    } else if (message.message.name === 'extendQuery') {
        handleTagClick(message.message.tag);
        sendSearchMessage();

    } else if (message.message.name === 'updateNoteState') {
        // Restore saved note state from main process (true = expanded/visible, false = collapsed/hidden)
        try {
            noteState = JSON.parse(message.message.noteState);
        } catch (e) {
            console.error('Failed to parse saved note state:', message.message.noteState, e);
            noteState = {};
        }
    }
}

/** Builds a unique card key for collapse/expand state tracking. */
function getCardKey(result) {
    const base = `${result.externalId}|${result.color || 'default'}`;
    if (resultGrouping === 'none') {
        return `${base}|${Math.min(...result.lineNumbers[0])}`;
    }
    return base;
}

// Function to update note state and send to main process
function updateNoteState(cardKey, isExpanded) {
    // Update the state (true = expanded/visible, false = collapsed/hidden)
    noteState[cardKey] = isExpanded;
    
    // Prune old entries to prevent unlimited growth
    pruneNoteState(100);
    
    // Send the updated state to the main process
    webviewApi.postMessage({
        name: 'updateNoteState',
        noteState: JSON.stringify(noteState)
    });
}

function clearNoteState() {
    noteState = {};
    webviewApi.postMessage({
        name: 'updateNoteState',
        noteState: JSON.stringify(noteState)
    });
}

// Add function to prune old note state entries
function pruneNoteState(maxEntries = 100) {
    const entries = Object.entries(noteState);
    if (entries.length <= maxEntries) {
        return; // No pruning needed
    }
    
    // Keep only the most recent entries (simple strategy: keep first N entries)
    // In a real scenario, we might want to keep the most recently accessed ones
    const prunedEntries = entries.slice(0, maxEntries);
    noteState = Object.fromEntries(prunedEntries);
    
    // Send the pruned state to main process
    webviewApi.postMessage({
        name: 'updateNoteState',
        noteState: JSON.stringify(noteState)
    });
}

// Clear note state when new results are loaded
function clearNoteStateForNewResults() {
    // Clear state that doesn't match current results
    const currentKeys = new Set();
    
    for (const result of results) {
        currentKeys.add(getCardKey(result));
    }

    // Remove entries that don't match current results
    const keysToRemove = Object.keys(noteState).filter(key => !currentKeys.has(key));
    keysToRemove.forEach(key => {
        delete noteState[key];
    });
    
    // If we removed entries, send updated state to main process
    if (keysToRemove.length > 0) {
        webviewApi.postMessage({
            name: 'updateNoteState',
            noteState: JSON.stringify(noteState)
        });
    }
    
    // Clear temporary data structures
    currentKeys.clear();
    keysToRemove.length = 0;
}

// Fully clear section expand state (for new searches)
function clearSectionExpandState() {
    sectionExpandLevel = {};
}

// Clear section expand state for results that are no longer present
// Preserves expansion state for notes that remain in new results (for refreshes)
function clearSectionExpandStateForNewResults() {
    // Build set of valid key prefixes from current results
    const currentPrefixes = new Set();
    for (const result of results) {
        currentPrefixes.add(getCardKey(result));
    }

    // Remove entries whose prefix doesn't match current results
    // Key format: "noteId|color|sectionIndex"
    for (const key of Object.keys(sectionExpandLevel)) {
        const lastPipe = key.lastIndexOf('|');
        const prefix = lastPipe > 0 ? key.substring(0, lastPipe) : key;
        if (!currentPrefixes.has(prefix)) {
            delete sectionExpandLevel[key];
        }
    }

    // Clear temporary data structure (memory leak prevention)
    currentPrefixes.clear();
}

// Update areas
function updateTagList() {
    clearNode(tagList);
    
    // Create document fragment to batch DOM updates
    const fragment = document.createDocumentFragment();
    
    // Filter tags once
    const filteredTags = allTags.filter(tag => containsFilter(tag, tagFilter.value));
    
    // Create all elements at once
    filteredTags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.classList.add('itags-search-tag');
        tagEl.textContent = tag;
        
        // Add single event listener with tracking
        addEventListenerWithTracking(tagEl, 'click', () => handleTagClick(tag));
        
        fragment.appendChild(tagEl);
    });
    
    // Single DOM update
    tagList.appendChild(fragment);

    // Update tag count
    updateTagCount(filteredTags.length, tagFilter.value);
}

// Update saved queries dropdown
function updateSavedQueriesDropdown() {
    if (!savedQueriesDropdown) { return; }

    // Preserve the current value
    const currentValue = savedQueriesDropdown.value;

    // Clear existing options except the placeholder
    while (savedQueriesDropdown.options.length > 1) {
        savedQueriesDropdown.remove(1);
    }

    // Add saved query notes
    for (const query of allSavedQueries) {
        const option = document.createElement('option');
        option.value = query.externalId;
        option.textContent = query.title;
        option.title = query.title; // Show full title on hover
        savedQueriesDropdown.appendChild(option);
    }

    // Restore selection if it still exists
    if (currentValue && Array.from(savedQueriesDropdown.options).some(opt => opt.value === currentValue)) {
        savedQueriesDropdown.value = currentValue;
    } else {
        savedQueriesDropdown.value = '';
    }
}

// Update note dropdown with the current list of notes
function updateNoteList() {
    if (dropdownIsOpen) { return; }

    // Preserve selection
    const selectedNoteId = noteList.value;
    clearNode(noteList);
    
    const fragment = document.createDocumentFragment();
    const filterValue = noteFilter.value;

    // Create default options
    if (filterValue === '') {
        const titleOpt = document.createElement('option');
        titleOpt.value = 'default';
        titleOpt.textContent = 'Search by note mentions';
        fragment.appendChild(titleOpt);
    }
    
    if (containsFilter('Current note', filterValue)) {
        const currentOpt = document.createElement('option');
        currentOpt.value = 'current';
        currentOpt.textContent = 'Current note';
        // Add duplicate of first note at the beginning
        if (fragment.childNodes.length === 0) {
            fragment.appendChild(currentOpt.cloneNode(true));
        }
        fragment.appendChild(currentOpt);
    }
    
    // Filter and create note options in one pass
    allNotes
    .filter(note => containsFilter(note.title, filterValue))
    .forEach(note => {
        const noteEl = document.createElement('option');
        noteEl.value = note.externalId;
        noteEl.textContent = note.title;
        // Add duplicate of first note at the beginning
        if (fragment.childNodes.length === 0) {
            fragment.appendChild(noteEl.cloneNode(true));
        }
        fragment.appendChild(noteEl);
    });

    // Single DOM update
    noteList.appendChild(fragment);

    // Restore selection if possible
    if (selectedNoteId) {
        noteList.value = selectedNoteId;
    }
}

// Check that all words are in the target
function containsFilter(target, filter, min_chars=1, otherTarget='') {
    const lowerTarget = (target + otherTarget).toLowerCase();
    const words = parseFilter(filter, min_chars);
    
    if (searchWithRegex) {
        return words.every(word => {
            const isExclusion = word.startsWith('!');
            const pattern = isExclusion ? word.slice(1) : word;
            
            // Handle empty pattern after !
            if (!pattern) return !isExclusion;
            
            try {
                const matches = lowerTarget.match(new RegExp(`(${pattern})`, 'gi'));
                return isExclusion ? !matches : !!matches;
            } catch (error) {
                console.warn('Tag Navigator: Invalid regex pattern:', pattern, error);
                // Fall back to simple text search for invalid patterns
                const found = lowerTarget.includes(pattern.toLowerCase());
                return isExclusion ? !found : found;
            }
        });
    } else {
        return words.every(word => {
            const isExclusion = word.startsWith('!');
            const searchTerm = isExclusion ? word.slice(1) : word;
            
            // Handle empty search term after !
            if (!searchTerm) return !isExclusion;
            
            const found = lowerTarget.includes(searchTerm);
            
            return isExclusion ? !found : found;
        });
    }
}

function parseFilter(filter, min_chars=1) {
    // Split filter into words and quoted phrases
    const regex = /"([^"]+)"/g;
    let match;
    const quotes = [];
    while ((match = regex.exec(filter)) !== null) {
        quotes.push(match[1]);
        filter = filter.replace(match[0], '');
    }
    const words = filter.replace('"', '').toLowerCase()
        .split(' ').filter(word => word.length >= min_chars)
        .concat(quotes);
    
    // Clear quotes array to help GC
    quotes.length = 0;
    
    return words;
}

function updatePanelSettings(message) {
    const settings = JSON.parse(message.message.settings);
    searchWithRegex = settings.searchWithRegex;
    selectMultiTags = settings.selectMultiTags;
    spaceReplace = settings.spaceReplace;
    tagPrefix = settings.tagPrefix || '#';
    valueDelim = settings.valueDelim || '=';
    resultGrouping = settings.resultGrouping || 'heading'; // Store resultGrouping setting
    
    // Sync panel state with Joplin settings
    const newResultToggleState = settings.resultToggle ? 'collapse' : 'expand';
    // When the toggle state changes (e.g., loading a query with a different collapse
    // setting), clear noteState so existing cards respect the new default.
    if (resultToggleState !== null && newResultToggleState !== resultToggleState) {
        noteState = {};
    }
    resultToggleState = newResultToggleState;
    // Update the toggle button display to match current setting
    resultToggle.innerHTML = settings.resultToggle ?
        '>' : 'v';  // Button shows the current state (collapse / expand)

    // Clean up custom dropdown options when setting to a standard value
    if (STANDARD_SORT_VALUES.includes(settings.resultSort)) {
        for (let i = resultSort.options.length - 1; i >= 0; i--) {
            const option = resultSort.options[i];
            if (!STANDARD_SORT_VALUES.includes(option.value)) {
                resultSort.removeChild(option);
            }
        }
    }

    // Always update resultSort to match the settings - updateResults will handle custom values if needed
    resultSort.value = settings.resultSort;
    resultSort.setAttribute('data-prev-value', settings.resultSort);

    // Handle string resultOrder format
    updateResultOrderDisplay(settings.resultOrder);
    resultMarker = settings.resultMarker;
    resultColorProperty = settings.resultColorProperty;

    hideElements(settings);
    updateResultsArea();
}

function hideElements(settings) {
    let hiddenCount = 0;
    if (settings.showNotes) {
        noteArea.classList.remove('hidden');
        noteFilter.classList.remove('hidden');
        noteList.classList.remove('hidden');
        resultsArea.classList.remove('extended');
    } else {
        noteArea.classList.add('hidden');
        noteFilter.classList.add('hidden');
        noteList.classList.add('hidden');
        resultsArea.classList.add('extended');
        hiddenCount++;
    }
    if (settings.showResultFilter) {
        resultFilterArea.classList.remove('hidden');
        resultFilter.classList.remove('hidden');
        resultSort.classList.remove('hidden');
        resultOrder.classList.remove('hidden');
        resultToggle.classList.remove('hidden');
    } else {
        resultFilterArea.classList.add('hidden');
        resultFilter.classList.add('hidden');
        resultSort.classList.add('hidden');
        resultOrder.classList.add('hidden');
        resultToggle.classList.add('hidden');
        hiddenCount++;
    }
    if (settings.showTagRange) {
        tagRangeArea.classList.remove('hidden');
        tagRangeMin.classList.remove('hidden');
        tagRangeMax.classList.remove('hidden');
        tagRangeAdd.classList.remove('hidden');
    } else {
        tagRangeArea.classList.add('hidden');
        tagRangeMin.classList.add('hidden');
        tagRangeMax.classList.add('hidden');
        tagRangeAdd.classList.add('hidden');
        hiddenCount++;
    }
    if (settings.showQuery) {
        tagInputArea.classList.remove('hidden');
        tagFilter.classList.remove('hidden');
        tagCount.classList.remove('hidden');
        tagClear.classList.remove('hidden');
        saveQuery.classList.remove('hidden');
        tagSearch.classList.remove('hidden');
        tagList.classList.remove('hidden');
        queryContainer.classList.remove('hidden');
        queryArea.classList.remove('hidden');
        savedQueriesDropdown.classList.remove('hidden');
    } else {
        tagInputArea.classList.add('hidden');
        tagFilter.classList.add('hidden');
        tagCount.classList.add('hidden');
        tagClear.classList.add('hidden');
        saveQuery.classList.add('hidden');
        tagSearch.classList.add('hidden');
        tagList.classList.add('hidden');
        queryContainer.classList.add('hidden');
        queryArea.classList.add('hidden');
        savedQueriesDropdown.classList.add('hidden');
        hiddenCount += 6;
    }
    if (settings.expandedTagList) {
        tagList.classList.add('expandedTagList');
    } else {
        tagList.classList.remove('expandedTagList');
        if (settings.showQuery) {
            hiddenCount += 2;
        }
    }
    resultsArea.classList.remove('extended1X', 'extended2X', 'extended3X',
        'extended4X', 'extended5X', 'extended6X', 'extended7X', 'extended8X',
        'extended9X');
    if (hiddenCount) {
        resultsArea.classList.add('extended' + hiddenCount + 'X');
    }
}

function updateQueryArea() {
    clearNode(queryArea);
    const fragment = document.createDocumentFragment();

    queryGroups.forEach((group, groupIndex) => {
        if (groupIndex > 0) {
            fragment.appendChild(createOperatorElement('OR', groupIndex - 1, true));
        }

        fragment.appendChild(document.createTextNode('(')); // Start group

        group.forEach((item, tagIndex) => {
            const newEl = createQueryElement(item, groupIndex, tagIndex);
            fragment.appendChild(newEl);

            if (tagIndex < group.length - 1) {
                fragment.appendChild(createOperatorElement('AND', groupIndex, false, tagIndex));
            }
        });

        fragment.appendChild(document.createTextNode(')')); // End group
    });

    queryArea.appendChild(fragment);
}

function createQueryElement(item, groupIndex, tagIndex) {
    const newEl = document.createElement('span');

    // Add data attributes for indices
    newEl.dataset.groupIndex = groupIndex;
    newEl.dataset.tagIndex = tagIndex;

    if (item.title) {
        newEl.classList.add('itags-search-note', item.negated ? 'negated' : 'selected');
        newEl.textContent = item.title.slice(0, 20) + (item.title.length >= 20 ? '...' : '');
        newEl.title = item.title;
        if (item.negated) {
            newEl.textContent = `! ${newEl.textContent}`;
        }
    } else if (item.tag) {
        newEl.classList.add('itags-search-tag', item.negated ? 'negated' : 'selected');
        newEl.textContent = item.negated ? `! ${item.tag}` : item.tag;
    } else if (item.minValue || item.maxValue) {
        newEl.classList.add('itags-search-tag', 'selected', 'range');
        newEl.textContent = `${item.minValue || ''} -> ${item.maxValue || ''}`;
    }

    // Add click handler for negation toggle
    if (item.tag || item.title) {
        addEventListenerWithTracking(newEl, 'click', () => {
            toggleTagNegation(groupIndex, tagIndex);
            updateQueryArea();
        });
    }

    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('itags-search-tagDelete');
    deleteBtn.textContent = 'x';
    addEventListenerWithTracking(deleteBtn, 'click', (e) => {
        e.stopPropagation();
        removeTagFromGroup(groupIndex, tagIndex);
        updateQueryArea();
    });
    newEl.appendChild(deleteBtn);

    return newEl;
}

function updateResultsArea() {
    // Don't update if we're still waiting for search results
    if (isSearching) {
        return;
    }

    // Filter results
    const filter = resultFilter.value;
    // Clear existing results and event listeners
    clearNode(resultsArea);

    let displayedNoteCount = 0;
    for (let index = 0; index < results.length; index++) {
        const result = results[index];
        const resultEl = document.createElement('div');
        resultEl.classList.add('itags-search-resultNote');
        if (result.color) {
            if (resultColorProperty === 'border') {
                resultEl.style.borderColor = result.color;
                resultEl.style.borderWidth = '2px';
            } else if (resultColorProperty === 'background') {
                resultEl.style.backgroundColor = result.color;
            }
        }
        const titleEl = document.createElement('h3');
        titleEl.style.cursor = 'pointer';

        // Add note icon with link info
        const openLink = document.createElement('span');
        openLink.innerHTML = '&larr;';
        openLink.style.marginRight = '5px';
        addEventListenerWithTracking(openLink, 'click', (event) => {
            event.stopPropagation();
            webviewApi.postMessage({
                name: 'openNote',
                externalId: ':/' + result.externalId,
                line: Math.min(...result.lineNumbers[0]),
            });
        });

        const titleText = document.createTextNode(result.title);

        titleEl.appendChild(openLink);
        titleEl.appendChild(titleText);
        resultEl.appendChild(titleEl);

        const contentContainer = document.createElement('div');
        contentContainer.classList.add('itags-search-resultContent');
        contentContainer.setAttribute('data-externalId', result.externalId);
        contentContainer.setAttribute('data-color', result.color);
        contentContainer.setAttribute('data-card-key', getCardKey(result));

        // Create a composite key for note state lookup
        const stateKey = getCardKey(result);

        // Determine display state based on saved state or default
        if (stateKey in noteState) {
            // Use saved state (true = expanded/display:block, false = collapsed/display:none)
            contentContainer.style.display = noteState[stateKey] ? 'block' : 'none';
        } else {
            // Default based on global setting
            let defaultExpanded = true; // Safe fallback if settings not received yet
            if (resultToggleState !== null) {
                defaultExpanded = resultToggleState === 'expand';
            }
            contentContainer.style.display = defaultExpanded ? 'block' : 'none';
            noteState[stateKey] = defaultExpanded;
        }

        const parsedFilter = parseFilter(filter, min_chars=2);
        // Filter out exclusion patterns for highlighting
        const inclusionPatterns = parsedFilter.filter(pattern => !pattern.startsWith('!'));
        let filterRegExp = null;
        if (inclusionPatterns.length > 0) {
            try {
                filterRegExp = new RegExp(`(?<!<[^>]*)(${inclusionPatterns.join('|')})(?![^<]*>)`, 'gi');
            } catch (error) {
                console.warn('Tag Navigator: Invalid regex for highlighting:', inclusionPatterns, error);
                // Fall back to simple regex without lookbehind/lookahead
                try {
                    filterRegExp = new RegExp(`(${inclusionPatterns.join('|')})`, 'gi');
                } catch (fallbackError) {
                    console.warn('Tag Navigator: Fallback regex also failed, disabling highlighting:', fallbackError);
                    filterRegExp = null;
                }
            }
        }

        // Apply title highlighting once before processing content sections
        if (resultMarker && (inclusionPatterns.length > 0)) {
            const highlightedTitle = highlightText(result.title, inclusionPatterns, 'itags-search-renderedFilter');
            titleEl.innerHTML = highlightedTitle;
            titleEl.insertBefore(openLink, titleEl.firstChild);
        }

        let hasContent = false;
        for (let index = 0; index < result.html.length; index++) {
            if (!containsFilter(result.text[index], filter, min_chars=2, otherTarget='|' + result.title + '|' + result.notebook)) {
                continue;
            }
            hasContent = true;

            // Context expansion: determine current level and select appropriate HTML
            const stateKey = `${getCardKey(result)}|${index}`;
            const currentLevel = sectionExpandLevel[stateKey] || 0;
            const maxLevel = result.expandLevels?.[index] || 0;

            // Select HTML based on current expansion level
            let entry;
            if (currentLevel === 0 || !result.htmlExpanded?.[index]) {
                entry = result.html[index];
            } else {
                // htmlExpanded[sectionIndex][levelIndex] where levelIndex is 0-based (level 1 = index 0)
                entry = result.htmlExpanded[index][currentLevel - 1] || result.html[index];
            }

            if (resultMarker && (inclusionPatterns.length > 0)) {
                // Apply highlighting to already rendered HTML while preserving structure
                entry = highlightTextInHTML(entry, inclusionPatterns, 'itags-search-renderedFilter');
            }

            const entryEl = document.createElement('div');
            entryEl.classList.add('itags-search-resultSection');
            entryEl.dataset.expandLevel = currentLevel;  // Store for click handlers

            // SECURITY FIX: Sanitize HTML before DOM insertion
            entryEl.innerHTML = sanitizeHTML(entry);
            // Use correct text based on expansion level
            const textForLineNumbers = (currentLevel === 0 || !result.textExpanded?.[index]?.[currentLevel - 1])
                ? result.text[index]
                : result.textExpanded[index][currentLevel - 1];
            addLineNumberToCheckboxes(entryEl, textForLineNumbers);
            entryEl.style.cursor = 'pointer';

            // Adjust task list item positioning
            entryEl.querySelectorAll('.itags-search-resultSection > .contains-task-list > .task-list-item').forEach(item => {
                item.style.position = 'relative';
                item.style.left = '-15px';
            });

            // Add expand control if context expansion is available
            if (maxLevel > 0) {
                const expandEl = document.createElement('div');
                expandEl.className = 'itags-search-expandContext';
                // Show ↑ when can expand more (reveal context above), ↓ when at max (collapse)
                expandEl.textContent = currentLevel < maxLevel ? '↑' : '↓';
                expandEl.title = currentLevel < maxLevel ? 'Show more context' : 'Show less context';
                addEventListenerWithTracking(expandEl, 'click', (e) => {
                    e.stopPropagation();  // Prevent triggering section click
                    // Cycle through levels: 0 -> 1 -> 2 -> 3 -> 0
                    sectionExpandLevel[stateKey] = (currentLevel + 1) % (maxLevel + 1);
                    updateResultsArea();  // Re-render
                });
                entryEl.appendChild(expandEl);
            }

            // Add click handlers
            addEventListenerWithTracking(entryEl, 'click', createClickHandler(result, index));
            addEventListenerWithTracking(entryEl, 'contextmenu', createContextMenuHandler(result, index));

            contentContainer.appendChild(entryEl);
            contentContainer.appendChild(document.createElement('hr'));
        }

        if (!hasContent) {
            continue;
        }

        // Remove last divider
        if (contentContainer.lastElementChild) {
            contentContainer.removeChild(contentContainer.lastElementChild);
        }

        resultEl.appendChild(contentContainer);
        resultsArea.appendChild(resultEl);
        displayedNoteCount++;

        // Add title click handler that updates the state
        addEventListenerWithTracking(titleEl, 'click', () => {
            const isCollapsed = contentContainer.style.display === 'none';
            contentContainer.style.display = isCollapsed ? 'block' : 'none';
            // Update the note state with the new state (after toggling)
            // true means expanded (display:block), false means collapsed (display:none)
            updateNoteState(getCardKey(result), isCollapsed ? true : false);
        });

        // Add right-click context menu handler for note titles
        addEventListenerWithTracking(titleEl, 'contextmenu', (event) => {
            createContextMenu(event, null, null, ['resultGrouping']);
        });

        // Add spacing between notes
        const resultSpace = document.createElement('div');
        resultSpace.classList.add('itags-search-resultSpace');
        resultsArea.appendChild(resultSpace);
    }

    // Show helpful message when no results (but not while still searching)
    if (displayedNoteCount === 0 && !isSearching && queryGroups.some(group => group.length > 0)) {
        const noResultsMsg = document.createElement('div');
        noResultsMsg.className = 'itags-search-statusMessage';
        if (results.length === 0) {
            noResultsMsg.innerHTML = 'No results found.<br><span class="itags-search-statusHint">Try different tags or use OR to broaden your search.</span>';
        } else {
            noResultsMsg.innerHTML = 'No results match filter.<br><span class="itags-search-statusHint">Try adjusting your filter text.</span>';
        }
        resultsArea.appendChild(noResultsMsg);
    }

    // Update result count display
    updateResultCount(displayedNoteCount, filter);

    // Remove last spacing
    if (resultsArea.lastElementChild && resultsArea.lastElementChild.classList.contains('itags-search-resultSpace')) {
        resultsArea.removeChild(resultsArea.lastElementChild);
    }
}

// Helper function to create click handler
function createClickHandler(result, index) {
    return (event) => {
        // Get expansion level to use correct line mapping
        const expandLevel = parseInt(event.currentTarget.dataset.expandLevel) || 0;

        // Helper to get correct file line number based on expansion level
        const getFileLine = (localLine) => {
            if (expandLevel === 0 || !result.lineNumbersExpanded?.[index]?.[expandLevel - 1]) {
                return result.lineNumbers[index][localLine];
            }
            return result.lineNumbersExpanded[index][expandLevel - 1][localLine];
        };

        // Helper to get correct text based on expansion level
        const getText = () => {
            if (expandLevel === 0 || !result.textExpanded?.[index]?.[expandLevel - 1]) {
                return result.text[index];
            }
            return result.textExpanded[index][expandLevel - 1];
        };

        if (event.target.matches('.task-list-item-checkbox')) {
            const line = parseInt(event.target.getAttribute('data-line-number'));
            webviewApi.postMessage({
                name: 'setCheckBox',
                externalId: result.externalId,
                line: getFileLine(line),
                text: getText().split('\n')[line].trim(),
                source: event.target.checked ? ' ' : '[xX]',
                target: event.target.checked ? 'x' : ' ',
            });
        } else if (event.target.matches('.itags-search-checkbox')) {
            const line = parseInt(event.target.getAttribute('data-line-number'));
            webviewApi.postMessage({
                name: 'setCheckBox',
                externalId: result.externalId,
                line: getFileLine(line),
                text: getText().split('\n')[line].trim(),
                source: getCheckboxState(event.target),
                target: event.target.getAttribute('data-checked') === 'true' ? ' ' : 'x',
            });
        } else if (event.target.matches('a')) {
            event.preventDefault();
            let externalId = event.target.href;
            const prefix = 'services/plugins/';
            let i = externalId.indexOf(prefix);
            if (i !== -1) {
                externalId = externalId.slice(i + prefix.length);
            }
            webviewApi.postMessage({
                name: 'openNote',
                externalId: externalId ? externalId : event.target.textContent,
                line: -1,
            });
        } else {
            // Get the longest consecutive text segment from the clicked element
            const clickedText = Array.from(event.target.childNodes)
                .reduce((longest, node) => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const text = node.textContent.trim();
                        return text.length > longest.length ? text : longest;
                    }
                    return longest;
                }, '');

            // Get the source text and split into lines
            const sourceText = getText();
            const lines = sourceText.split('\n');

            // Find the line containing the clicked text
            let foundLine = 0;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(clickedText)) {
                    foundLine = i;
                    break;
                }
            }

            webviewApi.postMessage({
                name: 'openNote',
                externalId: ':/' + result.externalId,
                line: getFileLine(foundLine) || getFileLine(0),
            });
        }
    };
}

// Helper function to create context menu handler
function createContextMenuHandler(result, index) {
    return (event) => {
        const contextMenu = document.querySelectorAll('.itags-search-contextMenu');
        contextMenu.forEach(menu => {
            if (!menu.contains(event.target)) {
                menu.remove();
            }
        });
        // Get expansion level from the section element
        const expandLevel = parseInt(event.currentTarget.dataset.expandLevel) || 0;
        if (event.target.matches('.itags-search-renderedTag')) {
            createContextMenu(event, result, index, undefined, expandLevel);
        }
        if (event.target.matches('.itags-search-checkbox')) {
            createContextMenu(event, result, index, ['checkboxState'], expandLevel);
        }
    };
}

// Helper function to update tag count display
function updateTagCount(displayedTagCount, filter) {
    if (filter) {
        tagCount.textContent = displayedTagCount;
        tagCount.style.display = 'block';
        // Position the count relative to the input
        const inputRect = tagFilter.getBoundingClientRect();
        tagCount.style.top = `${inputRect.top + (inputRect.height - tagCount.offsetHeight) / 2}px`;
        tagCount.style.left = `${inputRect.right - tagCount.offsetWidth - 5}px`;
    } else {
        tagCount.style.display = 'none';
    }

    // Update tagFilter placeholder (only when no text entered)
    if (!tagFilter.value) {
        tagFilter.placeholder = `Filter ${displayedTagCount} tags...`;
    }
}

// Helper function to update result count display
function updateResultCount(displayedNoteCount, filter) {
    if (filter) {
        resultCount.textContent = displayedNoteCount;
        resultCount.style.display = 'block';
        // Position the count relative to the input
        const inputRect = resultFilter.getBoundingClientRect();
        resultCount.style.top = `${inputRect.top + (inputRect.height - resultCount.offsetHeight) / 2}px`;
        resultCount.style.left = `${inputRect.right - resultCount.offsetWidth - 5}px`;
    } else {
        resultCount.style.display = 'none';
    }

    // Update resultFilter placeholder (only when no text entered)
    if (!resultFilter.value) {
        resultFilter.placeholder = `Filter ${displayedNoteCount} results...`;
    }
}

// Helper functions for updating the query area
function addEventListenerWithTracking(element, event, listener) {
    // Remove any existing listeners for this event type
    if (eventListenersMap.has(element)) {
        const listeners = eventListenersMap.get(element);
        for (const entry of listeners) {
            if (entry.event === event) {
                element.removeEventListener(event, entry.listener);
                listeners.delete(entry);
            }
        }
    } else {
        eventListenersMap.set(element, new Set());
    }
    
    // Add the new listener
    element.addEventListener(event, listener);
    eventListenersMap.get(element).add({ event, listener });
}

function removeEventListeners(element) {
    if (eventListenersMap.has(element)) {
        const listeners = eventListenersMap.get(element);
        listeners.forEach(({ event, listener }) => {
            element.removeEventListener(event, listener);
        });
        eventListenersMap.delete(element);
    }
}

function clearNode(node) {
    // Only walk the children, not the root node
    for (let child of node.childNodes) {
        const walk = node => {
            if (!node) return;
            removeEventListeners(node);
            for (let childNode of node.childNodes) {
                walk(childNode);
            }
        };
        walk(child);
    }

    // Then remove all children
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

function createOperatorElement(operator, groupIndex, isGroupOperator, tagIndex) {
    const operatorEl = document.createElement('span');
    operatorEl.classList.add('itags-search-operator');
    operatorEl.textContent = ` ${operator} `;
    operatorEl.onclick = () => {
        if (isGroupOperator) {
            mergeGroups(groupIndex);
        } else {
            splitGroup(groupIndex, tagIndex);
        }
        updateQueryArea();
    };
    return operatorEl;
}

function mergeGroups(groupIndex) {
    if (groupIndex < queryGroups.length - 1) {
        // Merge current and next group with deduplication
        const mergedGroup = [...queryGroups[groupIndex], ...queryGroups[groupIndex + 1]];
        const uniqueMergedGroup = mergedGroup.reduce((acc, current) => {
            let x;
            if (current.tag) {
                x = acc.find(item => item.tag === current.tag);
            } else if (current.externalId) {
                x = acc.find(item => item.externalId === current.externalId);
            }
            if (!x) {
                return acc.concat([current]);
            } else {
                return acc;
            }
        }, []);
        queryGroups.splice(groupIndex, 2, uniqueMergedGroup);
    }
}

function splitGroup(groupIndex, tagIndex) {
    const groupToSplit = queryGroups[groupIndex];
    const firstPart = groupToSplit.slice(0, tagIndex + 1);
    const secondPart = groupToSplit.slice(tagIndex + 1);
    if (secondPart.length > 0) {
        // Split into two groups if the second part has elements
        queryGroups.splice(groupIndex, 1, firstPart, secondPart);
    }
}

function toggleTagNegation(groupIndex, tagIndex) {
    queryGroups[groupIndex][tagIndex].negated = !queryGroups[groupIndex][tagIndex].negated;
    updateQueryArea();
}

function removeTagFromGroup(groupIndex, tagIndex) {
    // Remove tag from the specified group
    queryGroups[groupIndex].splice(tagIndex, 1);
    if (queryGroups[groupIndex].length === 0) {
        // Remove the group if empty
        queryGroups.splice(groupIndex, 1);
    }
    updateQueryArea();
}

function handleTagClick(tag) {
    let lastGroup = queryGroups[queryGroups.length - 1];
    let tagExistsInLastGroup = lastGroup && lastGroup.some(t => t.tag === tag);

    if (!lastGroup) {
        // Create a new group if there's no last group
        lastGroup = [{ tag: tag, negated: false }];
        queryGroups.push(lastGroup);
    } else if (!tagExistsInLastGroup) {
        // Add tag to the last group if it doesn't exist
        lastGroup.push({ tag: tag, negated: false });
    } else {
        // Toggle negation if the tag exists in the last group
        let tagObject = lastGroup.find(t => t.tag === tag);
        tagObject.negated = !tagObject.negated;
    }
    updateQueryArea();
    tagFilter.value = '';
    tagFilter.focus();
    updateTagList();
}

function handleRangeClick(minValue, maxValue) {
    let lastGroup = queryGroups[queryGroups.length - 1];
    let tagExistsInLastGroup = lastGroup && lastGroup.some(t => t.minValue === minValue && t.maxValue === maxValue);

    if (!lastGroup) {
        // Create a new group if there's no last group
        lastGroup = [{ minValue: minValue, maxValue: maxValue }];
        queryGroups.push(lastGroup);
    } else if (!tagExistsInLastGroup) {
        // Add tag to the last group if it doesn't exist
        lastGroup.push({ minValue: minValue, maxValue: maxValue });
    }
    updateQueryArea();
}

function handleNoteClick(note) {
    if (!note) {
        return;
    }
    let lastGroup = queryGroups[queryGroups.length - 1];
    let noteExistsInLastGroup = lastGroup && lastGroup.some(n => n.title === note.title && n.externalId === note.externalId);

    if (!lastGroup) {
        // Create a new group if there's no last group
        lastGroup = [{ title: note.title, externalId: note.externalId, negated: false}];
        queryGroups.push(lastGroup);
    } else if (!noteExistsInLastGroup) {
        // Add note to the last group if it doesn't exist
        lastGroup.push({ title: note.title, externalId: note.externalId, negated: false });
    } else {
        // Toggle negation if the note exists in the last group
        let noteObject = lastGroup.find(n => n.title === note.title);
        noteObject.negated = !noteObject.negated;
    }
    updateQueryArea();
}

function toggleLastOperator() {
    // Change the last operator between "AND" and "OR"
    // using the splitGroup / mergeGroups functions
    let lastGroup = queryGroups[queryGroups.length - 1];
    if (lastGroup.length === 0) {
        return;
    } else if (lastGroup.length > 1) {
        splitGroup(queryGroups.length - 1, lastGroup.length - 2);
    } else if (queryGroups.length > 1){
        mergeGroups(queryGroups.length - 2);
    }
    updateQueryArea();
}

function toggleLastTagOrNote() {
    // Toggle the negation of the last tag
    let lastGroup = queryGroups[queryGroups.length - 1];
    if (lastGroup) {
        let lastEl = lastGroup[lastGroup.length - 1];
        lastEl.negated = !lastEl.negated;
        updateQueryArea();
    }
}

// Helper functions for clearing areas
function clearQueryArea() {
    // For example, clear the innerHTML of the query area
    queryGroups = []; // Reset the query groups
    lastGroup = queryGroups[0];
    clearNode(queryArea);
    resultFilter.placeholder = "Filter results..."; // Reset placeholder to default
}

function clearResultsArea() {
    clearNode(resultsArea);
    updateResultCount(0, false);
}

// Helper functions for search
function sendSearchMessage() {
    const searchQuery = JSON.stringify(queryGroups);
    isSearching = true;

    // Show "Searching..." message while waiting for results
    clearNode(resultsArea);
    const searchingMsg = document.createElement('div');
    searchingMsg.className = 'itags-search-statusMessage';
    searchingMsg.textContent = 'Searching...';
    resultsArea.appendChild(searchingMsg);

    // Use webviewApi.postMessage to send the search query back to the plugin
    webviewApi.postMessage({
        name: 'searchQuery',
        query: searchQuery,
    });
}

function sendInsertMessage(tag) {
    webviewApi.postMessage({
        name: 'insertTag',
        tag: tag,
    });
}

function sendFocusEditorMessage() {
    webviewApi.postMessage({
        name: 'focusEditor',
    });
}

function sendSetting(field, value) {
    webviewApi.postMessage({
        name: 'updateSetting',
        field: field,
        value: value,
    })
}

function resetToGlobalSettings() {
    webviewApi.postMessage({
        name: 'resetToGlobalSettings'
    });
}

/** Extract sort key from a tag for sorting by its values/children.
 *  Uses the first parent segment so that deeply nested tags (e.g., //2025/01/24)
 *  all share the same sort key and compare correctly across branches. */
function extractSortKey(tag) {
    // Strip tag prefix (e.g., #)
    const clean = tag.startsWith(tagPrefix) ? tag.slice(tagPrefix.length) : tag;
    if (!clean) return null;
    if (clean.includes(valueDelim)) {
        const key = clean.split(valueDelim)[0];
        return key || null;
    }
    const firstSlash = clean.indexOf('/');
    if (firstSlash > 0 && firstSlash < clean.length - 1) {
        return clean.substring(0, firstSlash);
    }
    // Tag starts with '/' — find the first non-empty parent segment
    // e.g., //2025/01/25 → '/', /hello/world → '/hello'
    // Mirrors parser.ts nested tag generation: parts.slice(0, i).join('/')
    if (firstSlash === 0) {
        const nextSlash = clean.indexOf('/', 1);
        if (nextSlash > 0 && nextSlash < clean.length - 1) {
            return clean.substring(0, nextSlash);
        }
    }
    return null;
}

function sendClearQuery() {
    webviewApi.postMessage({
        name: 'clearQuery'
    });
}

function addLineNumberToCheckboxes(entryEl, text) {
    const textContent = text
        .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')  // strip links
        .replace(/\[\[([^\]]+)\]\]/g, '$1')  // strip wikilinks
        .replace(/`([^`]+)`/g, '$1')  // strip inline code
        .replace(/(?<!\w)\*\*(.*?)\*\*(?!\w)/g, '$1')  // strip bold
        .replace(/(?<!\w)__(.*?)__(?!\w)/g, '$1')  // strip bold
        .replace(/(?<!\w)\*(.*?)\*(?!\w)/g, '$1')  // strip italic
        .replace(/(?<!\w)_(.*?)_(?!\w)/g, '$1')  // strip italic
        .replace(/~~(.*?)~~/g, '$1')  // strip strikethrough
        .split('\n');
    let lineNumber = 0;
    let checkboxes = entryEl.querySelectorAll('input[type="checkbox"]');

    checkboxes.forEach(checkbox => {
        // Increment line number until the next checkbox is reached in the text content
        while (lineNumber < textContent.length && !textContent[lineNumber].includes(checkbox.nextSibling.textContent.trim())) {
            lineNumber++;
        }
        // Set the data-line-number attribute to the calculated line number
        checkbox.setAttribute('data-line-number', lineNumber);
    });

    // Custom coloured checkboxes
    checkboxes = entryEl.querySelectorAll('.itags-search-checkbox');
    lineNumber = 0;
    checkboxes.forEach(checkbox => {
        // Increment line number until the next checkbox is reached in the text content
        while (lineNumber < textContent.length && !textContent[lineNumber].includes(checkbox.nextSibling.textContent.trim())) {
            lineNumber++;
        }
        // Set the data-line-number attribute to the calculated line number
        checkbox.setAttribute('data-line-number', lineNumber);
    });
}

function getCheckboxState(checkbox) {
    try {
        if (checkbox.classList.contains('xitOpen')) {
            return ' ';
        } else if (checkbox.classList.contains('xitInQuestion')) {
            return '\\?';
        } else if (checkbox.classList.contains('xitOngoing')) {
            return '@';
        } else if (checkbox.classList.contains('xitBlocked')) {
            return '!';
        } else if (checkbox.classList.contains('xitDone')) {
            return '[xX]';
        } else if (checkbox.classList.contains('xitObsolete')) {
            return '~';
        } else {
            return null;
        }
    } catch (e) {
        console.error(e);
    }
}

function addLineNumberToTags(entryEl, text) {
    const textContent = text.split('\n');
    let lineNumber = 0;
    // Use querySelectorAll instead of find to select tags
    const tags = entryEl.querySelectorAll('.itags-search-renderedTag');
  
    tags.forEach(tag => {
        // Increment line number until the next tag is reached in the text content
        while (lineNumber < textContent.length && !textContent[lineNumber].includes(tag.textContent.trim())) {
            lineNumber++;
        }
        // Set the data-line-number attribute to the calculated line number
        tag.setAttribute('data-line-number', lineNumber);
        lineNumber++;
    });
}

function createContextMenu(event, result=null, index=null, commands=['insertTag', 'searchTag', 'extendQuery', 'sortByTag', 'addToSort', 'addTag', 'replaceTag', 'replaceAll', 'removeTag', 'removeAll'], expandLevel=0) {
    // Prevent the default context menu from appearing
    event.preventDefault();

    // Get the tag element and its text content
    const target = event.target;
    let currentTag = target.textContent;
    if (target.classList.contains('selected')) {
        currentTag = currentTag.slice(0, -1);
    }
    if (target.classList.contains('negated')) {
        currentTag = currentTag.slice(2, -1);
    }
    const line = parseInt(target.getAttribute('data-line-number'));

    // Helper to get correct file line number based on expansion level
    const getFileLine = (localLine) => {
        if (expandLevel === 0 || !result?.lineNumbersExpanded?.[index]?.[expandLevel - 1]) {
            return result?.lineNumbers?.[index]?.[localLine];
        }
        return result.lineNumbersExpanded[index][expandLevel - 1][localLine];
    };

    // Helper to get correct text based on expansion level
    const getText = () => {
        if (expandLevel === 0 || !result?.textExpanded?.[index]?.[expandLevel - 1]) {
            return result?.text?.[index];
        }
        return result.textExpanded[index][expandLevel - 1];
    };

    // Create the custom context menu container and position off-screen immediately
    const contextMenu = document.createElement('div');
    contextMenu.classList.add('itags-search-contextMenu');
    contextMenu.style.position = 'absolute';
    contextMenu.style.left = '-9999px';
    contextMenu.style.top = '-9999px';
    document.body.appendChild(contextMenu);
    
    // Create fragment to batch DOM updates
    const fragment = document.createDocumentFragment();
    let cmdCount = 0;

    if (commands.includes('checkboxState')) {
        const xitOpen = document.createElement('span');
        xitOpen.classList.add('itags-search-contextCommand');
        if (target.classList.contains('xitOpen')) {
            xitOpen.textContent = `✓ Open`;
        } else {
            xitOpen.textContent = `Open`;
        }
        addEventListenerWithTracking(xitOpen, 'click', () => {
            webviewApi.postMessage({
                name: 'setCheckBox',
                externalId: result.externalId,
                line: getFileLine(line),
                text: getText().split('\n')[line].trim(),
                source: getCheckboxState(target),
                target: ' ',
            });
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(xitOpen);
        cmdCount++;

        const xitInQuestion = document.createElement('span');
        xitInQuestion.classList.add('itags-search-contextCommand');
        if (target.classList.contains('xitInQuestion')) {
            xitInQuestion.textContent = `✓ In question`;
        } else {
            xitInQuestion.textContent = `In question`;
        }
        addEventListenerWithTracking(xitInQuestion, 'click', () => {
            webviewApi.postMessage({
                name: 'setCheckBox',
                externalId: result.externalId,
                line: getFileLine(line),
                text: getText().split('\n')[line].trim(),
                source: getCheckboxState(target),
                target: '?',
            });
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(xitInQuestion);
        cmdCount++;

        const xitOngoing = document.createElement('span');
        xitOngoing.classList.add('itags-search-contextCommand');
        if (target.classList.contains('xitOngoing')) {
            xitOngoing.textContent = `✓ Ongoing`;
        } else {
            xitOngoing.textContent = `Ongoing`;
        }
        addEventListenerWithTracking(xitOngoing, 'click', () => {
            webviewApi.postMessage({
                name: 'setCheckBox',
                externalId: result.externalId,
                line: getFileLine(line),
                text: getText().split('\n')[line].trim(),
                source: getCheckboxState(target),
                target: '@',
            });
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(xitOngoing);
        cmdCount++;

        const xitBlocked = document.createElement('span');
        xitBlocked.classList.add('itags-search-contextCommand');
        if (target.classList.contains('xitBlocked')) {
            xitBlocked.textContent = `✓ Blocked`;
        } else {
            xitBlocked.textContent = `Blocked`;
        }
        addEventListenerWithTracking(xitBlocked, 'click', () => {
            webviewApi.postMessage({
                name: 'setCheckBox',
                externalId: result.externalId,
                line: getFileLine(line),
                text: getText().split('\n')[line].trim(),
                source: getCheckboxState(target),
                target: '!',
            });
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(xitBlocked);
        cmdCount++;

        const xitObsolete = document.createElement('span');
        xitObsolete.classList.add('itags-search-contextCommand');
        if (target.classList.contains('xitObsolete')) {
            xitObsolete.textContent = `✓ Obsolete`;
        } else {
            xitObsolete.textContent = `Obsolete`;
        }
        addEventListenerWithTracking(xitObsolete, 'click', () => {
            webviewApi.postMessage({
                name: 'setCheckBox',
                externalId: result.externalId,
                line: getFileLine(line),
                text: getText().split('\n')[line].trim(),
                source: getCheckboxState(target),
                target: '~',
            });
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(xitObsolete);
        cmdCount++;

        const xitDone = document.createElement('span');
        xitDone.classList.add('itags-search-contextCommand');
        if (target.classList.contains('xitDone')) {
            xitDone.textContent = `✓ Done`;
        } else {
            xitDone.textContent = `Done`;
        }
        addEventListenerWithTracking(xitDone, 'click', () => {
            webviewApi.postMessage({
                name: 'setCheckBox',
                externalId: result.externalId,
                line: getFileLine(line),
                text: getText().split('\n')[line].trim(),
                source: getCheckboxState(target),
                target: 'x',
            });
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(xitDone);
        cmdCount++;
    }

    if (commands.includes('insertTag')) {
        if (cmdCount > 0) {
            // Add a separator between the checkbox states and the other commands
            const separator = document.createElement('hr');
            separator.classList.add('itags-search-contextSeparator');
            fragment.appendChild(separator);
        }
        const insertTag = document.createElement('span');
        insertTag.classList.add('itags-search-contextCommand');
        insertTag.textContent = `Insert tag`;
        addEventListenerWithTracking(insertTag, 'click', () => {
            sendInsertMessage(currentTag);
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(insertTag);
        cmdCount++;
    }

    if (commands.includes('searchTag')) {
        // Create the "Search tag" command
        const searchTag = document.createElement('span');
        searchTag.classList.add('itags-search-contextCommand');
        searchTag.textContent = `Search tag`;
        addEventListenerWithTracking(searchTag, 'click', () => {
            clearQueryArea();
            clearResultsArea();
            tagFilter.value = '';
            tagRangeMin.value = '';
            tagRangeMax.value = '';
            noteFilter.value = '';
            resultFilter.value = '';
            sendSetting('filter', '');
            resetToGlobalSettings(); // Reset to global settings for new searches
            handleTagClick(currentTag.toLowerCase());
            updateTagList();
            sendSearchMessage();
            clearNoteState();
            clearSectionExpandState();
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(searchTag);
        cmdCount++;
    }

    if (commands.includes('extendQuery')) {
        // Create the "Extend query" command
        const extendQuery = document.createElement('span');
        extendQuery.classList.add('itags-search-contextCommand');
        extendQuery.textContent = `Extend query`;
        addEventListenerWithTracking(extendQuery, 'click', () => {
            handleTagClick(currentTag.toLowerCase());
            sendSearchMessage();
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(extendQuery);
        cmdCount++;
    }

    if (commands.includes('editQuery')) {
        // Create the "Edit query" command
        const editQuery = document.createElement('span');
        editQuery.classList.add('itags-search-contextCommand');
        editQuery.textContent = `Edit query`;
        addEventListenerWithTracking(editQuery, 'click', () => {
            // Create an input field with the tag text
            const input = createInputField(currentTag, target, (input) => {
                const groupIndex = parseInt(target.dataset.groupIndex);
                const tagIndex = parseInt(target.dataset.tagIndex);
                if (groupIndex === undefined) { return; }
                if (tagIndex === undefined) { return; }

                const item = queryGroups[groupIndex][tagIndex];
                const negated = input.value.trim().startsWith('!');
                const currentNegated = item.negated;
                const newTag = input.value.trim();
                if (!newTag) { return; }
                if (newTag === currentTag && negated === currentNegated) { return; }

                if (newTag.includes('->')) {
                    // Convert to range
                    const parsed = parseRange(newTag);
                    if (!isValidRange(parsed.minValue, parsed.maxValue)) {
                        webviewApi.postMessage({ name: 'showWarning', message: 'Ranges require both min and max values. Use wildcards (e.g., prefix*) for open-ended searches.' });
                        return;
                    }
                    Object.assign(item, parsed);
                    delete item.tag;
                    delete item.negated;
                } else {
                    // Convert to regular tag
                    delete item.minValue;
                    delete item.maxValue;
                    if (negated) {
                        item.tag = newTag.slice(1);
                        item.negated = true;
                    } else {
                        item.tag = newTag;
                        item.negated = false;
                    }
                    item.tag = item.tag
                        .trim()
                        .toLowerCase()
                        .replace(RegExp('\\s', 'g'), spaceReplace);
                }
                updateQueryArea();
                sendSearchMessage();
            });
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(editQuery);
        cmdCount++;
    }

    if ((cmdCount > 0) && (commands.includes('sortByTag') || commands.includes('addToSort'))
        && extractSortKey(currentTag) !== null) {
        const separator = document.createElement('hr');
        separator.classList.add('itags-search-contextSeparator');
        fragment.appendChild(separator);
    }

    if (commands.includes('sortByTag') && extractSortKey(currentTag) !== null) {
        const sortKey = extractSortKey(currentTag);
        const sortByTag = document.createElement('span');
        sortByTag.classList.add('itags-search-contextCommand');
        sortByTag.textContent = `Sort by tag`;
        addEventListenerWithTracking(sortByTag, 'click', () => {
            // Add custom option to dropdown if needed
            if (!Array.from(resultSort.options).some(opt => opt.value === sortKey)) {
                const option = document.createElement('option');
                option.value = sortKey;
                option.text = sortKey;
                resultSort.add(option);
            }
            resultSort.value = sortKey;
            resultSort.setAttribute('data-prev-value', sortKey);
            updateResultOrderDisplay('asc');
            sendSetting('resultSort', sortKey);
            sendSetting('resultOrder', 'asc');
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(sortByTag);
        cmdCount++;
    }

    if (commands.includes('addToSort') && extractSortKey(currentTag) !== null) {
        const sortKey = extractSortKey(currentTag);
        const addToSort = document.createElement('span');
        addToSort.classList.add('itags-search-contextCommand');
        addToSort.textContent = `Add to sort`;
        addEventListenerWithTracking(addToSort, 'click', () => {
            const currentSortKeys = resultSort.value ? resultSort.value.split(',').map(s => s.trim()) : [];
            // Skip if key already present
            if (!currentSortKeys.includes(sortKey)) {
                const newSortBy = currentSortKeys.length > 0
                    ? currentSortKeys.join(',') + ',' + sortKey
                    : sortKey;
                const currentOrder = resultOrder.title || 'desc';
                const newOrder = currentOrder + ',asc';

                // Update dropdown with combined sort key
                if (!Array.from(resultSort.options).some(opt => opt.value === newSortBy)) {
                    const option = document.createElement('option');
                    option.value = newSortBy;
                    option.text = newSortBy;
                    resultSort.add(option);
                }
                resultSort.value = newSortBy;
                resultSort.setAttribute('data-prev-value', newSortBy);
                updateResultOrderDisplay(newOrder);
                sendSetting('resultSort', newSortBy);
                sendSetting('resultOrder', newOrder);
            }
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(addToSort);
        cmdCount++;
    }

    if ((cmdCount > 0) && commands.includes('replaceAll')) {
        const separator = document.createElement('hr');
        separator.classList.add('itags-search-contextSeparator');
        fragment.appendChild(separator);
    }
    if (commands.includes('addTag')) {
        // Create the "Add tag" command
        const addTag = document.createElement('span');
        addTag.classList.add('itags-search-contextCommand');
        addTag.textContent = `Add tag`;
        addEventListenerWithTracking(addTag, 'click', () => {
            // Create an input field to add a new tag
            const input = createInputField('#new-tag', target, (input) => {
                const newTag = input.value;
                if (newTag && newTag !== '#new-tag') {
                    webviewApi.postMessage({
                        name: 'addTag',
                        externalId: result.externalId,
                        line: getFileLine(line),
                        text: getText().split('\n')[line].trim(),
                        tag: newTag,
                    });
                }
            });
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(addTag);
        cmdCount++;
    }

    if (commands.includes('replaceTag')) {
        // Create the "Replace tag" command
        const replaceTag = document.createElement('span');
        replaceTag.classList.add('itags-search-contextCommand');
        replaceTag.textContent = `Replace tag`;
        addEventListenerWithTracking(replaceTag, 'click', () => {
            // Create an input field with the tag text
            const input = createInputField(currentTag, target, (input) => {
                const newTag = input.value;
                if (newTag && newTag !== currentTag) {
                    webviewApi.postMessage({
                        name: 'replaceTag',
                        externalId: result.externalId,
                        line: getFileLine(line),
                        text: getText().split('\n')[line].trim(),
                        oldTag: currentTag,
                        newTag: newTag,
                    });
                }
            });
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(replaceTag);
        cmdCount++;
    }

    if (commands.includes('replaceAll')) {
        // Create the "Replace all" command
        const replaceAll = document.createElement('span');
        replaceAll.classList.add('itags-search-contextCommand');
        replaceAll.textContent = `Replace all`;
        addEventListenerWithTracking(replaceAll, 'click', () => {
            // Create an input field with the tag text
            const input = createInputField(currentTag, target, (input) => {
                const newTag = input.value;
                if (newTag && newTag !== currentTag) {
                    webviewApi.postMessage({
                        name: 'replaceAll',
                        oldTag: currentTag,
                        newTag: newTag,
                    });
                }
            });
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(replaceAll);
        cmdCount++;
    }

    if (commands.includes('removeTag')) {
        // Create the "Remove tag" command
        const removeTag = document.createElement('span');
        removeTag.classList.add('itags-search-contextCommand');
        removeTag.textContent = `Remove tag`;
        addEventListenerWithTracking(removeTag, 'click', () => {
            webviewApi.postMessage({
                name: 'removeTag',
                externalId: result.externalId,
                line: getFileLine(line),
                text: getText().split('\n')[line].trim(),
                tag: currentTag,
            });
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(removeTag);
        cmdCount++;
    }

    if (commands.includes('removeAll')) {
        // Create the "Remove all" command
        const removeAll = document.createElement('span');
        removeAll.classList.add('itags-search-contextCommand');
        removeAll.textContent = `Remove all`;
        addEventListenerWithTracking(removeAll, 'click', () => {
            webviewApi.postMessage({
                name: 'removeAll',
                tag: currentTag,
            });
            removeContextMenu(contextMenu);
        });
        fragment.appendChild(removeAll);
        cmdCount++;
    }

    // Add resultGrouping options when requested
    if (commands.includes('resultGrouping')) {
        if (cmdCount > 0) {
            const separator = document.createElement('hr');
            separator.classList.add('itags-search-contextSeparator');
            fragment.appendChild(separator);
        }

        // Result grouping options
        const groupingOptions = [
            { value: 'heading', label: 'Group by heading' },
            { value: 'consecutive', label: 'Group adjacent lines' },
            { value: 'item', label: 'Split by item' },
            { value: 'none', label: 'No grouping' }
        ];

        groupingOptions.forEach(option => {
            const groupingOption = document.createElement('span');
            groupingOption.classList.add('itags-search-contextCommand');

            // Mark the current active option with a checkmark
            if (resultGrouping === option.value) {
                groupingOption.textContent = `✓ ${option.label}`;
            } else {
                groupingOption.textContent = option.label;
            }

            addEventListenerWithTracking(groupingOption, 'click', () => {
                resultGrouping = option.value;
                sendSetting('resultGrouping', option.value);
                removeContextMenu(contextMenu);
            });

            fragment.appendChild(groupingOption);
            cmdCount++;
        });
    }

    // Default commands: show / hide sections
    if (cmdCount > 0) {
        const separator = document.createElement('hr');
        separator.classList.add('itags-search-contextSeparator');
        fragment.appendChild(separator);
    }

    const sectionState = {
        showQuery: !queryContainer.classList.contains('hidden'),
        expandedTagList: tagList.classList.contains('expandedTagList'),
        showNotes: !noteArea.classList.contains('hidden'),
        showResultFilter: !resultFilterArea.classList.contains('hidden'),
        showTagRange: !tagRangeArea.classList.contains('hidden')
    };

    // showQuery
    const showQuery = document.createElement('span');
    showQuery.classList.add('itags-search-contextCommand');
    if (sectionState.showQuery) {
        showQuery.textContent = '✓ Search query';
    } else {
        showQuery.textContent = 'Search query';
    }
    addEventListenerWithTracking(showQuery, 'click', () => {
        sectionState.showQuery = !sectionState.showQuery;
        sendSetting('showQuery', sectionState.showQuery);
        hideElements(sectionState);
        removeContextMenu(contextMenu);
    });
    fragment.appendChild(showQuery);

    // expandTagList
    const expandTagList = document.createElement('span');
    expandTagList.classList.add('itags-search-contextCommand');
    if (sectionState.expandedTagList) {
        expandTagList.textContent = '✓ Expand tags';
    } else {
        expandTagList.textContent = 'Expand tags';
    }
    addEventListenerWithTracking(expandTagList, 'click', () => {
        sectionState.expandedTagList = !sectionState.expandedTagList;
        sendSetting('expandedTagList', sectionState.expandedTagList);
        hideElements(sectionState);
        removeContextMenu(contextMenu);
    });
    fragment.appendChild(expandTagList);

    // showTagRange
    const showTagRange = document.createElement('span');
    showTagRange.classList.add('itags-search-contextCommand');
    if (sectionState.showTagRange) {
        showTagRange.textContent = '✓ Tag range';
    } else {
        showTagRange.textContent = 'Tag range';
    }
    addEventListenerWithTracking(showTagRange, 'click', () => {
        sectionState.showTagRange = !sectionState.showTagRange;
        sendSetting('showTagRange', sectionState.showTagRange);
        hideElements(sectionState);
        removeContextMenu(contextMenu);
    });
    fragment.appendChild(showTagRange);

    // showNotes
    const showNotes = document.createElement('span');
    showNotes.classList.add('itags-search-contextCommand');
    if (sectionState.showNotes) {
        showNotes.textContent = '✓ Note mentions';
    } else {
        showNotes.textContent = 'Note mentions';
    }
    addEventListenerWithTracking(showNotes, 'click', () => {
        sectionState.showNotes = !sectionState.showNotes;
        sendSetting('showNotes', sectionState.showNotes);
        hideElements(sectionState);
        removeContextMenu(contextMenu);
    });
    fragment.appendChild(showNotes);

    // showResultsFilter
    const showResultFilter = document.createElement('span');
    showResultFilter.classList.add('itags-search-contextCommand');
    if (sectionState.showResultFilter) {
        showResultFilter.textContent = '✓ Result filter';
    } else {
        showResultFilter.textContent = 'Result filter';
    }
    addEventListenerWithTracking(showResultFilter, 'click', () => {
        sectionState.showResultFilter = !sectionState.showResultFilter;
        sendSetting('showResultFilter', sectionState.showResultFilter);
        hideElements(sectionState);
        removeContextMenu(contextMenu);
    });
    fragment.appendChild(showResultFilter);

    // Add all elements at once
    contextMenu.appendChild(fragment);

    // Get measurements and calculate position
    const menuHeight = contextMenu.offsetHeight;
    const menuWidth = contextMenu.offsetWidth;
    const panelHeight = document.body.offsetHeight;
    const panelWidth = document.body.offsetWidth;

    // Calculate and apply final position
    let xPos = Math.min(event.clientX, panelWidth - menuWidth);
    let yPos = event.clientY;
    if (yPos + menuHeight > panelHeight) {
        yPos = Math.max(0, panelHeight - menuHeight);
    }
    contextMenu.style.left = `${xPos}px`;
    contextMenu.style.top = `${yPos}px`;
}

function createInputField(defaultTag, tagElement, finalizeFunction) {
    const input = document.createElement('input');
    input.classList.add('itags-search-replaceTag');
    input.type = 'text';
    input.value = defaultTag;
    if (tagElement.classList.contains('negated')) {
        input.value = '!' + input.value;
    }
    input.style.width = `${tagElement.offsetWidth}px`;

    // Replace the tag element with the input
    tagElement.parentNode.replaceChild(input, tagElement);
    // Focus the input and select the text
    input.focus();
    input.select();

    let renameProcessed = false; // Flag to prevent multiple processing

    // Define the function to finalize the renaming
    const finalizeInput = () => {
        if (renameProcessed) return; // If already processed, do nothing
        renameProcessed = true; // Set the flag to true to prevent further processing

        finalizeFunction(input);

        // Replace input with the original tag element
        const newTag = input.value;
        if(input.parentNode){ // Check if the input is still in the DOM
            input.parentNode.replaceChild(tagElement, input);
        }
    }

    // Add event listeners to finalize renaming on Enter key or focus out
    addEventListenerWithTracking(input, 'blur', finalizeInput);
    addEventListenerWithTracking(input, 'keydown', (e) => {
        if (e.key === 'Enter') {
            finalizeInput();
            e.preventDefault();
        } else if (e.key === 'Escape') {
            input.value = defaultTag; // Revert the input value to the original tag
            finalizeInput();
        }
    });
}

function collapseResults() {
    const resultNotes = document.getElementsByClassName('itags-search-resultContent');
    for (let i = 0; i < resultNotes.length; i++) {
        resultNotes[i].style.display = 'none';
        
        // Update note state when collapsing all (setting to expanded=false)
        const cardKey = resultNotes[i].getAttribute('data-card-key');
        if (cardKey) {
            updateNoteState(cardKey, false);
        }
    }
}

function expandResults() {
    const resultNotes = document.getElementsByClassName('itags-search-resultContent');
    for (let i = 0; i < resultNotes.length; i++) {
        resultNotes[i].style.display = 'block';
        
        // Update note state when expanding all (setting to expanded=true)
        const cardKey = resultNotes[i].getAttribute('data-card-key');
        if (cardKey) {
            updateNoteState(cardKey, true);
        }
    }
}

function parseRange(rangeStr) {
    const [min, max] = rangeStr.split('->').map(v => v
        .trim().toLowerCase().replace(RegExp('\\s', 'g'), spaceReplace));
    return { minValue: min || undefined, maxValue: max || undefined };
}

function isValidRange(minValue, maxValue) {
    const hasWildcard = (v) => v && (v.startsWith('*') || v.endsWith('*'));
    // Wildcards always valid; non-wildcards need both bounds
    return hasWildcard(minValue) || hasWildcard(maxValue) || (minValue && maxValue);
}

function registerEventHandlers() {
    if (!tagFilter || !tagList || !tagClear || !saveQuery || !tagSearch || !tagRangeArea ||
        !tagRangeMin || !tagRangeMax || !tagRangeAdd || !noteArea || !noteFilter ||
        !noteList || !savedQueriesDropdown || !resultFilter || !resultSort || !resultOrder || !resultToggle ||
        !resultFilterArea || !resultCount || !resultsArea) {
        return;
    }

    // Event listeners
    addEventListenerWithTracking(tagFilter, 'input', updateTagList);
    addEventListenerWithTracking(noteFilter, 'input', updateNoteList);

    addEventListenerWithTracking(tagClear, 'click', () => {
        clearQueryArea();
        clearResultsArea();
        tagFilter.value = '';
        tagRangeMin.value = '';
        tagRangeMax.value = '';
        noteFilter.value = '';
        resultFilter.value = '';
        sendSetting('filter', '');
        sendClearQuery(); // Clear the main process query and filter
        results = []; // Clear the results array before resetToGlobalSettings
        clearNoteState(); // Clear note state when clearing everything
        clearSectionExpandState();
        resetToGlobalSettings(); // Reset to global settings for new searches
        updateTagList();
    });

    addEventListenerWithTracking(saveQuery, 'click', () => {
        webviewApi.postMessage({
            name: 'saveQuery',
            query: JSON.stringify(queryGroups),
            filter: resultFilter.value,
        });
    });

    addEventListenerWithTracking(tagSearch, 'click', () => {
        sendSearchMessage();
        clearNoteState();
        clearSectionExpandState();
    });

    addEventListenerWithTracking(tagFilter, 'keydown', (event) => {
        if (event.key === 'Enter') {
            if (event.shiftKey) {
                // Insert the tag
                const tag = tagList.firstChild?.textContent;
                if (tag) {
                    sendInsertMessage(tag);
                }
                tagFilter.value = '';
                updateTagList();
                return;

            } else if (tagFilter.value === '') {
                sendSearchMessage();
                clearNoteState();
                clearSectionExpandState();

            } else if (selectMultiTags === 'first' || ((selectMultiTags === 'none') && (tagList.childElementCount === 1))) {
                // Get the tag name from the only / first child element of tagList
                const tag = tagList.firstChild?.textContent;
                if (tag) {
                    handleTagClick(tag);
                }

            } else if (selectMultiTags === 'all') {
                // Create multiple groups, one for each tag
                const tags = Array.from(tagList.children).map(tag => tag.textContent);
                tags.forEach(tag => {
                    if (queryGroups.some(group =>
                            (group.length === 1) & (group[0].tag === tag) & (group[0].negated === false))) {
                        return;
                    }
                    queryGroups.push([{ tag: tag, negated: false }]);
                });
                updateQueryArea();
                // Clear the input
                tagFilter.value = '';
                // Update the tag list to reflect the current filter or clear it
                updateTagList();

            } else if (selectMultiTags === 'insert') {
                // Get the tag name from the only child element of tagList
                const tag = tagList.firstChild?.textContent;
                if (tag) {
                    sendInsertMessage(tag);
                }
                // Clear the input
                tagFilter.value = '';
                // Update the tag list to reflect the current filter or clear it
                updateTagList();
            }

        } else if (event.key === 'Delete') {
            // Remove last tag from the last group
            let lastGroup = queryGroups[queryGroups.length - 1];
            if (lastGroup) {
                lastGroup.pop();
                if (lastGroup.length === 0) {
                    // Remove the group if empty
                    queryGroups.pop();
                }
                updateQueryArea();
            }
        } else if (event.key === 'Escape') {
            if (tagFilter.value === '') {
                sendFocusEditorMessage();
            } else {
                // Clear the input and update the tag list
                tagFilter.value = '';
                updateTagList();
            }
        } else if (event.key === 'ArrowUp') {
            // Change the last operator
            toggleLastOperator();
        } else if (event.key === 'ArrowDown') {
            // Toggle last tag negation
            toggleLastTagOrNote();
        }
    });

    addEventListenerWithTracking(tagRangeMin, 'keydown', (event) => {
        if (event.key === 'Enter') {
            tagRangeMax.focus();
        } else if (event.key === 'ArrowUp') {
            // Change the last operator
            toggleLastOperator();
        } else if (event.key === 'ArrowDown') {
            // Toggle last tag negation
            toggleLastTagOrNote();
        } else if (event.key === 'Escape') {
            if (tagRangeMin.value === '' && tagRangeMax.value === '') {
                tagFilter.focus();
            } else {
                // Clear the input
                tagRangeMin.value = '';
                tagRangeMax.value = '';
            }
        }
    });

    addEventListenerWithTracking(tagRangeMax, 'keydown', (event) => {
        if (event.key === 'Enter') {
            if (tagRangeMin.value.length === 0 && tagRangeMax.value.length === 0) {
                sendSearchMessage();
                clearNoteState();
                clearSectionExpandState();
                return;
            }
            tagRangeAdd.click();
        } else if (event.key === 'ArrowUp') {
            // Change the last operator
            toggleLastOperator();
        } else if (event.key === 'ArrowDown') {
            // Toggle last tag negation
            toggleLastTagOrNote();
        } else if (event.key === 'Escape') {
            // Clear the input
            tagRangeMin.value = '';
            tagRangeMax.value = '';
            tagRangeMin.focus();
        }
    });

    addEventListenerWithTracking(tagRangeAdd, 'click', () => {
        const newRange = {};
        if (tagRangeMin.value.length === 0 && tagRangeMax.value.length === 0) {
            return;
        }
        if (tagRangeMin.value.length > 0) {
            newRange['minValue'] = tagRangeMin.value.trim().toLowerCase().replace(RegExp('\\s', 'g'), spaceReplace);
        }
        if (tagRangeMax.value.length > 0) {
            newRange['maxValue'] = tagRangeMax.value.trim().toLowerCase().replace(RegExp('\\s', 'g'), spaceReplace);
        }

        if (!isValidRange(newRange['minValue'], newRange['maxValue'])) {
            webviewApi.postMessage({ name: 'showWarning', message: 'Ranges require both min and max values. Use wildcards (e.g., prefix*) for open-ended searches.' });
            return;
        }

        handleRangeClick(newRange['minValue'], newRange['maxValue']);
        tagRangeMin.value = '';
        tagRangeMax.value = '';
    });

    addEventListenerWithTracking(noteFilter, 'keydown', (event) => {
        if (event.key === 'Enter') {
            // Check if there's exactly one tag in the filtered list
            if (noteFilter.value === '') {
                sendSearchMessage();
                clearNoteState();
                clearSectionExpandState();
            } else if (noteList.firstChild) {
                // Get the note from the first child element of noteList
                const note = { title: noteList.firstChild.textContent, externalId: noteList.firstChild.value };
                handleNoteClick(note);
                // Optionally, clear the input
                noteFilter.value = '';
                noteList.value = 'default';
                // Update the note list to reflect the current filter or clear it
                updateNoteList();
            }
        } else if (event.key === 'Delete') {
            // Remove last tag from the last group
            let lastGroup = queryGroups[queryGroups.length - 1];
            if (lastGroup) {
                lastGroup.pop();
                if (lastGroup.length === 0) {
                    // Remove the group if empty
                    queryGroups.pop();
                }
                updateQueryArea();
            }
        } else if (event.key === 'Escape') {
            if (noteFilter.value === '') {
                tagFilter.focus();
            } else {
                // Clear the input and update the note list
                noteFilter.value = '';
                noteList.value = 'default';
                updateNoteList();
            }
        } else if (event.key === 'ArrowUp') {
            toggleLastOperator();
        } else if (event.key === 'ArrowDown') {
            toggleLastTagOrNote();
        }
    });

    addEventListenerWithTracking(noteList, 'change', () => {
        if (noteList.value === 'current') {
            handleNoteClick({ title: 'Current note', externalId: 'current' });
        } else if (noteList.value !== 'default') {
            const selectedNote = allNotes.find(note => note.externalId === noteList.value);
            if (selectedNote) {
                handleNoteClick(selectedNote);
            }
        }
        noteList.value = 'default';
        noteFilter.value = '';
        dropdownIsOpen = false;
        updateNoteList();
    });

    addEventListenerWithTracking(noteList, 'focus', () => {
        // The dropdown might be opening (avoid updates)
        dropdownIsOpen = true;
    });

    addEventListenerWithTracking(noteList, 'blur', () => {
        // The dropdown is closed (avoid updates)
        dropdownIsOpen = false;
        updateNoteList();
    });

    // Saved queries dropdown handler
    addEventListenerWithTracking(savedQueriesDropdown, 'change', () => {
        const selectedId = savedQueriesDropdown.value;
        if (selectedId) {
            // Send message to load the saved query from the selected note
            webviewApi.postMessage({
                name: 'loadSavedQuery',
                externalId: selectedId,
            });
            // Reset dropdown to placeholder after selection
            savedQueriesDropdown.value = '';
            // Clear note state for new query
            clearNoteState();
            clearSectionExpandState();
        }
    });

    addEventListenerWithTracking(resultFilter, 'input', () => {
        updateResultsArea();
        sendSetting('filter', resultFilter.value);
    });

    addEventListenerWithTracking(resultFilter, 'keydown', (event) => {
        if (event.key === 'Escape') {
            if (resultFilter.value === '') {
                tagFilter.focus();
            } else {
                // Clear the input and update the results area
                resultFilter.value = '';
                if (resultCount) {
                    resultCount.style.display = 'none';
                }
                updateResultsArea();
                sendSetting('filter', '');
            }
        }
    });

    // Handle sort option selection
    addEventListenerWithTracking(resultSort, 'change', (event) => {
        if (resultSort.value === 'custom') {
            // Get current sortBy and sortOrder values from last message
            let currentSortBy = '';
            let currentSortOrder = '';

            if (lastMessage && lastMessage.message && lastMessage.message.sortBy) {
                currentSortBy = lastMessage.message.sortBy;
            }

            if (lastMessage && lastMessage.message && lastMessage.message.sortOrder) {
                currentSortOrder = lastMessage.message.sortOrder;
            }

            // Send message to show the sort dialog on the server side
            webviewApi.postMessage({
                name: 'showSortDialog',
                currentSortBy: currentSortBy,
                currentSortOrder: currentSortOrder
            });

            // Revert dropdown to previous value until dialog is confirmed
            const prevValue = resultSort.getAttribute('data-prev-value') || 'modified';
            resultSort.value = prevValue;

        } else {
            // Handle standard sort options (modified, created, title, notebook)
            // Store selected value as previous for potential revert
            resultSort.setAttribute('data-prev-value', resultSort.value);

            // Check if we have a custom sort order and simplify it to first element only
            const currentSortOrder = lastMessage?.message?.sortOrder;
            if (currentSortOrder && currentSortOrder.includes(',')) {
                // Extract first element from comma-separated order
                const simplifiedOrder = currentSortOrder.toLowerCase().startsWith('a') ? 'asc' : 'desc';

                // Update the display and send the simplified order
                updateResultOrderDisplay(simplifiedOrder);
                sendSetting('resultOrder', simplifiedOrder);
            }

            // Send setting update to trigger sorting on the backend
            sendSetting('resultSort', resultSort.value);
        }
    });

    addEventListenerWithTracking(resultOrder, 'click', () => {
        // Check if we have a custom sort order by looking at the button's current display
        const buttonContent = resultOrder.innerHTML.replace(/<\/?b>/g, ''); // Remove <b> tags
        const isCustomSort = buttonContent.length > 1; // Multiple arrows = custom sort

        if (isCustomSort) {
            // For custom sort orders, get the current order from the title and toggle each element
            const currentOrder = resultOrder.title; // Title contains the full sort order string
            const orderArray = currentOrder.split(',').map(s => s.trim());
            const toggledArray = orderArray.map(order => {
                return order.toLowerCase().startsWith('a') ? 'desc' : 'asc';
            });

            const toggledOrder = toggledArray.join(',');

            // Update display and send to backend
            updateResultOrderDisplay(toggledOrder);
            sendSetting('resultOrder', toggledOrder);
        } else {
            // Handle simple string sort orders
            if (resultOrderState === 'asc') {
                resultOrderState = 'desc';
                resultOrder.innerHTML = '<b>↑</b>';  // Button shows the current state (desc)
            } else if (resultOrderState === 'desc') {
                resultOrderState = 'asc';
                resultOrder.innerHTML = '<b>↓</b>';  // Button shows the current state (asc)
            }

            // Update visual indicator for simple sort order
            resultOrder.title = resultOrderState;

            // Send setting update to trigger sorting on the backend
            sendSetting('resultOrder', resultOrderState);
        }
    });

    addEventListenerWithTracking(resultToggle, 'click', () => {
        if (resultToggleState === 'expand') {
            collapseResults();
            resultToggleState = 'collapse';
            resultToggle.innerHTML = '>';  // Button shows the current state (collapse)
            sendSetting('resultToggle', true);
            return;

        } else if (resultToggleState === 'collapse') {
            expandResults();
            resultToggleState = 'expand';
            resultToggle.innerHTML = 'v';  // Button shows the current state (expand)
            sendSetting('resultToggle', false);
            return;
        }
    });

    addEventListenerWithTracking(document, 'click', (event) => {
        const contextMenu = document.querySelectorAll('.itags-search-contextMenu');
        contextMenu.forEach(menu => {
            if (!menu.contains(event.target)) {
                removeContextMenu(menu);
            }
        });
    });

    addEventListenerWithTracking(document, 'contextmenu', (event) => {
        if (event.target.matches('.itags-search-renderedTag')) { return; }
        if (event.target.matches('.itags-search-checkbox')) { return; }
        if (event.target.matches('.itags-search-contextMenu')) { return; }
        if (event.target.matches('.itags-search-contextSeparator')) { return; }
        if (event.target.matches('.itags-search-contextCommand')) {
            event.target.click();
            return;
        }
        // Check if this is a note title element - if so, let its specific handler deal with it
        if (event.target.tagName === 'H3' || event.target.closest('h3')) { return; }

        const contextMenu = document.querySelectorAll('.itags-search-contextMenu');
        contextMenu.forEach(menu => {
            if (!menu.contains(event.target)) {
                removeContextMenu(menu);
            }
        });
        // Handle right-click on tags in list
        if (event.target.matches('.itags-search-tag') && event.target.classList.contains('range')) {
            createContextMenu(event, null, null, ['editQuery']);
        } else if (event.target.matches('.itags-search-tag') && (event.target.classList.contains('selected') || event.target.classList.contains('negated'))) {
            createContextMenu(event, null, null, ['insertTag', 'searchTag', 'editQuery', 'extendQuery', 'sortByTag', 'addToSort', 'replaceAll', 'removeAll']);
        } else if (event.target.matches('.itags-search-tag')) {
            createContextMenu(event, null, null, ['insertTag', 'searchTag', 'extendQuery', 'sortByTag', 'addToSort', 'replaceAll', 'removeAll']);
        } else if (event.target.type !== 'text') {
            createContextMenu(event, null, null, []);
        }
    });

    addEventListenerWithTracking(document, 'keydown', (event) => {
        if (event.key === 'Escape') {
            const contextMenu = document.querySelectorAll('.itags-search-contextMenu');
            contextMenu.forEach(menu => {
                removeContextMenu(menu);
            });
        }
    });
}

initPanel();

// Add this helper function
function removeContextMenu(menu) {
    if (!menu) return;
    clearNode(menu);  // Clear event listeners
    menu.remove();    // Remove from DOM
}

// Function to update result order display based on sort order string
function updateResultOrderDisplay(sortOrderStr) {
    // Check if it's a custom sort order (contains comma)
    const isCustomSort = sortOrderStr.includes(',');
    
    if (isCustomSort) {
        // Convert comma-separated order to arrows: asc,desc,asc -> ↓↑↓
        const orderArray = sortOrderStr.split(',').map(s => s.trim());
        const arrows = orderArray.map(order => {
            return order.toLowerCase().startsWith('a') ? '↓' : '↑';
        }).join('');
        
        // Set state based on first element for toggle behavior
        const firstElement = orderArray[0] || 'desc';
        resultOrderState = (firstElement.toLowerCase().startsWith('a')) ? 'asc' : 'desc';
        resultOrder.innerHTML = `<b>${arrows}</b>`;
        resultOrder.title = sortOrderStr;
    } else {
        // Simple sort order
        resultOrderState = sortOrderStr.toLowerCase().startsWith('a') ? 'asc' : 'desc';
        resultOrder.innerHTML = resultOrderState === 'asc' ? '<b>↓</b>' : '<b>↑</b>';
        resultOrder.title = resultOrderState;
    }
}
