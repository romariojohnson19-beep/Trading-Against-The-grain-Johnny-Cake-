/* Wingman screenshot editor: Hide (solid black box), Blur (pixelate), Crop, Undo.
 * Works on touch and mouse. Nothing is uploaded from here; it returns an edited JPEG File.
 *
 *   const edited = await WingmanEditor.open(file);   // File, or null if cancelled
 *
 * Saving through a canvas also drops hidden photo data such as location.
 * For account numbers use Hide, not Blur: a solid box can't be undone by anyone.
 */
(function () {
  const MAX = 2000; // longest side while editing

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function copyCanvas(src) {
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    c.getContext("2d").drawImage(src, 0, 0);
    return c;
  }

  function open(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that image"));
      };
      img.onload = () => {
        URL.revokeObjectURL(url);
        start(img);
      };
      img.src = url;

      function start(img) {
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        let work = document.createElement("canvas");
        work.width = Math.round(img.naturalWidth * scale);
        work.height = Math.round(img.naturalHeight * scale);
        work.getContext("2d").drawImage(img, 0, 0, work.width, work.height);
        const history = [];
        let tool = "hide";
        let drag = null; // {x0,y0,x1,y1}

        const dlg = el("dialog", "wr wr-editor");
        dlg.setAttribute("aria-label", "Edit screenshot");
        dlg.appendChild(
          el(
            "p",
            "wr-ed-help",
            "Drag over anything private to cover it. Use Hide for account numbers (solid black). Blur is a pixelation for less sensitive spots. Crop trims the edges."
          )
        );

        const tools = el("div", "wr-ed-tools");
        tools.setAttribute("role", "radiogroup");
        tools.setAttribute("aria-label", "Tool");
        [["hide", "Hide"], ["blur", "Blur"], ["crop", "Crop"]].forEach(([v, label]) => {
          const l = el("label");
          const i = el("input");
          i.type = "radio";
          i.name = "wr-ed-tool";
          i.value = v;
          i.checked = v === "hide";
          i.addEventListener("change", () => (tool = v));
          l.appendChild(i);
          l.appendChild(el("span", null, label));
          tools.appendChild(l);
        });
        dlg.appendChild(tools);

        const wrap = el("div", "wr-ed-canvaswrap");
        const view = el("canvas");
        wrap.appendChild(view);
        dlg.appendChild(wrap);

        const actions = el("div", "wr-ed-actions");
        const undo = el("button", "wr-btn ghost", "Undo");
        const cancel = el("button", "wr-btn ghost", "Cancel");
        const done = el("button", "wr-btn", "Done");
        [undo, cancel, done].forEach((b) => (b.type = "button"));
        undo.disabled = true;
        actions.append(undo, cancel, done);
        dlg.appendChild(actions);

        function draw() {
          if (view.width !== work.width || view.height !== work.height) {
            view.width = work.width;
            view.height = work.height;
          }
          const ctx = view.getContext("2d");
          ctx.drawImage(work, 0, 0);
          if (drag) {
            const r = rectOf(drag);
            ctx.save();
            ctx.fillStyle = tool === "crop" ? "rgba(34,197,94,0.15)" : "rgba(0,0,0,0.55)";
            ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.lineWidth = Math.max(2, work.width / 400);
            ctx.strokeStyle = tool === "crop" ? "#22c55e" : "#f87171";
            ctx.setLineDash([8, 6]);
            ctx.strokeRect(r.x, r.y, r.w, r.h);
            ctx.restore();
          }
          undo.disabled = history.length === 0;
        }

        function rectOf(d) {
          const x = Math.max(0, Math.min(d.x0, d.x1));
          const y = Math.max(0, Math.min(d.y0, d.y1));
          const x2 = Math.min(work.width, Math.max(d.x0, d.x1));
          const y2 = Math.min(work.height, Math.max(d.y0, d.y1));
          return { x: Math.round(x), y: Math.round(y), w: Math.round(x2 - x), h: Math.round(y2 - y) };
        }

        function point(e) {
          const b = view.getBoundingClientRect();
          return {
            x: ((e.clientX - b.left) * view.width) / b.width,
            y: ((e.clientY - b.top) * view.height) / b.height,
          };
        }

        function apply(r) {
          history.push(copyCanvas(work));
          if (history.length > 20) history.shift();
          if (tool === "crop") {
            const c = document.createElement("canvas");
            c.width = r.w;
            c.height = r.h;
            c.getContext("2d").drawImage(work, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
            work = c;
          } else if (tool === "hide") {
            const ctx = work.getContext("2d");
            ctx.fillStyle = "#000";
            ctx.fillRect(r.x, r.y, r.w, r.h);
          } else {
            const bs = Math.max(12, Math.round(Math.min(r.w, r.h) / 4));
            const tw = Math.max(1, Math.round(r.w / bs));
            const th = Math.max(1, Math.round(r.h / bs));
            const tmp = document.createElement("canvas");
            tmp.width = tw;
            tmp.height = th;
            tmp.getContext("2d").drawImage(work, r.x, r.y, r.w, r.h, 0, 0, tw, th);
            const ctx = work.getContext("2d");
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tmp, 0, 0, tw, th, r.x, r.y, r.w, r.h);
          }
        }

        view.addEventListener("pointerdown", (e) => {
          view.setPointerCapture(e.pointerId);
          const p = point(e);
          drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
          draw();
        });
        view.addEventListener("pointermove", (e) => {
          if (!drag) return;
          const p = point(e);
          drag.x1 = p.x;
          drag.y1 = p.y;
          draw();
        });
        function finish() {
          if (!drag) return;
          const r = rectOf(drag);
          drag = null;
          if (r.w >= 8 && r.h >= 8) apply(r);
          draw();
        }
        view.addEventListener("pointerup", finish);
        view.addEventListener("pointercancel", () => {
          drag = null;
          draw();
        });

        undo.addEventListener("click", () => {
          if (history.length) {
            work = history.pop();
            draw();
          }
        });

        let settled = false;
        function close(result) {
          if (settled) return;
          settled = true;
          if (dlg.open) dlg.close();
          dlg.remove();
          resolve(result);
        }
        cancel.addEventListener("click", () => close(null));
        dlg.addEventListener("cancel", (e) => {
          e.preventDefault();
          close(null);
        });
        done.addEventListener("click", () => {
          work.toBlob(
            (blob) => {
              if (!blob) return close(null);
              const base = (file.name || "screenshot").replace(/\.[^.]+$/, "") || "screenshot";
              close(new File([blob], base + "-edited.jpg", { type: "image/jpeg" }));
            },
            "image/jpeg",
            0.9
          );
        });

        document.body.appendChild(dlg);
        dlg.showModal();
        draw();
      }
    });
  }

  window.WingmanEditor = { open };
})();
