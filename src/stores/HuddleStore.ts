import { makeAutoObservable, runInAction } from "mobx";
import { z } from "zod";
import { APIClient } from "@/service/APIClient";
import type { RootStore } from '@/stores/RootStore'

export const HuddleConnection = z.object({
  ok: z.literal(true),
  huddleId: z.string(),
  participantId: z.string(),
  role: z.enum(["host", "guest"]),
  huddleExpiry: z.string(),
  signalingWs: z.url(),
});
export type HuddleConnection = z.infer<typeof HuddleConnection>;

export class HuddleStore {
  private apiClient: APIClient;
  conn?: HuddleConnection = undefined;
  loading = false;
  error?: string = undefined;

  constructor(apiClient: APIClient) {
    this.apiClient = apiClient;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  reset() {
    this.conn = undefined;
    this.error = undefined;
    this.loading = false;
  }

  async startNew() {
    this.loading = true;
    try {
      const conn = await this.apiClient.post("/huddles", HuddleConnection);
      runInAction(() => {
        this.conn = conn;
        this.error = undefined;
      });
    } catch (e: any) {
      runInAction(() => {
        this.error = e?.message ?? String(e);
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async join(huddleId: string) {
    this.loading = true;
    try {
      const conn = await this.apiClient.post(`/huddles/${huddleId}/join`, HuddleConnection);
      runInAction(() => {
        this.conn = conn;
        this.error = undefined;
      });
    } catch (e: any) {
      runInAction(() => {
        this.error = e?.message ?? String(e);
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}


