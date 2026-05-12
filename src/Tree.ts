import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";
import { groundHeight, treeSpeciesAt, TreeSpecies } from "../shared/worldgen";
import { Season } from "../shared/protocol";

const DECID_VARIANTS = [
  { trunkW: 5, trunkH: 12, leafW: 22, leafH: 24, leafColor: 0x2e7a2e },
  { trunkW: 7, trunkH: 16, leafW: 30, leafH: 32, leafColor: 0x276b27 },
  { trunkW: 6, trunkH: 14, leafW: 26, leafH: 28, leafColor: 0x3a8a3a },
  { trunkW: 6, trunkH: 18, leafW: 24, leafH: 34, leafColor: 0x205820 },
];

const AUTUMN_COLORS = [
  0xc23a1a, // rot
  0xd97a1a, // orange
  0xe6b224, // gold
  0xa67340, // braun
  0x9a3318, // dunkelrot
  0xc2871a, // ocker
];

const SPRING_LEAF = 0x8fd36b;
const SPRING_HIGHLIGHT = 0xbbe89a;
const SUMMER_HIGHLIGHT = 0x6cbf6c;
const WINTER_TWIG = 0x4a3a22;

const CONIFER_VARIANTS = [
  { trunkW: 4, trunkH: 8, baseW: 22, totalH: 36, leafColor: 0x1f4d1f },
  { trunkW: 5, trunkH: 10, baseW: 26, totalH: 44, leafColor: 0x274d27 },
  { trunkW: 4, trunkH: 9, baseW: 20, totalH: 40, leafColor: 0x1a3d22 },
];

export type TreeStage = 1 | 2 | 3 | 4;

const STAGE_SCALE: Record<TreeStage, number> = {
  1: 0.18,
  2: 0.42,
  3: 0.7,
  4: 1.0,
};

export class Tree {
  scene: Phaser.Scene;
  id: string;
  i: number;
  j: number;
  alive = true;
  species: TreeSpecies;
  stage: TreeStage;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  private baseScale: number;
  private leaves: Phaser.GameObjects.Ellipse | null = null;
  private leavesShadow: Phaser.GameObjects.Ellipse | null = null;
  private leavesHighlight: Phaser.GameObjects.Ellipse | null = null;
  private summerLeafColor = 0;
  private autumnColor = 0;
  private currentSeason: Season = "summer";

  constructor(
    scene: Phaser.Scene,
    id: string,
    i: number,
    j: number,
    worldSeed: number,
    stage: TreeStage = 4,
  ) {
    this.scene = scene;
    this.id = id;
    this.i = i;
    this.j = j;
    this.species = treeSpeciesAt(worldSeed, i, j);
    this.stage = stage;

    const jitter = ((((i * 73 + j * 19) % 7) + 7) % 7 - 3) / 30;
    this.baseScale = 1 + jitter;

    const { x, y } = gridToScreen(i + 0.5, j + 0.5);
    const h = groundHeight(worldSeed, i + 0.5, j + 0.5);
    const wy = y - h;

    if (this.species === "conifer") {
      const cIdx = ((i * 19 + j * 11) % CONIFER_VARIANTS.length + CONIFER_VARIANTS.length) % CONIFER_VARIANTS.length;
      const v = CONIFER_VARIANTS[cIdx];
      this.shadow = scene.add.ellipse(
        x, wy + 2,
        v.baseW * 0.8, v.totalH * 0.18, 0x000000, 0.32,
      );
      this.shadow.setDepth((i + 0.5 + j + 0.5) * TILE_H - 0.5);
      this.container = scene.add.container(x, wy, this.buildConifer(scene, v));
    } else {
      const vIdx = ((i * 31 + j * 17) % DECID_VARIANTS.length + DECID_VARIANTS.length) % DECID_VARIANTS.length;
      const v = DECID_VARIANTS[vIdx];
      this.shadow = scene.add.ellipse(
        x, wy + 2,
        v.leafW * 0.9, v.leafH * 0.35, 0x000000, 0.32,
      );
      this.shadow.setDepth((i + 0.5 + j + 0.5) * TILE_H - 0.5);
      this.container = scene.add.container(x, wy, this.buildDeciduous(scene, v));
    }

    this.container.setDepth((i + 0.5 + j + 0.5) * TILE_H);
    this.applyStage();
  }

  private buildDeciduous(
    scene: Phaser.Scene,
    v: typeof DECID_VARIANTS[number],
  ): Phaser.GameObjects.GameObject[] {
    const trunk = scene.add.rectangle(0, -v.trunkH / 2, v.trunkW, v.trunkH, 0x5a3a1a);
    trunk.setStrokeStyle(1, 0x3a2410);
    const leavesShadow = scene.add.ellipse(2, -v.trunkH - v.leafH / 2 + 2, v.leafW, v.leafH, 0x000000, 0.18);
    const leaves = scene.add
      .ellipse(0, -v.trunkH - v.leafH / 2, v.leafW, v.leafH, v.leafColor)
      .setStrokeStyle(2, 0x183818);
    const highlight = scene.add.ellipse(
      -v.leafW * 0.18,
      -v.trunkH - v.leafH * 0.62,
      v.leafW * 0.45,
      v.leafH * 0.35,
      0x6cbf6c,
      0.55,
    );
    this.leaves = leaves;
    this.leavesShadow = leavesShadow;
    this.leavesHighlight = highlight;
    this.summerLeafColor = v.leafColor;
    const h = (this.i * 53 + this.j * 97) >>> 0;
    this.autumnColor = AUTUMN_COLORS[h % AUTUMN_COLORS.length];
    return [trunk, leavesShadow, leaves, highlight];
  }

