// Preload script to expose limited Node.js APIs to renderer
const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld('desktop', {
  readFile: (filePath) => fs.readFileSync(filePath, 'utf-8'),
  writeFile: (filePath, data) => fs.writeFileSync(filePath, data),
  joinPath: (...args) => path.join(...args)
});
