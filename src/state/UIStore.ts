import { makeAutoObservable, reaction } from 'mobx'
import { appConfig } from '../config/appConfig'
import type { ASCIIRenderer } from '../engine/ASCIIRenderer'

export class UIStore {
  width = appConfig.defaultSettings.outW
  height = appConfig.defaultSettings.outH
  contrast = appConfig.defaultSettings.contrast
  edgeBias = appConfig.defaultSettings.edgeBias
  invert = !!appConfig.defaultSettings.invert

  private renderer: ASCIIRenderer | null = null
  private disposeReaction?: () => void

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true })
    this.disposeReaction = reaction(
      () => [this.width, this.height, this.contrast, this.edgeBias, this.invert] as const,
      () => {
        const r = this.renderer
        if (!r) return
        r.outW = this.width
        r.outH = this.height
        r.contrast = this.contrast
        r.edgeBias = this.edgeBias
        r.invert = this.invert ? 1.0 : 0.0
        r.updateUniforms().catch(console.error)
      },
      { fireImmediately: false }
    )
  }

  setRenderer(r: ASCIIRenderer) { this.renderer = r }
  setWidth(v: number) { this.width = v }
  setHeight(v: number) { this.height = v }
  setContrast(v: number) { this.contrast = v }
  setEdgeBias(v: number) { this.edgeBias = v }
  setInvert(v: boolean) { this.invert = v }

  destroy() { this.disposeReaction?.(); this.disposeReaction = undefined }
}

export const uiStore = new UIStore()
