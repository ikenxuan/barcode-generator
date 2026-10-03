import type { ReactNode } from "react";
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
  Select,
  Slider,
  Switch,
  TextField,
} from "@heroui/react";
import { FORMAT_LABELS, FORMAT_HINTS } from "@/lib/types";
import type { BarcodeFormat } from "@/lib/types";
import { useApp } from "@/store";
import { colLetter } from "@/lib/grid";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4">
      <h3 className="mb-3 text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase">
        {title}
      </h3>
      <div className="space-y-3.5">{children}</div>
    </section>
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

function NumberField({
  value,
  placeholder,
  onChange,
}: {
  value: number | null;
  placeholder: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <TextField
      className="w-24"
      value={value === null ? "" : String(value)}
      onChange={(v) => {
        const n = Number(v);
        onChange(Number.isFinite(n) && n > 0 ? Math.floor(n) : null);
      }}
    >
      <Input
        type="number"
        aria-label={placeholder}
        min={1}
        placeholder={placeholder}
        className="h-8 rounded-md bg-surface text-[12.5px] tabular-nums"
      />
    </TextField>
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
            if (v) {
              const hex = v.toString("hex").toUpperCase();
              onChange(hex);
            }
          }}
        >
          <Input className="h-7 rounded-md bg-surface font-mono text-[12px]" />
        </ColorField>
      </ColorPicker.Popover>
    </ColorPicker>
  );
}

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
    <aside className="material-thick flex w-72 shrink-0 flex-col overflow-y-auto border-l border-line">
      <Section title="条码格式">
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
                  {FORMAT_LABELS[f]}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        {FORMAT_HINTS[format] && (
          <p className="text-[11.5px] leading-4 text-text-3">{FORMAT_HINTS[format]}</p>
        )}
      </Section>

      <Section title="条码样式">
        <StyleSlider label="条高" value={style.height} min={30} max={200} onChange={(height) => setStyle({ height })} />
        <StyleSlider label="条宽" value={style.xdim} min={1} max={6} onChange={(xdim) => setStyle({ xdim })} />
        <StyleSlider
          label="字号"
          value={style.fontSize}
          min={0}
          max={40}
          onChange={(n) => setStyle({ fontSize: n || 14, showText: n > 0 ? true : style.showText })}
        />
        <Row label="显示文字">
          <Switch
            aria-label="显示文字"
            isSelected={style.showText}
            onChange={(v) => setStyle({ showText: v })}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </Row>
        <Row label="前景色">
          <ColorControl
            label="前景色"
            value={style.foreground}
            onChange={(foreground) => setStyle({ foreground })}
          />
        </Row>
        <Row label="背景色">
          <ColorControl
            label="背景色"
            value={style.background}
            onChange={(background) => setStyle({ background })}
          />
        </Row>
      </Section>

      <Section title="列与行范围">
        <Row label="数据列">
          <NumberField value={dataColumn} placeholder="点击表头" onChange={setDataColumn} />
        </Row>
        <Row label="输出列">
          <NumberField value={outputColumn} placeholder="点击表头" onChange={setOutputColumn} />
        </Row>
        <p className="text-[11.5px] leading-4 text-text-3">
          打开文件后默认 A → B，也可以直接在表格表头上点「数据」「输出」标签切换（当前：
          {dataColumn ? colLetter(dataColumn) : "—"} → {outputColumn ? colLetter(outputColumn) : "—"}）
        </p>
        <Row label="起始行">
          <NumberField value={startRow} placeholder="1" onChange={(v) => setStartRow(v ?? 1)} />
        </Row>
        <Field label="结束行">
          <NumberField value={endRow} placeholder="最后一行" onChange={(v) => setEndRow(v)} />
        </Field>
        <p className="text-[11.5px] leading-4 text-text-3">
          留空表示处理到最后一行；范围外行会在表格中淡化显示
        </p>
      </Section>

      <Section title="输出">
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
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </Row>
      </Section>
    </aside>
  );
}
