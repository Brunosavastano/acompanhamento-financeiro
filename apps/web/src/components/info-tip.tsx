"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Info } from "lucide-react";
import type { Explanation } from "@/lib/explanations";

const GAP = 6;
const MARGIN = 8;

/**
 * ⓘ com a explicação de um número. Abre com clique, toque, Enter ou Espaço e
 * fecha com Esc, com um clique fora ou quando o foco vai para outro lugar. O
 * texto entra numa região "status", que o leitor de tela lê ao abrir. A caixa
 * é fixa na tela (não é cortada pelo card) e nunca passa da largura da tela.
 * Como o ⓘ pode ficar dentro de um rótulo em maiúsculas ou sem quebra de
 * linha, a caixa volta ao texto normal.
 */
export function InfoTip({ explanation, className }: { explanation: Explanation; className?: string }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const bubbleId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = buttonRef.current;
      const bubble = bubbleRef.current;
      if (!button || !bubble) return;
      const rect = button.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const width = bubble.offsetWidth;
      const height = bubble.offsetHeight;
      const left = Math.max(MARGIN, Math.min(rect.left + rect.width / 2 - width / 2, viewportWidth - width - MARGIN));
      const below = rect.bottom + GAP;
      const fitsBelow = below + height <= window.innerHeight - MARGIN;
      const top = !fitsBelow && rect.top - GAP - height >= MARGIN ? rect.top - GAP - height : below;
      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) => target instanceof Node && Boolean(wrapperRef.current?.contains(target));
    const onPointerDown = (event: PointerEvent) => {
      if (!inside(event.target)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!inside(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={wrapperRef} className={clsx("inline-flex shrink-0 align-middle", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={explanation.label}
        aria-expanded={open}
        aria-controls={open ? bubbleId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={clsx(
          "focus-ring grid h-6 w-6 place-items-center rounded-full hover:bg-elevated hover:text-snow",
          open ? "bg-elevated text-snow" : "text-faint",
        )}
      >
        <Info className="h-[15px] w-[15px]" aria-hidden />
      </button>
      <span role="status">
        {open ? (
          <span
            ref={bubbleRef}
            id={bubbleId}
            className="fixed left-0 top-0 z-50 block w-[min(19rem,calc(100vw-16px))] whitespace-normal break-words rounded-[10px] border border-edge bg-elevated px-3.5 py-3 text-left text-xs font-normal normal-case leading-[18px] tracking-normal text-body shadow-glow"
          >
            <span className="block text-[13px] font-semibold text-snow">{explanation.title}</span>
            {explanation.paragraphs.map((paragraph) => (
              <span key={paragraph} className="mt-1.5 block">
                {paragraph}
              </span>
            ))}
            {explanation.items?.map((item) => (
              <span key={item} className="mt-1 flex gap-1.5">
                <span aria-hidden className="text-faint">
                  •
                </span>
                <span>{item}</span>
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </span>
  );
}
