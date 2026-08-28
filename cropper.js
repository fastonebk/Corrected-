/* Cropper: an interactive, aspect-locked crop box drawn over an <img>.
 * Usage:
 *   const c = new Cropper(containerEl, imgEl, naturalW, naturalH, ASPECT_RATIO);
 *   c.setBoxNatural({x, y, w, h});      // set crop box in original image pixels
 *   c.getBoxNatural();                  // read crop box back in original image pixels
 *   c.onChange = (box) => { ... };      // fires on every drag/resize
 */
class Cropper {
  constructor(container, imgEl, naturalW, naturalH, aspect) {
    this.container = container;
    this.img = imgEl;
    this.naturalW = naturalW;
    this.naturalH = naturalH;
    this.aspect = aspect; // width / height
    this.onChange = null;

    this.container.innerHTML = "";
    this.container.appendChild(this.img);

    this.boxEl = document.createElement("div");
    this.boxEl.className = "crop-box";
    ["h-third-1", "h-third-2"].forEach((c) => {
      const g = document.createElement("div");
      g.className = "crop-guide " + c;
      this.boxEl.appendChild(g);
    });
    ["v-third-1", "v-third-2"].forEach((c) => {
      const g = document.createElement("div");
      g.className = "crop-guide " + c;
      this.boxEl.appendChild(g);
    });
    ["nw", "ne", "sw", "se"].forEach((corner) => {
      const h = document.createElement("div");
      h.className = "crop-handle handle-" + corner;
      h.dataset.corner = corner;
      this.boxEl.appendChild(h);
    });
    this.container.appendChild(this.boxEl);

    this._boxNatural = { x: 0, y: 0, w: naturalW, h: naturalH };

    this._bindEvents();

    // Recompute display <-> natural scale once the image has real layout size.
    if (this.img.complete) {
      this._layout();
    } else {
      this.img.addEventListener("load", () => this._layout());
    }
    window.addEventListener("resize", () => this._layout());
  }

  _scale() {
    const rect = this.img.getBoundingClientRect();
    return rect.width / this.naturalW || 1;
  }

  _layout() {
    this._render();
  }

  setBoxNatural(box) {
    this._boxNatural = this._clamp(box);
    this._render();
    if (this.onChange) this.onChange(this.getBoxNatural());
  }

  getBoxNatural() {
    return { ...this._boxNatural };
  }

  _clamp(box) {
    let { x, y, w, h } = box;
    if (w > this.naturalW) {
      w = this.naturalW;
      h = w / this.aspect;
    }
    if (h > this.naturalH) {
      h = this.naturalH;
      w = h * this.aspect;
    }
    // Re-lock aspect defensively.
    h = w / this.aspect;
    if (h > this.naturalH) {
      h = this.naturalH;
      w = h * this.aspect;
    }
    x = Math.max(0, Math.min(x, this.naturalW - w));
    y = Math.max(0, Math.min(y, this.naturalH - h));
    return { x, y, w, h };
  }

  _render() {
    const s = this._scale();
    const b = this._boxNatural;
    this.boxEl.style.left = b.x * s + "px";
    this.boxEl.style.top = b.y * s + "px";
    this.boxEl.style.width = b.w * s + "px";
    this.boxEl.style.height = b.h * s + "px";
  }

  _bindEvents() {
    let mode = null; // "move" | "nw" | "ne" | "sw" | "se"
    let start = null;

    const pointerDown = (e) => {
      const handle = e.target.closest(".crop-handle");
      mode = handle ? handle.dataset.corner : "move";
      const s = this._scale();
      start = {
        px: e.clientX,
        py: e.clientY,
        box: { ...this._boxNatural },
        scale: s,
      };
      e.preventDefault();
      window.addEventListener("pointermove", pointerMove);
      window.addEventListener("pointerup", pointerUp);
    };

    const pointerMove = (e) => {
      if (!mode) return;
      const s = start.scale || 1;
      const dx = (e.clientX - start.px) / s;
      const dy = (e.clientY - start.py) / s;
      let box = { ...start.box };

      if (mode === "move") {
        box.x = start.box.x + dx;
        box.y = start.box.y + dy;
      } else {
        // Corner resize: fix the opposite corner, resize by the dominant delta,
        // derive the other dimension from the locked aspect ratio.
        let newW = start.box.w;
        let newH = start.box.h;
        let anchorX, anchorY;

        if (mode === "se") {
          newW = start.box.w + dx;
          anchorX = start.box.x;
          anchorY = start.box.y;
        } else if (mode === "sw") {
          newW = start.box.w - dx;
          anchorX = start.box.x + start.box.w;
          anchorY = start.box.y;
        } else if (mode === "ne") {
          newW = start.box.w + dx;
          anchorX = start.box.x;
          anchorY = start.box.y + start.box.h;
        } else if (mode === "nw") {
          newW = start.box.w - dx;
          anchorX = start.box.x + start.box.w;
          anchorY = start.box.y + start.box.h;
        }

        newW = Math.max(30, newW);
        newH = newW / this.aspect;

        if (mode === "se") {
          box = { x: anchorX, y: anchorY, w: newW, h: newH };
        } else if (mode === "sw") {
          box = { x: anchorX - newW, y: anchorY, w: newW, h: newH };
        } else if (mode === "ne") {
          box = { x: anchorX, y: anchorY - newH, w: newW, h: newH };
        } else if (mode === "nw") {
          box = { x: anchorX - newW, y: anchorY - newH, w: newW, h: newH };
        }
      }

      this._boxNatural = this._clamp(box);
      this._render();
      if (this.onChange) this.onChange(this.getBoxNatural());
    };

    const pointerUp = () => {
      mode = null;
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
    };

    this.boxEl.addEventListener("pointerdown", pointerDown);
  }

  destroy() {
    window.removeEventListener("resize", this._layout);
  }
}
