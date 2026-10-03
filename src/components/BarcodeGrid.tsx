import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
  colorSchemeLight,
  colorSchemeDark,
  type ColDef,
  type CellValueChangedEvent,
  type CellFocusedEvent,
} from "ag-grid-community";
import { Dropdown } from "@heroui/react";
import { AlertTriangle } from "lucide-react";
import { useApp } from "@/store";
import { colLetter, validateValue } from "@/lib/grid";
import { renderBarcodeSvg, renderQrDataUrl } from "@/lib/preview";
import type { BarcodeStyle } from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

/* ---- 表头列选择：点击「数据」/「输出」标签完成列映射 ---- */

function ColumnHeader(props: { colId?: string; displayName?: string; column?: { getColId?: () => string } }) {
  const { dataColumn, outputColumn, setDataColumn, setOutputColumn } = useApp();
  const colId = props.colId ?? props.column?.getColId?.() ?? "";
  const index = Number(colId.replace("c", ""));
  if (!Number.isFinite(index) || index < 1) {
    return <div className="flex h-full items-center px-2 text-[12.5px]">{props.displayName}</div>;
  }
  const isData = dataColumn === index;
  const isOutput = outputColumn === index;

  const chip =
    "pointer-events-auto select-none rounded-full px-2 py-px text-[11px] font-medium leading-4 transition-colors duration-150";
  return (
    <div className="flex h-full w-full items-center gap-1.5 overflow-hidden px-2">
      <span className="truncate text-[12.5px] font-medium">
        {isData ? "数据 · " : isOutput ? "输出 · " : ""}
        {props.displayName}
      </span>
      <span className="ml-auto flex gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDataColumn(isData ? null : index);
          }}
          className={`${chip} ${
            isData
              ? "bg-accent text-white"
              : "bg-black/5 text-text-2 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
          }`}
          title="设为数据列（条码内容来源）"
        >
          数据
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOutputColumn(isOutput ? null : index);
          }}
          className={`${chip} ${
            isOutput
              ? "bg-emerald-600 text-white"
              : "bg-black/5 text-text-2 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
          }`}
          title="设为输出列（条码图片嵌入位置）"
        >
          输出
        </button>
      </span>
    </div>
  );
}

/* ---- 预览列单元格：即时条码缩略图 ---- */

function useQrDataUrl(
  value: string,
  format: string,
  style: BarcodeStyle,
) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (format !== "qr" || !value) {
      setUrl(null);
      return;
    }
    renderQrDataUrl(value, style).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [value, format, style.foreground, style.background, style.height]);
  return url;
}

function PreviewCell(params: { data?: Record<string, unknown>; context?: { onPreview?: (v: string) => void } }) {
  const value = (params.data?.__value as string) ?? "";
  const format = useApp((s) => s.format);
  const style = useApp((s) => s.style);
  const onPreview = params.context?.onPreview;
  const status = validateValue(value, format);
  const qrUrl = useQrDataUrl(value, format, style);

  const svg = useMemo(
    () =>
      value && status === "ok" && format !== "qr"
        ? renderBarcodeSvg(value, format, style)
        : null,
    [value, format, style, status],
  );

  if (!value) return <span className="text-text-3">—</span>;
  if (status === "warn") {
    return (
      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <AlertTriangle size={13} />
        <span className="text-[12px]">格式不符</span>
      </span>
    );
  }
  return (
    <button
      className="flex h-full w-full items-center justify-center overflow-hidden py-0.5 transition-opacity duration-150 hover:opacity-80"
      onClick={() => onPreview?.(value)}
      title="点击查看大图预览"
    >
      {format === "qr" ? (
        qrUrl ? (
          <img src={qrUrl} alt={value} className="max-h-full" />
        ) : null
      ) : (
        <span
          className="h-full [&>svg]:h-full [&>svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg ?? "" }}
        />
      )}
    </button>
  );
}

/* ---- AG Grid 主题（Apple 中性色 + 强调色） ---- */

const lightTheme = themeQuartz.withPart(colorSchemeLight).withParams({
  accentColor: "#0071e3",
  backgroundColor: "#FFFFFF",
  foregroundColor: "#1d1d1f",
  borderColor: "rgba(0,0,0,0.08)",
  headerBackgroundColor: "#f5f5f7",
  oddRowBackgroundColor: "#fafafa",
  rowHoverColor: "rgba(0,113,227,0.06)",
  headerHeight: 34,
  rowHeight: 56,
  fontSize: 12.5,
  wrapperBorder: false,
});

const darkTheme = themeQuartz.withPart(colorSchemeDark).withParams({
  accentColor: "#0a84ff",
  backgroundColor: "#232326",
  foregroundColor: "#f5f5f7",
  borderColor: "rgba(255,255,255,0.1)",
  headerBackgroundColor: "#1c1c1e",
  oddRowBackgroundColor: "#28282b",
  rowHoverColor: "rgba(10,132,255,0.12)",
  headerHeight: 34,
  rowHeight: 56,
  fontSize: 12.5,
  wrapperBorder: false,
});


