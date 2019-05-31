export class FFMpegError extends Error {
  public code: number;
  public signal: string;
  public args: string[];
  public killedByUser: boolean;

  name: string = "FFMpegError";
}

export class FFMpegOutOfMemoryError extends FFMpegError {
  name: string = 'FFMpegOutOfMemoryError'
}
