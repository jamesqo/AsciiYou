import { ControlClient } from "@/service/ControlClient";
import { makeAutoObservable } from "mobx";

type StreamingOpts = {
  videoStream: MediaStream;
  token: string;
};

export class SignalingStore {
  private readonly client: ControlClient;

  constructor() {
    this.client = new ControlClient({
      onOpen: () => console.log('Control channel opened'),
      onClose: () => console.log('Control channel closed'),
      onError: (err) => console.error('Control channel error', err),
    })

    makeAutoObservable(this, {}, { autoBind: true });
  }

  async startStreaming(opts: StreamingOpts) {
    await this.client.doHandshake(opts.token)
    await this.client.produceTrack(opts.videoStream.getVideoTracks()[0])
  }
}
