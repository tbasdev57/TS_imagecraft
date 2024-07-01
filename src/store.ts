import { writable } from "svelte/store";

export type Region = {
  id: string;
  points: { x: number; y: number }[];
};
export const regionStore = writable<Region[]>([]);

export const resetRegions = () => {
  regionStore.set([]);
};
