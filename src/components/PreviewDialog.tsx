import { useEffect, useState } from "react";
import { Chip, Modal, Spinner } from "@heroui/react";
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
    <Modal.Backdrop variant="blur" isOpen={!!value} onOpenChange={(o) => !o && onClose()}>
      <Modal.Container>
        <Modal.Dialog className="w-[520px] max-w-[92vw]">
          <Modal.CloseTrigger aria-label="关闭" />
          <Modal.Header>
            <Modal.Heading className="flex items-center gap-2 text-[15px] font-semibold">
              条码预览
              <Chip size="sm" color="accent" variant="soft">
                {FORMAT_LABELS[format]}
              </Chip>
            </Modal.Heading>
          </Modal.Header>

          <Modal.Body>
            <p className="mb-3 text-[12px] text-muted">
              Rust 引擎真实输出 · 表格缩略图为同规范即时预览，实际写入以此图为准
            </p>
            <div
              className="flex min-h-40 items-center justify-center rounded-xl border border-line p-4"
              style={{ background: style.background }}
            >
              {png ? (
                <img
                  src={`data:image/png;base64,${png}`}
                  alt={value ?? ""}
                  className="max-h-52 max-w-full"
                />
              ) : error ? (
                <p className="text-[13px] text-danger">{error}</p>
              ) : (
                <Spinner size="md" color="accent" aria-label="渲染中" />
              )}
            </div>
            <p className="mt-3 truncate text-center font-mono text-[15px] tracking-wide">
              {value}
            </p>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
