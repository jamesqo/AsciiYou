import { SDPClient } from "@/service/SDPClient";
import { makeAutoObservable } from "mobx";

export class SignalingStore {
  private readonly sdpClient: SDPClient;
  private pc?: RTCPeerConnection;

  constructor(sdpClient: SDPClient) {
    this.sdpClient = sdpClient;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  async startSDPNegotiation(sdpUrl: string) {
    const pc = new RTCPeerConnection()
    this.pc = pc

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

    // sdpClient.onMessage((msg) => {
    //     console.log('sdp message', msg)
    // })
    // sdpClient.onClose(() => {
    //     console.log('sdp client closed')
    // })
  }
}
