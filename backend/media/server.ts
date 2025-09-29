import express, { Request, Response } from 'express';
import util from 'node:util';
import http from 'node:http';
import { types, createWorker } from 'mediasoup';

// Basic in-memory SFU state. For production, extract to its own module and add cleanup.
interface Participant {
  id: string;
  transports: Map<string, types.WebRtcTransport>;
  producers: Map<string, types.Producer>;
  consumers: Map<string, types.Consumer>;
}

interface Huddle {
  id: string;
  router: types.Router;
  participants: Map<string, Participant>;
}

const app = express();
app.use(express.json());

// Request/Response logging middleware
app.use((req: Request, res: Response, next) => {
  const start = process.hrtime.bigint();

  // Capture response payload by monkey-patching json/send
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let responseBody: unknown;

  res.json = (body: any) => {
    responseBody = body;
    return originalJson(body);
  };
  // Note: some routes may use res.send
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).send = (body: any) => {
    responseBody = body;
    return originalSend(body);
  };

  const pretty = (val: unknown): string => {
    try {
      if (typeof val === 'string') {
        // try JSON pretty
        try { return JSON.stringify(JSON.parse(val), null, 2); } catch {}
        return val;
      }
      // util.inspect expands nested objects/arrays instead of [Object]
      return util.inspect(val, { depth: null, colors: false, maxArrayLength: null });
    } catch {
      return String(val);
    }
  };

  res.on('finish', () => {
    const durMs = Number(process.hrtime.bigint() - start) / 1e6;
    const method = req.method;
    const url = req.originalUrl || req.url;
    const status = res.statusCode;
    console.log(`[media] ${method} ${url} -> ${status} ${durMs.toFixed(1)}ms`);

    // Log bodies if present (and reasonably sized)
    const reqBody = req.body;
    if (reqBody && (typeof reqBody !== 'object' || Object.keys(reqBody).length > 0)) {
      try { console.log('[media]   req body:\n' + pretty(reqBody)); } catch {}
    }
    if (typeof responseBody !== 'undefined') {
      try { console.log('[media]   res body:\n' + pretty(responseBody)); } catch {}
    }
  });

  next();
});

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
  const h: Huddle = { id: hid, router, participants: new Map() };
  huddles.set(hid, h);
  return h;
}

function getParticipant(h: Huddle, participantId: string): Participant {
  let p = h.participants.get(participantId);
  if (!p) {
    p = { id: participantId, transports: new Map(), producers: new Map(), consumers: new Map() };
    h.participants.set(participantId, p);
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
  const { participantId } = req.body as { participantId: string };
  if (!participantId) return bad(res, 'participantId required');
  const h = await ensureHuddle(hid);
  const participant = getParticipant(h, participantId);

  const transport = await h.router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.ANNOUNCED_IP || undefined }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });
  participant.transports.set(transport.id, transport);
  transport.on('dtlsstatechange', (state) => {
    if (state === 'closed' || state === 'failed') transport.close();
  });
  transport.on('@close', () => participant.transports.delete(transport.id));

  ok(res, {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  });
});

app.post('/transports/:tid/connect', async (req: Request, res: Response) => {
  const { tid } = req.params;
  const { dtlsParameters, hid, participantId } = req.body as { dtlsParameters: types.DtlsParameters; hid: string; participantId: string; };
  if (!hid || !participantId) return bad(res, 'hid and participantId required');
  const h = huddles.get(hid);
  if (!h) return notFound(res);
  const participant = h.participants.get(participantId);
  if (!participant) return notFound(res);
  const transport = participant.transports.get(tid);
  if (!transport) return notFound(res);
  await transport.connect({ dtlsParameters });
  ok(res, { ok: true });
});

app.post('/huddles/:hid/produce', async (req: Request, res: Response) => {
  const { hid } = req.params;
  const { participantId, transportId, kind, rtpParameters, appData } = req.body as {
    participantId: string; transportId: string; kind: types.MediaKind; rtpParameters: types.RtpParameters; appData?: any;
  };
  if (!participantId || !transportId || !kind || !rtpParameters) return bad(res, 'missing fields');
  const h = huddles.get(hid);
  if (!h) return notFound(res);
  const participant = getParticipant(h, participantId);
  const transport = participant.transports.get(transportId);
  if (!transport) return notFound(res);

  const producer = await transport.produce({ kind, rtpParameters, appData: { ...appData, hid, participantId } });
  participant.producers.set(producer.id, producer);
  producer.on('transportclose', () => producer.close());
  producer.on('@close', () => participant.producers.delete(producer.id));
  ok(res, { id: producer.id });
});

