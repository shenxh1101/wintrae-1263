export {};

declare global {
  interface Window {
    electronAPI: {
      selectImage: () => Promise<string | null>;
      selectAudio: () => Promise<string | null>;
      saveFile: (content: string, defaultName: string) => Promise<string | null>;
      readFile: (filePath: string) => Promise<string | null>;
    };
  }
}
