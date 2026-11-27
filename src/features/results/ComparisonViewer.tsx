import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type UIEvent,
} from "react";
import { strings } from "../../content/strings";
import type { Candidate, Dimensions, ImageEdits } from "../../types/engine";
import type { QueueItem } from "../../types/image";
import { EngineClient, type RenderOutcome } from "../../workers/engine-client";
import type { EngineErrorCode } from "../../workers/protocol";
import { drawEdited, loadImage } from "../edit/draw";

export interface Renderer {
  render(
    file: Blob,
    edits: ImageEdits,
    size: Dimensions,
    signal?: AbortSignal,
  ): Promise<RenderOutcome>;
}

// Its own worker: a client runs one job at a time, and adding images uses the inspect client.
let defaultRenderer: EngineClient | null = null;

type View = "slider" | "side";
type Zoom = "fit" | "full";

interface Props {
  item: QueueItem;
  candidate: Candidate;
  url: string;
  renderer?: Renderer;
}

/**
 * M5 (D22): original vs optimized, as a slider (default) or side by side, at Fit or 100 %.
 * The "before" is the original as cropped and rotated, at the output's size. At 100 % it is
 * rendered full size by the worker, only while 100 % is chosen, and dropped as soon as it isn't.
 */
export function ComparisonViewer({ item, candidate, url, renderer }: Props) {
  const t = strings.result.compare;
  const [view, setView] = useState<View>("slider");
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [position, setPosition] = useState(50);
  const [full, setFull] = useState<ImageData | null>(null);
  const [failure, setFailure] = useState<EngineErrorCode | null>(null);
  const crop = item.edits?.crop ?? null;
  const rotation = item.edits?.rotation ?? 0;
  const { width, height } = candidate;
  const originalLabel = crop !== null || rotation !== 0 ? t.originalEdited : t.original;

  useEffect(() => {
    if (zoom !== "full") return;
    const controller = new AbortController();
    const client = renderer ?? (defaultRenderer ??= new EngineClient());
    void client
      .render(item.file, { crop, rotation, resize: null }, { width, height }, controller.signal)
      .then((outcome) => {
        if (controller.signal.aborted) return;
        if (outcome.status === "done") setFull(outcome.image);
        else if (outcome.status === "error") {
          setFailure(outcome.code);
          setZoom("fit");
        }
      });
    return () => {
      controller.abort(); // a render still running: its worker is terminated, freeing its memory
      setFull(null);
    };
  }, [zoom, item.file, crop, rotation, width, height, renderer]);

  const before =
    zoom === "full" ? (
      full && <FullOriginal image={full} label={originalLabel} />
    ) : (
      <FitOriginal item={item} label={originalLabel} />
    );
  const after = (
    <img
      src={url}
      alt={strings.result.previewAlt}
      width={width}
      height={height}
      draggable={false}
      className="absolute inset-0 block h-full w-full"
      style={view === "slider" ? { clipPath: `inset(0 0 0 ${String(position)}%)` } : undefined}
    />
  );
  const waiting = zoom === "full" && !full;

  return (
    <section aria-labelledby="compare-heading" className="mt-3">
      <h3 id="compare-heading" className="font-medium">
        {t.heading}
      </h3>
      <div className="mt-1 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Choice
          legend={t.viewLegend}
          name="compare-view"
          value={view}
          options={[
            ["slider", t.slider],
            ["side", t.sideBySide],
          ]}
          onChange={setView}
        />
        <Choice
          legend={t.zoomLegend}
          name="compare-zoom"
          value={zoom}
          options={[
            ["fit", t.fit],
            ["full", t.full],
          ]}
          onChange={(next) => {
            setFailure(null);
            setZoom(next);
          }}
        />
      </div>
      {zoom === "full" && <p className="mt-1 text-sm text-text-muted">{t.panHint}</p>}
      <div role="status" className="text-sm">
        {waiting && <p className="mt-1">{t.preparing}</p>}
        {failure && (
          <p className="mt-1 text-warning">{t.failed(strings.process.errors[failure].what)}</p>
        )}
      </div>

      {!waiting &&
        (view === "slider" ? (
          <>
            <div className="mt-2 flex justify-between text-sm font-medium">
              <span>{originalLabel}</span>
              <span>{t.optimized}</span>
            </div>
            <Pane zoom={zoom} size={candidate} label={t.optimized}>
              {before}
              {after}
              <div
                aria-hidden="true"
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-text"
                style={{ left: `${String(position)}%` }}
              />
            </Pane>
            <label htmlFor="compare-divider" className="mt-2 block text-sm">
              {t.divider}
            </label>
            <input
              id="compare-divider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={position}
              aria-valuetext={t.dividerValue(position)}
              onChange={(e) => {
                setPosition(Number(e.target.value));
              }}
              className="h-11 w-full"
            />
          </>
        ) : (
          <SideBySide zoom={zoom} size={candidate} labels={[originalLabel, t.optimized]}>
            {before}
            {after}
          </SideBySide>
        ))}
    </section>
  );
}