/** 数据与列定义：sheetData + 选列/行范围 -> AG Grid 模型 */
function useGridModel() {
  const sheetData = useApp((s) => s.sheetData);
  const dataColumn = useApp((s) => s.dataColumn);
  const outputColumn = useApp((s) => s.outputColumn);
  const startRow = useApp((s) => s.startRow);
  const endRow = useApp((s) => s.endRow);

  return useMemo(() => {
    if (!sheetData) return { rowData: [] as Record<string, unknown>[], columnDefs: [] as ColDef[] };
    const from = Math.max(1, startRow);
    const to = endRow ?? sheetData.rowCount;
    const inRange = (r: number) => r >= from && r <= to;

    const rows = sheetData.rows.map((row, i) => {
      const rec: Record<string, unknown> = { __row: i + 1, __value: "", __inRange: inRange(i + 1) };
      row.forEach((v, c) => (rec[`c${c + 1}`] = v));
      if (dataColumn && dataColumn <= row.length && inRange(i + 1)) {
        rec.__value = row[dataColumn - 1];
      }
      return rec;
    });

    const defs: ColDef[] = [
      { field: "__row", headerName: "#", width: 64, pinned: "left", sortable: false, suppressMovable: true, editable: false },
      ...Array.from({ length: sheetData.colCount }, (_, i) => ({
        field: `c${i + 1}`,
        headerName: colLetter(i + 1),
        headerComponent: ColumnHeader as ColDef["headerComponent"],
        cellClassRules: {
          "bg-accent/8 dark:bg-accent/15": () => dataColumn === i + 1,
          "bg-emerald-500/8 dark:bg-emerald-500/15": () => outputColumn === i + 1,
        },
        minWidth: 110,
        flex: 1,
        sortable: false,
        suppressMovable: true,
        editable: true,
      })),
      { field: "__value", headerName: "预览", cellRenderer: PreviewCell, minWidth: 220, width: 260, pinned: "right", sortable: false, suppressMovable: true, editable: false },
    ];
    return { rowData: rows, columnDefs: defs };
  }, [sheetData, dataColumn, outputColumn, startRow, endRow]);
}

/** Excel/WPS 式剪贴板与快捷键：粘贴 TSV / 复制 / Delete 清空 / Ctrl+Z·Y 撤销重做 */
function useSheetShortcuts(
  elRef: React.RefObject<HTMLDivElement | null>,
  focusRef: React.RefObject<{ rowIndex: number; colId: string } | null>,
  setMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; row: number; col: number } | null>>,
) {
  const applyCellEdit = useApp((s) => s.applyCellEdit);
  const applyCellEdits = useApp((s) => s.applyCellEdits);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const inFormField = () => {
      const t = document.activeElement;
      return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
    };
    const parseTsv = (text: string): string[][] =>
      text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));

    const onPaste = (e: ClipboardEvent) => {
      const focus = focusRef.current;
      const text = e.clipboardData?.getData("text/plain");
      if (!focus || !text || inFormField()) return;
      e.preventDefault();
      if (!focus.colId.startsWith("c")) return;
      const anchorCol = Number(focus.colId.slice(1));
      const cells = parseTsv(text);
      const changes: { row: number; col: number; prev: string; next: string }[] = [];
      const rows = useApp.getState().sheetData?.rows ?? [];
      for (let r = 0; r < cells.length; r++) {
        for (let c = 0; c < cells[r].length; c++) {
          const row = focus.rowIndex + 1 + r;
          const col = anchorCol + c;
          const next = cells[r][c];
          const prev = rows[row - 1]?.[col - 1] ?? "";
          if (prev !== next) changes.push({ row, col, prev, next });
        }
      }
      if (changes.length > 0) applyCellEdits(changes);
    };

    const onCopy = (e: ClipboardEvent) => {
      const focus = focusRef.current;
      if (!focus || inFormField()) return;
      if ((window.getSelection()?.toString() ?? "").length > 0) return;
      e.preventDefault();
      const value = useApp.getState().sheetData?.rows[focus.rowIndex]?.[Number(focus.colId.slice(1)) - 1] ?? "";
      e.clipboardData?.setData("text/plain", value);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (inFormField()) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && focusRef.current) {
        const focus = focusRef.current;
        if (!focus.colId.startsWith("c")) return;
        e.preventDefault();
        const row = focus.rowIndex + 1;
        const col = Number(focus.colId.slice(1));
        const prev = useApp.getState().sheetData?.rows[row - 1]?.[col - 1] ?? "";
        applyCellEdit(row, col, prev, "");
      }
    };

    // 原生右键监听：从 DOM 反推行列，绕开 AG Grid 事件层的限制
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cellEl = target.closest("[col-id]") as HTMLElement | null;
      const rowEl = target.closest(".ag-row") as HTMLElement | null;
      const colId = cellEl?.getAttribute("col-id") ?? "";
      const rowIndex = rowEl?.getAttribute("row-index");
      if (!colId.startsWith("c") || rowIndex == null) return;
      e.preventDefault();
      setMenu({
        x: e.clientX,
        y: e.clientY,
        row: Number(rowIndex) + 1,
        col: Number(colId.slice(1)),
      });
    };

    el.addEventListener("paste", onPaste);
    el.addEventListener("copy", onCopy);
    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("contextmenu", onContextMenu);
    return () => {
      el.removeEventListener("paste", onPaste);
      el.removeEventListener("copy", onCopy);
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  }, [elRef, focusRef, applyCellEdit, applyCellEdits, undo, redo, setMenu]);
}

