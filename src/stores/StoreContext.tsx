import React, { createContext, useContext } from "react";
import { RootStore } from "./RootStore";

export const StoreContext = createContext<RootStore | null>(null);

export const StoreProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [root] = React.useState(() => new RootStore());
  return <StoreContext.Provider value={root}>{children}</StoreContext.Provider>;
};

export const useStores = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStores must be used within StoreProvider");
  return ctx;
};


