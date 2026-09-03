/**
 * Räumliche Ansicht (three.js) - wird zweimal verwendet:
 * links als Skizzenfenster mit Arbeitsebene, rechts als Stahlbaumodell
 * mit den bemessenen Profilen. Beide Ansichten teilen sich denselben
 * Kamerastand, sodass das Modell die Skizze spiegelt.
 *
 * Koordinaten: x nach rechts, y nach oben, z nach vorne (Meter).
 */
class Scene3D {
  constructor(container, options) {
    this.container = container;
    this.options = options || {};
    this.onCameraChange = this.options.onCameraChange || function () {};
    this.onPlanePick = this.options.onPlanePick || function () {};
    this.onNodePick = this.options.onNodePick || function () {};
    this.interactive = this.options.interactive !== false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.background || 0x0f2438);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Kamerastand in Kugelkoordinaten um den Zielpunkt
    this.view = { target: new THREE.Vector3(0, 1.5, 0), azimuth: -0.9, elevation: 0.35, distance: 18 };

    this._buildLights();
    this._buildHelpers();

    this.contentGroup = new THREE.Group();
    this.scene.add(this.contentGroup);
    this.overlayGroup = new THREE.Group();
    this.scene.add(this.overlayGroup);

    this.workPlane = { axis: "XY", offset: 0 };
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.snapPoints = []; // {x,y,z} vorhandene Knoten für den Punktfang