function ContextMenu({
  menu,
  onClose,
}: {
  menu: { x: number; y: number; row: number; col: number };
  onClose: () => void;
}) {
  const applyCellEdit = useApp((s) => s.applyCellEdit);
  const applyCellEdits = useApp((s) => s.applyCellEdits);

  const currentCell = () => {
    const rows = useApp.getState().sheetData?.rows ?? [];
    return rows[menu.row - 1]?.[menu.col - 1] ?? "";
  };

  const act = (key: string | number) => {
    onClose();
    if (key === "copy") {
      navigator.clipboard.writeText(currentCell()).catch(() => undefined);
      return;
    }
    if (key === "clear") {
      applyCellEdit(menu.row, menu.col, currentCell(), "");
      return;
    }
    navigator.clipboard
      .readText()
      .then((text) => {
        if (!text) return;
        const rows = useApp.getState().sheetData?.rows ?? [];
        const cells = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
        const changes: { row: number; col: number; prev: string; next: string }[] = [];
        for (let r = 0; r < cells.length; r++) {
          for (let c = 0; c < cells[r].length; c++) {
            const rr = menu.row + r;
            const cc = menu.col + c;
            const prev = rows[rr - 1]?.[cc - 1] ?? "";
            if (prev !== cells[r][c]) changes.push({ row: rr, col: cc, prev, next: cells[r][c] });
          }
        }
        if (changes.length > 0) applyCellEdits(changes);
      })
      .catch(() => undefined);
  };

  // 定位在右键点的隐形触发器 + 受控 Dropdown
  return (
    <Dropdown isOpen onOpenChange={(o) => !o && onClose()}>
      <Dropdown.Trigger
        className="pointer-events-none fixed size-0"
        style={{ left: menu.x, top: menu.y }}
        aria-label="表格操作菜单"
      />
      <Dropdown.Popover className="min-w-40">
        <Dropdown.Menu onAction={act}>
          <Dropdown.Item id="copy" textValue="复制">
            复制
          </Dropdown.Item>
          <Dropdown.Item id="paste" textValue="粘贴">
            粘贴
          </Dropdown.Item>
          <Dropdown.Item id="clear" textValue="清空单元格" variant="danger">
            清空单元格
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

export function BarcodeGrid({ onPreview }: { onPreview: (value: string) => void }) {
  const theme = useApp((s) => s.theme);
  const sheetData = useApp((s) => s.sheetData);
  const applyCellEdit = useApp((s) => s.applyCellEdit);
  const { rowData, columnDefs } = useGridModel();

  const gridRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<{ rowIndex: number; colId: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; row: number; col: number } | null>(null);
  useSheetShortcuts(gridRef, focusRef, setMenu);

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent) => {
      const field = e.colDef.field;
      if (!field?.startsWith("c") || typeof e.rowIndex !== "number") return;
      applyCellEdit(e.rowIndex + 1, Number(field.slice(1)), e.oldValue ?? "", e.newValue ?? "");
    },
    [applyCellEdit],
  );

  const onCellFocused = useCallback((e: CellFocusedEvent) => {
    const column = e.column;
    const colId = typeof column === "object" && column !== null && "getColId" in column
      ? (column as { getColId: () => string }).getColId()
      : undefined;
    if (typeof e.rowIndex !== "number" || !colId) return;
    focusRef.current = { rowIndex: e.rowIndex, colId };
  }, []);

  const getRowClass = useCallback(
    (p: { data?: Record<string, unknown> }) => (p.data && !p.data.__inRange ? "opacity-40" : ""),
    [],
  );

  return (
    <div className="relative h-full w-full" ref={gridRef} tabIndex={0}>
      <AgGridReact
        theme={theme === "dark" ? darkTheme : lightTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        getRowClass={getRowClass}
        context={{ onPreview }}
        defaultColDef={{ resizable: true }}
        onCellValueChanged={onCellValueChanged}
        onCellFocused={onCellFocused}
        stopEditingWhenCellsLoseFocus
        rowBuffer={8}
      />
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {sheetData === null && <span />}
    </div>
  );
}
