// js/main.js

// Import necessary utilities
import runFFmpeg from "/js/runFFmpeg.js"

// State Tracking
let startTime = null;

/**
 * Formats time in seconds to MM:SS format.
 * @param {number} seconds 
 * @returns {string} Formatted time string
 */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Updates the elapsed time display.
 */
function updateElapsedTime() {
    if (startTime) {
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const elapsedElement = document.getElementById('elapsed-time');
        if (elapsedElement) {
            elapsedElement.textContent = formatTime(elapsedSeconds);
        }
    }
}

/**
 * Starts the elapsed time timer.
 */
function startTimer() {
    startTime = Date.now();
    setInterval(updateElapsedTime, 1000);
}

/**
 * Formats file size from bytes to a readable string.
 * @param {number} bytes 
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Updates the status message in the UI and logs it.
 * @param {string} message 
 */
function updateStatus(message) {
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.textContent = message;
    }
    console.log(`Status update: ${message}`);
}

/**
 * Updates the progress bar and its value in the UI.
 * @param {number} percent 
 */
function updateProgress(percent) {
    const progressBar = document.getElementById('progress-bar');
    const progressValue = document.getElementById('progress-bar-value');
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }
    if (progressValue) {
        progressValue.textContent = `${Math.round(percent)}%`;
    }
}

/**
 * Displays an error message in the UI.
 * @param {string} message 
 */
function showError(message) {
    const errorDiv = document.getElementById('error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

/**
 * Updates the file size display in the UI.
 * @param {number} size 
 */
function updateFileSize(size) {
    const sizeElement = document.getElementById('file-size');
    if (sizeElement) {
        sizeElement.textContent = formatFileSize(size);
    }
}

/**
 * Updates the processing speed display in the UI.
 * @param {number} speed 
 */
function updateProcessingSpeed(speed) {
    const speedElement = document.getElementById('processing-speed');
    if (speedElement) {
        speedElement.textContent = `${speed.toFixed(2)} fps`;
    }
}

/**
 * Initiates the download of a file blob.
 * @param {Blob} blob 
 * @param {string} fileName 
 */
function downloadFile(blob, fileName) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    updateStatus(`Downloaded ${fileName}`);
    updateFileSize(blob.size);
}

/**
 * Fetches the m3u8 playlist from the provided URL.
 * @param {string} m3u8Url 
 * @returns {Promise<string>} The m3u8 playlist text
 */
async function fetchM3U8(m3u8Url) {
    updateStatus('Fetching m3u8 playlist...');
    try {
        const response = await fetch(m3u8Url);
        if (!response.ok) {
            throw new Error('Failed to fetch m3u8 playlist.');
        }
        return await response.text();
    } catch (error) {
        showError(`Failed to fetch playlist: ${error.message}`);
        throw error;
    }
}

/**
 * Parses the m3u8 playlist text to extract chunk URLs.
 * @param {string} text 
 * @param {string} baseUrl 
 * @returns {string[]} Array of chunk URLs
 */
function parseM3U8(text, baseUrl) {
    updateStatus('Parsing m3u8 playlist...');
    const lines = text.split('\n');
    const chunkUrls = [];

    for (let line of lines) {
        line = line.trim();
        if (line && !line.startsWith('#')) {
            const url = new URL(line, baseUrl).href;
            chunkUrls.push(url);
        }
    }
    return chunkUrls;
}

/**
 * Downloads the chunks in batches to optimize network usage.
 * @param {string[]} chunkUrls 
 * @param {number} batchSize 
 * @returns {Promise<ArrayBuffer[]>} Array of downloaded chunk ArrayBuffers
 */
async function downloadChunksInBatches(chunkUrls, batchSize = 5) {
    updateStatus(`Downloading ${chunkUrls.length} chunks...`);
    const chunks = new Array(chunkUrls.length);
    let totalDownloaded = 0;
    
    for (let i = 0; i < chunkUrls.length; i += batchSize) {
        const batch = chunkUrls.slice(i, i + batchSize);
        const batchStart = i;
        
        updateStatus(`Downloading batch ${Math.floor(i / batchSize) + 1} (chunks ${i + 1}-${Math.min(i + batchSize, chunkUrls.length)})`);
        
        try {
            const batchPromises = batch.map(async (url, batchIndex) => {
                try {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error('Failed to download chunk: ' + url);
                    const arrayBuffer = await res.arrayBuffer();
                    chunks[batchStart + batchIndex] = arrayBuffer;
                    totalDownloaded++;
                    updateProgress((totalDownloaded / chunkUrls.length) * 100);
                } catch (error) {
                    console.error(error);
                    throw new Error(`Error downloading chunk ${batchStart + batchIndex + 1}: ${error.message}`);
                }
            });

            await Promise.all(batchPromises);
        } catch (error) {
            showError(`Batch download failed: ${error.message}`);
            throw error;
        }
    }

    if (chunks.some(chunk => chunk === undefined)) {
        throw new Error('Some chunks failed to download');
    }

    return chunks;
}

/**
 * Merges the downloaded chunks into a single ArrayBuffer.
 * @param {ArrayBuffer[]} chunks 
 * @returns {ArrayBuffer} Merged ArrayBuffer
 */
function mergeChunks(chunks) {
    updateStatus('Merging chunks...');
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    const mergedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        mergedBuffer.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
    }
    updateFileSize(totalLength);
    return mergedBuffer.buffer;
}

