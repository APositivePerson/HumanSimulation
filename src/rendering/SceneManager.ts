import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { HumanRenderer } from "./HumanRenderer";
import type { MuJoCoEngine } from "../physics/MuJoCoEngine";
export class SceneManager {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(38, 1, 0.01, 100);
  readonly renderer: T.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly human: HumanRenderer;
  readonly axes = new T.AxesHelper(0.5);
  private observer: ResizeObserver;
  private lastRoot = new T.Vector3();
  constructor(
    readonly host: HTMLElement,
    readonly engine: MuJoCoEngine,
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.camera.up.set(0, 0, 1);
    this.scene.background = new T.Color("#edf2f3");
    this.scene.add(new T.HemisphereLight(0xffffff, 0x61727a, 2.6));
    const light = new T.DirectionalLight(0xffffff, 3);
    light.position.set(2, -3, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -2;
    light.shadow.camera.right = 2;
    light.shadow.camera.top = 3;
    light.shadow.camera.bottom = -2;
    this.scene.add(light);
    const floor = new T.Mesh(
      new T.PlaneGeometry(200, 200),
      new T.MeshStandardMaterial({ color: 0xe6ecee, roughness: 1 }),
    );
    floor.position.z = -0.002;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const grid = new T.GridHelper(6, 30, 0xb2c5c9, 0xd1dde0);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.001;
    this.scene.add(grid, this.axes);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 7;
    this.controls.maxPolarAngle = Math.PI * 0.94;
    this.lastRoot.fromArray(engine.data.xpos, 3);
    this.home();
    this.human = new HumanRenderer(engine);
    this.scene.add(this.human.group);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }
  home() {
    const x = this.engine.data.xpos[3],
      y = this.engine.data.xpos[4];
    this.camera.position.set(x + 2, y - 3, 2);
    this.controls.target.set(x, y, 1);
    this.controls.update();
  }
  resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
  render() {
    const x = this.engine.data.xpos[3],
      y = this.engine.data.xpos[4];
    const dx = x - this.lastRoot.x,
      dy = y - this.lastRoot.y;
    this.camera.position.x += dx;
    this.camera.position.y += dy;
    this.controls.target.x += dx;
    this.controls.target.y += dy;
    this.lastRoot.set(x, y, this.engine.data.xpos[5]);
    this.human.sync();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.observer.disconnect();
    this.controls.dispose();
    this.human.dispose();
    this.scene.traverse((o) => {
      if (o instanceof T.DirectionalLight) o.shadow.dispose();
      if (o instanceof T.Mesh || o instanceof T.Line) {
        o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
