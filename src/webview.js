document.addEventListener('click', event => {
	const element = event.target;
	if (element.className === 'itags-panel-section') {
		// Post the message and slug info back to the plugin:
		webviewApi.postMessage({
			name: 'jumpToLine',
			line: element.dataset.line,
		});
	}
});