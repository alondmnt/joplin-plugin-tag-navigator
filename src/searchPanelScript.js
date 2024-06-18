let queryGroups = []; // Array of Sets
// each set is a group of tags combined with "AND"
// sets are combined with "OR"
let allTags = [];
let allNotes = [];
let results = [];

const tagFilter = document.getElementById('itags-search-tagFilter');
const tagClear = document.getElementById('itags-search-tagClear');
const saveQuery = document.getElementById('itags-search-saveQuery');
const tagSearch = document.getElementById('itags-search-tagSearch');
const tagList = document.getElementById('itags-search-tagList');
const noteArea = document.getElementById('itags-search-inputNoteArea');
const noteList = document.getElementById('itags-search-noteList');
const noteFilter = document.getElementById('itags-search-noteFilter');
const queryArea = document.getElementById('itags-search-queryArea');
const resultFilterArea = document.getElementById('itags-search-inputResultArea');
const resultFilter = document.getElementById('itags-search-resultFilter');
let resultToggleState = 'expand';
const resultSort = document.getElementById('itags-search-resultSort');
const resultOrder = document.getElementById('itags-search-resultOrder');
let resultOrderState = 'desc';
const resultToggle = document.getElementById('itags-search-resultToggle');
const resultsArea = document.getElementById('itags-search-resultsArea');
let resultMarker = true;
let dropdownIsOpen = false;
const eventListenersMap = new Map();  // Map to store event listeners and clear them later

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
    allTags.filter(tag => containsFilter(tag, tagFilter.value)).forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.classList.add('itags-search-tag');
        tagEl.textContent = tag;
        tagEl.onclick = () => handleTagClick(tag);
        tagList.appendChild(tagEl);
    });
}

// Update note dropdown with the current list of notes
function updateNoteList() {
    if (dropdownIsOpen) { return; }

    // Preserve the previous selection, if possible
    const selectedNoteId = noteList.value;
    clearNode(noteList);

    if (noteFilter.value === '') {
        const titleOpt = document.createElement('option');
        titleOpt.value = 'default';
        titleOpt.textContent = 'Search by note mentions';
        noteList.appendChild(titleOpt);
    }
    if (containsFilter('Current note', noteFilter.value)) {
        const currentOpt = document.createElement('option');
        currentOpt.value = 'current';
        currentOpt.textContent = 'Current note';
        noteList.appendChild(currentOpt);
    }

    allNotes.filter(note => containsFilter(note.title, noteFilter.value)).forEach(note => {
        const noteEl = document.createElement('option');
        noteEl.value = note.externalId;
        noteEl.textContent = note.title;
        noteList.appendChild(noteEl);
    });

    // Duplicate the first option to be the first
    const firstOpt = noteList.firstChild.cloneNode(true);
    noteList.insertBefore(firstOpt, noteList.firstChild);

    // Restore the previous selection, if possible
    if (selectedNoteId) {
        noteList.value = selectedNoteId;
    }
}

// Check that all words are in the target
function containsFilter(target, filter, min_chars=1, otherTarget='') {
    const lowerTarget = (target + otherTarget).toLowerCase();
    const words = parseFilter(filter, min_chars);
    return words.every(word => lowerTarget.match(new RegExp(`(${word})`, 'gi')));
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

    hideElements(settings);
    updateResultsArea();
}

function hideElements(settings) {
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
        resultsArea.classList.add('extended');
    }
    if (settings.showNotes && settings.showResultFilter) {
        resultsArea.classList.remove('extended');
        resultsArea.classList.remove('extended2X');
    }
    if (!settings.showNotes && !settings.showResultFilter) {
        resultsArea.classList.remove('extended');
        resultsArea.classList.add('extended2X');
    }
}