    this._bindEvents();
    this.resize();
    this._applyCamera();
  }

  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xdceaf5, 0x2a3946, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(6, 12, 8);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd6ea, 0.35);
    fill.position.set(-8, 5, -6);
    this.scene.add(fill);
  }

  _buildHelpers() {
    // Bodenraster im Meterabstand
    this.grid = new THREE.GridHelper(40, 40, 0x3d6a8f, 0x22405a);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.55;
    this.scene.add(this.grid);

    // Koordinatenachsen: x rot, y grün, z blau
    const axes = new THREE.Group();
    [[new THREE.Vector3(2, 0, 0), 0xff6b6b], [new THREE.Vector3(0, 2, 0), 0x7fe0a5], [new THREE.Vector3(0, 0, 2), 0x5ec8f8]]
      .forEach(([dir, color]) => {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), dir]);
        axes.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
      });
    this.scene.add(axes);

    this.planeHelper = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshBasicMaterial({ color: 0x5ec8f8, transparent: true, opacity: 0.04, side: THREE.DoubleSide, depthWrite: false })
    );
    this.scene.add(this.planeHelper);
    this.setWorkPlane("XY", 0);
  }

  /** Arbeitsebene festlegen: XY (Ansicht), XZ (Grundriss) oder ZY (Seitenansicht). */
  setWorkPlane(axis, offset) {
    this.workPlane = { axis, offset: offset || 0 };
    const p = this.planeHelper;
    p.rotation.set(0, 0, 0);
    p.position.set(0, 0, 0);
    if (axis === "XY") {
      p.position.z = this.workPlane.offset;
      p.position.y = 5;
    } else if (axis === "XZ") {
      p.rotation.x = -Math.PI / 2;
      p.position.y = this.workPlane.offset;
    } else {
      p.rotation.y = Math.PI / 2;
      p.position.x = this.workPlane.offset;
      p.position.y = 5;
    }
    p.visible = this.interactive;
    this.render();
  }

  /** Schnittpunkt des Mausstrahls mit der Arbeitsebene, in Metern. */
  pointOnWorkPlane(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const { axis, offset } = this.workPlane;
    const normal = axis === "XY" ? new THREE.Vector3(0, 0, 1)
      : axis === "XZ" ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const plane = new THREE.Plane(normal, -offset);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  /** Nächstgelegener vorhandener Knoten im Bildschirmumkreis, sonst null. */
  nearestSnapPoint(event, pixelRadius) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    let best = null;
    let bestDist = pixelRadius || 14;

    this.snapPoints.forEach((p) => {
      const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
      if (v.z > 1) return; // hinter der Kamera
      const sx = (v.x * 0.5 + 0.5) * rect.width;
      const sy = (-v.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bestDist) { bestDist = d; best = p; }
    });
    return best;
  }

  _bindEvents() {
    const el = this.renderer.domElement;
    let dragging = false;
    let moved = false;
    let last = { x: 0, y: 0 };
    let button = 0;

    el.addEventListener("contextmenu", (e) => e.preventDefault());

    el.addEventListener("pointerdown", (e) => {
      dragging = true;
      moved = false;
      button = e.button;
      last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener("pointermove", (e) => {
      if (dragging) {
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        last = { x: e.clientX, y: e.clientY };

        // Zeichnen mit links: nur die rechte Maustaste bzw. der Navigationsmodus dreht
        const orbiting = button === 2 || button === 1 || !this.interactive || this.mode === "orbit";
        if (orbiting) {
          this.view.azimuth -= dx * 0.006;
          this.view.elevation = Math.max(-1.45, Math.min(1.45, this.view.elevation + dy * 0.006));
          this._applyCamera();
          this.onCameraChange(this.getCameraState());
        } else if (e.shiftKey) {
          this._pan(dx, dy);
        }
      } else if (this.interactive && this.options.onHover) {
        this.options.onHover(e);
      }
    });

    el.addEventListener("pointerup", (e) => {
      dragging = false;
      el.releasePointerCapture(e.pointerId);
      if (!moved && e.button === 0 && this.interactive) {
        const snap = this.nearestSnapPoint(e, 14);
        if (snap) this.onNodePick(snap, e);
        else {
          const point = this.pointOnWorkPlane(e);
          if (point) this.onPlanePick(point, e);
        }
      }
    });

    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.view.distance = Math.max(1.5, Math.min(120, this.view.distance * (1 + Math.sign(e.deltaY) * 0.12)));
      this._applyCamera();
      this.onCameraChange(this.getCameraState());
    }, { passive: false });
  }

  _pan(dx, dy) {
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.camera.matrix.extractBasis(right, up, new THREE.Vector3());
    const scale = this.view.distance * 0.0015;
    this.view.target.addScaledVector(right, -dx * scale);
    this.view.target.addScaledVector(up, dy * scale);
    this._applyCamera();
    this.onCameraChange(this.getCameraState());
  }

  _applyCamera() {
    const { target, azimuth, elevation, distance } = this.view;
    this.camera.position.set(
      target.x + distance * Math.cos(elevation) * Math.cos(azimuth),
      target.y + distance * Math.sin(elevation),
      target.z + distance * Math.cos(elevation) * Math.sin(azimuth)
    );
    this.camera.lookAt(target);
    this.camera.updateMatrix();
    this.render();
  }

  getCameraState() {
    return {
      azimuth: this.view.azimuth,
      elevation: this.view.elevation,
      distance: this.view.distance,
      target: this.view.target.clone(),
    };
  }

  setCameraState(state) {
    this.view.azimuth = state.azimuth;
    this.view.elevation = state.elevation;
    this.view.distance = state.distance;
    this.view.target.copy(state.target);
    this._applyCamera();
  }

  /** Kamera so setzen, dass das gesamte Modell im Bild liegt. */
  frameContent(points) {
    if (!points || !points.length) return;
    const box = new THREE.Box3();
    points.forEach((p) => box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z)));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.view.target.copy(center);
    this.view.distance = Math.max(6, size * 1.5);
    this._applyCamera();
    this.onCameraChange(this.getCameraState());
  }

  clearContent() {
    [this.contentGroup, this.overlayGroup].forEach((group) => {
      while (group.children.length) {
        const child = group.children.pop();
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      }
    });
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(rect.width, 200);
    const h = Math.max(rect.height, 200);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

/* --- Bausteine für den Inhalt der beiden Ansichten --- */

/** Orientierungsmatrix eines Stabes: lokale z-Achse entlang der Stabachse. */
function memberOrientation(from, to) {
  const start = new THREE.Vector3(from.x, from.y, from.z);
  const end = new THREE.Vector3(to.x, to.y, to.z);
  const dir = end.clone().sub(start);
  const length = dir.length();
  dir.normalize();

  // Der Steg soll möglichst senkrecht stehen: lokale x-Achse quer zur Lotrechten
  let xAxis = new THREE.Vector3(0, 1, 0).cross(dir);
  if (xAxis.lengthSq() < 1e-6) xAxis = new THREE.Vector3(1, 0, 0);
  xAxis.normalize();
  const yAxis = dir.clone().cross(xAxis).normalize();

  const matrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, dir);
  matrix.setPosition(start);
  return { matrix, length };
}

/** Stab als Linie mit Kugelknoten (Skizzenfenster). */
function buildSketchMember(from, to, color, radius) {
  const { matrix, length } = memberOrientation(from, to);
  const geo = new THREE.CylinderGeometry(radius, radius, length, 10);
  geo.rotateX(Math.PI / 2);             // Zylinderachse auf +z drehen
  geo.translate(0, 0, length / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 }));
  mesh.applyMatrix4(matrix);
  return mesh;
}

