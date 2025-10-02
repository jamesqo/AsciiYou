import { ControlClient } from "@/service/ControlClient";
import { makeAutoObservable } from "mobx";

type StreamingSessionOpts = {
  token: string;
  localStream: MediaStream;
};

export class StreamingStore {
  private readonly ctrl: ControlClient;
  // Observable map of active streams by id (e.g., "local" or mediasoup producerId)
  private readonly streamsById = new Map<string, MediaStream>();

  constructor() {
    this.ctrl = new ControlClient({
      onOpen: () => console.log('Control channel opened'),
      onClose: () => console.log('Control channel closed'),
      onError: (err) => console.error('Control channel error', err),
      onStreamConsumed: (stream, participantId) => {
        console.log('Stream consumed:', participantId);
        this.setStream(participantId, stream);
      }
    })

    makeAutoObservable(this, {}, { autoBind: true });
  }

  // read-only projection for consumers
  get activeStreams() {
    return new Map(this.streamsById);
  }

  setLocalStream(stream: MediaStream) {
    this.setStream('local', stream);
  }

  setStream(id: string, stream: MediaStream) {
    const prev = this.streamsById.get(id);
    if (prev && prev !== stream) {
      prev.getTracks().forEach(t => t.stop());
    }
    this.streamsById.set(id, stream);
  }

  removeStream(id: string) {
    const s = this.streamsById.get(id);
    if (s) {
      s.getTracks().forEach(t => t.stop());
      this.streamsById.delete(id);
    }
  }

  async beginStreamingSession(opts: StreamingSessionOpts) {
    await this.ctrl.doHandshake(opts.token)
    await this.ctrl.produceTrack(opts.localStream.getVideoTracks()[0])
  }
}
