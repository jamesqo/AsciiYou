import { SDPClient } from "@/service/SDPClient";
import { makeAutoObservable } from "mobx";

type InitConnectionOpts = {
  videoStream: MediaStream;
  sdpUrl: string;
  iceServers?: RTCIceServer[]; // TODO
};

export class SignalingStore {
  private readonly sdpClient: SDPClient;
  private pc?: RTCPeerConnection;

  constructor(sdpClient: SDPClient) {
    this.sdpClient = sdpClient;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // Sets up a new RTCPeerConnection and starts SDP negotiation with server
  async initConnection(opts: InitConnectionOpts) {
    // TODO: add iceServers in the future for non-local dev
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    this.pc = pc
    await this.setVideoStream(opts.videoStream)

    // TODO: remove this
    // const dc = pc.createDataChannel("control")
    // dc.onopen = () => {
    //     console.log("DC open")
    // }
    // dc.onmessage = (event) => {
    //     console.log("DC recv:", event.data)
    // }
    // dc.onerror = (event) => {
    //     console.error("DC error:", event)
    // }
    // dc.onclose = () => {
    //     console.log("DC close")
    // }

    // Connect to SDP negotiation WebSocket
    // Waits until WebSocket is open before returning (important so we can send messages)
    await this.sdpClient.connect(opts.sdpUrl)

    // Create SDP offer message and set local description
    // (note: This step has to be done after sending the video stream--
    // the offer is a snapshot of current tranceivers / tracks)
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
    // Set up transceiver for webcam feed (send-only for now)
    let tx = this.pc.addTransceiver("video", { direction: "sendonly" })
    await tx.sender.replaceTrack(videoTrack);
  }
}