/** Bemessenes Profil als extrudierter Körper (Stahlbaufenster). */
function buildProfileSolid(from, to, family, profile, color, exaggeration) {
  const { matrix, length } = memberOrientation(from, to);
  const section = sectionProfile(family, profile);
  // mm -> m; die Ueberhoehung vergroessert allein den Querschnitt, nicht die Laenge
  const scale = 0.001 * (exaggeration || 1);

  let geo;
  if (section.round) {
    const outer = new THREE.Shape();
    outer.absarc(0, 0, (section.d / 2) * scale, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, (section.d / 2 - section.t) * scale, 0, Math.PI * 2, true);
    outer.holes.push(hole);
    geo = new THREE.ExtrudeGeometry(outer, { depth: length, bevelEnabled: false, curveSegments: 20 });
  } else {
    const shapes = [];
    const toShape = (points) => {
      const shape = new THREE.Shape();
      points.forEach(([x, y], i) => {
        if (i === 0) shape.moveTo(x * scale, y * scale);
        else shape.lineTo(x * scale, y * scale);
      });
      shape.closePath();
      return shape;
    };
    const main = toShape(section.outline);
    (section.holes || []).forEach((h) => {
      const path = new THREE.Path();
      h.forEach(([x, y], i) => {
        if (i === 0) path.moveTo(x * scale, y * scale);
        else path.lineTo(x * scale, y * scale);
      });
      path.closePath();
      main.holes.push(path);
    });
    shapes.push(main);
    (section.extra || []).forEach((pts) => shapes.push(toShape(pts)));
    geo = new THREE.ExtrudeGeometry(shapes, { depth: length, bevelEnabled: false });
  }

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color, roughness: 0.45, metalness: 0.55, flatShading: false,
  }));
  mesh.applyMatrix4(matrix);
  return mesh;
}

/** Auflagersymbol: Pyramide unter dem Knoten. */
function buildSupport(node, type) {
  const color = type === "pinned" ? 0xffb020 : 0xf0c674;
  const geo = new THREE.ConeGeometry(0.22, 0.42, type === "pinned" ? 4 : 12);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  mesh.position.set(node.x, node.y - 0.24, node.z);
  mesh.rotation.x = Math.PI;
  return mesh;
}

/** Lastpfeil nach unten über dem Knoten. */
function buildLoadArrow(node, kN, scale) {
  const group = new THREE.Group();
  const length = Math.min(2.2, Math.max(0.5, Math.abs(kN) * (scale || 0.02)));
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, length, 8),
    new THREE.MeshStandardMaterial({ color: 0xff5f5f })
  );
  shaft.position.set(node.x, node.y + length / 2 + 0.18, node.z);
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.22, 12),
    new THREE.MeshStandardMaterial({ color: 0xff5f5f })
  );
  head.position.set(node.x, node.y + 0.16, node.z);
  head.rotation.x = Math.PI;
  group.add(shaft, head);
  return group;
}

/** Knotenkugel. */
function buildNodeMarker(node, color, radius) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius || 0.07, 12, 10),
    new THREE.MeshStandardMaterial({ color: color || 0x5ec8f8, roughness: 0.4 })
  );
  mesh.position.set(node.x, node.y, node.z);
  return mesh;
}

/** Textmarke als Sprite (Beschriftung im Raum). */
function buildLabel(text, position, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(15,36,56,0.85)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "500 30px 'IBM Plex Mono', monospace";
  ctx.fillStyle = color || "#e8f4fc";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.position.set(position.x, position.y, position.z);
  sprite.scale.set(1.1, 0.28, 1);
  return sprite;
}

/**
 * Architektur-Bauteil als Quader.
 *  - linie:   Wand bzw. Streifenfundament entlang der Achse p1→p2
 *  - flaeche: Platte über dem aufgezogenen Rechteck
 *  - punkt:   Einzelfundament unter dem Punkt
 */
