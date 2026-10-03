import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BarcodeFormat, BarcodeStyle, SheetData, SheetEdit, WorkbookInfo } from "@/lib/types";
import { DEFAULT_STYLE } from "@/lib/types";

/** 用户偏好（跨会话记忆） */
interface Prefs {
  format: BarcodeFormat;
  style: BarcodeStyle;
  startRow: number;
  endRow: number | null;
  outputName: string;
  openAfterDone: boolean;
  theme: "light" | "dark";
  dataColumn: number | null;
  outputColumn: number | null;
}

/** 一次单元格编辑（undo/redo 栈条目） */
interface CellChange {
  row: number; // 1-based
  col: number; // 1-based
  prev: string;
  next: string;
}

interface AppState extends Prefs {
  workbook: WorkbookInfo | null;
  sheetIndex: number;
  sheetData: SheetData | null;
  loadingSheet: boolean;
  filePath: string | null;
  /** 打开文件时的原始数据（未应用编辑），用于计算待发送的编辑 */
  baseRows: string[][];
  /** 键 "r:c" -> 编辑后的值 */
  edits: Map<string, string>;
  /** 撤销 / 重做栈 */
  undoStack: CellChange[];
  redoStack: CellChange[];

  setWorkbook: (info: WorkbookInfo) => void;
  setSheetIndex: (i: number) => void;
  setSheetData: (d: SheetData | null) => void;
  applyCellEdit: (row: number, col: number, prev: string, next: string) => void;
  applyCellEdits: (changes: CellChange[]) => void;
  undo: () => void;
  redo: () => void;
  pendingEdits: () => SheetEdit[];
  discardEdits: () => void;
  setLoadingSheet: (b: boolean) => void;
  closeWorkbook: () => void;
  setFormat: (f: BarcodeFormat) => void;
  setStyle: (patch: Partial<BarcodeStyle>) => void;
  setStartRow: (n: number) => void;
  setEndRow: (n: number | null) => void;
  setOutputName: (s: string) => void;
  setOpenAfterDone: (b: boolean) => void;
  setTheme: (t: "light" | "dark") => void;
  setDataColumn: (n: number | null) => void;
  setOutputColumn: (n: number | null) => void;
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      format: "code128",
      style: DEFAULT_STYLE,
      startRow: 1,
      endRow: null,
      outputName: "output.xlsx",
      openAfterDone: true,
      theme: "light",
      dataColumn: null,
      outputColumn: null,

      workbook: null,
      sheetIndex: 0,
      sheetData: null,
      loadingSheet: false,
      filePath: null,
      baseRows: [],
      edits: new Map(),
      undoStack: [],
      redoStack: [],

