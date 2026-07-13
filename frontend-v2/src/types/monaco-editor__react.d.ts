declare module "@monaco-editor/react" {
  import type { ComponentType, CSSProperties } from "react";

  export interface EditorProps {
    value?: string;
    defaultValue?: string;
    language?: string;
    theme?: string;
    height?: string | number;
    width?: string | number;
    options?: Record<string, unknown>;
    onChange?: (value: string | undefined) => void;
    onMount?: (editor: unknown, monaco: unknown) => void;
    beforeMount?: (monaco: unknown) => void;
    onValidate?: (markers: unknown[]) => void;
    loading?: React.ReactNode;
    path?: string;
    keepCurrentModel?: boolean;
    saveViewState?: boolean;
    className?: string;
    wrapperProps?: Record<string, unknown>;
    style?: CSSProperties;
  }

  export interface DiffEditorProps {
    original?: string;
    modified?: string;
    language?: string;
    theme?: string;
    height?: string | number;
    width?: string | number;
    options?: Record<string, unknown>;
    onMount?: (editor: unknown, monaco: unknown) => void;
    beforeMount?: (monaco: unknown) => void;
  }

  const Editor: ComponentType<EditorProps>;
  export default Editor;

  export const DiffEditor: ComponentType<DiffEditorProps>;

  export function useMonaco(): unknown;
  export function loader(config?: unknown): void;
}