function buildArchElement(element, geo, color, opacity, openings) {
  const typ = BAUTEILTYPEN[element.kind];
  const material = new THREE.MeshStandardMaterial({
    color, roughness: 0.85, metalness: 0.05,
    transparent: opacity !== undefined && opacity < 1,
    opacity: opacity === undefined ? 1 : opacity,
  });

  if (typ.form === "linie") {
    const p1 = element.p1, p2 = element.p2;
    const dx = p2.x - p1.x, dz = p2.z - p1.z;
    const laenge = Math.hypot(dx, dz) || Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
    const hoehe = geo.hoehe;
    const dicke = geo.dicke;

    // Wand mit Öffnungen: Umriss als Fläche mit Aussparungen extrudieren
    if (openings && openings.length && !typ.unterGelaende) {
      return buildWallWithOpenings(element, geo, material, openings, laenge, hoehe, dicke);
    }

    const box = new THREE.BoxGeometry(laenge, hoehe, dicke);
    const mesh = new THREE.Mesh(box, material);
    // Fundamente liegen unter Gelände, Wände stehen auf der Ebene
    const yMitte = typ.unterGelaende ? p1.y - hoehe / 2 : p1.y + hoehe / 2;
    mesh.position.set((p1.x + p2.x) / 2, yMitte, (p1.z + p2.z) / 2);
    mesh.rotation.y = -Math.atan2(dz, dx);
    return mesh;
  }

  if (typ.form === "flaeche") {
    const box = new THREE.BoxGeometry(geo.laenge, geo.dicke, geo.breite);
    const mesh = new THREE.Mesh(box, material);
    mesh.position.set(
      (element.p1.x + element.p2.x) / 2,
      element.p1.y - geo.dicke / 2, // Platte hängt unter der Arbeitsebene
      (element.p1.z + element.p2.z) / 2
    );
    return mesh;
  }

  const box = new THREE.BoxGeometry(geo.laenge, geo.dicke, geo.breite);
  const mesh = new THREE.Mesh(box, material);
  mesh.position.set(element.p1.x, element.p1.y - geo.dicke / 2, element.p1.z);
  return mesh;
}

/** Farbe eines Bauteils aus dem Baustoff der dicksten Schicht. */
function archElementColor(element) {
  let dickste = null;
  element.layers.forEach((l) => { if (!dickste || l.d > dickste.d) dickste = l; });
  const stoff = dickste ? BAUSTOFFE[dickste.material] : null;
  return stoff ? (GRUPPEN_FARBE[stoff.gruppe] || 0x9aa5ad) : 0x9aa5ad;
}


/** Wandkörper mit ausgeschnittenen Öffnungen und eingesetzten Füllungen. */
function buildWallWithOpenings(element, geo, material, openings, laenge, hoehe, dicke) {
  const gruppe = new THREE.Group();
  // Positionen kommen aus derselben Quelle wie die Tabelle
  const alle = oeffnungsPositionen(openings, laenge, hoehe).felder;
  // Nur Öffnungen zeichnen, die vollständig in der Wandfläche liegen
  const felder = alle.filter((f) => f.x0 >= 0 && f.x0 + f.b <= laenge && f.y0 >= 0 && f.y0 + f.h <= hoehe && f.b > 0 && f.h > 0);

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(laenge, 0);
  shape.lineTo(laenge, hoehe);
  shape.lineTo(0, hoehe);
  shape.closePath();

  felder.forEach((f) => {
    const loch = new THREE.Path();
    loch.moveTo(f.x0, f.y0);
    loch.lineTo(f.x0 + f.b, f.y0);
    loch.lineTo(f.x0 + f.b, f.y0 + f.h);
    loch.lineTo(f.x0, f.y0 + f.h);
    loch.closePath();
    shape.holes.push(loch);
  });

  gruppe.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: dicke, bevelEnabled: false }), material));

  // Füllungen: Glas bläulich, Türen und Tore in Holz-/Metallton
  felder.forEach((f) => {
    const art = OEFFNUNGSTYPEN[f.typ] ? OEFFNUNGSTYPEN[f.typ].art : "Fenster";
    const fuellung = new THREE.MeshStandardMaterial({
      color: art === "Fenster" ? 0x8fd3f4 : art === "Tür" ? 0x8a6b4a : 0xb7c2cb,
      transparent: art === "Fenster",
      opacity: art === "Fenster" ? 0.45 : 1,
      roughness: art === "Fenster" ? 0.1 : 0.7,
      metalness: art === "Fenster" ? 0.2 : 0.3,
    });
    const pane = new THREE.Mesh(new THREE.BoxGeometry(f.b, f.h, 0.04), fuellung);
    pane.position.set(f.x0 + f.b / 2, f.y0 + f.h / 2, dicke / 2);
    gruppe.add(pane);
  });

  // Wandkoordinaten in die Modellkoordinaten drehen
  const p1 = element.p1, p2 = element.p2;
  let dir = new THREE.Vector3(p2.x - p1.x, 0, p2.z - p1.z);
  if (dir.lengthSq() < 1e-9) dir = new THREE.Vector3(1, 0, 0);
  dir.normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3().crossVectors(dir, up).normalize();

  const matrix = new THREE.Matrix4().makeBasis(dir, up, normal);
  matrix.setPosition(p1.x - normal.x * dicke / 2, p1.y, p1.z - normal.z * dicke / 2);
  gruppe.applyMatrix4(matrix);
  return gruppe;
}
