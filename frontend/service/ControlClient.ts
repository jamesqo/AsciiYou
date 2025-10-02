import { Device } from "mediasoup-client";

type ControlClientOpts = {
  baseWsUrl?: string;
  onOpen?: () => void;
  onClose?: (ev: CloseEvent) => void;
  onError?: (err: unknown) => void;
  onStreamConsumed?: (stream: MediaStream, participantId: string) => void;
};

type TransportInfo = {
  id: string;
  iceParameters: any;
  iceCandidates: any[];
  dtlsParameters: any;
};

export class ControlClient {
  private ws?: WebSocket;
  private opts: ControlClientOpts;

  // mediasoup
  private device: any | null = null;
  private sendTransport: any | null = null;
  private recvTransport: any | null = null;

  // single request -> response pending expectation
  // This means that after we issue a request, we cannot issue another one until we get the desired response form the server.
  // However, even as we're waiting for the expected response, we can handle other spontaneous events from the server. (eg newProducer)
  // TODO: might be possible to allow multiple in-flight requests in parallel,
  // but would need a compelling use case and require more testing for race conditions.
  private pending?: { match: (m: any) => boolean; resolve: (m: any) => void; reject: (e: any) => void; timer?: any };

  // Global async queue tail to serialize requests
  private tail: Promise<void> = Promise.resolve();

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.tail.then(op);
    // keep tail settled regardless of op outcome, so the chain continues strictly in order
    this.tail = run.then(() => {}, () => {});
    return run;
  }

  constructor(opts: ControlClientOpts = {}) {
    this.opts = {
      baseWsUrl: "ws://localhost:3000/ws",
      ...opts,
    };
  }

  async doHandshake(token: string) {
    await this.openWs(token)
    await this.loadRemoteCapabilities()
    await this.ensureSendTransport()
    await this.ensureRecvTransport()
    await this.startAcceptingProducers()
  }

  async openWs(token: string) {
    const wsUrl = `${this.opts.baseWsUrl}?token=${encodeURIComponent(token)}`;

    await new Promise<void>((resolve, reject) => {
      try {
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        ws.onopen = () => {
          this.opts.onOpen?.();
          resolve();
        };

        ws.onmessage = async (ev) => await this.handleIncoming(ev);
        ws.onerror = (ev) => {
          // reject any in-flight expectation
          if (this.pending) {
            const p = this.pending; this.pending = undefined;
            try { p.reject(new Error("ws error")); } catch {}
          }
          this.opts.onError?.(ev);
        };
        ws.onclose = (ev) => {
          // reject any in-flight expectation
          if (this.pending) {
            const p = this.pending; this.pending = undefined;
            try { p.reject(new Error(`ws closed: ${ev.code}`)); } catch {}
          }
          this.opts.onClose?.(ev);
          this.ws = undefined;
        };
      } catch (e) {
        this.opts.onError?.(e);
        reject(e as Error);
      }
    });
  }

  async loadRemoteCapabilities() {
    // Wait for router RTP caps and load device
    const routerCapsMsg: any = await this.waitFor((m) => m?.type === "routerRtpCapabilities");
    this.device = new Device();
    await this.device.load({
      routerRtpCapabilities: routerCapsMsg.data.routerRtpCapabilities
    });

    console.log("Loaded remote capabilities");
  }

  close(code = 1000, reason = "client-close") {
    this.ws?.close(code, reason);
    this.ws = undefined;
  }

  // Public: add a track to send
  async produceTrack(track: MediaStreamTrack): Promise<{ id: string }> {
    await this.ensureSendTransport();
    const transport = this.sendTransport!;
    return new Promise(async (resolve, reject) => {
      try {
        const producer = await transport.produce({ track });
        resolve({ id: producer.id });
      } catch (e) {
        reject(e);
      }
    });
  }

  // Public: consume by producerId -> returns MediaStream
  async consumeProducer(producerId: string): Promise<{ stream: MediaStream; consumerId: string; kind: string }> {
    await this.ensureRecvTransport();
    const rtpCaps = this.device!.rtpCapabilities;
    const msg = await this.request({ type: "consume", transportId: this.recvTransport!.id, producerId, rtpCapabilities: rtpCaps });
    const { id, kind, rtpParameters } = msg.data;
    const consumer = await this.recvTransport!.consume({ id, producerId, kind, rtpParameters });
    const stream = new MediaStream([consumer.track]);
    return { stream, consumerId: consumer.id, kind };
  }

  // ---------- internals ----------

  private async ensureSendTransport() {
    if (this.sendTransport) return;

    console.log("Initializing send transport");
    const created: { data: TransportInfo } = await this.request({ type: "createTransport", direction: "send" });
    const info = created.data;
    this.sendTransport = this.device!.createSendTransport({
      id: info.id,
      iceParameters: info.iceParameters,
      iceCandidates: info.iceCandidates,
      dtlsParameters: info.dtlsParameters,
    });
    this.sendTransport.on("connect", async ({ dtlsParameters }: any, callback: () => void, errback: (err: any) => void) => {
      try {
        console.log("send transport - starting dtls handshake");
        await this.request({ type: "connectTransport", transportId: info.id, dtlsParameters });
        console.log("send transport - connected");
        callback();
      } catch (e) { errback(e); }
    });
    this.sendTransport.on("produce", async ({ kind, rtpParameters }: any, callback: (arg: { id: string }) => void, errback: (err: any) => void) => {
      try {
        console.log("producing track");
        const resp: any = await this.request({ type: "produce", transportId: info.id, kind, rtpParameters });
        callback({ id: resp.data.id });
      } catch (e) { errback(e); }
    });
  }

  private async ensureRecvTransport() {
    if (this.recvTransport) return;
    const created: { data: TransportInfo } = await this.request({ type: "createTransport", direction: "recv" });
    const info = created.data;
    this.recvTransport = this.device!.createRecvTransport({
      id: info.id,
      iceParameters: info.iceParameters,
      iceCandidates: info.iceCandidates,
      dtlsParameters: info.dtlsParameters,
    });
    this.recvTransport.on("connect", async ({ dtlsParameters }: any, callback: () => void, errback: (err: any) => void) => {
      try {
        console.log("recv transport - starting dtls handshake");
        await this.request({ type: "connectTransport", transportId: info.id, dtlsParameters });
        console.log("recv transport - connected");
        callback();
      } catch (e) { errback(e); }
    });
  }

  // signals to the backend that we are ready to receive newProducer messages
  private async startAcceptingProducers() {
    await this.request({ type: "relayProducers" });
  }

  // WS plumbing
  private async handleIncoming(ev: MessageEvent) {
    try {
      const msg = JSON.parse(ev.data as string);
      console.log("Received WS message", msg);
      const resolveIfPending = (m: any) => {
        if (this.pending && this.pending.match(m)) {
          const p = this.pending; this.pending = undefined;
          if (p.timer) clearTimeout(p.timer);
          p.resolve(m);
          return true;
        }
        return false;
      };

      switch (msg.type) {
        // handshake messages -- these are explicitly awaited
        case "routerRtpCapabilities":
        case "transportCreated":
        case "ack":
        case "produced":
        case "consumed":
          if (!resolveIfPending(msg)) {
            throw new Error(`${msg.type} not awaited`);
          }
          return;
        // event messages -- these are sent spontaneously by the server, not explicitly awaited
        case "newProducer": {
          const { participantId, producerId } = msg;
          const { stream } = await this.consumeProducer(producerId);
          this.opts.onStreamConsumed?.(stream, participantId);
          return;
        }
        default:
          throw new Error(`unknown message type: ${msg.type}`);
      }
    } catch (e) {
      this.opts.onError?.(e);
    }
  }

  private async request(payload: any): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("control WS not open");
    }
    return this.enqueue(() => new Promise<any>((resolve, reject) => {
      const match = (m: any) => {
        if (payload.type === "createTransport") return m?.type === "transportCreated";
        if (payload.type === "connectTransport") return m?.type === "ack" && m.op === "connectTransport" && m.transportId === payload.transportId;
        if (payload.type === "produce") return m?.type === "produced";
        if (payload.type === "consume") return m?.type === "consumed";
        if (payload.type === "relayProducers") return m?.type === "ack" && m.op === "relayProducers";
        return false;
      };
      const timer = setTimeout(() => {
        if (this.pending) {
          const cur = this.pending; this.pending = undefined;
          try { cur.reject(new Error("request timeout")); } catch {}
        }
      }, 15000);
      this.pending = { match, resolve, reject, timer };
      console.log("Sending WS message", payload);
      this.ws!.send(JSON.stringify(payload));
    }));
  }

  private waitFor(pred: (m: any) => boolean): Promise<any> {
    return this.enqueue(() => new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending) {
          const cur = this.pending; this.pending = undefined;
          try { cur.reject(new Error("waitFor timeout")); } catch {}
        }
      }, 15000);
      this.pending = { match: pred, resolve, reject, timer };
    }));
  }
}
