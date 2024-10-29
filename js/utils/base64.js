// utils/base64.js
export default {
    /**
     * Encodes an ArrayBuffer to a Base64 string.
     * @param {ArrayBuffer} buffer 
     * @returns {string} Base64 encoded string
     */
    encode(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    },

    /**
     * Decodes a Base64 string to an ArrayBuffer.
     * @param {string} base64Str 
     * @returns {ArrayBuffer} Decoded ArrayBuffer
     */
    decode(base64Str) {
        const binaryStr = window.atob(base64Str);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        return bytes.buffer;
    }
};