  private buildConifer(
    scene: Phaser.Scene,
    v: typeof CONIFER_VARIANTS[number],
  ): Phaser.GameObjects.GameObject[] {
    const trunk = scene.add.rectangle(0, -v.trunkH / 2, v.trunkW, v.trunkH, 0x4a2a14);
    trunk.setStrokeStyle(1, 0x2a1408);
    const dark = (v.leafColor & 0xfefefe) >>> 1;
    const light = Math.min(
      0xffffff,
      ((v.leafColor & 0xff00ff) + 0x202020) | ((v.leafColor & 0x00ff00) + 0x2000),
    );
    const tiers = 3;
    const objs: Phaser.GameObjects.GameObject[] = [trunk];
    const baseY = -v.trunkH;
    const tierH = (v.totalH - v.trunkH) / tiers;
    for (let t = 0; t < tiers; t++) {
      const w = v.baseW * (1 - t * 0.22);
      const cy = baseY - tierH * (t + 0.5);
      const top = cy - tierH * 0.5;
      const left = -w / 2;
      const right = w / 2;
      const shadow = scene.add.triangle(
        2, 2,
        left, cy + tierH * 0.5,
        right, cy + tierH * 0.5,
        0, top,
        0x000000,
      );
      shadow.setAlpha(0.18);
      shadow.setOrigin(0, 0);
      const tri = scene.add.triangle(
        0, 0,
        left, cy + tierH * 0.5,
        right, cy + tierH * 0.5,
        0, top,
        v.leafColor,
      );
      tri.setStrokeStyle(1.2, dark);
      tri.setOrigin(0, 0);
      const highlight = scene.add.triangle(
        -w * 0.12, -1,
        left * 0.55, cy + tierH * 0.35,
        right * 0.05, cy + tierH * 0.35,
        -w * 0.05, top + tierH * 0.15,
        light,
      );
      highlight.setAlpha(0.5);
      highlight.setOrigin(0, 0);
      objs.push(shadow, tri, highlight);
    }
    return objs;
  }

  applySeason(season: Season): void {
    if (this.currentSeason === season) return;
    this.currentSeason = season;
    // Conifers (and not-yet-built leaves) stay as-is.
    if (!this.leaves || !this.leavesShadow || !this.leavesHighlight) return;
    const leaves = this.leaves;
    const shadow = this.leavesShadow;
    const hi = this.leavesHighlight;
    switch (season) {
      case "spring":
        leaves.setVisible(true);
        leaves.setFillStyle(SPRING_LEAF, 1);
        leaves.setStrokeStyle(2, 0x2a6a2a);
        shadow.setVisible(true);
        shadow.setAlpha(0.18);
        hi.setVisible(true);
        hi.setFillStyle(SPRING_HIGHLIGHT, 0.6);
        break;
      case "summer":
        leaves.setVisible(true);
        leaves.setFillStyle(this.summerLeafColor, 1);
        leaves.setStrokeStyle(2, 0x183818);
        shadow.setVisible(true);
        shadow.setAlpha(0.18);
        hi.setVisible(true);
        hi.setFillStyle(SUMMER_HIGHLIGHT, 0.55);
        break;
      case "autumn":
        leaves.setVisible(true);
        leaves.setFillStyle(this.autumnColor, 1);
        leaves.setStrokeStyle(2, 0x5a2a10);
        shadow.setVisible(true);
        shadow.setAlpha(0.18);
        hi.setVisible(true);
        hi.setFillStyle(0xffd58a, 0.45);
        break;
      case "winter":
        // Bare twigs: faint canopy outline only.
        leaves.setVisible(true);
        leaves.setFillStyle(WINTER_TWIG, 0.18);
        leaves.setStrokeStyle(1.4, WINTER_TWIG, 0.85);
        shadow.setVisible(false);
        hi.setVisible(false);
        break;
    }
  }

  setStage(stage: TreeStage): void {
    if (this.stage === stage) return;
    this.stage = stage;
    this.applyStage();
  }

  private applyStage(): void {
    const factor = STAGE_SCALE[this.stage];
    this.container.setScale(this.baseScale * factor);
    const shadowAlpha = this.stage === 4 ? 0.32 : 0.32 * factor;
    this.shadow.setAlpha(shadowAlpha);
    this.shadow.setScale(factor, factor);
  }

  fall(): void {
    this.alive = false;
    this.shadow.destroy();
    this.scene.tweens.add({
      targets: this.container,
      angle: 70,
      alpha: 0,
      y: this.container.y + 6,
      duration: 350,
      ease: "Cubic.easeIn",
      onComplete: () => this.container.destroy(),
    });
  }
}
