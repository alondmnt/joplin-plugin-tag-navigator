document.addEventListener('click', event => {
  const element = event.target;

  if (element.classList.contains('itags-nav-noteTag')) {
    webviewApi.postMessage({
      name: 'jumpToLine',
      line: element.dataset.line,
      tag: element.dataset.tag,
    });
  }

  if (element.classList.contains('itags-nav-globalTag')) {
    if (event.shiftKey) {
      webviewApi.postMessage({
        name: 'insertTag',
        tag: element.dataset.tag,
      });
    } else if (event.ctrlKey || event.metaKey) {
      webviewApi.postMessage({
        name: 'extendQuery',
        tag: element.dataset.tag,
      });
    } else {
      webviewApi.postMessage({
        name: 'searchTag',
        tag: element.dataset.tag,
      });
    }
  }

  if (element.id === 'itags-nav-noteButton') {
    const globalArea = document.getElementById('itags-nav-globalArea');
    const noteArea = document.getElementById('itags-nav-noteArea');
    const globalButton = document.getElementById('itags-nav-globalButton');
    const noteButton = element;

    if (noteArea.style.display === 'none') {
      globalButton.classList.remove('selectedTab');
      globalArea.style.display = 'none';
      noteButton.classList.add('selectedTab');
      noteArea.style.display = 'block';
      webviewApi.postMessage({
        name: 'updateSetting',
        field: 'itags.navPanelScope',
        value: 'note',
      });
    }
  }

  if (element.id === 'itags-nav-globalButton') {
    const globalArea = document.getElementById('itags-nav-globalArea');
    const noteArea = document.getElementById('itags-nav-noteArea');
    const globalButton = element;
    const noteButton = document.getElementById('itags-nav-noteButton');

    if (globalArea.style.display === 'none') {
      noteButton.classList.remove('selectedTab');
      noteArea.style.display = 'none';
      globalButton.classList.add('selectedTab');
      globalArea.style.display = 'block';
      webviewApi.postMessage({
        name: 'updateSetting',
        field: 'itags.navPanelScope',
        value: 'global',
      });
    }
  }
});
