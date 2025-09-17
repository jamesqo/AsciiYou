import { APIClient } from '@/service/APIClient'
import { HuddleStore } from '@/stores/HuddleStore'
import { UIStore } from '@/stores/UIStore'
import { appConfig } from '@/config/appConfig'
import { SDPClient } from '@/service/SDPClient'
import { SignalingStore } from '@/stores/SignalingStore'

// root store that provides references to all other stores
// accessed by UI layer via useStores() hook
export class RootStore {
  private readonly apiClient: APIClient
  private readonly sdpClient: SDPClient

  readonly uiStore: UIStore
  readonly huddleStore: HuddleStore
  readonly signalingStore: SignalingStore

  constructor() {
    this.apiClient = new APIClient(appConfig.apiUrl)
    this.sdpClient = new SDPClient({
      onOpen: () => console.log('SDP WebSocket opened'),
      onClose: () => console.log('SDP WebSocket closed'),
      onError: (err) => console.error('SDP WebSocket error', err),
      onRecvMessage: (msg) => console.log('SDP WebSocket message received', msg),
      onSendMessage: (msg) => console.log('SDP WebSocket message sent', msg)
    })

    this.uiStore = new UIStore()
    this.huddleStore = new HuddleStore(this.apiClient)
    this.signalingStore = new SignalingStore(this.sdpClient)
  }
}


