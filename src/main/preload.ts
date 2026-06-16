import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectImage: () => ipcRenderer.invoke('select-image'),
  selectAudio: () => ipcRenderer.invoke('select-audio'),
  saveFile: (content: string, defaultName: string) =>
    ipcRenderer.invoke('save-file', content, defaultName),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  checkFileExists: (filePath: string) => ipcRenderer.invoke('check-file-exists', filePath),
  checkFilesExist: (filePaths: string[]) => ipcRenderer.invoke('check-files-exist', filePaths),
});
