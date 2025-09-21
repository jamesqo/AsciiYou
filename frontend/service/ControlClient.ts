import { Device } from "mediasoup-client";

type ControlClientOpts = {
  baseWsUrl?: string;
  onOpen?: () => void;
  onClose?: (ev: CloseEvent) => void;
  onError?: (err: unknown) => void;
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

  // simple waiter mechanism for responses
  private waiters: Array<{ match: (m: any) => boolean; resolve: (m: any) => void; reject: (e: any) => void }> = [];

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

        ws.onmessage = (ev) => this.handleIncoming(ev);
        ws.onerror = (ev) => this.opts.onError?.(ev);
        ws.onclose = (ev) => {
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
    await this.device.load({ routerRtpCapabilities: routerCapsMsg.data });
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
    const rtpcaps = this.device!.rtpCapabilities;
    const data = await this.request({ type: "consume", transportId: this.recvTransport!.id, producerId, rtpCapabilities: rtpcaps });
    const { id, kind, rtpParameters } = data.data;
    const consumer = await this.recvTransport!.consume({ id, producerId, kind, rtpParameters });
    const stream = new MediaStream([consumer.track]);
    return { stream, consumerId: consumer.id, kind };
  }

  // ---------- internals ----------

  private async ensureSendTransport() {
    if (this.sendTransport) return;
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
        await this.request({ type: "connectTransport", transportId: info.id, dtlsParameters });
        callback();
      } catch (e) { errback(e); }
    });
    this.sendTransport.on("produce", async ({ kind, rtpParameters }: any, callback: (arg: { id: string }) => void, errback: (err: any) => void) => {
      try {
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
        await this.request({ type: "connectTransport", transportId: info.id, dtlsParameters });
        callback();
      } catch (e) { errback(e); }
    });
  }

  // WS plumbing
  private handleIncoming(ev: MessageEvent) {
    try {
      const msg = JSON.parse(ev.data as string);
      // resolve waiter if any matches
      const i = this.waiters.findIndex((w) => w.match(msg));
      if (i >= 0) {
        const [w] = this.waiters.splice(i, 1);
        w.resolve(msg);
      }
    } catch (e) {
      this.opts.onError?.(e);
    }
  }

  private async request(payload: any): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("control WS not open");
    }
    const p = new Promise<any>((resolve, reject) => {
      // match different server response types
      const match = (m: any) => {
        if (payload.type === "createTransport") return m?.type === "transportCreated";
        if (payload.type === "connectTransport") return m?.type === "ack" && (m.transportId || m.transport_id) === payload.transportId;
        if (payload.type === "produce") return m?.type === "produced";
        if (payload.type === "consume") return m?.type === "consumed";
        return false;
      };
      this.waiters.push({ match, resolve, reject });
    });
    this.ws.send(JSON.stringify(payload));
    return p;
  }

  private waitFor(pred: (m: any) => boolean): Promise<any> {
    return new Promise((resolve, reject) => {
      this.waiters.push({ match: pred, resolve, reject });
    });
  }
}
