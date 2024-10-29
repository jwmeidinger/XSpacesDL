// js/offscreen.js

const { createFFmpeg, fetchFile } = FFmpeg;

// Helper function to get extension resource URLs
function getResourceUrl(path) {
    return chrome.runtime.getURL(path);
}

// Pre-load and verify FFmpeg resources
async function verifyFFmpegResources() {
    const resources = [
        'lib/ffmpeg-core.js',
        'lib/ffmpeg-core.wasm',
    ];

    console.log('Verifying FFmpeg resources...');
    
    for (const resource of resources) {
        const url = getResourceUrl(resource);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            console.log(`✓ Successfully verified ${resource}`);
        } catch (error) {
            console.error(`× Failed to verify ${resource}:`, error);
            throw new Error(`Failed to load ${resource}: ${error.message}`);
        }
    }
}

// Initialize FFmpeg with proper resource loading
async function initializeFFmpeg() {
    const ffmpeg = createFFmpeg({
        corePath: chrome.runtime.getURL("lib/ffmpeg-core.js"),
        wasmPath: chrome.runtime.getURL("lib/ffmpeg-core.wasm"),
        log: true,
        mainName: 'main'
    });
    console.log('FFmpeg instance created, loading...');
    try {
        await ffmpeg.load();
        console.log('FFmpeg loaded successfully');
    } catch (e) {
        console.error('FFmpeg load failed:', e);
        throw e;
    }
    return ffmpeg;
}


// Global FFmpeg instance with lazy loading
let ffmpeg = null;
let ffmpegLoadPromise = null;

/**
 * Loads the FFmpeg core with better error handling
 */
async function loadFFmpeg() {
    if (ffmpeg && ffmpeg.isLoaded()) {
        return ffmpeg;
    }

    if (!ffmpegLoadPromise) {
        ffmpegLoadPromise = (async () => {
            try {
                ffmpeg = await initializeFFmpeg();
                return ffmpeg;
            } catch (error) {
                ffmpegLoadPromise = null;
                throw error;
            }
        })();
    }

    return ffmpegLoadPromise;
}

// Rest of your existing code...

/**
 * Converts the input buffer to the desired format using FFmpeg.
 * @param {ArrayBuffer} buffer 
 * @param {string} format 
 * @returns {Promise<ArrayBuffer>} Converted buffer
 */
async function convertBuffer(buffer, format) {
    try {
        // Get FFmpeg instance
        ffmpeg = await loadFFmpeg();
        
        console.log(`Converting buffer of size ${buffer.byteLength} to ${format}`);

        const inputFile = 'input.aac';
        
        // Write input file
        try {
            ffmpeg.FS('writeFile', inputFile, new Uint8Array(buffer));
            console.log('Input file written successfully');
        } catch (error) {
            console.error('Error writing input file:', error);
            throw new Error(`Failed to write input file: ${error.message}`);
        }

        let outputFile, args;

        if (format === 'mp3') {
            outputFile = 'output.mp3';
            args = [
                '-i', inputFile,
                '-vn',
                '-ac', '2',
                '-ar', '44100',
                '-ab', '192k',
                '-acodec', 'libmp3lame',
                '-f', 'mp3',
                '-y',
                outputFile
            ];
        } else if (format === 'mp4') {
            outputFile = 'output.mp4';
            args = [
                '-i', inputFile,
                '-c:a', 'aac',
                '-b:a', '192k',
                '-f', 'mp4',
                '-y',
                outputFile
            ];
        } else {
            throw new Error(`Unsupported format: ${format}`);
        }

        console.log('FFmpeg command:', args.join(' '));

        // Run FFmpeg
        try {
            await ffmpeg.run(...args);
            console.log('FFmpeg conversion completed');
        } catch (error) {
            console.error('FFmpeg run error:', error);
            throw new Error(`FFmpeg conversion failed: ${error.message}`);
        }

        // Read output
        let data;
        try {
            data = ffmpeg.FS('readFile', outputFile);
            console.log('Output file read successfully');
        } catch (error) {
            console.error('Error reading output file:', error);
            throw new Error(`Failed to read output file: ${error.message}`);
        }

        // Cleanup
        try {
            ffmpeg.FS('unlink', inputFile);
            ffmpeg.FS('unlink', outputFile);
        } catch (error) {
            console.warn('Cleanup warning:', error);
        }

        return data.buffer;
    } catch (error) {
        console.error('Conversion error:', error);
        throw new Error(`Conversion error: ${error.message}`);
    }
}

let currentPort = null;
let currentTransfer = null;
let receivedChunks = [];

// Port connection handler
chrome.runtime.onConnect.addListener((port) => {
    console.log('Port connected');
    currentPort = port;
    
    port.onMessage.addListener(async (message) => {
        try {
            console.log('Received message:', message.type);
            
            switch (message.type) {
                case 'chunk-transfer':
                    console.log(`Receiving chunk ${message.chunkIndex + 1}/${message.totalChunks}`);
                    receivedChunks[message.chunkIndex] = message.chunk;
                    currentTransfer = message.transferId;
                    
                    // Acknowledge receipt
                    port.postMessage({ type: 'chunk-received' });
                    break;

                case 'transfer-complete':
                    console.log('Transfer complete, processing buffer...');
                    if (message.transferId === currentTransfer) {
                        try {
                            // Merge chunks
                            const totalLength = receivedChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
                            const mergedBuffer = new Uint8Array(totalLength);
                            let offset = 0;
                            
                            for (const chunk of receivedChunks) {
                                mergedBuffer.set(new Uint8Array(chunk), offset);
                                offset += chunk.byteLength;
                            }

                            // Convert merged buffer
                            const convertedBuffer = await convertBuffer(mergedBuffer.buffer, message.format);
                            
                            // Split result for transfer
                            const responseChunks = splitBuffer(convertedBuffer);
                            console.log(`Sending back ${responseChunks.length} chunks`);

                            // Send converted chunks back
                            responseChunks.forEach((chunk, index) => {
                                port.postMessage({
                                    type: 'ffmpeg-convert-success',
                                    buffer: chunk,
                                    chunkIndex: index,
                                    totalChunks: responseChunks.length
                                });
                            });
                        } catch (error) {
                            console.error('Processing error:', error);
                            port.postMessage({
                                type: 'ffmpeg-convert-error',
                                error: error.message
                            });
                        }
                        
                        // Clean up
                        receivedChunks = [];
                        currentTransfer = null;
                    }
                    break;
            }
        } catch (error) {
            console.error('Message handling error:', error);
            port.postMessage({
                type: 'ffmpeg-convert-error',
                error: error.message
            });
        }
    });

    port.onDisconnect.addListener(() => {
        console.log('Port disconnected');
        currentPort = null;
        receivedChunks = [];
        currentTransfer = null;
    });
});