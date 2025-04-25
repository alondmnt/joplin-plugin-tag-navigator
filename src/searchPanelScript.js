let queryGroups = []; // Array of Sets
// each set is a group of tags combined with "AND"
// sets are combined with "OR"
let allTags = [];
let allNotes = [];
let results = [];

const noteIdRegex = /([a-zA-Z0-9]{32})/; // Matches noteId

const tagFilter = document.getElementById('itags-search-tagFilter');
const tagCount = document.createElement('div');
tagCount.classList.add('itags-search-resultCount');
tagCount.style.display = 'none';
tagFilter.parentNode.appendChild(tagCount);
const tagInputArea = document.getElementById('itags-search-inputTagArea');
const tagClear = document.getElementById('itags-search-tagClear');
const saveQuery = document.getElementById('itags-search-saveQuery');
const tagSearch = document.getElementById('itags-search-tagSearch');
const tagList = document.getElementById('itags-search-tagList');
const tagRangeArea = document.getElementById('itags-search-tagRangeArea');
const tagRangeMin = document.getElementById('itags-search-tagRangeMin');
const tagRangeMax = document.getElementById('itags-search-tagRangeMax');
const tagRangeAdd = document.getElementById('itags-search-tagRangeAdd');
const noteArea = document.getElementById('itags-search-inputNoteArea');
const noteList = document.getElementById('itags-search-noteList');
const noteFilter = document.getElementById('itags-search-noteFilter');
const queryArea = document.getElementById('itags-search-queryArea');
const resultFilterArea = document.getElementById('itags-search-inputResultArea');
const resultFilter = document.getElementById('itags-search-resultFilter');
const resultCount = document.createElement('div');
resultCount.classList.add('itags-search-resultCount');
resultCount.style.display = 'none';
resultFilterArea.appendChild(resultCount);
let resultToggleState = 'expand';
const resultSort = document.getElementById('itags-search-resultSort');
const resultOrder = document.getElementById('itags-search-resultOrder');
let resultOrderState = 'desc';
const resultToggle = document.getElementById('itags-search-resultToggle');
const resultsArea = document.getElementById('itags-search-resultsArea');
let resultMarker = true;
let selectMultiTags = 'first';
let searchWithRegex = false;
let spaceReplace = '_';
let dropdownIsOpen = false;
let resultColorProperty = 'border';
const eventListenersMap = new WeakMap();  // Map to store event listeners and clear them later

// Listen for messages from the main process
webviewApi.onMessage((message) => {
    if (message.message.name === 'updateTagData') {
        allTags = JSON.parse(message.message.tags);
        updateTagList();

    } else if (message.message.name === 'updateNoteData') {
        allNotes = JSON.parse(message.message.notes);
        updateNoteList();

    } else if (message.message.name === 'updateQuery') {
        let queryGroupsCand = [];
        try {
            queryGroupsCand = JSON.parse(message.message.query);
        } catch (e) {
            console.error('Failed to parse saved query:', message.message.query, e);
        }
        queryGroups = queryGroupsCand;
        resultFilter.value = message.message.filter ? message.message.filter : '';
        updateQueryArea();
        sendSearchMessage();

    } else if (message.message.name === 'updateResults') {
        results = JSON.parse(message.message.results);
        const searchQuery = JSON.stringify(queryGroups);
        if (searchQuery === message.message.query) {
            updateResultsArea();
        }

    } else if (message.message.name === 'focusTagFilter') {
        tagFilter.focus();

    } else if (message.message.name === 'updateSettings') {
        updatePanelSettings(message);
    }
});

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
        return words.every(word => lowerTarget.match(new RegExp(`(${word})`, 'gi')));
    } else {
        return words.every(word => lowerTarget.includes(word));
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
    return words;
}

