declare module 'windows-shortcuts' {
  interface ShortcutOptions {
    target?: string;
    args?: string;
    [key: string]: any;
  }
  interface WindowsShortcuts {
    query(path: string, callback: (err: any, options: ShortcutOptions) => void): void;
  }
  const ws: WindowsShortcuts;
  export default ws;
}
