import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { toast } from "@heroui/react";
import { Toolbar } from "@/components/Toolbar";
import { SettingsPanel } from "@/components/SettingsPanel";
import { BarcodeGrid } from "@/components/BarcodeGrid";
import { PreviewDialog } from "@/components/PreviewDialog";
import { ProgressCard } from "@/components/ProgressCard";
import { ResultDialog } from "@/components/ResultDialog";
import { DropZone } from "@/components/DropZone";
import { api } from "@/lib/tauri";
import { useApp } from "@/store";
import type { GenerateRequest, GenerateResult, ProgressEvent } from "@/lib/types";

export default function App() {
  const theme = useApp((s) => s.theme);
  const workbook = useApp((s) => s.workbook);
  const sheetIndex = useApp((s) => s.sheetIndex);
  const setWorkbook = useApp((s) => s.setWorkbook);
  const setSheetData = useApp((s) => s.setSheetData);
  const setLoadingSheet = useApp((s) => s.setLoadingSheet);
  const format = useApp((s) => s.format);
  const style = useApp((s) => s.style);
  const startRow = useApp((s) => s.startRow);
  const endRow = useApp((s) => s.endRow);
  const dataColumn = useApp((s) => s.dataColumn);
  const outputColumn = useApp((s) => s.outputColumn);
  const outputName = useApp((s) => s.outputName);
  const openAfterDone = useApp((s) => s.openAfterDone);

  const pendingEdits = useApp((s) => s.pendingEdits);
  const [previewValue, setPreviewValue] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<{ result: GenerateResult; mode: "excel" | "png" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const generating = useRef(false);

  /* 主题类同步到根元素 */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  /* 打开并解析工作簿 */
  const openFile = useCallback(
    async (path?: string | null) => {
      const p = path ?? (await api.pickExcel());
      if (!p) return;
      try {
        setLoadingSheet(true);
        const info = await api.readWorkbook(p);
        setWorkbook(info);
        if (info.sheets.length === 0) {
          toast.danger("文件中没有工作表");
        }
      } catch (e) {
        toast.danger("打开文件失败", { description: String(e) });
      } finally {
        setLoadingSheet(false);
      }
    },
    [setWorkbook, setLoadingSheet],
  );

  /* 加载当前工作表数据 */
  useEffect(() => {
    if (!workbook || workbook.sheets.length === 0) return;
    let alive = true;
    setLoadingSheet(true);
    api
      .readSheet({ path: workbook.path, sheetIndex })
      .then((d) => alive && setSheetData(d))
      .catch((e) => alive && toast.danger("读取工作表失败", { description: String(e) }))
      .finally(() => alive && setLoadingSheet(false));
    return () => {
      alive = false;
    };
  }, [workbook, sheetIndex, setSheetData, setLoadingSheet]);

  /* Tauri 原生文件拖拽（纯浏览器预览时跳过） */
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const { payload } = event;
      if (payload.type === "enter" || payload.type === "over") {
        setDragOver(true);
      } else if (payload.type === "leave") {
        setDragOver(false);
      } else if (payload.type === "drop") {
        setDragOver(false);
        const file = payload.paths.find((f) => /\.(xlsx|xlsm)$/i.test(f));
        if (file) openFile(file);
        else toast.danger("请拖入 .xlsx 或 .xlsm 文件");
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [openFile]);

  /* 生成流程（Excel 嵌入 / PNG 导出共用） */
  const runGenerate = useCallback(
    async (mode: "excel" | "png") => {
      if (!workbook || !dataColumn || generating.current) return;
      if (mode === "excel" && !outputColumn) return;

      let outputPath: string | undefined;
      let pngOutputDir: string | undefined;
      if (mode === "excel") {
        const dir = workbook.path.replace(/[\/][^\/]+$/, "");
        outputPath = await api.pickSavePath([dir, outputName || "output.xlsx"].join("/"));
        if (!outputPath) return;
      } else {
        pngOutputDir = await api.pickDirectory();
        if (!pngOutputDir) return;
      }

      const req: GenerateRequest = {
        inputPath: workbook.path,
        outputPath,
        sheetIndex,
        dataColumn,
        outputColumn: (mode === "excel" ? outputColumn : undefined) ?? undefined,
        startRow: Math.max(1, startRow),
        endRow: endRow ?? undefined,
        format,
        style,
        pngOutputDir,
        edits: pendingEdits(),
      };

      generating.current = true;
      setBusy(true);
      setProgress({ stage: "open", current: 0, total: 1, message: "正在打开文件…" });
      try {
        const r = await api.generate(req, mode, (e) => setProgress(e));
        setProgress(null);
        setResult({ result: r, mode });
        if (r.failed.length === 0) {
          toast.success(mode === "excel" ? "条形码生成完成" : "PNG 导出完成", {
            description: `${r.success} 行处理成功`,
          });
        }
        if (openAfterDone) {
          try {
            if (mode === "png") await api.openDirectory(r.outputPath);
            else await api.revealInFolder(r.outputPath);
          } catch {
            /* 忽略打开失败 */
          }
        }
      } catch (e) {
        setProgress(null);
        toast.danger("生成失败", { description: String(e) });
      } finally {
        generating.current = false;
        setBusy(false);
      }
    },
    [workbook, dataColumn, outputColumn, sheetIndex, startRow, endRow, format, style, outputName, openAfterDone],
  );

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        onOpenFile={() => openFile()}
        onGenerate={() => runGenerate("excel")}
        onExportPng={() => runGenerate("png")}
        busy={busy}
      />

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1 bg-surface">
          {workbook && workbook.sheets.length > 0 ? (
            <>
              <BarcodeGrid onPreview={setPreviewValue} />
              {dragOver && (
                <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/10 backdrop-blur-sm">
                  <p className="text-[14px] font-medium text-accent">松开以打开文件</p>
                </div>
              )}
            </>
          ) : (
            <DropZone onOpenFile={() => openFile()} />
          )}
        </main>

        <SettingsPanel />
      </div>

      <PreviewDialog value={previewValue} onClose={() => setPreviewValue(null)} />
      <ResultDialog
        result={result?.result ?? null}
        mode={result?.mode ?? "excel"}
        onClose={() => setResult(null)}
      />
      <ProgressCard progress={progress} />
    </div>
  );
}
