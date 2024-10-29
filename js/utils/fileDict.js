// utils/fileDict.js
import b64 from './base64.js';

export default {
    /**
     * Converts a File object into a dictionary with Base64-encoded data.
     * @param {File} file 
     * @returns {Promise<Object>} Dictionary containing file metadata and data
     */
    async compose(file) {
        const arrayBuffer = await file.arrayBuffer();
        return {
            name: file.name,
            type: file.type,
            data: b64.encode(arrayBuffer)
        };
    },

    /**
     * Restores a File object from a dictionary.
     * @param {Object} dict 
     * @returns {File} Restored File object
     */
    restore(dict) {
        const decodedData = b64.decode(dict.data);
        return new File([decodedData], dict.name, { type: dict.type });
    },

    /**
     * Composes multiple File objects into an array of dictionaries.
     * @param {FileList} files 
     * @returns {Promise<Object[]>} Array of file dictionaries
     */
    async multiCompose(files) {
        const fileDicts = [];
        for (let file of files) {
            fileDicts.push(await this.compose(file));
        }
        return fileDicts;
    },

    /**
     * Restores multiple File objects from an array of dictionaries.
     * @param {Object[]} dicts 
     * @returns {FileList} Restored FileList object
     */
    multiRestore(dicts) {
        const dataTransfer = new DataTransfer();
        dicts.forEach(dict => {
            const file = this.restore(dict);
            dataTransfer.items.add(file);
        });
        return dataTransfer.files;
    }
};
