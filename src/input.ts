export class Input {
  keys = new Set<string>();
  private pressed = new Set<string>();

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  down(code: string) { return this.keys.has(code); }
  any(...codes: string[]) { return codes.some((c) => this.keys.has(c)); }
  /** True only on the frame the key was pressed. */
  justPressed(code: string) { return this.pressed.has(code); }

  /** -1..1 throttle (W/S or arrows). */
  get throttle() { return (this.any("KeyW", "ArrowUp") ? 1 : 0) - (this.any("KeyS", "ArrowDown") ? 1 : 0); }
  /** -1..1 steer, positive is left (the physics convention: positive yaw = counter-clockwise from above). */
  get steer() { return (this.any("KeyA", "ArrowLeft") ? 1 : 0) - (this.any("KeyD", "ArrowRight") ? 1 : 0); }
  get handbrake() { return this.down("Space"); }
  get nitro() { return this.any("ShiftLeft", "ShiftRight"); }

  endFrame() { this.pressed.clear(); }
}
