// signaling/SignalingClient.ts
import { z } from "zod";

/** ---------- Contracts (share with server) ---------- */
export const OfferMsg = z.object({
  type: z.literal("offer"),
  // negotiationId: z.string(),
  sdp: z.string(),
});
export const AnswerMsg = z.object({
  type: z.literal("answer"),
  // negotiationId: z.string(),
  sdp: z.string(),
});
export const CandidateMsg = z.object({
  type: z.literal("candidate"),
  // negotiationId: z.string(),
  candidate: z.object({
    candidate: z.string(),
    sdpMLineIndex: z.number().int(),
  }),
});
// export const PeerEvent = z.object({
//   type: z.enum(["peer-joined", "peer-left"]),
//   participantId: z.string(),
// });
export const SDPMsg = z.discriminatedUnion("type", [
  OfferMsg, AnswerMsg, CandidateMsg,
]);
export type SDPMsg = z.infer<typeof SDPMsg>;

/** ---------- Client ---------- */

type SDPClientOpts = {
  baseWsUrl?: string;
  heartbeatMs?: number; // default 20_000
  idleTimeoutMs?: number; // server expects a heartbeat before this; default 60_000
  maxBackoffMs?: number; // default 30_000
  onOpen?: () => void;
  onClose?: (ev: CloseEvent) => void;
  onError?: (err: unknown) => void;
  onRecvMessage?: (msg: SDPMsg) => void;
  onSendMessage?: (msg: SDPMsg) => void;
};

export class SDPClient {
  private ws?: WebSocket;
  private opts: SDPClientOpts;
  private backoff = 1000;
  private hbTimer?: number;
  private lastSentAt = 0;
  private closedByUser = false;

  constructor(opts: SDPClientOpts = {}) {
    this.opts = {
      baseWsUrl: "ws://localhost:3000/sdp",
      heartbeatMs: 20_000,
      idleTimeoutMs: 60_000,
      maxBackoffMs: 30_000,
      ...opts,
    };
  }

  /** Connect (or reconnect) */
  // This method blocks until the WebSocket is open, so we can safely send messages afterwards
  async beginNegotiation(sdpToken: string) {
    const wsUrl = `${this.opts.baseWsUrl}?token=${sdpToken}`;
    console.log('connecting to sdp url:', wsUrl);
    this.closedByUser = false;
    return new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        ws.onopen = () => {
          this.backoff = 1000; // reset backoff
          // this.startHeartbeat();
          this.opts.onOpen?.();
          resolve();
        };

        ws.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(ev.data as string);
            const msg = SDPMsg.parse(parsed);
            this.opts.onRecvMessage?.(msg);
          } catch (e) {
            this.opts.onError?.(e);
          }
        };

        ws.onerror = (ev) => {
          this.opts.onError?.(ev);
          // If socket isn't open yet, fail the connect promise
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            reject(new Error('WS error during connect'));
          }
        };

        ws.onclose = (ev) => {
          // this.clearHeartbeat();
          this.opts.onClose?.(ev);
          this.ws = undefined;
          // if (!this.closedByUser) this.scheduleReconnect();
        };
      } catch (e) {
        this.opts.onError?.(e);
        // this.scheduleReconnect();
        reject(e as Error);
      }
    });
  }

  /** Graceful close (no reconnect) */
  close(code = 1000, reason = "client-close") {
    this.closedByUser = true;
    // this.clearHeartbeat();
    this.ws?.close(code, reason);
    this.ws = undefined;
  }

  /** Send a validated message (throws if socket not open) */
  send(msg: SDPMsg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Signaling WS not open");
    }
    // Optional: validate before send (dev safety)
    SDPMsg.parse(msg);
    this.opts.onSendMessage?.(msg);
    this.ws.send(JSON.stringify(msg));
    this.lastSentAt = Date.now();
  }

  /** Convenience helpers */
  sendOffer(sdp: string) {
    this.send({ type: "offer", sdp });
  }
  
  sendCandidate(candidate: RTCIceCandidateInit) {
    this.send({
      type: "candidate",
      candidate: {
        candidate: candidate.candidate ?? "",
        sdpMLineIndex: candidate.sdpMLineIndex ?? 0,
      },
    });
  }

  /** ---------- internals ---------- */

  // private openSocket(url: string) {
  //   const ws = new WebSocket(url);
  //   this.ws = ws;

  //   ws.onopen = () => {
  //     this.backoff = 1000; // reset backoff
  //     this.startHeartbeat();
  //     this.opts.onOpen?.();
  //   };

  //   ws.onmessage = (ev) => {
  //     try {
  //       const parsed = JSON.parse(ev.data as string);
  //       const msg = SDPMsg.parse(parsed);
  //       this.opts.onRecvMessage?.(msg);
  //     } catch (e) {
  //       this.opts.onError?.(e);
  //     }
  //   };

  //   ws.onerror = (ev) => this.opts.onError?.(ev);

  //   ws.onclose = (ev) => {
  //     this.clearHeartbeat();
  //     this.opts.onClose?.(ev);
  //     this.ws = undefined;

  //     // If token expired (server can set code 4001/4003), fetch fresh token & reconnect
  //     if (!this.closedByUser) this.scheduleReconnect();
  //   };
  // }

  // private startHeartbeat() {
  //   this.clearHeartbeat();
  //   const tick = () => {
  //     if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
  //     // Send ping as a no-op app-level message (or use native ping if server supports)
  //     // Here we'll piggyback on idle cadence: send only if we've been quiet.
  //     const idleFor = Date.now() - this.lastSentAt;
  //     if (idleFor > this.opts.heartbeatMs!) {
  //       // lightweight heartbeat: servers often accept a comment or {"type":"ping"}
  //       this.ws.send('{"type":"ping"}');
  //       this.lastSentAt = Date.now();
  //     }
  //     this.hbTimer = window.setTimeout(tick, this.opts.heartbeatMs);
  //   };
  //   this.hbTimer = window.setTimeout(tick, this.opts.heartbeatMs);
  // }

  // private clearHeartbeat() {
  //   if (this.hbTimer) {
  //     clearTimeout(this.hbTimer);
  //     this.hbTimer = undefined;
  //   }
  // }

  // private async scheduleReconnect() {
  //   if (this.closedByUser) return;

  //   const delay = this.backoff + Math.floor(Math.random() * 250);
  //   const capped = Math.min(delay, this.opts.maxBackoffMs!);
  //   this.backoff = Math.min(this.backoff * 2, this.opts.maxBackoffMs!);

  //   setTimeout(async () => {
  //     try {
  //       // Refresh token on every reconnect attempt
  //       await this.beginNegotiation(this.ws!.url);
  //     } catch (e) {
  //       this.opts.onError?.(e);
  //       this.scheduleReconnect();
  //     }
  //   }, capped);
  // }
}
