"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { PipelineSpec } from "@data-platform/types";
import { Badge, Button } from "@data-platform/ui";

import { getPipelineIntents, queryDesignerMomo } from "@/lib/api";
import {
  buildDesignerMomoPayload,
  buildPipelineIntentPrompt,
  type AgentMomoSource,
  type ArchitectContextDraft
} from "@/lib/noodle-designer";

interface MomoMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  brief?: string;
  sources?: AgentMomoSource[];
  error?: boolean;
}

const emptyDraft: ArchitectContextDraft = {
  name: "",
  prompt: "",
  summary: "",
  systemDesign: "",
  selectedProviders: "",
  assumptions: "",
  components: "",
  cloudServices: "",
  dataFlow: "",
  scalingStrategy: "",
  securityConsiderations: ""
};

function nextMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ArchitectField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder: string;
  multiline?: boolean;
}) {
  const className =
    "mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white";

  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`${className} min-h-24`} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={className} />
      )}
    </label>
  );
}

export function DesignerAssistantPanel({
  spec,
  initialDescription,
  onUseIntentPrompt
}: {
  spec: PipelineSpec;
  initialDescription: string;
  onUseIntentPrompt(prompt: string): void;
}) {
  const [selectedIntentId, setSelectedIntentId] = useState("");
  const [draft, setDraft] = useState<ArchitectContextDraft>(emptyDraft);
  const [userTurn, setUserTurn] = useState("");
  const [messages, setMessages] = useState<MomoMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Agent Momo is ready. Ask about pipeline structure, system design fit, node choices, retries, serving paths, or how to align the canvas with the architect context."
    }
  ]);

  const intentsQuery = useQuery({
    queryKey: ["pipeline-intents"],
    queryFn: getPipelineIntents
  });

  useEffect(() => {
    if (!selectedIntentId && intentsQuery.data?.items[0]) {
      setSelectedIntentId(intentsQuery.data.items[0].id);
    }
  }, [intentsQuery.data, selectedIntentId]);

  useEffect(() => {
    setDraft((current) => {
      if (current.prompt || current.summary) {
        return current;
      }
      return {
        ...current,
        prompt: initialDescription,
        summary: initialDescription
      };
    });
  }, [initialDescription]);

  const selectedIntent = useMemo(
    () => intentsQuery.data?.items.find((item) => item.id === selectedIntentId),
    [intentsQuery.data, selectedIntentId]
  );

  const momoMutation = useMutation({
    mutationFn: async (turn: string) =>
      queryDesignerMomo(
        buildDesignerMomoPayload({
          userTurn: turn,
          spec,
          architecture: draft,
          intent: selectedIntent
        })
      ),
    onSuccess(response) {
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "assistant",
          content: response.answer,
          brief: response.brief,
          sources: response.sources
        }
      ]);
      setUserTurn("");
    },
    onError(error) {
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "assistant",
          content: error instanceof Error ? error.message : "Agent Momo could not process this request.",
          error: true
        }
      ]);
    }
  });

  const updateDraft = (key: keyof ArchitectContextDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const loadIntentIntoDesigner = () => {
    if (!selectedIntent) {
      return;
    }
    onUseIntentPrompt(buildPipelineIntentPrompt(selectedIntent));
    setDraft((current) => ({
      ...current,
      name: current.name || `${selectedIntent.name} Architect`,
      prompt: current.prompt || selectedIntent.intent.businessGoal,
      summary: selectedIntent.summary,
      systemDesign:
        current.systemDesign ||
        `Recommended workflow template: ${selectedIntent.recommendedWorkflowTemplate}. Separate control plane authoring from execution workers and align sinks with the serving path.`,
      selectedProviders: current.selectedProviders || selectedIntent.intent.sources.map((source) => source.environment).join(", "),
      dataFlow: current.dataFlow || "sources, bronze, silver, gold, serving"
    }));
  };

  const submitMomoTurn = () => {
    const trimmed = userTurn.trim();
    if (trimmed.length < 5 || momoMutation.isPending) {
      return;
    }
    setMessages((current) => [
      ...current,
      {
        id: nextMessageId(),
        role: "user",
        content: trimmed
      }
    ]);
    momoMutation.mutate(trimmed);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Agent Architect</p>
            <h3 className="text-lg font-semibold text-slate-950">Intent and system design context</h3>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pipeline intent</label>
              {selectedIntent ? <Badge className="bg-sky-100 text-sky-800">{selectedIntent.recommendedWorkflowTemplate}</Badge> : null}
            </div>
            <select
              value={selectedIntentId}
              onChange={(event) => setSelectedIntentId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
            >
              {intentsQuery.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {selectedIntent ? <p className="mt-2 text-sm text-slate-600">{selectedIntent.summary}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={loadIntentIntoDesigner} className="rounded-full bg-sky-500 text-slate-950 hover:bg-sky-400">
                Use Intent In Builder
              </Button>
              {intentsQuery.isLoading ? <span className="text-sm text-slate-500">Loading intents...</span> : null}
              {intentsQuery.error instanceof Error ? <span className="text-sm text-rose-600">{intentsQuery.error.message}</span> : null}
            </div>
          </div>

          <ArchitectField label="Architecture name" value={draft.name} onChange={(value) => updateDraft("name", value)} placeholder="Retail Operations Architect" />
          <ArchitectField label="Architecture prompt" value={draft.prompt} onChange={(value) => updateDraft("prompt", value)} placeholder="Design a governed retail operations data platform." multiline />
          <ArchitectField label="Summary" value={draft.summary} onChange={(value) => updateDraft("summary", value)} placeholder="High-level architecture summary." multiline />
          <ArchitectField
            label="System design"
            value={draft.systemDesign}
            onChange={(value) => updateDraft("systemDesign", value)}
            placeholder="Describe the control plane, execution plane, workers, scheduling, metadata, and serving topology."
            multiline
          />
          <ArchitectField
            label="Providers"
            value={draft.selectedProviders}
            onChange={(value) => updateDraft("selectedProviders", value)}
            placeholder="aws, gcp"
          />
          <ArchitectField label="Components" value={draft.components} onChange={(value) => updateDraft("components", value)} placeholder="scheduler, workers, metadata catalog" multiline />
          <ArchitectField label="Cloud services" value={draft.cloudServices} onChange={(value) => updateDraft("cloudServices", value)} placeholder="eks, msk, bigquery" multiline />
          <ArchitectField label="Data flow" value={draft.dataFlow} onChange={(value) => updateDraft("dataFlow", value)} placeholder="sources, bronze, silver, gold, serving" multiline />
          <ArchitectField
            label="Scaling strategy"
            value={draft.scalingStrategy}
            onChange={(value) => updateDraft("scalingStrategy", value)}
            placeholder="scale workers independently"
            multiline
          />
          <ArchitectField
            label="Security considerations"
            value={draft.securityConsiderations}
            onChange={(value) => updateDraft("securityConsiderations", value)}
            placeholder="mask pii, regional residency"
            multiline
          />
          <ArchitectField label="Assumptions" value={draft.assumptions} onChange={(value) => updateDraft("assumptions", value)} placeholder="shared metadata plane" multiline />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-sky-600" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Agent Momo</p>
            <h3 className="text-lg font-semibold text-slate-950">Designer-aware guidance</h3>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-[24px] px-4 py-3 text-sm ${
                message.role === "user"
                  ? "ml-8 bg-slate-950 text-white"
                  : message.error
                    ? "mr-4 border border-rose-200 bg-rose-50 text-rose-700"
                    : "mr-4 border border-slate-200 bg-slate-50 text-slate-800"
              }`}
            >
              <p className="font-semibold uppercase tracking-[0.14em] text-[11px] opacity-70">{message.role === "user" ? "You" : "Agent Momo"}</p>
              <p className="mt-2 whitespace-pre-wrap leading-6">{message.content}</p>
              {message.brief ? (
                <div className="mt-3 rounded-2xl bg-white/60 px-3 py-3 text-xs leading-5 text-slate-600">
                  <p className="font-semibold uppercase tracking-[0.14em] text-slate-500">Design brief</p>
                  <p className="mt-1 whitespace-pre-wrap">{message.brief}</p>
                </div>
              ) : null}
              {message.sources?.length ? (
                <div className="mt-3 space-y-2">
                  {message.sources.map((source) => (
                    <div key={source.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-slate-100 text-slate-700">{source.kind}</Badge>
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{source.title}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{source.snippet}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <textarea
            value={userTurn}
            onChange={(event) => setUserTurn(event.target.value)}
            placeholder="Ask Momo how this pipeline should align with the selected intent and system design."
            className="min-h-28 w-full rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Momo uses the selected intent, architect context, and the current canvas.</p>
            <Button onClick={submitMomoTurn} className="rounded-full bg-slate-950 hover:bg-slate-800" disabled={momoMutation.isPending || userTurn.trim().length < 5}>
              {momoMutation.isPending ? "Thinking..." : "Ask Agent Momo"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
