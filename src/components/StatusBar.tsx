import { AnimatePresence, motion } from "motion/react";
import { Redo2, Undo2 } from "lucide-react";
import { Button, Chip, Kbd, Separator, Spinner, Tabs, Tooltip } from "@heroui/react";
import { useApp } from "@/store";

/**
 * 底部状态栏（Excel/WPS 惯例）：
 * 左 = 工作表切换；中 = 未保存编辑与撤销/重做；右 = 表格规模与加载状态。
 */
export function StatusBar() {
  const workbook = useApp((s) => s.workbook);
  const sheetIndex = useApp((s) => s.sheetIndex);
  const setSheetIndex = useApp((s) => s.setSheetIndex);
  const sheetData = useApp((s) => s.sheetData);
  const loadingSheet = useApp((s) => s.loadingSheet);
  const edits = useApp((s) => s.edits);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const undoStack = useApp((s) => s.undoStack);
  const redoStack = useApp((s) => s.redoStack);
  const discardEdits = useApp((s) => s.discardEdits);

  if (!workbook) return null;
  const editCount = edits.size;

  return (
    <motion.footer
      initial={{ opacity: 0, transform: "translateY(8px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="material-thin relative z-10 flex h-10 shrink-0 items-center gap-3 border-t border-line px-3"
    >
      {/* 工作表（Excel 式底部标签，溢出自动出现滚动箭头） */}
      <Tabs
        selectedKey={String(sheetIndex)}
        onSelectionChange={(key) => setSheetIndex(Number(key))}
        className="min-w-0 shrink"
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="工作表" className="gap-0.5">
            {workbook.sheets.map((s) => (
              <Tabs.Tab
                key={String(s.index)}
                id={String(s.index)}
                aria-label={`${s.name}（${s.rowCount} 行 × ${s.colCount} 列）`}
                className="max-w-36 truncate rounded-md px-2.5 py-1 text-[12px]"
              >
                {s.name}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      {/* 编辑状态：贴近网格，改动立即可见 */}
      <AnimatePresence>
        {editCount > 0 && (
          <motion.div
            initial={{ opacity: 0, transform: "scale(0.94)" }}
            animate={{ opacity: 1, transform: "scale(1)" }}
            exit={{ opacity: 0, transform: "scale(0.94)" }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="flex items-center gap-1.5"
          >
            <Separator orientation="vertical" className="mx-1 h-4" />
            <button
              onClick={discardEdits}
              className="pressable"
              title="点击放弃全部编辑（源文件不会被修改，生成时编辑才会写入输出文件）"
            >
              <Chip color="warning" variant="soft" size="sm">
                已编辑 {editCount} 格 · 放弃
              </Chip>
            </button>
            <Tooltip delay={300}>
              <Button
                onPress={undo}
                isDisabled={undoStack.length === 0}
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label="撤销"
                className="size-7 rounded-md text-text-2"
              >
                <Undo2 size={14} />
              </Button>
              <Tooltip.Content>
                <span className="flex items-center gap-1.5">
                  撤销
                  <Kbd>
                    <Kbd.Abbr keyValue="ctrl" title="Control" />
                    <Kbd.Content>Z</Kbd.Content>
                  </Kbd>
                </span>
              </Tooltip.Content>
            </Tooltip>
            <Tooltip delay={300}>
              <Button
                onPress={redo}
                isDisabled={redoStack.length === 0}
                isIconOnly
                variant="ghost"
                size="sm"
                aria-label="重做"
                className="size-7 rounded-md text-text-2"
              >
                <Redo2 size={14} />
              </Button>
              <Tooltip.Content>
                <span className="flex items-center gap-1.5">
                  重做
                  <Kbd>
                    <Kbd.Abbr keyValue="ctrl" title="Control" />
                    <Kbd.Content>Y</Kbd.Content>
                  </Kbd>
                </span>
              </Tooltip.Content>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 规模与加载状态 */}
      <div className="ml-auto flex shrink-0 items-center gap-2 text-[12px] text-text-2">
        {loadingSheet && <Spinner size="sm" color="accent" aria-label="加载中" />}
        {sheetData && (
          <span className="tabular-nums">
            {sheetData.rowCount} 行 × {sheetData.colCount} 列
          </span>
        )}
      </div>
    </motion.footer>
  );
}
