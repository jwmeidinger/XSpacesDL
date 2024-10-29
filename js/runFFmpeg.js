import b64 from '/js/utils/base64.js';
import { FFmpeg } from "/lib/ffmpeg/ffmpeg/dist/esm/index.js"

export default async function(buffer, format) {
    if(chrome.offscreen) {
        return await offscreenRun(buffer, format)
    } else {
        return await run(buffer, format)
    }
}

/**
 * Converts the input buffer to the desired format using FFmpeg.
 * @param {ArrayBuffer} buffer 
 * @param {string} format 
 * @returns {Promise<ArrayBuffer>} Converted buffer
 */
async function run(buffer, format) {
    try {
        // Get FFmpeg instance
        let ffmpeg = new FFmpeg();
        await ffmpeg.load({
            coreURL: "/lib/ffmpeg/core/dist/esm/ffmpeg-core.js",
        })
        
        console.log(`Converting buffer of size ${buffer.byteLength} to ${format}`);

        const inputFile = 'input.aac';
        
        // Write input file
        try {
            await ffmpeg.writeFile(inputFile, new Uint8Array(buffer));
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
            await ffmpeg.exec(...args);
            console.log('FFmpeg conversion completed');
        } catch (error) {
            console.error('FFmpeg run error:', error);
            throw new Error(`FFmpeg conversion failed: ${error.message}`);
        }

        // Read output
        try {
            let data = await ffmpeg.readFile(outputFile);
            console.log('Output file read successfully');
        } catch (error) {
            console.error('Error reading output file:', error);
            throw new Error(`Failed to read output file: ${error.message}`);
        }

        return data.buffer;
    } catch (error) {
        console.error('Conversion error:', error);
        throw new Error(`Conversion error: ${error.message}`);
    }
}

async function offscreenRun(buffer, format) {
    await chrome.offscreen.createDocument({
        url: '/html/offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Perform FFmpeg operations off the main thread'
    });
    let result = await chrome.runtime.sendMessage({
        type:"offscreenRunFFmpeg",
        buffer: b64.encode(buffer),
        format: format
    })
    await chrome.offscreen.closeDocument()
    return b64.decode(result)
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(!chrome.offscreen && request.type=="offscreenRunFFmpeg"){
        let buffer = b64.decode(request.buffer)
        let format = request.format
        run(buffer, format).then(ret => sendResponse(b64.encode(ret)))
    }
    return true
})
