import { useEffect, useState } from "react";
import { Modal } from "@heroui/react";
import { X } from "lucide-react";
import { api } from "@/lib/tauri";
import { useApp } from "@/store";
import { FORMAT_LABELS } from "@/lib/types";

/**
 * 大图预览：Rust 引擎渲染的真实输出（即写入 Excel 的原图）。
 * 开合由 HeroUI 自带 CSS 过渡处理（减少自研动画面）。
 */
export function PreviewDialog({
  value,
  onClose,
}: {
  value: string | null;
  onClose: () => void;
}) {
  const format = useApp((s) => s.format);
  const style = useApp((s) => s.style);
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;
    setPng(null);
    setError(null);
    api
      .renderPreview({ data: value, format, style })
      .then(setPng)
      .catch((e) => setError(String(e)));
  }, [value, format, style]);

  return (
    <Modal.Backdrop isOpen={!!value} onOpenChange={(o) => !o && onClose()}>
      <Modal.Container>
        <Modal.Dialog className="w-[520px] max-w-[92vw]">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] font-medium text-accent">
                {FORMAT_LABELS[format]}
              </span>
              <span className="text-[12.5px] text-muted">Rust 引擎真实输出</span>
            </div>
            <Modal.CloseTrigger
              aria-label="关闭"
              className="rounded-lg p-1.5 text-muted hover:bg-default"
            >
              <X size={16} />
            </Modal.CloseTrigger>
          </div>

          <div
            className="flex min-h-40 items-center justify-center rounded-xl border border-line p-4"
            style={{ background: style.background }}
          >
            {png ? (
              <img src={`data:image/png;base64,${png}`} alt={value ?? ""} className="max-h-52 max-w-full" />
            ) : error ? (
              <p className="text-[13px] text-danger">{error}</p>
            ) : (
              <span className="text-[13px] text-muted">渲染中…</span>
            )}
          </div>

          <Modal.Heading className="mt-4 truncate text-center font-mono text-[15px] tracking-wide">
            {value}
          </Modal.Heading>
          <p className="mt-1 text-center text-[11.5px] text-muted">
            表格缩略图为同规范即时预览，实际写入以此图为准
          </p>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
