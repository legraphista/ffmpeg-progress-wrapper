import {EventEmitter} from 'events';
import {ChildProcess, spawn} from "child_process";
import {FFMpegError, FFMpegOutOfMemoryError} from "./error";
import {humanTimeToMS, Parse, pidToResourceUsage} from "./helper";
import * as ReadLine from 'readline'
import {Readable} from "stream";
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

interface FFMpegInboundProgressData {
  // stream_%d_%d_q: number
  stream_0_0_q: number
  stream_0_1_q?: number

  frame?: number
  fps?: number

  // activated by -psnr flag
  // stream_%d_%d_psnr_%c: number
  stream_0_0_psnr_Y?: number | 'int'
  stream_0_0_psnr_U?: number | 'int'
  stream_0_0_psnr_V?: number | 'int'
  // stream_%d_%d_psnr_all: number
  stream_0_0_psnr_all?: number | 'int'

  // bitrate=%6.1fkbits/s

  bitrate: string | 'N/A'

  total_size: number | 'N/A'

  out_time_us: number | 'N/A'
  out_time_ms: number | 'N/A'
  out_time: string | 'N/A'

  dup_frames: number
  drop_frames: number

  speed: string | 'N/A'

  progress: 'continue' | 'end'

  [s: string]: string | number
}

export interface IFFMpegProgressData {
  speed: number | null
  eta: number | null
  time: number | null
  progress: number | null
  drop: number
  dup: number
  fps: number | null
  frame: number | null
  // first array level is for files, second level for streams
  quality: number[][]
  // first array level is for files, second level for streams
  psnr: { y: number | null, u: number | null, v: number | null, all: number | null }[][]
  size: number | null
  bitrate: number | null
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
  private _stderr: string = '';
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

    const extra_args = ['-progress', 'pipe:3'];
    if (this.options.hideFFConfig) {
      extra_args.push(`-hide_banner`)
    }

    this._args = args.slice();
    this._process = spawn(
      this.options.cmd,
      extra_args.concat(args),
      {
        cwd: this.options.cwd,
        env: this.options.env,
        stdio: [null, null, null, "pipe"]
      }
    );

    this._process.stderr.on('data', this.processOutput);
    this._process.stderr.on('data', (d: Buffer) => this._stderr += d.toString());

    this._progressCheck(this._process.stdio[3] as Readable);

    this._process.once('close', (code, signal) => {
      this.emit('end', code, signal);
      clearInterval(this._vitalsTimer);
    });

    this._vitalsTimer = setInterval(this._checkVitals.bind(this), 500);
  }

  private _progressCheck(stream: Readable) {
    const lineReader = ReadLine.createInterface({ input: stream })

    let lines: string[] = []

    lineReader.on('line', line => {
      line = line.trim();
      if (!line) return;

      lines.push(line.trim());

      if (line.indexOf('progress=') === 0) {
        this.processProgress(lines);
        lines = [];
      }
    });
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

  get stderrOutput(): string {
    return this._stderr;
  }

  get stdout() {
    return this.process.stdout;
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

    return this._stderr;
  }

  async onDetails(): Promise<IFFMpegFileDetails> {
    if (this._details.file) {
      return Promise.resolve(this._details.file)
    }
    return new Promise(_ => this.once('details', _))
  }

  private processMetadataDuration(humanDuration: string) {
    this._metadataDuration = Math.max(this._metadataDuration, humanTimeToMS(humanDuration));
  }

  private processInitialOutput(text: string) {
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

  private processProgress(lines: string[]) {
    const duration: number = this.options.duration || (this._details.file && this._details.file.duration) || this._metadataDuration || null;

    const data: FFMpegInboundProgressData = lines
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

    const out: IFFMpegProgressData = {
      drop: data.drop_frames,
      dup: data.dup_frames,

      frame: data.frame === undefined ? null : data.frame,
      time: data.out_time_us === 'N/A' ? null : data.out_time_us / 1e6,

      speed: data.speed === 'N/A' ? null : parseFloat(data.speed.toString().replace('x', '')),
      fps: data.fps === undefined ? null : data.fps,
      eta: null,
      progress: null,

      quality: [],
      psnr: [],

      size: data.total_size === 'N/A' ? null : data.total_size,
      bitrate: data.bitrate === 'N/A' ? null : parseFloat(data.bitrate.replace('kbits/s', '')) * 1024
    }

    if (duration !== null) {
      // compute progress
      out.progress = out.time / duration;

      // compute ETA
      out.eta = Math.max((duration - out.time) / out.speed, 0);
    }

    Object.keys(data)
      .filter(x => x.indexOf('stream_') === 0)
      .forEach(key => {

        const quality_data = /^stream_(\d+)_(\d+)_q$/.exec(key);
        const psnr_data = /^stream_(\d+)_(\d+)_psnr_(y|u|v|all)$/.exec(key);

        if (quality_data) {

          const [_, file_index_s, stream_index_s] = quality_data;

          const file_index = parseInt(file_index_s);
          const stream_index = parseInt(stream_index_s);

          if (!out.quality[file_index]) out.quality[file_index] = [];

          out.quality[file_index][stream_index] = parseFloat(data[key].toString());
        }

        if (psnr_data) {
          const [_, file_index_s, stream_index_s, channel] = psnr_data;

          const file_index = parseInt(file_index_s);
          const stream_index = parseInt(stream_index_s);

          if (!out.psnr[file_index]) out.psnr[file_index] = [];
          if (!out.psnr[file_index][stream_index]) out.psnr[file_index][stream_index] = {
            y: null,
            u: null,
            v: null,
            all: null
          };

          out.psnr[file_index][stream_index][channel as keyof IFFMpegProgressData['psnr'][number][number]] =
            data[key] === 'inf' ?
              Infinity :
              data[key] === 'nan' ?
                NaN :
                parseFloat(data[key].toString());
        }
      });

    this.emit('progress', out);
  }

  private processOutput = (buffer: Buffer) => {
    const text: string = buffer.toString();
    this.emit('raw', text);

    // parsing duration from metadata
    const isMetadataDuration = text.toLowerCase().match(/duration\s*:\s*((\d+:?){1,3}.\d+)/);
    if (isMetadataDuration) {
      this.processMetadataDuration(isMetadataDuration[1]);
    }

    // await for duration details
    if (
      !this._details.file &&
      ~this._stderr.toLowerCase().search(/duration.*\n/i) &&
      ~this._stderr.toLowerCase().search(/(\d+\.?\d*?) fps/i)
    ) {
      this.processInitialOutput(this._stderr);
    }
  }
}
