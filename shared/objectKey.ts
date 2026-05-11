import { ObjectKind } from "./protocol";

export function objKey(kind: ObjectKind, i: number, j: number): string {
  const p =
    kind === "tree"
      ? "t"
      : kind === "bush"
        ? "b"
        : kind === "mushroom"
          ? "m"
          : kind === "fish"
            ? "f"
            : kind === "cactus"
              ? "c"
              : "s";
  return `${p}_${i}_${j}`;
}