function updateQueryArea() {
    clearNode(queryArea);
    queryGroups.forEach((group, groupIndex) => {
        if (groupIndex > 0) {
            // Use OR between groups
            let orOperator = createOperatorElement('OR', groupIndex - 1, true);
            queryArea.appendChild(orOperator);
        }

        queryArea.appendChild(document.createTextNode('(')); // Start group

        group.forEach((item, tagIndex) => {
            // If the item has {tag, negated} format add a tag element
            // If the item has {title, externalId, negated} format add a note element
            const newEl = document.createElement('span');
            if (item.title) {
                newEl.classList.add('itags-search-note', item.negated ? 'negated' : 'selected');
                newEl.textContent = item.title.slice(0, 20)
                if (item.title.length >= 20) {
                    newEl.textContent += '...';
                }
                if (item.negated) {
                    newEl.textContent = `! ${newEl.textContent}`;
                }

            } else if (item.tag) {
                // Display each tag with its state
                newEl.classList.add('itags-search-tag', item.negated ? 'negated' : 'selected');
                newEl.textContent = item.negated ? `! ${item.tag}` : item.tag;
            }
            newEl.onclick = () => {
                toggleTagNegation(groupIndex, tagIndex);
                updateQueryArea(); // Refresh after toggling negation
            };

            // Append a delete button for each tag
            const deleteBtn = document.createElement('button');
            deleteBtn.classList.add('itags-search-tagDelete');
            deleteBtn.textContent = 'x';
            deleteBtn.onclick = (e) => {
                e.stopPropagation(); // Prevent tag toggle event
                removeTagFromGroup(groupIndex, tagIndex);
                updateQueryArea(); // Refresh display after deletion
            };
            newEl.appendChild(deleteBtn);
            queryArea.appendChild(newEl);

            // Add "AND" within a group, except after the last tag
            if (tagIndex < group.length - 1) {
                let andOperator = createOperatorElement('AND', groupIndex, false, tagIndex);
                queryArea.appendChild(andOperator);
            }
        });

        queryArea.appendChild(document.createTextNode(')')); // End group
    });
}

