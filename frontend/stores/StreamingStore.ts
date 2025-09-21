import { ControlClient } from "@/service/ControlClient";
import { makeAutoObservable } from "mobx";

type StreamingOpts = {
  token: string;
  videoStream: MediaStream;
};

export class StreamingStore {
  private readonly ctrl: ControlClient;

  constructor() {
    this.ctrl = new ControlClient({
      onOpen: () => console.log('Control channel opened'),
      onClose: () => console.log('Control channel closed'),
      onError: (err) => console.error('Control channel error', err),
    })

    makeAutoObservable(this, {}, { autoBind: true });
  }

  async startStreaming(opts: StreamingOpts) {
    await this.ctrl.doHandshake(opts.token)
    await this.ctrl.produceTrack(opts.videoStream.getVideoTracks()[0])
  }
}
