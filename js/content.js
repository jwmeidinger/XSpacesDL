// js/content.js
console.log('Content script loaded');

// Global error listener
window.addEventListener('error', function (e) {
  console.error('Global error:', e.error);
});

// Function to detect and handle the play button click
function detectPlayButton() {
  // Adjust the selector based on the button's attributes
  const buttons = document.querySelectorAll('button');

  buttons.forEach((button) => {
    const span = button.querySelector('span');
    if (
      span &&
      (span.textContent.includes('Play recording') ||
        span.textContent.trim() === 'Play')
    ) {
      console.log('Play button detected:', button);
      setupPlayButtonListener(button);
    }
  });

  // Use MutationObserver in case the button isn't present yet
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const buttons = node.querySelectorAll('button');
          buttons.forEach((button) => {
            const span = button.querySelector('span');
            if (
              span &&
              (span.textContent.includes('Play recording') ||
                span.textContent.trim() === 'Play')
            ) {
              console.log('Play button detected via MutationObserver:', button);
              setupPlayButtonListener(button);
            }
          });
        }
      });
    });
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
}

function setupPlayButtonListener(button) {
  button.addEventListener('click', () => {
    console.log('Play button clicked.');
    // Send message to background script to enable monitoring
    chrome.runtime.sendMessage({ action: 'enableMonitoring' });
  });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(function (
  message,
  sender,
  sendResponse
) {
  if (message.action === 'foundM3U8Url') {
    const m3u8Url = message.url;
    console.log('Content script received m3u8 URL:', m3u8Url);

    // Prompt the user
    const userAgreed = window.confirm("Would you like to see a summary of the space?");
    if (userAgreed) {
      // Open options.html with the m3u8Url as a query parameter
      const optionsUrl = chrome.runtime.getURL('html/app.html') + '?url=' + encodeURIComponent(m3u8Url);
      window.open(optionsUrl, '_blank');
    }
    // If user says no, do nothing
  }
});

// Start detecting the play button
detectPlayButton();
