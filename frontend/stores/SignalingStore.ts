import { SDPClient, SDPMsg } from "@/service/SDPClient";
import { makeAutoObservable } from "mobx";

type ServerExchangeOpts = {
  videoStream: MediaStream;
  sdpToken: string;
  iceServers?: RTCIceServer[];
};

export class SignalingStore {
  private readonly sdpClient: SDPClient;
  private pc?: RTCPeerConnection;

  constructor() {
    this.sdpClient = new SDPClient({
      onOpen: () => console.log('SDP WebSocket opened'),
      onClose: () => console.log('SDP WebSocket closed'),
      onError: (err) => console.error('SDP WebSocket error', err),
      onRecvMessage: async (msg) => {
        console.log('SDP WebSocket message received', msg)
        await this.handleServerMessage(msg)
      },
      onSendMessage: (msg) => console.log('SDP WebSocket message sent', msg)
    })

    makeAutoObservable(this, {}, { autoBind: true });
  }

  // Sets up a new RTCPeerConnection and starts SDP negotiation with server
  async beginServerExchange(opts: ServerExchangeOpts) {
    const pc = await this.initPeerConnection(
      opts.videoStream,
      opts.iceServers ?? []
    )
    this.pc = pc;

    // Connect to SDP negotiation WebSocket
    // Waits until WebSocket is in OPEN state before returning
    // (important so we can safely send messages)
    await this.sdpClient.beginNegotiation(opts.sdpToken)

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

  async initPeerConnection(
    stream: MediaStream,
    iceServers: RTCIceServer[]
  ) : Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection({iceServers});

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new Error('No video track found');
    }
  
    // find or create the sendonly transceiver
    // Set up transceiver for webcam feed (send-only for now)
    let tx = pc.addTransceiver("video", { direction: "sendonly" })
    await tx.sender.replaceTrack(videoTrack);

    return pc;
  }

  async handleServerMessage(msg: SDPMsg) {
    const pc = this.pc!;
    if (msg.type === "answer") {
      await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
    } else if (msg.type === "candidate") {
      const c = msg.candidate;
      await pc.addIceCandidate({
        candidate: c.candidate,
        sdpMLineIndex: c.sdpMLineIndex ?? 0,
      });
    }
  }
}
