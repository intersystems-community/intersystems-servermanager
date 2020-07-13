import * as vscode from 'vscode';

export interface Logger {
  trace(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string | Error, ...args: any[]): void;
  critical(message: string | Error, ...args: any[]): void;
}

class VSCodeLogger implements Logger {
  private _outputChannel: vscode.OutputChannel;
  private _createDate: Date = new Date();

  trace(message: string, ...args: any[]):Date {
    return this._commonTrace(undefined, message, ...args);
  }

  endTrace(since: Date, message: string, ...args: any[]):Date {
    return this._commonTrace(since, message, ...args);
  }

  private _commonTrace(since: Date | undefined, message: string, ...args: any[]):Date {
    const now = new Date();
    const sinceStart = `${((now.valueOf() - this._createDate.valueOf()) / 1000).toFixed(3)} `;
    const sinceLastTrace = (since) ? `(+${(now.valueOf() - since.valueOf()) / 1000}) ` : '';
    this._print(`[trace@${sinceStart}${sinceLastTrace}]`, message, ...args);
    return now;
  }

  debug(message: string, ...args: any[]) {
    this._print('[debug]', message, ...args);
  }

  info(message: string, ...args: any[]) {
    this._print('[info]', message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this._print('[warn]', message, ...args);
  }

  error(message: string | Error, ...args: any[]) {
    this._print('[error]', message, ...args);
  }

  critical(message: string | Error, ...args: any[]) {
    this._print('[critical]', message, ...args);
  }

  private _print(...args: any[]) {
    if (!this._outputChannel) {
      this._outputChannel = vscode.window.createOutputChannel('InterSystems Server Manager');
    }

    const msg = args
      .map(arg => {
        if (arg instanceof Error) {
          return arg.stack;
        } else if (typeof arg === 'object') {
          return JSON.stringify(arg);
        }
        return arg;
      })
      .join(' ');

    this._outputChannel.appendLine(msg);
  }
}

const logger = new VSCodeLogger();

export default logger;
