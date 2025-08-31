import { makeAutoObservable, reaction } from 'mobx'
import { DefaultSettings } from '../util/constants'
import type { ASCIIRenderer } from '../engine/ASCIIRenderer'

export class UIStore {
  width = DefaultSettings.WIDTH
  height = DefaultSettings.HEIGHT
  contrast = DefaultSettings.CONTRAST
  edgeBias = DefaultSettings.EDGE_BIAS
  invert = !!DefaultSettings.INVERT

  private renderer: ASCIIRenderer | null = null
  private disposeReaction?: () => void

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true })
    this.disposeReaction = reaction(
      () => [this.width, this.height, this.contrast, this.edgeBias, this.invert] as const,
      () => {
        const r = this.renderer
        if (!r) return
        r.settings.width = this.width
        r.settings.height = this.height
        r.settings.contrast = this.contrast
        r.settings.edgeBias = this.edgeBias
        r.settings.invert = this.invert ? 1.0 : 0.0
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
