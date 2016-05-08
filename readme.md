# FFMPEG Progress Wrapper
_Wraps your ffmpeg raw command line with a nice progress interface_
___

### Use cases
- Provides a progress status for your video rendering using ffmpeg

### Params
- `args`: `String, String[]` - ffmpeg args & flags
- `options`: `Object`
    - cmd: `String='ffmpeg'` - in case ffmpeg is not in `PATH` or want to use a custom location
    for the binary
    - cwd: `String=process.cwd()` - working directory
    - env: `String=''` - environment variables to pass to ffmpeg

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
```