function updateResultsArea() {
    // Save the current stae of expandd / collapseed notes by their externalId
    const noteState = {};
    const resultNotes = document.getElementsByClassName('itags-search-resultContent');
    for (let i = 0; i < resultNotes.length; i++) {
        if (resultNotes[i].style.display === 'block') {
            noteState[resultNotes[i].getAttribute('data-externalId')] = 'collapseed';
        } else {
            noteState[resultNotes[i].getAttribute('data-externalId')] = 'expandd';
        }
    }

    const filter = resultFilter.value;
    results = results.sort((a, b) => {
        if (resultSort.value === 'title') {
            return a.title.localeCompare(b.title);
        } else if (resultSort.value === 'modified') {
            return a.updatedTime - b.updatedTime;
        } else if (resultSort.value === 'created') {
            return a.createdTime - b.createdTime;
        } else if (resultSort.value === 'notebook') {
            return a.notebook.localeCompare(b.notebook);
        }
    });
    if (resultOrderState === 'desc') {
        results = results.reverse();
    }

    clearNode(resultsArea);
    for (let index = 0; index < results.length; index++) {
        const result = results[index];
        const resultEl = document.createElement('div');
        resultEl.classList.add('itags-search-resultNote');
        
        const titleEl = document.createElement('h3');
        titleEl.textContent = result.title;
        titleEl.style.cursor = 'pointer'; // Make the title look clickable
        resultEl.appendChild(titleEl);
        
        const contentContainer = document.createElement('div');
        contentContainer.classList.add('itags-search-resultContent');

        // Preserve the state of the content container
        contentContainer.setAttribute('data-externalId', result.externalId);
        if (noteState[result.externalId] === 'collapseed') {
            contentContainer.style.display = 'block';
        } else if (noteState[result.externalId] === 'expandd') {
            contentContainer.style.display = 'none';
        } else {
            contentContainer.style.display = (resultToggleState === 'expand') ? 'block': 'none';
        }

        const parsedFilter = parseFilter(filter, min_chars=3);
        const filterRegExp = new RegExp(`(?<!<[^>]*)(${parsedFilter.join('|')})(?![^<]*>)`, 'gi');  // ignore html tags
        for (let index = 0; index < result.html.length; index++) {
            let entry = result.html[index];
            if (!containsFilter(result.text[index], filter, min_chars=2, otherTarget=result.title)) {
                continue; // Skip entries that don't match the filter
            }
            if (resultMarker && (parsedFilter.length > 0)) {
                // Mark any word containing at least 3 characters
                entry = entry.replace(filterRegExp, '<mark id="itags-search-renderedFilter">$1</mark>');
                titleEl.innerHTML = titleEl.textContent.replace(filterRegExp, '<mark id="itags-search-renderedFilter">$1</mark>');
            }

            const entryEl = document.createElement('div');
            entryEl.classList.add('itags-search-resultSection');
            entryEl.innerHTML = entry;
            addLineNumberToCheckboxes(entryEl, result.text[index]);
            entryEl.style.cursor = 'pointer'; // Make the content look clickable
            entryEl.querySelectorAll('.itags-search-resultSection > .contains-task-list > .task-list-item').forEach(item => {
                item.style.position = 'relative'; // Ensure the element's position can be adjusted
                item.style.left = '-15px'; // Move 15px to the left
            });

            // Handle click on the content
            addEventListenerWithTracking(entryEl, 'click', (event) => {
                if (event.target.matches('.task-list-item-checkbox')) {
                    // get the line number of the clicked checkbox
                    const line = parseInt(event.target.getAttribute('data-line-number'));
                    webviewApi.postMessage({
                        name: 'setCheckBox',
                        externalId: result.externalId,
                        line: result.lineNumbers[index] + line,
                        text: result.text[index].split('\n')[line].trim(),
                        checked: event.target.checked,
                    });
                } else if (event.target.matches('.itags-search-checkbox')) {
                    // get the line number of the clicked coloured checkbox
                    const line = parseInt(event.target.getAttribute('data-line-number'));
                    webviewApi.postMessage({
                        name: 'setCheckBox',
                        externalId: result.externalId,
                        line: result.lineNumbers[index] + line,
                        text: result.text[index].split('\n')[line].trim(),
                        checked: event.target.getAttribute('data-checked') === 'true' ? false : true,
                    });
                } else {
                    webviewApi.postMessage({
                        name: 'openNote',
                        externalId: result.externalId,
                        line: result.lineNumbers[index],
                    });
                }
            });

            // Handle right-click on rendered tags
            addEventListenerWithTracking(entryEl, 'contextmenu', (event) => {
                // Remove previous context menus
                const contextMenu = document.querySelectorAll('.itags-search-contextMenu');
                contextMenu.forEach(menu => {
                    if (!menu.contains(event.target)) {
                        menu.remove();
                    }
                });
                if (event.target.matches('.itags-search-renderedTag')) {
                    createContextMenu(event, result, index);
                }
            });

            contentContainer.appendChild(entryEl);
            
            // Add a dividing line between sections
            const divider = document.createElement('hr');
            contentContainer.appendChild(divider);
        }
        
        // Remove the last divider
        if (contentContainer.lastElementChild) {
            contentContainer.removeChild(contentContainer.lastElementChild);
        }
        if (contentContainer.childElementCount === 0) {
            continue; // Skip empty results
        }
        resultEl.appendChild(contentContainer);
        
        // Toggle visibility of the contentContainer on title click
        addEventListenerWithTracking(titleEl, 'click', () => {
            const isHidden = contentContainer.style.display === 'none';
            contentContainer.style.display = isHidden ? 'block' : 'none';
        });
        
        resultsArea.appendChild(resultEl);

        // Add a dividing space between notes
        const resultSpace = document.createElement('div');
        resultSpace.classList.add('itags-search-resultSpace');
        resultsArea.appendChild(resultSpace);
    }

    // Remove the last dividing space
    if (resultsArea.lastElementChild) {
        resultsArea.removeChild(resultsArea.lastElementChild);
    }
}

