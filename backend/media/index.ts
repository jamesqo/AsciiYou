import express, { Request, Response } from 'express';
import http from 'node:http';
import { types, createWorker } from 'mediasoup';

// TODO: rename Peer -> Participant? or the other way around?
// (same for Huddle & Room-- which one should we use?)

// Basic in-memory SFU state. For production, extract to its own module and add cleanup.
interface Peer {
  id: string;
  transports: Map<string, types.WebRtcTransport>;
  producers: Map<string, types.Producer>;
  consumers: Map<string, types.Consumer>;
}

interface Huddle {
  id: string;
  router: types.Router;
  peers: Map<string, Peer>;
}

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 7001);

const huddles: Map<string, Huddle> = new Map();
let worker: types.Worker | null = null;

async function getWorker(): Promise<types.Worker> {
  if (worker) return worker;
  worker = await createWorker();
  worker.on('died', () => {
    console.error('[media] mediasoup worker died, exiting');
    process.exit(1);
  });
  return worker;
}

async function ensureHuddle(hid: string): Promise<Huddle> {
  const existing = huddles.get(hid);
  if (existing) return existing;

  const w = await getWorker();
  const router = await w.createRouter({
    mediaCodecs: [
      // Common opus + VP8/VP9/H264
      { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
      { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
      { kind: 'video', mimeType: 'video/VP9', clockRate: 90000 },
      { kind: 'video', mimeType: 'video/H264', clockRate: 90000 }
    ]
  });
  const h: Huddle = { id: hid, router, peers: new Map() };
  huddles.set(hid, h);
  return h;
}

function getPeer(h: Huddle, peerId: string): Peer {
  let p = h.peers.get(peerId);
  if (!p) {
    p = { id: peerId, transports: new Map(), producers: new Map(), consumers: new Map() };
    h.peers.set(peerId, p);
  }
  return p;
}

// Helpers
function ok(res: Response, data: unknown) { res.status(200).json(data); }
function notFound(res: Response) { res.status(404).json({ error: 'not found' }); }
function bad(res: Response, msg: string) { res.status(400).json({ error: msg }); }

// Routes
app.get('/health', (_req, res) => ok(res, { ok: true }));

app.post('/huddles/:hid/ensure', async (req: Request, res: Response) => {
  const { hid } = req.params;
  const h = await ensureHuddle(hid);
  ok(res, { routerRtpCapabilities: h.router.rtpCapabilities });
});

app.post('/huddles/:hid/transports', async (req: Request, res: Response) => {
  const { hid } = req.params;
  const { peerId } = req.body as { peerId: string };
  if (!peerId) return bad(res, 'peerId required');
  const h = await ensureHuddle(hid);
  const peer = getPeer(h, peerId);

  const transport = await h.router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.ANNOUNCED_IP || undefined }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });
  peer.transports.set(transport.id, transport);
  transport.on('dtlsstatechange', (state) => {
    if (state === 'closed' || state === 'failed') transport.close();
  });
  transport.on('close', () => peer.transports.delete(transport.id));

  ok(res, {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  });
});

app.post('/transports/:tid/connect', async (req: Request, res: Response) => {
  const { tid } = req.params;
  const { dtlsParameters, hid, peerId } = req.body as { dtlsParameters: types.DtlsParameters; hid: string; peerId: string; };
  if (!hid || !peerId) return bad(res, 'hid and peerId required');
  const h = huddles.get(hid);
  if (!h) return notFound(res);
  const peer = h.peers.get(peerId);
  if (!peer) return notFound(res);
  const transport = peer.transports.get(tid);
  if (!transport) return notFound(res);
  await transport.connect({ dtlsParameters });
  ok(res, { ok: true });
});

app.post('/huddles/:hid/produce', async (req: Request, res: Response) => {
  const { hid } = req.params;
  const { peerId, transportId, kind, rtpParameters, appData } = req.body as {
    peerId: string; transportId: string; kind: types.MediaKind; rtpParameters: types.RtpParameters; appData?: any;
  };
  if (!peerId || !transportId || !kind || !rtpParameters) return bad(res, 'missing fields');
  const h = huddles.get(hid);
  if (!h) return notFound(res);
  const peer = getPeer(h, peerId);
  const transport = peer.transports.get(transportId);
  if (!transport) return notFound(res);

  const producer = await transport.produce({ kind, rtpParameters, appData: { ...appData, hid, peerId } });
  peer.producers.set(producer.id, producer);
  producer.on('transportclose', () => producer.close());
  producer.on('close', () => peer.producers.delete(producer.id));
  ok(res, { id: producer.id });
});

