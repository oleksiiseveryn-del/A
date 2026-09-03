/**
 * Skizzen-Editor: Zeichnen von Linien (Bauteilachsen) auf einem Raster-Canvas
 * mit Winkelfang und Maßstab-Kalibrierung.
 */
class SketchEditor {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onLineAdded = opts.onLineAdded || function () {};
    this.onCalibration = opts.onCalibration || function () {};

    this.lines = []; // { id, x1, y1, x2, y2 }
    this.nextId = 1;
    // Auflager und Knotenlasten werden über die Knotenkoordinate adressiert,
    // damit sie beim Neuaufbau der Knotenliste erhalten bleiben.
    this.supports = new Map(); // "x,y" -> "pinned" | "roller"
    this.loads = new Map();    // "x,y" -> { fx, fz }
    this.onNodePick = opts.onNodePick || function () {};
    this.nodeTolerance = 9;
    this.pixelsPerMeter = 50; // Standard: 50px = 1m, bis kalibriert
    this.gridOn = true;
    this.angleSnapOn = true;
    this.mode = "draw"; // "draw" | "calibrate"
    this.drawing = false;
    this.startPoint = null;
    this.currentPoint = null;
    this.selectedId = null;

    this._resize();
    window.addEventListener("resize", () => this._resize());

    canvas.addEventListener("mousedown", (e) => this._onDown(e));
    canvas.addEventListener("mousemove", (e) => this._onMove(e));
    canvas.addEventListener("mouseup", (e) => this._onUp(e));
    canvas.addEventListener("dblclick", (e) => this._onDoubleClick(e));
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.drawing = false;
        this.startPoint = null;
        this._render();
      }
    });
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = Math.max(rect.height, 420);
    this._render();
  }

  setMode(mode) {
    this.mode = mode;
    this.drawing = false;
    this.startPoint = null;
    this._render();
  }

  toggleGrid(on) {
    this.gridOn = on;
    this._render();
  }

  toggleAngleSnap(on) {
    this.angleSnapOn = on;
  }

  clearAll() {
    this.lines = [];
    this.supports.clear();
    this.loads.clear();
    this._render();
  }

  removeLine(id) {
    this.lines = this.lines.filter((l) => l.id !== id);
    this._render();
  }

  static nodeKey(x, y) {
    return `${Math.round(x)},${Math.round(y)}`;
  }

  /**
   * Baut aus den Linienendpunkten das Knotenmodell des Fachwerks auf.
   * Endpunkte innerhalb der Fangtoleranz werden zu einem Knoten verschmolzen.
   */
  buildModel() {
    const nodes = [];
    const findOrAddNode = (x, y) => {
      for (let i = 0; i < nodes.length; i++) {
        const dx = nodes[i].x - x;
        const dy = nodes[i].y - y;
        if (Math.sqrt(dx * dx + dy * dy) <= this.nodeTolerance) return i;
      }
      nodes.push({ x, y });
      return nodes.length - 1;
    };

    const bars = this.lines.map((line) => ({
      id: line.id,
      a: findOrAddNode(line.x1, line.y1),
      b: findOrAddNode(line.x2, line.y2),
    }));

    const supports = nodes.map((node) => this.supports.get(SketchEditor.nodeKey(node.x, node.y)));
    const loads = nodes.map((node) => this.loads.get(SketchEditor.nodeKey(node.x, node.y)) || null);

    return { nodes, bars, supports, loads };
  }

  /** Nächstgelegener Knoten zu einem Klickpunkt, sonst null. */
  findNodeAt(x, y) {
    const { nodes } = this.buildModel();
    let best = null;
    let bestDist = 14;
    nodes.forEach((node) => {
      const dist = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
      if (dist < bestDist) {
        bestDist = dist;
        best = node;
      }
    });
    return best;
  }

  setSupport(x, y, type) {
    const key = SketchEditor.nodeKey(x, y);
    if (type) this.supports.set(key, type);
    else this.supports.delete(key);
    this._render();
  }

  setLoad(x, y, load) {
    const key = SketchEditor.nodeKey(x, y);
    if (load && (load.fx || load.fz)) this.loads.set(key, load);
    else this.loads.delete(key);
    this._render();
  }

  getSupport(x, y) {
    return this.supports.get(SketchEditor.nodeKey(x, y));
  }

  getLoad(x, y) {
    return this.loads.get(SketchEditor.nodeKey(x, y));
  }

  /** Berechnete Stabkräfte für die Beschriftung übernehmen (kN, + = Zug). */
  setBarForces(forces) {
    this.lines.forEach((line) => {
      line.__force = forces && forces[line.id] !== undefined ? forces[line.id] : undefined;
    });
    this._render();
  }

  // Linie programmgesteuert anlegen (z. B. für das Startbeispiel)
  addLine(x1, y1, x2, y2) {
    const line = { id: this.nextId++, x1, y1, x2, y2 };
    this.lines.push(line);
    this._render();
    return line;
  }

  lengthOf(line) {
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const px = Math.sqrt(dx * dx + dy * dy);
    return px / this.pixelsPerMeter;
  }

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    if (this.gridOn) {
      const grid = 10;
      x = Math.round(x / grid) * grid;
      y = Math.round(y / grid) * grid;
    }
    return { x, y };
  }

  _snapAngle(start, point) {
    if (!this.angleSnapOn) return point;
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return point;
    let angle = Math.atan2(dy, dx);
    const step = Math.PI / 12; // 15°
    angle = Math.round(angle / step) * step;
    return {
      x: start.x + Math.cos(angle) * dist,
      y: start.y + Math.sin(angle) * dist,
    };
  }

  _onDown(e) {
    const pos = this._getPos(e);

    // In den Modellier-Modi wird nicht gezeichnet, sondern ein Knoten gewählt
    if (this.mode === "support" || this.mode === "load") {
      const node = this.findNodeAt(pos.x, pos.y);
      if (node) this.onNodePick(this.mode, node);
      return;
    }

    if (!this.drawing) {
      this.drawing = true;
      this.startPoint = pos;
      this.currentPoint = pos;
    } else {
      const end = this._snapAngle(this.startPoint, pos);
      this._finishLine(this.startPoint, end);
      this.drawing = false;
      this.startPoint = null;
    }
    this._render();
  }

  _onMove(e) {
    if (this.mode === "support" || this.mode === "load") return;
    if (!this.drawing) return;
    this.currentPoint = this._snapAngle(this.startPoint, this._getPos(e));
    this._render();
  }

  _onUp() {
    // Klick-Klick-Modus (kein Drag nötig); nichts zu tun
  }

  _onDoubleClick() {
    this.drawing = false;
    this.startPoint = null;
    this._render();
  }

  _finishLine(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (Math.sqrt(dx * dx + dy * dy) < 5) return; // zu kurz, ignorieren

    if (this.mode === "calibrate") {
      const pixelDist = Math.sqrt(dx * dx + dy * dy);
      this.onCalibration(pixelDist, (realMeters) => {
        if (realMeters && realMeters > 0) {
          this.pixelsPerMeter = pixelDist / realMeters;
        }
        this.mode = "draw";
        this._render();
      });
      return;
    }

    const line = { id: this.nextId++, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    this.lines.push(line);
    this.onLineAdded(line, this.lengthOf(line));
  }

  _render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Hintergrund
    ctx.fillStyle = "#0f2438";
    ctx.fillRect(0, 0, w, h);

    // Raster
    if (this.gridOn) {
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      const step = 10;
      for (let x = 0; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // Meterlinien hervorheben
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      for (let x = 0; x < w; x += this.pixelsPerMeter) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += this.pixelsPerMeter) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }

    // Bestehende Linien
    this.lines.forEach((line) => {
      const isSelected = line.id === this.selectedId;
      ctx.strokeStyle = isSelected ? "#ffb020" : "#5ec8f8";
      ctx.lineWidth = isSelected ? 4 : 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();

      // Endpunkte
      [[line.x1, line.y1], [line.x2, line.y2]].forEach(([x, y]) => {
        ctx.fillStyle = "#5ec8f8";
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Länge beschriften - senkrecht zur Stabachse versetzt, damit sich
      // Beschriftungen sich kreuzender Stäbe nicht überlagern
      const dx = line.x2 - line.x1;
      const dy = line.y2 - line.y1;
      const len = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const offset = 14;
      const midX = (line.x1 + line.x2) / 2 + (-dy / len) * offset;
      const midY = (line.y1 + line.y2) / 2 + (dx / len) * offset;
      // Solange keine Stabkräfte vorliegen, ist die Länge die wichtigere
      // Information; danach tritt die Stabkraft an ihre Stelle, damit die
      // Beschriftungen eng benachbarter Stäbe nicht überlappen.
      const hasForce = typeof line.__force === "number";
      const name = line.__label || "#" + line.id;
      const label = hasForce ? name : `${name} · ${this.lengthOf(line).toFixed(2)} m`;

      ctx.font = "11px 'IBM Plex Mono', Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const forceLabel = hasForce
        ? `${line.__force >= 0 ? "+" : "−"}${Math.abs(line.__force).toFixed(1)} kN`
        : null;
      const boxWidth = Math.max(
        ctx.measureText(label).width,
        forceLabel ? ctx.measureText(forceLabel).width : 0
      );
      const boxHeight = forceLabel ? 32 : 18;
      ctx.fillStyle = "rgba(15, 36, 56, 0.82)";
      ctx.fillRect(midX - boxWidth / 2 - 4, midY - boxHeight / 2, boxWidth + 8, boxHeight);
      ctx.fillStyle = "#e8f4fc";
      ctx.fillText(label, midX, forceLabel ? midY - 7 : midY);
      if (forceLabel) {
        ctx.fillStyle = line.__force >= 0 ? "#7fe0a5" : "#ffb020";
        ctx.fillText(forceLabel, midX, midY + 8);
      }
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    });

    // Auflager- und Lastsymbole
    this._renderSupportsAndLoads();

    // Aktuelle Rubberband-Linie
    if (this.drawing && this.startPoint && this.currentPoint) {
      const dx = this.currentPoint.x - this.startPoint.x;
      const dy = this.currentPoint.y - this.startPoint.y;
      const length = (Math.sqrt(dx * dx + dy * dy) / this.pixelsPerMeter).toFixed(2);
      ctx.strokeStyle = this.mode === "calibrate" ? "#ff5050" : "#ffffff";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.startPoint.x, this.startPoint.y);
      ctx.lineTo(this.currentPoint.x, this.currentPoint.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`${length} m`, this.currentPoint.x + 8, this.currentPoint.y - 8);
    }
  }

  _renderSupportsAndLoads() {
    const ctx = this.ctx;
    const { nodes, supports, loads } = this.buildModel();

    nodes.forEach((node, i) => {
      const support = supports[i];
      if (support) {
        // Auflagerdreieck; beim Loslager zusätzlich die Rollenlinie
        ctx.fillStyle = "#ffb020";
        ctx.beginPath();
        ctx.moveTo(node.x, node.y + 2);
        ctx.lineTo(node.x - 9, node.y + 18);
        ctx.lineTo(node.x + 9, node.y + 18);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#ffb020";
        ctx.lineWidth = 2;
        if (support === "roller") {
          ctx.beginPath();
          ctx.moveTo(node.x - 12, node.y + 23);
          ctx.lineTo(node.x + 12, node.y + 23);
          ctx.stroke();
        } else {
          // Festlager: Schraffur
          for (let k = -9; k <= 9; k += 6) {
            ctx.beginPath();
            ctx.moveTo(node.x + k, node.y + 18);
            ctx.lineTo(node.x + k - 5, node.y + 25);
            ctx.stroke();
          }
        }
      }

      const load = loads[i];
      if (load && (load.fz || load.fx)) {
        ctx.strokeStyle = "#ff5f5f";
        ctx.fillStyle = "#ff5f5f";
        ctx.lineWidth = 2;
        if (load.fz) {
          // Vertikalpfeil: positiv = nach unten
          const dir = load.fz > 0 ? 1 : -1;
          const tail = node.y - dir * 34;
          ctx.beginPath();
          ctx.moveTo(node.x, tail);
          ctx.lineTo(node.x, node.y - dir * 8);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(node.x, node.y - dir * 2);
          ctx.lineTo(node.x - 5, node.y - dir * 12);
          ctx.lineTo(node.x + 5, node.y - dir * 12);
          ctx.closePath();
          ctx.fill();
          ctx.font = "11px 'IBM Plex Mono', Consolas, monospace";
          ctx.textAlign = "center";
          ctx.fillText(`${Math.abs(load.fz)} kN`, node.x, tail - dir * 6 + (dir > 0 ? 0 : 12));
          ctx.textAlign = "start";
        }
        if (load.fx) {
          const dir = load.fx > 0 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(node.x - dir * 34, node.y);
          ctx.lineTo(node.x - dir * 8, node.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(node.x - dir * 2, node.y);
          ctx.lineTo(node.x - dir * 12, node.y - 5);
          ctx.lineTo(node.x - dir * 12, node.y + 5);
          ctx.closePath();
          ctx.fill();
        }
      }
    });
  }

  setLineLabel(id, label) {
    const line = this.lines.find((l) => l.id === id);
    if (line) {
      line.__label = label;
      this._render();
    }
  }

  setSelected(id) {
    this.selectedId = id;
    this._render();
  }
}