// Helper functions for updating the query area
function addEventListenerWithTracking(element, event, listener) {
    element.addEventListener(event, listener);
    if (!eventListenersMap.has(element)) {
        eventListenersMap.set(element, []);
    }
    eventListenersMap.get(element).push({ event, listener });
}

function removeEventListeners(element) {
    if (eventListenersMap.has(element)) {
        const listeners = eventListenersMap.get(element);
        for (const { event, listener } of listeners) {
            element.removeEventListener(event, listener);
        }
        eventListenersMap.delete(element);
    }
}

function clearNode(node) {
    // Remove all child nodes to avoid memory leaks
    while (node.firstChild) {
        clearNode(node.firstChild);  // Recursively clear child nodes
        removeEventListeners(node.firstChild);
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
}

function handleNoteClick(note) {
    if (!note) {
        return;
    }
    let lastGroup = queryGroups[queryGroups.length - 1];
    let noteExistsInLastGroup = lastGroup && lastGroup.some(n => n.title === note.title);

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
}

function clearResultsArea() {
    clearNode(resultsArea);
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
        .replace(/\*\*(.*?)\*\*/g, "$1")  // strip bold
        .replace(/__(.*?)__/g, "$1")  // strip bold
        .replace(/\*(.*?)\*/g, "$1")  // strip italic
        .replace(/_(.*?)_/g, "$1")  // strip italic
        .replace(/~~(.*?)~~/g, "$1")  // strip strikethrough
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

function createContextMenu(event, result, index) {
    // Prevent the default context menu from appearing
    event.preventDefault();

    // Get the tag element and its text content
    const tagElement = event.target;
    const currentTag = tagElement.textContent;
    const line = parseInt(tagElement.getAttribute('data-line-number'));

    // Create the custom context menu container
    const contextMenu = document.createElement('div');
    contextMenu.classList.add('itags-search-contextMenu');
    contextMenu.style.position = 'absolute';
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;

    // Create the "Search tag" command
    const searchTag = document.createElement('span');
    searchTag.textContent = `Search tag`;
    searchTag.onclick = () => {
        clearQueryArea();
        clearResultsArea();
        tagFilter.value = '';
        resultFilter.value = '';
        sendSetting('filter', '');
        handleTagClick(currentTag.toLowerCase());
        updateTagList();
        sendSearchMessage();
        contextMenu.remove();
    };

    // Create the "Extend query" command
    const extendQuery = document.createElement('span');
    extendQuery.textContent = `Extend query`;
    extendQuery.onclick = () => {
        handleTagClick(currentTag.toLowerCase());
        sendSearchMessage();
        contextMenu.remove();
    };

    // Create the "Add tag" command
    const addTag = document.createElement('span');
    addTag.textContent = `Add tag`;
    addTag.onclick = () => {
        // Create an input field to add a new tag
        const input = createInputField('#new-tag', tagElement, (input) => {
            const newTag = input.value;
            if (newTag && newTag !== '#new-tag') {
                webviewApi.postMessage({
                    name: 'addTag',
                    externalId: result.externalId,
                    line: result.lineNumbers[index] + line,
                    text: result.text[index].split('\n')[line].trim(),
                    tag: newTag,
                });
            }
        });
        contextMenu.remove();
    };

    // Create the "Replace all" command
    const replaceAll = document.createElement('span');
    replaceAll.textContent = `Replace all`;
    replaceAll.onclick = () => {
        // Create an input field with the tag text
        const input = createInputField(currentTag, tagElement, (input) => {
            const newTag = input.value;
            if (newTag && newTag !== currentTag) {
                webviewApi.postMessage({
                    name: 'replaceAll',
                    oldTag: currentTag,
                    newTag: newTag,
                });
            }
        });
        contextMenu.remove();
    };

    // Create the "Replace tag" command
    const replaceTag = document.createElement('span');
    replaceTag.textContent = `Replace tag`;
    replaceTag.onclick = () => {
        // Create an input field with the tag text
        const input = createInputField(currentTag, tagElement, (input) => {
            const newTag = input.value;
            if (newTag && newTag !== currentTag) {
                webviewApi.postMessage({
                    name: 'replaceTag',
                    externalId: result.externalId,
                    line: result.lineNumbers[index] + line,
                    text: result.text[index].split('\n')[line].trim(),
                    oldTag: currentTag,
                    newTag: newTag,
                });
            }
        });
        contextMenu.remove();
    };

    // Create the "Remove tag" command
    const removeTag = document.createElement('span');
    removeTag.textContent = `Remove tag`;
    removeTag.onclick = () => {
        webviewApi.postMessage({
            name: 'removeTag',
            externalId: result.externalId,
            line: result.lineNumbers[index] + line,
            text: result.text[index].split('\n')[line].trim(),
            tag: currentTag,
        });
        contextMenu.remove();
    };

    // Append commands to the contextMenu
    contextMenu.appendChild(searchTag);
    contextMenu.appendChild(extendQuery);
    contextMenu.appendChild(addTag);
    contextMenu.appendChild(replaceTag);
    contextMenu.appendChild(replaceAll);
    contextMenu.appendChild(removeTag);

    // Append the contextMenu to the body or a specific container within your application
    document.body.appendChild(contextMenu);
}

function createInputField(defaultTag, tagElement, finalizeFunction) {
    const input = document.createElement('input');
    input.classList.add('itags-search-replaceTag');
    input.type = 'text';
    input.value = defaultTag;
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

updateTagList(); // Initial update
tagFilter.focus(); // Focus the tag filter input when the panel is loaded

// Event listeners
addEventListenerWithTracking(tagFilter, 'input', updateTagList);
addEventListenerWithTracking(noteFilter, 'input', updateNoteList);

addEventListenerWithTracking(tagClear, 'click', () => {
    clearQueryArea();
    clearResultsArea();
    tagFilter.value = ''; // Clear the input field
    resultFilter.value = ''; // Clear the input field
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

// Post the search query as JSON
addEventListenerWithTracking(tagSearch, 'click', sendSearchMessage);

addEventListenerWithTracking(tagFilter, 'keydown', (event) => {
    if (event.key === 'Enter') {
        // Check if there's exactly one tag in the filtered list
        if (tagFilter.value === '') {
            sendSearchMessage()
        } else if (tagList.childElementCount === 1) {
            // Get the tag name from the only child element of tagList
            const tag = tagList.firstChild.textContent;
            handleTagClick(tag);
            // Optionally, clear the input
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
        // Clear the input and update the tag list
        tagFilter.value = '';
        updateTagList();
    } else if (event.key === 'ArrowUp') {
        // Change the last operator
        toggleLastOperator();
    } else if (event.key === 'ArrowDown') {
        // Toggle last tag negation
        toggleLastTagOrNote();
    }
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
        // Clear the input and update the tag list
        noteFilter.value = '';
        noteList.value = 'default';
        updateNoteList();
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
        handleNoteClick({ title: 'Current note', externalId: 'current', negated: false });
    }
    handleNoteClick(allNotes.find(note => note.externalId === noteList.value));
    noteList.value = 'default'; // Clear the input field
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
        // Clear the input and update the results area
        resultFilter.value = '';
        updateResultsArea();
        sendSetting('filter', '');
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
            menu.remove();
        }
    });
});

addEventListenerWithTracking(document, 'contextmenu', (event) => {
    if (event.target.matches('.itags-search-renderedTag')) {
        return;
    }
    const contextMenu = document.querySelectorAll('.itags-search-contextMenu');
    contextMenu.forEach(menu => {
        if (!menu.contains(event.target)) {
            menu.remove();
        }
    });
});

addEventListenerWithTracking(document, 'keydown', (event) => {
    if (event.key === 'Escape') {
        const contextMenu = document.querySelectorAll('.itags-search-contextMenu');
        contextMenu.forEach(menu => {
            menu.remove();
        });
    }
});

webviewApi.postMessage({
    name: 'initPanel',
});