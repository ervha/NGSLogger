/**
 * ブラウザでログを選ぶ。
 * Chrome / Edge はフォルダの選択（File System Access API）。
 * それ以外は `<input webkitdirectory>` と、ファイルを複数選ぶ入力に任せる。
 * 読んだバイト列は呼び出し側のメモリにしか置かない。
 */

export interface ReadableLog {
  name: string;
  size?: number;
  read(): Promise<Uint8Array>;
}

interface PickedFileHandle {
  kind: "file";
  getFile(): Promise<File>;
}

interface PickedDirectoryHandle {
  entries(): AsyncIterable<[string, { kind: string } & Partial<PickedFileHandle>]>;
}

interface DirectoryPickerWindow {
  showDirectoryPicker?: (options: { mode: "read" }) => Promise<PickedDirectoryHandle>;
}

function directoryPicker(): DirectoryPickerWindow["showDirectoryPicker"] {
  return (window as DirectoryPickerWindow).showDirectoryPicker?.bind(window);
}

export function canUseDirectoryPicker(): boolean {
  return typeof directoryPicker() === "function";
}

export async function pickDirectoryWithBrowser(): Promise<ReadableLog[]> {
  const pick = directoryPicker();
  if (!pick) return [];
  const dir = await pick({ mode: "read" });
  const files: ReadableLog[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== "file" || !handle.getFile) continue;
    const getFile = handle.getFile.bind(handle);
    files.push({
      name,
      read: async () => {
        const file = await getFile();
        return new Uint8Array(await file.arrayBuffer());
      },
    });
  }
  files.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  return files;
}

export function logsFromFileList(list: FileList | readonly File[]): ReadableLog[] {
  return [...list].map((file) => ({
    name: file.webkitRelativePath || file.name,
    size: file.size,
    read: async () => new Uint8Array(await file.arrayBuffer()),
  }));
}
