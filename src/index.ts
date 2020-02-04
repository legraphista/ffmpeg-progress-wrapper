import {EventEmitter} from 'events';
import {ChildProcess, spawn} from "child_process";
import {FFMpegError, FFMpegOutOfMemoryError} from "./error";
import {humanTimeToMS, Parse, pidToResourceUsage} from "./helper";
import ProcessEnv = NodeJS.ProcessEnv;
import Timeout = NodeJS.Timeout;

export * from "./error"

export interface FFMpegProgressOptions {
  cmd?: string
  cwd?: string
  env?: ProcessEnv
  duration?: number
  hideFFConfig?: boolean
  maxMemory?: number
}

export interface IFFMpegFileDetails {
  duration?: number
  bitrate?: number
  start?: number
  resolution?: { width: number, height: number }
  fps?: number
}

export interface IFFMpegProgressData {
  speed?: number
  eta?: number
  time?: number
  progress?: number
  drop?: number
  dup?: number
  fps?: number
  frame?: number
  q?: number
  size?: number
  bitrate?: string

  [s: string]: string | number | undefined
}

export interface IFFMpegProgress {
  on(event: 'end', listener: (code: number | undefined, signal: string | undefined) => void): this;

  on(event: 'details', listener: (file: IFFMpegFileDetails) => void): this;

  on(event: 'progress', listener: (p: IFFMpegProgressData) => void): this;

  on(event: 'raw', listener: (text: string) => void): this;
}

export class FFMpegProgress extends EventEmitter implements IFFMpegProgress {

  private _args: string[];
  private _process: ChildProcess;

  private _details: {
    file?: IFFMpegFileDetails
  } = {};
  private _metadataDuration: number = null;
  private _output: string = '';
  private _stderr: string = '';
  private _stdout: string = '';
  private _isKilledByUser: string | false = false;
  private _outOfMemory: boolean = false;
  private _vitalsTimer: Timeout;
  private _vitalsMemory: number;

  public readonly options: FFMpegProgressOptions;


  constructor(args: string[], options: FFMpegProgressOptions = {}) {
    super();

    this.options = {
      cmd: options.cmd || 'ffmpeg',
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      hideFFConfig: options.hideFFConfig || false,
      maxMemory: Math.max(0, options.maxMemory) || Infinity,
      duration: options.duration
    };

    const extra_args = [];
    if (this.options.hideFFConfig) {
      extra_args.push(`-hide_banner`)
    }

    this._args = args.slice();
    this._process = spawn(
      this.options.cmd,
      extra_args.concat(args),
      {
        cwd: this.options.cwd,
        env: this.options.env
      }
    );

    this._process.stdout.on('data', this.processOutput);
    this._process.stderr.on('data', this.processOutput);

    this._process.stdout.on('data', (d: Buffer) => this._stdout += d.toString());
    this._process.stderr.on('data', (d: Buffer) => this._stderr += d.toString());

    this._process.once('close', (code, signal) => {
      this.emit('end', code, signal);
      clearInterval(this._vitalsTimer);
    });

    this._vitalsTimer = setInterval(this._checkVitals.bind(this), 500);
  }

  private async _checkVitals() {
    try {
      const vitals = await pidToResourceUsage(this._process.pid);
      this._vitalsMemory = vitals.memory;
      if (vitals.memory > this.options.maxMemory) {
        this._outOfMemory = true;
        this.kill();
      }
    } catch (e) {
      if (!e.stack) {
        Error.captureStackTrace(e);
      }
      console.error(`Vitals check for PID:${this._process.pid} resulted in: ${e.stack}`);
    }
  }

  kill(signal: string = 'SIGKILL') {
    this._isKilledByUser = signal;
    this._process.kill(signal);
  }

  stop() {
    return this.kill('SIGINT');
  }

  get details(): IFFMpegFileDetails {
    return this._details.file;
  }

  get output(): string {
    return this._output;
  }

