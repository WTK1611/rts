import Phaser from "phaser";
import { gridToScreen, TILE_H } from "./iso";

export class Fish {
  scene: Phaser.Scene;
  i: number;
  j: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  private bobTween: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, i: number, j: number) {
    this.scene = scene;
    this.i = i;
    this.j = j;

    const seed = (i * 67 + j * 29) >>> 0;
    const flip = (seed & 1) ? -1 : 1;
    const tone = (seed >> 3) & 0x3;
    const bodyColor = tone === 0 ? 0xc8b65a : tone === 1 ? 0x9aa8b8 : tone === 2 ? 0xc28a4a : 0xb0c0d0;
    const finColor = bodyColor === 0xc8b65a ? 0x6a5a20 : 0x4a5a72;
    const { x, y } = gridToScreen(i + 0.5, j + 0.5);

    this.shadow = scene.add.ellipse(x, y + TILE_H / 2 + 1, 12, 4, 0x10283c, 0.45);
    this.shadow.setDepth((i + 0.5 + j + 0.5) * TILE_H - 0.5);

    const body = scene.add.ellipse(0, 0, 10 * flip, 4, bodyColor)
      .setStrokeStyle(0.6, 0x1c2a3a, 0.6);
    const tail = scene.add.triangle(
      6 * flip, 0,
      0, 0,
      4 * flip, -3,
      4 * flip, 3,
      finColor,
    );
    const eye = scene.add.circle(-3 * flip, -0.5, 0.7, 0x101010);
    const hi = scene.add.ellipse(-1 * flip, -1, 4, 1.2, 0xffffff, 0.4);

    this.container = scene.add.container(x, y + TILE_H / 2, [tail, body, eye, hi]);
    this.container.setDepth((i + 0.5 + j + 0.5) * TILE_H);

    this.bobTween = scene.tweens.add({
      targets: this.container,
      y: this.container.y + 1.5,
      x: this.container.x + (seed & 2 ? 1.5 : -1.5),
      duration: 1400 + (seed % 800),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  remove(): void {
    this.bobTween.stop();
    this.shadow.destroy();
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      y: this.container.y + 4,
      duration: 250,
      ease: "Cubic.easeIn",
      onComplete: () => this.container.destroy(),
    });
  }
}
