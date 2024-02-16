let queryGroups = [[]]; // Array of Sets
// each set is a group of tags combined with "AND"
// sets are combined with "OR"

const tagFilterInput = document.getElementById('tagFilter');
const clearButton = document.getElementById('clearButton');
const searchButton = document.getElementById('searchButton');
const tagList = document.getElementById('tagList');
const queryArea = document.getElementById('queryArea');

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
            tagEl.classList.add('tag', item.negated ? 'negated' : 'selected');
            tagEl.textContent = item.negated ? `!${item.tag}` : item.tag;
            tagEl.onclick = () => {
                toggleTagNegation(groupIndex, tagIndex);
                updateQueryArea(); // Refresh after toggling negation
            };

            // Append a delete button for each tag
            const deleteBtn = document.createElement('button');
            deleteBtn.classList.add('delete-btn');
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

function createOperatorElement(operator, groupIndex, isGroupOperator, tagIndex) {
    const operatorEl = document.createElement('span');
    operatorEl.classList.add('operator');
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

function updateTagList() {
    tagList.innerHTML = '';
    const filter = tagFilterInput.value.toLowerCase();
    const allTags = JSON.parse(document.getElementById('tagData').textContent);
    allTags.filter(tag => tag.toLowerCase().includes(filter)).forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.classList.add('tag');
        tagEl.textContent = tag;
        tagEl.onclick = () => handleTagClick(tag);
        tagList.appendChild(tagEl);
    });
}



// Function to clear the query area - you need to implement this based on your specific setup
function clearQueryArea() {
    // For example, clear the innerHTML of the query area
    queryGroups = [[]]; // Reset the query groups
    lastGroup = queryGroups[0];
    document.getElementById('queryArea').innerHTML = '';
}

updateTagList(); // Initial update
document.getElementById('tagFilter').addEventListener('input', updateTagList);

// Clear the query area
clearButton.addEventListener('click', () => {
    // Assuming you have a function or a way to clear the query area
    clearQueryArea(); // Implement this function to clear the query area
    tagFilterInput.value = ''; // Clear the input field
    updateTagList();
});

// Post the search query as JSON
searchButton.addEventListener('click', () => {
    const searchQuery = tagFilterInput.value;
    // Use webviewApi.postMessage to send the search query back to the plugin
    webviewApi.postMessage({
        name: 'searchQuery',
        query: searchQuery,
    });
});

tagFilterInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        // Check if there's exactly one tag in the filtered list
        if (tagList.childElementCount === 1) {
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