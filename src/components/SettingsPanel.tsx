import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  ColorSwatchPicker,
  Input,
  Label,
  ListBox,
  NumberField,
  ScrollShadow,
  Select,
  Slider,
  Switch,
  TextField,
} from "@heroui/react";
import { FORMAT_LABELS, FORMAT_HINTS } from "@/lib/types";
import type { BarcodeFormat, BarcodeStyle } from "@/lib/types";
import { renderBarcodeSvg, renderQrDataUrl } from "@/lib/preview";
import { useApp } from "@/store";
import { colLetter } from "@/lib/grid";

/* ---------- 布局小件 ---------- */

function Section({
  title,
  index,
  children,
}: {
  title: string;
  index: number;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, transform: "translateY(10px)" }}
      animate={{ opacity: 1, transform: "translateY(0)" }}
      transition={{ duration: 0.35, delay: 0.05 + index * 0.05, ease: [0.23, 1, 0.32, 1] }}
      className="border-b border-line px-4 py-4"
    >
      <h3 className="mb-3 text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
        {title}
      </h3>
      <div className="space-y-3.5">{children}</div>
    </motion.section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-text">{label}</span>
      {children}
    </div>
  );
}

/** 标签在上、控件在下的字段 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[13px] text-text">{label}</span>
      {children}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[11.5px] leading-4 text-text-3">{children}</p>;
}

/* ---------- 控件 ---------- */

/** 行号 / 列号输入：空 = 未设置（NumberField 空值为 NaN） */
function NumInput({
  value,
  placeholder,
  ariaLabel,
  onChange,
}: {
  value: number | null;
  placeholder: string;
  ariaLabel: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <NumberField
      className="w-24"
      aria-label={ariaLabel}
      value={value ?? NaN}
      minValue={1}
      onChange={(n) => onChange(Number.isNaN(n) ? null : Math.max(1, Math.floor(n)))}
    >
      <NumberField.Group className="h-8 rounded-md bg-surface">
        <NumberField.Input
          placeholder={placeholder}
          className="text-[12.5px] tabular-nums"
        />
      </NumberField.Group>
    </NumberField>
  );
}

function StyleSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <Slider
      className="gap-1"
      aria-label={label}
      value={value}
      minValue={min}
      maxValue={max}
      onChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
    >
      <div className="flex w-full items-center justify-between">
        <Label className="text-[13px]">{label}</Label>
        <Slider.Output className="text-[12px] tabular-nums text-text-2" />
      </div>
      <Slider.Track className="h-1">
        <Slider.Fill />
        <Slider.Thumb className="size-3.5" />
      </Slider.Track>
    </Slider>
  );
}

const COLOR_PRESETS = ["#000000", "#1d1d1f", "#0071e3", "#22c55e", "#ffffff", "#f5f5f7", "#ef4444", "#eab308"];

/** HeroUI ColorPicker：色板预设 + 面积/色相滑条 + hex 输入 */
function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <ColorPicker value={value} onChange={(c) => onChange(c.toString("hex").toUpperCase())}>
      <ColorPicker.Trigger
        aria-label={label}
        className="gap-2 rounded-md border border-line bg-surface px-2 py-1"
      >
        <ColorSwatch size="sm" />
        <span className="font-mono text-[12px] text-text">{value.toUpperCase()}</span>
      </ColorPicker.Trigger>
      <ColorPicker.Popover className="gap-2">
        <ColorSwatchPicker className="justify-center pt-2" size="xs">
          {COLOR_PRESETS.map((preset) => (
            <ColorSwatchPicker.Item key={preset} color={preset}>
              <ColorSwatchPicker.Swatch />
              <ColorSwatchPicker.Indicator />
            </ColorSwatchPicker.Item>
          ))}
        </ColorSwatchPicker>
        <ColorArea
          aria-label="饱和度/亮度"
          className="max-w-full"
          colorSpace="hsb"
          xChannel="saturation"
          yChannel="brightness"
        >
          <ColorArea.Thumb />
        </ColorArea>
        <ColorSlider aria-label="色相" channel="hue" className="px-1" colorSpace="hsb">
          <ColorSlider.Track>
            <ColorSlider.Thumb />
          </ColorSlider.Track>
        </ColorSlider>
        <ColorField
          aria-label={`${label} hex 值`}
          className="px-2 pb-2"
          value={value}
          onChange={(v) => {
            if (v) onChange(v.toString("hex").toUpperCase());
          }}
        >
          <ColorField.Group className="rounded-md bg-surface">
            <ColorField.Input className="h-7 font-mono text-[12px]" />
          </ColorField.Group>
        </ColorField>
      </ColorPicker.Popover>
    </ColorPicker>
  );
}

/* ---------- 样式实时预览 ---------- */

/** 各码制的合法样例值（EAN/UPC/ITF-14 带正确校验位，保证可渲染） */
const SAMPLE_VALUES: Record<BarcodeFormat, string> = {
  code128: "ABC-12345",
  ean13: "6901234567892",
  ean8: "96385074",
  upca: "012345678905",
  code39: "CODE-39",
  itf: "12345670",
  itf14: "01234567890138",
  qr: "https://bargen.app",
};