/**
 * Splits an ArrayBuffer into chunks
 * @param {ArrayBuffer} buffer 
 * @param {number} chunkSize Size in bytes
 * @returns {ArrayBuffer[]}
 */
function splitBuffer(buffer, chunkSize = 10 * 1024 * 1024) { // 10MB chunks
    const chunks = [];
    const view = new Uint8Array(buffer);
    for (let i = 0; i < view.length; i += chunkSize) {
        chunks.push(buffer.slice(i, i + chunkSize));
    }
    return chunks;
}

/**
 * Sends the audio blob to the transcription service.
 * @param {Blob} audioBlob 
 * @returns {Promise<Object>} Transcription result
 */
async function sendToTranscriptionService(audioBlob) {
    updateStatus('Sending audio for transcription...');
    
    try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.mp3');

        const response = await fetch('YOUR_TRANSCRIPTION_ENDPOINT', { // Replace with your endpoint
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Transcription service error');
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Transcription error:', error);
        showError(`Transcription failed: ${error.message}`);
        throw error;
    }
}

/**
 * Displays a confirmation dialog to the user.
 * @param {string} message 
 * @returns {Promise<boolean>} User's choice
 */
function showConfirmDialog(message) {
    return new Promise((resolve) => {
        const dialogContainer = document.createElement('div');
        dialogContainer.className = 'dialog-container';
        
        const dialog = document.createElement('div');
        dialog.className = 'dialog';
        dialog.innerHTML = `
            <p>${message}</p>
            <div class="dialog-buttons">
                <button class="btn-yes">Yes</button>
                <button class="btn-no">No</button>
            </div>
        `;
        
        dialogContainer.appendChild(dialog);
        document.body.appendChild(dialogContainer);
        
        const handleResponse = (response) => {
            document.body.removeChild(dialogContainer);
            resolve(response);
        };
        
        dialog.querySelector('.btn-yes').onclick = () => handleResponse(true);
        dialog.querySelector('.btn-no').onclick = () => handleResponse(false);
    });
}

/**
 * Displays the transcription result to the user.
 * @param {Object} result 
 */
function showTranscriptionResult(result) {
    const resultDialog = document.createElement('div');
    resultDialog.className = 'dialog-container';
    resultDialog.innerHTML = `
        <div class="dialog transcription-result">
            <h3>Transcription Result</h3>
            <div class="transcription-text">${result.text}</div>
            <div class="dialog-buttons">
                <button class="btn-copy">Copy to Clipboard</button>
                <button class="btn-close">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(resultDialog);
    
    resultDialog.querySelector('.btn-copy').onclick = () => {
        navigator.clipboard.writeText(result.text);
        updateStatus('Transcription copied to clipboard!');
    };
    
    resultDialog.querySelector('.btn-close').onclick = () => {
        document.body.removeChild(resultDialog);
    };
}

/**
 * Processes the merged buffer based on user choices for downloading and transcribing.
 * @param {ArrayBuffer} mergedBuffer 
 */
async function processWithUserChoice(mergedBuffer) {
    try {
        const downloadMP3 = await showConfirmDialog('Would you like to download the MP3 file?');
        let mp3Blob;

        if (downloadMP3) {
            mp3Blob = await convertToFormat(mergedBuffer, 'mp3');
            downloadFile(mp3Blob, 'output.mp3');
        }

        const transcribe = await showConfirmDialog('Would you like to transcribe the audio to text?');
        if (transcribe) {
            if (!mp3Blob) {
                mp3Blob = await convertToFormat(mergedBuffer, 'mp3');
            }
            try {
                const transcription = await sendToTranscriptionService(mp3Blob);
                showTranscriptionResult(transcription);
            } catch (error) {
                showError('Transcription failed: ' + error.message);
            }
        }

        const downloadMP4 = await showConfirmDialog('Would you like to download the MP4 file?');
        if (downloadMP4) {
            const mp4Blob = await convertToFormat(mergedBuffer, 'mp4');
            downloadFile(mp4Blob, 'output.mp4');
        }

        updateStatus('All requested operations completed!');
    } catch (error) {
        console.error('Processing error:', error);
        showError(error.message);
    } finally {
        // Optionally, close the offscreen document after processing
        chrome.offscreen.closeDocument().catch(err => {
            console.warn('Offscreen document could not be closed:', err);
        });
    }
}

/**
 * Processes the m3u8 URL by fetching, downloading chunks, merging, and handling user choices.
 * @param {string} m3u8Url 
 */
async function processM3U8(m3u8Url) {
    try {
        startTimer();
        const m3u8Text = await fetchM3U8(m3u8Url);
        const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
        const chunkUrls = parseM3U8(m3u8Text, baseUrl);
        
        if (chunkUrls.length === 0) {
            throw new Error('No chunks found in the m3u8 playlist.');
        }

        const chunks = await downloadChunksInBatches(chunkUrls);
        const mergedBuffer = mergeChunks(chunks);
        await processWithUserChoice(mergedBuffer);
    } catch (error) {
        console.error('Error processing m3u8:', error);
        showError(error.message);
        updateStatus('Error: ' + error.message);
    }
}

/**
 * Retrieves the m3u8 URL from the query parameters.
 * @returns {string|null} The m3u8 URL or null if not found
 */
function getM3U8Url() {
    const params = new URLSearchParams(window.location.search);
    return params.get('url');
}

/**
 * Modified conversion function to handle chunked processing
 * @param {ArrayBuffer} buffer 
 * @param {string} format 
 * @returns {Promise<Blob>}
 */
async function convertToFormat(buffer, format) {
    try {
        updateStatus(`Converting to ${format.toUpperCase()}...`);
        const convertedBuffer = await runFFmpeg(buffer, format);
        const blob = new Blob([convertedBuffer], { 
            type: format === 'mp3' ? 'audio/mp3' : 'video/mp4' 
        });
        return blob;
    } catch (error) {
        console.error(`${format.toUpperCase()} conversion error:`, error);
        showError(`Conversion to ${format.toUpperCase()} failed: ${error.message}`);
        throw error;
    }
}

// Listener for messages from the offscreen document (e.g., progress updates)
// Removed as progress is handled via port.onMessage

// Main Initialization
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const m3u8Url = getM3U8Url();
        if (m3u8Url) {
            updateStatus('Starting processing of the m3u8 URL.');
            await processM3U8(m3u8Url);
        } else {
            console.log('No m3u8 URL provided.');
            updateStatus('No m3u8 URL provided.');
            showError('No m3u8 URL provided in the query parameters.');
        }
    } catch (error) {
        console.error('Initialization error:', error);
        showError(error.message);
        updateStatus('Error: ' + error.message);
    }
});
