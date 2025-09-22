import { APIClient } from '@/service/APIClient'
import { HuddleStore } from '@/stores/HuddleStore'
import { UIStore } from '@/stores/UIStore'
import { appConfig } from '@/config/appConfig'
import { StreamingStore } from '@/stores/StreamingStore'

// root store that provides references to all other stores
// accessed by UI layer via useStores() hook
export class RootStore {
  private readonly apiClient: APIClient

  readonly uiStore: UIStore
  readonly huddleStore: HuddleStore
  readonly streamingStore: StreamingStore

  constructor() {
    this.apiClient = new APIClient(appConfig.apiUrl)

    this.uiStore = new UIStore()
    this.huddleStore = new HuddleStore(this.apiClient)
    this.streamingStore = new StreamingStore()
  }
}


