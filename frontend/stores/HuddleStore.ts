import { makeAutoObservable, runInAction } from "mobx";
import { z } from "zod";
import { APIClient } from "@/service/APIClient";

export const JoinOk = z.object({
  ok: z.literal(true),
  huddleId: z.string(),
  participantId: z.string(),
  role: z.enum(["host", "guest"]),
  huddleExpiry: z.string(),
  sdpNegotiationUrl: z.url(),
}).transform(o => ({
  ...o,
  toString() {
    return [
      "JoinOk {",
      `  ok: ${o.ok},`,
      `  role: ${o.role},`,
      `  huddleId: ${o.huddleId},`,
      `  participantId: ${o.participantId},`,
      `  sdpNegotiationUrl: ${o.sdpNegotiationUrl},`,
      `  huddleExpiry: ${o.huddleExpiry}`,
      "}"
    ].join("\n");
  }
}));
export type JoinOk = z.infer<typeof JoinOk>;

export class HuddleStore {
  private apiClient: APIClient;

  constructor(apiClient: APIClient) {
    this.apiClient = apiClient;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  async startNew() : Promise<JoinOk> {
    return await this.apiClient.post(`/huddles`, JoinOk);
  }

  async join(huddleId: string) : Promise<JoinOk> {
    return await this.apiClient.post(`/huddles/${huddleId}/join`, JoinOk);
  }
}


