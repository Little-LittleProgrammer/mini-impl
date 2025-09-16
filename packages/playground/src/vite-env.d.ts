interface ImportMeta {
  hot?: {
    accept: (callback?: (newModule: any) => void) => void;
    dispose: (callback: () => void) => void;
    data: any;
    decline: () => void;
    invalidate: () => void;
    on: (event: string, cb: (...args: any[]) => void) => void;
    off: (event: string, cb?: (...args: any[]) => void) => void;
    send: (data: any) => void;
  };
}