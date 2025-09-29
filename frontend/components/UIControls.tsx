import React from 'react'
import { observer } from 'mobx-react-lite'
import { useStores } from '@/stores/StoreContext'

export const UIControls = observer(function UIControls() {
  const { uiStore: ui } = useStores()
  return (
    <div className="controls">
      <div className="control-group">
        <label>Width:</label>
        <input type="range" min={40} max={200} step={10}
               value={ui.width} onChange={e => ui.setWidth(parseInt((e.target as HTMLInputElement).value))} />
        <span>{ui.width}</span>
      </div>

      <div className="control-group">
        <label>Height:</label>
        <input type="range" min={30} max={120} step={5}
               value={ui.height} onChange={e => ui.setHeight(parseInt((e.target as HTMLInputElement).value))} />
        <span>{ui.height}</span>
      </div>

      <div className="control-group">
        <label>Contrast:</label>
        <input type="range" min={0.5} max={2.0} step={0.1}
               value={ui.contrast} onChange={e => ui.setContrast(parseFloat((e.target as HTMLInputElement).value))} />
        <span>{ui.contrast}</span>
      </div>

      <div className="control-group">
        <label>Edge Bias:</label>
        <input type="range" min={0.0} max={1.0} step={0.05}
               value={ui.edgeBias} onChange={e => ui.setEdgeBias(parseFloat((e.target as HTMLInputElement).value))} />
        <span>{ui.edgeBias}</span>
      </div>

      <div className="control-group">
        <label>Invert:</label>
        <input type="checkbox" checked={ui.invert} onChange={e => ui.setInvert((e.target as HTMLInputElement).checked)} />
      </div>
    </div>
  )
})
