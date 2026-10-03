import { invoke as tauriInvoke, Channel } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  GenerateRequest,
  GenerateResult,
  ProgressEvent,
  SheetData,
  SheetRequest,
  PreviewRequest,
  WorkbookInfo,
} from "./types";

export { Channel };

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}

export const api = {
  readWorkbook: (path: string) =>
    invoke<WorkbookInfo>("read_workbook", { path }),

  readSheet: (req: SheetRequest) => invoke<SheetData>("read_sheet", { req }),

  renderPreview: (req: PreviewRequest) =>
    invoke<string>("render_preview", { req }),

  generate: (
    req: GenerateRequest,
    mode: "excel" | "png",
    onProgress: (e: ProgressEvent) => void,
  ) => {
    const channel = new Channel<ProgressEvent>();
    channel.onmessage = onProgress;
    return invoke<GenerateResult>("generate", { req, mode, onProgress: channel });
  },

  /** 选择 xlsx 文件 */
  pickExcel: () =>
    open({
      multiple: false,
      title: "选择 Excel 文件",
      filters: [
        { name: "表格文件", extensions: ["xlsx", "xlsm", "xls", "xlsb", "ods", "csv"] },
      ],
    }),

  /** 选择输出 xlsx 保存位置 */
  pickSavePath: async (defaultName: string) =>
    (await save({
      title: "保存输出文件",
      defaultPath: defaultName,
      filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
    })) ?? undefined,

  /** 选择 PNG 输出目录 */
  pickDirectory: async () =>
    (await open({ directory: true, title: "选择 PNG 输出目录" })) ?? undefined,

  /** 在资源管理器中显示文件 */
  revealInFolder: (path: string) => revealItemInDir(path),

  /** 打开目录 */
  openDirectory: (path: string) => openPath(path),
};
