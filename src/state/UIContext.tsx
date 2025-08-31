import React, { createContext, useContext } from 'react'
import { UIStore, uiStore } from './UIStore'

const Ctx = createContext<UIStore>(uiStore)

export function UIProvider({ children, store = uiStore }: { children: React.ReactNode; store?: UIStore }) {
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useUI(): UIStore {
  return useContext(Ctx)
}
