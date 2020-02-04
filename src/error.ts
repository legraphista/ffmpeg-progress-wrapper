export class FFMpegError extends Error {
  public code: number;
  public signal: string;
  public args: string[];
  public killedByUser: boolean;

  name: string = "FFMpegError";
}

export class FFMpegOutOfMemoryError extends FFMpegError {
  public allocated: number;
  public wasUsing: number;

  name: string = 'FFMpegOutOfMemoryError';
}
