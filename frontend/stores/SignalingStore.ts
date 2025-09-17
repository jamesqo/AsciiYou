import { SDPClient } from "@/service/SDPClient";
import { makeAutoObservable } from "mobx";

export class SignalingStore {
  private readonly sdpClient: SDPClient;
  private pc?: RTCPeerConnection;

  constructor(sdpClient: SDPClient) {
    this.sdpClient = sdpClient;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // Sets up a new RTCPeerConnection and starts SDP negotiation with server
  async initConnection(sdpUrl: string) {
    // TODO: add iceServers in the future for non-local dev
    const pc = new RTCPeerConnection()
    this.pc = pc

    // Set up transceiver for webcam feed (send-only for now)
    pc.addTransceiver("video", { direction: "sendonly" })

    // Connect to SDP negotiation WebSocket
    // Waits until WebSocket is open before returning (important so we can send messages)
    await this.sdpClient.connect(sdpUrl)

    // Create SDP offer message and set local description
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const sdp = pc.localDescription!.sdp

    // Send SDP offer message to server
    this.sdpClient.sendOffer(sdp)

    // Trickle ICE candidates to server as they are discovered
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            this.sdpClient.sendCandidate(event.candidate)
        }
    }
  }

  // Wires the user video feed into the RTCPeerConnection
  async setVideoStream(stream: MediaStream) {
    if (!this.pc) throw new Error('PC not initialized');
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;
  
    // find or create the sendonly transceiver
    let tx = this.pc.getTransceivers().find(t => t.receiver.track.kind === 'video' || t.direction === 'sendonly');
    await tx!.sender.replaceTrack(videoTrack);
  }
}
