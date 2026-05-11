import { HuntWeapon, Resources } from "../shared/protocol";

export function craftBetterWeapon(current: HuntWeapon, res: Resources): HuntWeapon | null {
  if (current === "spear") return null;
  if (res.holz >= 1 && res.stein >= 1) return "spear";
  if (current === "club" || current === "stones") return null;
  if (res.holz >= 1) return "club";
  if (res.stein >= 1) return "stones";
  return null;
}

export function payWeaponCost(weapon: HuntWeapon, res: Resources): void {
  if (weapon === "spear") {
    res.holz -= 1;
    res.stein -= 1;
  } else if (weapon === "club") {
    res.holz -= 1;
  } else if (weapon === "stones") {
    res.stein -= 1;
  }
}
