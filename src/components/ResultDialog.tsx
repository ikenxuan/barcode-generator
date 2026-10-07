import { Button, Modal, toast } from "@heroui/react";
import { CheckCircle2, FolderOpen, TriangleAlert } from "lucide-react";
import { api } from "@/lib/tauri";
import type { GenerateResult } from "@/lib/types";

export function ResultDialog({
  result,
  mode,
  onClose,
}: {
  result: GenerateResult | null;
  mode: "excel" | "png";
  onClose: () => void;
}) {
  const isPng = mode === "png";
  return (
    <Modal.Backdrop variant="blur" isOpen={!!result} onOpenChange={(o) => !o && onClose()}>
      <Modal.Container>
        <Modal.Dialog className="w-[440px] max-w-[92vw]">
          <Modal.CloseTrigger aria-label="关闭" />
          <Modal.Header>
            <Modal.Icon>
              <CheckCircle2 size={22} className="text-success" />
            </Modal.Icon>
            <Modal.Heading className="text-[15px] font-semibold">
              {isPng ? "PNG 导出完成" : "条形码生成完成"}
            </Modal.Heading>
          </Modal.Header>

          <Modal.Body>
            <p className="text-[13px] text-muted">
              共 {result?.totalRows ?? 0} 行，成功 {result?.success ?? 0} 行
              {result && result.failed.length > 0 && (
                <span className="text-warning">，失败 {result.failed.length} 行</span>
              )}
            </p>

            {result && result.failed.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-line bg-surface-2 p-2">
                {result.failed.map((f) => (
                  <div key={f.row} className="flex items-start gap-2 py-1 text-[12px]">
                    <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warning" />
                    <span className="tabular-nums text-muted">第 {f.row} 行</span>
                    <span className="truncate font-mono">{f.value}</span>
                    <span className="ml-auto shrink-0 text-muted">{f.error}</span>
                  </div>
                ))}
              </div>
            )}
          </Modal.Body>

          <Modal.Footer>
            <Button
              variant="outline"
              className="gap-1.5"
              onPress={async () => {
                if (!result) return;
                try {
                  if (isPng) await api.openDirectory(result.outputPath);
                  else await api.revealInFolder(result.outputPath);
                } catch (e) {
                  toast.danger("打开位置失败", { description: String(e) });
                }
              }}
            >
              <FolderOpen size={14} />
              打开位置
            </Button>
            <Button variant="primary" onPress={onClose}>
              完成
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
