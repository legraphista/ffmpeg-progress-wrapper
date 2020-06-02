# FFMPEG Progress Wrapper
_Wraps your ffmpeg raw command line with a nice progress interface_
___

### Installation
`$ npm install ffmpeg-progress-wrapper`
`$ yarn ffmpeg-progress-wrapper`

### Use cases
- Provides a progress status for your video without you having to guess the frame count
- Provides duration and bitrate of the file

### Usage

#### Constructor

```typescript
import {FFMpegProgress} from 'ffmpeg-progress-wrapper';
new FFMpegProgress(args, options);
```

- args: string[] - List of string arguments
- options?: object - optional
  - cmd?: `string` - path to ffmpeg (defaults to ffmpeg from PATH)
  - cwd?: `string` - working dir (defaults to current working dir)
  - env?: `ProcessEnv` - environment vars (defaults to process.env) 
  - duration?: `number` - output duration in seconds (default is determined from file)  
                        useful when using complex filters and the input time differs from output
  - hideFFConfig?: `boolean` - hide ffmpeg config from stderr (default false)
  - maxMemory?:` number` - max amount of bytes allowed by the process to use before killing for OOM (default unset)
  
#### FFMpegProgress.on('progress')
- progressData: `object`
  - eta: `number | null` - time left to process in seconds
  - speed: `number | null` - processed output time / real time (2x - twice realtime, 0.5x - half realtime)
  - fps: `number | null`
  - time: `number | null` - current output time in seconds
  - frame: `number | null` - current output frame
  - progress: `number | null` - progress percentage (from 0 to 1)
  - drop: `number` - dropped frames
  - dup: `number` - duplicated frames
  - quality: `number[][]` - stream quality per frame, per stream
  - psnr: `{ y: number | null, u: number | null, v: number | null, all: number | null }[][]` - stream psnr per file, per stream, per channel (enabled via `-psnr` ffmpeg arg)
  - size: `number | null` - output file size
  - bitrate: `number | null` - output file bitrate in bytes
 

#### FFMpegProgress.on('raw') - Fires whenever ffmpeg outputs text - very volatile
    - raw: `String`
        
#### FFMpegProgress.on('details') - Fires once per command, at the beginning
    - details: `Object`
        - duration: `Number` - video duration in seconds
        - bitrate: `Number` - video bitrate in bytes
        - start: `Number` - video\'s first frame time in seconds 
 
### Example

```javascript
const {FFMpegProgress} = require('ffmpeg-progress-wrapper');
// or
import {FFMpegProgress} from 'ffmpeg-progress-wrapper';

(async () => {
  
    const process = new FFMpegProgress(['-i', 'test.mov' ,'test output.mp4']);
    
    process.on('raw', console.log);
    
    process.once('details', (details) => console.log(JSON.stringify(details));
    
    process.on('progress', (progress) => console.log(JSON.stringify(progress));
    
    process.once('end', console.log.bind(console, 'Conversion finished and exited with code'));
    
    process.done(console.log);
    
    await process.onDone();

})();
/**
{
  duration: 216,
  bitrate: 36864,
  start: 0,
  resolution: { width: 320, height: 240 },
  fps: 25
}
{
  drop: 0,
  dup: 0,
  frame: 1366,
  time: 52.480078,
  speed: 105,
  fps: 0,
  eta: 1.5573325904761905,
  progress: 0.24296332407407406,
  quality: [ [ 28 ] ],
  psnr: [ [ { y: NaN, u: NaN, v: NaN, all: NaN } ] ],
  size: 36,
  bitrate: 0
}
{
  drop: 0,
  dup: 0,
  frame: 2700,
  time: 105.840078,
  speed: 106,
  fps: 2696.44,
  eta: 1.0392445471698113,
  progress: 0.4900003611111111,
  quality: [ [ 28 ] ],
  psnr: [ [ { y: NaN, u: NaN, v: NaN, all: NaN } ] ],
  size: 262180,
  bitrate: 20275.2
}
{
  drop: 0,
  dup: 0,
  frame: 4138,
  time: 163.360078,
  speed: 109,
  fps: 2756.01,
  eta: 0.4829350642201836,
  progress: 0.7562966574074074,
  quality: [ [ 28 ] ],
  psnr: [ [ { y: NaN, u: NaN, v: NaN, all: NaN } ] ],
  size: 524324,
  bitrate: 26316.8
}
{
  drop: 0,
  dup: 0,
  frame: 5423,
  time: 216.800078,
  speed: 110,
  fps: 2747.61,
  eta: 0,
  progress: 1.0037040648148148,
  quality: [ [ -1 ] ],
  psnr: [ [ { y: Infinity, u: Infinity, v: Infinity, all: Infinity } ] ],
  size: 977469,
  bitrate: 36966.4
}
Conversion finished and exited with code 0 null
*/
```