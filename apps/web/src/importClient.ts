import type { ImportRequest, ImportResponse } from "./workers/protocol.ts";

let nextId = 1;

function workerUrl(): Worker {
  return new Worker(new URL("./workers/import.worker.ts", import.meta.url), { type: "module" });
}

/** 1 ファイルを Worker で読む。バイト列は画面側に残さないよう、移譲して渡す。 */
export function inspectLog(
  fileName: string,
  bytes: Uint8Array,
  readChat = false,
): Promise<ImportResponse> {
  const id = nextId;
  nextId += 1;
  const worker = workerUrl();
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);

  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ImportResponse>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error(`${fileName} を読めませんでした`));
    };
    const request: ImportRequest = { id, fileName, bytes: copy, readChat };
    worker.postMessage(request, [copy]);
  });
}