function StylePreview({ format, style }: { format: BarcodeFormat; style: BarcodeStyle }) {
  const sample = SAMPLE_VALUES[format];
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (format !== "qr") return;
    renderQrDataUrl(sample, style).then((u) => alive && setQrUrl(u));
    return () => {
      alive = false;
    };
  }, [format, sample, style.foreground, style.background, style.height]);

  const svg = useMemo(
    () => (format === "qr" ? null : renderBarcodeSvg(sample, format, { ...style, height: Math.min(style.height, 72) })),
    [format, sample, style],
  );

  return (
    <div
      className="flex min-h-24 items-center justify-center overflow-hidden rounded-xl border border-line p-3 transition-colors duration-200"
      style={{ background: style.background }}
    >
      {format === "qr" ? (
        qrUrl ? <img src={qrUrl} alt="样式预览" className="max-h-24" /> : null
      ) : svg ? (
        <span
          className="max-h-24 [&>svg]:h-auto [&>svg]:max-h-24 [&>svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <span className="text-[12px] text-text-3">预览不可用</span>
      )}
    </div>
  );
}

/* ---------- 面板 ---------- */

export function SettingsPanel() {
  const format = useApp((s) => s.format);
  const setFormat = useApp((s) => s.setFormat);
  const style = useApp((s) => s.style);
  const setStyle = useApp((s) => s.setStyle);
  const startRow = useApp((s) => s.startRow);
  const setStartRow = useApp((s) => s.setStartRow);
  const endRow = useApp((s) => s.endRow);
  const setEndRow = useApp((s) => s.setEndRow);
  const outputName = useApp((s) => s.outputName);
  const setOutputName = useApp((s) => s.setOutputName);
  const openAfterDone = useApp((s) => s.openAfterDone);
  const setOpenAfterDone = useApp((s) => s.setOpenAfterDone);
  const dataColumn = useApp((s) => s.dataColumn);
  const setDataColumn = useApp((s) => s.setDataColumn);
  const outputColumn = useApp((s) => s.outputColumn);
  const setOutputColumn = useApp((s) => s.setOutputColumn);

  return (
    <aside className="material-thick flex w-80 shrink-0 flex-col border-l border-line">
      <ScrollShadow className="min-h-0 flex-1" size={28}>
        {/* ① 数据范围：先决定处理什么 */}
        <Section title="数据列与行范围" index={0}>
          <Row label="数据列">
            <NumInput value={dataColumn} placeholder="点表头" ariaLabel="数据列" onChange={setDataColumn} />
          </Row>
          <Row label="输出列">
            <NumInput value={outputColumn} placeholder="点表头" ariaLabel="输出列" onChange={setOutputColumn} />
          </Row>
          <Hint>
            打开文件后默认 A → B；也可在表格表头点「数据」「输出」标签切换（当前：
            {dataColumn ? colLetter(dataColumn) : "—"} → {outputColumn ? colLetter(outputColumn) : "—"}）
          </Hint>
          <Row label="起始行">
            <NumInput value={startRow} placeholder="1" ariaLabel="起始行" onChange={(v) => setStartRow(v ?? 1)} />
          </Row>
          <Row label="结束行">
            <NumInput value={endRow} placeholder="到末尾" ariaLabel="结束行" onChange={setEndRow} />
          </Row>
          <Hint>结束行留空表示处理到最后一行；范围外的行会在表格中淡化显示</Hint>
        </Section>

        {/* ② 码制 */}
        <Section title="条码格式" index={1}>
          <Select
            aria-label="条码格式"
            className="w-full"
            value={format}
            onChange={(v) => setFormat(v as BarcodeFormat)}
          >
            <Select.Trigger className="h-9 rounded-md bg-surface text-[13px]">
              <Select.Value>{FORMAT_LABELS[format]}</Select.Value>
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {(Object.keys(FORMAT_LABELS) as BarcodeFormat[]).map((f) => (
                  <ListBox.Item key={f} id={f} textValue={FORMAT_LABELS[f]}>
                    <Label>{FORMAT_LABELS[f]}</Label>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          {FORMAT_HINTS[format] && <Hint>{FORMAT_HINTS[format]}</Hint>}
        </Section>

        {/* ③ 样式：所见即所得 */}
        <Section title="条码样式" index={2}>
          <StylePreview format={format} style={style} />
          <StyleSlider label="条高" value={style.height} min={30} max={200} onChange={(height) => setStyle({ height })} />
          <StyleSlider label="条宽" value={style.xdim} min={1} max={6} onChange={(xdim) => setStyle({ xdim })} />
          <StyleSlider label="字号" value={style.fontSize} min={8} max={40} onChange={(fontSize) => setStyle({ fontSize })} />
          <Row label="显示文字">
            <Switch
              aria-label="显示文字"
              isSelected={style.showText}
              onChange={(v) => setStyle({ showText: v })}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Content />
            </Switch>
          </Row>
          <Row label="前景色">
            <ColorControl label="前景色" value={style.foreground} onChange={(foreground) => setStyle({ foreground })} />
          </Row>
          <Row label="背景色">
            <ColorControl label="背景色" value={style.background} onChange={(background) => setStyle({ background })} />
          </Row>
        </Section>

        {/* ④ 输出 */}
        <Section title="输出" index={3}>
          <Field label="文件名">
            <TextField className="w-full" value={outputName} onChange={setOutputName}>
              <Input aria-label="输出文件名" className="h-8 rounded-md bg-surface text-[12.5px]" />
            </TextField>
          </Field>
          <Row label="完成后打开位置">
            <Switch
              aria-label="完成后打开位置"
              isSelected={openAfterDone}
              onChange={(v) => setOpenAfterDone(v)}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Content />
            </Switch>
          </Row>
        </Section>
      </ScrollShadow>
    </aside>
  );
}
