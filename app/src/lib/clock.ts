/** Injectable clock so services and the SLA engine are deterministic in tests. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();
export const fixedClock = (iso: string): Clock => () => new Date(iso);
