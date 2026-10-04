import type { Job } from "./domain";

/** Keep implausible or malformed feed values out of comparisons; never guess units. */
export function usableSalary(salary: Job["salary"]): boolean {
  return Boolean(salary && Number.isFinite(salary.normalizedAnnualMax) && salary.normalizedAnnualMax >= 1000 && salary.originalAmountMin > 0 && salary.originalAmountMax >= salary.originalAmountMin);
}
