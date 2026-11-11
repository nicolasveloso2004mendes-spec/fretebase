"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

/** Assinatura na tela. É uma captura de imagem como evidência de recebimento — não é assinatura eletrônica qualificada. */
export function SignaturePad({ onChange }: { onChange: (blob: Blob | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0e2a21";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * ref.current!.width, y: ((e.clientY - r.top) / r.height) * ref.current!.height };
  };

  function down(e: React.PointerEvent) {
    drawing.current = true;
    ref.current!.setPointerCapture(e.pointerId);
    const p = pos(e);
    const ctx = ref.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const p = pos(e);
    const ctx = ref.current!.getContext("2d")!;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (empty) setEmpty(false);
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    ref.current!.toBlob((b) => onChange(b), "image/png");
  }
  function clear() {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={ref}
        width={600}
        height={220}
        aria-label="Área para assinatura do recebedor"
        className="w-full touch-none rounded-xl border border-dashed border-pine-700 bg-white"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">Peça para o recebedor assinar com o dedo. Registro em imagem, sem validade de assinatura eletrônica qualificada.</p>
        <Button variant="ghost" onClick={clear} disabled={empty}>Limpar</Button>
      </div>
    </div>
  );
}