function updatePanelSettings(message) {
    const settings = JSON.parse(message.message.settings);
    searchWithRegex = settings.searchWithRegex;
    selectMultiTags = settings.selectMultiTags;
    spaceReplace = settings.spaceReplace;
    resultToggleState = settings.resultToggle ? 'collapse' : 'expand';
    if ( resultToggleState === 'collapse' ) {
        collapseResults();
    } else {
        expandResults();
    }
    resultToggle.innerHTML = settings.resultToggle ? 
        '>' : 'v';  // Button shows the current state (collapse / expand)
    resultSort.value = settings.resultSort;
    resultOrderState = settings.resultOrder;
    resultOrder.innerHTML = resultOrderState === 'asc' ? 
        '<b>↓</b>' : '<b>↑</b>';  // Button shows the current state (asc / desc)
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
        queryArea.classList.remove('hidden');
    } else {
        tagInputArea.classList.add('hidden');
        tagFilter.classList.add('hidden');
        tagCount.classList.add('hidden');
        tagClear.classList.add('hidden');
        saveQuery.classList.add('hidden');
        tagSearch.classList.add('hidden');
        tagList.classList.add('hidden');
        queryArea.classList.add('hidden');
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
    // Save the current state of expanded/collapsed notes
    const noteState = {};
    const resultNotes = document.getElementsByClassName('itags-search-resultContent');
    for (let i = 0; i < resultNotes.length; i++) {
        if (resultNotes[i].style.display === 'block') {
            noteState[[resultNotes[i].getAttribute('data-externalId'), resultNotes[i].getAttribute('data-color')]] = 'collapsed';
        } else {
            noteState[[resultNotes[i].getAttribute('data-externalId'), resultNotes[i].getAttribute('data-color')]] = 'expanded';
        }
    }

    // Sort results
    const filter = resultFilter.value;
    const lineSort = (resultOrderState === 'asc') ? 1 : -1;
    results = results.sort((a, b) => {
        let comparison;
        if (resultSort.value === 'title') {
            comparison = a.title.localeCompare(b.title);
        } else if (resultSort.value === 'modified') {
            comparison = a.updatedTime - b.updatedTime;
        } else if (resultSort.value === 'created') {
            comparison = a.createdTime - b.createdTime;
        } else if (resultSort.value === 'notebook') {
            comparison = a.notebook.localeCompare(b.notebook);
        }
        return comparison || 
            (lineSort * (Math.min(...a.lineNumbers[0]) - Math.min(...b.lineNumbers[0])));
    });
    if (resultOrderState === 'desc') {
        results = results.reverse();
    }

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
                externalId: result.externalId,
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

        // Preserve expansion state
        if (noteState[[result.externalId, result.color]] === 'collapsed') {
            contentContainer.style.display = 'block';
        } else if (noteState[[result.externalId, result.color]] === 'expanded') {
            contentContainer.style.display = 'none';
        } else {
            contentContainer.style.display = (resultToggleState === 'expand') ? 'block': 'none';
        }

        const parsedFilter = parseFilter(filter, min_chars=3);
        const filterRegExp = new RegExp(`(?<!<[^>]*)(${parsedFilter.join('|')})(?![^<]*>)`, 'gi');

        let hasContent = false;
        for (let index = 0; index < result.html.length; index++) {
            if (!containsFilter(result.text[index], filter, min_chars=2, otherTarget='|' + result.title + '|' + result.notebook)) {
                continue;
            }
            hasContent = true;

            let entry = result.html[index];
            if (resultMarker && (parsedFilter.length > 0)) {
                entry = entry.replace(filterRegExp, '<mark id="itags-search-renderedFilter">$1</mark>');
                titleEl.innerHTML = titleEl.textContent.replace(filterRegExp, '<mark id="itags-search-renderedFilter">$1</mark>');
            }

            const entryEl = document.createElement('div');
            entryEl.classList.add('itags-search-resultSection');
            entryEl.innerHTML = entry;
            addLineNumberToCheckboxes(entryEl, result.text[index]);
            entryEl.style.cursor = 'pointer';

            // Adjust task list item positioning
            entryEl.querySelectorAll('.itags-search-resultSection > .contains-task-list > .task-list-item').forEach(item => {
                item.style.position = 'relative';
                item.style.left = '-15px';
            });

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

        // Add title click handler
        addEventListenerWithTracking(titleEl, 'click', () => {
            contentContainer.style.display = contentContainer.style.display === 'none' ? 'block' : 'none';
        });

        // Add spacing between notes
        const resultSpace = document.createElement('div');
        resultSpace.classList.add('itags-search-resultSpace');
        resultsArea.appendChild(resultSpace);
    }

    // Update result count display
    updateResultCount(displayedNoteCount, filter);

    // Remove last spacing
    if (resultsArea.lastElementChild) {
        resultsArea.removeChild(resultsArea.lastElementChild);
    }
}

