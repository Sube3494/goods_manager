declare module 'browser-image-compression' {
  interface Options {
    maxSizeMB?: number;
    maxWidthOrHeight?: number;
    onProgress?: (progress: number) => void;
    useWebWorker?: boolean;
    libWorkerUrl?: string;
    preserveExif?: boolean;
    initialQuality?: number;
    alwaysKeepResolution?: boolean;
    fileType?: string;
    signal?: AbortSignal;
    maxIteration?: number;
  }

  function imageCompression(file: File, options: Options): Promise<File>;
  
  namespace imageCompression {
    function getDataUrlFromFile(file: File): Promise<string>;
    function getFilefromDataUrl(dataUrl: string, filename: string, lastModified?: number): Promise<File>;
    function loadImage(url: string): Promise<HTMLImageElement>;
    function drawImageInCanvas(img: HTMLImageElement, options?: Options): HTMLCanvasElement;
    function drawFileInCanvas(file: File, options?: Options): Promise<[HTMLCanvasElement, number]>;
    function canvasToFile(canvas: HTMLCanvasElement, type: string, filename: string, lastModified?: number, quality?: number): Promise<File>;
    function getExifOrientation(file: File): Promise<number>;
  }

  export default imageCompression;
}
