let queryGroups = []; // Array of Sets
// each set is a group of tags combined with "AND"
// sets are combined with "OR"
let allTags = [];
let results = [];

const tagFilter = document.getElementById('itags-search-tagFilter');
const tagClear = document.getElementById('itags-search-tagClear');
const tagSearch = document.getElementById('itags-search-tagSearch');
const tagList = document.getElementById('itags-search-tagList');
const queryArea = document.getElementById('itags-search-queryArea');
const resultFilter = document.getElementById('itags-search-resultFilter');
let resultToggleState = 'collapse';
const resultSort = document.getElementById('itags-search-resultSort');
const resultOrder = document.getElementById('itags-search-resultOrder');
let resultOrderState = 'desc';
const resultToggle = document.getElementById('itags-search-resultToggle');
const resultsArea = document.getElementById('itags-search-resultsArea');

// Listen for messages from the main process
webviewApi.onMessage((message) => {
    if (message.message.name === 'updateTagData') {
        allTags = JSON.parse(message.message.tags);
        updateTagList();
    } else if (message.message.name === 'updateResults') {
        results = JSON.parse(message.message.results);
        updateResultsArea();
    } else if (message.message.name === 'focusTagFilter') {
        tagFilter.focus();
    }
});

// Update areas
function updateTagList() {
    tagList.innerHTML = '';
    const filter = tagFilter.value.toLowerCase();
    allTags.filter(tag => tag.toLowerCase().includes(filter)).forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.classList.add('itags-search-tag');
        tagEl.textContent = tag;
        tagEl.onclick = () => handleTagClick(tag);
        tagList.appendChild(tagEl);
    });
}

function updateQueryArea() {
    queryArea.innerHTML = ''; // Clear the current content
    queryGroups.forEach((group, groupIndex) => {
        if (groupIndex > 0) {
            // Use OR between groups
            let orOperator = createOperatorElement('OR', groupIndex - 1, true);
            queryArea.appendChild(orOperator);
        }

        queryArea.appendChild(document.createTextNode('(')); // Start group

        group.forEach((item, tagIndex) => {
            // Display each tag with its state
            const tagEl = document.createElement('span');
            tagEl.classList.add('itags-search-tag', item.negated ? 'negated' : 'selected');
            tagEl.textContent = item.negated ? `! ${item.tag}` : item.tag;
            tagEl.onclick = () => {
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
            tagEl.appendChild(deleteBtn);
            queryArea.appendChild(tagEl);

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
    const filter = resultFilter.value.toLowerCase();
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

    resultsArea.innerHTML = ''; // Clear the current content
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
        contentContainer.style.display = (resultToggleState === 'collapse') ? 'block': 'none';
        
        for (let index = 0; index < result.html.length; index++) {
            let entry = result.html[index];
            if (filter.length > 1) {
                if (!result.text[index].toLowerCase().includes(filter) && !result.title.toLowerCase().includes(filter)) {
                    continue; // Skip entries that don't match the filter
                }
                entry = entry.replace(new RegExp(`(${filter})`, 'gi'), '<mark id="itags-search-renderedFilter">$1</mark>');
                titleEl.innerHTML = titleEl.textContent.replace(new RegExp(`(${filter})`, 'gi'), '<mark id="itags-search-renderedFilter">$1</mark>');
            }

            const entryEl = document.createElement('div');
            entryEl.classList.add('itags-search-resultSection');
            entryEl.innerHTML = entry;
            entryEl.style.cursor = 'pointer'; // Make the content look clickable

            entryEl.addEventListener('click', (event) => {
                // Handle click on the content
                if (event.target.matches('.task-list-item-checkbox')) {
                    webviewApi.postMessage({
                        name: 'setCheckBox',
                        externalId: result.externalId,
                        line: result.lineNumbers[index],
                        text: result.text[index],
                        checked: event.target.checked,
                    });
                } else {
                    webviewApi.postMessage({
                        name: 'openNote',
                        externalId: result.externalId,
                        line: result.lineNumbers[index],
                    });
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
        titleEl.addEventListener('click', () => {
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
            const x = acc.find(item => item.tag === current.tag);
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

function toggleLastTag() {
    // Toggle the negation of the last tag
    let lastGroup = queryGroups[queryGroups.length - 1];
    if (lastGroup) {
        let lastTag = lastGroup[lastGroup.length - 1];
        lastTag.negated = !lastTag.negated;
        updateQueryArea();
    }
}

// Helper functions for clearing areas
function clearQueryArea() {
    // For example, clear the innerHTML of the query area
    queryGroups = []; // Reset the query groups
    lastGroup = queryGroups[0];
    document.getElementById('itags-search-queryArea').innerHTML = '';
}

function clearResultsArea() {
    document.getElementById('itags-search-resultsArea').innerHTML = '';
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
document.getElementById('itags-search-tagFilter').addEventListener('input', updateTagList);

tagClear.addEventListener('click', () => {
    // Assuming you have a function or a way to clear the query area
    clearQueryArea();
    clearResultsArea();
    tagFilter.value = ''; // Clear the input field
    resultFilter.value = ''; // Clear the input field
    updateTagList();
});

// Post the search query as JSON
tagSearch.addEventListener('click', () => {
    sendSearchMessage();
});

tagFilter.addEventListener('keydown', (event) => {
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
        toggleLastTag();
    }
});

resultFilter.addEventListener('input', () => {
    updateResultsArea();
});

resultFilter.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        // Clear the input and update the results area
        resultFilter.value = '';
        updateResultsArea();
    }
});

resultSort.addEventListener('change', () => {
    updateResultsArea();
});

resultOrder.addEventListener('click', () => {
    if (resultOrderState === 'asc') {
        resultOrderState = 'desc';
        resultOrder.innerHTML = '<i class="fas fa-sort-amount-up"></i>';
    } else if (resultOrderState === 'desc') {
        resultOrderState = 'asc';
        resultOrder.innerHTML = '<i class="fas fa-sort-amount-down"></i>';
    }
    updateResultsArea();
});

resultToggle.addEventListener('click', () => {
    if (resultToggleState === 'collapse') {
        collapseResults();
        resultToggleState = 'expand';
        resultToggle.innerHTML = '<i class="fas fa-chevron-down"></i>';
        return;
    } else if (resultToggleState === 'expand') {
        expandResults();
        resultToggleState = 'collapse';
        resultToggle.innerHTML = '<i class="fas fa-chevron-up"></i>';
        return;
    }
});