// Helper function to create click handler
function createClickHandler(result, index) {
    return (event) => {
        if (event.target.matches('.task-list-item-checkbox')) {
            const line = parseInt(event.target.getAttribute('data-line-number'));
            webviewApi.postMessage({
                name: 'setCheckBox',
                externalId: result.externalId,
                line: result.lineNumbers[index][line],
                text: result.text[index].split('\n')[line].trim(),
                source: event.target.checked ? ' ' : 'x',
                target: event.target.checked ? 'x' : ' ',
            });
        } else if (event.target.matches('.itags-search-checkbox')) {
            const line = parseInt(event.target.getAttribute('data-line-number'));
            webviewApi.postMessage({
                name: 'setCheckBox',
                externalId: result.externalId,
                line: result.lineNumbers[index][line],
                text: result.text[index].split('\n')[line].trim(),
                source: getCheckboxState(event.target),
                target: event.target.getAttribute('data-checked') === 'true' ? ' ' : 'x',
            });
        } else if (event.target.matches('a')) {
            event.preventDefault();
            const externalId = event.target.href;
            webviewApi.postMessage({
                name: 'openNote',
                externalId: externalId ? externalId : event.target.textContent,
                line: 0,
            });
        } else {
            // Get the clicked text content
            const clickedText = event.target.textContent.trim();
            
            // Get the source text and split into lines
            const sourceText = result.text[index];
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
                externalId: result.externalId,
                line: result.lineNumbers[index][foundLine] || result.lineNumbers[index][0],
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
        if (event.target.matches('.itags-search-renderedTag')) {
            createContextMenu(event, result, index);
        }
        if (event.target.matches('.itags-search-checkbox')) {
            createContextMenu(event, result, index, ['checkboxState']);
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
            return 'x';
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

function createContextMenu(event, result=null, index=null, commands=['insertTag', 'searchTag', 'extendQuery', 'addTag', 'replaceTag', 'replaceAll', 'removeTag', 'removeAll']) {
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
                line: result.lineNumbers[index][line],
                text: result.text[index].split('\n')[line].trim(),
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
                line: result.lineNumbers[index][line],
                text: result.text[index].split('\n')[line].trim(),
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
                line: result.lineNumbers[index][line],
                text: result.text[index].split('\n')[line].trim(),
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
                line: result.lineNumbers[index][line],
                text: result.text[index].split('\n')[line].trim(),
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
                line: result.lineNumbers[index][line],
                text: result.text[index].split('\n')[line].trim(),
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
                line: result.lineNumbers[index][line],
                text: result.text[index].split('\n')[line].trim(),
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
            handleTagClick(currentTag.toLowerCase());
            updateTagList();
            sendSearchMessage();
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
                    Object.assign(item, parseRange(newTag));
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
                        line: result.lineNumbers[index][line],
                        text: result.text[index].split('\n')[line].trim(),
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
                        line: result.lineNumbers[index][line],
                        text: result.text[index].split('\n')[line].trim(),
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
                line: result.lineNumbers[index][line],
                text: result.text[index].split('\n')[line].trim(),
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

    // Default commands: show / hide sections
    if (cmdCount > 0) {
        const separator = document.createElement('hr');
        separator.classList.add('itags-search-contextSeparator');
        fragment.appendChild(separator);
    }
    const sectionState = {
        showQuery: !queryArea.classList.contains('hidden'),
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
    }
}

function expandResults() {
    const resultNotes = document.getElementsByClassName('itags-search-resultContent');
    for (let i = 0; i < resultNotes.length; i++) {
        resultNotes[i].style.display = 'block';
    }
}

function parseRange(rangeStr) {
    const [min, max] = rangeStr.split('->').map(v => v
        .trim().toLowerCase().replace(RegExp('\\s', 'g'), spaceReplace));
    return { minValue: min || undefined, maxValue: max || undefined };
}

updateTagList(); // Initial update
tagFilter.focus(); // Focus the tag filter input when the panel is loaded

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
    updateTagList();
});

addEventListenerWithTracking(saveQuery, 'click', () => {
    webviewApi.postMessage({
        name: 'saveQuery',
        query: JSON.stringify(queryGroups),
        filter: resultFilter.value,
    });
});

addEventListenerWithTracking(tagSearch, 'click', sendSearchMessage);

addEventListenerWithTracking(tagFilter, 'keydown', (event) => {
    if (event.key === 'Enter') {
        if (event.shiftKey) {
            // Insert the tag
            const tag = tagList.firstChild.textContent;
            sendInsertMessage(tag);
            tagFilter.value = '';
            updateTagList();
            return;

        } else if (tagFilter.value === '') {
            sendSearchMessage();

        } else if (selectMultiTags === 'first' || ((selectMultiTags === 'none') && (tagList.childElementCount === 1))) {
            // Get the tag name from the only / fist child element of tagList
            const tag = tagList.firstChild.textContent;
            handleTagClick(tag);

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
            const tag = tagList.firstChild.textContent;
            sendInsertMessage(tag);
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
        if (tagRangeMin.value.length == 0 && tagRangeMax.value.length == 0) {
            sendSearchMessage();
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
    if (tagRangeMin.value.length == 0 && tagRangeMax.value.length == 0) {
        return;
    }
    if (tagRangeMin.value.length > 0) {
        newRange['minValue'] = tagRangeMin.value.trim().toLowerCase().replace(RegExp('\\s', 'g'), spaceReplace);
    }
    if (tagRangeMax.value.length > 0) {
        newRange['maxValue'] = tagRangeMax.value.trim().toLowerCase().replace(RegExp('\\s', 'g'), spaceReplace);
    }
    handleRangeClick(newRange['minValue'], newRange['maxValue']);
    tagRangeMin.value = '';
    tagRangeMax.value = '';
});

addEventListenerWithTracking(noteFilter, 'keydown', (event) => {
    if (event.key === 'Enter') {
        // Check if there's exactly one tag in the filtered list
        if (noteFilter.value === '') {
            sendSearchMessage()
        } else {
            // Get the tag name from the only child element of tagList
            const note = {title: noteList.firstChild.textContent, externalId: noteList.firstChild.value};
            handleNoteClick(note);
            // Optionally, clear the input
            noteFilter.value = '';
            noteList.value = 'default';
            // Update the tag list to reflect the current filter or clear it
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
            // Clear the input and update the tag list
            noteFilter.value = '';
            noteList.value = 'default';
            updateNoteList();
        }
    } else if (event.key === 'ArrowUp') {
        // Change the last operator
        toggleLastOperator();
    } else if (event.key === 'ArrowDown') {
        // Toggle last tag negation
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
            resultCount.style.display = 'none';  // Hide count
            updateResultsArea();
            sendSetting('filter', '');
        }
    }
});

addEventListenerWithTracking(resultSort, 'change', () => {
    sendSetting('resultSort', resultSort.value);
    updateResultsArea();
});


addEventListenerWithTracking(resultOrder, 'click', () => {
    if (resultOrderState === 'asc') {
        resultOrderState = 'desc';
        resultOrder.innerHTML = '<b>↑</b>';  // Button shows the currrent state (desc)
    } else if (resultOrderState === 'desc') {
        resultOrderState = 'asc';
        resultOrder.innerHTML = '<b>↓</b>';  // Button shows the current state (asc)
    }
    sendSetting('resultOrder', resultOrderState);
    updateResultsArea();
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
        createContextMenu(event, null, null, ['insertTag', 'searchTag', 'editQuery', 'extendQuery', 'replaceAll', 'removeAll']);
    } else if (event.target.matches('.itags-search-tag')) {
        createContextMenu(event, null, null, ['insertTag', 'searchTag', 'extendQuery', 'replaceAll', 'removeAll']);
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

webviewApi.postMessage({
    name: 'initPanel',
});

// Add this helper function
function removeContextMenu(menu) {
    if (!menu) return;
    clearNode(menu);  // Clear event listeners
    menu.remove();    // Remove from DOM
}