app.post('/huddles/:hid/consume', async (req: Request, res: Response) => {
  const { hid } = req.params;
  const { peerId, transportId, producerId, rtpCapabilities } = req.body as {
    peerId: string; transportId: string; producerId: string; rtpCapabilities: types.RtpCapabilities;
  };
  const h = huddles.get(hid);
  if (!h) return notFound(res);
  const peer = getPeer(h, peerId);
  const transport = peer.transports.get(transportId);
  if (!transport) return notFound(res);

  const can = h.router.canConsume({ producerId, rtpCapabilities });
  if (!can) return bad(res, 'cannot consume');
  const consumer = await transport.consume({ producerId, rtpCapabilities, paused: false });
  peer.consumers.set(consumer.id, consumer);
  consumer.on('transportclose', () => consumer.close());
  consumer.on('producerclose', () => consumer.close());
  consumer.on('close', () => peer.consumers.delete(consumer.id));

  ok(res, {
    id: consumer.id,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
    producerId,
  });
});

// Producer controls
app.post('/producers/:pid/pause', async (req: Request, res: Response) => {
  const { pid } = req.params;
  for (const h of huddles.values()) {
    for (const peer of h.peers.values()) {
      const p = peer.producers.get(pid);
      if (p) { await p.pause(); return ok(res, { ok: true }); }
    }
  }
  return notFound(res);
});

app.post('/producers/:pid/resume', async (req: Request, res: Response) => {
  const { pid } = req.params;
  for (const h of huddles.values()) {
    for (const peer of h.peers.values()) {
      const p = peer.producers.get(pid);
      if (p) { await p.resume(); return ok(res, { ok: true }); }
    }
  }
  return notFound(res);
});

app.delete('/producers/:pid', async (req: Request, res: Response) => {
  const { pid } = req.params;
  for (const h of huddles.values()) {
    for (const peer of h.peers.values()) {
      const p = peer.producers.get(pid);
      if (p) { p.close(); return ok(res, { ok: true }); }
    }
  }
  return notFound(res);
});

// Consumer controls
app.post('/consumers/:cid/pause', async (req: Request, res: Response) => {
  const { cid } = req.params;
  for (const h of huddles.values()) {
    for (const peer of h.peers.values()) {
      const c = peer.consumers.get(cid);
      if (c) { await c.pause(); return ok(res, { ok: true }); }
    }
  }
  return notFound(res);
});

app.post('/consumers/:cid/resume', async (req: Request, res: Response) => {
  const { cid } = req.params;
  for (const h of huddles.values()) {
    for (const peer of h.peers.values()) {
      const c = peer.consumers.get(cid);
      if (c) { await c.resume(); return ok(res, { ok: true }); }
    }
  }
  return notFound(res);
});

app.delete('/consumers/:cid', async (req: Request, res: Response) => {
  const { cid } = req.params;
  for (const h of huddles.values()) {
    for (const peer of h.peers.values()) {
      const c = peer.consumers.get(cid);
      if (c) { c.close(); return ok(res, { ok: true }); }
    }
  }
  return notFound(res);
});

// Close peer (cleans transports/producers/consumers)
app.delete('/huddles/:hid/peers/:peerId', async (req: Request, res: Response) => {
  const { hid, peerId } = req.params;
  const h = huddles.get(hid);
  if (!h) return notFound(res);
  const peer = h.peers.get(peerId);
  if (!peer) return notFound(res);
  for (const c of peer.consumers.values()) c.close();
  for (const p of peer.producers.values()) p.close();
  for (const t of peer.transports.values()) t.close();
  h.peers.delete(peerId);
  ok(res, { ok: true });
});

// Huddle state / close
app.get('/huddles/:hid/state', async (req: Request, res: Response) => {
  const { hid } = req.params;
  const h = huddles.get(hid);
  if (!h) return notFound(res);
  ok(res, {
    id: h.id,
    peers: Array.from(h.peers.values()).map(p => ({
      id: p.id,
      transports: Array.from(p.transports.keys()),
      producers: Array.from(p.producers.keys()),
      consumers: Array.from(p.consumers.keys()),
    })),
  });
});

app.delete('/huddles/:hid', async (req: Request, res: Response) => {
  const { hid } = req.params;
  const h = huddles.get(hid);
  if (!h) return notFound(res);
  for (const peer of h.peers.values()) {
    for (const c of peer.consumers.values()) c.close();
    for (const p of peer.producers.values()) p.close();
    for (const t of peer.transports.values()) t.close();
  }
  h.router.close();
  huddles.delete(hid);
  ok(res, { ok: true });
});

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[media] SFU listening on http://localhost:${PORT}`);
});
