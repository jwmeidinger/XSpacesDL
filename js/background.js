let monitoringEnabled = false;

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'enableMonitoring') {
        monitoringEnabled = true;
        console.log('Background script: Monitoring enabled.');
        sendResponse({ success: true });
    } else if (message.action === 'transcodeVideo') {
        console.log('Background script: Transcode video request received.', message.url);
        sendResponse({ success: true });
    }
    return true;
});

// Use onBeforeSendHeaders instead of onBeforeRequest
chrome.webRequest.onBeforeSendHeaders.addListener(
    function(details) {
        if (monitoringEnabled && details.url.includes('.m3u8')) {
            console.log('Detected .m3u8 URL:', details.url);
            chrome.tabs.sendMessage(details.tabId, {
                action: 'foundM3U8Url',
                url: details.url,
            });
            monitoringEnabled = false;
        }
        return { cancel: false };
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders"]
);

// Add declarative content rules
chrome.runtime.onInstalled.addListener(() => {
    chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
        chrome.declarativeContent.onPageChanged.addRules([{
            conditions: [
                new chrome.declarativeContent.PageStateMatcher({
                    css: ["video"]
                })
            ],
            actions: [new chrome.declarativeContent.ShowAction()]
        }]);
    });
});