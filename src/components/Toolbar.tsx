import { FolderOpen, Moon, Sun, FileSpreadsheet, X, Undo2, Redo2 } from "lucide-react";
import { Button, Chip, Tabs, Tooltip } from "@heroui/react";
import { useApp } from "@/store";

export function Toolbar({
  onOpenFile,
  onGenerate,
  onExportPng,
  busy,
}: {
  onOpenFile: () => void;
  onGenerate: () => void;
  onExportPng: () => void;
  busy: boolean;
}) {
  const workbook = useApp((s) => s.workbook);
  const sheetIndex = useApp((s) => s.sheetIndex);
  const setSheetIndex = useApp((s) => s.setSheetIndex);
  const closeWorkbook = useApp((s) => s.closeWorkbook);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const dataColumn = useApp((s) => s.dataColumn);
  const outputColumn = useApp((s) => s.outputColumn);
  const edits = useApp((s) => s.edits);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const undoStack = useApp((s) => s.undoStack);
  const redoStack = useApp((s) => s.redoStack);
  const discardEdits = useApp((s) => s.discardEdits);
  const canGenerate = !!workbook && !!dataColumn && !!outputColumn && !busy;
  const editCount = edits.size;

  return (
    <header className="material-thin relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 shadow-[0_1px_0_var(--edge-light)_inset]">
      <Button
        onPress={onOpenFile}
        variant="primary"
        className="h-9 gap-2 rounded-lg px-3.5 text-[13px] font-medium"
      >
        <FolderOpen size={15} />
        打开文件
      </Button>

      {workbook && (
        <>
          <div className="flex min-w-0 items-center gap-2 rounded-lg bg-black/5 px-2.5 py-1.5 text-[12.5px] dark:bg-white/10">
            <FileSpreadsheet size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="max-w-48 truncate" title={workbook.path}>
              {workbook.path.split(/[\/]/).pop()}
            </span>
            <button
              onClick={closeWorkbook}
              className="pressable rounded p-0.5 text-text-2 hover:bg-black/10 dark:hover:bg-white/15"
              title="关闭文件"
            >
              <X size={13} />
            </button>
          </div>

          {editCount > 0 && (
            <button
              onClick={discardEdits}
              className="pressable"
              title="点击放弃全部编辑（源文件不会被修改，生成时编辑才会写入输出文件）"
            >
              <Chip color="warning" variant="soft" className="text-[12px]">
                已编辑 {editCount} 格 · 放弃
              </Chip>
            </button>
          )}

          {editCount > 0 && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={undo}
                disabled={undoStack.length === 0}
                className="pressable rounded-lg p-1.5 text-text-2 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
                title="撤销（Ctrl+Z）"
              >
                <Undo2 size={15} />
              </button>
              <button
                onClick={redo}
                disabled={redoStack.length === 0}
                className="pressable rounded-lg p-1.5 text-text-2 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
                title="重做（Ctrl+Y）"
              >
                <Redo2 size={15} />
              </button>
            </div>
          )}

          {workbook.sheets.length > 1 && (
            <Tabs
              selectedKey={String(sheetIndex)}
              onSelectionChange={(key) => setSheetIndex(Number(key))}
              className="[&_[data-slot]]:contents"
            >
              <Tabs.ListContainer>
                <Tabs.List aria-label="工作表" className="rounded-lg bg-black/5 p-1 dark:bg-white/10">
                  {workbook.sheets.map((s) => (
                    <Tabs.Tab
                      key={String(s.index)}
                      id={String(s.index)}
                      aria-label={`${s.name}（${s.rowCount} 行 × ${s.colCount} 列）`}
                      className="max-w-32 truncate rounded-md px-3 py-1 text-[12.5px] data-[selected=true]:bg-surface data-[selected=true]:shadow-sm"
                    >
                      {s.name}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
          )}
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Tooltip delay={200}>
          <Button
            onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
            isIconOnly
            variant="ghost"
            aria-label={theme === "dark" ? "切换到浅色" : "切换到深色"}
            className="rounded-lg text-text-2"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
          <Tooltip.Content>{theme === "dark" ? "切换到浅色" : "切换到深色"}</Tooltip.Content>
        </Tooltip>
        <Tooltip delay={300}>
          <Button
            onPress={onExportPng}
            isDisabled={!canGenerate}
            variant="outline"
            className="h-9 rounded-lg px-3.5 text-[13px] font-medium"
          >
            导出 PNG
          </Button>
          <Tooltip.Content>
            {!workbook
              ? "先打开一个表格文件"
              : !dataColumn || !outputColumn
                ? "先在表头选择「数据」列和「输出」列"
                : "把每行条码导出为独立 PNG 文件"}
          </Tooltip.Content>
        </Tooltip>
        <Tooltip delay={300}>
          <Button
            onPress={onGenerate}
            isDisabled={!canGenerate}
            variant="primary"
            className="h-9 rounded-lg px-4 text-[13px] font-medium"
          >
            {busy ? "生成中…" : "生成条形码"}
          </Button>
          <Tooltip.Content>
            {!workbook
              ? "先打开一个表格文件"
              : !dataColumn || !outputColumn
                ? "先在表头选择「数据」列和「输出」列"
                : "把条码图片嵌入输出列并另存为 xlsx"}
          </Tooltip.Content>
        </Tooltip>
      </div>
    </header>
  );
}
