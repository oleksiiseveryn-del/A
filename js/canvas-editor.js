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
    this._render();
  }

  removeLine(id) {
    this.lines = this.lines.filter((l) => l.id !== id);
    this._render();
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

      // Länge beschriften
      const midX = (line.x1 + line.x2) / 2;
      const midY = (line.y1 + line.y2) / 2;
      const length = this.lengthOf(line).toFixed(2);
      ctx.fillStyle = "#e8f4fc";
      ctx.font = "12px 'Segoe UI', Arial, sans-serif";
      ctx.fillText(`${line.__label || "#" + line.id} · ${length} m`, midX + 6, midY - 6);
    });

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