      setWorkbook: (info) =>
        set({ workbook: info, filePath: info.path, sheetIndex: 0, sheetData: null }),
      setSheetIndex: (i) => set({ sheetIndex: i, sheetData: null }),
      setSheetData: (d) => {
        const patch: Partial<AppState> = {
          sheetData: d,
          baseRows: d ? d.rows.map((r) => [...r]) : [],
          edits: new Map(),
          undoStack: [],
          redoStack: [],
        };
        // 沿用旧版 CLI 的 A → B 默认：数据加载完成即可直接生成
        if (d && d.colCount >= 1) {
          const colCount = d.colCount;
          const dc = get().dataColumn;
          if (dc == null || dc > colCount) patch.dataColumn = 1;
          if (colCount >= 2) {
            const oc = get().outputColumn;
            if (oc == null || oc > colCount) patch.outputColumn = 2;
          }
        }
        set(patch);
      },
      setLoadingSheet: (b) => set({ loadingSheet: b }),
      closeWorkbook: () =>
        set({
          workbook: null, sheetData: null, filePath: null, sheetIndex: 0,
          baseRows: [], edits: new Map(), undoStack: [], redoStack: [],
        }),
      /** 应用单元格编辑（记录撤销栈）。返回是否发生了变化。 */
      applyCellEdit: (row, col, prev, next) => {
        if (prev === next) return;
        set((s) => {
          const key = `${row}:${col}`;
          const edits = new Map(s.edits);
          edits.set(key, next);
          const sheetData = s.sheetData;
          if (sheetData && row >= 1 && row <= sheetData.rows.length) {
            const rows = sheetData.rows.map((r, i) =>
              i === row - 1 ? r.map((v, j) => (j === col - 1 ? next : v)) : r,
            );
            return {
              edits,
              sheetData: { ...sheetData, rows },
              undoStack: [...s.undoStack, { row, col, prev, next }],
              redoStack: [],
            };
          }
          return { edits, undoStack: [...s.undoStack, { row, col, prev, next }], redoStack: [] };
        });
      },
      /** 将一组编辑回放到当前数据（粘贴批量） */
      applyCellEdits: (changes) => {
        if (changes.length === 0) return;
        set((s) => {
          const sheetData = s.sheetData;
          if (!sheetData) return {};
          const rows = sheetData.rows.map((r) => [...r]);
          const edits = new Map(s.edits);
          for (const ch of changes) {
            if (ch.row >= 1 && ch.row <= rows.length) {
              const row = rows[ch.row - 1];
              if (ch.col >= 1 && ch.col <= row.length) {
                row[ch.col - 1] = ch.next;
                edits.set(`${ch.row}:${ch.col}`, ch.next);
              }
            }
          }
          return {
            sheetData: { ...sheetData, rows },
            edits,
            undoStack: [...s.undoStack, ...changes],
            redoStack: [],
          };
        });
      },
      undo: () =>
        set((s) => {
          const change = s.undoStack[s.undoStack.length - 1];
          if (!change || !s.sheetData) return {};
          const rows = s.sheetData.rows.map((r, i) =>
            i === change.row - 1 ? r.map((v, j) => (j === change.col - 1 ? change.prev : v)) : r,
          );
          const edits = new Map(s.edits);
          const key = `${change.row}:${change.col}`;
          const base = s.baseRows[change.row - 1]?.[change.col - 1];
          if (base !== undefined && base === change.prev) edits.delete(key);
          else edits.set(key, change.prev);
          return {
            sheetData: { ...s.sheetData, rows },
            edits,
            undoStack: s.undoStack.slice(0, -1),
            redoStack: [...s.redoStack, change],
          };
        }),
      redo: () =>
        set((s) => {
          const change = s.redoStack[s.redoStack.length - 1];
          if (!change || !s.sheetData) return {};
          const rows = s.sheetData.rows.map((r, i) =>
            i === change.row - 1 ? r.map((v, j) => (j === change.col - 1 ? change.next : v)) : r,
          );
          const edits = new Map(s.edits);
          edits.set(`${change.row}:${change.col}`, change.next);
          return {
            sheetData: { ...s.sheetData, rows },
            edits,
            undoStack: [...s.undoStack, change],
            redoStack: s.redoStack.slice(0, -1),
          };
        }),
      /** 待发送到后端的编辑清单（只含与原始值不同的项） */
      pendingEdits: () => {
        const s = get();
        const list: SheetEdit[] = [];
        for (const [key, value] of s.edits) {
          const [r, c] = key.split(":").map(Number);
          const base = s.baseRows[r - 1]?.[c - 1];
          if (base !== value) list.push({ row: r, col: c, value });
        }
        return list;
      },
      discardEdits: () => {
        set((s) => {
          if (!s.sheetData) return { edits: new Map(), undoStack: [], redoStack: [] };
          return {
            sheetData: { ...s.sheetData, rows: s.baseRows.map((r) => [...r]) },
            edits: new Map(),
            undoStack: [],
            redoStack: [],
          };
        });
      },
      setFormat: (format) => set({ format }),
      setStyle: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),
      setStartRow: (startRow) => set({ startRow }),
      setEndRow: (endRow) => set({ endRow }),
      setOutputName: (outputName) => set({ outputName }),
      setOpenAfterDone: (openAfterDone) => set({ openAfterDone }),
      setTheme: (theme) => set({ theme }),
      setDataColumn: (dataColumn) => set({ dataColumn }),
      setOutputColumn: (outputColumn) => set({ outputColumn }),
    }),
    {
      name: "barcode-generator-prefs",
      partialize: (s) => ({
        format: s.format,
        style: s.style,
        startRow: s.startRow,
        endRow: s.endRow,
        outputName: s.outputName,
        openAfterDone: s.openAfterDone,
        theme: s.theme,
        dataColumn: s.dataColumn,
        outputColumn: s.outputColumn,
      }),
    },
  ),
);

// 开发调试：暴露 store 便于浏览器控制台注入模拟数据检查 UI
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__useApp = useApp;
}