app.post('/huddles/:hid/consume', async (req: Request, res: Response) => {
  const { hid } = req.params;
  const { participantId, transportId, producerId, rtpCapabilities } = req.body as {
    participantId: string; transportId: string; producerId: string; rtpCapabilities: types.RtpCapabilities;
  };
  const h = huddles.get(hid);
  if (!h) return notFound(res);
  const participant = getParticipant(h, participantId);
  const transport = participant.transports.get(transportId);
  if (!transport) return notFound(res);

  const can = h.router.canConsume({ producerId, rtpCapabilities });
  if (!can) return bad(res, 'cannot consume');
  const consumer = await transport.consume({ producerId, rtpCapabilities, paused: false });
  participant.consumers.set(consumer.id, consumer);
  consumer.on('transportclose', () => consumer.close());
  consumer.on('producerclose', () => consumer.close());
  consumer.on('@close', () => participant.consumers.delete(consumer.id));

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
    for (const participant of h.participants.values()) {
      const p = participant.producers.get(pid);
      if (p) { await p.pause(); return ok(res, { ok: true }); }
    }
  }
  return notFound(res);
});

app.post('/producers/:pid/resume', async (req: Request, res: Response) => {
  const { pid } = req.params;
  for (const h of huddles.values()) {
    for (const participant of h.participants.values()) {
      const p = participant.producers.get(pid);
      if (p) { await p.resume(); return ok(res, { ok: true }); }
    }
  }
  return notFound(res);
});

app.delete('/producers/:pid', async (req: Request, res: Response) => {
  const { pid } = req.params;
  for (const h of huddles.values()) {
    for (const participant of h.participants.values()) {
      const p = participant.producers.get(pid);
      if (p) { p.close(); return ok(res, { ok: true }); }
    }
  }
  return notFound(res);
});

// Consumer controls
app.post('/consumers/:cid/pause', async (req: Request, res: Response) => {
  const { cid } = req.params;
  for (const h of huddles.values()) {
    for (const participant of h.participants.values()) {
      const c = participant.consumers.get(cid);
      if (c) { await c.pause(); return ok(res, { ok: true }); }
    }
  }
  return notFound(res);
});

app.post('/consumers/:cid/resume', async (req: Request, res: Response) => {
  const { cid } = req.params;
  for (const h of huddles.values()) {
    for (const participant of h.participants.values()) {
      const c = participant.consumers.get(cid);
      if (c) { await c.resume(); return ok(res, { ok: true }); }
    }
  }
  return notFound(res);
});

app.delete('/consumers/:cid', async (req: Request, res: Response) => {
  const { cid } = req.params;
  for (const h of huddles.values()) {
    for (const participant of h.participants.values()) {
      const c = participant.consumers.get(cid);
      if (c) { c.close(); return ok(res, { ok: true }); }
    }
  }
  return notFound(res);
});

// Close participant (cleans transports/producers/consumers)
app.delete('/huddles/:hid/participants/:participantId', async (req: Request, res: Response) => {
  const { hid, participantId } = req.params as { hid: string; participantId: string };
  const h = huddles.get(hid);
  if (!h) return notFound(res);
  const participant = h.participants.get(participantId);
  if (!participant) return notFound(res);
  for (const c of participant.consumers.values()) c.close();
  for (const p of participant.producers.values()) p.close();
  for (const t of participant.transports.values()) t.close();
  h.participants.delete(participantId);
  ok(res, { ok: true });
});

// Huddle state / close
app.get('/huddles/:hid/state', async (req: Request, res: Response) => {
  const { hid } = req.params;
  const h = huddles.get(hid);
  if (!h) return notFound(res);
  ok(res, {
    id: h.id,
    participants: Array.from(h.participants.values()).map(p => ({
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
  for (const participant of h.participants.values()) {
    for (const c of participant.consumers.values()) c.close();
    for (const p of participant.producers.values()) p.close();
    for (const t of participant.transports.values()) t.close();
  }
  h.router.close();
  huddles.delete(hid);
  ok(res, { ok: true });
});

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[media] SFU listening on http://localhost:${PORT}`);
});
