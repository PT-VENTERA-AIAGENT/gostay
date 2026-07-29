import { Handle, Position, type NodeProps } from "@xyflow/react";
import * as Icons from "lucide-react";
import { ACTION_META, NODE_META, type ActionType, type ChoiceOption, type NodeType } from "@/types/waFlow";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * One node on the canvas.
 *
 * Renders a PREVIEW of what the node actually does — the message text, the
 * numbered options, the action's plain-language name — rather than just its
 * type. A canvas of eight boxes labelled "Pesan" is unreadable; a canvas
 * showing the words the guest will see can be checked at a glance.
 *
 * Handle ids matter: they are the `sourceHandle` on the saved edges, and the
 * engine leaves a node through the handle whose id it computed (an option id, or
 * "true"/"false"). Changing them here silently rewires saved flows.
 */

export interface FlowNodeData extends Record<string, unknown> {
  kind: NodeType;
  text?: string;
  prompt?: string;
  variable?: string;
  options?: ChoiceOption[];
  operator?: string;
  value?: string;
  action?: ActionType;
}

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return C ? <C className={className} /> : null;
}

/** Keep a preview to a couple of lines so one long message cannot dominate. */
function truncate(s: string, max = 90): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export default function FlowNodeCard({ data, selected }: NodeProps) {
  const t = useT();
  const d = data as FlowNodeData;
  const meta = NODE_META[d.kind];
  if (!meta) return null;

  const isChoice = d.kind === "choice";
  const isCondition = d.kind === "condition";
  const isTerminal = d.kind === "handoff" || d.kind === "end";
  const options = d.options ?? [];

  return (
    <div
      className={cn(
        "w-64 rounded-lg border-2 shadow-sm transition-shadow",
        meta.tone,
        selected && "ring-2 ring-primary ring-offset-2",
      )}
    >
      {/* Every node except the entry point can be arrived at. */}
      {d.kind !== "trigger" && (
        <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !bg-slate-400" />
      )}

      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2">
        <Icon name={meta.icon} className="h-4 w-4 shrink-0" />
        <span className="truncate text-xs font-semibold uppercase tracking-wide">{meta.label}</span>
      </div>

      <div className="space-y-1.5 px-3 py-2.5 text-xs">
        {d.kind === "trigger" && (
          <p className="italic text-muted-foreground">{t("Kata pemicu diatur di panel Pengaturan.")}</p>
        )}

        {d.kind === "message" && (
          <p className={cn(!d.text && "italic text-muted-foreground")}>
            {d.text ? truncate(d.text) : "Belum ada teks — node ini akan diabaikan."}
          </p>
        )}

        {d.kind === "ask" && (
          <>
            <p className={cn(!d.prompt && "italic text-muted-foreground")}>
              {d.prompt ? truncate(d.prompt) : "Belum ada pertanyaan."}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Jawaban disimpan ke{" "}
              <code className="rounded bg-black/5 px-1">{d.variable || "?"}</code>
            </p>
          </>
        )}

        {isChoice && (
          <>
            <p className={cn(!d.text && "italic text-muted-foreground")}>
              {d.text ? truncate(d.text, 60) : "Belum ada teks."}
            </p>
            <ol className="mt-1 space-y-0.5">
              {options.length === 0 ? (
                <li className="italic text-muted-foreground">{t("Belum ada opsi.")}</li>
              ) : (
                options.map((o, i) => (
                  <li key={o.id} className="truncate">
                    {i + 1}. {o.label}
                  </li>
                ))
              )}
            </ol>
          </>
        )}

        {isCondition && (
          <p className="font-mono text-[11px]">
            {d.variable || "?"} {d.operator || "=="} {d.value ? `“${d.value}”` : ""}
          </p>
        )}

        {d.kind === "action" && (
          <>
            <p className="font-medium">
              {d.action ? ACTION_META[d.action].label : "Belum dipilih"}
            </p>
            {d.action && ACTION_META[d.action].takesOver && (
              <p className="text-[11px] text-muted-foreground">
                Mengambil alih percakapan — node setelah ini tidak akan dijalankan.
              </p>
            )}
          </>
        )}

        {isTerminal && (
          <p className={cn(!d.text && "italic text-muted-foreground")}>
            {d.text ? truncate(d.text) : "Tanpa pesan penutup."}
          </p>
        )}
      </div>

      {/* ── Outlets ──────────────────────────────────────────────────────── */}
      {/* Terminal nodes have none: the engine stops there regardless of edges. */}
      {!isTerminal && !isChoice && !isCondition && (
        <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !bg-slate-500" />
      )}

      {isCondition && (
        <>
          <Handle
            id="true" type="source" position={Position.Bottom}
            style={{ left: "30%" }}
            className="!h-2.5 !w-2.5 !bg-emerald-500"
          />
          <Handle
            id="false" type="source" position={Position.Bottom}
            style={{ left: "70%" }}
            className="!h-2.5 !w-2.5 !bg-rose-500"
          />
          <div className="flex justify-between px-3 pb-1 text-[10px] text-muted-foreground">
            <span>{t("Ya")}</span>
            <span>{t("Tidak")}</span>
          </div>
        </>
      )}

      {isChoice && (
        <div className="border-t border-black/10">
          {options.map((o, i) => (
            <div key={o.id} className="relative px-3 py-1 text-[10px] text-muted-foreground">
              <span className="truncate">↳ {i + 1}. {o.label}</span>
              <Handle
                id={o.id} type="source" position={Position.Right}
                style={{ top: "50%" }}
                className="!h-2.5 !w-2.5 !bg-amber-500"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