  get stderrOutput(): string {
    return this._stderr;
  }

  get stdoutOutput(): string {
    return this._stdout;
  }

  get process(): ChildProcess {
    return this._process;
  }

  get args(): string[] {
    return this._args.slice();
  }

  async onDone() {
    const stack = (new Error()).stack.split('\n').slice(1).join('\n');

    const { code, signal } = await new Promise<{ code: number, signal: string }>((res) => {
      this.once('end', (code: number, signal: string) => {
        return res({ code, signal })
      })
    });

    if (code || signal) {
      let FFmpegErrClass: typeof FFMpegError = FFMpegError;

      if (this._outOfMemory) {
        FFmpegErrClass = FFMpegOutOfMemoryError;
      }

      const err = new FFmpegErrClass(this._stderr);
      err.code = code;
      err.signal = signal;
      err.args = this._args.slice();
      err.killedByUser = signal === this._isKilledByUser;
      err.stack += '\n' + stack;

      if (this._outOfMemory) {
        (err as FFMpegOutOfMemoryError).allocated = this.options.maxMemory;
        (err as FFMpegOutOfMemoryError).wasUsing = this._vitalsMemory;
      }
      throw err;
    }

    return this._output;
  }

  async onDetails(): Promise<IFFMpegFileDetails> {
    if (this._details.file) {
      return Promise.resolve(this._details.file)
    }
    return new Promise(_ => this.once('details', _))
  }

  processMetadataDuration(humanDuration: string) {
    this._metadataDuration = Math.max(this._metadataDuration, humanTimeToMS(humanDuration));
  }

  processInitialOutput(text: string) {
    Object.assign(
      this._details,
      {
        file: {
          duration: Parse.getDuration(text),
          bitrate: Parse.getBitrate(text),
          start: Parse.getStart(text),
          resolution: Parse.getRes(text),
          fps: Parse.getFPS(text)
        }
      }
    );

    this.emit('details', Object.assign({}, this._details.file));
  }

  processProgress(text: string) {
    const duration: number = this.options.duration || (this._details.file && this._details.file.duration) || this._metadataDuration || null;
    const data: ({ [s: string]: string | number }) = text
      .trim()
      .replace(/=\ */g, '=')
      .split(' ')
      .map<[string, string]>(keyVal => {
        const split = keyVal.split('=');
        return [
          split[0].trim(),
          split[1].trim()
        ];
      })
      .reduce((obj: any, kv) => {
        obj[kv[0]] = !isNaN(Number(kv[1])) ? parseFloat(kv[1]) : kv[1];
        return obj;
      }, {});

    data.time = humanTimeToMS(data.time.toString());
    data.speed = parseFloat(data.speed.toString().replace('x', ''));

    if (duration !== null) {
      // compute progress
      data.progress = data.time / duration;

      // compute ETA
      data.eta = ((duration - data.time) / data.speed) | 0;
    } else {
      data.progress = data.eta = null;
    }

    this.emit('progress', data);
  }

  processOutput = (buffer: Buffer) => {
    const text: string = buffer.toString();
    this.emit('raw', text);

    this._output += text;

    // parsing duration from metadata
    const isMetadataDuration = text.toLowerCase().match(/duration\s*:\s*((\d+:?){1,3}.\d+)/);
    if (isMetadataDuration) {
      this.processMetadataDuration(isMetadataDuration[1]);
    }

    // await for duration details
    if (
      !this._details.file &&
      ~this._output.toLowerCase().search(/duration.*\n/i) &&
      ~this._output.toLowerCase().search(/(\d+\.?\d*?) fps/i)
    ) {
      this.processInitialOutput(this._output);
    }

    // size=    4103kB time=00:02:34.31 bitrate= 217.8kbits/s speed=62.7x
    const isFrame = text.match(/(frame|time)=.*/);
    if (isFrame) {
      this.processProgress(isFrame[0]);
    }
  }
}
