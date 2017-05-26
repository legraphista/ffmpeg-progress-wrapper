'use strict';
/**
 * This file was creates from the blood, sweet and tears of Stefan on 08/05/16.
 */

var helper = {};

helper.parse = {};

/**
 * Returns duration of clip
 * @param text
 * @returns {null|Number}
 */
helper.parse.getDuration = (text) => {
    // Duration: 00:00:09.97, start: 0.000000, bitrate: 6875 kb/s
    var humanDuration = /duration: ((\d+:?){1,3}.\d+)/i.exec(text);
    if (!humanDuration) return null;
    humanDuration = humanDuration[1];

    return helper.humanTimeToMS(humanDuration);
};

/**
 * Gets start point
 * @param text
 * @returns {number}
 */
helper.parse.getStart = (text) => {
    return (
        parseFloat(
            (/start: (-?\d+\.\d+)/i.exec(text) || [])[1]
        ) * 1000
    )
};

helper.parse.getRes = (text) => {
    var searchResult = /([1-9][0-9]*)x([1-9][0-9]*)/i.exec(text);
    return {
        width: searchResult[1],
        height: searchResult[2]
    }
};

helper.parse.getFPS = (text) => {
    return (
      parseFloat(
        (/(\d+\.?\d*?) fps/i.exec(text) || [])[1]
      )
    );
};

/**
 * Gets bitrate in bytes
 * @param text
 * @returns {null|number} kb/s
 */
helper.parse.getBitrate = (text) => {
    var bitrateRaw = /bitrate: (\d+)(\ ?(k|m|g|t)?b\/s)?/i.exec(text);
    if (!bitrateRaw) return null;

    var value = parseInt(bitrateRaw[1]);

    // fallthrough with purpose :P
    //noinspection FallThroughInSwitchStatementJS
    switch (bitrateRaw[3]) {
        case 't':
            value *= 1024;
        case 'g':
            value *= 1024;
        case 'm':
            value *= 1024;
        case 'k':
            value *= 1024;
            break;
    }

    return value / 1024;
};

helper.humanTimeToMS = (text) => {
    text = text
        .split(/(:|\.)/)
        .filter(x => !~[':', '.'].indexOf(x));

    var time = 0;
    time += (text.pop() | 0) * 10; //ms (2 digit ms)
    time += (text.pop() | 0) * 1000; //s
    time += (text.pop() | 0) * 1000 * 60; //m
    time += (text.pop() | 0) * 1000 * 60 * 60; //h

    return time;
};

module .exports = helper;