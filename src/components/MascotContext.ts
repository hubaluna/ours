import { createContext } from "react";

export type MascotPose = {
  placement: "logo" | "section";
  image: string;
} | null;

export const MascotContext = createContext<MascotPose>(null);
