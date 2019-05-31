import pidusage = require('pidusage');

export function humanTimeToMS(text: string): number {
  const parts: number[] = text.split(':').map(p => parseInt(p));

  let time: number = 0;
  time += Math.floor(parts.pop() * 1000); //s
  time += parts.pop() * 1000 * 60; //m
  time += parts.pop() * 1000 * 60 * 60; //h

  return time;
}

export async function pidToResourceUsage(pid: number) {
  return await pidusage(pid);
}


export namespace Parse {
  export function getDuration(text: string): null | number {

    const humanDuration = /duration: ((\d+:?){1,3}.\d+)/i.exec(text);
    if (!humanDuration || !humanDuration[1]) {
      return null;
    }

    return humanTimeToMS(humanDuration[1]);
  }

  export function getStart(text: string): number {
    return (
      parseFloat(
        (/start: (-?\d+\.\d+)/i.exec(text) || [])[1]
      ) * 1000
    )
  }

  export function getRes(text: string): { width: number, height: number } {
    const searchResult = /([1-9][0-9]*)x([1-9][0-9]*)/i.exec(text);
    return {
      width: parseInt(searchResult[1]),
      height: parseInt(searchResult[2])
    }
  }

  export function getFPS(text: string): number {
    return (
      parseFloat(
        (/(\d+\.?\d*?) fps/i.exec(text) || [])[1]
      )
    );
  }

  export function getBitrate(text: string): number | null {
    const bitrateRaw = /bitrate: (\d+)(\ ?(k|m|g|t)?b\/s)?/i.exec(text);
    if (!bitrateRaw) {
      return null;
    }

    let value = parseInt(bitrateRaw[1]);

    // fallthrough on purpose
    // noinspection FallThroughInSwitchStatementJS
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
  }
}
