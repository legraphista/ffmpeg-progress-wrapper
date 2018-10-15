# FFMPEG Progress Wrapper
_Wraps your ffmpeg raw command line with a nice progress interface_
___

### Installation
This module is installed via npm:

`$ npm install ffmpeg-progress-wrapper`

### Use cases
- Provides a progress status for your video without you having to guess the frame count
- Provides duration and bitrate of the file

### Example

```javascript
var FFMpeg = require('./index');

var process = new FFMpeg(['-i', 'test.mov' ,'test output.mp4']);
// or
var process = new FFMpeg('-i test.mov test_output.mp4');

process.on('raw', console.log);

process.once('details', (details) => console.log(JSON.stringify(details));

process.on('progress', (progress) => console.log(JSON.stringify(progress));

process.once('end', console.log.bind(console, 'Conversion finished and exited with code'));

process.done(console.log);

/**
{
    "duration": 9970,
    "bitrate": 6875,
    "start": 0
}
{
    "frame": 71,
    "fps": "0.0",
    "q": 28,
    "size": "149kB",
    "time": 520,
    "bitrate": "2316.4kbits/s",
    "dup": 2,
    "drop": "0",
    "speed": 1.04,
    "progress": 0.05215646940822467,
    "eta": 9086
}
{
    "frame": 232,
    "fps": 74,
    "q": 28,
    "size": "1233kB",
    "time": 7050,
    "bitrate": "1432.0kbits/s",
    "dup": 2,
    "drop": "0",
    "speed": 2.26,
    "progress": 0.7071213640922769,
    "eta": 1292
}
{
    "frame": 247,
    "fps": 58,
    "q": -1,
    "Lsize": "1715kB",
    "time": 9930,
    "bitrate": "1414.8kbits/s",
    "dup": 2,
    "drop": "0",
    "speed": 2.35,
    "progress": 0.995987963891675,
    "eta": 17
}
Conversion finished and exited with code 0 null
*/
```

### Params
- `args`: `String, String[]` - ffmpeg args & flags
- `options`: `Object`
    - cmd: `String='ffmpeg'` - in case ffmpeg is not in `PATH` or want to use a custom location
    for the binary
    - cwd: `String=process.cwd()` - working directory
    - env: `String=process.env` - environment variables to pass to ffmpeg
    - duration: `Number=0` - optional duration to overwrite output from ffmpeg (in case you give a trim command)

### Events fired
- `raw` : Fires whenever ffmpeg outputs text - very volatile
    - params:
        - raw: `String`
- `details` ; Fires once per command, at the beginning
    - params:
        - details: `Object`
            - duration: `Number` - video duration in milliseconds
            - bitrate: `Number` - video bitrate in kb
            - start: `Number` - video\'s first frame time in milliseconds
- `progress` : Fires whenever ffmpeg reports progress
    - params:
        - progress: `Object`
            - frame: `Number` - frame number
            - fps: `Number` - conversion speed as frames / second
            - time: `Number` - current time that was processed
            - bitrate: `String` - conversion speed in bitrate
            - drop: `Number` - number of dropped frames
            - speed: `Number` - conversion speed of video time / real time
            - progress: `Number` - conversion progress percentage from `0` to `1`
            - eta: `Number` - conversion estimated remaining time in milliseconds
