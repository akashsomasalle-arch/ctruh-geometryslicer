import type { EditorModeName, PointerState } from "./types";

/** Editor interaction modes. */
export const EditorMode = Object.freeze({
  NAVIGATE: "navigate",
  CUT: "cut",
} as const);

/**
 * Tiny state machine for pointer interaction.
 * Mode (Navigate/Cut) is orthogonal to the transient pointer state.
 */
export class EditorState {
  mode: EditorModeName = EditorMode.NAVIGATE;
  pointer: PointerState = "idle";
  private _listeners = new Set<(state: EditorState) => void>();

  setMode(mode: EditorModeName): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.pointer = "idle";
    this._emit();
  }

  beginCutting(): void {
    this.pointer = "cutting";
    this._emit();
  }

  beginDragging(): void {
    this.pointer = "dragging";
    this._emit();
  }

  idle(): void {
    this.pointer = "idle";
    this._emit();
  }

  isNavigate(): boolean {
    return this.mode === EditorMode.NAVIGATE;
  }

  isCut(): boolean {
    return this.mode === EditorMode.CUT;
  }

  onChange(fn: (state: EditorState) => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _emit(): void {
    for (const fn of this._listeners) fn(this);
  }
}
