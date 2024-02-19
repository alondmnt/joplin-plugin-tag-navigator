let queryGroups = []; // Array of Sets
// each set is a group of tags combined with "AND"
// sets are combined with "OR"
let allTags = [];

const tagFilterInput = document.getElementById('itags-search-tagFilter');
const clearButton = document.getElementById('itags-search-clearButton');
const searchButton = document.getElementById('itags-search-searchButton');
const tagList = document.getElementById('itags-search-tagList');
const queryArea = document.getElementById('itags-search-queryArea');
const resultsArea = document.getElementById('itags-search-resultsArea');

// Listen for messages from the main process
webviewApi.onMessage((message) => {
    if (message.message.name === 'updateTagData') {
        allTags = JSON.parse(message.message.tags);
        updateTagList();
    } else if (message.message.name === 'updateResults') {
        const results = JSON.parse(message.message.results);
        updateResultsArea(results);
    } else if (message.message.name === 'focusTagFilter') {
        tagFilterInput.focus();
    }
});

function updateTagList() {
    tagList.innerHTML = '';
    const filter = tagFilterInput.value.toLowerCase();
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
            deleteBtn.classList.add('itags-delete-btn');
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

function updateResultsArea(results) {
    resultsArea.innerHTML = ''; // Clear the current content
    results.forEach((result, index) => {
        const resultEl = document.createElement('div');
        resultEl.classList.add('itags-search-resultNote');
        
        const titleEl = document.createElement('h3');
        titleEl.textContent = result.title;
        titleEl.style.cursor = 'pointer'; // Make the title look clickable
        resultEl.appendChild(titleEl);
        
        const contentContainer = document.createElement('div');
        contentContainer.classList.add('itags-search-resultContent');
        contentContainer.style.display = 'block'; // Initially show the content
        
        result.html.forEach((entry, index) => {
            const entryEl = document.createElement('div');
            entryEl.classList.add('itags-search-resultSection');
            entryEl.innerHTML = entry;
            entryEl.style.cursor = 'pointer'; // Make the content look clickable

            entryEl.addEventListener('click', () => {
                // Handle click on the content
                webviewApi.postMessage({
                    name: 'openNote',
                    externalId: result.externalId,
                    line: result.lineNumbers[index],
                });
            });

            contentContainer.appendChild(entryEl);
            
            // Add a dividing line between sections, but not after the last one
            if (index < result.html.length - 1) {
                const divider = document.createElement('hr');
                contentContainer.appendChild(divider);
            }
        });
        
        resultEl.appendChild(contentContainer);
        
        // Toggle visibility of the contentContainer on title click
        titleEl.addEventListener('click', () => {
            const isHidden = contentContainer.style.display === 'none';
            contentContainer.style.display = isHidden ? 'block' : 'none';
        });
        
        resultsArea.appendChild(resultEl);

        // Add a dividing space between notes, but not after the last one
        if (index < results.length - 1) {
            const resultSpace = document.createElement('div');
            resultSpace.classList.add('itags-search-resultSpace');
            resultsArea.appendChild(resultSpace);
        }
    });
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

function clearQueryArea() {
    // For example, clear the innerHTML of the query area
    queryGroups = []; // Reset the query groups
    lastGroup = queryGroups[0];
    document.getElementById('itags-search-queryArea').innerHTML = '';
}

function clearResultsArea() {
    document.getElementById('itags-search-resultsArea').innerHTML = '';
}

function sendSearchMessage() {
    if (queryGroups.length === 0) {
        return; // Don't send an empty query
    }
    const searchQuery = JSON.stringify(queryGroups);
    // Use webviewApi.postMessage to send the search query back to the plugin
    webviewApi.postMessage({
        name: 'searchQuery',
        query: searchQuery,
    });
}

updateTagList(); // Initial update
document.getElementById('itags-search-tagFilter').addEventListener('input', updateTagList);

tagFilterInput.focus(); // Focus the tag filter input when the panel is loaded

// Clear the query area
clearButton.addEventListener('click', () => {
    // Assuming you have a function or a way to clear the query area
    clearQueryArea();
    clearResultsArea();
    tagFilterInput.value = ''; // Clear the input field
    updateTagList();
});

// Post the search query as JSON
searchButton.addEventListener('click', () => {
    sendSearchMessage();
});

tagFilterInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        // Check if there's exactly one tag in the filtered list
        if (tagFilterInput.value === '') {
            sendSearchMessage()
        } else if (tagList.childElementCount === 1) {
            // Get the tag name from the only child element of tagList
            const tag = tagList.firstChild.textContent;
            handleTagClick(tag);
            // Optionally, clear the input
            tagFilterInput.value = '';
            // Update the tag list to reflect the current filter or clear it
            updateTagList();
        }
    }
});