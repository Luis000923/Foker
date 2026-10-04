declare module 'virtual:config' {
  export const config: Record<string, string>;
}

declare global {
  interface Window {
    foker?: boolean;
  }
}

export declare function declared(a: number): string;
