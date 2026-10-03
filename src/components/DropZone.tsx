import { motion } from "motion/react";
import { Barcode, FolderOpen } from "lucide-react";

/** 空状态：拖入或点击选择 xlsx */
export function DropZone({ onOpenFile }: { onOpenFile: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, transform: "scale(0.97)" }}
        animate={{ opacity: 1, transform: "scale(1)" }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-md"
      >
        <button
          onClick={onOpenFile}
          className="group flex w-full flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-line bg-surface/60 px-8 py-14 transition-colors duration-200 hover:border-accent/50 hover:bg-accent/5"
        >
          <div className="relative">
            <Barcode size={52} strokeWidth={1.5} className="text-accent" />
          </div>
          <div className="text-center">
            <p className="text-[15px] font-semibold">拖入 Excel 文件开始</p>
            <p className="mt-1.5 text-[12.5px] leading-5 text-text-2">
              支持 xlsx / xlsm / xls / xlsb / ods / csv
              <br />
              数据列内容将生成条形码并嵌入表格
            </p>
          </div>
          <span className="pressable mt-1 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white group-hover:bg-accent-strong">
            <FolderOpen size={15} />
            选择文件
          </span>
        </button>
      </motion.div>
    </div>
  );
}
