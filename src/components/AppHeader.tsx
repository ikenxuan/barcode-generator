import { AnimatePresence, motion } from "motion/react";
import { Barcode, FolderOpen, Moon, Sun, FileSpreadsheet, X } from "lucide-react";
import { Button, Separator, Tooltip } from "@heroui/react";
import { useApp } from "@/store";

export type BusyMode = "excel" | "png" | null;

/**
 * 顶栏：品牌 + 文件入口在左，主操作在右。
 * 只保留高频动作；工作表切换、编辑状态移到底部状态栏（贴近网格）。
 */
export function AppHeader({
  onOpenFile,
  onGenerate,
  onExportPng,
  busyMode,
}: {
  onOpenFile: () => void;
  onGenerate: () => void;
  onExportPng: () => void;
  busyMode: BusyMode;
}) {
  const workbook = useApp((s) => s.workbook);
  const closeWorkbook = useApp((s) => s.closeWorkbook);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const dataColumn = useApp((s) => s.dataColumn);
  const outputColumn = useApp((s) => s.outputColumn);
  const busy = busyMode !== null;
  const canGenerate = !!workbook && !!dataColumn && !!outputColumn && !busy;

  const disabledReason = !workbook
    ? "先打开一个表格文件"
    : !dataColumn || !outputColumn
      ? "先在表头选择「数据」列和「输出」列"
      : null;

  return (
    <header className="material-thin relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 shadow-[0_1px_0_var(--edge-light)_inset]">
      {/* 品牌 */}
      <div className="flex items-center gap-2 select-none">
        <span className="flex size-7 items-center justify-center rounded-[8px] bg-accent text-white shadow-[0_1px_2px_rgba(0,0,0,0.18)]">
          <Barcode size={16} strokeWidth={2} />
        </span>
        <span className="text-[14px] font-semibold tracking-[-0.01em]">bargen</span>
      </div>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        onPress={onOpenFile}
        variant="secondary"
        size="sm"
        className="gap-1.5 rounded-lg text-[13px] font-medium"
      >
        <FolderOpen size={14} />
        打开文件
      </Button>

      {/* 当前文件 */}
      <AnimatePresence>
        {workbook && (
          <motion.div
            initial={{ opacity: 0, transform: "translateX(-8px)" }}
            animate={{ opacity: 1, transform: "translateX(0)" }}
            exit={{ opacity: 0, transform: "translateX(-8px)" }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="flex min-w-0 items-center gap-2 rounded-lg bg-black/5 py-1.5 pr-1.5 pl-2.5 text-[12.5px] dark:bg-white/10"
          >
            <FileSpreadsheet size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="max-w-56 truncate" title={workbook.path}>
              {workbook.path.split(/[\\/]/).pop()}
            </span>
            <button
              onClick={closeWorkbook}
              className="pressable rounded p-0.5 text-text-2 transition-colors duration-150 hover:bg-black/10 dark:hover:bg-white/15"
              title="关闭文件"
            >
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ml-auto flex items-center gap-2">
        <Tooltip delay={300}>
          <Button
            onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={theme === "dark" ? "切换到浅色" : "切换到深色"}
            className="rounded-lg text-text-2"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
          <Tooltip.Content>{theme === "dark" ? "切换到浅色" : "切换到深色"}</Tooltip.Content>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Tooltip delay={300}>
          <Button
            onPress={onExportPng}
            isDisabled={!canGenerate}
            isPending={busyMode === "png"}
            variant="outline"
            size="sm"
            className="rounded-lg px-3.5 text-[13px] font-medium"
          >
            {busyMode === "png" ? "导出中…" : "导出 PNG"}
          </Button>
          <Tooltip.Content>{disabledReason ?? "把每行条码导出为独立 PNG 文件"}</Tooltip.Content>
        </Tooltip>

        <Tooltip delay={300}>
          <Button
            onPress={onGenerate}
            isDisabled={!canGenerate}
            isPending={busyMode === "excel"}
            variant="primary"
            size="sm"
            className="rounded-lg px-4 text-[13px] font-medium shadow-[0_2px_8px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
          >
            {busyMode === "excel" ? "生成中…" : "生成条形码"}
          </Button>
          <Tooltip.Content>{disabledReason ?? "把条码图片嵌入输出列并另存为 xlsx"}</Tooltip.Content>
        </Tooltip>
      </div>
    </header>
  );
}
