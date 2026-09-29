import { createContext } from "react";

/** Keeps the standalone dashboard editor's controls separate from Appsmith's editor. */
export const IntegrationModeContext = createContext(false);