function Choice<T extends string>(props: {
  legend: string;
  name: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-3">
      <legend className="sr-only">{props.legend}</legend>
      <span aria-hidden="true" className="text-text-muted">
        {props.legend}:
      </span>
      {props.options.map(([value, label]) => (
        <label key={value} className="flex min-h-11 items-center gap-1">
          <input
            type="radio"
            name={props.name}
            checked={props.value === value}
            onChange={() => {
              props.onChange(value);
            }}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

/** The positioned box both layers fill: scaled to fit (Fit), or exactly the output's pixels (100 %). */
function Box({ zoom, size, children }: { zoom: Zoom; size: Dimensions; children: ReactNode }) {
  const style =
    zoom === "full"
      ? { width: `${String(size.width)}px`, height: `${String(size.height)}px` }
      : {
          aspectRatio: `${String(size.width)} / ${String(size.height)}`,
          width: `min(100%, calc(70vh * ${String(size.width / size.height)}))`,
        };
  return (
    <div data-testid="compare-box" className="relative mx-auto overflow-hidden" style={style}>
      {children}
    </div>
  );
}

/** Drag-to-pan on a scroll container (wheel and arrow keys scroll it natively). */
const dragStarts = new WeakMap<HTMLElement, { x: number; y: number; left: number; top: number }>();
const pan = {
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    dragStarts.set(el, { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop });
    el.setPointerCapture(e.pointerId);
  },
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
    const start = dragStarts.get(e.currentTarget);
    if (!start) return;
    e.currentTarget.scrollLeft = start.left - (e.clientX - start.x);
    e.currentTarget.scrollTop = start.top - (e.clientY - start.y);
  },
  onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
    dragStarts.delete(e.currentTarget);
  },
  onPointerCancel: (e: PointerEvent<HTMLDivElement>) => {
    dragStarts.delete(e.currentTarget);
  },
};

function Pane({
  zoom,
  size,
  label,
  children,
  onScroll,
  viewport,
}: {
  zoom: Zoom;
  size: Dimensions;
  label: string;
  children: ReactNode;
  onScroll?: (e: UIEvent<HTMLDivElement>) => void;
  viewport?: (node: HTMLDivElement | null) => void;
}) {
  const box = (
    <Box zoom={zoom} size={size}>
      {children}
    </Box>
  );
  if (zoom === "fit") return <div className="mt-1">{box}</div>;
  return (
    <div
      ref={viewport}
      tabIndex={0}
      role="group"
      aria-label={label}
      data-testid="compare-viewport"
      onScroll={onScroll}
      className="mt-1 max-h-[70vh] cursor-grab touch-none overflow-auto rounded-control border border-border"
      {...pan}
    >
      {box}
    </div>
  );
}

/** Two panes; at 100 % scrolling either one scrolls the other to the same place. */
function SideBySide(props: {
  zoom: Zoom;
  size: Dimensions;
  labels: [string, string];
  children: [ReactNode, ReactNode];
}) {
  const panes = useRef<(HTMLDivElement | null)[]>([null, null]);
  const sync = (from: number) => (e: UIEvent<HTMLDivElement>) => {
    const other = panes.current[1 - from];
    const { scrollLeft, scrollTop } = e.currentTarget;
    if (other && (other.scrollLeft !== scrollLeft || other.scrollTop !== scrollTop)) {
      other.scrollLeft = scrollLeft;
      other.scrollTop = scrollTop;
    }
  };
  return (
    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {props.children.map((child, i) => (
        <figure key={props.labels[i]} className="min-w-0">
          <figcaption className="text-sm font-medium">{props.labels[i]}</figcaption>
          <Pane
            zoom={props.zoom}
            size={props.size}
            label={props.labels[i] ?? ""}
            onScroll={sync(i)}
            viewport={(node) => {
              panes.current[i] = node;
            }}
          >
            {child}
          </Pane>
        </figure>
      ))}
    </div>
  );
}

/** The worker-made preview, cropped and rotated (display only), stretched over the box. */
function FitOriginal({ item, label }: { item: QueueItem; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { previewUrl, metadata } = item;
  const width = metadata?.width ?? 1;
  const height = metadata?.height ?? 1;
  const crop = item.edits?.crop ?? null;
  const rotation = item.edits?.rotation ?? 0;

  useEffect(() => {
    let live = true;
    if (previewUrl) {
      void loadImage(previewUrl).then((image) => {
        if (live && image && canvas.current) {
          drawEdited(canvas.current, image, { width, height }, crop, rotation);
        }
      });
    }
    return () => {
      live = false;
    };
  }, [previewUrl, width, height, crop, rotation]);

  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      className="absolute inset-0 block h-full w-full"
    />
  );
}

/** The full-size render (100 %): its pixels are put on the canvas as they are. */
function FullOriginal({ image, label }: { image: ImageData; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    canvas.current?.getContext("2d")?.putImageData(image, 0, 0);
  }, [image]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={label}
      width={image.width}
      height={image.height}
      data-testid="compare-full-original"
      className="absolute inset-0 block h-full w-full"
    />
  );
}
