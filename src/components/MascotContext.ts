import { createContext } from "react";

export type MascotPlacement = "logo" | "title" | "nav" | "panel";

export type MascotPose = {
  placement: MascotPlacement;
  image: string;
  navSlot?: number;
} | null;

export type MascotContextValue = {
  placement: MascotPlacement;
  image: string;
  navSlot?: number;
  tapCat: () => void;
  bubble: { text: string; key: number } | null;
  isSquishing: boolean;
} | null;

export const MascotContext = createContext<MascotContextValue>(null);
