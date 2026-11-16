import { createContext } from "react";

export type MascotPlacement = "logo" | "title" | "nav" | "panel";

export type MascotPose = {
  placement: MascotPlacement;
  image: string;
  navSlot?: number;
} | null;

export const MascotContext = createContext<MascotPose>(null);
