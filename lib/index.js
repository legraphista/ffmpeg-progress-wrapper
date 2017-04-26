'use strict';
var util = require('util');
var spawn = require('child_process').spawn;
var EventEmitter = require('events');

var helper = require('./helper');

/**
 * Raw output event.
 *
 * @event Ffmpeg#raw
 * @type {object}
 * @property {String} raw - volatile string output
 */
/**
 * File details event.
 *
 * @event Ffmpeg#details
 * @type {object}
 * @property {Object} details
 * @property {Number} details.duration - file runtime in milliseconds
 * @property {Number} details.bitrate - file bitrate in kb
 * @property {Number} details.start - file start time in milliseconds
 * @property {Object} details.resolution
 * @property {Number} details.resolution.width
 * @property {Number} details.resolution.height
 * @property {Number} details.fps
 */

/**
 * @typedef {object} ProgressData
 * @property {string} bitrate
 * @property {string} drop
 * @property {number} dup
 * @property {number} eta
 * @property {number} fps
 * @property {number} frame
 * @property {number} progress
 * @property {number} q
 * @property {string} size
 * @property {number} speed
 * @property {number} time
 */

/**
 * Progress event.
 *
 * @event Ffmpeg#progress
 * @type {object}
 * @property {ProgressData} progress
 */


/**
 * @param {String|String[]} args - ffmpeg arguments
 * @param {Object} [options={}]
 * @param {String} [options.cmd='ffmpeg']
 * @param {String} [options.cwd=process.cwd()]
 * @param {String} [options.env=process.env]
 * @param {Number} [options.duration=0] - in milliseconds
 *
 * @constructor
 *
 * @fires Ffmpeg#raw
 * @fires Ffmpeg#details
 * @fires Ffmpeg#progress
 */
var Ffmpeg = function Ffmpeg(args, options) {
    if (!Array.isArray(args)) {
        args = args
            .match(/[^\s"']+|"([^"]*)"|'([^']*)'/g)
            .filter(x => !!x);
    }

    EventEmitter.call(this);

    this.options = options || {};
    this.options.cmd = this.options.cmd || 'ffmpeg';
    this.options.cwd = this.options.cwd || process.cwd();
    this.options.env = this.options.env || process.env;

    this._process = spawn(
        this.options.cmd,
        args,
        {
            cwd: this.options.cwd,
            env: this.options.env
        }
    );

    this._process.stdout.on('data', this.processOutput.bind(this));
    this._process.stderr.on('data', this.processOutput.bind(this));
    this._process.on('close', this.emit.bind(this, 'end'));

    this._details = {};
    this._output = '';
};
util.inherits(Ffmpeg, EventEmitter);

Ffmpeg.prototype.processOutput = function(buffer) {
    var text = buffer.toString();
    this.emit('raw', text);

    this._output += text;

    // await for duration details
    if (
      !this._details.file &&
      ~this._output.toLowerCase().search(/duration.*\n/i) &&
      ~this._output.toLowerCase().search(/(\d+\.?\d*?) fps/i)
    ) {
        this.processInitialOutput(this._output);
    }

    var isFrame;
    if (isFrame = text.match(/frame=.*/)) {
        this.processProgress(isFrame[0]);
    }
};

Ffmpeg.prototype.processInitialOutput = function(text) {
    Object.assign(
        this._details,
        {
            file: {
                duration: helper.parse.getDuration(text),
                bitrate: helper.parse.getBitrate(text),
                start: helper.parse.getStart(text),
                resolution: helper.parse.getRes(text),
                fps: helper.parse.getFPS(text)
            }
        }
    );

    this.emit('details', Object.assign({}, this._details.file));
};

Ffmpeg.prototype.processProgress = function(text) {
    var duration = this.options.duration || this._details.file.duration;
    var data = text
        .trim()
        .replace(/=\ */g, '=')
        .split(' ')
        .map(keyVal => keyVal.split('=').map(x => x.trim()))
        .reduce((obj, kv) => {
            obj[kv[0]] = (kv[1] | 0) || kv[1];
            return obj;
        }, {});

    data.time = helper.humanTimeToMS(data.time);
    data.speed = parseFloat(data.speed.replace('x', ''));

    // compute progress
    data.progress = data.time / duration;

    // compute ETA
    data.eta = ((duration - data.time) / data.speed) | 0;

    this.emit('progress', data);
};

module.exports = Ffmpeg;