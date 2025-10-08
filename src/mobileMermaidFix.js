(function() {
  const MERMAID_SELECTOR = '.mermaid';
  const RETRY_DELAYS = [0];

  function runMermaidOnce() {
    if (typeof mermaid === 'undefined' || !mermaid || typeof mermaid.init !== 'function') {
      return false;
    }

    try {
      mermaid.init(undefined, MERMAID_SELECTOR);
      return true;
    } catch (error) {
      console.error('Tag Navigator: Mermaid reinitialisation failed.', error);
      return false;
    }
  }

  function scheduleRuns() {
    RETRY_DELAYS.forEach(delay => {
      setTimeout(runMermaidOnce, delay);
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scheduleRuns);
    } else {
      scheduleRuns();
    }

    document.addEventListener('joplin-noteDidUpdate', scheduleRuns);
  }
})();
