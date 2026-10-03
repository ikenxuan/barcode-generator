import { ProgressBar } from "@heroui/react";
import { motion, AnimatePresence } from "motion/react";
import type { ProgressEvent } from "@/lib/types";

/**
 * 生成进度：底部浮出的非阻塞卡片。
 * 进度条用 transform: scaleX 合成器动画，跟随 Rust 端事件流更新。
 */
export function ProgressCard({
  progress,
}: {
  progress: ProgressEvent | null;
}) {
  const pct =
    progress && progress.total > 0 ? progress.current / progress.total : 0;

  return (
    <AnimatePresence>
      {progress && (
        <motion.div
          className="material-thick fixed bottom-6 left-1/2 z-40 w-96 max-w-[90vw] rounded-2xl border border-line p-4 shadow-2xl"
          initial={{ opacity: 0, transform: "translate(-50%, 16px)" }}
          animate={{ opacity: 1, transform: "translate(-50%, 0)" }}
          exit={{ opacity: 0, transform: "translate(-50%, 16px)" }}
          transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
        >
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-medium">{progress.message}</span>
            <span className="text-[12px] tabular-nums text-text-2">
              {progress.current}/{progress.total}
            </span>
          </div>
          <ProgressBar aria-label="生成进度" value={Math.round(pct * 100)} className="gap-1">
            <ProgressBar.Track className="h-1.5">
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
