import type { HistoryCommand } from "./types";

/**
 * Linear undo/redo stack, same idea as the three.js editor history.
 */
export class History {
  undos: HistoryCommand[] = [];
  redos: HistoryCommand[] = [];
  private _onChange: (() => void) | null = null;

  onChange(fn: () => void): void {
    this._onChange = fn;
  }

  execute(command: HistoryCommand): void {
    command.execute();
    this.push(command);
  }

  push(command: HistoryCommand): void {
    this._disposeCommands(this.redos);
    this.redos.length = 0;
    this.undos.push(command);
    this._onChange?.();
  }

  undo(): HistoryCommand | null {
    const command = this.undos.pop();
    if (!command) return null;
    command.undo();
    this.redos.push(command);
    this._onChange?.();
    return command;
  }

  redo(): HistoryCommand | null {
    const command = this.redos.pop();
    if (!command) return null;
    command.execute();
    this.undos.push(command);
    this._onChange?.();
    return command;
  }

  clear(): void {
    this._disposeCommands(this.undos);
    this._disposeCommands(this.redos);
    this.undos.length = 0;
    this.redos.length = 0;
    this._onChange?.();
  }

  canUndo(): boolean {
    return this.undos.length > 0;
  }

  canRedo(): boolean {
    return this.redos.length > 0;
  }

  private _disposeCommands(commands: HistoryCommand[]): void {
    for (const command of commands) command.dispose?.();
  }
}
